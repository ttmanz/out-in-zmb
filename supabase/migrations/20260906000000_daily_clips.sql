-- "Clip of the Day": user-submitted video clips (max 3 minutes, enforced
-- client-side at capture), visible to everyone. Purged every Monday unless
-- an admin has approved the clip; admins can also flag and remove a clip
-- at any time before its natural purge.

create table public.daily_clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_url text not null,
  is_approved boolean not null default false,
  is_flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index daily_clips_created_at_idx on public.daily_clips (created_at desc);

alter table public.daily_clips enable row level security;

create policy "read daily clips"
  on public.daily_clips for select
  using (true);

create policy "insert own daily clips"
  on public.daily_clips for insert
  with check (auth.uid() = user_id);

create policy "owners delete own daily clips"
  on public.daily_clips for delete
  using (auth.uid() = user_id);

create policy "admins manage daily clips"
  on public.daily_clips for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

create policy "block banned members on daily clips"
  on public.daily_clips for all
  using (is_member_active(auth.uid()))
  with check (is_member_active(auth.uid()));

-- Every Monday at 03:00: purge all clips from the week just ended, except
-- ones an admin has approved to keep.
select cron.schedule(
  'purge-unapproved-clips',
  '0 3 * * 1',
  $$delete from public.daily_clips where is_approved = false$$
);
