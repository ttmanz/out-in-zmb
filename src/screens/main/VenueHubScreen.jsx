import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { ROUTES } from '../../constants/routes';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';
import { GradientIconCircle } from '../../components/common/GradientIcon';

const OPTIONS = [
  { image: require('../../../assets/brand/icon-venue-search.png'),      titleKey: 'venueHub.search',     descKey: 'venueHub.searchDesc',     route: ROUTES.VENUE_SEARCH },
  { image: require('../../../assets/brand/icon-venue-members-at.png'),  titleKey: 'venueHub.membersAt',  descKey: 'venueHub.membersAtDesc',  route: ROUTES.MEMBERS_AT },
  { image: require('../../../assets/brand/icon-venue-top.png'),         titleKey: 'venueHub.topVenues',  descKey: 'venueHub.topVenuesDesc',  route: ROUTES.TOP_VENUES },
  { image: require('../../../assets/brand/icon-venue-reviews.png'),     titleKey: 'venueHub.reviews',    descKey: 'venueHub.reviewsDesc',    route: ROUTES.VENUE_REVIEWS },
];

const VenueHubScreen = ({ navigation }) => {
  useFeatureGate('venue_hub');
  const { t } = useTranslation();

  return (
    <View style={styles.safe}>
      <BackHeader title={t('home.venue')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <AdBanner page="VenueHub" />
        <ProfileBanner navigation={navigation} />
        {OPTIONS.map((opt) => (
          <GradientBorder key={opt.route} radius={16} style={styles.cardOuter}>
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate(opt.route)}
              activeOpacity={0.8}
            >
              <GradientIconCircle image={opt.image} size={54} iconSize={28} style={styles.icon} />
              <View style={styles.textWrap}>
                <Text style={styles.cardTitle}>{t(opt.titleKey)}</Text>
                <Text style={styles.cardDesc}>{t(opt.descKey)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </GradientBorder>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 40 },
  cardOuter: { marginBottom: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  icon: { marginRight: 14 },
  textWrap: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  cardDesc: { fontSize: 12, color: COLORS.textLight, lineHeight: 16 },
  chevron: { fontSize: 22, color: COLORS.primary, marginLeft: 4 },
});

export default VenueHubScreen;
