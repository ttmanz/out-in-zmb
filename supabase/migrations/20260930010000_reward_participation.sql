-- Participation: each member chooses which rewards they'd like from venues
-- (cash back, store credit, discount). It's a list on their profile: null =
-- hasn't chosen yet (everything allowed), empty = opted out of all.
-- submit_cashback_claim() now refuses a reward the member hasn't opted into;
-- it is otherwise unchanged. Members can edit their own list (an ordinary
-- profile field), and the check constraint rejects anything but these keys.

alter table public.profiles
  add column participation text[]
  check (participation is null or participation <@ array['cash', 'credit', 'discount']::text[]);

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

  -- A member only earns the rewards they opted into. Null means they haven't
  -- chosen yet, which allows everything; an empty list means they opted out.
  select participation into v_participation from profiles where id = auth.uid();
  if v_participation is not null and not (p_reward_type = any (v_participation)) then
    raise exception 'You haven''t chosen to take part in that reward. Change it under Profile > Participation.' using errcode = 'P0001';
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
