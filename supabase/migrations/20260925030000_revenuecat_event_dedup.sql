-- RevenueCat webhooks are at-least-once delivery — a retry can resend the
-- same event. That was harmless before (the profile update it drives is
-- idempotent), but it stops being harmless once the webhook also awards
-- points for a subscription payment: a duplicate delivery would double-pay
-- real currency. Dedupe on RevenueCat's own event.id before doing anything
-- else in the function.
create table public.revenuecat_processed_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);

alter table public.revenuecat_processed_events enable row level security;
-- No policies — this table is only ever touched by the edge function's
-- service-role client, which bypasses RLS entirely; no client role needs
-- any access to it.
