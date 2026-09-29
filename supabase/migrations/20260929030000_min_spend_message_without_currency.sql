-- The minimum-spend error said "at least K50". The app no longer shows a
-- currency symbol anywhere, so the server message shouldn't either. This
-- re-creates submit_cashback_claim() unchanged apart from that one string.

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
  if not is_venue_approved(p_venue_owner_id) then
    raise exception 'This venue isn''t set up for rewards yet' using errcode = 'P0001';
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
      message = format('Receipts must be at least %s', rtrim(to_char(v_min, 'FM999999990.99'), '.')),
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
