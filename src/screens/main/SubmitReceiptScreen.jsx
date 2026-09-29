import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../constants/colors';
import { getCashbackVenues, getCashbackSettings, submitCashbackClaim, formatAmount } from '../../lib/cashback';
import { uploadReceipt } from '../../lib/storage';
import { resizeForUpload } from '../../lib/imageResize';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const RECEIPT_MAX_EDGE = 1600;

const offersFor = (venue) => {
  if (!venue) return [];
  const list = [];
  if (Number(venue.cash_percent) > 0) list.push({ type: 'cash', label: 'Cash back', percent: Number(venue.cash_percent) });
  if (Number(venue.credit_percent) > 0) list.push({ type: 'credit', label: `Store credit at ${venue.venue_name}`, percent: Number(venue.credit_percent) });
  if (Number(venue.discount_percent) > 0) list.push({ type: 'discount', label: 'Discount off your bill', percent: Number(venue.discount_percent) });
  return list;
};

const SubmitReceiptScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [venues, setVenues] = useState([]);
  const [minSpend, setMinSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState(null);
  const [rewardType, setRewardType] = useState(null);
  const [receiptUri, setReceiptUri] = useState(null);
  const [amount, setAmount] = useState('');
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: venuesData }, { data: settingsData }] = await Promise.all([
      getCashbackVenues(),
      getCashbackSettings(),
    ]);
    setVenues(venuesData ?? []);
    setMinSpend(Number(settingsData?.min_spend ?? 0));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const venue = useMemo(() => venues.find((v) => v.venue_owner_id === venueId) ?? null, [venues, venueId]);
  const offers = useMemo(() => offersFor(venue), [venue]);

  const chooseVenue = (v) => {
    setVenueId(v.venue_owner_id);
    const list = offersFor(v);
    setRewardType(list.length === 1 ? list[0].type : null);
  };

  const isDiscount = rewardType === 'discount';
  const spend = parseFloat(amount);
  const chosen = offers.find((o) => o.type === rewardType);
  const reward = chosen && spend > 0 ? Math.round(spend * chosen.percent) / 100 : null;

  const capture = async (fromCamera) => {
    setPicking(true);
    try {
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera needed', 'Allow camera access to photograph your receipt.');
          return;
        }
      }
      const options = { mediaTypes: ['images'], allowsEditing: false, quality: 0.8 };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      const uri = result.assets?.[0]?.uri;
      if (!result.canceled && uri) setReceiptUri(await resizeForUpload(uri, RECEIPT_MAX_EDGE));
    } finally {
      setPicking(false);
    }
  };

  const handleSubmit = async () => {
    if (!venue) return Alert.alert('Missing info', 'Choose the venue you spent at.');
    if (!rewardType) return Alert.alert('Missing info', 'Choose what you\'d like from this venue.');
    if (!isDiscount && !receiptUri) return Alert.alert('Missing info', 'Add a photo of your receipt.');
    if (!spend || spend <= 0) return Alert.alert('Missing info', isDiscount ? 'Enter your bill total.' : 'Enter the total on your receipt.');
    if (spend < minSpend) return Alert.alert('Too small', `The minimum is ${formatAmount(minSpend)}.`);

    setSubmitting(true);
    let path = null;
    if (receiptUri) {
      const upload = await uploadReceipt(profile.id, receiptUri);
      if (upload.error) {
        setSubmitting(false);
        return Alert.alert('Error', 'Could not upload your photo. Check your connection and try again.');
      }
      path = upload.path;
    }
    const { error } = await submitCashbackClaim(venue.venue_owner_id, spend, path, rewardType);
    setSubmitting(false);
    if (error) return Alert.alert('Error', error.message ?? 'Could not send this. Please try again.');

    Alert.alert(
      'Sent',
      isDiscount
        ? `Ask ${venue.venue_name} to confirm your discount at the till — they'll get an alert.`
        : `${venue.venue_name} will check your receipt. You'll get an alert once they confirm it.`,
    );
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title="Submit a Receipt" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Where did you spend?</Text>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
        ) : venues.length === 0 ? (
          <Text style={styles.empty}>No venues are offering rewards yet.</Text>
        ) : (
          venues.map((v) => {
            const selected = v.venue_owner_id === venueId;
            const parts = [];
            if (Number(v.cash_percent) > 0) parts.push(`${Number(v.cash_percent)}% cash back`);
            if (Number(v.credit_percent) > 0) parts.push(`${Number(v.credit_percent)}% store credit`);
            if (Number(v.discount_percent) > 0) parts.push(`${Number(v.discount_percent)}% off your bill`);
            return (
              <TouchableOpacity
                key={v.venue_owner_id}
                style={[styles.optionRow, selected && styles.optionRowSelected]}
                onPress={() => chooseVenue(v)}
                activeOpacity={0.8}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{v.venue_name}</Text>
                  <Text style={styles.optionDesc}>{parts.join(' · ')}</Text>
                </View>
                <Text style={styles.check}>{selected ? '●' : '○'}</Text>
              </TouchableOpacity>
            );
          })
        )}

        {offers.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>What would you like?</Text>
            {offers.map((o) => {
              const selected = o.type === rewardType;
              const value = spend > 0 ? ` — ${formatAmount(Math.round(spend * o.percent) / 100)}` : '';
              return (
                <TouchableOpacity
                  key={o.type}
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  onPress={() => setRewardType(o.type)}
                  activeOpacity={0.8}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{o.label}</Text>
                    <Text style={styles.optionDesc}>{o.percent}%{value}</Text>
                  </View>
                  <Text style={styles.check}>{selected ? '●' : '○'}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <Text style={styles.sectionLabel}>{isDiscount ? 'Photo of your bill (optional)' : 'Photograph your receipt'}</Text>
        {receiptUri ? (
          <View>
            <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="contain" />
            <TouchableOpacity onPress={() => setReceiptUri(null)}>
              <Text style={styles.removeText}>✕ Retake</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoBtn} onPress={() => capture(true)} disabled={picking}>
              <Text style={styles.photoBtnText}>{picking ? 'Opening…' : '📷 Take photo'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={() => capture(false)} disabled={picking}>
              <Text style={styles.photoBtnText}>🖼️ From gallery</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionLabel}>{isDiscount ? 'Bill total (before discount)' : 'Total on the receipt'}</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="decimal-pad"
        />
        <Text style={styles.hint}>
          {minSpend > 0 ? `Minimum ${formatAmount(minSpend)}. ` : ''}
          {isDiscount ? 'Do this before you pay — the venue takes the discount off your bill.' : 'The venue will check this against your photo.'}
        </Text>

        {reward != null && (
          <GradientBorder radius={14} style={styles.summaryOuter}>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {isDiscount
                  ? `You'll get ${formatAmount(reward)} off your ${formatAmount(spend)} bill once ${venue.venue_name} confirms.`
                  : `You'll get ${formatAmount(reward)} ${chosen.type === 'cash' ? 'cash back' : `store credit at ${venue.venue_name}`} once they confirm.`}
              </Text>
            </View>
          </GradientBorder>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.submitBtnText}>Send to venue</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 18, marginBottom: 8,
  },
  empty: { fontSize: 14, color: COLORS.textMuted },
  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  optionRowSelected: { borderColor: COLORS.borderAccent },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  optionDesc: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  check: { fontSize: 18, color: COLORS.primary },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.borderAccent, borderStyle: 'dashed',
    backgroundColor: 'rgba(253,171,83,0.04)',
  },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  preview: { width: '100%', height: 260, borderRadius: 12, backgroundColor: COLORS.surface },
  removeText: { fontSize: 13, fontWeight: '600', color: COLORS.error, marginTop: 8 },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderAccent,
    borderRadius: 14, padding: 14, fontSize: 14, color: COLORS.text,
  },
  hint: { fontSize: 12, color: COLORS.textMuted, marginTop: 6, lineHeight: 17 },
  summaryOuter: { marginTop: 18 },
  summary: { backgroundColor: COLORS.surface, borderRadius: 13.5, padding: 14 },
  summaryText: { fontSize: 14, fontWeight: '700', color: COLORS.success, textAlign: 'center' },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 20,
  },
  submitBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
});

export default SubmitReceiptScreen;
