-- Membership is "Levels" only (Free / Silver / Gold / Platinum, with the daily
-- post limit following each member's level). The other four subscription modes
-- — Free, Free Until, Free Except (paid features) and Free Except Venue (venue
-- trial + lock) — are removed from the app, so the setting can only be 'levels'.
--
-- Nothing is dropped: the subscription_plans (the level plans), feature_access
-- (the per-feature on/off switch) and the paid-feature columns stay as they are.
-- Zero features were marked paid and zero one-off unlocks existed when this ran.

update public.subscription_settings
   set mode = 'levels', free_until = null, updated_at = now()
 where id = 'global';

alter table public.subscription_settings drop constraint subscription_settings_mode_check;
alter table public.subscription_settings add constraint subscription_settings_mode_check
  check (mode = 'levels');

alter table public.subscription_settings alter column mode set default 'levels';

-- No feature is charged for any more.
update public.feature_access set is_paid = false, one_off_price = null where is_paid or one_off_price is not null;
