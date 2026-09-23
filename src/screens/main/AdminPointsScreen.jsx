import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getAllMembersWithPoints, awardPoints, getRecentPointsActivity, REASON_LABEL } from '../../lib/points';
import { formatAgo } from '../../utils/format';
import Avatar from '../../components/common/Avatar';
import BackHeader from '../../components/common/BackHeader';

const AdminPointsScreen = ({ navigation }) => {
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null); // member being awarded/deducted
  const [mode, setMode] = useState('award'); // 'award' | 'deduct'
  const [amountDraft, setAmountDraft] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: membersData }, { data: activityData }] = await Promise.all([
      getAllMembersWithPoints(),
      getRecentPointsActivity(),
    ]);
    setMembers(membersData ?? []);
    setActivity(activityData ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.full_name ?? '').toLowerCase().includes(q));
  }, [members, query]);

  const memberName = (userId) => members.find((m) => m.id === userId)?.full_name ?? 'Member';

  const openModal = (member, awardMode) => {
    setTarget(member);
    setMode(awardMode);
    setAmountDraft('');
    setReasonDraft('');
  };

  const handleSubmit = async () => {
    const rawAmount = parseInt(amountDraft, 10);
    if (!rawAmount || rawAmount <= 0) {
      Alert.alert('Error', 'Enter a positive amount.');
      return;
    }
    if (!reasonDraft.trim()) {
      Alert.alert('Error', 'Enter a reason — it shows up in the member\'s points history.');
      return;
    }
    setSaving(true);
    const signedAmount = mode === 'deduct' ? -rawAmount : rawAmount;
    const { error } = await awardPoints(target.id, signedAmount, reasonDraft.trim());
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not save this — try again.');
      return;
    }
    setTarget(null);
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
      <BackHeader title="Points" onBack={() => navigation.goBack()} />

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search members…"
        placeholderTextColor={COLORS.textMuted}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.sectionLabel}>Balances ({filtered.length})</Text>}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Avatar uri={item.photo_url} name={item.full_name} size={38} backgroundColor={COLORS.primaryDark} style={styles.avatar} />
            <View style={styles.info}>
              <Text style={styles.name}>{item.full_name ?? '—'}</Text>
              <Text style={styles.balance}>{item.points_balance ?? 0} pts</Text>
            </View>
            <TouchableOpacity style={styles.awardBtn} onPress={() => openModal(item, 'award')}>
              <Text style={styles.awardBtnText}>+ Award</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deductBtn} onPress={() => openModal(item, 'deduct')}>
              <Text style={styles.deductBtnText}>− Deduct</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Recent Activity</Text>
            {activity.length === 0 && <Text style={styles.empty}>Nothing yet.</Text>}
            {activity.map((a) => (
              <View key={a.id} style={styles.activityRow}>
                <View style={styles.activityText}>
                  <Text style={styles.activityName}>{memberName(a.user_id)}</Text>
                  <Text style={styles.activityReason}>{REASON_LABEL[a.reason] ?? a.reason}</Text>
                  <Text style={styles.activityTime}>{formatAgo(a.created_at)}</Text>
                </View>
                <Text style={[styles.activityAmount, a.amount < 0 && styles.activityAmountNegative]}>
                  {a.amount > 0 ? '+' : ''}{a.amount}
                </Text>
              </View>
            ))}
          </>
        }
      />

      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {mode === 'award' ? 'Award points to' : 'Deduct points from'} {target?.full_name ?? 'member'}
            </Text>

            <Text style={styles.modalLabel}>Amount</Text>
            <TextInput
              style={styles.modalInput}
              value={amountDraft}
              onChangeText={(v) => setAmountDraft(v.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 50"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              autoFocus
            />

            <Text style={styles.modalLabel}>Reason</Text>
            <TextInput
              style={styles.modalInput}
              value={reasonDraft}
              onChangeText={setReasonDraft}
              placeholder="e.g. Birthday bonus"
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setTarget(null)} disabled={saving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, mode === 'deduct' && styles.modalConfirmDeduct]}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={COLORS.black} />
                  : <Text style={styles.modalConfirmText}>{mode === 'award' ? 'Award' : 'Deduct'}</Text>
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
  search: {
    marginHorizontal: 20, marginTop: 12, marginBottom: 4,
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
  },
  list: { paddingBottom: 48 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12,
    marginHorizontal: 20, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rank: { width: 22, fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  avatar: { marginRight: 10 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  balance: { fontSize: 12, color: COLORS.primary, fontWeight: '700', marginTop: 2 },
  awardBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6,
  },
  awardBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.black },
  deductBtn: {
    borderWidth: 1, borderColor: COLORS.error, borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6,
  },
  deductBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.error },
  empty: { fontSize: 13, color: COLORS.textMuted, marginHorizontal: 20 },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12,
    marginHorizontal: 20, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  activityText: { flex: 1 },
  activityName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  activityReason: { fontSize: 12, color: COLORS.textLight, marginTop: 1 },
  activityTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  activityAmount: { fontSize: 15, fontWeight: '800', color: COLORS.success },
  activityAmountNegative: { color: COLORS.error },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
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
  modalConfirmDeduct: { backgroundColor: COLORS.error },
  modalConfirmText: { color: COLORS.black, fontWeight: '800' },
});

export default AdminPointsScreen;
