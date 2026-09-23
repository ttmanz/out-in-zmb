import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getRedeemableVouchers, redeemVoucherWithPoints, getMyVoucherRedemptions,
} from '../../lib/vouchers';
import { getMyPointsBalance } from '../../lib/points';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const RewardsScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [balance, setBalance] = useState(0);
  const [catalog, setCatalog] = useState([]);
  const [redeemed, setRedeemed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [balanceRes, catalogRes, redeemedRes] = await Promise.all([
      getMyPointsBalance(profile.id),
      getRedeemableVouchers(),
      getMyVoucherRedemptions(profile.id),
    ]);
    setBalance(balanceRes.data?.points_balance ?? 0);
    setCatalog(catalogRes.data ?? []);
    setRedeemed(redeemedRes.data ?? []);
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRedeem = (voucher) => {
    const already = redeemed.some((r) => r.voucher_id === voucher.id);
    if (already) {
      Alert.alert('Already redeemed', "You've already claimed this one — check My Vouchers for the code.");
      return;
    }
    if (balance < voucher.points_price) {
      Alert.alert('Not enough points', `You need ${voucher.points_price} points — you have ${balance}.`);
      return;
    }
    Alert.alert(
      'Redeem this reward?',
      `Spend ${voucher.points_price} points on "${voucher.discount_label}" at ${voucher.venue_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeemingId(voucher.id);
            const { data, error } = await redeemVoucherWithPoints(voucher.id);
            setRedeemingId(null);
            if (error || !data) {
              Alert.alert('Error', error?.message ?? 'Could not redeem this — try again.');
              return;
            }
            Alert.alert('Redeemed!', `Your code is ${data.code}. Show it to staff at ${data.venue_name}.`);
            load();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <BackHeader title="Rewards" onBack={() => navigation.goBack()} />

      <GradientBorder radius={18} style={styles.balanceOuter}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your balance</Text>
          <Text style={styles.balanceValue}>{balance}</Text>
          <Text style={styles.balanceHint}>points</Text>
        </View>
      </GradientBorder>

      <FlatList
        data={catalog}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.sectionLabel}>Catalog</Text>}
        ListEmptyComponent={<Text style={styles.empty}>No rewards available right now — check back soon.</Text>}
        renderItem={({ item }) => {
          const already = redeemed.some((r) => r.voucher_id === item.id);
          const affordable = balance >= item.points_price;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.discount}>{item.discount_label}</Text>
                <Text style={styles.price}>{item.points_price} pts</Text>
              </View>
              <Text style={styles.venue}>{item.venue_name}</Text>
              {item.expires_at && (
                <Text style={styles.meta}>Expires {new Date(item.expires_at).toLocaleDateString()}</Text>
              )}
              <TouchableOpacity
                style={[styles.redeemBtn, (!affordable || already) && styles.redeemBtnDisabled]}
                onPress={() => handleRedeem(item)}
                disabled={redeemingId === item.id || already || !affordable}
              >
                {redeemingId === item.id
                  ? <ActivityIndicator color={COLORS.black} />
                  : <Text style={styles.redeemBtnText}>
                      {already ? 'Already redeemed' : affordable ? 'Redeem' : 'Not enough points'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          );
        }}
        ListFooterComponent={
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>My Redeemed Rewards</Text>
            {redeemed.length === 0 && <Text style={styles.empty}>Nothing redeemed yet.</Text>}
            {redeemed.map((r) => (
              <View key={r.id} style={styles.redeemedRow}>
                <View style={styles.redeemedText}>
                  <Text style={styles.redeemedDiscount}>{r.venue_vouchers?.discount_label}</Text>
                  <Text style={styles.meta}>{r.venue_vouchers?.venue_name} · {formatAgo(r.redeemed_at)}</Text>
                </View>
                <Text style={styles.redeemedCode}>{r.venue_vouchers?.code}</Text>
              </View>
            ))}
          </>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  balanceOuter: { margin: 20, marginBottom: 8 },
  balanceCard: { backgroundColor: COLORS.surface, borderRadius: 16.5, padding: 20, alignItems: 'center' },
  balanceLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  balanceValue: { fontSize: 36, fontWeight: '800', color: COLORS.primary },
  balanceHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 8, marginBottom: 8,
  },
  list: { paddingBottom: 48 },
  empty: { fontSize: 13, color: COLORS.textMuted, marginHorizontal: 20 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  discount: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 8 },
  price: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  venue: { fontSize: 13, color: COLORS.textLight, marginBottom: 2 },
  meta: { fontSize: 12, color: COLORS.textMuted },
  redeemBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 12,
  },
  redeemBtnDisabled: { backgroundColor: COLORS.surfaceAlt },
  redeemBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  redeemedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12,
    marginHorizontal: 20, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  redeemedText: { flex: 1 },
  redeemedDiscount: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  redeemedCode: { fontSize: 14, fontWeight: '800', color: COLORS.primary, letterSpacing: 1 },
});

export default RewardsScreen;
