-- Membership tiers (Free / Silver / Gold / Platinum) with an admin-editable
-- daily post limit per tier, plus server-enforced counting across every
-- content-creation table so the limit can't be bypassed by calling the API
-- directly.

create table public.membership_tiers (
  tier_key text primary key,
  label text not null,
  daily_post_limit integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.membership_tiers enable row level security;

create policy "read membership tiers"
  on public.membership_tiers for select
  using (true);

create policy "admins manage membership tiers"
  on public.membership_tiers for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));

insert into membership_tiers (tier_key, label, daily_post_limit, sort_order) values
  ('free', 'Free', 20, 0),
  ('silver', 'Silver', 50, 1),
  ('gold', 'Gold', 150, 2),
  ('platinum', 'Platinum', null, 3);

-- Tier × duration: each paid tier gets its own Monthly / 6-Month / Annual
-- plan row, each with its own price and RevenueCat product id (set by the
-- admin via the existing plan-editing screen). Free has no plan row — it's
-- the default state when a profile has no active paid plan.
alter table public.subscription_plans add column tier_key text references public.membership_tiers(tier_key);

insert into subscription_plans (id, tier_key, label, price_display, duration_months, sort_order) values
  ('silver_monthly',   'silver',   'Silver Monthly',    '', 1,  11),
  ('silver_sixmonth',  'silver',   'Silver 6-Month',    '', 6,  12),
  ('silver_annual',    'silver',   'Silver Annual',     '', 12, 13),
  ('gold_monthly',     'gold',     'Gold Monthly',      '', 1,  21),
  ('gold_sixmonth',    'gold',     'Gold 6-Month',      '', 6,  22),
  ('gold_annual',      'gold',     'Gold Annual',       '', 12, 23),
  ('platinum_monthly', 'platinum', 'Platinum Monthly',  '', 1,  31),
  ('platinum_sixmonth','platinum', 'Platinum 6-Month',  '', 6,  32),
  ('platinum_annual',  'platinum', 'Platinum Annual',   '', 12, 33)
on conflict (id) do nothing;

-- Running count of posts made today per user, incremented by the trigger
-- below. Read-only to clients — only the SECURITY DEFINER trigger writes it.
create table public.daily_post_counts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_date date not null,
  count integer not null default 0,
  primary key (user_id, post_date)
);

alter table public.daily_post_counts enable row level security;

create policy "read own daily post count"
  on public.daily_post_counts for select
  using (auth.uid() = user_id);

-- Applied as a BEFORE INSERT trigger to every content-creation table.
-- TG_ARGV[0] names which column on that table holds the author's user id
-- (most use user_id; events/activity_events use created_by), read via
-- to_jsonb(NEW) since plpgsql can't reference a dynamic column directly.
create or replace function public.enforce_daily_post_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_author_id uuid;
  v_bypass boolean;
  v_limit integer;
  v_count integer;
begin
  v_author_id := (to_jsonb(new) ->> TG_ARGV[0])::uuid;

  select (is_admin or is_staff) into v_bypass from profiles where id = v_author_id;
  if v_bypass then
    return new;
  end if;

  select mt.daily_post_limit into v_limit
  from profiles p
  left join subscription_plans sp on sp.id = p.subscription_plan and p.subscription_expires_at > now()
  left join membership_tiers mt on mt.tier_key = coalesce(sp.tier_key, 'free')
  where p.id = v_author_id;

  if v_limit is null then
    return new;
  end if;

  select coalesce(count, 0) into v_count
  from daily_post_counts
  where user_id = v_author_id and post_date = current_date;

  if v_count >= v_limit then
    raise exception 'Daily post limit reached (%/% today)', v_count, v_limit using errcode = 'P0001';
  end if;

  insert into daily_post_counts (user_id, post_date, count)
  values (v_author_id, current_date, 1)
  on conflict (user_id, post_date) do update set count = daily_post_counts.count + 1;

  return new;
end;
$$;

create trigger enforce_post_limit before insert on public.stories for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.happenings for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.spur_posts for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.open_chat_posts for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.club_posts for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.group_posts for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.market_listings for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.daily_clips for each row execute function public.enforce_daily_post_limit('user_id');
create trigger enforce_post_limit before insert on public.events for each row execute function public.enforce_daily_post_limit('created_by');
create trigger enforce_post_limit before insert on public.activity_events for each row execute function public.enforce_daily_post_limit('created_by');
