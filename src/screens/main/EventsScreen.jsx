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

const EVENT_CATEGORIES = [
  { key: 'product_launch', icon: 'rocket',    image: require('../../../assets/brand/icon-events-product-launch.png') },
  { key: 'workshop',       icon: 'construct', image: require('../../../assets/brand/icon-events-workshop.png') },
  // No dedicated icon supplied yet for "conference" — falls back to the vector icon.
  { key: 'conference',     icon: 'mic' },
  { key: 'networking',     icon: 'people',    image: require('../../../assets/brand/icon-events-networking.png') },
  { key: 'other',          icon: 'bookmark',  image: require('../../../assets/brand/icon-events-other.png') },
];

const CategoryCard = ({ icon, image, title, onPress }) => (
  <GradientBorder radius={16} style={styles.cardOuter}>
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <GradientIconCircle name={icon} image={image} size={46} iconSize={26} style={styles.icon} />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  </GradientBorder>
);

const EventsScreen = ({ navigation }) => {
  useFeatureGate('events');
  const { t } = useTranslation();

  return (
    <View style={styles.safe}>
      <BackHeader title={t('events.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <AdBanner page="Events" />
        <ProfileBanner navigation={navigation} />
        {EVENT_CATEGORIES.map(({ key, icon, image }) => (
          <CategoryCard
            key={key}
            icon={icon}
            image={image}
            title={t(`events.${key}`)}
            onPress={() => navigation.navigate(ROUTES.EVENT_FEED, { category: key })}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingTop: 24 },
  cardOuter: { marginBottom: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  icon: { marginRight: 14 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  chevron: { fontSize: 22, color: COLORS.primary, marginLeft: 4 },
});

export default EventsScreen;
