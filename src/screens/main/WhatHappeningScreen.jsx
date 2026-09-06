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

const CATEGORIES = [
  { key: 'myStory',     image: require('../../../assets/brand/icon-my-story.png'),          screen: ROUTES.STORY_FEED },
  { key: 'today',       image: require('../../../assets/brand/icon-happening-today.png') },
  { key: 'tomorrow',    image: require('../../../assets/brand/icon-happening-tomorrow.png') },
  { key: 'thisWeekend', image: require('../../../assets/brand/icon-happening-weekend.png') },
  { key: 'nearby',      image: require('../../../assets/brand/icon-activities.png'),        screen: ROUTES.ACTIVITIES },
];

const CategoryCard = ({ image, title, onPress }) => (
  <GradientBorder radius={16} style={styles.cardOuter}>
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <GradientIconCircle image={image} size={46} iconSize={26} style={styles.icon} />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  </GradientBorder>
);

const WhatHappeningScreen = ({ navigation }) => {
  useFeatureGate('whats_happening');
  const { t } = useTranslation();

  return (
    <View style={styles.safe}>
      <BackHeader title={t('happenings.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <AdBanner page="WhatHappening" />
        <ProfileBanner navigation={navigation} />
        {CATEGORIES.map(({ key, image, screen }) => (
          <CategoryCard
            key={key}
            image={image}
            title={t(`happenings.${key}`).toUpperCase()}
            onPress={() => navigation.navigate(screen ?? ROUTES.HAPPENING_FEED, screen ? undefined : { filter: key })}
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

export default WhatHappeningScreen;
