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
