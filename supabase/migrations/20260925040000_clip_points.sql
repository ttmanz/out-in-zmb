-- Points for Clip of the Day: +10 the moment a clip is posted, plus a +50
-- bonus if an admin approves it (kept past the Monday purge — the
-- meaningful positive admin action on a clip; is_flagged is the opposite,
-- a moderation flag for removal, and is never rewarded). The approval
-- bonus is guarded by reference_id so toggling approved off and back on
-- never pays out twice.

create or replace function public.award_clip_post_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into points_ledger (user_id, amount, reason, reference_id)
  values (new.user_id, 10, 'clip_posted', new.id);
  return new;
end;
$$;

create trigger on_daily_clip_insert_award_points
  after insert on public.daily_clips
  for each row execute function public.award_clip_post_points();

create or replace function public.award_clip_approved_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_approved and not coalesce(old.is_approved, false) then
    if not exists (
      select 1 from points_ledger where reference_id = new.id and reason = 'clip_approved_bonus'
    ) then
      insert into points_ledger (user_id, amount, reason, reference_id)
      values (new.user_id, 50, 'clip_approved_bonus', new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger on_daily_clip_approved_award_points
  after update on public.daily_clips
  for each row execute function public.award_clip_approved_points();
