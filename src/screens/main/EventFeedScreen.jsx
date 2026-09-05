import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, TextInput, Alert, Share,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import {
  getEvents, getEventReplies, createEventReply, adminDeleteEvent, deleteEvent,
  getMyEventLikes, getMyEventSaves, likeEvent, unlikeEvent, saveEvent, unsaveEvent,
  getSavedEvents,
} from '../../lib/events';
import { getSession } from '../../lib/auth';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import LinkPreviewCard from '../../components/common/LinkPreviewCard';
import BackHeader from '../../components/common/BackHeader';
import ReportModal from '../../components/common/ReportModal';
import FeedMedia from '../../components/common/FeedMedia';
import { LiveTabButton } from '../../components/common/LiveTabButton';
import GradientBorder from '../../components/common/GradientBorder';

const formatEventDate = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const EventCard = ({
  event, t, replyState, onToggleReplies, onReplyTextChange, onSendReply, isAdmin, onAdminDelete, myId, onReport,
  isLiked, isSaved, likeCount, onToggleLike, onToggleSave, onShare,
}) => {
  const ps = replyState ?? {};
  const replyCount = ps.replies?.length ?? 0;
  return (
   <GradientBorder radius={16} style={styles.cardOuter}>
    <View style={styles.card}>
      <FeedMedia photo={event.photo_url} video={event.video_url} style={styles.cardPhoto} />
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.eventName, { flex: 1 }]}>{event.name}</Text>
          {event.created_by !== myId && (
            <TouchableOpacity style={styles.adminDeleteBtn} onPress={() => onReport(event)}>
              <Text style={styles.adminDeleteBtnText}>🚩</Text>
            </TouchableOpacity>
          )}
          {(isAdmin || event.created_by === myId) && (
            <TouchableOpacity style={styles.adminDeleteBtn} onPress={() => onAdminDelete(event.id, event.created_by === myId)}>
              <Text style={styles.adminDeleteBtnText}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
        {!!event.venue && <Text style={styles.eventMeta}>📍 {event.venue}</Text>}
        {!!event.event_date && (
          <Text style={styles.eventMeta}>🗓  {formatEventDate(event.event_date)}</Text>
        )}
        {!!event.description && (
          <Text style={styles.eventDesc}>{event.description}</Text>
        )}
        {!!event.link_url && (
          <LinkPreviewCard url={event.link_url} title={event.link_title} image={event.link_image} domain={event.link_domain} />
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onToggleLike(event)}>
            <Text style={[styles.actionText, isLiked && styles.actionTextLiked]}>
              {isLiked ? '❤️' : '🤍'} {likeCount > 0 ? likeCount : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onShare(event)}>
            <Text style={styles.actionText}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onToggleSave(event)}>
            <Text style={[styles.actionText, isSaved && styles.actionTextSaved]}>
              {isSaved ? '🔖' : '📑'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onToggleReplies(event.id)}>
            <Text style={styles.actionText}>
              💬 {ps.expanded ? t('happenings.hideReplies') : `${t('happenings.viewReplies')} ${ps.replies ? `(${replyCount})` : ''}`}
            </Text>
          </TouchableOpacity>
        </View>

        {ps.expanded && (
          <View style={styles.repliesSection}>
            {ps.loading ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 8 }} />
            ) : (
              <>
                {(ps.replies ?? []).length === 0 && (
                  <Text style={styles.noReplies}>{t('happenings.noReplies')}</Text>
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
                    placeholder={t('happenings.replyPlaceholder')}
                    placeholderTextColor={COLORS.textMuted}
                    value={ps.text ?? ''}
                    onChangeText={(v) => onReplyTextChange(event.id, v)}
                    returnKeyType="send"
                    onSubmitEditing={() => onSendReply(event.id)}
                  />
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={() => onSendReply(event.id)}
                    disabled={ps.sending}
                  >
                    {ps.sending
                      ? <ActivityIndicator size="small" color={COLORS.black} />
                      : <Text style={styles.sendBtnText}>{t('happenings.send')}</Text>
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
};

const EventFeedScreen = ({ navigation, route }) => {
  useFeatureGate('events');
  const { t } = useTranslation();
  const { profile } = useUser();
  const isAdmin = profile?.is_admin === true;
  const { category } = route.params;

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyState, setReplyState] = useState({});
  const [reportTarget, setReportTarget] = useState(null);
  const [likedIds, setLikedIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [likeCounts, setLikeCounts] = useState({});
  const [mode, setMode] = useState('all');
  const firstRender = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const uidForLoad = profile?.id;
    const { data, error } = mode === 'saved' && uidForLoad
      ? await getSavedEvents(category, uidForLoad)
      : await getEvents(category);
    const rows = mode === 'saved' && !uidForLoad ? [] : (data ?? []);
    if (!error) setEvents(rows);
    setLoading(false);
    setRefreshing(false);

    const counts = {};
    rows.forEach((e) => { counts[e.id] = e.event_likes?.[0]?.count ?? 0; });
    setLikeCounts(counts);

    const uid = profile?.id;
    const ids = rows.map((e) => e.id);
    if (uid && ids.length) {
      const [{ data: likes }, { data: saves }] = await Promise.all([
        getMyEventLikes(uid, ids),
        getMyEventSaves(uid, ids),
      ]);
      setLikedIds(new Set((likes ?? []).map((l) => l.event_id)));
      setSavedIds(new Set((saves ?? []).map((s) => s.event_id)));
    } else {
      setLikedIds(new Set());
      setSavedIds(new Set());
    }
  }, [category, mode, profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setLoading(true);
    load();
  }, [mode]);

  const patchReply = (id, patch) =>
    setReplyState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleToggleLike = async (event) => {
    const uid = profile?.id;
    if (!uid) return;
    const wasLiked = likedIds.has(event.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(event.id); else next.add(event.id);
      return next;
    });
    setLikeCounts((prev) => ({ ...prev, [event.id]: (prev[event.id] ?? 0) + (wasLiked ? -1 : 1) }));
    const { error } = wasLiked ? await unlikeEvent(event.id, uid) : await likeEvent(event.id, uid);
    if (error) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(event.id); else next.delete(event.id);
        return next;
      });
      setLikeCounts((prev) => ({ ...prev, [event.id]: (prev[event.id] ?? 0) + (wasLiked ? 1 : -1) }));
    }
  };

  const handleToggleSave = async (event) => {
    const uid = profile?.id;
    if (!uid) return;
    const wasSaved = savedIds.has(event.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(event.id); else next.add(event.id);
      return next;
    });
    const { error } = wasSaved ? await unsaveEvent(event.id, uid) : await saveEvent(event.id, uid);
    if (error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(event.id); else next.delete(event.id);
        return next;
      });
    }
  };

  const handleShare = async (event) => {
    const shareUrl = `https://out-in-zmb.com/p/event/${event.id}`;
    const message = [event.name || t('common.shareFallback'), event.link_url, shareUrl].filter(Boolean).join('\n\n');
    try {
      await Share.share({ message, url: shareUrl });
    } catch {
      // user dismissed the share sheet
    }
  };

  const toggleReplies = async (eventId) => {
    const cur = replyState[eventId] ?? {};
    if (cur.expanded) { patchReply(eventId, { expanded: false }); return; }
    patchReply(eventId, { expanded: true, loading: true });
    const { data, error } = await getEventReplies(eventId);
    patchReply(eventId, { loading: false, replies: error ? [] : (data ?? []) });
  };

  const handleReply = async (eventId) => {
    const text = (replyState[eventId]?.text ?? '').trim();
    if (!text) return;
    const { data: { session } } = await getSession();
    if (!session) return;
    patchReply(eventId, { sending: true });
    const { error } = await createEventReply(session.user.id, eventId, text);
    if (error) {
      Alert.alert(t('common.error'), t('happenings.errors.replyFailed'));
      patchReply(eventId, { sending: false });
    } else {
      const { data } = await getEventReplies(eventId);
      patchReply(eventId, { sending: false, text: '', replies: data ?? [] });
    }
  };

  const handleAdminDelete = (eventId, isOwn) => {
    Alert.alert(
      t('common.deletePostTitle'),
      t('common.deletePostDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = isOwn
              ? await deleteEvent(eventId, profile.id)
              : await adminDeleteEvent(eventId);
            if (!error) setEvents((prev) => prev.filter((e) => e.id !== eventId));
          },
        },
      ]
    );
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
      <BackHeader title={t(`events.${category}`)} onBack={() => navigation.goBack()} />

      <View style={styles.toggleBar}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'all' && styles.toggleBtnActive]}
          onPress={() => setMode('all')}
        >
          <Text style={[styles.toggleText, mode === 'all' && styles.toggleTextActive]}>
            {t('stories.seeAll')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'saved' && styles.toggleBtnActive]}
          onPress={() => setMode('saved')}
        >
          <Text style={[styles.toggleText, mode === 'saved' && styles.toggleTextActive]}>
            {t('stories.saved')}
          </Text>
        </TouchableOpacity>
        <LiveTabButton navigation={navigation} createRoute={ROUTES.CREATE_EVENT} extraParams={{ category }} />
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={() => (
          <>
            <AdBanner page="EventFeed" />
            <ProfileBanner navigation={navigation} />
          </>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {mode === 'saved' ? t('common.noSavedItems') : t('events.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <EventCard
            event={item}
            t={t}
            replyState={replyState[item.id]}
            onToggleReplies={toggleReplies}
            onReplyTextChange={(id, v) => patchReply(id, { text: v })}
            onSendReply={handleReply}
            isAdmin={isAdmin}
            onAdminDelete={handleAdminDelete}
            myId={profile?.id}
            isLiked={likedIds.has(item.id)}
            isSaved={savedIds.has(item.id)}
            likeCount={likeCounts[item.id] ?? 0}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
            onShare={handleShare}
            onReport={(ev) => setReportTarget({ targetType: 'event', targetId: ev.id, reportedUserId: ev.created_by ?? null, contentExcerpt: ev.name })}
          />
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate(ROUTES.CREATE_EVENT, { category })}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  toggleBar: {
    flexDirection: 'row', margin: 16, marginBottom: 4,
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.borderAccent, overflow: 'hidden',
  },
  toggleBtn: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  toggleTextActive: { color: COLORS.black },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: COLORS.textLight, fontSize: 15, marginTop: 60, paddingHorizontal: 32, lineHeight: 22 },
  cardOuter: { marginBottom: 14 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardPhoto: { width: '100%', height: 180 },
  cardBody: { padding: 16 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  adminDeleteBtn: { paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6 },
  adminDeleteBtnText: { fontSize: 18 },
  eventName: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  eventMeta: { fontSize: 13, color: COLORS.textLight, marginBottom: 3 },
  eventDesc: { fontSize: 13, color: COLORS.text, lineHeight: 18, marginTop: 6, marginBottom: 4 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 4 },
  actionBtn: { paddingVertical: 4, paddingRight: 14 },
  actionText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  actionTextLiked: { color: '#FF3B8D' },
  actionTextSaved: { color: COLORS.primary },
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
  fab: {
    position: 'absolute',
    bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: COLORS.black, fontSize: 28, lineHeight: 32, fontWeight: '700' },
});

export default EventFeedScreen;
