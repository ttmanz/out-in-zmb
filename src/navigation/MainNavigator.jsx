import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUTES } from '../constants/routes';
import { COLORS } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { getUnreadNotificationCount } from '../lib/notifications';
import { getUnreadMessageCount } from '../lib/messages';
import { subscriptionStatus } from '../lib/subscription';
import { useUser } from '../contexts/UserContext';

import HomeScreen from '../screens/main/HomeScreen';
import WhatHappeningScreen from '../screens/main/WhatHappeningScreen';
import HappeningFeedScreen from '../screens/main/HappeningFeedScreen';
import CreateHappeningScreen from '../screens/main/CreateHappeningScreen';
import WhereToGoScreen from '../screens/main/WhereToGoScreen';
import SpurOfMomentScreen from '../screens/main/SpurOfMomentScreen';
import CreateSpurScreen from '../screens/main/CreateSpurScreen';
import ProfileSettingsScreen from '../screens/main/ProfileSettingsScreen';
import OpenChatScreen from '../screens/main/OpenChatScreen';
import CreateOpenChatScreen from '../screens/main/CreateOpenChatScreen';
import MemberProfileScreen from '../screens/main/MemberProfileScreen';
import ClubGroupsScreen from '../screens/main/ClubGroupsScreen';
import ClubDetailScreen from '../screens/main/ClubDetailScreen';
import CreateClubScreen from '../screens/main/CreateClubScreen';
import AtVenueScreen from '../screens/main/AtVenueScreen';
import VenueHubScreen from '../screens/main/VenueHubScreen';
import VenueSearchScreen from '../screens/main/VenueSearchScreen';
import VenueReviewsScreen from '../screens/main/VenueReviewsScreen';
import MembersAtScreen from '../screens/main/MembersAtScreen';
import TopVenuesScreen from '../screens/main/TopVenuesScreen';
import FriendsHubScreen from '../screens/main/FriendsHubScreen';
import FriendsListScreen from '../screens/main/FriendsListScreen';
import PendingRequestsScreen from '../screens/main/PendingRequestsScreen';
import SearchUsersScreen from '../screens/main/SearchUsersScreen';
import MessagesScreen from '../screens/main/MessagesScreen';
import ChatScreen from '../screens/main/ChatScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import AdminScreen from '../screens/main/AdminScreen';
import AdminSubscriptionPlansScreen from '../screens/main/AdminSubscriptionPlansScreen';
import AdminTopVenuesScreen from '../screens/main/AdminTopVenuesScreen';
import SubscriptionScreen from '../screens/main/SubscriptionScreen';
import PaywallScreen from '../screens/main/PaywallScreen';
import CompleteProfileScreen from '../screens/main/CompleteProfileScreen';
import ActivitiesScreen from '../screens/main/ActivitiesScreen';
import ActivityEventsScreen from '../screens/main/ActivityEventsScreen';
import CreateActivityEventScreen from '../screens/main/CreateActivityEventScreen';
import EventsScreen from '../screens/main/EventsScreen';
import EventFeedScreen from '../screens/main/EventFeedScreen';
import CreateEventScreen from '../screens/main/CreateEventScreen';
import StoryFeedScreen from '../screens/main/StoryFeedScreen';
import CreateStoryScreen from '../screens/main/CreateStoryScreen';
import ClipOfDayScreen from '../screens/main/ClipOfDayScreen';
import MarketScreen from '../screens/main/MarketScreen';
import CreateMarketListingScreen from '../screens/main/CreateMarketListingScreen';
import OpenGroupsScreen from '../screens/main/OpenGroupsScreen';
import GroupDetailScreen from '../screens/main/GroupDetailScreen';
import AdminOpenGroupsScreen from '../screens/main/AdminOpenGroupsScreen';
import AdminAdsScreen from '../screens/main/AdminAdsScreen';
import AdminAccessControlScreen from '../screens/main/AdminAccessControlScreen';
import AdminReportsScreen from '../screens/main/AdminReportsScreen';
import AdminClipsScreen from '../screens/main/AdminClipsScreen';
import AdminFlaggedMembersScreen from '../screens/main/AdminFlaggedMembersScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const NotificationsStack = createNativeStackNavigator();
const AdminStack = createNativeStackNavigator();

const HomeStackNavigator = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name={ROUTES.HOME} component={HomeScreen} />
    <HomeStack.Screen name={ROUTES.FRIENDS_HUB} component={FriendsHubScreen} />
    <HomeStack.Screen name={ROUTES.FRIENDS_LIST} component={FriendsListScreen} />
    <HomeStack.Screen name={ROUTES.PENDING_REQUESTS} component={PendingRequestsScreen} />
    <HomeStack.Screen name={ROUTES.SEARCH_USERS} component={SearchUsersScreen} />
    <HomeStack.Screen name={ROUTES.CHAT} component={ChatScreen} />
    <HomeStack.Screen name={ROUTES.WHAT_HAPPENING} component={WhatHappeningScreen} />
    <HomeStack.Screen name={ROUTES.HAPPENING_FEED} component={HappeningFeedScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_HAPPENING} component={CreateHappeningScreen} />
    <HomeStack.Screen name={ROUTES.WHERE_TO_GO} component={WhereToGoScreen} />
    <HomeStack.Screen name={ROUTES.SPUR_OF_MOMENT} component={SpurOfMomentScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_SPUR} component={CreateSpurScreen} />
    <HomeStack.Screen name={ROUTES.PROFILE_SETTINGS} component={ProfileSettingsScreen} />
    <HomeStack.Screen name={ROUTES.OPEN_CHAT} component={OpenChatScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_OPEN_CHAT} component={CreateOpenChatScreen} />
    <HomeStack.Screen name={ROUTES.MEMBER_PROFILE} component={MemberProfileScreen} />
    <HomeStack.Screen name={ROUTES.CLUB_GROUPS}      component={ClubGroupsScreen} />
    <HomeStack.Screen name={ROUTES.CLUB_DETAIL}      component={ClubDetailScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_CLUB}      component={CreateClubScreen} />
    <HomeStack.Screen name={ROUTES.AT_VENUE}          component={AtVenueScreen} />
    <HomeStack.Screen name={ROUTES.VENUE_HUB}        component={VenueHubScreen} />
    <HomeStack.Screen name={ROUTES.VENUE_SEARCH}     component={VenueSearchScreen} />
    <HomeStack.Screen name={ROUTES.VENUE_REVIEWS}   component={VenueReviewsScreen} />
    <HomeStack.Screen name={ROUTES.MEMBERS_AT}       component={MembersAtScreen} />
    <HomeStack.Screen name={ROUTES.TOP_VENUES}        component={TopVenuesScreen} />
    <HomeStack.Screen name={ROUTES.COMPLETE_PROFILE}  component={CompleteProfileScreen} />
    <HomeStack.Screen name={ROUTES.ACTIVITIES}        component={ActivitiesScreen} />
    <HomeStack.Screen name={ROUTES.ACTIVITY_EVENTS}  component={ActivityEventsScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_ACTIVITY_EVENT} component={CreateActivityEventScreen} />
    <HomeStack.Screen name={ROUTES.EVENTS}             component={EventsScreen} />
    <HomeStack.Screen name={ROUTES.EVENT_FEED}         component={EventFeedScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_EVENT}       component={CreateEventScreen} />
    <HomeStack.Screen name={ROUTES.STORY_FEED}        component={StoryFeedScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_STORY}      component={CreateStoryScreen} />
    <HomeStack.Screen name={ROUTES.CLIP_OF_DAY}       component={ClipOfDayScreen} />
    <HomeStack.Screen name={ROUTES.SUBSCRIPTION}            component={SubscriptionScreen} />
    <HomeStack.Screen name={ROUTES.PAYWALL}                 component={PaywallScreen} />
    <HomeStack.Screen name={ROUTES.MARKET}                  component={MarketScreen} />
    <HomeStack.Screen name={ROUTES.CREATE_MARKET_LISTING}   component={CreateMarketListingScreen} />
    <HomeStack.Screen name={ROUTES.OPEN_GROUPS}             component={OpenGroupsScreen} />
    <HomeStack.Screen name={ROUTES.GROUP_DETAIL}            component={GroupDetailScreen} />
  </HomeStack.Navigator>
);

const MessagesStackNavigator = () => (
  <MessagesStack.Navigator screenOptions={{ headerShown: false }}>
    <MessagesStack.Screen name={ROUTES.MESSAGES} component={MessagesScreen} />
    <MessagesStack.Screen name={ROUTES.CHAT} component={ChatScreen} />
    <MessagesStack.Screen name={ROUTES.MEMBER_PROFILE} component={MemberProfileScreen} />
    <MessagesStack.Screen name={ROUTES.PAYWALL} component={PaywallScreen} />
  </MessagesStack.Navigator>
);

const NotificationsStackNavigator = () => (
  <NotificationsStack.Navigator screenOptions={{ headerShown: false }}>
    <NotificationsStack.Screen name={ROUTES.NOTIFICATIONS} component={NotificationsScreen} />
  </NotificationsStack.Navigator>
);

const AdminStackNavigator = () => (
  <AdminStack.Navigator screenOptions={{ headerShown: false }}>
    <AdminStack.Screen name="Admin" component={AdminScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_SUBSCRIPTION_PLANS} component={AdminSubscriptionPlansScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_TOP_VENUES} component={AdminTopVenuesScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_OPEN_GROUPS} component={AdminOpenGroupsScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_ADS} component={AdminAdsScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_ACCESS_CONTROL} component={AdminAccessControlScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_REPORTS} component={AdminReportsScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_CLIPS} component={AdminClipsScreen} />
    <AdminStack.Screen name={ROUTES.ADMIN_FLAGGED_MEMBERS} component={AdminFlaggedMembersScreen} />
  </AdminStack.Navigator>
);

const MainNavigator = () => {
  const [notifCount, setNotifCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const insets = useSafeAreaInsets();
  const { profile, settings } = useUser();

  const isRestricted = profile?.status === 'restricted';
  const isAdmin = profile?.is_admin === true;
  // Under 'free_except_venue' mode, venue accounts get a 30-day trial from
  // signup, then need an active subscription for the whole app — checked
  // here, before any tab/stack is reachable, rather than per-feature like
  // the member-facing modes.
  const venueLocked = profile?.account_type === 'venue_owner' && !subscriptionStatus(profile, settings).hasAccess;

  useEffect(() => {
    if (isRestricted || venueLocked) return;
    let notifChannel, msgChannel;
    getSession().then(({ data: { session } }) => {
      if (!session) return;
      const uid = session.user.id;
      // Authorise the realtime socket so RLS delivers this user's rows
      supabase.realtime.setAuth(session.access_token);

      // Refetch on any change, not just INSERT — an UPDATE is what marks
      // notifications read (opening the Alerts tab), and the badge needs to
      // clear then too, not just grow on new ones.
      const refreshNotifCount = () =>
        getUnreadNotificationCount(uid).then(({ count }) => setNotifCount(count ?? 0));
      refreshNotifCount();
      notifChannel = supabase
        .channel('notif_badge')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        }, refreshNotifCount)
        .subscribe();

      // Messages badge: refetch on any message change I can see — INSERTs bump
      // the count, UPDATEs (read_at stamped when a chat is opened) clear it
      const refreshMsgCount = () =>
        getUnreadMessageCount(uid).then(({ count }) => setMsgCount(count ?? 0));
      refreshMsgCount();
      msgChannel = supabase
        .channel('msg_badge')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refreshMsgCount)
        .subscribe();
    });
    return () => {
      [notifChannel, msgChannel].forEach((c) => c && supabase.removeChannel(c));
    };
  }, [isRestricted, venueLocked]);

  if (venueLocked) {
    return <SubscriptionScreen standalone />;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.tabBar,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 20,
        },
        tabBarActiveTintColor: COLORS.glow,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />

      {!isRestricted && (
        <Tab.Screen
          name="MessagesTab"
          component={MessagesStackNavigator}
          options={{
            tabBarLabel: 'Messages',
            tabBarBadge: msgCount > 0 ? (msgCount > 99 ? '99+' : msgCount) : undefined,
            tabBarBadgeStyle: { backgroundColor: COLORS.notification, color: COLORS.white, fontSize: 10, fontWeight: '800' },
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={24} color={color} />
            ),
          }}
        />
      )}

      {!isRestricted && (
        <Tab.Screen
          name="NotificationsTab"
          component={NotificationsStackNavigator}
          listeners={() => ({
            tabPress: () => setNotifCount(0),
          })}
          options={{
            tabBarLabel: 'Alerts',
            tabBarBadge: notifCount > 0 ? (notifCount > 99 ? '99+' : notifCount) : undefined,
            tabBarBadgeStyle: { backgroundColor: COLORS.notification, color: COLORS.white, fontSize: 10, fontWeight: '800' },
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={24} color={color} />
            ),
          }}
        />
      )}

      {isAdmin && (
        <Tab.Screen
          name="AdminTab"
          component={AdminStackNavigator}
          options={{
            tabBarLabel: 'Admin',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'shield' : 'shield-outline'} size={24} color={color} />
            ),
          }}
        />
      )}
    </Tab.Navigator>
  );
};

export default MainNavigator;
