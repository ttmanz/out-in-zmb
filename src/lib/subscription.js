import { supabase } from './supabase';

export const getSubscriptionPlans = () =>
  supabase
    .from('subscription_plans')
    .select('id, tier_key, label, price_display, venue_price_display, duration_months, badge, description, sort_order, revenuecat_product_id, venue_revenuecat_product_id, audience, venue_available')
    .eq('is_active', true)
    .order('sort_order');

// Admin-only: includes the RevenueCat product ids, not needed on the public-facing screen
export const getAllSubscriptionPlans = () =>
  supabase
    .from('subscription_plans')
    .select('id, tier_key, label, price_display, venue_price_display, duration_months, badge, description, sort_order, revenuecat_product_id, venue_revenuecat_product_id, audience, venue_available')
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

// Mirrors the tier resolution the enforce_daily_post_limit() DB trigger
// already does: the active plan's tier if one exists and hasn't expired,
// otherwise 'free'. Under 'levels' mode this is what the post-limit
// trigger keys off of; there's no separate per-feature gate on top of it.
export const resolveTierKey = (profile, plans) => {
  if (!hasActivePlan(profile)) return 'free';
  const plan = plans?.find((p) => p.id === profile.subscription_plan);
  return plan?.tier_key ?? 'free';
};

const isBypassRole = (profile) => profile?.is_staff || profile?.is_admin;

// Membership is "Levels" only: every member has full access to every feature,
// and the only thing that differs by tier is the daily post limit (enforced by
// the enforce_daily_post_limit() DB trigger, independent of this function).
// The only way a feature can be unavailable is an admin switching it off.
export const canAccessFeature = (featureKey, { featureMap }) => {
  if (featureMap?.[featureKey]?.enabled === false) return { allowed: false, disabled: true };
  return { allowed: true };
};

// Display only: whether the member currently has a paid level, and for how long.
export const subscriptionStatus = (profile) => {
  if (isBypassRole(profile)) return { hasAccess: true, isActive: true, daysLeft: 0, planId: 'staff' };
  if (hasActivePlan(profile)) {
    const daysLeft = Math.max(0, Math.ceil((new Date(profile.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24)));
    return { hasAccess: true, isActive: true, daysLeft, planId: profile.subscription_plan };
  }
  return { hasAccess: true, isActive: false, daysLeft: 0, planId: null };
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Venue Plan mode: members are free, with no levels. A venue account has a free
// trial (settings.venue_trial_days from signup, editable by an admin) and then
// needs a paid venue plan to use the venue tools. This mirrors venue_has_access()
// in the database, which is what actually enforces it — this is for the screens.
export const venueAccessStatus = (profile, settings) => {
  const none = { applies: false, locked: false, inTrial: false, subscribed: false, trialDaysLeft: 0 };
  if (settings?.mode !== 'venue_plan' || profile?.account_type !== 'venue_owner' || isBypassRole(profile)) return none;
  if (hasActivePlan(profile)) return { applies: true, locked: false, inTrial: false, subscribed: true, trialDaysLeft: 0 };
  const trialDays = settings?.venue_trial_days ?? 30;
  const trialEnd = new Date(profile.created_at).getTime() + trialDays * DAY_MS;
  const trialDaysLeft = Math.max(0, Math.ceil((trialEnd - Date.now()) / DAY_MS));
  return { applies: true, locked: trialDaysLeft <= 0, inTrial: trialDaysLeft > 0, subscribed: false, trialDaysLeft };
};
