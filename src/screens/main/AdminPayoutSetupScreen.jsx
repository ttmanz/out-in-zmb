import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Switch,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getCountries, updateCountry, addCountry,
  getAllPayoutMethods, updatePayoutMethod, addPayoutMethod, deletePayoutMethod,
} from '../../lib/cashback';
import BackHeader from '../../components/common/BackHeader';

const EMPTY_COUNTRY = { code: '', name: '', currency: '' };
const EMPTY_METHOD = { countryCode: '', methodKey: '', label: '', detailLabel: '', detailPattern: '' };

const AdminPayoutSetupScreen = ({ navigation }) => {
  const [countries, setCountries] = useState([]);
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [newCountry, setNewCountry] = useState(EMPTY_COUNTRY);
  const [newMethod, setNewMethod] = useState(EMPTY_METHOD);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: countriesData }, { data: methodsData }] = await Promise.all([getCountries(), getAllPayoutMethods()]);
    setCountries((countriesData ?? []).map((c) => ({ ...c, currency_draft: c.currency_code, min_spend_draft: String(c.min_spend) })));
    setMethods(methodsData ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Runs one write, reports the database's own error text if it fails, then reloads.
  const run = async (key, action, failMessage) => {
    setBusyKey(key);
    const { error } = await action();
    setBusyKey(null);
    if (error) {
      Alert.alert('Error', error.message ?? failMessage);
      return false;
    }
    load();
    return true;
  };

  const setCountryDraft = (code, field, value) =>
    setCountries((prev) => prev.map((c) => (c.code === code ? { ...c, [field]: value } : c)));

  const saveCountry = (c) => {
    const minSpend = parseFloat(c.min_spend_draft);
    if (!Number.isFinite(minSpend) || minSpend < 0) return Alert.alert('Error', 'Enter 0 or more for the minimum spend.');
    return run(`country-${c.code}`, () => updateCountry(c.code, {
      currency_code: c.currency_draft.trim().toUpperCase(), min_spend: minSpend,
    }), 'Could not save this country.');
  };

  const handleAddCountry = async () => {
    const ok = await run('add-country', () => addCountry({
      code: newCountry.code.trim().toUpperCase(),
      name: newCountry.name.trim(),
      currencyCode: newCountry.currency.trim().toUpperCase(),
    }), 'Could not add this country.');
    if (ok) setNewCountry(EMPTY_COUNTRY);
  };

  const handleAddMethod = async () => {
    const ok = await run('add-method', () => addPayoutMethod({
      countryCode: newMethod.countryCode.trim().toUpperCase(),
      methodKey: newMethod.methodKey.trim().toLowerCase(),
      label: newMethod.label.trim(),
      detailLabel: newMethod.detailLabel.trim(),
      detailPattern: newMethod.detailPattern.trim(),
    }), 'Could not add this payout method.');
    if (ok) setNewMethod(EMPTY_METHOD);
  };

  const handleDeleteMethod = (m) => {
    Alert.alert(`Delete ${m.label}?`, 'Past payout requests keep the name they were made with.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(`del-${m.id}`, () => deletePayoutMethod(m.id), 'Could not delete this method.') },
    ]);
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
      <BackHeader title="Countries & Payouts" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Countries</Text>
        <Text style={styles.hint}>
          A venue picks its country, which sets the currency of every claim there. Minimum spend is the smallest receipt
          that qualifies, in that currency. Turn a country off to stop venues choosing it.
        </Text>
        {countries.map((c) => (
          <View key={c.code} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{c.name} ({c.code})</Text>
              <Switch
                value={c.is_active}
                onValueChange={(v) => run(`active-${c.code}`, () => updateCountry(c.code, { is_active: v }), 'Could not update this country.')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Currency code</Text>
                <TextInput
                  style={styles.input}
                  value={c.currency_draft}
                  onChangeText={(v) => setCountryDraft(c.code, 'currency_draft', v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={3}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Minimum spend</Text>
                <TextInput
                  style={styles.input}
                  value={c.min_spend_draft}
                  onChangeText={(v) => setCountryDraft(c.code, 'min_spend_draft', v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                />
              </View>
              <TouchableOpacity style={styles.saveBtn} onPress={() => saveCountry(c)} disabled={busyKey === `country-${c.code}`}>
                {busyKey === `country-${c.code}` ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Add a country</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <TextInput style={[styles.input, styles.short]} value={newCountry.code} placeholder="ZM" placeholderTextColor={COLORS.textMuted}
              onChangeText={(v) => setNewCountry((p) => ({ ...p, code: v.toUpperCase() }))} autoCapitalize="characters" maxLength={2} />
            <TextInput style={[styles.input, styles.grow]} value={newCountry.name} placeholder="Country name" placeholderTextColor={COLORS.textMuted}
              onChangeText={(v) => setNewCountry((p) => ({ ...p, name: v }))} />
            <TextInput style={[styles.input, styles.short]} value={newCountry.currency} placeholder="ZMW" placeholderTextColor={COLORS.textMuted}
              onChangeText={(v) => setNewCountry((p) => ({ ...p, currency: v.toUpperCase() }))} autoCapitalize="characters" maxLength={3} />
          </View>
          <Text style={styles.fieldHint}>2-letter country code, name, 3-letter currency code</Text>
          <TouchableOpacity style={styles.addBtn} onPress={handleAddCountry} disabled={busyKey === 'add-country'}>
            {busyKey === 'add-country' ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.saveBtnText}>Add country</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Payout methods</Text>
        <Text style={styles.hint}>
          A member cashing out picks from the methods that can pay their currency: methods for a country that uses it,
          plus any set to "Everywhere". You pay by hand for now; the request records which method was chosen.
        </Text>
        {methods.map((m) => (
          <View key={m.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.grow}>
                <Text style={styles.cardTitle}>{m.label}</Text>
                <Text style={styles.fieldHint}>{m.countries?.name ?? 'Everywhere'} · asks for "{m.detail_label}"</Text>
              </View>
              <Switch
                value={m.is_active}
                onValueChange={(v) => run(`m-${m.id}`, () => updatePayoutMethod(m.id, { is_active: v }), 'Could not update this method.')}
                trackColor={{ true: COLORS.primary }}
              />
            </View>
            <TouchableOpacity onPress={() => handleDeleteMethod(m)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Add a payout method</Text>
        <View style={styles.card}>
          <TextInput style={styles.input} value={newMethod.countryCode} placeholder="Country code (blank = everywhere)" placeholderTextColor={COLORS.textMuted}
            onChangeText={(v) => setNewMethod((p) => ({ ...p, countryCode: v.toUpperCase() }))} autoCapitalize="characters" maxLength={2} />
          <TextInput style={[styles.input, styles.gap]} value={newMethod.label} placeholder="Name shown to members, e.g. MTN Mobile Money" placeholderTextColor={COLORS.textMuted}
            onChangeText={(v) => setNewMethod((p) => ({ ...p, label: v }))} />
          <TextInput style={[styles.input, styles.gap]} value={newMethod.methodKey} placeholder="Short key, e.g. mtn_momo" placeholderTextColor={COLORS.textMuted}
            onChangeText={(v) => setNewMethod((p) => ({ ...p, methodKey: v }))} autoCapitalize="none" />
          <TextInput style={[styles.input, styles.gap]} value={newMethod.detailLabel} placeholder="What to ask for, e.g. MTN mobile number" placeholderTextColor={COLORS.textMuted}
            onChangeText={(v) => setNewMethod((p) => ({ ...p, detailLabel: v }))} />
          <TextInput style={[styles.input, styles.gap]} value={newMethod.detailPattern} placeholder="Optional pattern the details must match (regex)" placeholderTextColor={COLORS.textMuted}
            onChangeText={(v) => setNewMethod((p) => ({ ...p, detailPattern: v }))} autoCapitalize="none" />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddMethod} disabled={busyKey === 'add-method'}>
            {busyKey === 'add-method' ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.saveBtnText}>Add method</Text>}
          </TouchableOpacity>
        </View>
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
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  hint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17, marginBottom: 12 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  fieldHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13,
    color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
  },
  short: { width: 64, textAlign: 'center' },
  grow: { flex: 1 },
  gap: { marginTop: 8 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14 },
  saveBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.black },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  deleteText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
});

export default AdminPayoutSetupScreen;
