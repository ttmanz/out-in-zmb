-- One-time +20 points the moment a profile is completed, reusing the
-- existing profiles.profile_completed flag (set by updateFullProfile() on
-- Complete Profile's Save) rather than inventing a separate "has photo +
-- bio" check — profile_completed already is the app's definition of done.
-- Guarded by both the OLD/NEW transition check and a ledger existence
-- check, so re-saving an already-completed profile never pays out twice.

create or replace function public.award_profile_completion_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.profile_completed and not coalesce(old.profile_completed, false) then
    if not exists (
      select 1 from points_ledger where user_id = new.id and reason = 'profile_completion_bonus'
    ) then
      insert into points_ledger (user_id, amount, reason)
      values (new.id, 20, 'profile_completion_bonus');
    end if;
  end if;
  return new;
end;
$$;

create trigger on_profile_completed_award_points
  after update on public.profiles
  for each row execute function public.award_profile_completion_points();

-- Backfill: anyone who completed their profile before this feature existed
-- still gets the one-time bonus, same guard as the trigger above.
insert into public.points_ledger (user_id, amount, reason)
select id, 20, 'profile_completion_bonus'
from public.profiles
where profile_completed = true
  and not exists (
    select 1 from public.points_ledger pl
    where pl.user_id = profiles.id and pl.reason = 'profile_completion_bonus'
  );
