import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getAgentSettings, updateAgentSettings, getAgentRate, setAgentRate,
  getAgentOverview, setAgent, setAgentBonus, evaluateAllAgents,
} from '../../lib/agents';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';
import Avatar from '../../components/common/Avatar';

const AdminAgentsScreen = ({ navigation }) => {
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

              <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveAgent(row)} disabled={busy}>
                <Text style={styles.removeBtnText}>Remove agent</Text>
              </TouchableOpacity>
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
  removeBtn: { alignSelf: 'flex-start', marginTop: 14 },
  removeBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.error },
});

export default AdminAgentsScreen;
