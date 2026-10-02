import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ScrollView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getCountries, getMyVenueStatus, getMyVenueOffer, setVenueCashbackOffer, getCashbackSettings, getVenueClaims, resolveCashbackClaim,
  getVenuePendingRedemptions, resolveCreditRedemption, getVenueCreditOutstanding,
  formatAmount, PARTICIPATION_OPTIONS, rewardOptions, CLAIM_STATUS_LABEL, REWARD_LABEL,
} from '../../lib/cashback';
import { useCashBackEnabled } from '../../hooks/useCashBackEnabled';
import { getSignedUrl } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';
import { formatAgo } from '../../utils/format';
import { useVenueToolsGate } from '../../hooks/useVenueToolsGate';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const STATUS_COLOR = { confirmed: COLORS.success, rejected: COLORS.error, cancelled: COLORS.textMuted };

const VenueCashbackScreen = ({ navigation }) => {
  useVenueToolsGate();
  const { profile } = useUser();
  const cashEnabled = useCashBackEnabled();
  const [offered, setOffered] = useState([]);
  const [percents, setPercents] = useState({ cash: '', credit: '', discount: '' });
  const [approved, setApproved] = useState(true);
  const [countries, setCountries] = useState([]);
  const [countryCode, setCountryCode] = useState(null);
  const [showCountries, setShowCountries] = useState(false);
  const [maxCash, setMaxCash] = useState(0);
  const [claims, setClaims] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [receiptUrls, setReceiptUrls] = useState({});
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingOffer, setSavingOffer] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [countriesRes, statusRes, offerRes, settingsRes, claimsRes, redemptionsRes, outstandingRes] = await Promise.all([
      getCountries(),
      getMyVenueStatus(profile.id),
      getMyVenueOffer(profile.id),
      getCashbackSettings(),
      getVenueClaims(profile.id),
      getVenuePendingRedemptions(profile.id),
      getVenueCreditOutstanding(),
    ]);
    const claimsData = claimsRes.data ?? [];
    setCountries((countriesRes.data ?? []).filter((c) => c.is_active));
    setCountryCode(offerRes.data?.country_code ?? null);
    setApproved(statusRes.data?.venue_approved === true);
    setOffered(statusRes.data?.participation ?? []);
    const show = (n) => (Number(n) > 0 ? String(n) : '');
    setPercents({
      cash: show(offerRes.data?.cash_percent),
      credit: show(offerRes.data?.credit_percent),
      discount: show(offerRes.data?.discount_percent),
    });
    setMaxCash(Number(settingsRes.data?.max_cash_percent ?? 0));
    setClaims(claimsData);
    setRedemptions(redemptionsRes.data ?? []);
    setOutstanding(Number(outstandingRes.data ?? 0));

    const pending = claimsData.filter((c) => c.status === 'pending' && c.receipt_path);
    const urls = await Promise.all(pending.map((c) => getSignedUrl('receipts', c.receipt_path)));
    setReceiptUrls(Object.fromEntries(pending.map((c, i) => [c.id, urls[i]])));
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // The venue's country fixes the currency every claim at it is in.
  const currency = countries.find((c) => c.code === countryCode)?.currency_code ?? null;

  const handleSaveOffer = async () => {
    if (!countryCode) return Alert.alert('Choose your country', 'Your country sets the currency your customers\' rewards are in.');
    setSavingOffer(true);
    const { error } = await setVenueCashbackOffer(
      parseFloat(percents.cash) || 0, parseFloat(percents.credit) || 0, parseFloat(percents.discount) || 0,
      countryCode, offered,
    );
    setSavingOffer(false);
    if (error) return Alert.alert('Error', error.message ?? 'Could not save your offer.');
    Alert.alert('Saved', 'Your offer is live. Customers will see it when they claim at your venue.');
  };

  const toggleOffered = (key) =>
    setOffered((prev) => PARTICIPATION_OPTIONS.map((o) => o.key).filter((k) => (k === key ? !prev.includes(k) : prev.includes(k))));

  const percentLabel = { cash: 'Cash back %  (up to ' + maxCash + '%)', credit: 'Store credit %', discount: 'Discount %' };

  const resolve = async (id, action) => {
    setBusyId(id);
    const { error } = await action();
    setBusyId(null);
    if (error) return Alert.alert('Error', error.message ?? 'Could not update this.');
    load();
  };

  const confirmClaim = (claim, approve) => {
    const name = claim.member?.full_name ?? 'the customer';
    const isDiscount = claim.reward_type === 'discount';
    const what = isDiscount ? 'discount' : 'receipt';
    Alert.alert(
      approve ? `Confirm this ${what}?` : `Reject this ${what}?`,
      approve
        ? isDiscount
          ? `Take ${formatAmount(claim.cashback_amount, claim.currency_code)} off ${name}'s ${formatAmount(claim.spend_amount, claim.currency_code)} bill, then confirm. This can't be undone.`
          : `Does the photo show ${formatAmount(claim.spend_amount, claim.currency_code)} spent at your venue? ${name} will get ${formatAmount(claim.cashback_amount, claim.currency_code)} ${REWARD_LABEL[claim.reward_type]}. This can't be undone.`
        : `${name} won't get anything for this ${what}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Confirm' : 'Reject',
          style: approve ? 'default' : 'destructive',
          onPress: () => resolve(claim.id, () => resolveCashbackClaim(claim.id, approve)),
        },
      ],
    );
  };

  const confirmRedemption = (redemption, approve) => {
    const name = redemption.member?.full_name ?? 'The customer';
    Alert.alert(
      approve ? 'Confirm store credit use?' : 'Reject this request?',
      approve
        ? `Take ${formatAmount(redemption.amount, redemption.currency_code)} off ${name}'s bill, then confirm. This can't be undone.`
        : `${name} keeps their credit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Confirm' : 'Reject',
          style: approve ? 'default' : 'destructive',
          onPress: () => resolve(redemption.id, () => resolveCreditRedemption(redemption.id, approve)),
        },
      ],
    );
  };

  const pendingClaims = claims.filter((c) => c.status === 'pending');
  const recentClaims = claims.filter((c) => c.status !== 'pending').slice(0, 10);
  const waiting = pendingClaims.length + redemptions.length;

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title={cashEnabled ? 'Cash Back' : 'Rewards'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!loading && !approved && (
          <GradientBorder radius={14} style={styles.bannerOuter}>
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Waiting for approval</Text>
              <Text style={styles.bannerText}>
                An admin needs to approve your venue before customers can see it or send you receipts.
                You can set your offer now so it's ready.
              </Text>
            </View>
          </GradientBorder>
        )}

        <Text style={styles.sectionLabel}>Your offer</Text>
        <Text style={styles.sectionHint}>
          Tick the rewards you take part in, then give each a percentage. Customers only see what you tick. {cashEnabled ? 'Cash back is paid to the customer in money, store credit' : 'Store credit'} can only be spent at your venue, and a discount comes off
          the customer's bill at the till.
        </Text>
        <Text style={styles.fieldLabel}>Your country</Text>
        <TouchableOpacity style={styles.countryBtn} onPress={() => setShowCountries(true)} activeOpacity={0.8}>
          <Text style={countryCode ? styles.countryText : styles.countryPlaceholder}>
            {countryCode ? `${countries.find((c) => c.code === countryCode)?.name ?? countryCode} · ${currency ?? ''}` : 'Choose your country'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.sectionHint}>
          It sets the currency for your customers' rewards and can't be changed once customers have claimed with you.
        </Text>
        <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Participation</Text>
        {rewardOptions(cashEnabled).map((o) => {
          const on = offered.includes(o.key);
          return (
            <View key={o.key} style={[styles.rewardCard, on && styles.rewardCardOn]}>
              <TouchableOpacity style={styles.rewardTop} onPress={() => toggleOffered(o.key)} activeOpacity={0.85}>
                <Text style={styles.rewardEmoji}>{o.emoji}</Text>
                <View style={styles.rewardText}>
                  <Text style={styles.rewardTitle}>{o.label}</Text>
                  <Text style={styles.rewardDesc}>{o.desc}</Text>
                </View>
                <Text style={[styles.box, on && styles.boxOn]}>{on ? '✓' : ''}</Text>
              </TouchableOpacity>
              {on && (
                <View style={styles.percentRow}>
                  <Text style={styles.fieldLabel}>{percentLabel[o.key]}</Text>
                  <TextInput
                    style={styles.offerInput}
                    value={percents[o.key]}
                    onChangeText={(v) => setPercents((p) => ({ ...p, [o.key]: v.replace(/[^0-9.]/g, '') }))}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 5"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              )}
            </View>
          );
        })}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveOffer} disabled={savingOffer}>
          {savingOffer ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.saveBtnText}>Save offer</Text>}
        </TouchableOpacity>
        <Text style={styles.outstanding}>Store credit you owe customers: {formatAmount(outstanding, currency)}</Text>

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Waiting for you ({waiting})</Text>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 12 }} />
        ) : waiting === 0 ? (
          <Text style={styles.empty}>Nothing to confirm.</Text>
        ) : (
          <>
            {pendingClaims.map((claim) => {
              const busy = busyId === claim.id;
              const url = receiptUrls[claim.id];
              return (
                <GradientBorder key={claim.id} radius={14} style={styles.cardOuter}>
                  <View style={styles.card}>
                    <View style={styles.cardTop}>
                      <TouchableOpacity onPress={() => url && setViewing(url)} activeOpacity={0.8}>
                        {url
                          ? <Image source={{ uri: url }} style={styles.thumb} />
                          : <View style={[styles.thumb, styles.thumbMissing]}>
                              <Text style={styles.thumbMissingText}>{claim.reward_type === 'discount' ? 'Discount' : 'No photo'}</Text>
                            </View>
                        }
                      </TouchableOpacity>
                      <View style={styles.cardText}>
                        <Text style={styles.cardName}>{claim.member?.full_name ?? 'Customer'}</Text>
                        <Text style={styles.cardMeta}>
                          {claim.reward_type === 'discount' ? `Bill ${formatAmount(claim.spend_amount, claim.currency_code)}` : `Spent ${formatAmount(claim.spend_amount, claim.currency_code)}`}
                        </Text>
                        <Text style={styles.cardMeta}>{formatAmount(claim.cashback_amount, claim.currency_code)} {REWARD_LABEL[claim.reward_type]}</Text>
                        <Text style={styles.cardTime}>{formatAgo(claim.created_at)}{url ? ' · tap photo to enlarge' : ''}</Text>
                      </View>
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmClaim(claim, true)} disabled={busy}>
                        {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.confirmBtnText}>Confirm</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => confirmClaim(claim, false)} disabled={busy}>
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </GradientBorder>
              );
            })}

            {redemptions.map((r) => {
              const busy = busyId === r.id;
              return (
                <GradientBorder key={r.id} radius={14} style={styles.cardOuter}>
                  <View style={styles.card}>
                    <Text style={styles.cardName}>{r.member?.full_name ?? 'Customer'} wants to use store credit</Text>
                    <Text style={styles.cardMeta}>{formatAmount(r.amount, r.currency_code)} off their bill</Text>
                    <Text style={styles.cardTime}>{formatAgo(r.created_at)}</Text>
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmRedemption(r, true)} disabled={busy}>
                        {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.confirmBtnText}>Confirm</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => confirmRedemption(r, false)} disabled={busy}>
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </GradientBorder>
              );
            })}
          </>
        )}

        {recentClaims.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Recent receipts</Text>
            {recentClaims.map((c) => (
              <View key={c.id} style={styles.recentRow}>
                <View style={styles.cardText}>
                  <Text style={styles.cardName}>{c.member?.full_name ?? 'Customer'}</Text>
                  <Text style={styles.cardTime}>
                    {formatAmount(c.spend_amount, c.currency_code)} → {formatAmount(c.cashback_amount, c.currency_code)} {REWARD_LABEL[c.reward_type]} · {formatAgo(c.created_at)}
                  </Text>
                </View>
                <Text style={[styles.status, { color: STATUS_COLOR[c.status] }]}>{CLAIM_STATUS_LABEL[c.status]}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={showCountries} transparent animationType="fade" onRequestClose={() => setShowCountries(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Your country</Text>
            <ScrollView>
              {countries.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[styles.pickerRow, c.code === countryCode && styles.pickerRowActive]}
                  onPress={() => { setCountryCode(c.code); setShowCountries(false); }}
                >
                  <Text style={styles.pickerName}>{c.name}</Text>
                  <Text style={styles.pickerCurrency}>{c.currency_code}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.viewerClose} onPress={() => setShowCountries(false)}>
              <Text style={styles.viewerCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewerBackdrop}>
          {viewing && <Image source={{ uri: viewing }} style={styles.viewerImage} resizeMode="contain" />}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewing(null)}>
            <Text style={styles.viewerCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 48 },
  bannerOuter: { marginBottom: 20 },
  banner: { backgroundColor: COLORS.surface, borderRadius: 13.5, padding: 14 },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 4 },
  bannerText: { fontSize: 12, color: COLORS.textLight, lineHeight: 17 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  sectionHint: { fontSize: 12, color: COLORS.textMuted, marginBottom: 14, lineHeight: 17 },
  rewardCard: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rewardCardOn: { borderColor: COLORS.borderAccent },
  rewardTop: { flexDirection: 'row', alignItems: 'center' },
  rewardEmoji: { fontSize: 22, marginRight: 10 },
  rewardText: { flex: 1 },
  rewardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rewardDesc: { fontSize: 11, color: COLORS.textLight, marginTop: 2, lineHeight: 15 },
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: COLORS.borderAccent,
    textAlign: 'center', lineHeight: 21, fontSize: 15, fontWeight: '800', color: COLORS.black, overflow: 'hidden',
  },
  boxOn: { backgroundColor: COLORS.primary },
  percentRow: { marginTop: 10 },
  fieldLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  offerInput: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '700',
    color: COLORS.primary, backgroundColor: COLORS.surfaceAlt,
  },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  outstanding: { fontSize: 12, color: COLORS.textLight, marginTop: 10 },
  empty: { fontSize: 14, color: COLORS.textMuted, marginTop: 8 },
  cardOuter: { marginBottom: 12 },
  card: { backgroundColor: COLORS.surface, borderRadius: 13.5, padding: 14 },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 84, height: 112, borderRadius: 8, backgroundColor: COLORS.surfaceAlt },
  thumbMissing: { alignItems: 'center', justifyContent: 'center' },
  thumbMissingText: { fontSize: 11, color: COLORS.textMuted },
  cardText: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardMeta: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  cardTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  confirmBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  confirmBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  rejectBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.error, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.error },
  recentRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  status: { fontSize: 11, fontWeight: '800' },
  countryBtn: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderAccent,
    borderRadius: 14, padding: 14, marginBottom: 6,
  },
  countryText: { fontSize: 14, color: COLORS.text },
  countryPlaceholder: { fontSize: 14, color: COLORS.textMuted },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  pickerCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, maxHeight: '80%' },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10,
  },
  pickerRowActive: { backgroundColor: COLORS.surfaceAlt },
  pickerName: { fontSize: 14, color: COLORS.text },
  pickerCurrency: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '85%' },
  viewerClose: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 28 },
  viewerCloseText: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
});

export default VenueCashbackScreen;
