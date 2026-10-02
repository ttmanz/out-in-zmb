-- Venue Plan: a second subscription mode next to Levels.
--
--   levels      — members are on Free/Silver/Gold/Platinum (unchanged).
--   venue_plan  — every member is free and has no levels. Venue accounts get a
--                 free trial (subscription_settings.venue_trial_days, editable by
--                 an admin, default 30 days from signup) and then need a paid
--                 Venue plan (monthly / 6-month / annual) to use the venue tools:
--                 offering rewards, confirming claims, vouchers. An unpaid venue
--                 still works like a member for everything else.
--
-- Enforced here on the server, not just hidden in the app: venue_has_access()
-- answers "may this account use venue tools?", and the venue reward functions,
-- the reward venue list, venue vouchers and points redemption all ask it.

alter table public.subscription_settings
  add column venue_trial_days integer not null default 30 check (venue_trial_days between 0 and 365);

alter table public.subscription_settings drop constraint subscription_settings_mode_check;
alter table public.subscription_settings add constraint subscription_settings_mode_check
  check (mode in ('levels', 'venue_plan'));

-- A leftover trigger gave every new account a hidden 30-day 'free_trial' plan, which
-- would have made the venue trial length impossible to edit (and showed new members
-- an 'Active — 30 days left' plan they never bought). Remove it; the venue trial is now
-- subscription_settings.venue_trial_days. The webhook-only guard on the subscription
-- columns is satisfied by acting as the service role for this one update.
drop trigger if exists trg_set_free_trial on public.profiles;
drop function if exists public.set_free_trial();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set subscription_plan = null, subscription_expires_at = null where subscription_plan = 'free_trial';
select set_config('request.jwt.claims', '', true);
alter table public.profiles alter column subscription_plan drop default;

-- Which kind of account a plan is for. The three existing level plans stay 'member'.
alter table public.subscription_plans
  add column audience text not null default 'member' check (audience in ('member', 'venue'));

-- The Venue plan: no level (tier_key stays empty), prices are placeholders an admin
-- fills in under Plans, together with the store product ids.
insert into public.subscription_plans (id, label, price_display, duration_months, badge, description, sort_order, is_active, audience)
values
  ('venue_monthly',  'Venue Monthly',  '', 1,  null,         'Full venue tools, billed monthly',   41, true, 'venue'),
  ('venue_sixmonth', 'Venue 6-Month',  '', 6,  null,         'Full venue tools, billed every 6 months', 42, true, 'venue'),
  ('venue_annual',   'Venue Annual',   '', 12, 'Best Value', 'Full venue tools, billed yearly',    43, true, 'venue')
on conflict (id) do nothing;

-- May this account use venue tools? True unless the mode is venue_plan and the
-- account is an unpaid venue whose trial has ended. Admins and staff always may.
create or replace function public.venue_has_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when coalesce((select mode from subscription_settings where id = 'global'), 'levels') <> 'venue_plan' then true
    else coalesce((
      select case
        when p.is_admin or p.is_staff then true
        when p.account_type is distinct from 'venue_owner' then true
        when p.subscription_expires_at > now()
             and exists (select 1 from subscription_plans sp where sp.id = p.subscription_plan) then true
        when p.created_at + make_interval(days => (select venue_trial_days from subscription_settings where id = 'global')) > now() then true
        else false
      end
      from profiles p where p.id = p_user_id
    ), false)
  end;
$$;

revoke all on function public.venue_has_access(uuid) from public, anon;
grant execute on function public.venue_has_access(uuid) to authenticated;

-- "Approved" now also means "allowed to operate": every reward function that
-- already checks is_venue_approved() (customers claiming, venues confirming,
-- store credit) refuses an unpaid, out-of-trial venue.
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
  ) and venue_has_access(p_venue_owner_id);
$$;

-- A venue can't set its offer while locked.
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
  v_cash_on boolean := cash_back_enabled();
  v_had_cash boolean;
  v_kept_cash numeric;
  v_offer venue_cashback_offers%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid() and account_type = 'venue_owner') then
    raise exception 'Only venue accounts can set an offer' using errcode = 'P0001';
  end if;
  if not venue_has_access(auth.uid()) then
    raise exception 'Your free trial has ended — subscribe to keep using venue tools' using errcode = 'P0001';
  end if;
  if p_participation is null or not (p_participation <@ v_keys) then
    raise exception 'Choose which rewards you offer' using errcode = 'P0001';
  end if;
  if coalesce(p_cash_percent, 0) < 0 or coalesce(p_credit_percent, 0) < 0 or coalesce(p_discount_percent, 0) < 0 then
    raise exception 'Enter 0 or more for each percentage' using errcode = 'P0001';
  end if;

  v_participation := array(select k from unnest(v_keys) k where k = any (p_participation));

  if not v_cash_on then
    select coalesce('cash' = any (p.participation), false), coalesce(o.cash_percent, 0)
      into v_had_cash, v_kept_cash
    from profiles p
    left join venue_cashback_offers o on o.venue_owner_id = p.id
    where p.id = auth.uid();

    v_participation := array_remove(v_participation, 'cash');
    if v_had_cash then
      v_participation := array(select k from unnest(v_keys) k where k = any (v_participation || array['cash']));
    end if;
    p_cash_percent := v_kept_cash;
  end if;

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

  if v_cash_on then
    select max_cash_percent into v_cap from cashback_settings where id = true;
    if v_cash > coalesce(v_cap, 0) then
      raise exception using
        message = format('Cash back can''t be more than %s%%', rtrim(to_char(coalesce(v_cap, 0), 'FM990.99'), '.')),
        errcode = 'P0001';
    end if;
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

-- Customers aren't shown a locked venue.
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
           case when cash_back_enabled() and 'cash' = any (coalesce(p.participation, '{}'::text[]))
                then least(o.cash_percent, coalesce((select max_cash_percent from cashback_settings where id = true), 0))
                else 0 end as cash_percent,
           case when 'credit' = any (coalesce(p.participation, '{}'::text[])) then o.credit_percent else 0 end as credit_percent,
           case when 'discount' = any (coalesce(p.participation, '{}'::text[])) then o.discount_percent else 0 end as discount_percent,
           c.code as country_code,
           c.currency_code,
           c.min_spend
    from venue_cashback_offers o
    join profiles p on p.id = o.venue_owner_id and p.account_type = 'venue_owner' and p.venue_approved
                       and venue_has_access(o.venue_owner_id)
    join countries c on c.code = o.country_code and c.is_active
  ) v
  where v.cash_percent > 0 or v.credit_percent > 0 or v.discount_percent > 0
  order by v.venue_name;
$$;

-- Voucher creation, the member voucher catalogue and points redemption.
drop policy if exists "venue owners create their own vouchers" on public.venue_vouchers;
create policy "venue owners create their own vouchers"
  on public.venue_vouchers for insert
  with check (
    auth.uid() = venue_owner_id
    and venue_has_access(auth.uid())
    and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.account_type = 'venue_owner')
  );

drop policy if exists "read venue vouchers" on public.venue_vouchers;
create policy "read venue vouchers"
  on public.venue_vouchers for select
  using (venue_has_access(venue_owner_id) or auth.uid() = venue_owner_id);

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
  if not venue_has_access(v_voucher.venue_owner_id) then
    raise exception 'This venue is not offering vouchers right now' using errcode = 'P0001';
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

-- Security fix found while testing this: the 'block banned members' rules on
-- venue_vouchers and daily_clips were created PERMISSIVE (the default), so they
-- ADDED access instead of restricting it: any active member could read, create,
-- change or delete any venue's voucher, and change or delete any clip (including
-- approving their own clip for the +50 points). Every other table uses a
-- RESTRICTIVE rule; these two now do too. The app's own flows are unaffected
-- (owners manage their own vouchers/clips, admins manage everything).
drop policy if exists "block banned members on venue vouchers" on public.venue_vouchers;
create policy "block banned members on venue vouchers"
  on public.venue_vouchers as restrictive for all
  using (is_member_active(auth.uid()))
  with check (is_member_active(auth.uid()));

drop policy if exists "block banned members on daily clips" on public.daily_clips;
create policy "block banned members on daily clips"
  on public.daily_clips as restrictive for all
  using (is_member_active(auth.uid()))
  with check (is_member_active(auth.uid()));
