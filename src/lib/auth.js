import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { logOutPurchases } from './purchases';
import { unregisterPushToken } from './pushNotifications';

WebBrowser.maybeCompleteAuthSession();

// Deep-link redirect for OAuth — add this URL to Supabase Dashboard →
// Authentication → URL Configuration → Redirect URLs
// Production:  outandaround://auth
// Development: run the app and check the console log below
const redirectTo = makeRedirectUri({ scheme: 'outandaround', path: 'auth' });

const oauthSignIn = async (provider) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { error: error ?? new Error('No OAuth URL') };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { error: null }; // user cancelled

  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error) return { error: new Error(queryParams.error_description || queryParams.error) };
  if (!queryParams?.code) return { error: new Error('No auth code returned') };

  return supabase.auth.exchangeCodeForSession(queryParams.code);
};

export const signInWithEmail = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUpWithEmail = (email, password, fullName, referralCode) =>
  supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, referral_code: referralCode?.trim() || undefined } },
  });

export const signInWithGoogle = () => oauthSignIn('google');

// Native Sign in with Apple — verifies the identity token's signature
// against Apple's public keys directly, no browser redirect or
// Services ID/client-secret needed (that's only required for the
// classic web OAuth code-exchange flow).
export const signInWithApple = async () => {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return { error: new Error('No identity token returned') };
    return supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  } catch (e) {
    if (e.code === 'ERR_REQUEST_CANCELED') return { error: null };
    return { error: e };
  }
};

// Logged out of RevenueCat first so a shared/reused device never keeps the
// previous account's purchases attached to the next login.
export const signOut = async () => {
  await unregisterPushToken();
  await logOutPurchases();
  return supabase.auth.signOut();
};

// Permanently erase the caller's account: media, content (via FK cascades)
// and the auth user itself — done server-side because deleting an auth user
// needs the service role key. Signs out locally afterwards, which flips the
// app back to the auth stack via onAuthStateChange.
export const deleteAccount = async () => {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) return { error };
  if (!data?.deleted) return { error: new Error(data?.error ?? 'Account deletion failed') };
  await unregisterPushToken();
  await logOutPurchases();
  await supabase.auth.signOut();
  return { error: null };
};

export const getSession = () => supabase.auth.getSession();

export const onAuthStateChange = (callback) =>
  supabase.auth.onAuthStateChange(callback);
