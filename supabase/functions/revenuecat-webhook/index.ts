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
          .select('id')
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
