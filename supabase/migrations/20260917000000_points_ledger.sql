-- Rewards points: an append-only ledger of earn events, with a
-- denormalized running balance on profiles for fast reads. Every row is
-- written server-side by a SECURITY DEFINER trigger — the app never
-- inserts into this table directly, so a client can't award itself points.
--
-- First earn trigger: +10 points for the day's first At Venue check-in.
-- More earn reasons (referrals, posting, etc.) and a spend flow (e.g.
-- redeeming points for a venue voucher) can be added later without
-- changing this shape.

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index points_ledger_user_idx on public.points_ledger (user_id, created_at desc);

alter table public.points_ledger enable row level security;

create policy "read own points history"
  on public.points_ledger for select
  using (auth.uid() = user_id);

create policy "admins read all points history"
  on public.points_ledger for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

alter table public.profiles add column points_balance integer not null default 0;

create or replace function public.apply_points_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update profiles set points_balance = points_balance + new.amount where id = new.user_id;
  return new;
end;
$$;

create trigger on_points_ledger_insert
  after insert on public.points_ledger
  for each row execute function public.apply_points_ledger_entry();

create or replace function public.award_checkin_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from points_ledger
    where user_id = new.user_id
      and reason = 'at_venue_checkin'
      and created_at::date = now()::date
  ) then
    insert into points_ledger (user_id, amount, reason)
    values (new.user_id, 10, 'at_venue_checkin');
  end if;
  return new;
end;
$$;

create trigger on_checkin_award_points
  after insert or update on public.member_checkins
  for each row execute function public.award_checkin_points();
