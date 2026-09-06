import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, FlatList, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS } from '../../constants/colors';
import { getDailyClips, deleteDailyClip, setClipApproved, setClipFlagged } from '../../lib/clips';
import { formatAgo } from '../../utils/format';
import BackHeader from '../../components/common/BackHeader';
import Avatar from '../../components/common/Avatar';

const ClipVideo = ({ uri }) => {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; });
  return <VideoView player={player} style={styles.media} contentFit="cover" nativeControls />;
};

const AdminClipsScreen = ({ navigation }) => {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getDailyClips();
    if (!error) setClips(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleApproved = async (clip) => {
    setUpdating(clip.id);
    const { error } = await setClipApproved(clip.id, !clip.is_approved);
    setUpdating(null);
    if (!error) setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, is_approved: !c.is_approved } : c)));
  };

  const toggleFlagged = async (clip) => {
    setUpdating(clip.id);
    const { error } = await setClipFlagged(clip.id, !clip.is_flagged);
    setUpdating(null);
    if (!error) setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, is_flagged: !c.is_flagged } : c)));
  };

  const remove = (clip) => {
    Alert.alert('Remove Clip', 'Remove this clip now, before its Monday purge?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUpdating(clip.id);
          const { error } = await deleteDailyClip(clip.id);
          setUpdating(null);
          if (!error) setClips((prev) => prev.filter((c) => c.id !== clip.id));
        },
      },
    ]);
  };

  return (
    <View style={styles.safe}>
      <BackHeader title="Clip of the Day" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={clips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No clips yet.</Text>}
          renderItem={({ item }) => {
            const busy = updating === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Avatar uri={item.user?.photo_url} name={item.user?.full_name} size={32} />
                  <View style={styles.headerText}>
                    <Text style={styles.name}>{item.user?.full_name ?? 'Member'}</Text>
                    <Text style={styles.meta}>{formatAgo(item.created_at)}</Text>
                  </View>
                </View>

                <ClipVideo uri={item.video_url} />

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, item.is_approved && styles.approveBtnActive]}
                    onPress={() => toggleApproved(item)}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator size="small" color={COLORS.black} /> : (
                      <Text style={[styles.actionText, item.is_approved && styles.actionTextActive]}>
                        {item.is_approved ? '✓ Approved' : 'Approve'}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, item.is_flagged && styles.flagBtnActive]}
                    onPress={() => toggleFlagged(item)}
                    disabled={busy}
                  >
                    <Text style={[styles.actionText, item.is_flagged && styles.actionTextActive]}>
                      {item.is_flagged ? '🚩 Flagged' : 'Flag'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.removeBtn]} onPress={() => remove(item)} disabled={busy}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
                {!item.is_approved && (
                  <Text style={styles.purgeHint}>Auto-removed next Monday unless approved.</Text>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  media: { width: '100%', aspectRatio: 9 / 16, borderRadius: 10, backgroundColor: COLORS.surfaceAlt },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  actionTextActive: { color: COLORS.black },
  approveBtnActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  flagBtnActive: { backgroundColor: COLORS.notification, borderColor: COLORS.notification },
  removeBtn: { borderColor: COLORS.error },
  removeText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
  purgeHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 8, fontStyle: 'italic' },
});

export default AdminClipsScreen;
