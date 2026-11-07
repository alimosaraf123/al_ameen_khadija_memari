import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { api } from './api';

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

function getNotificationsModule() {
  if (isExpoGo) return null;
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}

if (!isExpoGo) {
  try {
    const Notifications = getNotificationsModule();
    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }
  } catch {
    // Ignore in unsupported environments
  }
}

export async function clearNotificationBadge() {
  if (isExpoGo || Platform.OS === 'web') return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(0);
    await Notifications.dismissAllNotificationsAsync();
  } catch (err) {
    console.warn('Failed to clear notification badge:', err);
  }
}

export async function setNotificationBadge(count: number) {
  if (isExpoGo || Platform.OS === 'web') return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch (err) {
    console.warn('Failed to set notification badge:', err);
  }
}

export async function registerPushNotifications() {
  if (isExpoGo || Platform.OS === 'web' || !Device.isDevice) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let permission = existing.status;
    if (permission !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      permission = requested.status;
    }
    if (permission !== 'granted') return;

    // Set notification channel for Android with badge, sound & vibration
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Al-Ameen Mission Updates',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1E3A8A',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await api('/api/push/register', {
      method: 'POST',
      body: JSON.stringify({ expo_push_token: token, platform: Platform.OS }),
    });
  } catch (err) {
    console.warn('Push registration skipped:', err);
  }
}

export function subscribeToPushNavigation() {
  if (isExpoGo) return () => { };
  const Notifications = getNotificationsModule();
  if (!Notifications) return () => { };

  try {
    const response = Notifications.addNotificationResponseReceivedListener((resp: any) => {
      const data = resp?.notification?.request?.content?.data as any;
      // Clear badge count and dismiss notification when opened
      void clearNotificationBadge();

      if (data?.type === 'routine') {
        router.push('/routines' as any);
      } else if (data?.role === 'teacher' || data?.type === 'notice_teacher') {
        router.push('/notices' as any);
      } else if (data?.type === 'result') {
        router.push('/guardian?tab=result' as any);
      } else if (data?.type === 'notice') {
        router.push('/guardian?tab=notifications' as any);
      }
    });
    return () => response.remove();
  } catch {
    return () => { };
  }
}
