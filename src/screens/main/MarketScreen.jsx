import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, StatusBar, RefreshControl, TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { ROUTES } from '../../constants/routes';
import {
  getMarketListings, deleteMarketListing, adminDeleteListing,
  getMarketListingReplies, createMarketListingReply,
} from '../../lib/market';
import { getSession } from '../../lib/auth';
import { useUser } from '../../contexts/UserContext';
import { formatAgo } from '../../utils/format';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import ReportModal from '../../components/common/ReportModal';
import Avatar from '../../components/common/Avatar';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';
import FeedMedia from '../../components/common/FeedMedia';
import { LiveTabBar } from '../../components/common/LiveTabButton';
import GradientBorder from '../../components/common/GradientBorder';

const MarketScreen = ({ navigation, route }) => {
  useFeatureGate('market');
  const { t } = useTranslation();
  const { canAccessFeature, profile } = useUser();
  const isAdmin = profile?.is_admin === true;
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myId, setMyId] = useState(null);
  const [replyState, setReplyState] = useState({});
  const [reportTarget, setReportTarget] = useState(null);
  const statusBarHeight = StatusBar.currentHeight ?? 44;
  const flatListRef = useRef(null);
  const focusedRef = useRef(false);
  const focusItemId = route?.params?.focusItemId;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const [sessionRes, listingsRes] = await Promise.all([
      getSession(),
      getMarketListings(),
    ]);
    if (sessionRes.data?.session) setMyId(sessionRes.data.session.user.id);
    if (!listingsRes.error) setListings(listingsRes.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!focusItemId || focusedRef.current) return;
    const index = listings.findIndex((l) => l.id === focusItemId);
    if (index === -1) return;
    focusedRef.current = true;
    toggleReplies(focusItemId);
    setTimeout(() => flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 }), 300);
  }, [focusItemId, listings]);

  const handlePostPress = () => {
    const access = canAccessFeature('market');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    navigation.navigate(ROUTES.CREATE_MARKET_LISTING);
  };

  const patchReply = (id, patch) =>
    setReplyState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleReplies = async (listingId) => {
    const cur = replyState[listingId] ?? {};
    if (cur.expanded) { patchReply(listingId, { expanded: false }); return; }
    patchReply(listingId, { expanded: true, loading: true });
    const { data, error } = await getMarketListingReplies(listingId);
    patchReply(listingId, { loading: false, replies: error ? [] : (data ?? []) });
  };

  const handleReply = async (listingId) => {
    const text = (replyState[listingId]?.text ?? '').trim();
    if (!text) return;
    const { data: { session } } = await getSession();
    if (!session) return;
    patchReply(listingId, { sending: true });
    const { error } = await createMarketListingReply(session.user.id, listingId, text);
    if (error) {
      Alert.alert(t('common.error'), t('market.errorReplyFailed'));
      patchReply(listingId, { sending: false });
    } else {
      const { data } = await getMarketListingReplies(listingId);
      patchReply(listingId, { sending: false, text: '', replies: data ?? [] });
    }
  };

  const handleDelete = (item) => {
    const isOwn = item.user_id === myId;
    Alert.alert(t('market.deleteTitle'), t('market.deleteDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('market.delete'), style: 'destructive',
        onPress: async () => {
          const { error } = isOwn
            ? await deleteMarketListing(item.id, myId)
            : await adminDeleteListing(item.id);
          if (!error) setListings((prev) => prev.filter((l) => l.id !== item.id));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('market.title')}</Text>
        <TouchableOpacity style={styles.postBtn} onPress={handlePostPress}>
          <Text style={styles.postBtnText}>+ {t('market.post')}</Text>
        </TouchableOpacity>
      </View>

      <LiveTabBar
        navigation={navigation}
        createRoute={ROUTES.CREATE_MARKET_LISTING}
        extraParams={{}}
        label={t('market.title')}
      />

      <FlatList
        ref={flatListRef}
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: true }), 100);
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />}
        ListHeaderComponent={() => (
          <>
            <AdBanner page="Market" />
            <ProfileBanner navigation={navigation} />
            <Text style={styles.subtitle}>{t('market.subtitle')}</Text>
          </>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🛍️</Text>
            <Text style={styles.empty}>{t('market.empty')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isOwn = item.user_id === myId;
          const sellerName = item.profiles?.full_name ?? t('market.unknownSeller');
          const ps = replyState[item.id] ?? {};
          const replyCount = ps.replies?.length ?? 0;
          return (
           <GradientBorder radius={16} style={styles.cardOuter}>
            <View style={styles.card}>
              <FeedMedia photo={item.photo_url} video={item.video_url} style={styles.photo} />
              <View style={styles.cardBody}>
                <Text style={styles.description}>{item.description}</Text>
                <View style={styles.cardFooter}>
                  <View style={styles.sellerRow}>
                    <Avatar
                      uri={item.profiles?.photo_url}
                      name={sellerName}
                      size={28}
                      backgroundColor={COLORS.primaryDark}
                    />
                    <Text style={styles.sellerName}>{sellerName}</Text>
                  </View>
                  <Text style={styles.time}>{formatAgo(item.created_at)}</Text>
                  {!isOwn && (
                    <TouchableOpacity
                      onPress={() => setReportTarget({ targetType: 'market_listing', targetId: item.id, reportedUserId: item.user_id, contentExcerpt: item.description })}
                      style={styles.deleteBtn}
                    >
                      <Text style={styles.deleteText}>🚩</Text>
                    </TouchableOpacity>
                  )}
                  {(isOwn || isAdmin) && (
                    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                      <Text style={styles.deleteText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity style={styles.replyToggle} onPress={() => toggleReplies(item.id)}>
                  <Text style={styles.replyToggleText}>
                    💬 {ps.expanded ? t('market.hideReplies') : `${t('market.viewReplies')} ${ps.replies ? `(${replyCount})` : ''}`}
                  </Text>
                </TouchableOpacity>

                {ps.expanded && (
                  <View style={styles.repliesSection}>
                    {ps.loading ? (
                      <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 8 }} />
                    ) : (
                      <>
                        {(ps.replies ?? []).length === 0 && (
                          <Text style={styles.noReplies}>{t('market.noReplies')}</Text>
                        )}
                        {(ps.replies ?? []).map((r) => (
                          <View key={r.id} style={styles.replyRow}>
                            <Text style={styles.replyName}>{r.profiles?.full_name ?? 'Someone'}</Text>
                            <Text style={styles.replyText}>{r.message}</Text>
                            <Text style={styles.replyTime}>{formatAgo(r.created_at)}</Text>
                          </View>
                        ))}
                        <View style={styles.replyInputRow}>
                          <TextInput
                            style={styles.replyInput}
                            placeholder={t('market.replyPlaceholder')}
                            placeholderTextColor={COLORS.textMuted}
                            value={ps.text ?? ''}
                            onChangeText={(v) => patchReply(item.id, { text: v })}
                            returnKeyType="send"
                            onSubmitEditing={() => handleReply(item.id)}
                          />
                          <EmojiPickerButton onEmojiSelected={(e) => patchReply(item.id, { text: (ps.text ?? '') + e })} />
                          <TouchableOpacity
                            style={styles.sendBtn}
                            onPress={() => handleReply(item.id)}
                            disabled={ps.sending}
                          >
                            {ps.sending
                              ? <ActivityIndicator size="small" color={COLORS.black} />
                              : <Text style={styles.sendBtnText}>{t('market.send')}</Text>
                            }
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            </View>
           </GradientBorder>
          );
        }}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  back: { width: 40, alignItems: 'flex-start' },
  backText: { fontSize: 30, color: COLORS.primary, lineHeight: 34 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  postBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  postBtnText: { color: COLORS.black, fontWeight: '700', fontSize: 13 },
  list: { paddingBottom: 40 },
  subtitle: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    paddingHorizontal: 24, paddingVertical: 10, lineHeight: 17,
  },
  emptyWrap: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  empty: { color: COLORS.textMuted, fontSize: 15, textAlign: 'center' },
  cardOuter: { marginHorizontal: 16, marginTop: 12 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14, overflow: 'hidden',
  },
  photo: { width: '100%', height: 220 },
  cardBody: { padding: 14 },
  description: { fontSize: 15, color: COLORS.text, lineHeight: 22, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sellerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sellerName: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  time: { fontSize: 11, color: COLORS.textMuted },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  deleteText: { color: COLORS.error, fontSize: 13, fontWeight: '700' },
  replyToggle: { alignSelf: 'flex-start', marginTop: 10 },
  replyToggleText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  repliesSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  noReplies: { fontSize: 13, color: COLORS.textMuted, marginBottom: 10 },
  replyRow: { marginBottom: 10 },
  replyName: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  replyText: { fontSize: 13, color: COLORS.text, marginTop: 1 },
  replyTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  replyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.text,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sendBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.black },
});

export default MarketScreen;
