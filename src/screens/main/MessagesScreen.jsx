import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { getSession } from '../../lib/auth';
import { getConversations } from '../../lib/messages';
import { formatAgo } from '../../utils/format';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import Avatar from '../../components/common/Avatar';
import GradientBorder from '../../components/common/GradientBorder';

const MessagesScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { session } } = await getSession();
    if (!session) return;
    const uid = session.user.id;
    setUserId(uid);
    const { data, error } = await getConversations(uid);
    if (!error) setConversations(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const getPartner = (conv) => {
    if (!userId) return null;
    return conv.user1_id === userId ? conv.user2 : conv.user1;
  };

  const openChat = (conv) => {
    const partner = getPartner(conv);
    navigation.navigate(ROUTES.CHAT, {
      conversationId: conv.id,
      friendName: partner?.full_name ?? t('messages.unknownMember'),
      friendIsAdmin: partner?.is_admin === true,
      friendPhotoUrl: partner?.photo_url ?? null,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('messages.title')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={() => (
          <>
            <AdBanner page="Messages" />
            <ProfileBanner navigation={navigation} />
          </>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.empty}>{t('messages.noConversations')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const partner = getPartner(item);
          return (
            <GradientBorder radius={14} glow={false} style={styles.rowOuter}>
              <TouchableOpacity style={styles.row} onPress={() => openChat(item)} activeOpacity={0.7}>
                <Avatar uri={partner?.photo_url} name={partner?.full_name} size={48} style={styles.avatar} />
                <View style={styles.rowContent}>
                  <View style={styles.nameRow}>
                    <Text style={styles.partnerName}>{partner?.full_name ?? t('messages.unknownMember')}</Text>
                    {partner?.is_admin && (
                      <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>🛡 Admin</Text></View>
                    )}
                  </View>
                  {!!item.last_message_content && (
                    <Text style={styles.lastMsg} numberOfLines={1}>{item.last_message_content}</Text>
                  )}
                </View>
                {!!item.last_message_at && (
                  <Text style={styles.time}>{formatAgo(item.last_message_at)}</Text>
                )}
              </TouchableOpacity>
            </GradientBorder>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { width: 40, alignItems: 'flex-start' },
  backText: { fontSize: 30, color: COLORS.primary, lineHeight: 34 },
  title: { flex: 1, fontSize: 26, fontWeight: '800', color: COLORS.primary, textAlign: 'center' },
  list: { paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  empty: { color: COLORS.textMuted, fontSize: 15 },
  rowOuter: { marginHorizontal: 16, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  avatar: { marginRight: 12 },
  rowContent: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partnerName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  adminBadge: {
    backgroundColor: 'rgba(253,171,83,0.15)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  adminBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  lastMsg: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  time: { fontSize: 11, color: COLORS.textMuted, marginLeft: 8 },
});

export default MessagesScreen;
