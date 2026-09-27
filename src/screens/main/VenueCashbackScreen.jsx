import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { getMyCashbackClaims, getCashbackSettings, reportCashbackSpend } from '../../lib/cashback';
import { useUser } from '../../contexts/UserContext';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const formatZmw = (amount) => `K${Number(amount ?? 0).toFixed(2)}`;

const VenueCashbackScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [claims, setClaims] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [memberCode, setMemberCode] = useState('');
  const [spendAmount, setSpendAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [{ data: claimsData }, { data: settingsData }] = await Promise.all([
      getMyCashbackClaims(profile.id),
      getCashbackSettings(),
    ]);
    setClaims(claimsData ?? []);
    setSettings(settingsData ?? null);
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const preview = (() => {
    const spend = parseFloat(spendAmount);
    if (!settings || !spend || spend <= 0) return null;
    return Math.round(spend * (settings.percent / 100) * 100) / 100;
  })();

  const handleSubmit = async () => {
    if (!memberCode.trim()) {
      Alert.alert('Missing info', "Enter the customer's member code.");
      return;
    }
    const spend = parseFloat(spendAmount);
    if (!spend || spend <= 0) {
      Alert.alert('Missing info', 'Enter how much the customer spent.');
      return;
    }
    setSubmitting(true);
    const { data, error } = await reportCashbackSpend(memberCode.trim(), spend);
    setSubmitting(false);
    if (error) {
      Alert.alert('Error', error.message ?? 'Could not report this spend. Please try again.');
      return;
    }
    setMemberCode('');
    setSpendAmount('');
    setClaims((prev) => [{ ...data, member: null }, ...prev]);
    Alert.alert('Done', `${formatZmw(data.cashback_amount)} cash back credited to the customer.`);
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title="Report Cash Back" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Report a Customer's Spend</Text>
        <Text style={styles.sectionHint}>
          {settings
            ? `Customers get ${settings.percent}% of what they spend back in cash${settings.min_spend > 0 ? `, on spends of ${formatZmw(settings.min_spend)} or more` : ''}. Ask them to show the member code from their Invite Friends screen.`
            : 'Ask the customer to show the member code from their Invite Friends screen.'}
        </Text>

        <TextInput
          style={styles.input}
          value={memberCode}
          onChangeText={(v) => setMemberCode(v.toUpperCase())}
          placeholder="Customer's member code"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="characters"
          maxLength={10}
        />
        <TextInput
          style={styles.input}
          value={spendAmount}
          onChangeText={(v) => setSpendAmount(v.replace(/[^0-9.]/g, ''))}
          placeholder="Amount spent (ZMW)"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="decimal-pad"
        />

        {preview != null && (
          <Text style={styles.preview}>This will credit {formatZmw(preview)} cash back to the customer.</Text>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.submitBtnText}>Report Spend</Text>}
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Recent Claims</Text>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
        ) : claims.length === 0 ? (
          <Text style={styles.empty}>No cash back reported yet.</Text>
        ) : (
          claims.map((claim) => (
            <GradientBorder key={claim.id} radius={14} style={styles.claimOuter}>
              <View style={styles.claimCard}>
                <View style={styles.claimRow}>
                  <Text style={styles.claimName}>{claim.member?.full_name ?? 'Customer'}</Text>
                  <Text style={styles.claimTime}>{formatAgo(claim.created_at)}</Text>
                </View>
                <Text style={styles.claimMeta}>
                  Spent {formatZmw(claim.spend_amount)} → {formatZmw(claim.cashback_amount)} cash back
                </Text>
              </View>
            </GradientBorder>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  sectionHint: { fontSize: 12, color: COLORS.textMuted, marginBottom: 14, lineHeight: 17 },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderAccent,
    borderRadius: 14, padding: 14, marginBottom: 10,
    fontSize: 14, color: COLORS.text,
  },
  preview: { fontSize: 13, fontWeight: '700', color: COLORS.success, marginBottom: 10 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 6, marginBottom: 8,
  },
  submitBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
  empty: { fontSize: 14, color: COLORS.textMuted, marginTop: 8 },
  claimOuter: { marginBottom: 10 },
  claimCard: { backgroundColor: COLORS.surface, borderRadius: 13.5, padding: 14 },
  claimRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  claimName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  claimTime: { fontSize: 11, color: COLORS.textMuted },
  claimMeta: { fontSize: 12, color: COLORS.textLight },
});

export default VenueCashbackScreen;
