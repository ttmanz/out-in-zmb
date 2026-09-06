import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '../../constants/colors';
import { getSubscriptionSettings, updateSubscriptionSettings, getFeatureAccess, updateFeatureAccess } from '../../lib/subscription';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';

// Messages is core plumbing (conversations, "Message" buttons across the app),
// not a Home tab — keep it out of the on/off list.
const TOGGLEABLE = (f) => f.feature_key !== 'messages';

const MODES = [
  { key: 'free', label: 'Free', desc: 'Everyone has full access to every feature' },
  { key: 'free_until', label: 'Free Until…', desc: 'Free for everyone until a set date — after that, any active subscription (any plan, any tier) is required just to post anywhere. The paid list below does not apply in this mode.' },
  { key: 'free_except', label: 'Free Except…', desc: 'Everyone keeps full access, except the paid list below, which costs its one-off price unless subscribed (any plan, any tier)' },
  { key: 'free_except_venue', label: 'Free Except Venue', desc: 'Members keep full free access, same as "Free". Venue accounts get a 30-day trial from signup, then need an active subscription for the whole app. The paid list below does not apply in this mode.' },
];

const AdminAccessControlScreen = ({ navigation }) => {
  const { refreshFeatureConfig } = useUser();
  const [mode, setMode] = useState('free');
  const [freeUntil, setFreeUntil] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
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
      setMode(settings.mode ?? 'free');
      setFreeUntil(settings.free_until ? new Date(settings.free_until) : null);
    }
    setFeatures((featureData ?? []).map((f) => ({
      ...f,
      enabled: f.enabled !== false,
      one_off_price_draft: f.one_off_price != null ? String(f.one_off_price) : '',
    })));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setFeatureField = (key, field, value) =>
    setFeatures((prev) => prev.map((f) => (f.feature_key === key ? { ...f, [field]: value } : f)));

  const handleSave = async () => {
    if (mode === 'free_until' && !freeUntil) {
      Alert.alert('Error', 'Pick a date for "Free Until".');
      return;
    }
    setSaving(true);
    const { error: settingsError } = await updateSubscriptionSettings({
      mode,
      free_until: mode === 'free_until' ? freeUntil.toISOString() : null,
    });
    const results = await Promise.all(features.map((f) =>
      updateFeatureAccess(f.feature_key, {
        enabled: f.enabled,
        is_paid: f.is_paid,
        one_off_price: f.is_paid ? (parseFloat(f.one_off_price_draft) || null) : null,
      })
    ));
    setSaving(false);
    const featureError = results.find((r) => r.error);
    if (settingsError || featureError) {
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
        <Text style={styles.sectionLabel}>Subscription Mode</Text>
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

        {mode === 'free_until' && (
          <>
            <TouchableOpacity
              style={[styles.input, styles.dateBtn]}
              onPress={() => setShowPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={freeUntil ? styles.dateText : styles.datePlaceholder}>
                {freeUntil ? freeUntil.toLocaleDateString() : 'Tap to set the date'}
              </Text>
              <Text style={styles.dateIcon}>📅</Text>
            </TouchableOpacity>
            {showPicker && (
              <DateTimePicker
                value={freeUntil ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(event, selected) => {
                  if (Platform.OS === 'android') setShowPicker(false);
                  if (selected) setFreeUntil(selected);
                }}
              />
            )}
            {Platform.OS === 'ios' && showPicker && (
              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowPicker(false)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>App Features</Text>
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

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Paid / Premium Features</Text>
        <Text style={styles.sectionHint}>
          {mode === 'free_except'
            ? 'Right now: any subscribed member (any tier) posts these for free. Without a subscription, the one-off price applies.'
            : mode === 'free_until'
              ? 'Not in effect while mode is "Free Until" — after the date passes, any subscription alone unlocks everything, including these.'
              : mode === 'free_except_venue'
                ? 'Not in effect while mode is "Free Except Venue" — members stay free, venue accounts are gated by subscription alone.'
                : 'Not in effect while mode is "Free" — nobody is charged for anything.'}
        </Text>

        {features.map((f) => (
          <View key={f.feature_key} style={styles.featureRow}>
            <View style={styles.featureHeaderRow}>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <TouchableOpacity
                style={[styles.paidToggle, f.is_paid && styles.paidToggleActive]}
                onPress={() => setFeatureField(f.feature_key, 'is_paid', !f.is_paid)}
              >
                <Text style={[styles.paidToggleText, f.is_paid && styles.paidToggleTextActive]}>
                  {f.is_paid ? 'Paid' : 'Free'}
                </Text>
              </TouchableOpacity>
            </View>
            {f.is_paid && (
              <View style={styles.priceRow}>
                <Text style={styles.priceCurrency}>K</Text>
                <TextInput
                  style={styles.priceInput}
                  value={f.one_off_price_draft}
                  onChangeText={(v) => setFeatureField(f.feature_key, 'one_off_price_draft', v.replace(/[^0-9.]/g, ''))}
                  placeholder="5.00"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.priceHint}>per post</Text>
              </View>
            )}
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
  optionSelected: { borderColor: COLORS.primary, backgroundColor: 'rgba(253,171,83,0.12)' },
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
  input: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.surface, marginBottom: 4,
  },
  dateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 15, color: COLORS.text, flex: 1 },
  datePlaceholder: { fontSize: 15, color: COLORS.textMuted, flex: 1 },
  dateIcon: { fontSize: 18 },
  doneBtn: {
    alignSelf: 'flex-end', marginTop: 6, marginBottom: 4,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.primary, borderRadius: 8,
  },
  doneBtnText: { color: COLORS.black, fontWeight: '700', fontSize: 13 },
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
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  priceCurrency: { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  priceInput: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.surfaceAlt, width: 80,
  },
  priceHint: { fontSize: 12, color: COLORS.textMuted },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
});

export default AdminAccessControlScreen;
