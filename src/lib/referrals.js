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
