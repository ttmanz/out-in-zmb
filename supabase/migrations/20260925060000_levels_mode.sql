-- Replaces the per-feature "Minimum Tier" gate (added, then decided
-- against) with a simpler fifth subscription mode: 'levels'. When active,
-- the Free/Silver/Gold/Platinum plan is "in effect" in the sense that
-- daily post limits follow each member's tier (already enforced by
-- enforce_daily_post_limit(), independent of this setting) — no feature is
-- blocked outright, same as 'free'. feature_access.min_tier is dropped;
-- nothing ever used it in production (mode was never set to anything but
-- the implicit 'free' default before today).

alter table public.feature_access drop column min_tier;

alter table public.subscription_settings drop constraint subscription_settings_mode_check;
alter table public.subscription_settings add constraint subscription_settings_mode_check
  check (mode = any (array['free', 'levels', 'free_until', 'free_except', 'free_except_venue']));
