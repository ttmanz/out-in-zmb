import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Every upload in the app lives under a `${userId}/` prefix (see
// src/lib/storage.js), so removing that folder per bucket erases all of a
// user's media. list() is not recursive — walk subfolders (e.g. ads/).
const removeUserFolder = async (supabase: ReturnType<typeof createClient>, bucket: string, prefix: string) => {
  const { data: entries } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!entries?.length) return;
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.id === null) {
      await removeUserFolder(supabase, bucket, `${prefix}/${entry.name}`);
    } else {
      files.push(`${prefix}/${entry.name}`);
    }
  }
  if (files.length) await supabase.storage.from(bucket).remove(files);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Identify the caller from their own JWT — a user can only delete themself.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Delete all uploaded media first — storage objects have no FK to the user,
  // so nothing would cascade them.
  // `receipts` is the private bucket holding reward receipt photos.
  for (const bucket of ['avatars', 'post-photos', 'story-media', 'receipts']) {
    await removeUserFolder(admin, bucket, user.id);
  }

  // Rows that deleting the auth user would NOT clean up:
  // - club_blocks.blocked_by has ON DELETE NO ACTION and would abort the delete
  // - events.created_by has no FK at all and would orphan
  // - profiles.referred_by is ON DELETE NO ACTION: deleting someone who referred
  //   other members would abort, so detach them first
  // - cashback_payout_requests.resolved_by is ON DELETE NO ACTION (admins who
  //   resolved a payout)
  await admin.from('club_blocks').delete().eq('blocked_by', user.id);
  await admin.from('events').delete().eq('created_by', user.id);
  await admin.from('profiles').update({ referred_by: null }).eq('referred_by', user.id);
  await admin.from('cashback_payout_requests').update({ resolved_by: null }).eq('resolved_by', user.id);

  // auth.users → profiles → all content tables are ON DELETE CASCADE,
  // so this single call erases the account and everything it owns.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({ deleted: true });
});
