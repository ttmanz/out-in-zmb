import { supabase } from './supabase';

// Every profile gets one at signup — see generate_referral_code() /
// handle_new_user() in supabase/migrations/20260925000000_referrals.sql.
export const getMyReferralCode = (userId) =>
  supabase.from('profiles').select('referral_code').eq('id', userId).single();

export const getMyReferrals = (userId) =>
  supabase
    .from('profiles')
    .select('id, full_name, photo_url, created_at')
    .eq('referred_by', userId)
    .order('created_at', { ascending: false });

// For Google/Apple sign-in, which doesn't go through signUp() and so can't
// carry a referral_code in the new profile the way email signup does — see
// claim_referral() in supabase/migrations/20260925010000_oauth_referral_claim.sql.
// Self-guarding server-side (once per profile, only within 2 days of
// signup), so it's safe to call speculatively after any first social login.
export const claimReferral = (code) =>
  supabase.rpc('claim_referral', { p_code: code });
