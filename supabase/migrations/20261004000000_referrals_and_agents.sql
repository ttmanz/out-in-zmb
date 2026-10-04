-- Referral quality + Agents.
--
-- 1. A referral now counts, and the referrer is paid, only once the referred
--    member has COMPLETED their profile — not at signup — so throwaway accounts
--    can't farm the +50. The new member's welcome bonus is still paid at signup.
-- 2. A member who reaches agent_settings.referrals_required counted referrals
--    becomes an AGENT automatically (an admin can also make or remove one, and a
--    removed agent is not made one again automatically). Agents are paid the
--    'agent_referral_bonus' rule (editable under Points Rules), or a per-agent
--    override, instead of the normal referral bonus, for each later referral.
-- 3. The Agents admin screen reads agent_overview() and edits the settings.

-- ---------------------------------------------------------------- settings
create table public.agent_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  referrals_required integer not null default 10 check (referrals_required between 1 and 10000),
  updated_at timestamptz not null default now()
);
insert into public.agent_settings (id) values (true);
alter table public.agent_settings enable row level security;

-- Members read it, to see how far they are from agent status.
create policy "read agent settings" on public.agent_settings for select using (true);
create policy "admins update agent settings" on public.agent_settings for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ---------------------------------------------------------------- profile columns
alter table public.profiles
  add column is_agent boolean not null default false,
  add column agent_since timestamptz,
  add column agent_bonus_override integer check (agent_bonus_override is null or agent_bonus_override >= 0),
  add column agent_revoked boolean not null default false;

-- Agent status is admin-only; a member can never write it directly.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
     or new.venue_approved is distinct from old.venue_approved
     or new.is_agent is distinct from old.is_agent
     or new.agent_since is distinct from old.agent_since
     or new.agent_bonus_override is distinct from old.agent_bonus_override
     or new.agent_revoked is distinct from old.agent_revoked then
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
$function$;

insert into public.points_rules (rule_key, label, amount)
values ('agent_referral_bonus', 'Agent: bonus per referral (replaces the normal referrer bonus for agents)', 100)
on conflict (rule_key) do nothing;
update public.points_rules
   set label = 'Referrer bonus, per referral (paid once the new member completes their profile)'
 where rule_key = 'referral_bonus';

-- ---------------------------------------------------------------- the logic
create or replace function public.evaluate_agent(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_enabled boolean;
  v_required integer;
  v_count integer;
begin
  select enabled, referrals_required into v_enabled, v_required from agent_settings where id = true;
  if not coalesce(v_enabled, false) then
    return;
  end if;
  if exists (select 1 from profiles where id = p_user_id and (is_agent or agent_revoked)) then
    return;
  end if;
  select count(*) into v_count from profiles where referred_by = p_user_id and profile_completed;
  if v_count >= v_required then
    update profiles set is_agent = true, agent_since = now() where id = p_user_id;
  end if;
end;
$$;

-- Pay the referrer for one referred member, once, if that member has completed their profile.
create or replace function public.pay_referral_if_due(p_referred_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_referrer uuid;
  v_done boolean;
  v_is_agent boolean;
  v_override integer;
  v_base integer;
  v_agent_rate integer;
  v_amount integer;
begin
  select referred_by, coalesce(profile_completed, false) into v_referrer, v_done
  from profiles where id = p_referred_id;
  if v_referrer is null or not v_done then
    return;
  end if;
  if exists (select 1 from points_ledger where reason = 'referral_bonus' and reference_id = p_referred_id) then
    return;
  end if;

  select is_agent, agent_bonus_override into v_is_agent, v_override from profiles where id = v_referrer;
  select amount into v_base from points_rules where rule_key = 'referral_bonus';
  select amount into v_agent_rate from points_rules where rule_key = 'agent_referral_bonus';
  v_amount := case
    when coalesce(v_is_agent, false) then coalesce(v_override, v_agent_rate, v_base, 50)
    else coalesce(v_base, 50)
  end;

  if v_amount > 0 then
    insert into points_ledger (user_id, amount, reason, reference_id)
    values (v_referrer, v_amount, 'referral_bonus', p_referred_id);
  end if;

  perform evaluate_agent(v_referrer);
end;
$$;

create or replace function public.award_referral_on_profile_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.profile_completed and not coalesce(old.profile_completed, false) then
    perform pay_referral_if_due(new.id);
  end if;
  return new;
end;
$$;

create trigger on_profile_completed_pay_referral
  after update on public.profiles
  for each row execute function public.award_referral_on_profile_completed();

-- Signup: links the referrer and pays the NEW member's welcome bonus. The
-- referrer is paid later, by pay_referral_if_due().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_referrer_id uuid;
  v_input_code text;
  v_welcome_amount integer;
begin
  v_input_code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
  if v_input_code <> '' then
    select id into v_referrer_id from public.profiles where referral_code = v_input_code;
  end if;

  insert into public.profiles (id, full_name, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    generate_referral_code(),
    v_referrer_id
  )
  on conflict (id) do nothing;

  if v_referrer_id is not null then
    select amount into v_welcome_amount from points_rules where rule_key = 'referral_welcome_bonus';
    insert into public.points_ledger (user_id, amount, reason, reference_id)
    values (new.id, coalesce(v_welcome_amount, 20), 'referral_welcome_bonus', new.id);
  end if;

  return new;
end;
$$;

-- Google / Apple sign-in claims its code after the account exists: same rule.
create or replace function public.claim_referral(p_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text := upper(trim(p_code));
  v_referrer_id uuid;
  v_my_referred_by uuid;
  v_my_created_at timestamptz;
  v_welcome_amount integer;
begin
  select referred_by, created_at into v_my_referred_by, v_my_created_at
  from profiles where id = auth.uid();

  if v_my_referred_by is not null then
    raise exception 'You already used a referral code' using errcode = 'P0001';
  end if;

  if v_my_created_at is null or v_my_created_at < now() - interval '2 days' then
    raise exception 'Referral codes can only be applied right after signing up' using errcode = 'P0001';
  end if;

  select id into v_referrer_id from profiles where referral_code = v_code;
  if v_referrer_id is null then
    raise exception 'Invalid referral code' using errcode = 'P0001';
  end if;
  if v_referrer_id = auth.uid() then
    raise exception 'You cannot refer yourself' using errcode = 'P0001';
  end if;

  update profiles set referred_by = v_referrer_id where id = auth.uid();

  select amount into v_welcome_amount from points_rules where rule_key = 'referral_welcome_bonus';
  insert into points_ledger (user_id, amount, reason, reference_id)
  values (auth.uid(), coalesce(v_welcome_amount, 20), 'referral_welcome_bonus', auth.uid());

  -- Already completed their profile before claiming? Then the referral counts now.
  perform pay_referral_if_due(auth.uid());
end;
$$;

-- ---------------------------------------------------------------- admin + member functions
create or replace function public.set_agent(p_user_id uuid, p_is_agent boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Admins only' using errcode = 'P0001';
  end if;
  if p_is_agent then
    update profiles set is_agent = true, agent_since = coalesce(agent_since, now()), agent_revoked = false where id = p_user_id;
  else
    update profiles set is_agent = false, agent_revoked = true where id = p_user_id;
  end if;
end;
$$;

-- Per-agent referral bonus; null goes back to the shared agent rate.
create or replace function public.set_agent_bonus(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Admins only' using errcode = 'P0001';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'Enter 0 or more' using errcode = 'P0001';
  end if;
  update profiles set agent_bonus_override = p_amount where id = p_user_id and is_agent;
end;
$$;

-- After an admin changes the number, promote everyone who already qualifies.
create or replace function public.evaluate_all_agents()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_before integer;
  v_after integer;
  r record;
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Admins only' using errcode = 'P0001';
  end if;
  select count(*) into v_before from profiles where is_agent;
  for r in
    select referred_by as uid from profiles
    where referred_by is not null and profile_completed
    group by referred_by
    having count(*) >= (select referrals_required from agent_settings where id = true)
  loop
    perform evaluate_agent(r.uid);
  end loop;
  select count(*) into v_after from profiles where is_agent;
  return v_after - v_before;
end;
$$;

-- Everyone who is an agent, plus everyone who has referred anybody (with progress).
create or replace function public.agent_overview()
returns table (
  user_id uuid, full_name text, photo_url text, is_agent boolean, agent_since timestamptz,
  qualified_count integer, pending_count integer, referral_points integer, bonus_override integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Admins only' using errcode = 'P0001';
  end if;
  return query
  select p.id, p.full_name, p.photo_url, p.is_agent, p.agent_since,
         (select count(*)::integer from profiles r where r.referred_by = p.id and r.profile_completed),
         (select count(*)::integer from profiles r where r.referred_by = p.id and not coalesce(r.profile_completed, false)),
         coalesce((select sum(l.amount)::integer from points_ledger l where l.user_id = p.id and l.reason = 'referral_bonus'), 0),
         p.agent_bonus_override
  from profiles p
  where p.is_agent or exists (select 1 from profiles r where r.referred_by = p.id)
  order by p.is_agent desc, 6 desc, p.agent_since nulls last
  limit 300;
end;
$$;

-- The signed-in member's own progress.
create or replace function public.my_referral_stats()
returns table (
  qualified_count integer, pending_count integer, referrals_required integer, agent_enabled boolean,
  is_agent boolean, my_bonus integer, base_bonus integer, welcome_bonus integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_is_agent boolean;
  v_override integer;
  v_base integer;
  v_agent_rate integer;
begin
  select p.is_agent, p.agent_bonus_override into v_is_agent, v_override from profiles p where p.id = auth.uid();
  select amount into v_base from points_rules where rule_key = 'referral_bonus';
  select amount into v_agent_rate from points_rules where rule_key = 'agent_referral_bonus';
  return query
  select (select count(*)::integer from profiles r where r.referred_by = auth.uid() and r.profile_completed),
         (select count(*)::integer from profiles r where r.referred_by = auth.uid() and not coalesce(r.profile_completed, false)),
         s.referrals_required,
         s.enabled,
         coalesce(v_is_agent, false),
         case when coalesce(v_is_agent, false) then coalesce(v_override, v_agent_rate, v_base, 50) else coalesce(v_base, 50) end,
         coalesce(v_base, 50),
         coalesce((select amount from points_rules where rule_key = 'referral_welcome_bonus'), 20)
  from agent_settings s where s.id = true;
end;
$$;

revoke all on function public.evaluate_agent(uuid) from public, anon, authenticated;
revoke all on function public.pay_referral_if_due(uuid) from public, anon, authenticated;
revoke all on function public.award_referral_on_profile_completed() from public, anon, authenticated;
revoke all on function public.set_agent(uuid, boolean) from public, anon;
revoke all on function public.set_agent_bonus(uuid, integer) from public, anon;
revoke all on function public.evaluate_all_agents() from public, anon;
revoke all on function public.agent_overview() from public, anon;
revoke all on function public.my_referral_stats() from public, anon;
grant execute on function public.set_agent(uuid, boolean) to authenticated;
grant execute on function public.set_agent_bonus(uuid, integer) to authenticated;
grant execute on function public.evaluate_all_agents() to authenticated;
grant execute on function public.agent_overview() to authenticated;
grant execute on function public.my_referral_stats() to authenticated;
