import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '../../constants/colors';
import {
  getMyVouchers, createVoucher, setVoucherActive, deleteVoucher,
  redeemVoucher, getVoucherStatus,
} from '../../lib/vouchers';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const STATUS_LABEL = {
  valid: 'Active', inactive: 'Deactivated', expired: 'Expired', used_up: 'Fully redeemed',
};
const STATUS_COLOR = {
  valid: COLORS.success, inactive: COLORS.textMuted, expired: COLORS.error, used_up: COLORS.error,
};

const VenueVouchersScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [venueName, setVenueName] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [pointsPrice, setPointsPrice] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await getMyVouchers(profile.id);
    if (!error) setVouchers(data ?? []);
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = async () => {
    if (!venueName.trim() || !discountLabel.trim()) {
      Alert.alert('Missing info', 'Enter a venue name and a discount to give.');
      return;
    }
    setCreating(true);
    const { data, error } = await createVoucher(profile.id, {
      venueName: venueName.trim(),
      discountLabel: discountLabel.trim(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      maxRedemptions: maxRedemptions.trim() ? parseInt(maxRedemptions, 10) : null,
      pointsPrice: pointsPrice.trim() ? parseInt(pointsPrice, 10) : null,
    });
    setCreating(false);
    if (error || !data) {
      Alert.alert('Error', 'Could not create the voucher. Please try again.');
      return;
    }
    setDiscountLabel('');
    setMaxRedemptions('');
    setPointsPrice('');
    setExpiresAt(null);
    setVouchers((prev) => [data, ...prev]);
  };

  const handleShare = (voucher) => {
    Share.share({
      message: `🎟️ ${voucher.venue_name} gave me a voucher: ${voucher.discount_label}\nCode: ${voucher.code}\n\nShow this code at ${voucher.venue_name} to redeem it.`,
    });
  };

  const handleToggleActive = async (voucher) => {
    setBusyId(voucher.id);
    const { error } = await setVoucherActive(voucher.id, !voucher.is_active);
    setBusyId(null);
    if (!error) {
      setVouchers((prev) => prev.map((v) => (v.id === voucher.id ? { ...v, is_active: !v.is_active } : v)));
    }
  };

  const handleRedeem = (voucher) => {
    Alert.alert(
      'Mark redeemed?',
      `Record one redemption of "${voucher.discount_label}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark redeemed',
          onPress: async () => {
            setBusyId(voucher.id);
            const nextCount = voucher.redemption_count + 1;
            const { error } = await redeemVoucher(voucher.id, nextCount);
            setBusyId(null);
            if (!error) {
              setVouchers((prev) => prev.map((v) => (v.id === voucher.id ? { ...v, redemption_count: nextCount } : v)));
            }
          },
        },
      ],
    );
  };

  const handleDelete = (voucher) => {
    Alert.alert('Delete voucher?', 'This permanently removes it — the code will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(voucher.id);
          const { error } = await deleteVoucher(voucher.id);
          setBusyId(null);
          if (!error) setVouchers((prev) => prev.filter((v) => v.id !== voucher.id));
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title="My Vouchers" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Create a Voucher</Text>
        <Text style={styles.sectionHint}>
          Hand the code to a customer in person — they can share it with friends from the app.
        </Text>

        <TextInput
          style={styles.input}
          value={venueName}
          onChangeText={setVenueName}
          placeholder="Venue name"
          placeholderTextColor={COLORS.textMuted}
        />
        <TextInput
          style={styles.input}
          value={discountLabel}
          onChangeText={setDiscountLabel}
          placeholder="e.g. 20% off your bill, or Free coffee"
          placeholderTextColor={COLORS.textMuted}
        />
        <TextInput
          style={styles.input}
          value={maxRedemptions}
          onChangeText={(v) => setMaxRedemptions(v.replace(/[^0-9]/g, ''))}
          placeholder="Max redemptions (optional — blank = unlimited)"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
        />
        <TextInput
          style={styles.input}
          value={pointsPrice}
          onChangeText={(v) => setPointsPrice(v.replace(/[^0-9]/g, ''))}
          placeholder="Points price (optional — lists it in the Rewards catalog)"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
        />

        <TouchableOpacity style={styles.input} onPress={() => setShowPicker(true)} activeOpacity={0.7}>
          <Text style={expiresAt ? styles.dateText : styles.datePlaceholder}>
            {expiresAt ? `Expires ${expiresAt.toLocaleDateString()}` : 'Expiry date (optional)'}
          </Text>
          {expiresAt && (
            <TouchableOpacity onPress={() => setExpiresAt(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearDate}>✕ Clear</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {showPicker && (
          <DateTimePicker
            value={expiresAt ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={(event, selected) => {
              if (Platform.OS === 'android') setShowPicker(false);
              if (selected) setExpiresAt(selected);
            }}
          />
        )}
        {Platform.OS === 'ios' && showPicker && (
          <TouchableOpacity style={styles.doneBtn} onPress={() => setShowPicker(false)}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={creating}>
          {creating ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.createBtnText}>Create Voucher</Text>}
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Your Vouchers</Text>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
        ) : vouchers.length === 0 ? (
          <Text style={styles.empty}>No vouchers yet.</Text>
        ) : (
          vouchers.map((voucher) => {
            const status = getVoucherStatus(voucher);
            const busy = busyId === voucher.id;
            return (
              <GradientBorder key={voucher.id} radius={16} style={styles.cardOuter}>
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.code}>{voucher.code}</Text>
                    <Text style={[styles.status, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
                  </View>
                  <Text style={styles.discount}>{voucher.discount_label}</Text>
                  {voucher.points_price != null && (
                    <Text style={styles.pointsBadge}>🏆 {voucher.points_price} pts in Rewards catalog</Text>
                  )}
                  <Text style={styles.meta}>{voucher.venue_name}</Text>
                  <Text style={styles.meta}>
                    {voucher.redemption_count} redeemed{voucher.max_redemptions != null ? ` / ${voucher.max_redemptions} max` : ''}
                    {voucher.expires_at ? ` · Expires ${new Date(voucher.expires_at).toLocaleDateString()}` : ''}
                  </Text>

                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(voucher)} disabled={busy}>
                      <Text style={styles.actionText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleRedeem(voucher)}
                      disabled={busy || status !== 'valid'}
                    >
                      {busy ? <ActivityIndicator size="small" color={COLORS.textMuted} /> : <Text style={styles.actionText}>Mark redeemed</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleActive(voucher)} disabled={busy}>
                      <Text style={styles.actionText}>{voucher.is_active ? 'Deactivate' : 'Activate'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(voucher)} disabled={busy}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </GradientBorder>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  sectionHint: { fontSize: 12, color: COLORS.textMuted, marginBottom: 14, lineHeight: 17 },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderAccent,
    borderRadius: 14, padding: 14, marginBottom: 10,
    fontSize: 14, color: COLORS.text,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateText: { fontSize: 14, color: COLORS.text },
  datePlaceholder: { fontSize: 14, color: COLORS.textMuted },
  clearDate: { fontSize: 12, color: COLORS.error, fontWeight: '700' },
  doneBtn: { alignSelf: 'flex-end', marginBottom: 10 },
  doneBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  createBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 6, marginBottom: 8,
  },
  createBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
  empty: { fontSize: 14, color: COLORS.textMuted, marginTop: 8 },
  cardOuter: { marginBottom: 14 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14.5, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  code: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: 2 },
  status: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  discount: { fontSize: 15, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  pointsBadge: { fontSize: 11, fontWeight: '700', color: COLORS.success, marginBottom: 4 },
  meta: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: COLORS.textLight },
  deleteBtn: { borderColor: COLORS.error },
  deleteText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
});

export default VenueVouchersScreen;
