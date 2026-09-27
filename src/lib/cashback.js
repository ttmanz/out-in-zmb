import { supabase } from './supabase';

// Real-money cash back — a separate ledger/balance from points, see
// supabase/migrations/20260927000000_cashback.sql. Every row here is
// written server-side by a SECURITY DEFINER function; the app only reads.

export const CASHBACK_REASON_LABEL = {
  venue_spend: 'Cash back from a venue',
  cash_out_requested: 'Cash out requested',
  cash_out_rejected_refund: 'Cash out request declined — refunded',
};

export const getMyCashbackBalance = (userId) =>
  supabase.from('profiles').select('cashback_balance').eq('id', userId).single();

export const getMyCashbackHistory = (userId) =>
  supabase
    .from('cashback_ledger')
    .select('id, amount, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

export const getMyCashbackPayoutRequests = (userId) =>
  supabase
    .from('cashback_payout_requests')
    .select('id, amount, mobile_money_number, status, admin_note, requested_at, resolved_at')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false });

// Server-enforced — checks the balance atomically and debits it immediately
// so the same funds can't be requested twice while this is pending.
export const requestCashbackPayout = (amount, mobileMoneyNumber) =>
  supabase.rpc('request_cashback_payout', { p_amount: amount, p_mobile_money_number: mobileMoneyNumber });

// Venue-owner facing: reports a member's spend by their member code (the
// same code shown on their Invite Friends screen). The cash back amount is
// computed server-side from the live rate — the client never sets it.
export const reportCashbackSpend = (memberCode, spendAmount) =>
  supabase.rpc('report_cashback_spend', { p_member_code: memberCode, p_spend_amount: spendAmount });

export const getMyCashbackClaims = (venueOwnerId) =>
  supabase
    .from('cashback_claims')
    .select('id, spend_amount, cashback_amount, created_at, member:profiles!cashback_claims_user_id_fkey(full_name)')
    .eq('venue_owner_id', venueOwnerId)
    .order('created_at', { ascending: false })
    .limit(50);

export const getCashbackSettings = () =>
  supabase.from('cashback_settings').select('*').eq('id', true).single();

export const updateCashbackSettings = (percent, minSpend) =>
  supabase
    .from('cashback_settings')
    .update({ percent, min_spend: minSpend, updated_at: new Date().toISOString() })
    .eq('id', true);

// Admin-only board
export const getPendingCashbackPayoutRequests = () =>
  supabase
    .from('cashback_payout_requests')
    .select('id, user_id, amount, mobile_money_number, requested_at, member:profiles!cashback_payout_requests_user_id_fkey(full_name)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

export const getRecentCashbackPayoutRequests = (limit = 20) =>
  supabase
    .from('cashback_payout_requests')
    .select('id, user_id, amount, status, requested_at, resolved_at, member:profiles!cashback_payout_requests_user_id_fkey(full_name)')
    .neq('status', 'pending')
    .order('resolved_at', { ascending: false })
    .limit(limit);

export const resolveCashbackPayout = (requestId, approve, adminNote) =>
  supabase.rpc('resolve_cashback_payout', { p_request_id: requestId, p_approve: approve, p_admin_note: adminNote ?? null });

export const getRecentCashbackClaims = (limit = 30) =>
  supabase
    .from('cashback_claims')
    .select('id, spend_amount, cashback_amount, created_at, member:profiles!cashback_claims_user_id_fkey(full_name), venue:profiles!cashback_claims_venue_owner_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
