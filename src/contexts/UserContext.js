import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { getSession, onAuthStateChange, signOut } from '../lib/auth';
import { getProfile } from '../lib/profile';
import { subscriptionStatus, getSubscriptionSettings, getSubscriptionPlans, getFeatureAccess, canAccessFeature, isFeatureEnabled, resolveTierKey, venueAccessStatus } from '../lib/subscription';
import { configurePurchases } from '../lib/purchases';
import { registerForPushNotificationsAsync } from '../lib/pushNotifications';

const UserContext = createContext({
  profile: null,
  refreshProfile: () => {},
  hasAccess: true,
  canAccessFeature: () => ({ allowed: true }),
  isFeatureEnabled: () => true,
  venueAccess: { applies: false, locked: false, inTrial: false, subscribed: false, trialDaysLeft: 0 },
  isVenuePlan: false,
});

export const UserProvider = ({ children }) => {
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [monthlyPlan, setMonthlyPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const [featureMap, setFeatureMap] = useState({});

  // Level plans + per-feature on/off flags — small, admin-edited tables,
  // loaded once and re-checked alongside the profile.
  const refreshAccessConfig = useCallback(async () => {
    const [{ data: settingsData }, { data: plansData }, { data: featuresData }] = await Promise.all([
      getSubscriptionSettings(),
      getSubscriptionPlans(),
      getFeatureAccess(),
    ]);
    setSettings(settingsData ?? null);
    setPlans(plansData ?? []);
    setMonthlyPlan((plansData ?? []).find((p) => p.id === 'monthly') ?? null);
    const map = {};
    (featuresData ?? []).forEach((f) => { map[f.feature_key] = f; });
    setFeatureMap(map);
  }, []);

  // Checked on every auth state change (fresh login, token refresh, app
  // foreground) — not just at the login screen — so a member who gets
  // disabled/banned mid-session is kicked out the next time the app
  // re-checks their session, not only on their next email login.
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await getSession();
    if (!session) { setProfile(null); return; }
    const { data } = await getProfile(session.user.id);
    if (data?.status === 'disabled' || data?.status === 'banned') {
      await signOut();
      setProfile(null);
      Alert.alert('Account Disabled', 'Your account has been disabled. Please contact support.');
      return;
    }
    setProfile(data ?? null);
    configurePurchases(session.user.id);
    registerForPushNotificationsAsync(session.user.id);
    refreshAccessConfig();
  }, [refreshAccessConfig]);

  // Load on mount and again on every auth change (fresh login, token refresh),
  // so profile-derived state never stays stale for the whole session
  useEffect(() => {
    refreshProfile();
    refreshAccessConfig();
    const { data: { subscription } } = onAuthStateChange(() => refreshProfile());
    return () => subscription.unsubscribe();
  }, [refreshProfile, refreshAccessConfig]);

  // Lightweight re-pull of just the access config (level plans + feature
  // flags) — called after an admin edits it in Admin → Access so the change
  // lands app-wide without waiting for the next auth refresh.
  const refreshFeatureConfig = useCallback(() => refreshAccessConfig(), [refreshAccessConfig]);

  const { hasAccess } = subscriptionStatus(profile);
  const myTier = resolveTierKey(profile, plans);
  const venueAccess = venueAccessStatus(profile, settings);
  const isVenuePlan = settings?.mode === 'venue_plan';

  const checkFeature = useCallback(
    (featureKey) => canAccessFeature(featureKey, { featureMap }),
    [featureMap]
  );

  const checkFeatureEnabled = useCallback(
    (featureKey) => isFeatureEnabled(featureKey, featureMap),
    [featureMap]
  );

  return (
    <UserContext.Provider value={{ profile, refreshProfile, refreshFeatureConfig, hasAccess, canAccessFeature: checkFeature, isFeatureEnabled: checkFeatureEnabled, settings, monthlyPlan, plans, myTier, venueAccess, isVenuePlan }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
