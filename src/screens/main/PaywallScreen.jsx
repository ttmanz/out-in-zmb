import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { getFeatureAccess } from '../../lib/subscription';
import { purchaseFeatureUnlock } from '../../lib/purchases';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';

// Shown when canAccessFeature() blocks a specific feature behind a one-off
// price (the user already has an active plan, it just doesn't cover this
// feature) — replaces the old dead-end Alert with a real purchase flow.
const PaywallScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { refreshProfile } = useUser();
  const { featureKey } = route.params;
  const [feature, setFeature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    getFeatureAccess().then(({ data, error }) => {
      if (!error) setFeature((data ?? []).find((f) => f.feature_key === featureKey) ?? null);
      setLoading(false);
    });
  }, [featureKey]);

  const handleUnlock = async () => {
    setPurchasing(true);
    try {
      await purchaseFeatureUnlock(featureKey);
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await refreshProfile();
      }
      navigation.goBack();
    } catch (e) {
      if (!e.userCancelled) Alert.alert(t('common.error'), e.message);
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <View style={styles.safe}>
      <BackHeader title={t('subscription.title')} onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.card}>
          <Text style={styles.icon}>🔒</Text>
          <Text style={styles.title}>
            {t('subscription.unlockFeature', { feature: feature?.label ?? featureKey })}
          </Text>
          <Text style={styles.desc}>{t('subscription.unlockDesc')}</Text>

          <TouchableOpacity style={styles.unlockBtn} onPress={handleUnlock} disabled={purchasing}>
            {purchasing
              ? <ActivityIndicator color={COLORS.black} size="small" />
              : (
                <Text style={styles.unlockBtnText}>
                  {t('subscription.unlockFor', { price: `K${feature?.one_off_price ?? ''}` })}
                </Text>
              )
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  card: { padding: 24, alignItems: 'center', marginTop: 20 },
  icon: { fontSize: 40, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 10 },
  desc: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  unlockBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  unlockBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
});

export default PaywallScreen;
