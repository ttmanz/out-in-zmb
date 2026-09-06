import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, SafeAreaView, Alert, StatusBar,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/colors';
import { ROUTES } from '../../constants/routes';
import { getSession } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { getMessages, sendMessage, markMessagesRead, deleteMessage } from '../../lib/messages';
import { formatAgo } from '../../utils/format';
import { useUser } from '../../contexts/UserContext';
import Avatar from '../../components/common/Avatar';
import EmojiPickerButton from '../../components/common/EmojiPickerButton';
import { setOpenConversationId } from '../../lib/pushNotifications';

const ChatScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { canAccessFeature } = useUser();
  const { conversationId, friendName, friendIsAdmin, friendPhotoUrl } = route.params;
  const [myId, setMyId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);
  const intervalRef = useRef(null);
  const statusBarHeight = StatusBar.currentHeight ?? 44;

  const loadMessages = useCallback(async (uid) => {
    const { data, error } = await getMessages(conversationId);
    if (!error) setMessages(data ?? []);
    setLoading(false);
    if (uid) await markMessagesRead(conversationId, uid);
  }, [conversationId]);

  const appendMessage = useCallback(async (row, uid) => {
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    if (uid && row.sender_id !== uid) await markMessagesRead(conversationId, uid);
  }, [conversationId]);

  useFocusEffect(useCallback(() => {
    let uid;
    let channel;
    let cancelled = false;
    setOpenConversationId(conversationId);
    getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return;
      uid = session.user.id;
      setMyId(uid);
      // Authorise the realtime socket so RLS lets this user receive their rows
      supabase.realtime.setAuth(session.access_token);
      loadMessages(uid);

      // Realtime: new messages in this conversation arrive instantly
      channel = supabase
        .channel(`chat:${conversationId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        }, (payload) => appendMessage(payload.new, uid))
        .subscribe();

      // Slow fallback poll — safety net if a realtime event is ever missed
      intervalRef.current = setInterval(() => loadMessages(uid), 20000);
    });
    return () => {
      cancelled = true;
      setOpenConversationId(null);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadMessages, appendMessage, conversationId]));

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages]);

  const handleSend = async () => {
    const access = canAccessFeature('messages');
    if (!access.allowed) {
      if (access.disabled) Alert.alert(t('common.error'), t('common.featureUnavailable'));
      else if (access.price) navigation.navigate(ROUTES.PAYWALL, { featureKey: access.featureKey });
      else navigation.navigate(ROUTES.SUBSCRIPTION);
      return;
    }
    const content = text.trim();
    if (!content || !myId) return;
    setText('');
    setSending(true);
    const { error } = await sendMessage(conversationId, myId, content);
    if (error) {
      setText(content);
      Alert.alert(t('common.error'), t('messages.sendFailed'));
    } else {
      await loadMessages(myId);
    }
    setSending(false);
  };

  const handleDeleteMessage = (messageId) => {
    Alert.alert(
      t('common.deletePostTitle'),
      t('common.deletePostDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteMessage(messageId, myId);
            if (!error) setMessages((prev) => prev.filter((m) => m.id !== messageId));
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
    <SafeAreaView style={styles.safe}>
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Avatar uri={friendPhotoUrl} name={friendName} size={34} style={styles.headerAvatar} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{friendName}</Text>
            {friendIsAdmin && (
              <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>🛡 Platform Admin</Text></View>
            )}
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('messages.noMessages')}</Text>}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender_id === myId;
            const Bubble = isMe ? TouchableOpacity : View;
            return (
              <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
                <Bubble
                  style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
                  {...(isMe ? { onLongPress: () => handleDeleteMessage(item.id), activeOpacity: 0.7 } : {})}
                >
                  <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
                </Bubble>
                <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
                  {formatAgo(item.created_at)}
                </Text>
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('messages.messagePlaceholder')}
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <EmojiPickerButton onEmojiSelected={(e) => setText((prev) => prev + e)} style={styles.emojiBtn} />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Text style={styles.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { width: 40, alignItems: 'flex-start' },
  backText: { fontSize: 30, color: COLORS.primary, lineHeight: 34 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { marginRight: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  adminBadge: {
    alignSelf: 'flex-start', marginTop: 2,
    backgroundColor: 'rgba(253,171,83,0.15)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1, borderColor: COLORS.borderAccent,
  },
  adminBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  list: { padding: 12, paddingBottom: 8 },
  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 60, fontSize: 14 },
  bubbleWrap: { marginBottom: 10, maxWidth: '78%' },
  bubbleWrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMe: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  bubbleTextMe: { color: COLORS.white },
  bubbleTime: { fontSize: 10, color: COLORS.textMuted, marginTop: 3, marginHorizontal: 4 },
  bubbleTimeMe: { textAlign: 'right' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 100,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  emojiBtn: { marginRight: 8 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.border },
  sendBtnText: { color: COLORS.white, fontSize: 20, fontWeight: '700', lineHeight: 22 },
});

export default ChatScreen;
