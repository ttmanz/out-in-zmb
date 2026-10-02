import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';

// Venue Plan mode: tells a venue how long its free trial has left, or that it has
// ended — until it subscribes.
const VenueTrialBanner = ({ navigation }) => {
  const { t } = useTranslation();
  const { venueAccess } = useUser();
  if (!venueAccess?.applies || venueAccess.subscribed) return null;
  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => navigation.navigate(ROUTES.SUBSCRIPTION)}
      activeOpacity={0.85}
    >
      <Text style={styles.text}>
        {venueAccess.locked
          ? t('subscription.venueBannerLocked')
          : t('subscription.venueBannerTrial', { days: venueAccess.trialDaysLeft })}
      </Text>
    </TouchableOpacity>
  );
};

const ProfileBanner = ({ navigation }) => {
  const { profile } = useUser();

  return (
    <View>
      <VenueTrialBanner navigation={navigation} />
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
});

export default ProfileBanner;
