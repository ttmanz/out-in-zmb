import { supabase } from './supabase';

export const getSubscriptionPlans = () =>
  supabase
    .from('subscription_plans')
    .select('id, tier_key, label, price_display, venue_price_display, duration_months, badge, description, sort_order, revenuecat_product_id, venue_revenuecat_product_id')
    .eq('is_active', true)
    .order('sort_order');

// Admin-only: includes the RevenueCat product ids, not needed on the public-facing screen
export const getAllSubscriptionPlans = () =>
  supabase
    .from('subscription_plans')
    .select('id, tier_key, label, price_display, venue_price_display, duration_months, badge, description, sort_order, revenuecat_product_id, venue_revenuecat_product_id')
    .order('sort_order');

// Membership tiers (Free/Silver/Gold/Platinum) — each carries the daily
// post limit enforced server-side by the enforce_daily_post_limit trigger.
export const getMembershipTiers = () =>
  supabase.from('membership_tiers').select('*').order('sort_order');

// Admin-only: RLS restricts this to profiles.is_admin = true
export const updateMembershipTier = (tierKey, fields) =>
  supabase.from('membership_tiers').update(fields).eq('tier_key', tierKey);

// How many posts this member has made today, against their tier's limit —
// for display only; the real cap is enforced by the DB trigger.
export const getMyTodayPostCount = (userId) =>
  supabase
    .from('daily_post_counts')
    .select('count')
    .eq('user_id', userId)
    .eq('post_date', new Date().toISOString().slice(0, 10))
    .maybeSingle();

// A venue owner sees their own price where the admin has set one;
// otherwise everyone sees the regular member price.
export const planPriceFor = (plan, profile) =>
  (profile?.account_type === 'venue_owner' && plan.venue_price_display)
    ? plan.venue_price_display
    : plan.price_display;

export const updateSubscriptionPlan = (id, fields) =>
  supabase.from('subscription_plans').update(fields).eq('id', id);

// Subscription state is no longer client-writable — a DB trigger rejects
// any client update to profiles.subscription_plan/subscription_expires_at.
// It's set exclusively by the revenuecat-webhook Edge Function once
// RevenueCat confirms a real purchase.

export const getMyFeatureUnlocks = (userId) =>
  supabase.from('user_feature_unlocks').select('feature_key').eq('user_id', userId);

export const getSubscriptionSettings = () =>
  supabase.from('subscription_settings').select('*').eq('id', 'global').single();

// Admin-only: RLS restricts this to profiles.is_admin = true
export const updateSubscriptionSettings = (fields) =>
  supabase.from('subscription_settings').update(fields).eq('id', 'global');

export const getFeatureAccess = () =>
  supabase.from('feature_access').select('*').order('label');

// Progressive rollout: a feature row with enabled = false is hidden app-wide.
// Missing row / missing flag ⇒ treated as enabled.
export const isFeatureEnabled = (featureKey, featureMap) =>
  featureMap?.[featureKey]?.enabled !== false;

// Admin-only: RLS restricts this to profiles.is_admin = true
export const updateFeatureAccess = (featureKey, fields) =>
  supabase.from('feature_access').update(fields).eq('feature_key', featureKey);

const hasActivePlan = (profile) => {
  if (!profile?.subscription_plan || !profile?.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at) > new Date();
};

// Under 'free_except_venue' mode only: venue accounts get a trial window
// from signup (timed off profiles.created_at, since there's no separate
// trial-start column), then need an active subscription for the whole app.
const VENUE_TRIAL_DAYS = 30;
const isBypassRole = (profile) => profile?.is_staff || profile?.is_admin;

const venueDaysLeftInTrial = (profile) => {
  if (!profile?.created_at) return 0;
  const trialEnd = new Date(profile.created_at).getTime() + VENUE_TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24)));
};

const isVenueLocked = (profile) =>
  profile?.account_type === 'venue_owner'
  && !hasActivePlan(profile)
  && venueDaysLeftInTrial(profile) <= 0;

// Resolves whether a member can currently post/write to a given feature,
// given the global subscription mode + that feature's paid flag.
//
// - 'free': everyone has full access everywhere.
// - 'free_except': everyone has full access, except the features on the
//   paid list, which cost their one-off price unless subscribed. Any
//   active subscription (any account type) fully bypasses this.
// - 'free_until': full access for everyone until the date. Once it passes,
//   any active subscription (any plan, any tier) is the sole requirement
//   for everything — no subscription, no posting anywhere, full stop.
//   The per-feature paid list does not apply in this mode.
// - 'free_except_venue': members have full free access, same as 'free'.
//   Venue accounts (account_type = 'venue_owner') get a 30-day trial from
//   signup, then need an active subscription for the whole app.
export const canAccessFeature = (featureKey, { profile, settings, featureMap, unlockedFeatureKeys }) => {
  // Admin-disabled feature: hidden for everyone, staff/admin included.
  if (featureMap?.[featureKey]?.enabled === false) return { allowed: false, disabled: true };

  if (isBypassRole(profile)) return { allowed: true };

  const mode = settings?.mode ?? 'free';

  if (mode === 'free_except_venue') {
    if (profile?.account_type !== 'venue_owner') return { allowed: true };
    return isVenueLocked(profile) ? { allowed: false, venueLocked: true } : { allowed: true };
  }

  if (mode === 'free') return { allowed: true };

  if (mode === 'free_until') {
    const stillFree = settings?.free_until && new Date(settings.free_until) > new Date();
    if (stillFree) return { allowed: true };
    return hasActivePlan(profile) ? { allowed: true } : { allowed: false };
  }

  // mode === 'free_except' — any active subscription bypasses the paid list entirely
  if (hasActivePlan(profile)) return { allowed: true };
  const feature = featureMap?.[featureKey];
  if (!feature?.is_paid) return { allowed: true };
  if (unlockedFeatureKeys?.has(featureKey)) return { allowed: true };
  return { allowed: false, featureKey, price: feature.one_off_price };
};

export const subscriptionStatus = (profile, settings) => {
  if (isBypassRole(profile)) return { hasAccess: true, isOnTrial: false, isActive: true, daysLeft: 0, planId: 'staff' };

  const plan = profile?.subscription_plan;
  const expires = profile?.subscription_expires_at;
  const activePlan = hasActivePlan(profile);
  const activeDaysLeft = activePlan
    ? Math.max(0, Math.ceil((new Date(expires) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  const mode = settings?.mode ?? 'free';
  if (mode === 'free_except_venue' && profile?.account_type === 'venue_owner') {
    if (activePlan) return { hasAccess: true, isOnTrial: false, isActive: true, daysLeft: activeDaysLeft, planId: plan };
    const trialDaysLeft = venueDaysLeftInTrial(profile);
    if (trialDaysLeft > 0) return { hasAccess: true, isOnTrial: true, isActive: false, daysLeft: trialDaysLeft, planId: null };
    return { hasAccess: false, isOnTrial: false, isActive: false, daysLeft: 0, planId: null };
  }

  // Everyone else: v1 free rollout — full access either way, this just
  // reports plan status for display (e.g. "Current Plan" badge if they
  // happen to have one).
  if (activePlan) return { hasAccess: true, isOnTrial: false, isActive: true, daysLeft: activeDaysLeft, planId: plan };
  return { hasAccess: true, isOnTrial: false, isActive: false, daysLeft: 0, planId: null };
};
