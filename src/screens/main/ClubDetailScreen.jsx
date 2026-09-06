import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, RefreshControl, TextInput, Share,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import {
  getClub, getClubMembers, getMemberStatus, requestToJoin, approveMember, rejectMember,
  getClubPosts, createClubPost, adminDeleteClubPost, deleteClubPost, adminDeleteClub,
  getClubBlocks, blockClubMember, unblockClubMember, suspendClub, unsuspendClub,
  getMyClubPostLikes, getMyClubPostSaves, likeClubPost, unlikeClubPost, saveClubPost, unsaveClubPost,
  getSavedClubPosts, getClubPostReplies, createClubPostReply,
} from '../../lib/clubs';
import { checkAndFlagIfCommercial } from '../../lib/moderation';
import { getSession } from '../../lib/auth';
import { uploadPostPhoto } from '../../lib/storage';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import PhotoPicker from '../../components/common/PhotoPicker';
import LinkInput from '../../components/common/LinkInput';
import LinkPreviewCard from '../../components/common/LinkPreviewCard';
import Avatar from '../../components/common/Avatar';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';

const ClubDetailScreen = ({ navigation, route }) => {
  useFeatureGate('club_groups');
  const { clubId } = route.params;
  const { profile } = useUser();
  const isSiteAdmin = profile?.is_admin === true;

  const [userId, setUserId] = useState(null);
  const [club, setClub] = useState(null);
  const [members, setMembers] = useState([]);
  const [myStatus, setMyStatus] = useState(null); // null | 'pending' | 'approved'
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [postText, setPostText] = useState('');
  const [postPhotoUri, setPostPhotoUri] = useState(null);
  const [linkPreview, setLinkPreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const [blocked, setBlocked] = useState([]);
  const [blockActionId, setBlockActionId] = useState(null);
  const [likedIds, setLikedIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [likeCounts, setLikeCounts] = useState({});
  const [postsMode, setPostsMode] = useState('all');
  const [replyState, setReplyState] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const [{ data: { session } }, clubRes, membersRes, blocksRes] = await Promise.all([
      getSession(),
      getClub(clubId),
      getClubMembers(clubId),
      getClubBlocks(clubId),
    ]);
    const uid = session?.user?.id ?? null;
    setUserId(uid);
    setClub(clubRes.data ?? null);
    setMembers(membersRes.data ?? []);
    setBlocked(blocksRes.data ?? []);

    const postsRes = postsMode === 'saved'
      ? (uid ? await getSavedClubPosts(clubId, uid) : { data: [], error: null })
      : await getClubPosts(clubId);
    const posts_ = postsRes.data ?? [];
    setPosts(posts_);

    const counts = {};
    posts_.forEach((p) => { counts[p.id] = p.club_post_likes?.[0]?.count ?? 0; });
    setLikeCounts(counts);

    const postIds = posts_.map((p) => p.id);
    if (uid && postIds.length) {
      const [{ data: likes }, { data: saves }] = await Promise.all([
        getMyClubPostLikes(uid, postIds),
        getMyClubPostSaves(uid, postIds),
      ]);
      setLikedIds(new Set((likes ?? []).map((l) => l.post_id)));
      setSavedIds(new Set((saves ?? []).map((s) => s.post_id)));
    } else {
      setLikedIds(new Set());
      setSavedIds(new Set());
    }

    const statusRes = uid ? await getMemberStatus(clubId, uid) : { data: null };
    setMyStatus(statusRes.data?.status ?? null);
    setLoading(false);
    setRefreshing(false);
  }, [clubId, postsMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    load();
  }, [postsMode]);

  const isAdmin = club?.admin_id === userId;
  const canModerate = isAdmin || isSiteAdmin;
  const isSuspended = club?.status === 'suspended';
  const canPost = (isAdmin || myStatus === 'approved') && !isSuspended;
  const pending = members.filter((m) => m.status === 'pending');
  const approved = members.filter((m) => m.status === 'approved');
  const isViewerBlocked = blocked.some((b) => b.blocked_user_id === userId);

  const handleJoin = async () => {
    const { error } = await requestToJoin(clubId, userId);
    if (error) {
      Alert.alert('Error', 'Could not send join request.');
    } else {
      setMyStatus('pending');
    }
  };

  const handleApprove = async (memberId, memberUserId) => {
    setActionId(memberId);
    const { error } = await approveMember(clubId, memberUserId);
    setActionId(null);
    if (error) {
      Alert.alert('Error', 'Could not approve member.');
    } else {
      await load();
    }
  };

  const handleReject = (memberId, memberUserId, memberName) => {
    Alert.alert(
      'Remove request',
      `Reject ${memberName}'s request to join?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive',
          onPress: async () => {
            setActionId(memberId);
            await rejectMember(clubId, memberUserId);
            setActionId(null);
            await load();
          },
        },
      ]
    );
  };

  const handlePost = async () => {
    const text = postText.trim();
    if (!text && !postPhotoUri) return;
    setPosting(true);
    let photo_url = null;
    if (postPhotoUri) {
      const { url, error } = await uploadPostPhoto(userId, postPhotoUri);
      if (error) {
        Alert.alert('Error', 'Could not upload photo.');
        setPosting(false);
        return;
      }
      photo_url = url;
    }
    const { error } = await createClubPost(clubId, userId, {
      text: text || null,
      photo_url,
      link_url: linkPreview?.url ?? null,
      link_title: linkPreview?.title ?? null,
      link_image: linkPreview?.image ?? null,
      link_domain: linkPreview?.domain ?? null,
    });
    setPosting(false);
    if (error) {
      Alert.alert('Error', 'Could not post.');
      return;
    }
    checkAndFlagIfCommercial(profile, 'club_post', null, text);
    setPostText('');
    setPostPhotoUri(null);
    setLinkPreview(null);
    await load();
  };

  const handleToggleLike = async (post) => {
    if (!userId) return;
    const wasLiked = likedIds.has(post.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(post.id); else next.add(post.id);
      return next;
    });
    setLikeCounts((prev) => ({ ...prev, [post.id]: (prev[post.id] ?? 0) + (wasLiked ? -1 : 1) }));
    const { error } = wasLiked ? await unlikeClubPost(post.id, userId) : await likeClubPost(post.id, userId);
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
    const { error } = wasSaved ? await unsaveClubPost(post.id, userId) : await saveClubPost(post.id, userId);
    if (error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(post.id); else next.delete(post.id);
        return next;
      });
    }
  };

  const handleShare = async (post) => {
    const shareUrl = `https://out-in-zmb.com/p/club_post/${post.id}`;
    const message = [post.text || 'Check out this post on Out-in-Zmb!', post.link_url, shareUrl].filter(Boolean).join('\n\n');
    try {
      await Share.share({ message, url: shareUrl });
    } catch {
      // user dismissed the share sheet
    }
  };

  const patchPost = (id, patch) =>
    setReplyState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleReplies = async (postId) => {
    const cur = replyState[postId] ?? {};
    if (cur.expanded) { patchPost(postId, { expanded: false }); return; }
    patchPost(postId, { expanded: true, loading: true });
    const { data } = await getClubPostReplies(postId);
    patchPost(postId, { loading: false, replies: data ?? [] });
  };

  const handleReply = async (postId) => {
    const text = (replyState[postId]?.text ?? '').trim();
    if (!text) return;
    patchPost(postId, { sending: true });
    const { error } = await createClubPostReply(userId, postId, text);
    if (error) {
      Alert.alert('Error', 'Could not send your reply.');
      patchPost(postId, { sending: false });
    } else {
      const { data } = await getClubPostReplies(postId);
      patchPost(postId, { sending: false, text: '', replies: data ?? [] });
    }
  };

  const handleDeletePost = (postId, isOwn) => {
    Alert.alert(
      'Delete post?',
      'This will permanently remove this post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = isOwn
              ? await deleteClubPost(postId, userId)
              : await adminDeleteClubPost(postId);
            if (!error) setPosts((prev) => prev.filter((p) => p.id !== postId));
          },
        },
      ]
    );
  };

  const handleBlockMember = (memberUserId, memberName) => {
    Alert.alert(
      'Block member',
      `Remove ${memberName} from this club and stop them from rejoining?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block', style: 'destructive',
          onPress: async () => {
            setBlockActionId(memberUserId);
            await blockClubMember(clubId, memberUserId, userId);
            setBlockActionId(null);
            await load();
          },
        },
      ]
    );
  };

  const handleUnblockMember = async (memberUserId) => {
    setBlockActionId(memberUserId);
    await unblockClubMember(clubId, memberUserId);
    setBlockActionId(null);
    await load();
  };

  const handleSuspendToggle = () => {
    const suspending = !isSuspended;
    Alert.alert(
      suspending ? 'Suspend this club?' : 'Reactivate this club?',
      suspending
        ? 'Members won\'t be able to post or join while suspended. Nothing is deleted.'
        : 'The club becomes visible and postable again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: suspending ? 'Suspend' : 'Reactivate',
          style: suspending ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = suspending ? await suspendClub(clubId) : await unsuspendClub(clubId);
            if (error) Alert.alert('Error', 'Could not update club status.');
            else await load();
          },
        },
      ]
    );
  };

  const handleAdminDeleteClub = () => {
    Alert.alert(
      'Delete this club?',
      'This will permanently remove the club, its members, and all its posts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await adminDeleteClub(clubId);
            if (error) Alert.alert('Error', 'Could not delete club.');
            else navigation.goBack();
          },
        },
      ]
    );
  };

  if (loading || !club) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title={club.name} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />}
      >
        {/* Club hero */}
        {club.photo_url
          ? <Image source={{ uri: club.photo_url }} style={styles.heroPhoto} resizeMode="cover" />
          : <View style={styles.heroPlaceholder}><Text style={styles.heroEmoji}>🏛️</Text></View>
        }

        <View style={styles.infoCard}>
          <Text style={styles.clubName}>{club.name}</Text>
          {!!club.description && <Text style={styles.clubDesc}>{club.description}</Text>}
          <Text style={styles.clubMeta}>
            Admin: {club.admin?.full_name ?? 'Unknown'} · {formatAgo(club.created_at)}
          </Text>
          <Text style={styles.memberCount}>
            {approved.length} member{approved.length !== 1 ? 's' : ''}
          </Text>
          {isSiteAdmin && (
            <View style={styles.adminBtnRow}>
              <TouchableOpacity style={styles.suspendClubBtn} onPress={handleSuspendToggle}>
                <Text style={styles.suspendClubBtnText}>
                  {isSuspended ? '▶  Reactivate Club' : '⏸  Suspend Club'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteClubBtn} onPress={handleAdminDeleteClub}>
                <Text style={styles.deleteClubBtnText}>🗑  Delete Club</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isSuspended && (
          <View style={styles.suspendedBanner}>
            <Text style={styles.suspendedBannerText}>⏸ This club is suspended — posting and joining are disabled</Text>
          </View>
        )}

        {/* Join button — shown to non-members who aren't admin */}
        {!isAdmin && isViewerBlocked && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>🚫 You've been removed from this club</Text>
          </View>
        )}
        {!isAdmin && !isViewerBlocked && !isSuspended && myStatus === null && (
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoin}>
            <Text style={styles.joinBtnText}>Request to Join</Text>
          </TouchableOpacity>
        )}
        {!isAdmin && myStatus === 'pending' && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>⏳ Your request is awaiting approval</Text>
          </View>
        )}
        {!isAdmin && myStatus === 'approved' && (
          <View style={styles.memberBanner}>
            <Text style={styles.memberBannerText}>✅ You are a member of this club</Text>
          </View>
        )}

        {/* Admin: pending requests */}
        {isAdmin && pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending Requests ({pending.length})</Text>
            {pending.map((m) => {
              const busy = actionId === m.id;
              return (
                <View key={m.id} style={styles.memberRow}>
                  <Avatar
                    uri={m.member?.photo_url}
                    name={m.member?.full_name}
                    size={38}
                    textColor={COLORS.black}
                    style={styles.avatar}
                  />
                  <Text style={styles.memberName}>{m.member?.full_name ?? 'Unknown'}</Text>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleApprove(m.id, m.user_id)}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : <Text style={styles.approveBtnText}>Accept</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleReject(m.id, m.user_id, m.member?.full_name)}
                    disabled={busy}
                  >
                    <Text style={styles.rejectBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Members list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {approved.length === 0
            ? <Text style={styles.empty}>No approved members yet.</Text>
            : approved.map((m) => {
              const busy = blockActionId === m.user_id;
              return (
                <View key={m.id} style={styles.memberRow}>
                  <Avatar
                    uri={m.member?.photo_url}
                    name={m.member?.full_name}
                    size={38}
                    textColor={COLORS.black}
                    style={styles.avatar}
                  />
                  <Text style={styles.memberName}>{m.member?.full_name ?? 'Unknown'}</Text>
                  {m.user_id === club.admin_id && (
                    <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>
                  )}
                  {canModerate && m.user_id !== club.admin_id && (
                    <TouchableOpacity
                      style={styles.blockBtn}
                      onPress={() => !busy && handleBlockMember(m.user_id, m.member?.full_name ?? 'this member')}
                      disabled={busy}
                    >
                      {busy
                        ? <ActivityIndicator size="small" color={COLORS.error} />
                        : <Text style={styles.blockBtnText}>Block</Text>
                      }
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          }
        </View>

        {/* Blocked members — visible only to whoever can moderate this club */}
        {canModerate && blocked.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Blocked Members ({blocked.length})</Text>
            {blocked.map((b) => {
              const busy = blockActionId === b.blocked_user_id;
              return (
                <View key={b.id} style={styles.memberRow}>
                  <Avatar
                    uri={b.profiles?.photo_url}
                    name={b.profiles?.full_name}
                    size={38}
                    textColor={COLORS.black}
                    style={styles.avatar}
                  />
                  <Text style={styles.memberName}>{b.profiles?.full_name ?? 'Unknown'}</Text>
                  <TouchableOpacity
                    style={styles.unblockBtn}
                    onPress={() => !busy && handleUnblockMember(b.blocked_user_id)}
                    disabled={busy}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={COLORS.primary} />
                      : <Text style={styles.unblockBtnText}>Unblock</Text>
                    }
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Posts — visible/postable only to approved members and the admin */}
        {canPost && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Club Posts</Text>

            <View style={styles.postsToggleBar}>
              <TouchableOpacity
                style={[styles.postsToggleBtn, postsMode === 'all' && styles.postsToggleBtnActive]}
                onPress={() => setPostsMode('all')}
              >
                <Text style={[styles.postsToggleText, postsMode === 'all' && styles.postsToggleTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.postsToggleBtn, postsMode === 'saved' && styles.postsToggleBtnActive]}
                onPress={() => setPostsMode('saved')}
              >
                <Text style={[styles.postsToggleText, postsMode === 'saved' && styles.postsToggleTextActive]}>Saved</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.composeBox}>
              <View style={styles.composeInputRow}>
                <TextInput
                  style={styles.composeInput}
                  placeholder="Share something with the club..."
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
                  : <Text style={styles.postBtnText}>Post</Text>
                }
              </TouchableOpacity>
            </View>

            {posts.length === 0
              ? <Text style={styles.empty}>{postsMode === 'saved' ? "You haven't saved any posts here yet." : 'No posts yet — be the first!'}</Text>
              : posts.map((p) => (
                <View key={p.id} style={styles.postCard}>
                  <View style={styles.postHeader}>
                    <Avatar
                      uri={p.profiles?.photo_url}
                      name={p.profiles?.full_name}
                      size={38}
                      textColor={COLORS.black}
                      style={styles.avatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{p.profiles?.full_name ?? 'Unknown'}</Text>
                      <Text style={styles.postTime}>{formatAgo(p.created_at)}</Text>
                    </View>
                    {(isSiteAdmin || p.user_id === userId) && (
                      <TouchableOpacity style={styles.adminDeleteBtn} onPress={() => handleDeletePost(p.id, p.user_id === userId)}>
                        <Text style={styles.adminDeleteBtnText}>🗑</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {!!p.text && <Text style={styles.postText}>{p.text}</Text>}
                  {!!p.photo_url && <Image source={{ uri: p.photo_url }} style={styles.postPhoto} resizeMode="cover" />}
                  {!!p.link_url && (
                    <LinkPreviewCard url={p.link_url} title={p.link_title} image={p.link_image} domain={p.link_domain} />
                  )}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleLike(p)}>
                      <Text style={[styles.actionText, likedIds.has(p.id) && styles.actionTextLiked]}>
                        {likedIds.has(p.id) ? '❤️' : '🤍'} {(likeCounts[p.id] ?? 0) > 0 ? likeCounts[p.id] : ''}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(p)}>
                      <Text style={styles.actionText}>📤</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleSave(p)}>
                      <Text style={[styles.actionText, savedIds.has(p.id) && styles.actionTextSaved]}>
                        {savedIds.has(p.id) ? '🔖' : '📑'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => toggleReplies(p.id)}>
                      <Text style={styles.actionText}>
                        💬 {replyState[p.id]?.expanded
                          ? 'Hide replies'
                          : `View replies${replyState[p.id]?.replies != null ? ` (${replyState[p.id].replies.length})` : ''}`}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {replyState[p.id]?.expanded && (
                    <View style={styles.repliesSection}>
                      {replyState[p.id]?.loading ? (
                        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 8 }} />
                      ) : (
                        <>
                          {(replyState[p.id]?.replies ?? []).length === 0 && (
                            <Text style={styles.noReplies}>No replies yet — be the first!</Text>
                          )}
                          {(replyState[p.id]?.replies ?? []).map((r) => (
                            <View key={r.id} style={styles.replyRow}>
                              <Text style={styles.replyName}>{r.profiles?.full_name ?? 'Someone'}</Text>
                              <Text style={styles.replyText}>{r.message}</Text>
                              <Text style={styles.replyTime}>{formatAgo(r.created_at)}</Text>
                            </View>
                          ))}
                          <View style={styles.replyInputRow}>
                            <TextInput
                              style={styles.replyInput}
                              placeholder="Write a reply..."
                              placeholderTextColor={COLORS.textMuted}
                              value={replyState[p.id]?.text ?? ''}
                              onChangeText={(v) => patchPost(p.id, { text: v })}
                              returnKeyType="send"
                              onSubmitEditing={() => handleReply(p.id)}
                            />
                            <EmojiPickerButton onEmojiSelected={(e) => patchPost(p.id, { text: (replyState[p.id]?.text ?? '') + e })} />
                            <TouchableOpacity
                              style={styles.sendBtn}
                              onPress={() => handleReply(p.id)}
                              disabled={replyState[p.id]?.sending}
                            >
                              {replyState[p.id]?.sending
                                ? <ActivityIndicator size="small" color={COLORS.black} />
                                : <Text style={styles.sendBtnText}>Send</Text>
                              }
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>
              ))
            }
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scroll: { paddingBottom: 48 },
  heroPhoto: { width: '100%', height: 200 },
  heroPlaceholder: {
    width: '100%', height: 120,
    backgroundColor: 'rgba(253,171,83,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroEmoji: { fontSize: 52 },
  infoCard: {
    margin: 16, padding: 16,
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  clubName: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  clubDesc: { fontSize: 14, color: COLORS.textLight, lineHeight: 20, marginBottom: 10 },
  clubMeta: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  memberCount: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  adminBtnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  deleteClubBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: COLORS.error, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(231,76,60,0.08)',
  },
  deleteClubBtnText: { color: COLORS.error, fontWeight: '700', fontSize: 13 },
  suspendClubBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(253,171,83,0.08)',
  },
  suspendClubBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  suspendedBanner: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(253,171,83,0.1)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  suspendedBannerText: { fontSize: 13, color: COLORS.primary, fontWeight: '600', textAlign: 'center' },
  joinBtn: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  joinBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
  pendingBanner: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(253,171,83,0.1)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  pendingBannerText: { fontSize: 14, color: COLORS.primary, fontWeight: '600', textAlign: 'center' },
  memberBanner: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(39,174,96,0.1)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#27ae60',
  },
  memberBannerText: { fontSize: 14, color: '#27ae60', fontWeight: '600', textAlign: 'center' },
  section: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  empty: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { marginRight: 12 },
  memberName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text },
  adminBadge: {
    backgroundColor: 'rgba(253,171,83,0.12)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  blockBtn: {
    borderWidth: 1, borderColor: COLORS.error, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8,
    backgroundColor: 'rgba(231,76,60,0.08)',
  },
  blockBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
  unblockBtn: {
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(253,171,83,0.08)',
  },
  unblockBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  approveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 8,
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.black },
  rejectBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(231,76,60,0.1)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.error,
  },
  rejectBtnText: { fontSize: 14, color: COLORS.error, fontWeight: '700' },
  composeBox: { marginBottom: 16 },
  composeInputRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  composeInput: {
    flex: 1,
    borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: COLORS.text, backgroundColor: COLORS.surfaceAlt,
    minHeight: 60, textAlignVertical: 'top',
  },
  composeEmojiBtn: { marginLeft: 8 },
  postBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  postBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.black },
  postCard: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: 14, marginTop: 4,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  postTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  postText: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  postPhoto: { width: '100%', height: 180, borderRadius: 10 },
  adminDeleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  adminDeleteBtnText: { fontSize: 18 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  actionBtn: { paddingVertical: 4, paddingRight: 14 },
  actionText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  actionTextLiked: { color: '#FF3B8D' },
  actionTextSaved: { color: COLORS.primary },
  postsToggleBar: {
    flexDirection: 'row', marginBottom: 14,
    backgroundColor: COLORS.background, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.borderAccent, overflow: 'hidden',
  },
  postsToggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  postsToggleBtnActive: { backgroundColor: COLORS.primary },
  postsToggleText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  postsToggleTextActive: { color: COLORS.black },
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

export default ClubDetailScreen;
