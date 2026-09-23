-- Gives points a sink: a venue owner can optionally price a voucher in
-- points (points_price), which lists it in a member-facing rewards catalog.
-- Redemption spends points and claims the voucher atomically through a
-- single SECURITY DEFINER function — never through direct client writes —
-- so a balance check, a max-redemptions check, and a duplicate-claim check
-- all happen inside one row-locked transaction. The existing venue_vouchers
-- lifecycle (code, expiry, max_redemptions, staff-facing "mark redeemed"
-- flow) is reused unchanged; this only adds a second way a voucher can be
-- claimed, alongside the existing in-person hand-off.

alter table public.venue_vouchers add column points_price integer;

create table public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.venue_vouchers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points_spent integer not null,
  redeemed_at timestamptz not null default now(),
  constraint voucher_redemptions_unique unique (voucher_id, user_id)
);

create index voucher_redemptions_user_idx on public.voucher_redemptions (user_id, redeemed_at desc);
create index voucher_redemptions_voucher_idx on public.voucher_redemptions (voucher_id);

alter table public.voucher_redemptions enable row level security;

create policy "read own voucher redemptions"
  on public.voucher_redemptions for select
  using (auth.uid() = user_id);

create policy "venue owners read redemptions of their own vouchers"
  on public.voucher_redemptions for select
  using (exists (
    select 1 from public.venue_vouchers
    where venue_vouchers.id = voucher_redemptions.voucher_id
      and venue_vouchers.venue_owner_id = auth.uid()
  ));

create policy "admins read all voucher redemptions"
  on public.voucher_redemptions for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- No insert policy for clients — every row here is written by the function
-- below, which runs as the table owner (bypasses RLS the same way
-- enforce_daily_post_limit() already writes daily_post_counts).
create or replace function public.redeem_voucher_with_points(p_voucher_id uuid)
returns public.venue_vouchers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_voucher venue_vouchers%rowtype;
  v_balance integer;
begin
  select * into v_voucher from venue_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'Voucher not found' using errcode = 'P0001';
  end if;
  if v_voucher.points_price is null then
    raise exception 'This voucher is not redeemable with points' using errcode = 'P0001';
  end if;
  if not v_voucher.is_active then
    raise exception 'This voucher is no longer active' using errcode = 'P0001';
  end if;
  if v_voucher.expires_at is not null and v_voucher.expires_at < now() then
    raise exception 'This voucher has expired' using errcode = 'P0001';
  end if;
  if v_voucher.max_redemptions is not null and v_voucher.redemption_count >= v_voucher.max_redemptions then
    raise exception 'This voucher is fully redeemed' using errcode = 'P0001';
  end if;
  if exists (select 1 from voucher_redemptions where voucher_id = p_voucher_id and user_id = auth.uid()) then
    raise exception 'You already redeemed this voucher' using errcode = 'P0001';
  end if;

  select points_balance into v_balance from profiles where id = auth.uid();
  if coalesce(v_balance, 0) < v_voucher.points_price then
    raise exception 'Not enough points' using errcode = 'P0001';
  end if;

  insert into points_ledger (user_id, amount, reason, reference_id)
  values (auth.uid(), -v_voucher.points_price, 'voucher_redemption', v_voucher.id);

  insert into voucher_redemptions (voucher_id, user_id, points_spent)
  values (p_voucher_id, auth.uid(), v_voucher.points_price);

  update venue_vouchers set redemption_count = redemption_count + 1
  where id = p_voucher_id
  returning * into v_voucher;

  return v_voucher;
end;
$$;

grant execute on function public.redeem_voucher_with_points(uuid) to authenticated;
