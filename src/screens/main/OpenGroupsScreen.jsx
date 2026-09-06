import React, { useState, useCallback } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { ROUTES } from '../../constants/routes';
import { getOpenGroups } from '../../lib/groups';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import BackHeader from '../../components/common/BackHeader';
import GradientBorder from '../../components/common/GradientBorder';

const GroupCard = ({ group, onPress }) => (
  <GradientBorder radius={16} style={styles.cardOuter}>
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {group.photo_url
        ? <Image source={{ uri: group.photo_url }} style={styles.cardPhoto} resizeMode="cover" />
        : <View style={styles.cardPhotoPlaceholder}><Text style={styles.cardPhotoEmoji}>🧩</Text></View>
      }
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{group.name}</Text>
        {!!group.description && <Text style={styles.cardDesc} numberOfLines={2}>{group.description}</Text>}
      </View>
    </TouchableOpacity>
  </GradientBorder>
);

const OpenGroupsScreen = ({ navigation }) => {
  useFeatureGate('open_groups');
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const { data, error } = await getOpenGroups();
    if (!error) setGroups(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <BackHeader title={t('openGroups.title')} onBack={() => navigation.goBack()} />

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={() => (
          <>
            <AdBanner page="OpenGroups" />
            <ProfileBanner navigation={navigation} />
          </>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('openGroups.empty')}</Text>}
        renderItem={({ item }) => (
          <GroupCard
            group={item}
            onPress={() => navigation.navigate(ROUTES.GROUP_DETAIL, { groupId: item.id, groupName: item.name })}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  list: { padding: 16, paddingBottom: 100 },
  empty: { textAlign: 'center', color: COLORS.textMuted, fontSize: 15, marginTop: 60, paddingHorizontal: 32, lineHeight: 22 },
  cardOuter: { marginBottom: 14 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
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
  cardName: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: COLORS.textLight, lineHeight: 18 },
});

export default OpenGroupsScreen;
