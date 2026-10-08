import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Deletes content the app has already stopped showing, so what the privacy
// policy says about retention is what actually happens. Run hourly by pg_cron
// (see supabase/migrations/20261001010000_cleanup_schedule.sql).
//
//   Open Chat and Spur of the Moment posts — shown 3 hours  -> deleted after 24 hours
//   Stories                                — shown 15 days  -> deleted after 16 days,
//     unless a paid member saved it to Memory (stories.memory_until, 3 months from the save)
//   What's Happening posts                 — deleted after 15 days
//   Give Away posts                        — hidden after their end time -> deleted 24 hours after it
//   Events and Activity events             — hidden after their date -> deleted 24 hours after event_date
//     (events with no date are kept)
//   At Venue check-in location             — shown 2 hours  -> deleted after 24 hours
//   Clip of the Day (not approved by an admin) -> deleted every Monday 03:00 UTC, video file included
//     (this replaces the old SQL job 'purge-unapproved-clips', which deleted the rows but left
//      the video files in storage — see 20261001030000_clip_purge_with_files.sql)
//
// Nothing else is touched: Market listings, approved Clips and
// everything a member owns are kept until the member deletes them or their account.
// Replies, likes and saves go with their post (ON DELETE CASCADE).
//
// POST ?dry=1 reports what would be deleted without deleting anything.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BATCH = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Our own uploads are public URLs: .../storage/v1/object/public/<bucket>/<path>.
// Anything else (an external link preview image, say) is not ours to delete.
const OWN_MEDIA = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
const mediaOf = (row: Record<string, string | null>, columns: string[]) => {
  const found: { bucket: string; path: string }[] = [];
  for (const column of columns) {
    const match = row[column]?.match(OWN_MEDIA);
    if (match) found.push({ bucket: match[1], path: decodeURIComponent(match[2].split('?')[0]) });
  }
  return found;
};

// The most recent Monday 03:00 UTC that has already happened. A clip created before
// it belongs to a week that has ended (exactly what the old Monday 03:00 job removed).
const lastMondayPurge = () => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
  if (d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString();
};

type Job = {
  table: string;
  timeColumn: string;
  mediaColumns: string[];
  cutoff: () => string;
  onlyWhere?: Record<string, boolean>;
  // A timestamp column that, while still in the future, keeps the row (Memory stories).
  keepUntilColumn?: string;
};
const ago = (ms: number) => () => new Date(Date.now() - ms).toISOString();
const JOBS: Job[] = [
  { table: 'open_chat_posts', timeColumn: 'created_at', cutoff: ago(1 * DAY), mediaColumns: ['photo_url'] },
  { table: 'spur_posts', timeColumn: 'created_at', cutoff: ago(1 * DAY), mediaColumns: ['photo_url', 'video_url'] },
  { table: 'stories', timeColumn: 'created_at', cutoff: ago(16 * DAY), mediaColumns: ['photo_url', 'video_url'], keepUntilColumn: 'memory_until' },
  { table: 'happenings', timeColumn: 'created_at', cutoff: ago(15 * DAY), mediaColumns: ['photo_url', 'video_url'] },
  { table: 'events', timeColumn: 'event_date', cutoff: ago(1 * DAY), mediaColumns: ['photo_url', 'video_url'] },
  { table: 'activity_events', timeColumn: 'event_date', cutoff: ago(1 * DAY), mediaColumns: ['photo_url', 'video_url'] },
  { table: 'giveaways', timeColumn: 'ends_at', cutoff: ago(1 * DAY), mediaColumns: ['photo_url', 'video_url'] },
  { table: 'member_checkins', timeColumn: 'updated_at', cutoff: ago(1 * DAY), mediaColumns: [] },
  { table: 'daily_clips', timeColumn: 'created_at', cutoff: lastMondayPurge, mediaColumns: ['video_url'], onlyWhere: { is_approved: false } },
];

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET') || !Deno.env.get('CRON_SECRET')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const dry = new URL(req.url).searchParams.get('dry') === '1';

  const report: Record<string, unknown> = { dry };
  for (const job of JOBS) {
    const cutoff = job.cutoff();
    // member_checkins has no id column (its key is user_id).
    const idColumn = job.table === 'member_checkins' ? 'user_id' : 'id';
    const columns = [idColumn, ...job.mediaColumns].join(', ');

    let query = supabase.from(job.table).select(columns).lt(job.timeColumn, cutoff);
    for (const [column, value] of Object.entries(job.onlyWhere ?? {})) query = query.eq(column, value);
    if (job.keepUntilColumn) query = query.or(`${job.keepUntilColumn}.is.null,${job.keepUntilColumn}.lt.${new Date().toISOString()}`);
    const { data: rows, error } = await query.limit(BATCH);
    if (error) {
      report[job.table] = { error: error.message };
      continue;
    }
    const expired = (rows ?? []) as Record<string, string | null>[];

    const files = expired.flatMap((row) => mediaOf(row, job.mediaColumns));
    if (dry) {
      report[job.table] = { rows: expired.length, files: files.length };
      continue;
    }

    // Files first: if the row delete failed we would rather have a row with a
    // missing picture than a picture nobody can see or remove.
    const byBucket = new Map<string, string[]>();
    for (const { bucket, path } of files) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
    let removedFiles = 0;
    for (const [bucket, paths] of byBucket) {
      const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
      if (!storageError) removedFiles += paths.length;
    }

    const ids = expired.map((row) => row[idColumn]);
    let deleted = 0;
    if (ids.length > 0) {
      let del = supabase.from(job.table).delete({ count: 'exact' }).in(idColumn, ids);
      // Same filter again, so a clip approved a moment ago is never deleted.
      for (const [column, value] of Object.entries(job.onlyWhere ?? {})) del = del.eq(column, value);
      if (job.keepUntilColumn) del = del.or(`${job.keepUntilColumn}.is.null,${job.keepUntilColumn}.lt.${new Date().toISOString()}`);
      const { error: deleteError, count } = await del;
      if (deleteError) {
        report[job.table] = { error: deleteError.message };
        continue;
      }
      deleted = count ?? ids.length;
    }
    report[job.table] = { rows: deleted, files: removedFiles };
  }

  return json(report);
});
