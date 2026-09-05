import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { signOut } from '../../lib/auth';
import { useUser } from '../../contexts/UserContext';
import { GradientIconCircle } from '../../components/common/GradientIcon';

const FEATURES = [
  { icon: 'people',          titleKey: 'home.friends',        descKey: 'home.friendsDesc',        route: ROUTES.FRIENDS_HUB,    featureKey: 'friends' },
  { icon: 'camera',          titleKey: 'home.myStory',        descKey: 'home.myStoryDesc',        route: ROUTES.STORY_FEED,     featureKey: 'my_story' },
  { icon: 'sparkles',        titleKey: 'home.whatsHappening', descKey: 'home.whatsHappeningDesc', route: ROUTES.WHAT_HAPPENING, featureKey: 'whats_happening' },
  { icon: 'map',             titleKey: 'home.whereToGo',      descKey: 'home.whereToGoDesc',      route: ROUTES.WHERE_TO_GO,    featureKey: 'where_to_go' },
  { icon: 'flash',           titleKey: 'home.spurOfMoment',   descKey: 'home.spurOfMomentDesc',   route: ROUTES.SPUR_OF_MOMENT, featureKey: 'spur_of_moment' },
  { icon: 'chatbubbles',     titleKey: 'home.openChat',       descKey: 'home.openChatDesc',       route: ROUTES.OPEN_CHAT,      featureKey: 'open_chat' },
  { icon: 'location',        titleKey: 'home.atVenue',        descKey: 'home.atVenueDesc',        route: ROUTES.AT_VENUE,       featureKey: 'at_venue' },
  { icon: 'people-circle',   titleKey: 'home.clubGroups',     descKey: 'home.clubGroupsDesc',     route: ROUTES.CLUB_GROUPS,    featureKey: 'club_groups' },
  { icon: 'grid',            titleKey: 'home.openGroups',      descKey: 'home.openGroupsDesc',     route: ROUTES.OPEN_GROUPS,    featureKey: 'open_groups' },
  { icon: 'wine',            titleKey: 'home.venue',           descKey: 'home.venueDesc',          route: ROUTES.VENUE_HUB,      featureKey: 'venue_hub' },
  { icon: 'pricetags',       titleKey: 'home.market',          descKey: 'home.marketDesc',         route: ROUTES.MARKET,         featureKey: 'market' },
  { icon: 'ticket',          titleKey: 'home.events',          descKey: 'home.eventsDesc',         route: ROUTES.EVENTS,         featureKey: 'events' },
];

const RESTRICTED_ROUTES = new Set([ROUTES.WHERE_TO_GO, ROUTES.VENUE_HUB]);

const FeatureCard = ({ icon, title, description, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.cardWrap}>
    {/* luminous gradient stroke: cyan → blue → violet */}
    <LinearGradient
      colors={['#4FD9FF', '#295DFF', '#8A3FFC']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.cardBorder}
    >
      {/* glassy blue → violet fill */}
      <LinearGradient
        colors={COLORS.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <GradientIconCircle name={icon} size={54} iconSize={24} style={styles.iconRing} />
        <View style={styles.textWrap}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>{description}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </LinearGradient>
    </LinearGradient>
  </TouchableOpacity>
);

const HomeScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { profile, isFeatureEnabled } = useUser();
  const statusBarHeight = StatusBar.currentHeight ?? 44;

  const isRestricted = profile?.status === 'restricted';
  const needsProfile = profile && !profile.profile_completed;
  const visibleFeatures = (isRestricted
    ? FEATURES.filter((f) => RESTRICTED_ROUTES.has(f.route))
    : FEATURES
  ).filter((f) => isFeatureEnabled(f.featureKey));

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: statusBarHeight + 16 }]} showsVerticalScrollIndicator={false}>

        <View style={styles.topBar}>
          <View style={styles.topActions}>
            {!isRestricted && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation.navigate(ROUTES.PROFILE_SETTINGS)}
              >
                <Text style={styles.iconBtnText}>⚙️</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
              <Text style={styles.logoutText}>↗  {t('auth.logout')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.appName}>{t('common.appName')}</Text>
          <Text style={styles.tagline}>{t('home.tagline')}</Text>
          {isRestricted && (
            <Text style={styles.restrictedNote}>Limited access</Text>
          )}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerDiamond}>✦</Text>
            <View style={styles.dividerLine} />
          </View>
        </View>

        {needsProfile && (
          <TouchableOpacity
            style={styles.profileBanner}
            onPress={() => navigation.navigate(ROUTES.COMPLETE_PROFILE)}
            activeOpacity={0.85}
          >
            <Text style={styles.profileBannerText}>✦  Complete your profile for full access</Text>
            <Text style={styles.profileBannerCta}>Tap to finish →</Text>
          </TouchableOpacity>
        )}

        <View style={styles.cards}>
          {visibleFeatures.map((f) => (
            <FeatureCard
              key={f.route}
              icon={f.icon}
              title={t(f.titleKey)}
              description={t(f.descKey)}
              onPress={() => navigation.navigate(f.route)}
            />
          ))}
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: 40 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 38, height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(41,93,255,0.12)',
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    justifyContent: 'center', alignItems: 'center',
  },
  iconBtnText: { fontSize: 16 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(41,93,255,0.12)',
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
  },
  logoutText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },

  titleSection: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 6,
    letterSpacing: 1.5,
    fontWeight: '500',
  },
  restrictedNote: {
    fontSize: 11,
    color: '#f39c12',
    marginTop: 4,
    letterSpacing: 1,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    width: '55%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderAccent,
    opacity: 0.5,
  },
  dividerDiamond: {
    color: COLORS.primary,
    fontSize: 10,
    marginHorizontal: 10,
  },

  profileBanner: {
    marginHorizontal: 28,
    marginBottom: 14,
    backgroundColor: 'rgba(41,93,255,0.12)',
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  profileBannerText: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  profileBannerCta: { fontSize: 12, color: COLORS.textMuted },

  cards: { paddingHorizontal: 28 },
  cardWrap: {
    borderRadius: 20,
    marginBottom: 16,
    // subtle outer bloom
    shadowColor: COLORS.glow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardBorder: {
    borderRadius: 20,
    padding: 1.5,   // this is the visible gradient stroke width
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18.5,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 88,   // uniform card height regardless of description length
    overflow: 'hidden',
  },
  iconRing: { marginRight: 14 },
  textWrap: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  cardDesc: { fontSize: 12, color: COLORS.textLight, lineHeight: 16 },
  chevron: { fontSize: 24, color: COLORS.primary, marginLeft: 4 },
});

export default HomeScreen;
