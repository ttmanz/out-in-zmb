import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { useUser } from '../../contexts/UserContext';

const ProfileBanner = ({ navigation }) => {
  const { profile } = useUser();

  return (
    <View>
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
