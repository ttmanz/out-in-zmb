-- Venue owner discount vouchers: created in-app while a customer is on
-- site, shared by the customer to friends via the native share sheet.
-- Redemption is trust-based (shown to staff, marked redeemed in-app) —
-- no GPS/check-in verification in this first version.

create table public.venue_vouchers (
  id uuid primary key default gen_random_uuid(),
  venue_owner_id uuid not null references public.profiles(id) on delete cascade,
  venue_name text not null,
  discount_label text not null,
  code text not null,
  expires_at timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint venue_vouchers_code_unique unique (code)
);

create index venue_vouchers_owner_idx on public.venue_vouchers (venue_owner_id, created_at desc);

alter table public.venue_vouchers enable row level security;

-- Public read: a customer's friend who receives a shared code needs to be
-- able to look it up and see it's real before they ever open the venue
-- owner's own list.
create policy "read venue vouchers"
  on public.venue_vouchers for select
  using (true);

create policy "venue owners create their own vouchers"
  on public.venue_vouchers for insert
  with check (
    auth.uid() = venue_owner_id
    and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.account_type = 'venue_owner')
  );

create policy "venue owners manage their own vouchers"
  on public.venue_vouchers for update
  using (auth.uid() = venue_owner_id)
  with check (auth.uid() = venue_owner_id);

create policy "venue owners delete their own vouchers"
  on public.venue_vouchers for delete
  using (auth.uid() = venue_owner_id);

create policy "admins manage venue vouchers"
  on public.venue_vouchers for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

create policy "block banned members on venue vouchers"
  on public.venue_vouchers for all
  using (is_member_active(auth.uid()))
  with check (is_member_active(auth.uid()));
