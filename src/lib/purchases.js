import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

let configured = false;

// Called once a session is confirmed (UserContext.refreshProfile) so
// RevenueCat's customer record maps 1:1 to our own Supabase user id.
export const configurePurchases = (userId) => {
  if (!API_KEY || configured) return;
  Purchases.configure({ apiKey: API_KEY, appUserID: userId });
  configured = true;
};

export const logOutPurchases = async () => {
  if (!configured) return;
  await Purchases.logOut();
  configured = false;
};

// Members and venue owners are offered different prices for the same
// subscription tiers — see canAccessFeature's venue-owner comment in
// subscription.js. Two RevenueCat Offerings hold the same 3 durations
// (monthly/sixMonth/annual) at each price point.
export const getOfferings = async (accountType) => {
  const offerings = await Purchases.getOfferings();
  const key = accountType === 'venue_owner' ? 'venue_owner' : 'default';
  return offerings.all[key] ?? offerings.current;
};

export const purchasePackage = (pkg) => Purchases.purchasePackage(pkg);

export const restorePurchases = () => Purchases.restorePurchases();
