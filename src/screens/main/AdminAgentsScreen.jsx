import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getAgentSettings, updateAgentSettings, getAgentRate, setAgentRate,
  getAgentOverview, setAgent, setAgentBonus, evaluateAllAgents,
} from '../../lib/agents';
import { getOrCreateConversation, sendMessage } from '../../lib/messages';
import { ROUTES } from '../../constants/routes';
import { useUser } from '../../contexts/UserContext';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';
import Avatar from '../../components/common/Avatar';

const AdminAgentsScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [enabled, setEnabled] = useState(true);
  const [requiredDraft, setRequiredDraft] = useState('10');
  const [required, setRequired] = useState(10);
  const [rateDraft, setRateDraft] = useState('100');
  const [rate, setRate] = useState(100);
  const [rows, setRows] = useState([]);
  const [bonusDrafts, setBonusDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: settings }, { data: rateData }, { data: overview }] = await Promise.all([
      getAgentSettings(),
      getAgentRate(),
      getAgentOverview(),
    ]);
    if (settings) {
      setEnabled(settings.enabled);
      setRequired(settings.referrals_required);
      setRequiredDraft(String(settings.referrals_required));
    }
    if (rateData) {
      setRate(rateData.amount);
      setRateDraft(String(rateData.amount));
    }
    const list = overview ?? [];
    setRows(list);
    setBonusDrafts(Object.fromEntries(list.map((r) => [r.user_id, r.bonus_override != null ? String(r.bonus_override) : ''])));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSaveSettings = async () => {
    const count = parseInt(requiredDraft, 10);
    const bonus = parseInt(rateDraft, 10);
    if (!Number.isFinite(count) || count < 1 || count > 10000) {
      Alert.alert('Error', 'Enter how many friends are needed, from 1 to 10000.');
      return;
    }
    if (!Number.isFinite(bonus) || bonus < 0) {
      Alert.alert('Error', 'Enter the agent bonus as a number of points (0 or more).');
      return;
    }
    setSavingSettings(true);
    const [settingsRes, rateRes] = await Promise.all([
      updateAgentSettings({ enabled, referralsRequired: count }),
      setAgentRate(bonus),
    ]);
    if (settingsRes.error || rateRes.error) {
      setSavingSettings(false);
      Alert.alert('Error', 'Could not save. Please try again.');
      return;
    }
    // Anyone who already has enough counted friends becomes an agent now.
    const { data: promoted } = enabled ? await evaluateAllAgents() : { data: 0 };
    setSavingSettings(false);
    Alert.alert('Saved', promoted > 0 ? `${promoted} member(s) now qualify and have become agents.` : 'Agent settings updated.');
    load();
  };

  const run = async (id, action, failMessage) => {
    setBusyId(id);
    const { error } = await action();
    setBusyId(null);
    if (error) {
      Alert.alert('Error', error.message ?? failMessage);
      return;
    }
    load();
  };

  const handleMakeAgent = (row) => {
    Alert.alert(
      `Make ${row.full_name || 'this member'} an agent?`,
      `They will earn ${rate} points per counted referral instead of the normal bonus.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make agent', onPress: () => run(row.user_id, () => setAgent(row.user_id, true), 'Could not make this member an agent.') },
      ],
    );
  };

  const handleRemoveAgent = (row) => {
    Alert.alert(
      `Remove ${row.full_name || 'this agent'}?`,
      'They go back to the normal referral bonus and are not made an agent again automatically. You can make them one again here.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => run(row.user_id, () => setAgent(row.user_id, false), 'Could not remove this agent.') },
      ],
    );
  };

  const handleSaveBonus = (row) => {
    const text = (bonusDrafts[row.user_id] ?? '').trim();
    const amount = text === '' ? null : parseInt(text, 10);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      Alert.alert('Error', 'Enter a number of points, or leave it blank to use the shared agent bonus.');
      return;
    }
    run(row.user_id, () => setAgentBonus(row.user_id, amount), 'Could not save this bonus.');
  };

  // Opens the normal chat with one agent (the first message also alerts them).
  const handleMessage = async (row) => {
    if (row.user_id === profile?.id) return;
    setBusyId(row.user_id);
    const { data, error } = await getOrCreateConversation(profile.id, row.user_id);
    setBusyId(null);
    if (error || !data) {
      Alert.alert('Error', 'Could not start a conversation.');
      return;
    }
    navigation.navigate('MessagesTab', {
      screen: ROUTES.CHAT,
      params: { conversationId: data.id, friendName: row.full_name ?? 'Agent', friendIsAdmin: false },
    });
  };

  // One message to every agent, each in their own chat with you.
  const handleSendToAll = async () => {
    const text = draft.trim();
    const targets = rows.filter((r) => r.is_agent && r.user_id !== profile?.id);
    if (!text) {
      Alert.alert('Write a message', 'Type the message you want to send to your agents.');
      return;
    }
    if (targets.length === 0) {
      Alert.alert('No agents', 'There are no agents to message yet.');
      return;
    }
    setSending(true);
    let sent = 0;
    for (const agent of targets) {
      const { data } = await getOrCreateConversation(profile.id, agent.user_id);
      if (!data) continue;
      const { error } = await sendMessage(data.id, profile.id, text);
      if (!error) sent += 1;
    }
    setSending(false);
    setComposing(false);
    setDraft('');
    Alert.alert(
      sent === targets.length ? 'Sent' : 'Partly sent',
      sent === targets.length
        ? `Your message went to ${sent} agent${sent === 1 ? '' : 's'}.`
        : `Sent to ${sent} of ${targets.length} agents. The rest could not be reached — try again.`,
    );
  };

  const agents = rows.filter((r) => r.is_agent);
  const others = rows.filter((r) => !r.is_agent);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title="Agents" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>How agents work</Text>
        <Text style={styles.sectionHint}>
          A friend counts once they complete their profile. A member whose counted friends reach the number
          below becomes an agent automatically, and earns the agent bonus for each friend after that, instead
          of the normal referral bonus.
        </Text>

        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Automatic agents</Text>
            <TouchableOpacity
              style={[styles.toggle, enabled && styles.toggleOn]}
              onPress={() => setEnabled((v) => !v)}
            >
              <Text style={[styles.toggleText, enabled && styles.toggleTextOn]}>{enabled ? 'On' : 'Off'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Friends needed to become an agent</Text>
          <TextInput
            style={styles.input}
            value={requiredDraft}
            onChangeText={(v) => setRequiredDraft(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={5}
            placeholder="10"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Agent bonus: points per counted friend</Text>
          <TextInput
            style={styles.input}
            value={rateDraft}
            onChangeText={(v) => setRateDraft(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="100"
            placeholderTextColor={COLORS.textMuted}
          />
          <Text style={styles.sectionHint}>
            The normal referral bonus is under Points → Points Rules. Turning automatic agents off stops new
            promotions; you can still make or remove agents by hand.
          </Text>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Agents ({agents.length})</Text>
        {agents.length > 0 && (
          <TouchableOpacity style={styles.broadcastBtn} onPress={() => setComposing(true)}>
            <Text style={styles.broadcastBtnText}>✉️  Message all agents</Text>
          </TouchableOpacity>
        )}
        {agents.length === 0 && <Text style={styles.empty}>No agents yet.</Text>}
        {agents.map((row) => {
          const busy = busyId === row.user_id;
          return (
            <View key={row.user_id} style={styles.card}>
              <View style={styles.cardTop}>
                <Avatar uri={row.photo_url} name={row.full_name} size={40} />
                <View style={styles.cardText}>
                  <Text style={styles.name}>{row.full_name || 'Member'}  ⭐</Text>
                  <Text style={styles.meta}>
                    Agent since {row.agent_since ? formatAgo(row.agent_since) : '—'}
                  </Text>
                </View>
              </View>
              <Text style={styles.stats}>
                {row.qualified_count} counted · {row.pending_count} waiting for their profile · {row.referral_points} pts earned from referrals
              </Text>

              <Text style={styles.fieldLabel}>Bonus per friend for this agent (blank = {rate})</Text>
              <View style={styles.bonusRow}>
                <TextInput
                  style={[styles.input, styles.bonusInput]}
                  value={bonusDrafts[row.user_id] ?? ''}
                  onChangeText={(v) => setBonusDrafts((prev) => ({ ...prev, [row.user_id]: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder={String(rate)}
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity style={styles.smallBtn} onPress={() => handleSaveBonus(row)} disabled={busy}>
                  {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.smallBtnText}>Save bonus</Text>}
                </TouchableOpacity>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.messageBtn} onPress={() => handleMessage(row)} disabled={busy}>
                  <Text style={styles.messageBtnText}>✉️  Message</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleRemoveAgent(row)} disabled={busy}>
                  <Text style={styles.removeBtnText}>Remove agent</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Members who have referred friends ({others.length})</Text>
        {others.length === 0 && <Text style={styles.empty}>Nobody has referred a friend yet.</Text>}
        {others.map((row) => {
          const busy = busyId === row.user_id;
          return (
            <View key={row.user_id} style={styles.card}>
              <View style={styles.cardTop}>
                <Avatar uri={row.photo_url} name={row.full_name} size={40} />
                <View style={styles.cardText}>
                  <Text style={styles.name}>{row.full_name || 'Member'}</Text>
                  <Text style={styles.meta}>
                    {row.qualified_count} of {required} counted · {row.pending_count} waiting for their profile
                  </Text>
                </View>
                <TouchableOpacity style={styles.smallBtn} onPress={() => handleMakeAgent(row)} disabled={busy}>
                  {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.smallBtnText}>Make agent</Text>}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={composing} transparent animationType="fade" onRequestClose={() => !sending && setComposing(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior="padding">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Message all agents</Text>
            <Text style={styles.modalHint}>
              Sent to {agents.filter((a) => a.user_id !== profile?.id).length} agent(s), each in their own chat with you. They can reply there.
            </Text>
            <TextInput
              style={[styles.input, styles.modalInput]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Write your message…"
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={1000}
              editable={!sending}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setComposing(false)} disabled={sending}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSendToAll} disabled={sending}>
                {sending ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.modalConfirmText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  sectionHint: { fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginBottom: 12 },
  empty: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  settingsCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  settingLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  toggle: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  toggleOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  toggleTextOn: { color: COLORS.black },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
  },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  stats: { fontSize: 12, color: COLORS.textLight, marginTop: 10 },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bonusInput: { width: 100 },
  smallBtn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  smallBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.black },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  messageBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  messageBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  removeBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.error },
  broadcastBtn: {
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginBottom: 12,
  },
  broadcastBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  modalHint: { fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginBottom: 12 },
  modalInput: { minHeight: 110, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderAccent },
  modalCancelText: { color: COLORS.textMuted, fontWeight: '700' },
  modalConfirm: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.primary },
  modalConfirmText: { color: COLORS.black, fontWeight: '800' },
});

export default AdminAgentsScreen;
