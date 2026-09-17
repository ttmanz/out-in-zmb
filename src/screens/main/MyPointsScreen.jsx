import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getMyPointsBalance, getMyPointsHistory, REASON_LABEL } from '../../lib/points';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const MyPointsScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [balanceRes, historyRes] = await Promise.all([
      getMyPointsBalance(profile.id),
      getMyPointsHistory(profile.id),
    ]);
    if (!balanceRes.error) setBalance(balanceRes.data?.points_balance ?? 0);
    if (!historyRes.error) setHistory(historyRes.data ?? []);
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.safe}>
      <BackHeader title="My Points" onBack={() => navigation.goBack()} />

      <GradientBorder radius={18} style={styles.balanceOuter}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your balance</Text>
          <Text style={styles.balanceValue}>{balance}</Text>
          <Text style={styles.balanceHint}>points</Text>
        </View>
      </GradientBorder>

      <Text style={styles.sectionLabel}>History</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No points earned yet — check in at a venue to start.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.reason}>{REASON_LABEL[item.reason] ?? item.reason}</Text>
                <Text style={styles.time}>{formatAgo(item.created_at)}</Text>
              </View>
              <Text style={[styles.amount, item.amount < 0 && styles.amountNegative]}>
                {item.amount > 0 ? '+' : ''}{item.amount}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  balanceOuter: { margin: 20, marginBottom: 8 },
  balanceCard: { backgroundColor: COLORS.surface, borderRadius: 16.5, padding: 24, alignItems: 'center' },
  balanceLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 6 },
  balanceValue: { fontSize: 44, fontWeight: '800', color: COLORS.primary },
  balanceHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
  },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  empty: { fontSize: 14, color: COLORS.textMuted, marginTop: 8, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rowText: { flex: 1 },
  reason: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  time: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '800', color: COLORS.success },
  amountNegative: { color: COLORS.error },
});

export default MyPointsScreen;
