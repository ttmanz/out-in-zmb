-- Every points amount so far was hardcoded into its trigger function (or,
-- for subscribers, into the revenuecat-webhook edge function) — changing
-- any of them meant a new migration. This makes them admin-editable: one
-- flat rule_key -> amount table, read live by every earn trigger instead
-- of a literal constant. Each lookup still falls back to today's value via
-- coalesce, so a missing/deleted rule row degrades safely rather than
-- breaking the award.

create table public.points_rules (
  rule_key text primary key,
  label text not null,
  amount integer not null,
  updated_at timestamptz not null default now()
);

alter table public.points_rules enable row level security;

create policy "read points rules"
  on public.points_rules for select
  using (true);

create policy "admins manage points rules"
  on public.points_rules for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

insert into points_rules (rule_key, label, amount) values
  ('at_venue_checkin', 'Daily venue check-in', 10),
  ('clip_posted', 'Posting a Clip of the Day', 10),
  ('clip_approved_bonus', 'Clip approved by admin', 50),
  ('referral_bonus', 'Referrer bonus, per signup', 50),
  ('referral_welcome_bonus', 'New member welcome bonus', 20),
  ('profile_completion_bonus', 'Completing your profile', 20),
  ('subscription_reward_silver', 'Silver subscriber reward, per month', 20),
  ('subscription_reward_gold', 'Gold subscriber reward, per month', 50),
  ('subscription_reward_platinum', 'Platinum subscriber reward, per month', 100);

-- Re-point every existing earn trigger at points_rules instead of a literal.

create or replace function public.award_checkin_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_amount integer;
begin
  if not exists (
    select 1 from points_ledger
    where user_id = new.user_id
      and reason = 'at_venue_checkin'
      and created_at::date = now()::date
  ) then
    select amount into v_amount from points_rules where rule_key = 'at_venue_checkin';
    insert into points_ledger (user_id, amount, reason)
    values (new.user_id, coalesce(v_amount, 10), 'at_venue_checkin');
  end if;
  return new;
end;
$$;

create or replace function public.award_clip_post_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_amount integer;
begin
  select amount into v_amount from points_rules where rule_key = 'clip_posted';
  insert into points_ledger (user_id, amount, reason, reference_id)
  values (new.user_id, coalesce(v_amount, 10), 'clip_posted', new.id);
  return new;
end;
$$;

create or replace function public.award_clip_approved_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_amount integer;
begin
  if new.is_approved and not coalesce(old.is_approved, false) then
    if not exists (
      select 1 from points_ledger where reference_id = new.id and reason = 'clip_approved_bonus'
    ) then
      select amount into v_amount from points_rules where rule_key = 'clip_approved_bonus';
      insert into points_ledger (user_id, amount, reason, reference_id)
      values (new.user_id, coalesce(v_amount, 50), 'clip_approved_bonus', new.id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.award_profile_completion_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_amount integer;
begin
  if new.profile_completed and not coalesce(old.profile_completed, false) then
    if not exists (
      select 1 from points_ledger where user_id = new.id and reason = 'profile_completion_bonus'
    ) then
      select amount into v_amount from points_rules where rule_key = 'profile_completion_bonus';
      insert into points_ledger (user_id, amount, reason)
      values (new.id, coalesce(v_amount, 20), 'profile_completion_bonus');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_referrer_id uuid;
  v_input_code text;
  v_referrer_amount integer;
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
    select amount into v_referrer_amount from points_rules where rule_key = 'referral_bonus';
    select amount into v_welcome_amount from points_rules where rule_key = 'referral_welcome_bonus';
    insert into public.points_ledger (user_id, amount, reason, reference_id)
    values (v_referrer_id, coalesce(v_referrer_amount, 50), 'referral_bonus', new.id);
    insert into public.points_ledger (user_id, amount, reason, reference_id)
    values (new.id, coalesce(v_welcome_amount, 20), 'referral_welcome_bonus', new.id);
  end if;

  return new;
end;
$$;

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
  v_referrer_amount integer;
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

  select amount into v_referrer_amount from points_rules where rule_key = 'referral_bonus';
  select amount into v_welcome_amount from points_rules where rule_key = 'referral_welcome_bonus';
  insert into points_ledger (user_id, amount, reason, reference_id)
  values (v_referrer_id, coalesce(v_referrer_amount, 50), 'referral_bonus', auth.uid());
  insert into points_ledger (user_id, amount, reason, reference_id)
  values (auth.uid(), coalesce(v_welcome_amount, 20), 'referral_welcome_bonus', auth.uid());
end;
$$;
