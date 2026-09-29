-- The cash-out error said "Enter a Mobile Money number", but a payout can go
-- to any method the admin can send to. Re-creates request_cashback_payout()
-- unchanged apart from that one message. (The parameter keeps its old name,
-- p_mobile_money_number, because Postgres won't rename a parameter in place and
-- the app calls it by name.)

create or replace function public.request_cashback_payout(p_amount numeric, p_mobile_money_number text)
returns public.cashback_payout_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance numeric;
  v_request cashback_payout_requests%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero' using errcode = 'P0001';
  end if;
  if p_mobile_money_number is null or trim(p_mobile_money_number) = '' then
    raise exception 'Enter your payout details' using errcode = 'P0001';
  end if;

  select cashback_balance into v_balance from profiles where id = auth.uid() for update;
  if coalesce(v_balance, 0) < p_amount then
    raise exception 'Not enough cash back balance' using errcode = 'P0001';
  end if;

  insert into cashback_ledger (user_id, amount, reason)
  values (auth.uid(), -p_amount, 'cash_out_requested');

  insert into cashback_payout_requests (user_id, amount, mobile_money_number)
  values (auth.uid(), p_amount, trim(p_mobile_money_number))
  returning * into v_request;

  return v_request;
end;
$$;
