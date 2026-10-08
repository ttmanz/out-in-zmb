-- "Memory" tab on My Story. Saving a story to Memory is a paid-members-only feature
-- and keeps that story for 3 months from the day it is saved, instead of the normal
-- 15 days (+1 day grace). The hourly cleanup-expired-content function skips any story
-- whose memory_until is still in the future.
--
-- Paid = an active, unexpired subscription plan (any level), or staff/admin.
-- Enforced here, in the database, so an old app build can't bypass it.

alter table public.story_saves add column if not exists keep_until timestamptz;
alter table public.stories     add column if not exists memory_until timestamptz;

-- Saves that exist already (none on the live DB when this was written) get the
-- full 3 months from now rather than being cut short.
update public.story_saves set keep_until = now() + interval '3 months' where keep_until is null;
update public.stories s set memory_until = x.k
  from (select story_id, max(keep_until) k from public.story_saves group by story_id) x
  where s.id = x.story_id;

create or replace function public.story_save_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_paid boolean;
begin
  select coalesce(p.is_admin, false) or coalesce(p.is_staff, false)
         or (p.subscription_expires_at > now()
             and exists (select 1 from subscription_plans sp
                         where sp.id = p.subscription_plan and sp.tier_key is not null))
    into v_paid
    from profiles p where p.id = new.user_id;
  if not coalesce(v_paid, false) then
    raise exception 'memory_requires_subscription' using errcode = 'P0001';
  end if;
  new.keep_until := now() + interval '3 months';
  return new;
end $$;

drop trigger if exists story_save_guard on public.story_saves;
create trigger story_save_guard before insert on public.story_saves
  for each row execute function public.story_save_guard();

-- stories.memory_until = the latest keep_until among the story's saves (null if none).
create or replace function public.refresh_story_memory()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_story uuid := coalesce(new.story_id, old.story_id);
begin
  update stories set memory_until = (select max(keep_until) from story_saves where story_id = v_story)
   where id = v_story;
  return null;
end $$;

drop trigger if exists story_memory_refresh on public.story_saves;
create trigger story_memory_refresh after insert or delete on public.story_saves
  for each row execute function public.refresh_story_memory();

-- Nobody can claim a memory period when posting a story.
create or replace function public.stories_clear_memory()
returns trigger language plpgsql as $$
begin new.memory_until := null; return new; end $$;

drop trigger if exists stories_clear_memory on public.stories;
create trigger stories_clear_memory before insert on public.stories
  for each row execute function public.stories_clear_memory();

notify pgrst, 'reload schema';
