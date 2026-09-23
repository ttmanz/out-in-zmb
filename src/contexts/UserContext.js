import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { getSession, onAuthStateChange, signOut } from '../lib/auth';
import { getProfile } from '../lib/profile';
import { subscriptionStatus, getSubscriptionSettings, getSubscriptionPlans, getFeatureAccess, getMyFeatureUnlocks, canAccessFeature, isFeatureEnabled, resolveTierKey } from '../lib/subscription';
import { configurePurchases } from '../lib/purchases';
import { registerForPushNotificationsAsync } from '../lib/pushNotifications';

const UserContext = createContext({
  profile: null,
  refreshProfile: () => {},
  hasAccess: true,
  canAccessFeature: () => ({ allowed: true }),
  isFeatureEnabled: () => true,
});

export const UserProvider = ({ children }) => {
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [monthlyPlan, setMonthlyPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const [featureMap, setFeatureMap] = useState({});
  const [unlockedFeatureKeys, setUnlockedFeatureKeys] = useState(new Set());

  // Global subscription mode + per-feature paid list — small, admin-edited
  // tables, loaded once and re-checked alongside the profile.
  const refreshAccessConfig = useCallback(async (userId) => {
    const [{ data: settingsData }, { data: plansData }, { data: featuresData }, { data: unlocksData }] = await Promise.all([
      getSubscriptionSettings(),
      getSubscriptionPlans(),
      getFeatureAccess(),
      userId ? getMyFeatureUnlocks(userId) : Promise.resolve({ data: [] }),
    ]);
    setSettings(settingsData ?? null);
    setPlans(plansData ?? []);
    setMonthlyPlan((plansData ?? []).find((p) => p.id === 'monthly') ?? null);
    const map = {};
    (featuresData ?? []).forEach((f) => { map[f.feature_key] = f; });
    setFeatureMap(map);
    setUnlockedFeatureKeys(new Set((unlocksData ?? []).map((u) => u.feature_key)));
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
    refreshAccessConfig(session.user.id);
  }, [refreshAccessConfig]);

  // Load on mount and again on every auth change (fresh login, token refresh),
  // so profile-derived state never stays stale for the whole session
  useEffect(() => {
    refreshProfile();
    refreshAccessConfig();
    const { data: { subscription } } = onAuthStateChange(() => refreshProfile());
    return () => subscription.unsubscribe();
  }, [refreshProfile, refreshAccessConfig]);

  // Lightweight re-pull of just the access config (subscription mode + feature
  // flags) — called after an admin edits it in Admin → Access so the change
  // lands app-wide without waiting for the next auth refresh.
  const refreshFeatureConfig = useCallback(() => refreshAccessConfig(), [refreshAccessConfig]);

  const { hasAccess } = subscriptionStatus(profile, settings);
  const myTier = resolveTierKey(profile, plans);

  const checkFeature = useCallback(
    (featureKey) => canAccessFeature(featureKey, { profile, settings, featureMap, unlockedFeatureKeys, plans }),
    [profile, settings, featureMap, unlockedFeatureKeys, plans]
  );

  const checkFeatureEnabled = useCallback(
    (featureKey) => isFeatureEnabled(featureKey, featureMap),
    [featureMap]
  );

  return (
    <UserContext.Provider value={{ profile, refreshProfile, refreshFeatureConfig, hasAccess, canAccessFeature: checkFeature, isFeatureEnabled: checkFeatureEnabled, settings, monthlyPlan, plans, myTier }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
