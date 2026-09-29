-- Venue approval, and closing a hole that made it (and much else) meaningless.
--
-- 1. Anyone could pick "Venue Owner" in Complete Profile and immediately be
--    listed to customers and able to confirm claims. Venues now start
--    unapproved; an admin approves them. Until then a venue can set its offer
--    but isn't listed, can't receive claims, and can't confirm anything.
--
-- 2. profiles has a "users can update own profile" policy with no column
--    restrictions (only the subscription columns were guarded), so any signed-in
--    member could set their OWN is_admin, is_staff, status, points_balance and
--    cashback_balance — or venue_approved — straight from the app. This adds a
--    guard for those columns. Only direct client writes are restricted: the
--    ledger triggers, referral/claim functions and edge functions run as the
--    database owner or the service role and are unaffected.

alter table public.profiles add column venue_approved boolean not null default false;

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

  -- Balances only ever move through their ledgers, for admins too.
  if new.points_balance is distinct from old.points_balance
     or new.cashback_balance is distinct from old.cashback_balance then
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

drop trigger if exists trg_guard_profile_privileged_columns on public.profiles;
create trigger trg_guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

create or replace function public.is_venue_approved(p_venue_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select venue_approved and account_type = 'venue_owner' from profiles where id = p_venue_owner_id),
    false
  );
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

-- Only approved venues are listed to customers.
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
  join profiles p on p.id = o.venue_owner_id and p.account_type = 'venue_owner' and p.venue_approved
  where o.cash_percent > 0 or o.credit_percent > 0 or o.discount_percent > 0
  order by 2;
$$;

-- The functions below are unchanged except for the approval checks.

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
  if not is_venue_approved(p_venue_owner_id) then
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
    case when p_approve then 'redemption_confirmed' else 'redemption_rejected' end, v_redemption.amount
  );

  return v_redemption;
end;
$$;

revoke all on function public.is_venue_approved(uuid) from public, anon;
revoke all on function public.set_venue_approved(uuid, boolean) from public, anon;
grant execute on function public.is_venue_approved(uuid) to authenticated;
grant execute on function public.set_venue_approved(uuid, boolean) to authenticated;
