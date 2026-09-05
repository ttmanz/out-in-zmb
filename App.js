import './src/lib/i18n';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import { onAuthStateChange, getSession } from './src/lib/auth';
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import { COLORS } from './src/constants/colors';
import { UserProvider } from './src/contexts/UserContext';
import { addNotificationResponseListener, resolvePostDeepLink } from './src/lib/pushNotifications';

const navigationRef = createNavigationContainerRef();

// Shared-post links (outandaround://post/:type/:id, opened from the
// out-in-zmb.com/p/:type/:id web fallback) can arrive before the navigator
// has mounted, and their route resolution (e.g. resolveEventRoute) queries
// tables gated by RLS on auth.uid() — which is only reliably set once the
// restored session has actually been attached to the Supabase client. A
// fixed timeout retry can't guarantee either of those, so instead the link
// is queued and only processed once both are confirmed ready.
let navigationIsReady = false;
let sessionIsReady = false;
let queuedDeepLinkUrl = null;

const flushQueuedDeepLink = async () => {
  if (!navigationIsReady || !sessionIsReady || !queuedDeepLinkUrl) return;
  const url = queuedDeepLinkUrl;
  queuedDeepLinkUrl = null;

  // For outandaround://post/:type/:id, "post" parses as the URL's hostname,
  // not the first path segment (non-special schemes treat the first
  // component after // as an opaque host) — path alone is just ":type/:id".
  const { hostname, path } = Linking.parse(url);
  const parts = [hostname, ...(path ?? '').split('/')].filter(Boolean);
  if (parts[0] !== 'post' || parts.length < 3) return;
  const [, type, id] = parts;
  const route = await resolvePostDeepLink(type, id);
  if (route && navigationRef.isReady()) {
    navigationRef.navigate(route.stack, { screen: route.screen, params: route.params });
  }
};

const queueDeepLink = (url) => {
  if (!url) return;
  queuedDeepLinkUrl = url;
  flushQueuedDeepLink();
};

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      sessionIsReady = true;
      flushQueuedDeepLink();
    });

    const { data: { subscription } } = onAuthStateChange((_event, activeSession) => {
      setSession(activeSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = addNotificationResponseListener(navigationRef);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(queueDeepLink);
    const sub = Linking.addEventListener('url', ({ url }) => queueDeepLink(url));
    return () => sub.remove();
  }, []);

  if (session === undefined) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <NavigationContainer
          ref={navigationRef}
          onReady={() => { navigationIsReady = true; flushQueuedDeepLink(); }}
        >
          {session
            ? <UserProvider><MainNavigator /></UserProvider>
            : <AuthNavigator />
          }
        </NavigationContainer>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
});
