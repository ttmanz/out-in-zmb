-- Participation belongs to the VENUE: the venue owner ticks which of the three
-- rewards (cash back, store credit, discount) they take part in, and only those
-- are offered to customers. 20260930010000_reward_participation.sql put the
-- choice on members by mistake; this reverses that and reuses the same column
-- (profiles.participation text[], only 'cash' / 'credit' / 'discount').
--
-- For a venue owner: a reward is offered only if it is ticked AND has a
-- percentage above 0. Nothing ticked (or never chosen) means nothing offered.
-- Members' own participation is no longer used anywhere (none had been set).

-- Saving an offer now also saves the ticks, in one step. A ticked reward needs a
-- percentage; an unticked one is stored as 0, so the two can't disagree.
drop function if exists public.set_venue_cashback_offer(numeric, numeric, numeric, text);

create or replace function public.set_venue_cashback_offer(
  p_cash_percent numeric, p_credit_percent numeric, p_discount_percent numeric,
  p_country_code text, p_participation text[]
) returns public.venue_cashback_offers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_keys constant text[] := array['cash', 'credit', 'discount'];
  v_participation text[];
  v_cash numeric;
  v_credit numeric;
  v_discount numeric;
  v_cap numeric;
  v_current text;
  v_offer venue_cashback_offers%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid() and account_type = 'venue_owner') then
    raise exception 'Only venue accounts can set an offer' using errcode = 'P0001';
  end if;
  if p_participation is null or not (p_participation <@ v_keys) then
    raise exception 'Choose which rewards you offer' using errcode = 'P0001';
  end if;
  if coalesce(p_cash_percent, 0) < 0 or coalesce(p_credit_percent, 0) < 0 or coalesce(p_discount_percent, 0) < 0 then
    raise exception 'Enter 0 or more for each percentage' using errcode = 'P0001';
  end if;

  v_participation := array(select k from unnest(v_keys) k where k = any (p_participation));

  if 'cash' = any (v_participation) and coalesce(p_cash_percent, 0) <= 0 then
    raise exception 'Set a percentage for cash back, or untick it' using errcode = 'P0001';
  end if;
  if 'credit' = any (v_participation) and coalesce(p_credit_percent, 0) <= 0 then
    raise exception 'Set a percentage for store credit, or untick it' using errcode = 'P0001';
  end if;
  if 'discount' = any (v_participation) and coalesce(p_discount_percent, 0) <= 0 then
    raise exception 'Set a percentage for the discount, or untick it' using errcode = 'P0001';
  end if;

  v_cash := case when 'cash' = any (v_participation) then p_cash_percent else 0 end;
  v_credit := case when 'credit' = any (v_participation) then p_credit_percent else 0 end;
  v_discount := case when 'discount' = any (v_participation) then p_discount_percent else 0 end;

  if v_credit > 100 or v_discount > 100 then
    raise exception 'Store credit and discounts can''t be more than 100%%' using errcode = 'P0001';
  end if;
  if p_country_code is null or not exists (select 1 from countries where code = p_country_code and is_active) then
    raise exception 'Choose your country' using errcode = 'P0001';
  end if;

  select max_cash_percent into v_cap from cashback_settings where id = true;
  if v_cash > coalesce(v_cap, 0) then
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

  update profiles set participation = v_participation where id = auth.uid();

  insert into venue_cashback_offers (venue_owner_id, cash_percent, credit_percent, discount_percent, country_code, updated_at)
  values (auth.uid(), v_cash, v_credit, v_discount, p_country_code, now())
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

-- Customers only see the rewards a venue takes part in.
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
  select v.venue_owner_id, v.venue_name, v.cash_percent, v.credit_percent, v.discount_percent,
         v.country_code, v.currency_code, v.min_spend
  from (
    select o.venue_owner_id,
           coalesce(nullif(p.full_name, ''), 'Venue') as venue_name,
           case when 'cash' = any (coalesce(p.participation, '{}'::text[]))
                then least(o.cash_percent, coalesce((select max_cash_percent from cashback_settings where id = true), 0))
                else 0 end as cash_percent,
           case when 'credit' = any (coalesce(p.participation, '{}'::text[])) then o.credit_percent else 0 end as credit_percent,
           case when 'discount' = any (coalesce(p.participation, '{}'::text[])) then o.discount_percent else 0 end as discount_percent,
           c.code as country_code,
           c.currency_code,
           c.min_spend
    from venue_cashback_offers o
    join profiles p on p.id = o.venue_owner_id and p.account_type = 'venue_owner' and p.venue_approved
    join countries c on c.code = o.country_code and c.is_active
  ) v
  where v.cash_percent > 0 or v.credit_percent > 0 or v.discount_percent > 0
  order by v.venue_name;
$$;

-- Claims: the check that the MEMBER had opted in is gone; the venue must be
-- taking part in the reward instead. Otherwise unchanged.
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
  v_participation text[];
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
  select participation into v_participation from profiles where id = p_venue_owner_id;
  v_percent := case
    when not (p_reward_type = any (coalesce(v_participation, '{}'::text[]))) then 0
    else case p_reward_type
      when 'cash' then least(coalesce(v_offer.cash_percent, 0), coalesce(v_cap, 0))
      when 'credit' then coalesce(v_offer.credit_percent, 0)
      else coalesce(v_offer.discount_percent, 0)
    end
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

revoke all on function public.set_venue_cashback_offer(numeric, numeric, numeric, text, text[]) from public, anon;
grant execute on function public.set_venue_cashback_offer(numeric, numeric, numeric, text, text[]) to authenticated;
