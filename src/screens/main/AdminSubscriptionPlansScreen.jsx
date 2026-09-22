import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import {
  getAllSubscriptionPlans, updateSubscriptionPlan,
  getMembershipTiers, updateMembershipTier,
} from '../../lib/subscription';
import BackHeader from '../../components/common/BackHeader';

const AdminSubscriptionPlansScreen = ({ navigation }) => {
  const [tiers, setTiers] = useState([]);
  const [tierDrafts, setTierDrafts] = useState({});
  const [savingTier, setSavingTier] = useState(null);

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tiersRes, plansRes] = await Promise.all([
      getMembershipTiers(),
      getAllSubscriptionPlans(),
    ]);
    if (!tiersRes.error && tiersRes.data) {
      setTiers(tiersRes.data);
      const tierInitial = {};
      tiersRes.data.forEach((t) => {
        tierInitial[t.tier_key] = { label: t.label, daily_post_limit: t.daily_post_limit != null ? String(t.daily_post_limit) : '' };
      });
      setTierDrafts(tierInitial);
    }
    if (!plansRes.error && plansRes.data) {
      setPlans(plansRes.data);
      const initial = {};
      plansRes.data.forEach((p) => { initial[p.id] = { label: p.label, price_display: p.price_display, badge: p.badge ?? '', description: p.description ?? '', revenuecat_product_id: p.revenuecat_product_id ?? '', venue_price_display: p.venue_price_display ?? '', venue_revenuecat_product_id: p.venue_revenuecat_product_id ?? '' }; });
      setDrafts(initial);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setTierField = (tierKey, field, value) =>
    setTierDrafts((prev) => ({ ...prev, [tierKey]: { ...prev[tierKey], [field]: value } }));

  const handleSaveTier = async (tier) => {
    const d = tierDrafts[tier.tier_key];
    if (!d?.label?.trim()) {
      Alert.alert('Error', 'Label is required.');
      return;
    }
    setSavingTier(tier.tier_key);
    const { error } = await updateMembershipTier(tier.tier_key, {
      label: d.label.trim(),
      daily_post_limit: d.daily_post_limit.trim() ? parseInt(d.daily_post_limit, 10) : null,
    });
    setSavingTier(null);
    if (error) Alert.alert('Error', error.message);
    else load();
  };

  const setField = (planId, field, value) =>
    setDrafts((prev) => ({ ...prev, [planId]: { ...prev[planId], [field]: value } }));

  const handleSave = async (plan) => {
    const d = drafts[plan.id];
    if (!d?.label?.trim() || !d?.price_display?.trim()) {
      Alert.alert('Error', 'Label and price are required.');
      return;
    }
    setSaving(plan.id);
    const { error } = await updateSubscriptionPlan(plan.id, {
      label: d.label.trim(),
      price_display: d.price_display.trim(),
      badge: d.badge.trim() || null,
      description: d.description.trim() || null,
      revenuecat_product_id: d.revenuecat_product_id.trim() || null,
      venue_price_display: d.venue_price_display.trim() || null,
      venue_revenuecat_product_id: d.venue_revenuecat_product_id.trim() || null,
    });
    setSaving(null);
    if (error) Alert.alert('Error', error.message);
    else load();
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title="Subscription Plans" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Membership Tiers & Daily Post Limits</Text>
          <Text style={styles.sectionHint}>
            Leave the limit blank for unlimited posting. This caps posting across every feature
            combined (Stories, Happenings, Market, Events, Clubs, Clip of the Day, etc.) and is
            enforced automatically, not just displayed.
          </Text>

          {tiers.map((tier) => {
            const d = tierDrafts[tier.tier_key] ?? {};
            const isSaving = savingTier === tier.tier_key;
            return (
              <View key={tier.tier_key} style={styles.tierCard}>
                <Text style={styles.tierKey}>{tier.tier_key.toUpperCase()}</Text>

                <Text style={styles.fieldLabel}>Label</Text>
                <TextInput
                  style={styles.input}
                  value={d.label ?? ''}
                  onChangeText={(v) => setTierField(tier.tier_key, 'label', v)}
                  placeholderTextColor={COLORS.textMuted}
                  placeholder="e.g. Gold"
                />

                <Text style={styles.fieldLabel}>Daily Post Limit (blank = unlimited)</Text>
                <TextInput
                  style={styles.input}
                  value={d.daily_post_limit ?? ''}
                  onChangeText={(v) => setTierField(tier.tier_key, 'daily_post_limit', v.replace(/[^0-9]/g, ''))}
                  placeholderTextColor={COLORS.textMuted}
                  placeholder="e.g. 20"
                  keyboardType="number-pad"
                />

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => handleSaveTier(tier)}
                  disabled={isSaving}
                >
                  {isSaving
                    ? <ActivityIndicator color={COLORS.black} size="small" />
                    : <Text style={styles.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            );
          })}

          <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Paid Plans</Text>
          <Text style={styles.sectionHint}>Each tier offers Monthly, 6-Month and Annual pricing.</Text>

          {tiers.filter((t) => t.tier_key !== 'free').map((tier) => (
            <View key={tier.tier_key}>
              <Text style={styles.tierGroupTitle}>{tier.label}</Text>
              {plans.filter((p) => p.tier_key === tier.tier_key).map((plan) => {
                const d = drafts[plan.id] ?? {};
                const isSaving = saving === plan.id;
                return (
                  <View key={plan.id} style={styles.card}>
                    <Text style={styles.planId}>{plan.id.toUpperCase()}</Text>

                    <Text style={styles.fieldLabel}>Label</Text>
                    <TextInput
                      style={styles.input}
                      value={d.label ?? ''}
                      onChangeText={(v) => setField(plan.id, 'label', v)}
                      placeholderTextColor={COLORS.textMuted}
                      placeholder="e.g. Monthly"
                    />

                    <Text style={styles.fieldLabel}>Price Display</Text>
                    <TextInput
                      style={styles.input}
                      value={d.price_display ?? ''}
                      onChangeText={(v) => setField(plan.id, 'price_display', v)}
                      placeholderTextColor={COLORS.textMuted}
                      placeholder="e.g. K99 / month"
                    />

                    <Text style={styles.fieldLabel}>Badge (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={d.badge ?? ''}
                      onChangeText={(v) => setField(plan.id, 'badge', v)}
                      placeholderTextColor={COLORS.textMuted}
                      placeholder="e.g. Best Value"
                    />

                    <Text style={styles.fieldLabel}>Description (optional)</Text>
                    <TextInput
                      style={[styles.input, styles.inputMulti]}
                      value={d.description ?? ''}
                      onChangeText={(v) => setField(plan.id, 'description', v)}
                      placeholderTextColor={COLORS.textMuted}
                      placeholder="Short description..."
                      multiline
                    />

                    <Text style={styles.fieldLabel}>RevenueCat Product ID (member price)</Text>
                    <TextInput
                      style={styles.input}
                      value={d.revenuecat_product_id ?? ''}
                      onChangeText={(v) => setField(plan.id, 'revenuecat_product_id', v)}
                      placeholderTextColor={COLORS.textMuted}
                      placeholder="e.g. gold_monthly"
                      autoCapitalize="none"
                    />

                    <View style={styles.venueSection}>
                      <Text style={styles.venueSectionTitle}>🍸 Venue Owner Pricing</Text>
                      <Text style={styles.venueSectionHint}>Leave blank to charge venue owners the same as regular members.</Text>

                      <Text style={styles.fieldLabel}>Venue Owner Price Display</Text>
                      <TextInput
                        style={styles.input}
                        value={d.venue_price_display ?? ''}
                        onChangeText={(v) => setField(plan.id, 'venue_price_display', v)}
                        placeholderTextColor={COLORS.textMuted}
                        placeholder="e.g. K199 / month"
                      />

                      <Text style={styles.fieldLabel}>RevenueCat Product ID (venue-owner price)</Text>
                      <TextInput
                        style={styles.input}
                        value={d.venue_revenuecat_product_id ?? ''}
                        onChangeText={(v) => setField(plan.id, 'venue_revenuecat_product_id', v)}
                        placeholderTextColor={COLORS.textMuted}
                        placeholder="e.g. gold_monthly_venue"
                        autoCapitalize="none"
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={() => handleSave(plan)}
                      disabled={isSaving}
                    >
                      {isSaving
                        ? <ActivityIndicator color={COLORS.black} size="small" />
                        : <Text style={styles.saveBtnText}>Save</Text>
                      }
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17, marginBottom: 16 },
  tierGroupTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8, marginBottom: 10,
  },
  tierCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  tierKey: {
    fontSize: 11, fontWeight: '800', color: COLORS.primary,
    letterSpacing: 1.5, marginBottom: 14,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  planId: {
    fontSize: 11, fontWeight: '800', color: COLORS.primary,
    letterSpacing: 1.5, marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.background,
  },
  inputMulti: { height: 70, textAlignVertical: 'top' },
  venueSection: {
    marginTop: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  venueSectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  venueSectionHint: { fontSize: 11, color: COLORS.textLight, lineHeight: 15, marginBottom: 4 },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 14 },
});

export default AdminSubscriptionPlansScreen;
