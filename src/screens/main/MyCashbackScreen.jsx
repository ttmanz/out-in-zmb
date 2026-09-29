import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import {
  getMyCashbackBalances, getMyCashbackHistory, getMyCashbackPayoutRequests, requestCashbackPayout, listPayoutMethods,
  getMyCashbackClaims, cancelCashbackClaim, getMyVenueCredits, requestCreditRedemption,
  getMyPendingCreditRedemptions, cancelCreditRedemption,
  formatAmount, CASHBACK_REASON_LABEL, CLAIM_STATUS_LABEL, REWARD_LABEL,
} from '../../lib/cashback';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const PAYOUT_STATUS_LABEL = { pending: 'Pending', paid: 'Paid', rejected: 'Declined' };
const STATUS_COLOR = {
  pending: COLORS.textSecondary, paid: COLORS.success, confirmed: COLORS.success,
  rejected: COLORS.error, cancelled: COLORS.textMuted,
};

const MyCashbackScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [balances, setBalances] = useState([]);
  const [history, setHistory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [claims, setClaims] = useState([]);
  const [credits, setCredits] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCashOut, setShowCashOut] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  const [numberDraft, setNumberDraft] = useState('');
  const [cashOutCurrency, setCashOutCurrency] = useState(null);
  const [methods, setMethods] = useState([]);
  const [methodKey, setMethodKey] = useState(null);
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditDraft, setCreditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [balancesRes, historyRes, requestsRes, claimsRes, creditsRes, redemptionsRes] = await Promise.all([
      getMyCashbackBalances(),
      getMyCashbackHistory(profile.id),
      getMyCashbackPayoutRequests(profile.id),
      getMyCashbackClaims(profile.id),
      getMyVenueCredits(),
      getMyPendingCreditRedemptions(profile.id),
    ]);
    if (!balancesRes.error) setBalances(balancesRes.data ?? []);
    if (!historyRes.error) setHistory(historyRes.data ?? []);
    if (!requestsRes.error) setRequests(requestsRes.data ?? []);
    if (!claimsRes.error) setClaims(claimsRes.data ?? []);
    if (!creditsRes.error) setCredits(creditsRes.data ?? []);
    if (!redemptionsRes.error) setRedemptions(redemptionsRes.data ?? []);
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const balanceOf = (currency) => Number(balances.find((b) => b.currency_code === currency)?.balance ?? 0);

  const chooseCurrency = (currency) => {
    setCashOutCurrency(currency);
    setAmountDraft(String(balanceOf(currency)));
    setMethodKey(null);
  };

  const openCashOut = () => {
    setNumberDraft('');
    chooseCurrency(balances[0]?.currency_code ?? null);
    setShowCashOut(true);
  };

  // The payout methods that can pay the chosen currency, from the server.
  useEffect(() => {
    if (!showCashOut || !cashOutCurrency) return;
    let cancelled = false;
    setMethods([]);
    listPayoutMethods(cashOutCurrency).then(({ data }) => {
      if (cancelled) return;
      setMethods(data ?? []);
      if ((data ?? []).length === 1) setMethodKey(data[0].method_key);
    });
    return () => { cancelled = true; };
  }, [showCashOut, cashOutCurrency]);

  const selectedMethod = methods.find((m) => m.method_key === methodKey) ?? null;

  const handleCashOut = async () => {
    const amount = parseFloat(amountDraft);
    if (!amount || amount <= 0) return Alert.alert('Error', 'Enter a positive amount.');
    if (amount > balanceOf(cashOutCurrency)) return Alert.alert('Error', 'That\'s more than your cash back balance.');
    if (!selectedMethod) return Alert.alert('Error', 'Choose how you\'d like to be paid.');
    if (!numberDraft.trim()) return Alert.alert('Error', 'Enter your payout details.');
    setSaving(true);
    const { error } = await requestCashbackPayout(amount, numberDraft.trim(), cashOutCurrency, selectedMethod.method_key);
    setSaving(false);
    if (error) return Alert.alert('Error', error.message ?? 'Could not submit your request. Please try again.');
    setShowCashOut(false);
    load();
  };

  const handleUseCredit = async () => {
    const amount = parseFloat(creditDraft);
    if (!amount || amount <= 0) return Alert.alert('Error', 'Enter a positive amount.');
    if (amount > Number(creditTarget.balance)) return Alert.alert('Error', 'That\'s more than your credit at this venue.');
    setSaving(true);
    const { error } = await requestCreditRedemption(creditTarget.venue_owner_id, amount);
    setSaving(false);
    if (error) return Alert.alert('Error', error.message ?? 'Could not send your request. Please try again.');
    setCreditTarget(null);
    load();
  };

  const handleCancel = async (id, cancelFn) => {
    setBusyId(id);
    const { error } = await cancelFn(id);
    setBusyId(null);
    if (error) return Alert.alert('Error', error.message ?? 'Could not cancel this.');
    load();
  };

  const pendingClaims = claims.filter((c) => c.status === 'pending');
  const doneClaims = claims.filter((c) => c.status !== 'pending').slice(0, 5);

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

      <GradientBorder radius={18} style={styles.balanceOuter}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your cash back balance</Text>
          {balances.length === 0
            ? <Text style={styles.balanceValue}>{formatAmount(0)}</Text>
            : balances.map((b) => (
                <Text key={b.currency_code} style={styles.balanceValue}>{formatAmount(b.balance, b.currency_code)}</Text>
              ))}
          <Text style={styles.balanceHint}>real money, paid out to you</Text>
        </View>
      </GradientBorder>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.primaryBtn, styles.actionHalf]} onPress={() => navigation.navigate(ROUTES.SUBMIT_RECEIPT)}>
          <Text style={styles.primaryBtnText}>🧾 Submit receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.outlineBtn, styles.actionHalf, balances.length === 0 && styles.btnDisabled]}
          onPress={openCashOut}
          disabled={balances.length === 0}
        >
          <Text style={styles.outlineBtnText}>💸 Cash out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {credits.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Store credit</Text>
                {credits.map((c) => (
                  <View key={c.venue_owner_id} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.reason}>{c.venue_name}</Text>
                      <Text style={styles.time}>Spend it at this venue only</Text>
                    </View>
                    <Text style={styles.credit}>{formatAmount(c.balance, c.currency_code)}</Text>
                    <TouchableOpacity
                      style={styles.useBtn}
                      onPress={() => { setCreditTarget(c); setCreditDraft(String(c.balance)); }}
                    >
                      <Text style={styles.useBtnText}>Use</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {(pendingClaims.length > 0 || redemptions.length > 0) && (
              <>
                <Text style={styles.sectionLabel}>Waiting for a venue</Text>
                {pendingClaims.map((c) => (
                  <View key={c.id} style={styles.pendingRow}>
                    <View style={styles.rowText}>
                      <Text style={styles.reason}>{c.venue?.full_name ?? 'Venue'} — {formatAmount(c.spend_amount, c.currency_code)} {c.reward_type === 'discount' ? 'bill' : 'receipt'}</Text>
                      <Text style={styles.time}>{formatAmount(c.cashback_amount, c.currency_code)} {REWARD_LABEL[c.reward_type]} · {formatAgo(c.created_at)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleCancel(c.id, cancelCashbackClaim)} disabled={busyId === c.id}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {redemptions.map((r) => (
                  <View key={r.id} style={styles.pendingRow}>
                    <View style={styles.rowText}>
                      <Text style={styles.reason}>Using {formatAmount(r.amount, r.currency_code)} credit at {r.venue?.full_name ?? 'venue'}</Text>
                      <Text style={styles.time}>Ask the venue to confirm · {formatAgo(r.created_at)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleCancel(r.id, cancelCreditRedemption)} disabled={busyId === r.id}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {doneClaims.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Recent receipts</Text>
                {doneClaims.map((c) => (
                  <View key={c.id} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.reason}>{c.venue?.full_name ?? 'Venue'} — {formatAmount(c.spend_amount, c.currency_code)}</Text>
                      <Text style={styles.time}>{formatAmount(c.cashback_amount, c.currency_code)} {REWARD_LABEL[c.reward_type]} · {formatAgo(c.created_at)}</Text>
                    </View>
                    <Text style={[styles.statusBadge, { color: STATUS_COLOR[c.status] }]}>{CLAIM_STATUS_LABEL[c.status]}</Text>
                  </View>
                ))}
              </>
            )}

            {requests.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Payout Requests</Text>
                {requests.map((r) => (
                  <View key={r.id} style={styles.requestRow}>
                    <View style={styles.rowText}>
                      <Text style={styles.reason}>{formatAmount(r.amount, r.currency_code)} via {r.method_label} · {r.mobile_money_number}</Text>
                      <Text style={styles.time}>{formatAgo(r.requested_at)}</Text>
                    </View>
                    <Text style={[styles.statusBadge, { color: STATUS_COLOR[r.status] }]}>{PAYOUT_STATUS_LABEL[r.status]}</Text>
                  </View>
                ))}
              </>
            )}
            <Text style={styles.sectionLabel}>History</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>No cash back yet — submit a receipt from a partner venue to start earning.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.reason}>{CASHBACK_REASON_LABEL[item.reason] ?? item.reason}</Text>
              <Text style={styles.time}>{formatAgo(item.created_at)}</Text>
            </View>
            <Text style={[styles.amount, item.amount < 0 && styles.amountNegative]}>
              {item.amount > 0 ? '+' : ''}{formatAmount(item.amount, item.currency_code)}
            </Text>
          </View>
        )}
      />

      <Modal visible={showCashOut} transparent animationType="fade" onRequestClose={() => setShowCashOut(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cash Out</Text>
            <Text style={styles.modalHint}>We'll send this to the payout details you enter — an admin fulfils requests manually for now, usually within a day or two.</Text>

            {balances.length > 1 && (
              <>
                <Text style={styles.modalLabel}>Currency</Text>
                <View style={styles.chipRow}>
                  {balances.map((b) => (
                    <TouchableOpacity
                      key={b.currency_code}
                      style={[styles.chip, b.currency_code === cashOutCurrency && styles.chipActive]}
                      onPress={() => chooseCurrency(b.currency_code)}
                    >
                      <Text style={[styles.chipText, b.currency_code === cashOutCurrency && styles.chipTextActive]}>{b.currency_code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.modalLabel}>Amount (max {formatAmount(balanceOf(cashOutCurrency), cashOutCurrency)})</Text>
            <TextInput
              style={styles.modalInput}
              value={amountDraft}
              onChangeText={(v) => setAmountDraft(v.replace(/[^0-9.]/g, ''))}
              placeholder="e.g. 50"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={styles.modalLabel}>Pay me by</Text>
            {methods.length === 0
              ? <Text style={styles.modalHint}>Loading payout methods…</Text>
              : (
                <View style={styles.chipRow}>
                  {methods.map((m) => (
                    <TouchableOpacity
                      key={m.method_key}
                      style={[styles.chip, m.method_key === methodKey && styles.chipActive]}
                      onPress={() => setMethodKey(m.method_key)}
                    >
                      <Text style={[styles.chipText, m.method_key === methodKey && styles.chipTextActive]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

            {selectedMethod && (
              <>
                <Text style={styles.modalLabel}>{selectedMethod.detail_label}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={numberDraft}
                  onChangeText={setNumberDraft}
                  placeholder={selectedMethod.detail_label}
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCashOut(false)} disabled={saving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleCashOut} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={COLORS.black} />
                  : <Text style={styles.modalConfirmText}>Request Payout</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!creditTarget} transparent animationType="fade" onRequestClose={() => setCreditTarget(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Use credit at {creditTarget?.venue_name}</Text>
            <Text style={styles.modalHint}>Ask the venue to confirm on their phone. Your credit is only spent once they do.</Text>

            <Text style={styles.modalLabel}>Amount (max {formatAmount(creditTarget?.balance, creditTarget?.currency_code)})</Text>
            <TextInput
              style={styles.modalInput}
              value={creditDraft}
              onChangeText={(v) => setCreditDraft(v.replace(/[^0-9.]/g, ''))}
              placeholder="e.g. 20"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCreditTarget(null)} disabled={saving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleUseCredit} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={COLORS.black} />
                  : <Text style={styles.modalConfirmText}>Ask venue</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  balanceOuter: { margin: 20, marginBottom: 8 },
  balanceCard: { backgroundColor: COLORS.surface, borderRadius: 16.5, padding: 24, alignItems: 'center' },
  balanceLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 6 },
  balanceValue: { fontSize: 40, fontWeight: '800', color: COLORS.primary },
  balanceHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 8 },
  actionHalf: { flex: 1 },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  outlineBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  outlineBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  btnDisabled: { opacity: 0.4 },
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
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  rowText: { flex: 1 },
  reason: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  time: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '800', color: COLORS.success },
  amountNegative: { color: COLORS.error },
  credit: { fontSize: 15, fontWeight: '800', color: COLORS.primary, marginHorizontal: 10 },
  useBtn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  useBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.black },
  cancelText: { fontSize: 12, fontWeight: '700', color: COLORS.error, marginLeft: 10 },
  statusBadge: { fontSize: 12, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  modalHint: { fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginBottom: 10 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6, marginTop: 10 },
  modalInput: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: COLORS.surfaceAlt,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.textLight },
  chipTextActive: { color: COLORS.black },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderAccent },
  modalCancelText: { color: COLORS.textMuted, fontWeight: '700' },
  modalConfirm: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.primary },
  modalConfirmText: { color: COLORS.black, fontWeight: '800' },
});

export default MyCashbackScreen;
