import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { getSession, signOut } from '../../lib/auth';
import { getSubscriptionPlans, subscriptionStatus, planPriceFor } from '../../lib/subscription';
import { getOfferings, purchasePackage, restorePurchases } from '../../lib/purchases';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';

// Our 3 fixed plan durations map onto RevenueCat's predefined package slots.
const packageForPlan = (offering, durationMonths) => {
  if (!offering) return null;
  if (durationMonths === 1) return offering.monthly;
  if (durationMonths === 6) return offering.sixMonth;
  if (durationMonths === 12) return offering.annual;
  return null;
};

const SubscriptionScreen = ({ navigation, standalone = false }) => {
  const { t } = useTranslation();
  const { profile, refreshProfile, settings } = useUser();
  const [plans, setPlans] = useState([]);
  const [offering, setOffering] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [subscribing, setSubscribing] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const status = subscriptionStatus(profile, settings);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
    getSubscriptionPlans().then(({ data, error }) => {
      if (!error) setPlans(data ?? []);
      setLoading(false);
    });
    getOfferings(profile?.account_type).then(setOffering).catch(() => setOffering(null));
  }, [profile?.account_type]);

  const handleSubscribe = async (plan) => {
    if (!userId) return;
    const pkg = packageForPlan(offering, plan.duration_months);
    if (!pkg) {
      Alert.alert(t('common.error'), t('subscription.notAvailable'));
      return;
    }
    setSubscribing(plan.id);
    try {
      await purchasePackage(pkg);
      // RevenueCat's webhook confirms the purchase server-side within a few
      // seconds — poll briefly so this screen reflects it without the user
      // needing to reopen it.
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await refreshProfile();
      }
      if (!standalone && navigation) navigation.goBack();
    } catch (e) {
      if (!e.userCancelled) Alert.alert(t('common.error'), e.message);
    } finally {
      setSubscribing(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restorePurchases();
      await refreshProfile();
      Alert.alert(t('subscription.restoreDoneTitle'), t('subscription.restoreDoneBody'));
    } catch (e) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setRestoring(false);
    }
  };

  const statusBanner = () => {
    if (!profile) return null;
    if (status.isOnTrial && status.daysLeft > 0) {
      return (
        <View style={styles.trialBanner}>
          <Text style={styles.trialTitle}>🎉 {t('subscription.trialActive')}</Text>
          <Text style={styles.trialSub}>
            {t('subscription.trialDaysLeft', { days: status.daysLeft })}
          </Text>
        </View>
      );
    }
    if (status.isActive) {
      return (
        <View style={[styles.trialBanner, styles.activeBanner]}>
          <Text style={styles.trialTitle}>✅ {t('subscription.activeTitle')}</Text>
          <Text style={styles.trialSub}>
            {t('subscription.activeDaysLeft', { days: status.daysLeft })}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.trialBanner, styles.expiredBanner]}>
        <Text style={styles.trialTitle}>⚠️ {t('subscription.expiredTitle')}</Text>
        <Text style={styles.trialSub}>{t('subscription.expiredSub')}</Text>
      </View>
    );
  };

  return (
    <View style={styles.safe}>
      <BackHeader
        title={t('subscription.title')}
        onBack={!standalone && navigation ? () => navigation.goBack() : undefined}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {statusBanner()}

        <Text style={styles.sectionLabel}>{t('subscription.choosePlan')}</Text>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          plans.map((plan) => {
            const isCurrentPlan = status.isActive && status.planId === plan.id;
            return (
              <View key={plan.id} style={[styles.planCard, isCurrentPlan && styles.planCardActive]}>
                <View style={styles.planHeader}>
                  <Text style={styles.planLabel}>{plan.label}</Text>
                  {plan.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{plan.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.planPrice}>{planPriceFor(plan, profile)}</Text>
                {!!plan.description && (
                  <Text style={styles.planDesc}>{plan.description}</Text>
                )}
                {isCurrentPlan ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>✓ {t('subscription.currentPlan')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.subscribeBtn}
                    onPress={() => handleSubscribe(plan)}
                    disabled={subscribing !== null}
                  >
                    {subscribing === plan.id
                      ? <ActivityIndicator color={COLORS.black} size="small" />
                      : <Text style={styles.subscribeBtnText}>{t('subscription.subscribe')}</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={restoring}>
          {restoring
            ? <ActivityIndicator color={COLORS.primary} size="small" />
            : <Text style={styles.restoreBtnText}>{t('subscription.restorePurchases')}</Text>
          }
        </TouchableOpacity>

        {standalone && (
          <TouchableOpacity style={styles.restoreBtn} onPress={signOut}>
            <Text style={styles.signOutText}>{t('auth.logout')}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footerNote}>{t('subscription.footerNote')}</Text>
        <Text style={styles.legalNote}>
          {t('subscription.legalNote')}{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL('https://out-in-zmb.com/terms-of-service.html')}>
            {t('subscription.termsOfService')}
          </Text>
          {' '}{t('common.and')}{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL('https://out-in-zmb.com/privacy-policy.html')}>
            {t('subscription.privacyPolicy')}
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 60 },
  trialBanner: {
    backgroundColor: 'rgba(253,171,83,0.12)',
    borderWidth: 1, borderColor: COLORS.borderAccent,
    borderRadius: 14, padding: 16, marginBottom: 24,
  },
  activeBanner: { backgroundColor: 'rgba(46,204,113,0.1)', borderColor: '#2ecc71' },
  expiredBanner: { backgroundColor: 'rgba(231,76,60,0.1)', borderColor: '#e74c3c' },
  trialTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  trialSub: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16,
  },
  planCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 20, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  planCardActive: { borderColor: COLORS.primary, borderWidth: 2 },
  planHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  planLabel: { fontSize: 18, fontWeight: '800', color: COLORS.text, flex: 1 },
  badge: {
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: COLORS.black },
  planPrice: { fontSize: 22, fontWeight: '800', color: COLORS.primary, marginBottom: 6 },
  planDesc: { fontSize: 13, color: COLORS.textLight, lineHeight: 19, marginBottom: 14 },
  subscribeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginTop: 8,
  },
  subscribeBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
  currentBadge: {
    backgroundColor: 'rgba(46,204,113,0.12)', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 8,
    borderWidth: 1, borderColor: '#2ecc71',
  },
  currentBadgeText: { color: '#2ecc71', fontWeight: '700', fontSize: 14 },
  restoreBtn: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  restoreBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  signOutText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 13 },
  footerNote: {
    fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
    marginTop: 10, lineHeight: 17, paddingHorizontal: 16,
  },
  legalNote: {
    fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
    marginTop: 10, lineHeight: 17, paddingHorizontal: 16,
  },
  legalLink: { color: COLORS.primary, fontWeight: '700' },
});

export default SubscriptionScreen;
