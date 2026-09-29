import { supabase } from './supabase';

// Cash back and store credit. A member photographs a receipt and submits a
// claim; nothing is credited until the venue confirms it. Cash goes to the
// member's cash back balance (paid out via Mobile Money); store credit is
// spendable only at the venue that issued it. Everything is written by
// SECURITY DEFINER functions — see
// supabase/migrations/20260929000000_cashback_receipts_credits.sql. The app
// only reads, and calls those functions.

export const formatZmw = (amount) => `K${Number(amount ?? 0).toFixed(2)}`;

export const CASHBACK_REASON_LABEL = {
  venue_spend: 'Cash back from a venue',
  cash_out_requested: 'Cash out requested',
  cash_out_rejected_refund: 'Cash out request declined — refunded',
};

export const CLAIM_STATUS_LABEL = {
  pending: 'Waiting for venue',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const REWARD_LABEL = { cash: 'cash back', credit: 'store credit', discount: 'discount' };

// --- Member: cash balance and payouts ---

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

// --- Member: receipts ---

// Venues currently offering cash back, store credit and/or a bill discount,
// with the percentages a member would actually get.
export const getCashbackVenues = () => supabase.rpc('list_cashback_venues');

// receiptPath may be null for a discount, which is applied at the till.
export const submitCashbackClaim = (venueOwnerId, spendAmount, receiptPath, rewardType) =>
  supabase.rpc('submit_cashback_claim', {
    p_venue_owner_id: venueOwnerId,
    p_spend_amount: spendAmount,
    p_receipt_path: receiptPath,
    p_reward_type: rewardType,
  });

export const cancelCashbackClaim = (claimId) =>
  supabase.rpc('cancel_cashback_claim', { p_claim_id: claimId });

export const getMyCashbackClaims = (userId) =>
  supabase
    .from('cashback_claims')
    .select('id, spend_amount, cashback_amount, reward_type, status, created_at, venue:profiles!cashback_claims_venue_owner_id_fkey(full_name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

// --- Member: store credit ---

export const getMyVenueCredits = () => supabase.rpc('my_venue_credits');

export const requestCreditRedemption = (venueOwnerId, amount) =>
  supabase.rpc('request_credit_redemption', { p_venue_owner_id: venueOwnerId, p_amount: amount });

export const cancelCreditRedemption = (redemptionId) =>
  supabase.rpc('cancel_credit_redemption', { p_redemption_id: redemptionId });

export const getMyPendingCreditRedemptions = (userId) =>
  supabase
    .from('venue_credit_redemptions')
    .select('id, amount, created_at, venue:profiles!venue_credit_redemptions_venue_owner_id_fkey(full_name)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

// --- Venue owner ---

// Venues start unapproved: they can set an offer, but aren't listed to
// customers and can't confirm anything until an admin approves them.
export const getMyVenueApproval = (venueOwnerId) =>
  supabase.from('profiles').select('venue_approved').eq('id', venueOwnerId).single();

export const getMyVenueOffer = (venueOwnerId) =>
  supabase.from('venue_cashback_offers').select('cash_percent, credit_percent, discount_percent').eq('venue_owner_id', venueOwnerId).maybeSingle();

export const setVenueCashbackOffer = (cashPercent, creditPercent, discountPercent) =>
  supabase.rpc('set_venue_cashback_offer', {
    p_cash_percent: cashPercent,
    p_credit_percent: creditPercent,
    p_discount_percent: discountPercent,
  });

export const getVenueClaims = (venueOwnerId) =>
  supabase
    .from('cashback_claims')
    .select('id, spend_amount, cashback_amount, reward_type, status, receipt_path, created_at, member:profiles!cashback_claims_user_id_fkey(full_name)')
    .eq('venue_owner_id', venueOwnerId)
    .order('created_at', { ascending: false })
    .limit(50);

export const resolveCashbackClaim = (claimId, approve) =>
  supabase.rpc('resolve_cashback_claim', { p_claim_id: claimId, p_approve: approve });

export const getVenuePendingRedemptions = (venueOwnerId) =>
  supabase
    .from('venue_credit_redemptions')
    .select('id, amount, created_at, member:profiles!venue_credit_redemptions_user_id_fkey(full_name)')
    .eq('venue_owner_id', venueOwnerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

export const resolveCreditRedemption = (redemptionId, approve) =>
  supabase.rpc('resolve_credit_redemption', { p_redemption_id: redemptionId, p_approve: approve });

// What this venue currently owes its customers in store credit.
export const getVenueCreditOutstanding = () => supabase.rpc('venue_credit_outstanding');

// --- Admin ---

// Every venue account, unapproved ones first, with enough detail to vet them.
export const getVenueOwners = () =>
  supabase
    .from('profiles')
    .select('id, full_name, city, phone, instagram, venue_approved, created_at')
    .eq('account_type', 'venue_owner')
    .order('venue_approved', { ascending: true })
    .order('created_at', { ascending: false });

export const setVenueApproved = (venueOwnerId, approved) =>
  supabase.rpc('set_venue_approved', { p_venue_owner_id: venueOwnerId, p_approved: approved });

export const getCashbackSettings = () =>
  supabase.from('cashback_settings').select('*').eq('id', true).single();

export const updateCashbackSettings = (maxCashPercent, minSpend) =>
  supabase
    .from('cashback_settings')
    .update({ max_cash_percent: maxCashPercent, min_spend: minSpend, updated_at: new Date().toISOString() })
    .eq('id', true);

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
    .select('id, spend_amount, cashback_amount, reward_type, status, created_at, member:profiles!cashback_claims_user_id_fkey(full_name), venue:profiles!cashback_claims_venue_owner_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
