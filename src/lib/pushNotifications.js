import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { ROUTES } from '../constants/routes';
import { supabase } from './supabase';
import { deleteNotification } from './notifications';

// Foreground behavior — alert + sound for everything, except a 'message'
// notification for the conversation the user already has open (that chat's
// realtime subscription already renders the message live).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data ?? {};
    const isOpenConversationMessage =
      data.type === 'message' && data.reference_id === getOpenConversationId();
    return {
      shouldShowAlert: !isOpenConversationMessage,
      shouldPlaySound: !isOpenConversationMessage,
      shouldSetBadge: true,
      shouldShowBanner: !isOpenConversationMessage,
      shouldShowList: true,
    };
  },
});

// --- Currently-open conversation tracking (foreground suppression) ---
let openConversationId = null;
export const setOpenConversationId = (id) => { openConversationId = id; };
export const getOpenConversationId = () => openConversationId;

// --- Device token registration ---
let currentToken = null;
// Bumped by unregisterPushToken so a registration still in flight when the
// user signs out (this call runs unawaited from UserContext) discards its
// result instead of writing a token for the account that just logged out.
let registrationEpoch = 0;

export const registerForPushNotificationsAsync = async (userId) => {
  if (!Device.isDevice || !userId) return;
  const epoch = ++registrationEpoch;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token || epoch !== registrationEpoch) return;

    currentToken = token;
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      );
    if (error) console.error('registerForPushNotificationsAsync: failed to save push token', error);
  } catch (e) {
    // Runs unawaited from UserContext — without this, a failure here (e.g. missing
    // platform push credentials) fails completely silently with no trace.
    console.error('registerForPushNotificationsAsync failed', e);
  }
};

export const unregisterPushToken = async () => {
  registrationEpoch++;
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
};

// --- Deep-link resolution, shared between NotificationsScreen's tap handler
// and the push-notification tap listener below ---
const REPLY_TARGETS = {
  spur: ROUTES.SPUR_OF_MOMENT,
  open_chat: ROUTES.OPEN_CHAT,
  happening: ROUTES.HAPPENING_FEED,
  story: ROUTES.STORY_FEED,
  market_listing: ROUTES.MARKET,
};

const NEW_POST_TARGETS = {
  happening: ROUTES.HAPPENING_FEED,
  spur: ROUTES.SPUR_OF_MOMENT,
  open_chat: ROUTES.OPEN_CHAT,
};

// group_posts don't carry their group's id on the notification row itself,
// so a reply notification on one needs a lookup before we know where to send
// the user — GroupDetailScreen requires both groupId and groupName to render.
const resolveGroupPostRoute = async (postId) => {
  const { data } = await supabase
    .from('group_posts')
    .select('group_id, open_groups(name)')
    .eq('id', postId)
    .single();
  if (!data) return { stack: 'HomeTab', screen: ROUTES.OPEN_GROUPS };
  return {
    stack: 'HomeTab',
    screen: ROUTES.GROUP_DETAIL,
    params: { groupId: data.group_id, groupName: data.open_groups?.name, focusItemId: postId },
  };
};

// Same shape as resolveGroupPostRoute — ClubDetailScreen only needs clubId.
const resolveClubPostRoute = async (postId) => {
  const { data } = await supabase
    .from('club_posts')
    .select('club_id')
    .eq('id', postId)
    .single();
  if (!data) return { stack: 'HomeTab', screen: ROUTES.CLUB_GROUPS };
  return {
    stack: 'HomeTab',
    screen: ROUTES.CLUB_DETAIL,
    params: { clubId: data.club_id, focusItemId: postId },
  };
};

// events/activity_events feeds are per-category, so a reply notification
// needs a lookup to know which category feed to open.
const resolveEventRoute = async (eventId) => {
  const { data } = await supabase.from('events').select('category').eq('id', eventId).single();
  if (!data) return { stack: 'HomeTab', screen: ROUTES.EVENTS };
  return {
    stack: 'HomeTab',
    screen: ROUTES.EVENT_FEED,
    params: { category: data.category, focusItemId: eventId },
  };
};

const resolveActivityEventRoute = async (eventId) => {
  const { data } = await supabase.from('activity_events').select('category').eq('id', eventId).single();
  if (!data) return { stack: 'HomeTab', screen: ROUTES.ACTIVITIES };
  return {
    stack: 'HomeTab',
    screen: ROUTES.ACTIVITY_EVENTS,
    params: { filter: data.category, focusItemId: eventId },
  };
};

// --- Shared-post deep links (out-in-zmb.com/p/:type/:id -> outandaround://post/:type/:id) ---
// Reuses the same per-type route resolvers as reply notifications above.
export const resolvePostDeepLink = async (type, id) => {
  if (type === 'story') return { stack: 'HomeTab', screen: ROUTES.STORY_FEED, params: { focusItemId: id } };
  if (type === 'event') return resolveEventRoute(id);
  if (type === 'group_post') return resolveGroupPostRoute(id);
  if (type === 'club_post') return resolveClubPostRoute(id);
  return null;
};

export const resolveNotificationRoute = async (item, fallbackName = 'Someone') => {
  const actorName = item.actor?.full_name ?? fallbackName;

  if (item.type === 'friend_request') {
    return { stack: 'HomeTab', screen: ROUTES.PENDING_REQUESTS };
  }
  if (item.type === 'reply') {
    if (item.reference_type === 'group_post') return resolveGroupPostRoute(item.reference_id);
    if (item.reference_type === 'club_post') return resolveClubPostRoute(item.reference_id);
    if (item.reference_type === 'event') return resolveEventRoute(item.reference_id);
    if (item.reference_type === 'activity_event') return resolveActivityEventRoute(item.reference_id);
    const screen = REPLY_TARGETS[item.reference_type];
    return screen ? { stack: 'HomeTab', screen, params: { focusItemId: item.reference_id } } : null;
  }
  if (item.type === 'club_join_request') {
    return { stack: 'HomeTab', screen: ROUTES.CLUB_DETAIL, params: { clubId: item.reference_id } };
  }
  if (item.type === 'admin_message') {
    return {
      stack: 'MessagesTab',
      screen: ROUTES.CHAT,
      params: { conversationId: item.reference_id, friendName: actorName, friendIsAdmin: true },
    };
  }
  if (item.type === 'message') {
    return {
      stack: 'MessagesTab',
      screen: ROUTES.CHAT,
      params: { conversationId: item.reference_id, friendName: actorName },
    };
  }
  if (item.type === 'content_report') {
    return { stack: 'AdminTab', screen: ROUTES.ADMIN_REPORTS, initial: false };
  }
  if (item.type === 'new_post') {
    const screen = NEW_POST_TARGETS[item.reference_type];
    return screen ? { stack: 'HomeTab', screen, params: { focusItemId: item.reference_id } } : null;
  }
  return null;
};

// --- Tap handler: wired once near the root navigator ---
export const addNotificationResponseListener = (navigationRef) =>
  Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data ?? {};
    const route = await resolveNotificationRoute(data);
    if (data.notification_id) {
      deleteNotification(data.notification_id).then(({ error }) => {
        if (error) console.error('deleteNotification failed', error);
      });
    }
    if (route && navigationRef.isReady()) {
      navigationRef.navigate(route.stack, { screen: route.screen, params: route.params, initial: route.initial });
    }
  });
