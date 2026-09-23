-- Ties feature access to the Free/Silver/Gold/Platinum membership tiers,
-- not just a binary "has any active plan". A feature can now require a
-- minimum tier (e.g. Gold+) regardless of subscription mode, resolved the
-- same way enforce_daily_post_limit() already resolves a profile's tier:
-- the active plan's tier_key, or 'free' with no active plan.
alter table public.feature_access
  add column if not exists min_tier text not null default 'free' references public.membership_tiers(tier_key);

-- subscription_settings had never been written to — the admin screen's mode
-- picker silently no-op'd (it only UPDATEs id='global', which didn't exist).
-- Seed the row explicitly, defaulting to 'free' (today's real behavior).
insert into public.subscription_settings (id, mode)
values ('global', 'free')
on conflict (id) do nothing;
