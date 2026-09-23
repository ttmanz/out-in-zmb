-- OAuth/Apple sign-in doesn't go through our own signUp() call, so it can't
-- carry a referral_code in raw_user_meta_data the way email signup does —
-- handle_new_user() always creates those profiles with referred_by null.
-- This RPC lets the client claim a referral right after a first-time
-- social login instead, with the same two rewards (+50 referrer, +20 new
-- member) as the email path. Self-guarding so it's safe to call from the
-- client: only succeeds once per profile (referred_by must still be null)
-- and only within 2 days of the profile's own creation, so it can't be
-- used to retroactively farm points on an old account or claimed twice.
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

  insert into points_ledger (user_id, amount, reason, reference_id)
  values (v_referrer_id, 50, 'referral_bonus', auth.uid());
  insert into points_ledger (user_id, amount, reason, reference_id)
  values (auth.uid(), 20, 'referral_welcome_bonus', auth.uid());
end;
$$;

grant execute on function public.claim_referral(text) to authenticated;
