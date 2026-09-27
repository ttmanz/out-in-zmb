import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getMyCashbackBalance, getMyCashbackHistory, getMyCashbackPayoutRequests,
  requestCashbackPayout, CASHBACK_REASON_LABEL,
} from '../../lib/cashback';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const STATUS_LABEL = { pending: 'Pending', paid: 'Paid', rejected: 'Declined' };
const STATUS_COLOR = { pending: COLORS.textSecondary, paid: COLORS.success, rejected: COLORS.error };

const formatZmw = (amount) => `K${Number(amount ?? 0).toFixed(2)}`;

const MyCashbackScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  const [numberDraft, setNumberDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [balanceRes, historyRes, requestsRes] = await Promise.all([
      getMyCashbackBalance(profile.id),
      getMyCashbackHistory(profile.id),
      getMyCashbackPayoutRequests(profile.id),
    ]);
    if (!balanceRes.error) setBalance(balanceRes.data?.cashback_balance ?? 0);
    if (!historyRes.error) setHistory(historyRes.data ?? []);
    if (!requestsRes.error) setRequests(requestsRes.data ?? []);
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openModal = () => {
    setAmountDraft(String(balance));
    setNumberDraft('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    const amount = parseFloat(amountDraft);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Enter a positive amount.');
      return;
    }
    if (amount > balance) {
      Alert.alert('Error', 'That\'s more than your cash back balance.');
      return;
    }
    if (!numberDraft.trim()) {
      Alert.alert('Error', 'Enter the Mobile Money number to receive the payout.');
      return;
    }
    setSaving(true);
    const { error } = await requestCashbackPayout(amount, numberDraft.trim());
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message ?? 'Could not submit your request. Please try again.');
      return;
    }
    setShowModal(false);
    load();
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

      <GradientBorder radius={18} style={styles.balanceOuter}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your cash back balance</Text>
          <Text style={styles.balanceValue}>{formatZmw(balance)}</Text>
          <Text style={styles.balanceHint}>real money, paid via Mobile Money</Text>
        </View>
      </GradientBorder>

      <TouchableOpacity style={styles.cashOutBtn} onPress={openModal} disabled={balance <= 0}>
        <Text style={styles.cashOutBtnText}>💸 Cash Out</Text>
      </TouchableOpacity>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {requests.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Payout Requests</Text>
                {requests.map((r) => (
                  <View key={r.id} style={styles.requestRow}>
                    <View style={styles.rowText}>
                      <Text style={styles.reason}>{formatZmw(r.amount)} to {r.mobile_money_number}</Text>
                      <Text style={styles.time}>{formatAgo(r.requested_at)}</Text>
                    </View>
                    <Text style={[styles.statusBadge, { color: STATUS_COLOR[r.status] }]}>{STATUS_LABEL[r.status]}</Text>
                  </View>
                ))}
              </>
            )}
            <Text style={styles.sectionLabel}>History</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>No cash back yet — spend at a partner venue to start earning.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.reason}>{CASHBACK_REASON_LABEL[item.reason] ?? item.reason}</Text>
              <Text style={styles.time}>{formatAgo(item.created_at)}</Text>
            </View>
            <Text style={[styles.amount, item.amount < 0 && styles.amountNegative]}>
              {item.amount > 0 ? '+' : ''}{formatZmw(item.amount)}
            </Text>
          </View>
        )}
      />

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cash Out</Text>
            <Text style={styles.modalHint}>We'll send this to your Mobile Money number — admin fulfils requests manually for now, usually within a day or two.</Text>

            <Text style={styles.modalLabel}>Amount (max {formatZmw(balance)})</Text>
            <TextInput
              style={styles.modalInput}
              value={amountDraft}
              onChangeText={(v) => setAmountDraft(v.replace(/[^0-9.]/g, ''))}
              placeholder="e.g. 50"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={styles.modalLabel}>Mobile Money number</Text>
            <TextInput
              style={styles.modalInput}
              value={numberDraft}
              onChangeText={setNumberDraft}
              placeholder="e.g. 097XXXXXXX"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowModal(false)} disabled={saving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSubmit} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={COLORS.black} />
                  : <Text style={styles.modalConfirmText}>Request Payout</Text>
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
  cashOutBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginHorizontal: 20, marginBottom: 8,
  },
  cashOutBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.black },
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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderAccent },
  modalCancelText: { color: COLORS.textMuted, fontWeight: '700' },
  modalConfirm: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.primary },
  modalConfirmText: { color: COLORS.black, fontWeight: '800' },
});

export default MyCashbackScreen;
