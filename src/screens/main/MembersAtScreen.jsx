import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { getHappenings, getHappeningReplies, createHappeningReply } from '../../lib/happenings';
import { getSession } from '../../lib/auth';
import { formatAgo } from '../../utils/format';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import BackHeader from '../../components/common/BackHeader';
import Avatar from '../../components/common/Avatar';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';

const MembersAtScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState([]);
  const [replyState, setReplyState] = useState({});

  const handleSearch = async () => {
    const name = query.trim();
    if (!name) return;
    setLoading(true);
    const { data, error } = await getHappenings();
    if (!error) {
      const lower = name.toLowerCase();
      setResults((data ?? []).filter(
        (h) => h.venue && h.venue.toLowerCase().includes(lower)
      ));
    }
    setSearched(true);
    setLoading(false);
  };

  const uniqueMembers = [...new Map(results.map((h) => [h.user_id, h])).values()];

  const patchReply = (id, patch) =>
    setReplyState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleReplies = async (happeningId) => {
    const cur = replyState[happeningId] ?? {};
    if (cur.expanded) { patchReply(happeningId, { expanded: false }); return; }
    patchReply(happeningId, { expanded: true, loading: true });
    const { data, error } = await getHappeningReplies(happeningId);
    patchReply(happeningId, { loading: false, replies: error ? [] : (data ?? []) });
  };

  const handleReply = async (happeningId) => {
    const text = (replyState[happeningId]?.text ?? '').trim();
    if (!text) return;
    const { data: { session } } = await getSession();
    if (!session) return;
    patchReply(happeningId, { sending: true });
    const { error } = await createHappeningReply(session.user.id, happeningId, text);
    if (error) {
      Alert.alert(t('common.error'), t('happenings.errors.replyFailed'));
      patchReply(happeningId, { sending: false });
    } else {
      const { data } = await getHappeningReplies(happeningId);
      patchReply(happeningId, { sending: false, text: '', replies: data ?? [] });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.safe} behavior="padding">
      <BackHeader title={t('venueHub.membersAt')} onBack={() => navigation.goBack()} />

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={t('venueHub.searchPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity
          style={[styles.searchBtn, !query.trim() && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading
            ? <ActivityIndicator size="small" color={COLORS.black} />
            : <Text style={styles.searchBtnText}>→</Text>
          }
        </TouchableOpacity>
      </View>

      {searched && (
        <View style={styles.countBanner}>
          <Text style={styles.countText}>
            👥 {uniqueMembers.length} {t('venueHub.membersRecent')}
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          searched && !loading
            ? <Text style={styles.empty}>{t('venueHub.noMembers')}</Text>
            : null
        }
        ListHeaderComponent={() => (
          <View>
            <AdBanner page="MembersAt" />
            <ProfileBanner navigation={navigation} />
            {results.length > 0 && <Text style={styles.sectionLabel}>{t('venueHub.recentPosts')}</Text>}
          </View>
        )}
        renderItem={({ item }) => {
          const ps = replyState[item.id] ?? {};
          const replyCount = ps.replies?.length ?? 0;
          return (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Avatar
                  uri={item.profiles?.photo_url}
                  name={item.profiles?.full_name}
                  size={40}
                  backgroundColor={COLORS.primaryDark}
                  style={styles.avatar}
                />
                <View style={styles.cardContent}>
                  <Text style={styles.memberName}>{item.profiles?.full_name ?? '—'}</Text>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.cardTime}>{formatAgo(item.created_at)}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.replyToggle} onPress={() => toggleReplies(item.id)}>
                <Text style={styles.replyToggleText}>
                  💬 {ps.expanded ? t('happenings.hideReplies') : `${t('happenings.viewReplies')} ${ps.replies ? `(${replyCount})` : ''}`}
                </Text>
              </TouchableOpacity>

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
                            : <Text style={styles.sendBtnText}>{t('happenings.send')}</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  searchRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  input: {
    flex: 1, borderWidth: 1, borderColor: COLORS.borderAccent, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  searchBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: { fontSize: 20, color: COLORS.black, fontWeight: '700' },
  searchBtnDisabled: { opacity: 0.4 },
  countBanner: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(253,171,83,0.12)',
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  countText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4,
  },
  empty: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { marginRight: 12 },
  cardContent: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  cardTitle: { fontSize: 13, color: COLORS.text },
  cardTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
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

export default MembersAtScreen;
