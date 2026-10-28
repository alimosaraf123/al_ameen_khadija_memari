import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { api } from '../lib/api';
import { getToken, subscribeSession } from '../lib/auth';

export default function Layout() {
  const [session, setSession] = useState<{ checked: boolean; user: any }>({ checked: false, user: null });
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Al-Ameen Gate Security';
      let iconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.type = 'image/png';
      iconLink.href = '/favicon.png';
    }
  }, []);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      let user = null;
      try {
        const token = await getToken();
        if (token) {
          const data = await api('/api/me');
          if (data?.user?.is_active) {
            user = data.user;
          }
        }
      } catch {}
      if (active) {
        setSession({ checked: true, user });
      }
    };

    const unsubscribe = subscribeSession(verify);
    void verify();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [pathname]);

  useEffect(() => {
    if (!session.checked) return;
    if (!session.user && pathname !== '/') {
      router.replace('/');
    } else if (session.user && pathname === '/') {
      router.replace('/gateman');
    }
  }, [session, pathname]);

  if (!session.checked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef4f7' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="gateman" />
        <Stack.Screen name="settings" />
      </Stack>
    </GestureHandlerRootView>
  );
}
