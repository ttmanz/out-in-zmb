-- Under the Levels plan, venues get only two options: Free, or Platinum.
-- Members keep Free / Silver / Gold / Platinum.
--
-- A plan can now be marked "offered to venue owners". The Silver and Gold plans are
-- switched off for venues (an admin can switch them back on under Plans); Platinum
-- stays on. Nothing is deleted, and no venue held a Silver or Gold subscription.

alter table public.subscription_plans
  add column venue_available boolean not null default true;

update public.subscription_plans set venue_available = false where tier_key in ('silver', 'gold');
