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

const SUBSCRIPTION_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);

// Subscriber points reward, per month the payment covers — scaled by tier
// so an annual purchase isn't shortchanged against monthly renewals of the
// same tier. Only awarded on an event that means a fresh payment period
// just started (not UNCANCELLATION or PRODUCT_CHANGE, neither of which
// necessarily means a new charge happened). Rate is admin-editable via
// points_rules (rule_key `subscription_reward_<tier>`), not a constant —
// these fallbacks only cover a missing/deleted rule row.
const TIER_POINTS_FALLBACK: Record<string, number> = { silver: 20, gold: 50, platinum: 100 };
const POINTS_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => null);
  const event = body?.event;
  if (!event?.type || !event?.app_user_id) return json({ ok: true });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Webhook delivery is at-least-once — a retry resends the same event.
  // Dedupe on RevenueCat's own event.id before any side effect runs, so a
  // resend can't double-apply a subscription change or double-pay points.
  const eventId = event.id as string | undefined;
  if (eventId) {
    const { error: dedupeError } = await admin
      .from('revenuecat_processed_events')
      .insert({ event_id: eventId });
    if (dedupeError) return json({ ok: true }); // already processed (or a transient issue) — ack and stop
  }

  const userId = event.app_user_id as string;
  const productId = event.product_id as string | undefined;

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    // Both the member and venue-owner price of a plan grant the same
    // access, just at a different store price — either product id on a
    // plan row resolves to that same plan. Looked up from
    // subscription_plans directly (admin-configured) rather than a
    // hardcoded map, so new tiers/plans just work once the admin fills in
    // their RevenueCat product ids.
    const { data: plan } = productId
      ? await admin
          .from('subscription_plans')
          .select('id, tier_key, duration_months')
          .or(`revenuecat_product_id.eq.${productId},venue_revenuecat_product_id.eq.${productId}`)
          .maybeSingle()
      : { data: null };
    if (!plan) {
      console.error(`Unknown subscription product_id: ${productId}`);
      return json({ ok: true });
    }
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    await admin
      .from('profiles')
      .update({ subscription_plan: plan.id, subscription_expires_at: expiresAt })
      .eq('id', userId);

    if (POINTS_EVENTS.has(event.type) && plan.tier_key) {
      const tierKey = plan.tier_key as string;
      const { data: rule } = await admin
        .from('points_rules')
        .select('amount')
        .eq('rule_key', `subscription_reward_${tierKey}`)
        .maybeSingle();
      const perMonth = rule?.amount ?? TIER_POINTS_FALLBACK[tierKey];
      if (perMonth) {
        const amount = perMonth * (plan.duration_months ?? 1);
        await admin
          .from('points_ledger')
          .insert({ user_id: userId, amount, reason: 'subscription_reward' });
      }
    }

    return json({ ok: true });
  }

  if (event.type === 'EXPIRATION') {
    await admin
      .from('profiles')
      .update({ subscription_plan: null, subscription_expires_at: null })
      .eq('id', userId);
    return json({ ok: true });
  }

  if (event.type === 'NON_RENEWING_PURCHASE') {
    const featureKey = productId?.startsWith('unlock_') ? productId.slice('unlock_'.length) : null;
    if (!featureKey) {
      console.error(`Unrecognized one-off product_id: ${productId}`);
      return json({ ok: true });
    }
    await admin
      .from('user_feature_unlocks')
      .upsert({ user_id: userId, feature_key: featureKey, product_id: productId }, { onConflict: 'user_id,feature_key' });
    return json({ ok: true });
  }

  // Unrecognized event type — ack anyway so RevenueCat doesn't keep retrying.
  return json({ ok: true });
});
