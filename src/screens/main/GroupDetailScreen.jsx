import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert, Share,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import {
  getGroupPosts, getFriendGroupPosts, createGroupPost,
  getGroupPostReplies, createGroupPostReply, adminDeleteGroupPost, deleteGroupPost,
  getMyGroupPostLikes, getMyGroupPostSaves, likeGroupPost, unlikeGroupPost, saveGroupPost, unsaveGroupPost,
  getSavedGroupPosts,
} from '../../lib/groups';
import { getSession } from '../../lib/auth';
import { uploadPostPhoto } from '../../lib/storage';
import { moderateContent, checkAndFlagIfCommercial } from '../../lib/moderation';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import LinkPreviewCard from '../../components/common/LinkPreviewCard';
import LinkInput from '../../components/common/LinkInput';
import PhotoPicker from '../../components/common/PhotoPicker';
import BackHeader from '../../components/common/BackHeader';
import ReportModal from '../../components/common/ReportModal';
import Avatar from '../../components/common/Avatar';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';
import GradientBorder from '../../components/common/GradientBorder';

const GroupDetailScreen = ({ navigation, route }) => {
  useFeatureGate('open_groups');
  const { groupId, groupName, focusItemId } = route.params;
  const { t } = useTranslation();
  const { canAccessFeature, profile } = useUser();
  const isAdmin = profile?.is_admin === true;

  const [userId, setUserId] = useState(null);
  const [mode, setMode] = useState('all');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyState, setReplyState] = useState({});
  const [reportTarget, setReportTarget] = useState(null);
  const [likedIds, setLikedIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [likeCounts, setLikeCounts] = useState({});
  const firstRender = useRef(true);
  const scrollViewRef = useRef(null);
  const cardYPositions = useRef({});
  const focusedRef = useRef(false);

  const [postText, setPostText] = useState('');
  const [postPhotoUri, setPostPhotoUri] = useState(null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const { data: { session } } = await getSession();
    const uid = session?.user?.id ?? null;
    setUserId(uid);
    const res = mode === 'friends' && uid
      ? await getFriendGroupPosts(groupId, uid)
      : mode === 'saved'
      ? (uid ? await getSavedGroupPosts(groupId, uid) : { data: [], error: null })
      : await getGroupPosts(groupId);
    const rows = res.data ?? [];
    if (!res.error) setPosts(rows);
    setLoading(false);
    setRefreshing(false);

    const counts = {};
    rows.forEach((p) => { counts[p.id] = p.group_post_likes?.[0]?.count ?? 0; });
    setLikeCounts(counts);

    const ids = rows.map((p) => p.id);
    if (uid && ids.length) {
      const [{ data: likes }, { data: saves }] = await Promise.all([
        getMyGroupPostLikes(uid, ids),
        getMyGroupPostSaves(uid, ids),
      ]);
      setLikedIds(new Set((likes ?? []).map((l) => l.post_id)));
      setSavedIds(new Set((saves ?? []).map((s) => s.post_id)));
    } else {
      setLikedIds(new Set());
      setSavedIds(new Set());
    }
  }, [groupId, mode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setLoading(true);
    load();
  }, [mode]);

  // Arriving from a "replied to your post" notification. Cards report their
  // own y-position via onLayout as they render; retry the scroll a couple
  // times since that layout pass can land just after this effect fires.
  useEffect(() => {
    if (!focusItemId || focusedRef.current) return;
    if (!posts.some((p) => p.id === focusItemId)) return;
    focusedRef.current = true;
    toggleReplies(focusItemId);
    let attempts = 0;
    const tryScroll = () => {
      const y = cardYPositions.current[focusItemId];
      if (y != null) {
        scrollViewRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
      } else if (attempts < 5) {
        attempts += 1;
        setTimeout(tryScroll, 200);
      }
    };
    setTimeout(tryScroll, 200);
  }, [focusItemId, posts]);

  const patchPost = (id, patch) =>
    setReplyState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleToggleLike = async (post) => {
    if (!userId) return;
    const wasLiked = likedIds.has(post.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(post.id); else next.add(post.id);
      return next;
    });
    setLikeCounts((prev) => ({ ...prev, [post.id]: (prev[post.id] ?? 0) + (wasLiked ? -1 : 1) }));
    const { error } = wasLiked ? await unlikeGroupPost(post.id, userId) : await likeGroupPost(post.id, userId);
    if (error) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(post.id); else next.delete(post.id);
        return next;
      });
      setLikeCounts((prev) => ({ ...prev, [post.id]: (prev[post.id] ?? 0) + (wasLiked ? 1 : -1) }));
    }
  };

  const handleToggleSave = async (post) => {
    if (!userId) return;
    const wasSaved = savedIds.has(post.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(post.id); else next.add(post.id);
      return next;
    });
    const { error } = wasSaved ? await unsaveGroupPost(post.id, userId) : await saveGroupPost(post.id, userId);
    if (error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(post.id); else next.delete(post.id);
        return next;
      });
    }
  };

  const handleShare = async (post) => {
    const shareUrl = `https://out-in-zmb.com/p/group_post/${post.id}`;
    const message = [post.text || t('common.shareFallback'), post.link_url, shareUrl].filter(Boolean).join('\n\n');
    try {
      await Share.share({ message, url: shareUrl });
    } catch {
      // user dismissed the share sheet
    }
  };

  const toggleReplies = async (postId) => {
    const cur = replyState[postId] ?? {};
    if (cur.expanded) { patchPost(postId, { expanded: false }); return; }

    patchPost(postId, { expanded: true, loading: true });
    const { data } = await getGroupPostReplies(postId);
    patchPost(postId, { loading: false, replies: data ?? [] });
  };

  const handleReply = async (postId) => {
    const ps = replyState[postId] ?? {};
    const text = (ps.text ?? '').trim();
    if (!text) return;

    const { flagged, reason } = await moderateContent(text);
    if (flagged) {
      Alert.alert(t('openGroups.flaggedTitle'), t('openGroups.flaggedBody', { reason }));
      return;
    }

    patchPost(postId, { sending: true });
    const { error } = await createGroupPostReply(userId, postId, text);
    if (error) {
      Alert.alert(t('common.error'), t('openGroups.errors.replyFailed'));
      patchPost(postId, { sending: false });
    } else {
      const { data } = await getGroupPostReplies(postId);
      patchPost(postId, { sending: false, text: '', replies: data ?? [] });
    }
  };

  const handlePost = async () => {
    const access = canAccessFeature('open_groups');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else if (access.price) navigation.navigate(ROUTES.PAYWALL, { featureKey: access.featureKey });
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    const text = postText.trim();
    if (!text && !postPhotoUri) return;

    if (text) {
      const { flagged, reason } = await moderateContent(text);
      if (flagged) {
        Alert.alert(t('openGroups.flaggedTitle'), t('openGroups.flaggedBody', { reason }));
        return;
      }
    }

    setPosting(true);
    let photo_url = null;
    if (postPhotoUri) {
      const { url, error } = await uploadPostPhoto(userId, postPhotoUri);
      if (error) {
        Alert.alert(t('common.error'), t('common.photoUploadFailed'));
        setPosting(false);
        return;
      }
      photo_url = url;
    }
    const { error } = await createGroupPost(groupId, userId, {
      text: text || null,
      photo_url,
      link_url: linkPreview?.url ?? null,
      link_title: linkPreview?.title ?? null,
      link_image: linkPreview?.image ?? null,
      link_domain: linkPreview?.domain ?? null,
    });
    setPosting(false);
    if (error) {
      Alert.alert(t('common.error'), t('openGroups.errors.postFailed'));
      return;
    }
    checkAndFlagIfCommercial(profile, 'group_post', null, text);
    setPostText('');
    setPostPhotoUri(null);
    setLinkPreview(null);
    await load();
  };

  const handleDelete = (postId, isOwn) => {
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
              ? await deleteGroupPost(postId, userId)
              : await adminDeleteGroupPost(postId);
            if (!error) setPosts((prev) => prev.filter((p) => p.id !== postId));
          },
        },
      ]
    );
  };

  const renderPost = (item) => {
    const ps = replyState[item.id] ?? {};
    const replyCount = ps.replies?.length ?? 0;

    return (
      <GradientBorder
        key={item.id}
        radius={14}
        style={styles.cardOuter}
        onLayout={(e) => { cardYPositions.current[item.id] = e.nativeEvent.layout.y; }}
      >
       <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Avatar
            uri={item.profiles?.photo_url}
            name={item.profiles?.full_name}
            size={40}
            textColor={COLORS.black}
            style={styles.avatar}
          />
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={() => navigation.navigate(ROUTES.MEMBER_PROFILE, { userId: item.user_id, fullName: item.profiles?.full_name })}>
              <Text style={styles.posterName}>{item.profiles?.full_name ?? 'Someone'}</Text>
            </TouchableOpacity>
            <Text style={styles.time}>{formatAgo(item.created_at)}</Text>
          </View>
          {item.user_id !== userId && (
            <TouchableOpacity style={styles.adminDeleteBtn} onPress={() => setReportTarget({ targetType: 'group_post', targetId: item.id, reportedUserId: item.user_id, contentExcerpt: item.text })}>
              <Text style={styles.adminDeleteBtnText}>🚩</Text>
            </TouchableOpacity>
          )}
          {(isAdmin || item.user_id === userId) && (
            <TouchableOpacity style={styles.adminDeleteBtn} onPress={() => handleDelete(item.id, item.user_id === userId)}>
              <Text style={styles.adminDeleteBtnText}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>

        {!!item.text && <Text style={styles.postText}>{item.text}</Text>}
        {!!item.photo_url && <Image source={{ uri: item.photo_url }} style={styles.postPhoto} resizeMode="cover" />}
        {!!item.link_url && <LinkPreviewCard url={item.link_url} title={item.link_title} image={item.link_image} domain={item.link_domain} />}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleLike(item)}>
            <Text style={[styles.actionText, likedIds.has(item.id) && styles.actionTextLiked]}>
              {likedIds.has(item.id) ? '❤️' : '🤍'} {(likeCounts[item.id] ?? 0) > 0 ? likeCounts[item.id] : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
            <Text style={styles.actionText}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleSave(item)}>
            <Text style={[styles.actionText, savedIds.has(item.id) && styles.actionTextSaved]}>
              {savedIds.has(item.id) ? '🔖' : '📑'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => toggleReplies(item.id)}>
            <Text style={styles.actionText}>
              💬 {ps.expanded
                ? t('openGroups.hideReplies')
                : `${t('openGroups.viewReplies')}${ps.replies != null ? ` (${replyCount})` : ''}`}
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
                  <Text style={styles.noReplies}>{t('openGroups.noReplies')}</Text>
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
                    placeholder={t('openGroups.replyPlaceholder')}
                    placeholderTextColor={COLORS.textMuted}
                    value={ps.text ?? ''}
                    onChangeText={(v) => patchPost(item.id, { text: v })}
                    returnKeyType="send"
                    onSubmitEditing={() => handleReply(item.id)}
                  />
                  <EmojiPickerButton onEmojiSelected={(e) => patchPost(item.id, { text: (ps.text ?? '') + e })} />
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={() => handleReply(item.id)}
                    disabled={ps.sending}
                  >
                    {ps.sending
                      ? <ActivityIndicator size="small" color={COLORS.black} />
                      : <Text style={styles.sendBtnText}>{t('openGroups.send')}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
       </View>
      </GradientBorder>
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
      <BackHeader title={groupName ?? t('openGroups.title')} onBack={() => navigation.goBack()} />

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
          style={[styles.toggleBtn, mode === 'friends' && styles.toggleBtnActive]}
          onPress={() => setMode('friends')}
        >
          <Text style={[styles.toggleText, mode === 'friends' && styles.toggleTextActive]}>
            {t('stories.onlyFriends')}
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
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.composeBox}>
          <View style={styles.composeInputRow}>
            <TextInput
              style={styles.composeInput}
              placeholder={t('openGroups.composePlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              value={postText}
              onChangeText={setPostText}
              multiline
            />
            <EmojiPickerButton onEmojiSelected={(e) => setPostText((prev) => prev + e)} style={styles.composeEmojiBtn} />
          </View>
          <PhotoPicker uri={postPhotoUri} onChange={setPostPhotoUri} />
          <LinkInput preview={linkPreview} onPreviewChange={setLinkPreview} />
          <TouchableOpacity style={styles.postBtn} onPress={handlePost} disabled={posting}>
            {posting
              ? <ActivityIndicator size="small" color={COLORS.black} />
              : <Text style={styles.postBtnText}>{t('openGroups.post')}</Text>
            }
          </TouchableOpacity>
        </View>

        <AdBanner page="OpenGroupDetail" />
        <ProfileBanner navigation={navigation} />

        {posts.length === 0 ? (
          <Text style={styles.empty}>
            {mode === 'friends'
              ? t('openGroups.noFriendPosts')
              : mode === 'saved'
              ? t('common.noSavedItems')
              : t('openGroups.noPosts')}
          </Text>
        ) : (
          posts.map(renderPost)
        )}
      </ScrollView>
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
  list: { padding: 16, paddingTop: 12, paddingBottom: 60 },
  empty: { textAlign: 'center', color: COLORS.textMuted, fontSize: 15, marginTop: 40, paddingHorizontal: 32, lineHeight: 22 },
  composeBox: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.borderAccent, marginBottom: 16,
  },
  composeInputRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  composeInput: {
    flex: 1,
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.background,
    minHeight: 60, textAlignVertical: 'top',
  },
  composeEmojiBtn: { marginLeft: 8 },
  postBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  postBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.black },
  cardOuter: { marginBottom: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { marginRight: 10 },
  posterName: { fontWeight: '700', fontSize: 14, color: COLORS.text },
  time: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  adminDeleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  adminDeleteBtnText: { fontSize: 18 },
  postText: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  postPhoto: { width: '100%', height: 180, borderRadius: 10, marginBottom: 8 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { paddingVertical: 4, paddingRight: 14 },
  actionText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  actionTextLiked: { color: '#FF3B8D' },
  actionTextSaved: { color: COLORS.primary },
  repliesSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  noReplies: { fontSize: 13, color: COLORS.textMuted, marginBottom: 10 },
  replyRow: { marginBottom: 12 },
  replyName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  replyText: { fontSize: 13, color: COLORS.text, marginTop: 1 },
  replyTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  replyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  replyInput: {
    flex: 1, borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, backgroundColor: COLORS.background, color: COLORS.text,
  },
  sendBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  sendBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.black },
});

export default GroupDetailScreen;
