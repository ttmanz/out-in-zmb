import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { useUser } from '../../contexts/UserContext';
import { planPriceFor } from '../../lib/subscription';

const UpcomingChargeBanner = ({ navigation }) => {
  const { t } = useTranslation();
  const { profile, settings, monthlyPlan } = useUser();
  const stillFree = settings?.mode === 'free_until'
    && settings?.free_until
    && new Date(settings.free_until) > new Date();
  if (!stillFree) return null;

  const date = new Date(settings.free_until).toLocaleDateString();
  const price = monthlyPlan ? planPriceFor(monthlyPlan, profile) : null;

  return (
    <TouchableOpacity
      style={[styles.banner, styles.chargeBanner]}
      onPress={() => navigation.navigate(ROUTES.SUBSCRIPTION)}
      activeOpacity={0.85}
    >
      <Text style={styles.text}>
        {price
          ? t('subscription.upcomingCharge', { date, price })
          : t('subscription.upcomingChargeNoPrice', { date })}
      </Text>
    </TouchableOpacity>
  );
};

const ProfileBanner = ({ navigation }) => {
  const { profile } = useUser();

  return (
    <View>
      <UpcomingChargeBanner navigation={navigation} />
      {profile && !profile.profile_completed && (
        <TouchableOpacity
          style={styles.banner}
          onPress={() => navigation.navigate(ROUTES.COMPLETE_PROFILE)}
          activeOpacity={0.85}
        >
          <Text style={styles.text}>✦  Complete your profile for full access</Text>
          <Text style={styles.cta}>Tap to finish →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: 'rgba(253,171,83,0.12)',
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  text: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 1 },
  cta: { fontSize: 11, color: COLORS.textMuted },
  chargeBanner: { backgroundColor: 'rgba(231,76,60,0.1)', borderColor: '#e74c3c' },
});

export default ProfileBanner;
