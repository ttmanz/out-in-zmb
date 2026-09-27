-- Real-money cash back: venues opt in to giving members a percentage of
-- their spend back in cash, funded by the venue (not the platform). Kept on
-- a completely separate ledger/balance from points_ledger/points_balance so
-- real money and the internal points currency can never be confused.
--
-- Flow: venue owner reports a member's spend (report_cashback_spend) ->
-- cashback_ledger credited at the live global rate -> member requests a
-- payout (request_cashback_payout, debits the ledger immediately so the
-- same funds can't be requested twice) -> admin fulfils it via Mobile Money
-- outside the app and marks it paid, or rejects it (which refunds the
-- ledger). No payment API is wired up yet - this is the manual-fulfillment
-- version; the ledger/request shape is designed so a real payout API can be
-- dropped in later without changing anything upstream of it.

create table public.cashback_settings (
  id boolean primary key default true check (id),
  percent numeric(5,2) not null default 5.00,
  min_spend numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into cashback_settings (id) values (true);

alter table public.cashback_settings enable row level security;

create policy "read cashback settings"
  on public.cashback_settings for select
  using (true);

create policy "admins manage cashback settings"
  on public.cashback_settings for update
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

alter table public.profiles add column cashback_balance numeric(10,2) not null default 0;

create table public.cashback_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index cashback_ledger_user_idx on public.cashback_ledger (user_id, created_at desc);

alter table public.cashback_ledger enable row level security;

create policy "read own cashback history"
  on public.cashback_ledger for select
  using (auth.uid() = user_id);

create policy "admins read all cashback history"
  on public.cashback_ledger for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

create or replace function public.apply_cashback_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update profiles set cashback_balance = cashback_balance + new.amount where id = new.user_id;
  return new;
end;
$$;

create trigger on_cashback_ledger_insert
  after insert on public.cashback_ledger
  for each row execute function public.apply_cashback_ledger_entry();

-- Audit trail of every venue-reported spend, separate from the ledger entry
-- it produces, so a venue's claim history survives even if the member later
-- cashes out (which only touches the ledger, not this table).
create table public.cashback_claims (
  id uuid primary key default gen_random_uuid(),
  venue_owner_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  spend_amount numeric(10,2) not null,
  cashback_amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create index cashback_claims_venue_idx on public.cashback_claims (venue_owner_id, created_at desc);
create index cashback_claims_user_idx on public.cashback_claims (user_id, created_at desc);

alter table public.cashback_claims enable row level security;

create policy "venue owners read their own cashback claims"
  on public.cashback_claims for select
  using (auth.uid() = venue_owner_id);

create policy "read own received cashback claims"
  on public.cashback_claims for select
  using (auth.uid() = user_id);

create policy "admins read all cashback claims"
  on public.cashback_claims for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- No insert policy for clients - every row here (and its matching ledger
-- credit) is written by this function, which runs as the table owner.
create or replace function public.report_cashback_spend(p_member_code text, p_spend_amount numeric)
returns public.cashback_claims
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member_id uuid;
  v_percent numeric;
  v_min_spend numeric;
  v_cashback_amount numeric;
  v_claim cashback_claims%rowtype;
begin
  if not exists (select 1 from profiles where profiles.id = auth.uid() and profiles.account_type = 'venue_owner') then
    raise exception 'Only venue accounts can report cash back' using errcode = 'P0001';
  end if;

  if p_spend_amount is null or p_spend_amount <= 0 then
    raise exception 'Enter a spend amount greater than zero' using errcode = 'P0001';
  end if;

  select id into v_member_id from profiles where referral_code = upper(trim(p_member_code));
  if v_member_id is null then
    raise exception 'No member found with that code' using errcode = 'P0001';
  end if;
  if v_member_id = auth.uid() then
    raise exception 'You cannot report cash back for your own account' using errcode = 'P0001';
  end if;

  select percent, min_spend into v_percent, v_min_spend from cashback_settings where id = true;
  if p_spend_amount < coalesce(v_min_spend, 0) then
    raise exception 'Spend is below the minimum required for cash back' using errcode = 'P0001';
  end if;

  v_cashback_amount := round(p_spend_amount * coalesce(v_percent, 5) / 100, 2);

  insert into cashback_claims (venue_owner_id, user_id, spend_amount, cashback_amount)
  values (auth.uid(), v_member_id, p_spend_amount, v_cashback_amount)
  returning * into v_claim;

  insert into cashback_ledger (user_id, amount, reason, reference_id)
  values (v_member_id, v_cashback_amount, 'venue_spend', v_claim.id);

  return v_claim;
end;
$$;

grant execute on function public.report_cashback_spend(text, numeric) to authenticated;

create table public.cashback_payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  mobile_money_number text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  admin_note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create index cashback_payout_requests_user_idx on public.cashback_payout_requests (user_id, requested_at desc);
create index cashback_payout_requests_status_idx on public.cashback_payout_requests (status, requested_at);

alter table public.cashback_payout_requests enable row level security;

create policy "read own cashback payout requests"
  on public.cashback_payout_requests for select
  using (auth.uid() = user_id);

create policy "admins manage cashback payout requests"
  on public.cashback_payout_requests for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

-- No insert policy for members - written by this function, which debits the
-- ledger in the same transaction so the same balance can never be requested
-- twice while a request is pending.
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
    raise exception 'Enter a Mobile Money number to receive the payout' using errcode = 'P0001';
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

grant execute on function public.request_cashback_payout(numeric, text) to authenticated;

-- Admin-only settle: mark a pending request paid, or reject it and refund
-- the ledger. Re-checks is_admin server-side rather than trusting RLS alone,
-- since this also writes to cashback_ledger, which has no client insert
-- policy at all.
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
    insert into cashback_ledger (user_id, amount, reason, reference_id)
    values (v_request.user_id, v_request.amount, 'cash_out_rejected_refund', v_request.id);

    update cashback_payout_requests
    set status = 'rejected', resolved_at = now(), resolved_by = auth.uid(), admin_note = p_admin_note
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

grant execute on function public.resolve_cashback_payout(uuid, boolean, text) to authenticated;
