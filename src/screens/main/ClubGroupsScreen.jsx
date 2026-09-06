import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { ROUTES } from '../../constants/routes';
import { getClubs, getMyClubs } from '../../lib/clubs';
import { getSession } from '../../lib/auth';
import { formatAgo } from '../../utils/format';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const ClubCard = ({ club, onPress }) => (
  <GradientBorder radius={16} style={styles.cardOuter}>
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {club.photo_url
        ? <Image source={{ uri: club.photo_url }} style={styles.cardPhoto} resizeMode="cover" />
        : <View style={styles.cardPhotoPlaceholder}><Text style={styles.cardPhotoEmoji}>🏛️</Text></View>
      }
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardName}>{club.name}</Text>
          {club.status === 'suspended' && (
            <View style={styles.suspendedBadge}><Text style={styles.suspendedBadgeText}>Suspended</Text></View>
          )}
        </View>
        {!!club.description && <Text style={styles.cardDesc} numberOfLines={2}>{club.description}</Text>}
        <Text style={styles.cardMeta}>by {club.admin?.full_name ?? 'Unknown'} · {formatAgo(club.created_at)}</Text>
      </View>
    </TouchableOpacity>
  </GradientBorder>
);

const ClubGroupsScreen = ({ navigation }) => {
  useFeatureGate('club_groups');
  const [userId, setUserId] = useState(null);
  const [allClubs, setAllClubs] = useState([]);
  const [myClubIds, setMyClubIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const [{ data: { session } }, clubsRes] = await Promise.all([
      getSession(),
      getClubs(),
    ]);
    const uid = session?.user?.id ?? null;
    setUserId(uid);
    setAllClubs(clubsRes.data ?? []);

    const myRes = uid ? await getMyClubs(uid) : { data: [] };
    const ids = new Set((myRes.data ?? []).map((r) => r.club_id).filter(Boolean));
    setMyClubIds(ids);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const displayed = tab === 'mine'
    ? allClubs.filter((c) => myClubIds.has(c.id) || c.admin_id === userId)
    : allClubs;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <BackHeader title="Club Groups" onBack={() => navigation.goBack()} />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'all' && styles.tabActive]}
          onPress={() => setTab('all')}
        >
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>All Clubs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'mine' && styles.tabActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>My Clubs</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={() => (
          <>
            <AdBanner page="ClubGroups" />
            <ProfileBanner navigation={navigation} />
          </>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === 'mine' ? 'You haven\'t joined any clubs yet.' : 'No clubs yet. Be the first to start one!'}
          </Text>
        }
        renderItem={({ item }) => (
          <ClubCard
            club={item}
            onPress={() => navigation.navigate(ROUTES.CLUB_DETAIL, { clubId: item.id })}
          />
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate(ROUTES.CREATE_CLUB)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary },
  list: { padding: 16, paddingBottom: 100 },
  empty: { textAlign: 'center', color: COLORS.textMuted, fontSize: 15, marginTop: 60, paddingHorizontal: 32, lineHeight: 22 },
  cardOuter: { marginBottom: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    overflow: 'hidden',
  },
  cardPhoto: { width: '100%', height: 140 },
  cardPhotoPlaceholder: {
    width: '100%', height: 100,
    backgroundColor: 'rgba(253,171,83,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  cardPhotoEmoji: { fontSize: 40 },
  cardBody: { padding: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardName: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  suspendedBadge: {
    backgroundColor: 'rgba(253,171,83,0.12)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  suspendedBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase' },
  cardDesc: { fontSize: 13, color: COLORS.textLight, marginBottom: 6, lineHeight: 18 },
  cardMeta: { fontSize: 11, color: COLORS.textMuted },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6,
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8,
  },
  fabText: { color: COLORS.black, fontSize: 28, lineHeight: 32, fontWeight: '700' },
});

export default ClubGroupsScreen;
