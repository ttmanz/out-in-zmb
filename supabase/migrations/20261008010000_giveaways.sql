-- Give Away tab: approved venues (from their profile page) and admins (from the Give Away
-- tab) post things they are giving away; every member can see them. Each one has an end
-- date and is deleted, with its photo/video, 24 hours after it by cleanup-expired-content.

create table public.giveaways (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  venue_name text,
  title text not null check (char_length(title) between 1 and 100),
  description text check (char_length(description) <= 500),
  photo_url text,
  video_url text,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index giveaways_ends_at_idx on public.giveaways (ends_at);

alter table public.giveaways enable row level security;

create policy "read giveaways" on public.giveaways for select using (auth.uid() is not null);

create policy "venues and admins post giveaways" on public.giveaways for insert
  with check (
    created_by = auth.uid()
    and ends_at > now() and ends_at <= now() + interval '90 days'
    and (is_venue_approved(auth.uid())
         or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  );

create policy "delete own or admin giveaways" on public.giveaways for delete
  using (created_by = auth.uid()
         or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy "block banned members" on public.giveaways as restrictive for all
  using (is_member_active(auth.uid())) with check (is_member_active(auth.uid()));

-- Lets an admin switch the whole tab off under Access Control, like the other features.
insert into public.feature_access (feature_key, label) values ('giveaways', 'Give Away')
  on conflict (feature_key) do nothing;

notify pgrst, 'reload schema';
