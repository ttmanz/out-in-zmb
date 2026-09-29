-- Countries, currencies, and payout methods per country.
--
-- Until now cash back was one plain number with no currency, and a payout was
-- free text. That only works in one country. This makes the currency explicit
-- and routes each payout to a method that can actually pay it.
--
-- How the right rail is chosen:
--   * A venue picks its country (venue_cashback_offers.country_code); that fixes
--     the currency every claim at that venue is in. It can't be changed once
--     customers have claimed there.
--   * Cash back is kept per currency, straight from the ledger (the
--     profiles.cashback_balance cache is dropped: one number can't hold two
--     currencies).
--   * To cash out, a member picks a currency they hold and a payout method. A
--     method is offered if it is for a country that uses that currency, or is
--     "everywhere" (country_code null, e.g. bank transfer). Admins manage both
--     tables; paying is still done by hand for now, but the request records the
--     currency and method, so a real payout integration is a lookup on them.
-- Minimum spend moves from one global number to a per-country number, because a
-- single number can't mean the same thing in two currencies.

-- 1. Countries
create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  min_spend numeric(10,2) not null default 0 check (min_spend >= 0),
  is_active boolean not null default true
);

alter table public.countries enable row level security;

create policy "read countries"
  on public.countries for select
  using (true);

create policy "admins manage countries"
  on public.countries for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

insert into public.countries (code, name, currency_code) values
  ('ZM', 'Zambia', 'ZMW'),
  ('ZW', 'Zimbabwe', 'ZWG'),
  ('MW', 'Malawi', 'MWK'),
  ('MZ', 'Mozambique', 'MZN'),
  ('BW', 'Botswana', 'BWP'),
  ('NA', 'Namibia', 'NAD'),
  ('ZA', 'South Africa', 'ZAR'),
  ('TZ', 'Tanzania', 'TZS'),
  ('KE', 'Kenya', 'KES'),
  ('UG', 'Uganda', 'UGX'),
  ('NG', 'Nigeria', 'NGN'),
  ('GH', 'Ghana', 'GHS'),
  ('GB', 'United Kingdom', 'GBP'),
  ('US', 'United States', 'USD'),
  ('CY', 'Cyprus', 'EUR'),
  ('GR', 'Greece', 'EUR');

-- 2. Payout methods. country_code null = available for every currency.
--    detail_pattern is an optional regex the payout details must match.
create table public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  country_code text references public.countries(code) on delete cascade,
  method_key text not null check (method_key ~ '^[a-z0-9_]+$'),
  label text not null,
  detail_label text not null,
  detail_pattern text check (detail_pattern is null or ('' ~ detail_pattern) is not null),
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create unique index payout_methods_country_key_idx
  on public.payout_methods (coalesce(country_code, ''), method_key);

alter table public.payout_methods enable row level security;

create policy "read payout methods"
  on public.payout_methods for select
  using (true);

create policy "admins manage payout methods"
  on public.payout_methods for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

insert into public.payout_methods (country_code, method_key, label, detail_label, detail_pattern, sort_order) values
  ('ZM', 'mtn_momo',     'MTN Mobile Money', 'MTN mobile number',    '^\+?[0-9][0-9 ]{7,14}$', 10),
  ('ZM', 'airtel_money', 'Airtel Money',     'Airtel mobile number', '^\+?[0-9][0-9 ]{7,14}$', 20),
  ('ZW', 'ecocash',      'EcoCash',          'EcoCash number',       '^\+?[0-9][0-9 ]{7,14}$', 10),
  ('MW', 'airtel_money', 'Airtel Money',     'Airtel mobile number', '^\+?[0-9][0-9 ]{7,14}$', 10),
  ('MW', 'tnm_mpamba',   'TNM Mpamba',       'Mpamba number',        '^\+?[0-9][0-9 ]{7,14}$', 20),
  ('MZ', 'mpesa',        'M-Pesa',           'M-Pesa number',        '^\+?[0-9][0-9 ]{7,14}$', 10),
  ('BW', 'orange_money', 'Orange Money',     'Orange Money number',  '^\+?[0-9][0-9 ]{7,14}$', 10),
  (null, 'bank_transfer', 'Bank transfer',   'Bank name and account number', null, 90);

-- 3. Currency on every place cash back is held or moved. (All of these tables
--    were empty when this was written; the backfill is only a safety net.)
alter table public.venue_cashback_offers add column country_code text references public.countries(code);

alter table public.cashback_claims add column currency_code text;
alter table public.cashback_ledger add column currency_code text;
alter table public.cashback_payout_requests
  add column currency_code text, add column method_key text, add column method_label text;
alter table public.venue_credit_redemptions add column currency_code text;

update public.cashback_claims set currency_code = 'ZMW' where currency_code is null;
update public.cashback_ledger set currency_code = 'ZMW' where currency_code is null;
update public.cashback_payout_requests
  set currency_code = 'ZMW', method_key = 'manual', method_label = 'Manual payout' where currency_code is null;
update public.venue_credit_redemptions set currency_code = 'ZMW' where currency_code is null;

alter table public.cashback_claims alter column currency_code set not null;
alter table public.cashback_ledger alter column currency_code set not null;
alter table public.cashback_payout_requests
  alter column currency_code set not null, alter column method_key set not null, alter column method_label set not null;
alter table public.venue_credit_redemptions alter column currency_code set not null;

-- 4. Helpers.

-- The currency of a venue's claims, from its country. Null if it hasn't chosen
-- an active country yet.
create or replace function public.venue_currency(p_venue_owner_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.currency_code
  from venue_cashback_offers o
  join countries c on c.code = o.country_code and c.is_active
  where o.venue_owner_id = p_venue_owner_id;
$$;

-- Alert helper, now carrying the currency so the alert text says what it's in.
create or replace function public.notify_cashback(
  p_user uuid, p_type text, p_actor uuid, p_ref uuid, p_ref_type text, p_amount numeric, p_currency text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into notifications (user_id, type, actor_id, reference_id, reference_type, reference_text, read, created_at)
  values (
    p_user, p_type, p_actor, p_ref, p_ref_type,
    to_char(p_amount, 'FM999999990.00') || coalesce(' ' || p_currency, ''),
    false, now()
  );
exception when others then
  null;
end;
$$;

revoke all on function public.notify_cashback(uuid, text, uuid, uuid, text, numeric, text) from public, anon, authenticated;

-- 5. Venue offer now includes the venue's country.
drop function if exists public.set_venue_cashback_offer(numeric, numeric, numeric);

create or replace function public.set_venue_cashback_offer(
  p_cash_percent numeric, p_credit_percent numeric, p_discount_percent numeric, p_country_code text
) returns public.venue_cashback_offers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cap numeric;
  v_current text;
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
  if p_country_code is null or not exists (select 1 from countries where code = p_country_code and is_active) then
    raise exception 'Choose your country' using errcode = 'P0001';
  end if;

  select max_cash_percent into v_cap from cashback_settings where id = true;
  if p_cash_percent > coalesce(v_cap, 0) then
    raise exception using
      message = format('Cash back can''t be more than %s%%', rtrim(to_char(coalesce(v_cap, 0), 'FM990.99'), '.')),
      errcode = 'P0001';
  end if;

  -- Changing country would change the currency of credit customers already hold.
  select country_code into v_current from venue_cashback_offers where venue_owner_id = auth.uid();
  if v_current is not null and v_current <> p_country_code
     and (exists (select 1 from cashback_claims where venue_owner_id = auth.uid())
          or exists (select 1 from venue_credit_ledger where venue_owner_id = auth.uid())) then
    raise exception 'Your country can''t be changed once customers have claimed with you. Contact support.' using errcode = 'P0001';
  end if;

  insert into venue_cashback_offers (venue_owner_id, cash_percent, credit_percent, discount_percent, country_code, updated_at)
  values (auth.uid(), p_cash_percent, p_credit_percent, p_discount_percent, p_country_code, now())
  on conflict (venue_owner_id) do update
    set cash_percent = excluded.cash_percent,
        credit_percent = excluded.credit_percent,
        discount_percent = excluded.discount_percent,
        country_code = excluded.country_code,
        updated_at = now()
  returning * into v_offer;

  return v_offer;
end;
$$;

-- 6. Venues a member can claim at, with their currency and that country's minimum.
drop function if exists public.list_cashback_venues();

create or replace function public.list_cashback_venues()
returns table (
  venue_owner_id uuid, venue_name text, cash_percent numeric, credit_percent numeric,
  discount_percent numeric, country_code text, currency_code text, min_spend numeric
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
         o.discount_percent,
         c.code,
         c.currency_code,
         c.min_spend
  from venue_cashback_offers o
  join profiles p on p.id = o.venue_owner_id and p.account_type = 'venue_owner' and p.venue_approved
  join countries c on c.code = o.country_code and c.is_active
  where o.cash_percent > 0 or o.credit_percent > 0 or o.discount_percent > 0
  order by 2;
$$;

-- 7. Claims carry the venue's currency; the minimum spend is that country's.
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
  v_currency text;
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
  if not is_venue_approved(p_venue_owner_id) then
    raise exception 'This venue isn''t set up for rewards yet' using errcode = 'P0001';
  end if;

  select c.currency_code, c.min_spend into v_currency, v_min
  from venue_cashback_offers o
  join countries c on c.code = o.country_code and c.is_active
  where o.venue_owner_id = p_venue_owner_id;
  if v_currency is null then
    raise exception 'This venue hasn''t set its country yet' using errcode = 'P0001';
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

  if p_spend_amount < coalesce(v_min, 0) then
    raise exception using
      message = format('Receipts must be at least %s %s', rtrim(to_char(v_min, 'FM999999990.99'), '.'), v_currency),
      errcode = 'P0001';
  end if;

  select max_cash_percent into v_cap from cashback_settings where id = true;
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

  insert into cashback_claims (venue_owner_id, user_id, spend_amount, cashback_amount, status, reward_type, receipt_path, currency_code)
  values (p_venue_owner_id, auth.uid(), p_spend_amount, v_reward, 'pending', p_reward_type, p_receipt_path, v_currency)
  returning * into v_claim;

  perform notify_cashback(
    p_venue_owner_id, 'cashback_pending', auth.uid(), v_claim.id,
    case when p_reward_type = 'discount' then 'discount' else 'claim' end, p_spend_amount, v_currency
  );

  return v_claim;
end;
$$;

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
  if not is_venue_approved(auth.uid()) then
    raise exception 'Your venue hasn''t been approved yet' using errcode = 'P0001';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'This receipt was already handled' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_claim.reward_type = 'cash' then
      insert into cashback_ledger (user_id, amount, reason, reference_id, currency_code)
      values (v_claim.user_id, v_claim.cashback_amount, 'venue_spend', v_claim.id, v_claim.currency_code);
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
    v_claim.cashback_amount, v_claim.currency_code
  );

  return v_claim;
end;
$$;

-- 8. Store credit: currency comes from the venue.
create or replace function public.request_credit_redemption(p_venue_owner_id uuid, p_amount numeric)
returns public.venue_credit_redemptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_available numeric;
  v_currency text;
  v_redemption venue_credit_redemptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Enter an amount greater than zero' using errcode = 'P0001';
  end if;
  if not is_venue_approved(p_venue_owner_id) then
    raise exception 'This venue isn''t taking rewards right now' using errcode = 'P0001';
  end if;
  v_currency := venue_currency(p_venue_owner_id);
  if v_currency is null then
    raise exception 'This venue isn''t taking rewards right now' using errcode = 'P0001';
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

  insert into venue_credit_redemptions (user_id, venue_owner_id, amount, currency_code)
  values (auth.uid(), p_venue_owner_id, p_amount, v_currency)
  returning * into v_redemption;

  perform notify_cashback(p_venue_owner_id, 'cashback_pending', auth.uid(), v_redemption.id, 'redemption', p_amount, v_currency);

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
  if not is_venue_approved(auth.uid()) then
    raise exception 'Your venue hasn''t been approved yet' using errcode = 'P0001';
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
    case when p_approve then 'redemption_confirmed' else 'redemption_rejected' end,
    v_redemption.amount, v_redemption.currency_code
  );

  return v_redemption;
end;
$$;

drop function if exists public.my_venue_credits();

create or replace function public.my_venue_credits()
returns table (venue_owner_id uuid, venue_name text, balance numeric, currency_code text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.venue_owner_id,
         coalesce(nullif(p.full_name, ''), 'Venue'),
         sum(l.amount)::numeric,
         venue_currency(l.venue_owner_id)
  from venue_credit_ledger l
  join profiles p on p.id = l.venue_owner_id
  where l.user_id = auth.uid()
  group by l.venue_owner_id, p.full_name
  having sum(l.amount) > 0
  order by 2;
$$;

create or replace function public.set_venue_approved(p_venue_owner_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Admin only' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = p_venue_owner_id and account_type = 'venue_owner') then
    raise exception 'That isn''t a venue account' using errcode = 'P0001';
  end if;

  update profiles set venue_approved = p_approved where id = p_venue_owner_id;

  perform notify_cashback(
    p_venue_owner_id, 'cashback_result', auth.uid(), p_venue_owner_id,
    case when p_approved then 'venue_approved' else 'venue_revoked' end, 0
  );
end;
$$;

drop function if exists public.notify_cashback(uuid, text, uuid, uuid, text, numeric);

-- 9. Cash back is kept per currency, straight from the ledger.
create or replace function public.my_cashback_balances()
returns table (currency_code text, balance numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.currency_code, sum(l.amount)::numeric
  from cashback_ledger l
  where l.user_id = auth.uid()
  group by l.currency_code
  having sum(l.amount) <> 0
  order by 1;
$$;

-- Payout methods that can pay a given currency: for a country that uses it, or
-- available everywhere. A country-specific entry wins over a generic one with
-- the same key.
create or replace function public.list_payout_methods(p_currency text)
returns table (method_key text, label text, detail_label text, detail_pattern text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select x.method_key, x.label, x.detail_label, x.detail_pattern
  from (
    select distinct on (m.method_key) m.method_key, m.label, m.detail_label, m.detail_pattern, m.sort_order
    from payout_methods m
    where m.is_active
      and (m.country_code is null
           or exists (select 1 from countries c
                      where c.code = m.country_code and c.currency_code = p_currency and c.is_active))
    order by m.method_key, (m.country_code is null), m.sort_order
  ) x
  order by x.sort_order, x.label;
$$;

-- Cash out: the request records the currency and method, and debits that
-- currency's balance immediately so the same funds can't be requested twice.
drop function if exists public.request_cashback_payout(numeric, text);

create or replace function public.request_cashback_payout(
  p_amount numeric, p_details text, p_currency text, p_method_key text
) returns public.cashback_payout_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance numeric;
  v_method record;
  v_request cashback_payout_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero' using errcode = 'P0001';
  end if;
  if p_details is null or trim(p_details) = '' then
    raise exception 'Enter your payout details' using errcode = 'P0001';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Choose which currency to cash out' using errcode = 'P0001';
  end if;

  select * into v_method from list_payout_methods(p_currency) m where m.method_key = p_method_key;
  if not found then
    raise exception 'That payout method isn''t available for this currency' using errcode = 'P0001';
  end if;
  if v_method.detail_pattern is not null and trim(p_details) !~ v_method.detail_pattern then
    raise exception using
      message = format('Check your %s', lower(v_method.detail_label)),
      errcode = 'P0001';
  end if;

  perform 1 from profiles where id = auth.uid() for update;
  select coalesce(sum(amount), 0) into v_balance from cashback_ledger
  where user_id = auth.uid() and currency_code = p_currency;
  if v_balance < p_amount then
    raise exception 'Not enough cash back balance' using errcode = 'P0001';
  end if;

  insert into cashback_ledger (user_id, amount, reason, currency_code)
  values (auth.uid(), -p_amount, 'cash_out_requested', p_currency);

  insert into cashback_payout_requests (user_id, amount, mobile_money_number, currency_code, method_key, method_label)
  values (auth.uid(), p_amount, trim(p_details), p_currency, v_method.method_key, v_method.label)
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.resolve_cashback_payout(p_request_id uuid, p_approve boolean, p_admin_note text default null)
returns public.cashback_payout_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request cashback_payout_requests%rowtype;
begin
  if not exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true) then
    raise exception 'Admin only' using errcode = 'P0001';
  end if;

  select * into v_request from cashback_payout_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request was already resolved' using errcode = 'P0001';
  end if;

  if p_approve then
    update cashback_payout_requests
    set status = 'paid', resolved_at = now(), resolved_by = auth.uid(), admin_note = p_admin_note
    where id = p_request_id
    returning * into v_request;
  else
    insert into cashback_ledger (user_id, amount, reason, reference_id, currency_code)
    values (v_request.user_id, v_request.amount, 'cash_out_rejected_refund', v_request.id, v_request.currency_code);

    update cashback_payout_requests
    set status = 'rejected', resolved_at = now(), resolved_by = auth.uid(), admin_note = p_admin_note
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

-- 10. The single-number balance is gone: drop its trigger and the column, and
--     update the profile guard (which named that column) before the column goes.
drop trigger if exists on_cashback_ledger_insert on public.cashback_ledger;
drop function if exists public.apply_cashback_ledger_entry();

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_admin boolean;
begin
  -- Direct client writes arrive as `authenticated` (or `anon`). SECURITY DEFINER
  -- functions run as their owner, and the service role and SQL editor are
  -- neither, so they pass straight through.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- The points balance only ever moves through its ledger, for admins too.
  if new.points_balance is distinct from old.points_balance then
    raise exception 'Balances can only change through the ledger' using errcode = '42501';
  end if;

  select coalesce(is_admin, false) into v_admin from profiles where id = auth.uid();

  if new.is_admin is distinct from old.is_admin
     or new.is_staff is distinct from old.is_staff
     or new.status is distinct from old.status
     or new.venue_approved is distinct from old.venue_approved then
    if not coalesce(v_admin, false) then
      raise exception 'Only an admin can change that' using errcode = '42501';
    end if;
  end if;

  -- A member who switches account type doesn't carry an approval with them.
  if new.account_type is distinct from old.account_type and not coalesce(v_admin, false) then
    new.venue_approved := false;
  end if;

  return new;
end;
$$;

alter table public.profiles drop column cashback_balance;
alter table public.cashback_settings drop column min_spend;

-- 11. Privileges. Functions are executable by PUBLIC unless revoked, and the
--     ones dropped and re-created above lost their earlier grants.
revoke all on function public.venue_currency(uuid) from public, anon;
revoke all on function public.set_venue_cashback_offer(numeric, numeric, numeric, text) from public, anon;
revoke all on function public.list_cashback_venues() from public, anon;
revoke all on function public.my_venue_credits() from public, anon;
revoke all on function public.my_cashback_balances() from public, anon;
revoke all on function public.list_payout_methods(text) from public, anon;
revoke all on function public.request_cashback_payout(numeric, text, text, text) from public, anon;

grant execute on function public.venue_currency(uuid) to authenticated;
grant execute on function public.set_venue_cashback_offer(numeric, numeric, numeric, text) to authenticated;
grant execute on function public.list_cashback_venues() to authenticated;
grant execute on function public.my_venue_credits() to authenticated;
grant execute on function public.my_cashback_balances() to authenticated;
grant execute on function public.list_payout_methods(text) to authenticated;
grant execute on function public.request_cashback_payout(numeric, text, text, text) to authenticated;
