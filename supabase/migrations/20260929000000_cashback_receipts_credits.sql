-- Receipt-backed cash back with mandatory venue confirmation, per-venue
-- offers, and venue-only store credit.
--
-- Replaces the venue-initiated report_cashback_spend() flow. Now the member
-- photographs their receipt and submits a claim; nothing is credited until
-- the venue confirms it. Each venue chooses what it offers, at its own
-- percentages: cash back, store credit, a discount off the bill, or any mix.
-- Store credit is a liability of the venue that issued it and can only be
-- spent there; spending it is also a member request the venue must confirm.
-- A discount is applied at the till before paying, so it has no receipt: the
-- member requests it against the pre-discount bill total, the venue confirms
-- and takes that amount off. No money or credit moves, but it's recorded.
--
-- Cash still flows through cashback_ledger / cashback_payout_requests exactly
-- as before. Every write goes through a SECURITY DEFINER function — clients
-- have no insert/update policies on any of these tables.

-- 1. Platform-wide settings become a cap on cash (venues set their own rate,
--    up to this) and a minimum qualifying spend.
alter table public.cashback_settings rename column percent to max_cash_percent;

-- 2. What each venue offers. A percentage of 0 means that reward isn't offered.
create table public.venue_cashback_offers (
  venue_owner_id uuid primary key references public.profiles(id) on delete cascade,
  cash_percent numeric(5,2) not null default 0 check (cash_percent >= 0),
  credit_percent numeric(5,2) not null default 0 check (credit_percent between 0 and 100),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.venue_cashback_offers enable row level security;

create policy "read venue cashback offers"
  on public.venue_cashback_offers for select
  using (true);

create policy "admins manage venue cashback offers"
  on public.venue_cashback_offers for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- 3. Claims now carry a status, the reward the member chose, and the receipt.
--    Existing rows (from the old venue-reported flow) are confirmed cash.
alter table public.cashback_claims
  add column status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  add column reward_type text not null default 'cash'
    check (reward_type in ('cash', 'credit', 'discount')),
  add column receipt_path text,
  add column resolved_at timestamptz;

alter table public.cashback_claims alter column status set default 'pending';

create index cashback_claims_venue_status_idx
  on public.cashback_claims (venue_owner_id, status, created_at desc);

drop function if exists public.report_cashback_spend(text, numeric);

-- 4. Store credit: an append-only ledger per (member, venue).
create table public.venue_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  venue_owner_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index venue_credit_ledger_user_venue_idx
  on public.venue_credit_ledger (user_id, venue_owner_id, created_at desc);
create index venue_credit_ledger_venue_idx
  on public.venue_credit_ledger (venue_owner_id, created_at desc);

alter table public.venue_credit_ledger enable row level security;

create policy "read own venue credit history"
  on public.venue_credit_ledger for select
  using (auth.uid() = user_id);

create policy "venue owners read credit issued at their venue"
  on public.venue_credit_ledger for select
  using (auth.uid() = venue_owner_id);

create policy "admins read all venue credit"
  on public.venue_credit_ledger for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- 5. Spending store credit: requested by the member, confirmed by the venue.
create table public.venue_credit_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  venue_owner_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index venue_credit_redemptions_user_idx
  on public.venue_credit_redemptions (user_id, created_at desc);
create index venue_credit_redemptions_venue_status_idx
  on public.venue_credit_redemptions (venue_owner_id, status, created_at desc);

alter table public.venue_credit_redemptions enable row level security;

create policy "read own credit redemptions"
  on public.venue_credit_redemptions for select
  using (auth.uid() = user_id);

create policy "venue owners read redemptions at their venue"
  on public.venue_credit_redemptions for select
  using (auth.uid() = venue_owner_id);

create policy "admins read all credit redemptions"
  on public.venue_credit_redemptions for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- 6. Private receipt storage. Members upload into their own folder; the venue
--    a claim was sent to (and admins) can read it. Nobody else can.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

create policy "members upload own receipts"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "receipts readable by owner, venue, and admins"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.cashback_claims c
        where c.receipt_path = storage.objects.name and c.venue_owner_id = auth.uid()
      )
      or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    )
  );

-- 7. Functions.

-- In-app alert for the other party. A failed alert must never block the money
-- movement it describes, hence the swallowed exception.
create or replace function public.notify_cashback(
  p_user uuid, p_type text, p_actor uuid, p_ref uuid, p_ref_type text, p_amount numeric
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into notifications (user_id, type, actor_id, reference_id, reference_type, reference_text, read, created_at)
  values (p_user, p_type, p_actor, p_ref, p_ref_type, to_char(p_amount, 'FM999999990.00'), false, now());
exception when others then
  null;
end;
$$;

revoke all on function public.notify_cashback(uuid, text, uuid, uuid, text, numeric) from public, anon, authenticated;

-- Venue sets what it offers. Cash is capped by the platform-wide maximum.
create or replace function public.set_venue_cashback_offer(
  p_cash_percent numeric, p_credit_percent numeric, p_discount_percent numeric
) returns public.venue_cashback_offers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cap numeric;
  v_offer venue_cashback_offers%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid() and account_type = 'venue_owner') then
    raise exception 'Only venue accounts can set an offer' using errcode = 'P0001';
  end if;
  if p_cash_percent is null or p_cash_percent < 0
     or p_credit_percent is null or p_credit_percent < 0
     or p_discount_percent is null or p_discount_percent < 0 then
    raise exception 'Enter 0 or more for each percentage' using errcode = 'P0001';
  end if;
  if p_credit_percent > 100 or p_discount_percent > 100 then
    raise exception 'Store credit and discounts can''t be more than 100%%' using errcode = 'P0001';
  end if;

  select max_cash_percent into v_cap from cashback_settings where id = true;
  if p_cash_percent > coalesce(v_cap, 0) then
    raise exception using
      message = format('Cash back can''t be more than %s%%', rtrim(to_char(coalesce(v_cap, 0), 'FM990.99'), '.')),
      errcode = 'P0001';
  end if;

  insert into venue_cashback_offers (venue_owner_id, cash_percent, credit_percent, discount_percent, updated_at)
  values (auth.uid(), p_cash_percent, p_credit_percent, p_discount_percent, now())
  on conflict (venue_owner_id) do update
    set cash_percent = excluded.cash_percent,
        credit_percent = excluded.credit_percent,
        discount_percent = excluded.discount_percent,
        updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;

-- Venues a member can claim at, with the percentages they'd actually get
-- (cash already capped). Runs as owner so it doesn't depend on who may read
-- other people's profiles.
create or replace function public.list_cashback_venues()
returns table (
  venue_owner_id uuid, venue_name text, cash_percent numeric, credit_percent numeric, discount_percent numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.venue_owner_id,
         coalesce(nullif(p.full_name, ''), 'Venue'),
         least(o.cash_percent, coalesce((select max_cash_percent from cashback_settings where id = true), 0)),
         o.credit_percent,
         o.discount_percent
  from venue_cashback_offers o
  join profiles p on p.id = o.venue_owner_id and p.account_type = 'venue_owner'
  where o.cash_percent > 0 or o.credit_percent > 0 or o.discount_percent > 0
  order by 2;
$$;

-- Member submits a receipt (or, for a discount, a bill total). The reward is
-- fixed now, from the venue's offer at this moment, so a later rate change
-- can't shift a pending claim. A discount needs no photo: it's applied at the
-- till before paying, with the venue present to confirm it.
create or replace function public.submit_cashback_claim(
  p_venue_owner_id uuid, p_spend_amount numeric, p_receipt_path text, p_reward_type text
) returns public.cashback_claims
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cap numeric;
  v_min numeric;
  v_offer venue_cashback_offers%rowtype;
  v_percent numeric;
  v_reward numeric;
  v_claim cashback_claims%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'P0001';
  end if;
  if p_reward_type not in ('cash', 'credit', 'discount') then
    raise exception 'Choose cash back, store credit, or a discount' using errcode = 'P0001';
  end if;
  if p_venue_owner_id = auth.uid() then
    raise exception 'You can''t claim cash back at your own venue' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = p_venue_owner_id and account_type = 'venue_owner') then
    raise exception 'Venue not found' using errcode = 'P0001';
  end if;
  if p_spend_amount is null or p_spend_amount <= 0 then
    raise exception 'Enter the total on your receipt' using errcode = 'P0001';
  end if;
  if p_spend_amount > 1000000 then
    raise exception 'That amount looks too large' using errcode = 'P0001';
  end if;
  if (p_receipt_path is null and p_reward_type <> 'discount')
     or (p_receipt_path is not null and split_part(p_receipt_path, '/', 1) <> auth.uid()::text) then
    raise exception 'Add a photo of your receipt' using errcode = 'P0001';
  end if;
  if (select count(*) from cashback_claims where user_id = auth.uid() and status = 'pending') >= 10 then
    raise exception 'You have too many receipts waiting for confirmation' using errcode = 'P0001';
  end if;

  select max_cash_percent, min_spend into v_cap, v_min from cashback_settings where id = true;
  if p_spend_amount < coalesce(v_min, 0) then
    raise exception using
      message = format('Receipts must be at least K%s', rtrim(to_char(v_min, 'FM999999990.99'), '.')),
      errcode = 'P0001';
  end if;

  select * into v_offer from venue_cashback_offers where venue_owner_id = p_venue_owner_id;
  v_percent := case p_reward_type
    when 'cash' then least(coalesce(v_offer.cash_percent, 0), coalesce(v_cap, 0))
    when 'credit' then coalesce(v_offer.credit_percent, 0)
    else coalesce(v_offer.discount_percent, 0)
  end;
  if v_percent <= 0 then
    raise exception 'This venue doesn''t offer that reward' using errcode = 'P0001';
  end if;

  v_reward := round(p_spend_amount * v_percent / 100, 2);
  if v_reward <= 0 then
    raise exception 'That spend is too small to earn a reward' using errcode = 'P0001';
  end if;

  insert into cashback_claims (venue_owner_id, user_id, spend_amount, cashback_amount, status, reward_type, receipt_path)
  values (p_venue_owner_id, auth.uid(), p_spend_amount, v_reward, 'pending', p_reward_type, p_receipt_path)
  returning * into v_claim;

  perform notify_cashback(
    p_venue_owner_id, 'cashback_pending', auth.uid(), v_claim.id,
    case when p_reward_type = 'discount' then 'discount' else 'claim' end, p_spend_amount
  );

  return v_claim;
end;
$$;

-- Venue confirms or rejects. Only a confirmed claim moves any money or credit;
-- a confirmed discount moves neither (the venue takes it off the bill).
create or replace function public.resolve_cashback_claim(p_claim_id uuid, p_approve boolean)
returns public.cashback_claims
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_claim cashback_claims%rowtype;
begin
  select * into v_claim from cashback_claims where id = p_claim_id for update;
  if not found or v_claim.venue_owner_id is distinct from auth.uid() then
    raise exception 'Receipt not found' using errcode = 'P0001';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'This receipt was already handled' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_claim.reward_type = 'cash' then
      insert into cashback_ledger (user_id, amount, reason, reference_id)
      values (v_claim.user_id, v_claim.cashback_amount, 'venue_spend', v_claim.id);
    elsif v_claim.reward_type = 'credit' then
      insert into venue_credit_ledger (user_id, venue_owner_id, amount, reason, reference_id)
      values (v_claim.user_id, v_claim.venue_owner_id, v_claim.cashback_amount, 'venue_spend', v_claim.id);
    end if;
  end if;

  update cashback_claims
  set status = case when p_approve then 'confirmed' else 'rejected' end, resolved_at = now()
  where id = p_claim_id
  returning * into v_claim;

  perform notify_cashback(
    v_claim.user_id, 'cashback_result', auth.uid(), v_claim.id,
    case when v_claim.reward_type = 'discount' then 'discount' else 'claim' end
      || case when p_approve then '_confirmed' else '_rejected' end,
    v_claim.cashback_amount
  );

  return v_claim;
end;
$$;

create or replace function public.cancel_cashback_claim(p_claim_id uuid)
returns public.cashback_claims
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_claim cashback_claims%rowtype;
begin
  select * into v_claim from cashback_claims where id = p_claim_id for update;
  if not found or v_claim.user_id is distinct from auth.uid() then
    raise exception 'Receipt not found' using errcode = 'P0001';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'This receipt was already handled' using errcode = 'P0001';
  end if;

  update cashback_claims set status = 'cancelled', resolved_at = now()
  where id = p_claim_id
  returning * into v_claim;

  return v_claim;
end;
$$;

-- A member's store credit, one row per venue holding a positive balance.
create or replace function public.my_venue_credits()
returns table (venue_owner_id uuid, venue_name text, balance numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.venue_owner_id,
         coalesce(nullif(p.full_name, ''), 'Venue'),
         sum(l.amount)::numeric
  from venue_credit_ledger l
  join profiles p on p.id = l.venue_owner_id
  where l.user_id = auth.uid()
  group by l.venue_owner_id, p.full_name
  having sum(l.amount) > 0
  order by 2;
$$;

-- What a venue currently owes its customers in store credit.
create or replace function public.venue_credit_outstanding()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(amount), 0)::numeric from venue_credit_ledger where venue_owner_id = auth.uid();
$$;

-- Member asks to spend store credit at a venue. Credit already tied up in
-- another pending request doesn't count as available.
create or replace function public.request_credit_redemption(p_venue_owner_id uuid, p_amount numeric)
returns public.venue_credit_redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_available numeric;
  v_redemption venue_credit_redemptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Enter an amount greater than zero' using errcode = 'P0001';
  end if;

  perform 1 from profiles where id = auth.uid() for update;

  v_available :=
    coalesce((select sum(amount) from venue_credit_ledger
              where user_id = auth.uid() and venue_owner_id = p_venue_owner_id), 0)
    - coalesce((select sum(amount) from venue_credit_redemptions
                where user_id = auth.uid() and venue_owner_id = p_venue_owner_id and status = 'pending'), 0);
  if v_available < p_amount then
    raise exception 'Not enough store credit at this venue' using errcode = 'P0001';
  end if;

  insert into venue_credit_redemptions (user_id, venue_owner_id, amount)
  values (auth.uid(), p_venue_owner_id, p_amount)
  returning * into v_redemption;

  perform notify_cashback(p_venue_owner_id, 'cashback_pending', auth.uid(), v_redemption.id, 'redemption', p_amount);

  return v_redemption;
end;
$$;

create or replace function public.resolve_credit_redemption(p_redemption_id uuid, p_approve boolean)
returns public.venue_credit_redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_redemption venue_credit_redemptions%rowtype;
  v_balance numeric;
begin
  select * into v_redemption from venue_credit_redemptions where id = p_redemption_id for update;
  if not found or v_redemption.venue_owner_id is distinct from auth.uid() then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_redemption.status <> 'pending' then
    raise exception 'This request was already handled' using errcode = 'P0001';
  end if;

  if p_approve then
    perform 1 from profiles where id = v_redemption.user_id for update;
    select coalesce(sum(amount), 0) into v_balance from venue_credit_ledger
    where user_id = v_redemption.user_id and venue_owner_id = v_redemption.venue_owner_id;
    if v_balance < v_redemption.amount then
      raise exception 'The customer no longer has enough credit' using errcode = 'P0001';
    end if;

    insert into venue_credit_ledger (user_id, venue_owner_id, amount, reason, reference_id)
    values (v_redemption.user_id, v_redemption.venue_owner_id, -v_redemption.amount, 'credit_redeemed', v_redemption.id);
  end if;

  update venue_credit_redemptions
  set status = case when p_approve then 'confirmed' else 'rejected' end, resolved_at = now()
  where id = p_redemption_id
  returning * into v_redemption;

  perform notify_cashback(
    v_redemption.user_id, 'cashback_result', auth.uid(), v_redemption.id,
    case when p_approve then 'redemption_confirmed' else 'redemption_rejected' end, v_redemption.amount
  );

  return v_redemption;
end;
$$;

create or replace function public.cancel_credit_redemption(p_redemption_id uuid)
returns public.venue_credit_redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_redemption venue_credit_redemptions%rowtype;
begin
  select * into v_redemption from venue_credit_redemptions where id = p_redemption_id for update;
  if not found or v_redemption.user_id is distinct from auth.uid() then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_redemption.status <> 'pending' then
    raise exception 'This request was already handled' using errcode = 'P0001';
  end if;

  update venue_credit_redemptions set status = 'cancelled', resolved_at = now()
  where id = p_redemption_id
  returning * into v_redemption;

  return v_redemption;
end;
$$;

-- Signed-in users only. (Functions are executable by PUBLIC unless revoked.)
revoke all on function public.set_venue_cashback_offer(numeric, numeric, numeric) from public, anon;
revoke all on function public.list_cashback_venues() from public, anon;
revoke all on function public.submit_cashback_claim(uuid, numeric, text, text) from public, anon;
revoke all on function public.resolve_cashback_claim(uuid, boolean) from public, anon;
revoke all on function public.cancel_cashback_claim(uuid) from public, anon;
revoke all on function public.my_venue_credits() from public, anon;
revoke all on function public.venue_credit_outstanding() from public, anon;
revoke all on function public.request_credit_redemption(uuid, numeric) from public, anon;
revoke all on function public.resolve_credit_redemption(uuid, boolean) from public, anon;
revoke all on function public.cancel_credit_redemption(uuid) from public, anon;

grant execute on function public.set_venue_cashback_offer(numeric, numeric, numeric) to authenticated;
grant execute on function public.list_cashback_venues() to authenticated;
grant execute on function public.submit_cashback_claim(uuid, numeric, text, text) to authenticated;
grant execute on function public.resolve_cashback_claim(uuid, boolean) to authenticated;
grant execute on function public.cancel_cashback_claim(uuid) to authenticated;
grant execute on function public.my_venue_credits() to authenticated;
grant execute on function public.venue_credit_outstanding() to authenticated;
grant execute on function public.request_credit_redemption(uuid, numeric) to authenticated;
grant execute on function public.resolve_credit_redemption(uuid, boolean) to authenticated;
grant execute on function public.cancel_credit_redemption(uuid) to authenticated;
