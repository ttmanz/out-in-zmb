import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getFeatureAccess, updateFeatureAccess } from '../../lib/subscription';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';

// Messages is core plumbing (conversations, "Message" buttons across the app),
// not a Home tab — keep it out of the on/off list.
const TOGGLEABLE = (f) => f.feature_key !== 'messages';

const AdminAccessControlScreen = ({ navigation }) => {
  const { refreshFeatureConfig } = useUser();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: featureData } = await getFeatureAccess();
    setFeatures((featureData ?? []).map((f) => ({ ...f, enabled: f.enabled !== false })));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setFeatureField = (key, field, value) =>
    setFeatures((prev) => prev.map((f) => (f.feature_key === key ? { ...f, [field]: value } : f)));

  const handleSave = async () => {
    setSaving(true);
    const results = await Promise.all(features.map((f) =>
      updateFeatureAccess(f.feature_key, { enabled: f.enabled })
    ));
    setSaving(false);
    if (results.some((r) => r.error)) {
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
        <Text style={styles.sectionLabel}>Membership Levels</Text>
        <Text style={styles.sectionHint}>
          Members are on the Free, Silver, Gold or Platinum level, and the daily post limit follows
          each member's level (set under Plans). No feature is blocked by a level — every member keeps
          full access.
        </Text>

        <Text style={styles.sectionLabel}>App Features</Text>
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
