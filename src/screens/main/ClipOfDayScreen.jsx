import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { useFeatureGate } from '../../hooks/useFeatureGate';
import { getDailyClips, createDailyClip, deleteDailyClip } from '../../lib/clips';
import { captureClipVideo } from '../../lib/liveCapture';
import { uploadClipVideo } from '../../lib/storage';
import { getSession } from '../../lib/auth';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import BackHeader from '../../components/common/BackHeader';
import Avatar from '../../components/common/Avatar';

// Days remaining until the next Monday 03:00 purge (see the
// purge-unapproved-clips cron job) — for display only, the server is
// authoritative on what actually gets deleted.
const daysUntilPurge = () => {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday .. 1 = Monday
  const daysAhead = (8 - day) % 7 || 7;
  return daysAhead;
};

const ClipVideo = ({ uri }) => {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; });
  return <VideoView player={player} style={styles.media} contentFit="cover" nativeControls />;
};

const ClipOfDayScreen = ({ navigation }) => {
  useFeatureGate('clip_of_day');
  const { t } = useTranslation();
  const { profile } = useUser();
  const isAdmin = profile?.is_admin === true;
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [userId, setUserId] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const [{ data: { session } }, clipsRes] = await Promise.all([
      getSession(),
      getDailyClips(),
    ]);
    if (session) setUserId(session.user.id);
    if (!clipsRes.error) setClips(clipsRes.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRecord = async () => {
    if (recording) return;
    const media = await captureClipVideo();
    if (!media) return;
    setRecording(true);
    const { url, error: uploadError } = await uploadClipVideo(userId, media.uri);
    if (uploadError) {
      setRecording(false);
      Alert.alert(t('common.error'), t('clips.uploadFailed'));
      return;
    }
    const { error } = await createDailyClip(userId, url);
    setRecording(false);
    if (error) {
      Alert.alert(t('common.error'), t('clips.uploadFailed'));
      return;
    }
    load();
  };

  const handleDelete = (clip) => {
    Alert.alert(t('clips.removeTitle'), t('clips.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteDailyClip(clip.id);
          if (!error) setClips((prev) => prev.filter((c) => c.id !== clip.id));
        },
      },
    ]);
  };

  return (
    <View style={styles.safe}>
      <BackHeader
        title={t('clips.title')}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={handleRecord} disabled={recording} style={styles.recordBtn}>
            {recording
              ? <ActivityIndicator size="small" color={COLORS.black} />
              : <Text style={styles.recordBtnText}>🎬 {t('clips.record')}</Text>
            }
          </TouchableOpacity>
        }
      />
      <Text style={styles.purgeNote}>{t('clips.purgeNote', { days: daysUntilPurge() })}</Text>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={clips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />}
          ListEmptyComponent={<Text style={styles.empty}>{t('clips.empty')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Avatar uri={item.user?.photo_url} name={item.user?.full_name} size={32} />
                <View style={styles.headerText}>
                  <Text style={styles.name}>{item.user?.full_name ?? 'Member'}</Text>
                  <Text style={styles.meta}>{formatAgo(item.created_at)}</Text>
                </View>
                {item.is_approved && <Text style={styles.approvedBadge}>{t('clips.approved')}</Text>}
              </View>
              <ClipVideo uri={item.video_url} />
              {(isAdmin || item.user?.id === userId) && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  recordBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  recordBtnText: { color: COLORS.black, fontWeight: '700', fontSize: 12 },
  purgeNote: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  list: { padding: 16, paddingBottom: 48 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerText: { flex: 1, marginLeft: 10 },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  approvedBadge: { fontSize: 10, fontWeight: '800', color: COLORS.success },
  media: { width: '100%', aspectRatio: 9 / 16, borderRadius: 10, backgroundColor: COLORS.surfaceAlt },
  deleteBtn: { alignSelf: 'flex-end', marginTop: 10 },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
});

export default ClipOfDayScreen;
