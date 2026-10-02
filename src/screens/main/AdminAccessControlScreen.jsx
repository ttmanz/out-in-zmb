import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getSubscriptionSettings, updateSubscriptionSettings, getFeatureAccess, updateFeatureAccess } from '../../lib/subscription';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';

// Messages is core plumbing (conversations, "Message" buttons across the app),
// not a Home tab — keep it out of the on/off list.
const TOGGLEABLE = (f) => f.feature_key !== 'messages';

const MODES = [
  {
    key: 'levels',
    label: 'Levels',
    desc: 'Members are on the Free, Silver, Gold or Platinum level, and the daily post limit follows each member\'s level (set under Plans). No feature is blocked — every member keeps full access.',
  },
  {
    key: 'venue_plan',
    label: 'Venue Plan',
    desc: 'Every member is free, with no levels. Venues get a free trial, then pay a venue plan (monthly, 6-month or yearly — prices under Plans) to use venue tools: offering rewards, confirming claims and vouchers. An unpaid venue still works like a member.',
  },
];

const AdminAccessControlScreen = ({ navigation }) => {
  const { refreshFeatureConfig } = useUser();
  const [mode, setMode] = useState('levels');
  const [trialDays, setTrialDays] = useState('30');
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: settings }, { data: featureData }] = await Promise.all([
      getSubscriptionSettings(),
      getFeatureAccess(),
    ]);
    if (settings) {
      setMode(settings.mode ?? 'levels');
      setTrialDays(String(settings.venue_trial_days ?? 30));
    }
    setFeatures((featureData ?? []).map((f) => ({ ...f, enabled: f.enabled !== false })));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setFeatureField = (key, field, value) =>
    setFeatures((prev) => prev.map((f) => (f.feature_key === key ? { ...f, [field]: value } : f)));

  const handleSave = async () => {
    const days = parseInt(trialDays, 10);
    if (mode === 'venue_plan' && (!Number.isFinite(days) || days < 0 || days > 365)) {
      Alert.alert('Error', 'Enter the free trial length as a number of days between 0 and 365.');
      return;
    }
    setSaving(true);
    const { error: settingsError } = await updateSubscriptionSettings({
      mode,
      venue_trial_days: Number.isFinite(days) ? Math.min(365, Math.max(0, days)) : 30,
    });
    const results = await Promise.all(features.map((f) =>
      updateFeatureAccess(f.feature_key, { enabled: f.enabled })
    ));
    setSaving(false);
    if (settingsError || results.some((r) => r.error)) {
      Alert.alert('Error', 'Could not save all changes. Please try again.');
      return;
    }
    Alert.alert('Saved', 'Access control settings updated.');
    refreshFeatureConfig();
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
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title="Access Control" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Subscription Plan</Text>
        {MODES.map(({ key, label, desc }) => {
          const selected = mode === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setMode(key)}
              activeOpacity={0.7}
            >
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
                <Text style={styles.optionDesc}>{desc}</Text>
              </View>
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}

        {mode === 'venue_plan' && (
          <View style={styles.trialRow}>
            <Text style={styles.trialLabel}>Free trial for new venues</Text>
            <View style={styles.trialInputWrap}>
              <TextInput
                style={styles.trialInput}
                value={trialDays}
                onChangeText={(v) => setTrialDays(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="30"
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={styles.trialUnit}>days from signup</Text>
            </View>
            <Text style={styles.sectionHint}>
              A venue can use every venue tool free for this long after it signs up, then needs a
              venue plan. Use 0 for no trial. Changing it applies to every venue straight away,
              including ones already signed up.
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>App Features</Text>
        <Text style={styles.sectionHint}>
          Turn a feature off to hide it from everyone — its Home card disappears and
          its screen becomes unreachable. Turn it back on to release it. Everything
          is on by default.
        </Text>

        {features.filter(TOGGLEABLE).map((f) => (
          <View key={`toggle-${f.feature_key}`} style={styles.featureRow}>
            <View style={styles.featureHeaderRow}>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <TouchableOpacity
                style={[styles.paidToggle, f.enabled && styles.paidToggleActive]}
                onPress={() => setFeatureField(f.feature_key, 'enabled', !f.enabled)}
              >
                <Text style={[styles.paidToggleText, f.enabled && styles.paidToggleTextActive]}>
                  {f.enabled ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color={COLORS.black} />
            : <Text style={styles.saveBtnText}>Save Changes</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  sectionHint: { fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginBottom: 14 },
  option: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.surfaceAlt },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  optionLabelSelected: { color: COLORS.primary },
  optionDesc: { fontSize: 12, color: COLORS.textLight, lineHeight: 17 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.borderAccent,
    justifyContent: 'center', alignItems: 'center', marginLeft: 12,
  },
  checkboxSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: COLORS.black, fontSize: 14, fontWeight: '700' },
  trialRow: { marginBottom: 20 },
  trialLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6 },
  trialInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  trialInput: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, width: 90,
    color: COLORS.text, backgroundColor: COLORS.surface, textAlign: 'center',
  },
  trialUnit: { fontSize: 13, color: COLORS.textMuted },
  featureRow: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  featureHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featureLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  paidToggle: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  paidToggleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  paidToggleText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  paidToggleTextActive: { color: COLORS.black },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
});

export default AdminAccessControlScreen;
