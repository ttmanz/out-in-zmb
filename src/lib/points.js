import { supabase } from './supabase';

// Every row here is written server-side by a trigger — see
// supabase/migrations/20260917000000_points_ledger.sql. The app only reads.

export const REASON_LABEL = {
  at_venue_checkin: 'Checked in at a venue',
};

export const getMyPointsBalance = (userId) =>
  supabase.from('profiles').select('points_balance').eq('id', userId).single();

export const getMyPointsHistory = (userId) =>
  supabase
    .from('points_ledger')
    .select('id, amount, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

// Admin-only board: every member with their running balance, highest first.
export const getAllMembersWithPoints = () =>
  supabase
    .from('profiles')
    .select('id, full_name, photo_url, points_balance')
    .order('points_balance', { ascending: false });

// Admin-only: RLS restricts inserts to profiles.is_admin = true. Reuses the
// same ledger the checkin trigger writes to, so the balance-update trigger
// fires the same way — this is just a second, admin-scoped way in.
export const awardPoints = (userId, amount, reason) =>
  supabase.from('points_ledger').insert({ user_id: userId, amount, reason });

// Recent activity across all members, for the admin board's audit trail —
// checkin-earned and admin-awarded rows both show up here.
export const getRecentPointsActivity = (limit = 30) =>
  supabase
    .from('points_ledger')
    .select('id, user_id, amount, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
