import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ScrollView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getMyVenueOffer, setVenueCashbackOffer, getCashbackSettings, getVenueClaims, resolveCashbackClaim,
  getVenuePendingRedemptions, resolveCreditRedemption, getVenueCreditOutstanding,
  formatZmw, CLAIM_STATUS_LABEL, REWARD_LABEL,
} from '../../lib/cashback';
import { getSignedUrl } from '../../lib/storage';
import { useUser } from '../../contexts/UserContext';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const STATUS_COLOR = { confirmed: COLORS.success, rejected: COLORS.error, cancelled: COLORS.textMuted };

const VenueCashbackScreen = ({ navigation }) => {
  const { profile } = useUser();
  const [cashDraft, setCashDraft] = useState('');
  const [creditDraft, setCreditDraft] = useState('');
  const [discountDraft, setDiscountDraft] = useState('');
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
    const [offerRes, settingsRes, claimsRes, redemptionsRes, outstandingRes] = await Promise.all([
      getMyVenueOffer(profile.id),
      getCashbackSettings(),
      getVenueClaims(profile.id),
      getVenuePendingRedemptions(profile.id),
      getVenueCreditOutstanding(),
    ]);
    const claimsData = claimsRes.data ?? [];
    setCashDraft(String(offerRes.data?.cash_percent ?? 0));
    setCreditDraft(String(offerRes.data?.credit_percent ?? 0));
    setDiscountDraft(String(offerRes.data?.discount_percent ?? 0));
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

  const handleSaveOffer = async () => {
    setSavingOffer(true);
    const { error } = await setVenueCashbackOffer(
      parseFloat(cashDraft) || 0, parseFloat(creditDraft) || 0, parseFloat(discountDraft) || 0,
    );
    setSavingOffer(false);
    if (error) return Alert.alert('Error', error.message ?? 'Could not save your offer.');
    Alert.alert('Saved', 'Your offer is live. Customers will see it when they claim at your venue.');
  };

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
          ? `Take ${formatZmw(claim.cashback_amount)} off ${name}'s ${formatZmw(claim.spend_amount)} bill, then confirm. This can't be undone.`
          : `Does the photo show ${formatZmw(claim.spend_amount)} spent at your venue? ${name} will get ${formatZmw(claim.cashback_amount)} ${REWARD_LABEL[claim.reward_type]}. This can't be undone.`
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
        ? `Take ${formatZmw(redemption.amount)} off ${name}'s bill, then confirm. This can't be undone.`
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
      <BackHeader title="Cash Back" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Your offer</Text>
        <Text style={styles.sectionHint}>
          Choose any mix of rewards; set one to 0 to not offer it. Cash back (up to {maxCash}%) is paid to the customer
          in money. Store credit can only be spent at your venue. A discount comes off the customer's bill at the till.
        </Text>
        <View style={styles.offerRow}>
          <View style={styles.offerField}>
            <Text style={styles.fieldLabel}>Cash back %</Text>
            <TextInput
              style={styles.offerInput}
              value={cashDraft}
              onChangeText={(v) => setCashDraft(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.offerField}>
            <Text style={styles.fieldLabel}>Credit %</Text>
            <TextInput
              style={styles.offerInput}
              value={creditDraft}
              onChangeText={(v) => setCreditDraft(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.offerField}>
            <Text style={styles.fieldLabel}>Discount %</Text>
            <TextInput
              style={styles.offerInput}
              value={discountDraft}
              onChangeText={(v) => setDiscountDraft(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveOffer} disabled={savingOffer}>
          {savingOffer ? <ActivityIndicator color={COLORS.black} /> : <Text style={styles.saveBtnText}>Save offer</Text>}
        </TouchableOpacity>
        <Text style={styles.outstanding}>Store credit you owe customers: {formatZmw(outstanding)}</Text>

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
                          {claim.reward_type === 'discount' ? `Bill ${formatZmw(claim.spend_amount)}` : `Spent ${formatZmw(claim.spend_amount)}`}
                        </Text>
                        <Text style={styles.cardMeta}>{formatZmw(claim.cashback_amount)} {REWARD_LABEL[claim.reward_type]}</Text>
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
                    <Text style={styles.cardMeta}>{formatZmw(r.amount)} off their bill</Text>
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
                    {formatZmw(c.spend_amount)} → {formatZmw(c.cashback_amount)} {REWARD_LABEL[c.reward_type]} · {formatAgo(c.created_at)}
                  </Text>
                </View>
                <Text style={[styles.status, { color: STATUS_COLOR[c.status] }]}>{CLAIM_STATUS_LABEL[c.status]}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

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
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  sectionHint: { fontSize: 12, color: COLORS.textMuted, marginBottom: 14, lineHeight: 17 },
  offerRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  offerField: { flex: 1 },
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
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '85%' },
  viewerClose: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 28 },
  viewerCloseText: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
});

export default VenueCashbackScreen;
