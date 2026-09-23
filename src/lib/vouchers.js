import { supabase } from './supabase';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud
const generateCode = () =>
  Array.from({ length: 7 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export const getMyVouchers = (venueOwnerId) =>
  supabase
    .from('venue_vouchers')
    .select('*')
    .eq('venue_owner_id', venueOwnerId)
    .order('created_at', { ascending: false });

// A voucher code is short and human-typed, so retry on the rare collision
// rather than relying on a client-generated UUID-grade code.
export const createVoucher = async (venueOwnerId, { venueName, discountLabel, expiresAt, maxRedemptions, pointsPrice }) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from('venue_vouchers')
      .insert({
        venue_owner_id: venueOwnerId,
        venue_name: venueName,
        discount_label: discountLabel,
        code: generateCode(),
        expires_at: expiresAt,
        max_redemptions: maxRedemptions,
        points_price: pointsPrice ?? null,
      })
      .select()
      .single();
    if (!error || error.code !== '23505') return { data, error };
  }
  return { data: null, error: new Error('Could not generate a unique code, please try again.') };
};

export const setVoucherActive = (id, isActive) =>
  supabase.from('venue_vouchers').update({ is_active: isActive }).eq('id', id);

export const deleteVoucher = (id) =>
  supabase.from('venue_vouchers').delete().eq('id', id);

// Staff-facing: bump the redemption count. Guards against exceeding
// max_redemptions client-side — see the voucher status check in
// getVoucherStatus, used before this is ever called.
export const redeemVoucher = (id, nextCount) =>
  supabase.from('venue_vouchers').update({ redemption_count: nextCount }).eq('id', id);

export const getVoucherByCode = (code) =>
  supabase
    .from('venue_vouchers')
    .select('*, venue_owner:profiles(full_name)')
    .eq('code', code.toUpperCase().trim())
    .maybeSingle();

export const setVoucherPointsPrice = (id, pointsPrice) =>
  supabase.from('venue_vouchers').update({ points_price: pointsPrice }).eq('id', id);

// Member-facing catalog: every active, points-priced voucher across every
// venue, cheapest first.
export const getRedeemableVouchers = () =>
  supabase
    .from('venue_vouchers')
    .select('*')
    .not('points_price', 'is', null)
    .eq('is_active', true)
    .order('points_price', { ascending: true });

// Server-enforced — see redeem_voucher_with_points() in
// supabase/migrations/20260924020000_points_voucher_redemption.sql. Checks
// balance, expiry, stock and duplicate-claim atomically; the client can't
// bypass any of that by calling this with a bad voucher id.
export const redeemVoucherWithPoints = (voucherId) =>
  supabase.rpc('redeem_voucher_with_points', { p_voucher_id: voucherId });

export const getMyVoucherRedemptions = (userId) =>
  supabase
    .from('voucher_redemptions')
    .select('id, voucher_id, points_spent, redeemed_at, venue_vouchers(code, venue_name, discount_label)')
    .eq('user_id', userId)
    .order('redeemed_at', { ascending: false });

export const getVoucherStatus = (voucher) => {
  if (!voucher) return 'not_found';
  if (!voucher.is_active) return 'inactive';
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) return 'expired';
  if (voucher.max_redemptions != null && voucher.redemption_count >= voucher.max_redemptions) return 'used_up';
  return 'valid';
};
