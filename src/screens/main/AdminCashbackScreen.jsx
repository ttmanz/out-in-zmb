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
  getVenueOwners, setVenueApproved,
  formatAmount, CLAIM_STATUS_LABEL, REWARD_LABEL,
} from '../../lib/cashback';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';

const AdminCashbackScreen = ({ navigation }) => {
  const [percentDraft, setPercentDraft] = useState('');
  const [minSpendDraft, setMinSpendDraft] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [pending, setPending] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [claims, setClaims] = useState([]);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: settingsData }, { data: pendingData }, { data: resolvedData }, { data: claimsData }, { data: venuesData }] = await Promise.all([
      getCashbackSettings(),
      getPendingCashbackPayoutRequests(),
      getRecentCashbackPayoutRequests(),
      getRecentCashbackClaims(),
      getVenueOwners(),
    ]);
    setVenues(venuesData ?? []);
    setPercentDraft(String(settingsData?.max_cash_percent ?? ''));
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

  const handleVenue = (venue, approve) => {
    const name = venue.full_name ?? 'this venue';
    Alert.alert(
      approve ? `Approve ${name}?` : `Remove approval for ${name}?`,
      approve
        ? 'Customers will see this venue and can send it receipts. It will be able to confirm cash back, which you then pay out — only approve venues you trust.'
        : 'It will disappear from customers\' lists and can\'t confirm anything until approved again. Store credit customers already hold stays on their account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Remove',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(venue.id);
            const { error } = await setVenueApproved(venue.id, approve);
            setBusyId(null);
            if (error) {
              Alert.alert('Error', error.message ?? 'Could not update this venue.');
              return;
            }
            load();
          },
        },
      ],
    );
  };

  const handleResolve = (request, approve) => {
    const verb = approve ? 'Mark this paid' : 'Decline this request';
    Alert.alert(
      verb,
      approve
        ? `Confirm you've sent ${formatAmount(request.amount)} to ${request.mobile_money_number} via Mobile Money.`
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
            <Text style={styles.sectionLabel}>Venues ({venues.filter((v) => !v.venue_approved).length} waiting)</Text>
            <Text style={styles.sectionHint}>
              Anyone can sign up as a venue owner. A venue isn't listed to customers, and can't confirm receipts, until you approve it.
            </Text>
            {venues.length === 0 && <Text style={styles.empty}>No venue accounts yet.</Text>}
            {venues.map((v) => (
              <View key={v.id} style={styles.venueRow}>
                <View style={styles.activityText}>
                  <Text style={styles.name}>{v.full_name || 'Unnamed venue'}</Text>
                  <Text style={styles.time}>
                    {[v.city, v.phone, v.instagram ? `@${v.instagram}` : null].filter(Boolean).join(' · ') || 'No contact details'}
                  </Text>
                  <Text style={styles.time}>Joined {formatAgo(v.created_at)}</Text>
                </View>
                {v.venue_approved ? (
                  <TouchableOpacity style={[styles.declineBtn, styles.venueBtn]} onPress={() => handleVenue(v, false)} disabled={busyId === v.id}>
                    <Text style={styles.declineBtnText}>Approved · Remove</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.payBtn, styles.venueBtn]} onPress={() => handleVenue(v, true)} disabled={busyId === v.id}>
                    {busyId === v.id ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.payBtnText}>Approve</Text>}
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Cash Back Rate</Text>
            <Text style={styles.sectionHint}>
              Venues set their own cash back and store credit rates. This caps how much cash back any venue can offer (you pay members before recovering it from the venue), and sets the smallest receipt that qualifies.
            </Text>
            <View style={styles.settingsRow}>
              <View style={styles.settingsField}>
                <Text style={styles.ruleLabel}>Max cash back %</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={percentDraft}
                  onChangeText={setPercentDraft}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.settingsField}>
                <Text style={styles.ruleLabel}>Min spend</Text>
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
                <Text style={styles.meta}>{formatAmount(item.amount)} → {item.mobile_money_number}</Text>
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
                  {formatAmount(r.amount)} · {r.status === 'paid' ? 'Paid' : 'Declined'}
                </Text>
              </View>
            ))}

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Recent Receipts</Text>
            {claims.length === 0 && <Text style={styles.empty}>Nothing yet.</Text>}
            {claims.map((c) => (
              <View key={c.id} style={styles.activityRow}>
                <View style={styles.activityText}>
                  <Text style={styles.activityName}>{c.member?.full_name ?? 'Member'} at {c.venue?.full_name ?? 'a venue'}</Text>
                  <Text style={styles.activityTime}>{CLAIM_STATUS_LABEL[c.status]} · {formatAgo(c.created_at)}</Text>
                </View>
                <Text style={[styles.activityAmount, c.status !== 'confirmed' && styles.activityAmountNegative]}>
                  {formatAmount(c.spend_amount)} → {formatAmount(c.cashback_amount)} {REWARD_LABEL[c.reward_type]}
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
  venueBtn: { flex: 0, paddingHorizontal: 14, marginLeft: 8 },
  venueRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12,
    marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
  },
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
