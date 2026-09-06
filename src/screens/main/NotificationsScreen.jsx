import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { getSession } from '../../lib/auth';
import { getNotifications, markAllNotificationsRead, deleteNotification } from '../../lib/notifications';
import { resolveNotificationRoute } from '../../lib/pushNotifications';
import { formatAgo } from '../../utils/format';
import AdBanner from '../../components/common/AdBanner';
import ProfileBanner from '../../components/common/ProfileBanner';
import GradientBorder from '../../components/common/GradientBorder';

const TYPE_ICON = {
  friend_request: '👥',
  reply: '💬',
  club_join_request: '🏛️',
  admin_message: '🛡️',
  message: '✉️',
  new_post: '📣',
  content_report: '🚩',
};

const NotificationsScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { session } } = await getSession();
    if (!session) return;
    const uid = session.user.id;
    const { data, error } = await getNotifications(uid);
    if (!error) setNotifications(data ?? []);
    setLoading(false);
    await markAllNotificationsRead(uid);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handlePress = async (item) => {
    const route = await resolveNotificationRoute(item, t('notifications.someone'));
    setNotifications((prev) => prev.filter((n) => n.id !== item.id));
    // supabase-js query builders are lazy — they don't fire until awaited/then'd
    deleteNotification(item.id).then(({ error }) => {
      if (error) console.error('deleteNotification failed', error);
    });
    if (route) {
      navigation.navigate(route.stack, { screen: route.screen, params: route.params, initial: route.initial });
    }
  };

  const formatMessage = (item) => {
    const actor = item.actor?.full_name ?? t('notifications.someone');
    if (item.type === 'friend_request') return t('notifications.friendRequest', { name: actor });
    if (item.type === 'reply') return t('notifications.reply', { name: actor, post: item.reference_text ?? '' });
    if (item.type === 'club_join_request') return t('notifications.clubJoinRequest', { name: actor, club: item.reference_text ?? '' });
    if (item.type === 'admin_message') return t('notifications.adminMessage', { name: actor });
    if (item.type === 'message') return t('notifications.message', { name: actor });
    if (item.type === 'new_post') return t('notifications.newPost', { name: actor });
    if (item.type === 'content_report') return t('notifications.contentReport', { reason: t(`report.reasons.${item.reference_text}`) });
    return '';
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
        <Text style={styles.title}>{t('notifications.title')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={() => (
          <>
            <AdBanner page="Notifications" />
            <ProfileBanner navigation={navigation} />
          </>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.empty}>{t('notifications.empty')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <GradientBorder radius={14} glow={false} style={styles.rowOuter}>
            <TouchableOpacity
              style={[styles.row, !item.read && styles.rowUnread]}
              onPress={() => handlePress(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, !item.read && styles.iconWrapUnread]}>
                <Text style={styles.icon}>{TYPE_ICON[item.type] ?? '🔔'}</Text>
              </View>
              <View style={styles.content}>
                <Text style={styles.message}>{formatMessage(item)}</Text>
                <Text style={styles.time}>{formatAgo(item.created_at)}</Text>
              </View>
              {!item.read && <View style={styles.dot} />}
            </TouchableOpacity>
          </GradientBorder>
        )}
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
  rowUnread: { backgroundColor: 'rgba(253,171,83,0.10)' },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  iconWrapUnread: { backgroundColor: 'rgba(253,171,83,0.18)' },
  icon: { fontSize: 20 },
  content: { flex: 1 },
  message: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  time: { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  dot: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: COLORS.primary,
    marginLeft: 10,
  },
});

export default NotificationsScreen;
