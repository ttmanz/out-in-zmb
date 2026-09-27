import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getCashbackSettings, updateCashbackSettings, getPendingCashbackPayoutRequests,
  getRecentCashbackPayoutRequests, resolveCashbackPayout, getRecentCashbackClaims,
} from '../../lib/cashback';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';

const formatZmw = (amount) => `K${Number(amount ?? 0).toFixed(2)}`;

const AdminCashbackScreen = ({ navigation }) => {
  const [settings, setSettings] = useState(null);
  const [percentDraft, setPercentDraft] = useState('');
  const [minSpendDraft, setMinSpendDraft] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [pending, setPending] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: settingsData }, { data: pendingData }, { data: resolvedData }, { data: claimsData }] = await Promise.all([
      getCashbackSettings(),
      getPendingCashbackPayoutRequests(),
      getRecentCashbackPayoutRequests(),
      getRecentCashbackClaims(),
    ]);
    setSettings(settingsData ?? null);
    setPercentDraft(String(settingsData?.percent ?? ''));
    setMinSpendDraft(String(settingsData?.min_spend ?? ''));
    setPending(pendingData ?? []);
    setResolved(resolvedData ?? []);
    setClaims(claimsData ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSaveSettings = async () => {
    const percent = parseFloat(percentDraft);
    const minSpend = parseFloat(minSpendDraft) || 0;
    if (!Number.isFinite(percent) || percent <= 0) {
      Alert.alert('Error', 'Enter a positive percentage.');
      return;
    }
    setSavingSettings(true);
    const { error } = await updateCashbackSettings(percent, minSpend);
    setSavingSettings(false);
    if (error) {
      Alert.alert('Error', 'Could not save. Please try again.');
      return;
    }
    load();
  };

  const handleResolve = (request, approve) => {
    const verb = approve ? 'Mark this paid' : 'Decline this request';
    Alert.alert(
      verb,
      approve
        ? `Confirm you've sent ${formatZmw(request.amount)} to ${request.mobile_money_number} via Mobile Money.`
        : `${request.member?.full_name ?? 'This member'}'s balance will be refunded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Mark Paid' : 'Decline',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(request.id);
            const { error } = await resolveCashbackPayout(request.id, approve);
            setBusyId(null);
            if (error) {
              Alert.alert('Error', error.message ?? 'Could not update this request.');
              return;
            }
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
      <BackHeader title="Cash Back" onBack={() => navigation.goBack()} />

      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionLabel}>Cash Back Rate</Text>
            <Text style={styles.sectionHint}>
              Percentage of spend a member gets back in cash, and the minimum spend that qualifies. Venue-funded, applies to every venue.
            </Text>
            <View style={styles.settingsRow}>
              <View style={styles.settingsField}>
                <Text style={styles.ruleLabel}>Cash back %</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={percentDraft}
                  onChangeText={setPercentDraft}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.settingsField}>
                <Text style={styles.ruleLabel}>Min spend (ZMW)</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={minSpendDraft}
                  onChangeText={setMinSpendDraft}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.saveBtnText}>Save Rate</Text>}
            </TouchableOpacity>

            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Pending Payouts ({pending.length})</Text>
            {pending.length === 0 && <Text style={styles.empty}>Nothing pending.</Text>}
          </>
        }
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          return (
            <View style={styles.requestRow}>
              <View style={styles.info}>
                <Text style={styles.name}>{item.member?.full_name ?? 'Member'}</Text>
                <Text style={styles.meta}>{formatZmw(item.amount)} → {item.mobile_money_number}</Text>
                <Text style={styles.time}>{formatAgo(item.requested_at)}</Text>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity style={styles.payBtn} onPress={() => handleResolve(item, true)} disabled={busy}>
                  {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.payBtnText}>Mark Paid</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineBtn} onPress={() => handleResolve(item, false)} disabled={busy}>
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Resolved Payouts</Text>
            {resolved.length === 0 && <Text style={styles.empty}>Nothing yet.</Text>}
            {resolved.map((r) => (
              <View key={r.id} style={styles.activityRow}>
                <View style={styles.activityText}>
                  <Text style={styles.activityName}>{r.member?.full_name ?? 'Member'}</Text>
                  <Text style={styles.activityTime}>{formatAgo(r.resolved_at ?? r.requested_at)}</Text>
                </View>
                <Text style={[styles.activityAmount, r.status === 'rejected' && styles.activityAmountNegative]}>
                  {formatZmw(r.amount)} · {r.status === 'paid' ? 'Paid' : 'Declined'}
                </Text>
              </View>
            ))}

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Recent Venue Claims</Text>
            {claims.length === 0 && <Text style={styles.empty}>Nothing yet.</Text>}
            {claims.map((c) => (
              <View key={c.id} style={styles.activityRow}>
                <View style={styles.activityText}>
                  <Text style={styles.activityName}>{c.member?.full_name ?? 'Member'} at {c.venue?.full_name ?? 'a venue'}</Text>
                  <Text style={styles.activityTime}>{formatAgo(c.created_at)}</Text>
                </View>
                <Text style={styles.activityAmount}>
                  {formatZmw(c.spend_amount)} → {formatZmw(c.cashback_amount)}
                </Text>
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
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
  },
  sectionHint: { fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginHorizontal: 20, marginBottom: 12 },
  list: { paddingBottom: 48 },
  settingsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 10 },
  settingsField: { flex: 1 },
  ruleLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  settingsInput: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '700',
    color: COLORS.primary, backgroundColor: COLORS.surfaceAlt,
  },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
    marginHorizontal: 20, marginTop: 4,
  },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  empty: { fontSize: 13, color: COLORS.textMuted, marginHorizontal: 20 },
  requestRow: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  info: { marginBottom: 10 },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  time: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: 8 },
  payBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  payBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.black },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.error, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  declineBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12,
    marginHorizontal: 20, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  activityText: { flex: 1 },
  activityName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  activityTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  activityAmount: { fontSize: 13, fontWeight: '800', color: COLORS.success },
  activityAmountNegative: { color: COLORS.error },
});

export default AdminCashbackScreen;
