-- Referral program: every member gets a short shareable code. A new signup
-- can optionally enter a friend's code (typed by hand, same trust level as
-- the existing venue voucher codes — no deferred deep linking in v1), which
-- links the new profile via referred_by and awards points to both sides
-- the moment the account is created: +50 to the referrer, +20 to the new
-- member. This is the growth lever the points system didn't have yet.

alter table public.profiles add column referral_code text;
alter table public.profiles add column referred_by uuid references public.profiles(id);

create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end;
$$;

-- Backfill existing profiles before the column becomes required.
update public.profiles set referral_code = generate_referral_code() where referral_code is null;

alter table public.profiles alter column referral_code set not null;
alter table public.profiles add constraint profiles_referral_code_unique unique (referral_code);

create index profiles_referred_by_idx on public.profiles (referred_by);

-- Superseded: was insert-only (full_name). Now also assigns a fresh
-- referral_code to every new profile and, if raw_user_meta_data carries a
-- referral_code entered at signup, resolves it to the referrer and awards
-- both sides. A self-referral is structurally impossible here — the new
-- row doesn't exist in profiles yet when the lookup runs, so a code can
-- never resolve to the signup in progress.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_referrer_id uuid;
  v_input_code text;
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
    insert into public.points_ledger (user_id, amount, reason, reference_id)
    values (v_referrer_id, 50, 'referral_bonus', new.id);
    insert into public.points_ledger (user_id, amount, reason, reference_id)
    values (new.id, 20, 'referral_welcome_bonus', new.id);
  end if;

  return new;
end;
$$;
