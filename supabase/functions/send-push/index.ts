import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Mirrors NotificationsScreen.jsx's formatMessage — kept as a small lookup
// table here rather than shared code, since this runs on Deno not RN.
const TITLE_BODY: Record<string, (actor: string, excerpt: string | null) => { title: string; body: string }> = {
  friend_request: (actor) => ({ title: 'New friend request', body: `${actor} wants to be your friend` }),
  reply: (actor, excerpt) => ({ title: 'New reply', body: `${actor} replied${excerpt ? `: ${excerpt}` : ''}` }),
  club_join_request: (actor) => ({ title: 'Club join request', body: `${actor} wants to join your club` }),
  admin_message: (actor) => ({ title: 'Message from Rollout Plus', body: `${actor} sent you a message` }),
  content_report: () => ({ title: 'New report', body: 'A member submitted a content report' }),
  message: (actor, excerpt) => ({ title: actor, body: excerpt ?? 'Sent you a message' }),
  cashback_pending: (actor) => ({ title: 'Reward to confirm', body: `${actor} sent you a claim to confirm` }),
  cashback_result: (_actor, excerpt) => ({ title: 'Reward update', body: excerpt ? `Your claim for ${excerpt} has been answered` : 'A venue has answered your claim' }),
  new_post: (actor, excerpt) => ({ title: 'New post from a friend', body: `${actor} posted${excerpt ? `: ${excerpt}` : ''}` }),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Verify caller is our own trigger (unauthenticated system caller, not an end user)
  const secret = req.headers.get('x-cron-secret');
  if (secret !== Deno.env.get('CRON_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const { notification_id } = await req.json().catch(() => ({}));
  if (!notification_id) {
    return new Response(JSON.stringify({ error: 'notification_id is required' }), { status: 400, headers: corsHeaders });
  }

  const { data: notification, error: notifError } = await supabase
    .from('notifications')
    .select('id, user_id, type, reference_id, reference_type, reference_text, actor:profiles!notifications_actor_id_fkey(full_name)')
    .eq('id', notification_id)
    .single();

  if (notifError || !notification) {
    return new Response(JSON.stringify({ error: notifError?.message ?? 'Notification not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const formatter = TITLE_BODY[notification.type];
  if (!formatter) {
    // Unknown/unsupported type — no push defined for it, not an error
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no push mapping for type' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: recipient } = await supabase
    .from('profiles')
    .select('push_notifications_enabled')
    .eq('id', notification.user_id)
    .single();

  if (recipient?.push_notifications_enabled === false) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'push disabled by user' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('id, token')
    .eq('user_id', notification.user_id);

  if (!tokens?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const actorName = (notification.actor as { full_name?: string } | null)?.full_name ?? 'Someone';
  const { title, body } = formatter(actorName, notification.reference_text ?? null);

  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    data: {
      type: notification.type,
      reference_id: notification.reference_id,
      reference_type: notification.reference_type,
      notification_id: notification.id,
    },
  }));

  let expoResults: Array<{ status: string; message?: string; details?: { error?: string } }> = [];
  try {
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify(messages),
    });
    const expoJson = await expoRes.json();
    expoResults = Array.isArray(expoJson?.data) ? expoJson.data : [];
  } catch (e) {
    console.error('send-push: Expo API request failed', e);
    return new Response(JSON.stringify({ ok: false, sent: 0, error: 'expo_request_failed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Prune tokens Expo reports as dead; log (don't throw on) any other per-message error
  const staleTokenIds: string[] = [];
  expoResults.forEach((result, i) => {
    if (result.status === 'error') {
      console.error('send-push: Expo push error', tokens[i]?.token, result.message, result.details);
      if (result.details?.error === 'DeviceNotRegistered') {
        staleTokenIds.push(tokens[i].id);
      }
    }
  });

  if (staleTokenIds.length) {
    await supabase.from('push_tokens').delete().in('id', staleTokenIds);
  }

  return new Response(JSON.stringify({ ok: true, sent: messages.length, pruned: staleTokenIds.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
