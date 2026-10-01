import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Deletes content the app has already stopped showing, so what the privacy
// policy says about retention is what actually happens. Run hourly by pg_cron
// (see supabase/migrations/20261001010000_cleanup_schedule.sql).
//
//   Open Chat and Spur of the Moment posts — shown 3 hours  -> deleted after 24 hours
//   Stories                                — shown 5 days   -> deleted after 6 days
//   At Venue check-in location             — shown 2 hours  -> deleted after 24 hours
//
// Nothing else is touched: What's Happening posts, Market listings, Clips and
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

type Job = { table: string; timeColumn: string; maxAgeMs: number; mediaColumns: string[] };
const JOBS: Job[] = [
  { table: 'open_chat_posts', timeColumn: 'created_at', maxAgeMs: 1 * DAY, mediaColumns: ['photo_url'] },
  { table: 'spur_posts', timeColumn: 'created_at', maxAgeMs: 1 * DAY, mediaColumns: ['photo_url', 'video_url'] },
  { table: 'stories', timeColumn: 'created_at', maxAgeMs: 6 * DAY, mediaColumns: ['photo_url', 'video_url'] },
  { table: 'member_checkins', timeColumn: 'updated_at', maxAgeMs: 1 * DAY, mediaColumns: [] },
];

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET') || !Deno.env.get('CRON_SECRET')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const dry = new URL(req.url).searchParams.get('dry') === '1';

  const report: Record<string, unknown> = { dry };
  for (const job of JOBS) {
    const cutoff = new Date(Date.now() - job.maxAgeMs).toISOString();
    // member_checkins has no id column (its key is user_id).
    const idColumn = job.table === 'member_checkins' ? 'user_id' : 'id';
    const columns = [idColumn, ...job.mediaColumns].join(', ');

    const { data: rows, error } = await supabase
      .from(job.table)
      .select(columns)
      .lt(job.timeColumn, cutoff)
      .limit(BATCH);
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
      const { error: deleteError, count } = await supabase
        .from(job.table)
        .delete({ count: 'exact' })
        .in(idColumn, ids);
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
