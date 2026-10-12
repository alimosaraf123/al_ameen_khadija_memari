// import { Platform } from 'react-native';
// import * as Device from 'expo-device';
// import * as Notifications from 'expo-notifications';
// import Constants from 'expo-constants';
// import { router } from 'expo-router';
// import { api } from './api';

// Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

// export async function registerPushNotifications() {
//   if (Platform.OS === 'web' || !Device.isDevice) return;
//   const existing = await Notifications.getPermissionsAsync();
//   let permission = existing.status;
//   if (permission !== 'granted') permission = (await Notifications.requestPermissionsAsync()).status;
//   if (permission !== 'granted') return;
//   await Notifications.setNotificationChannelAsync('default', { name: 'Al-Ameen updates', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' });
//   const projectId = Constants.expoConfig?.extra?.eas?.projectId;
//   const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
//   await api('/api/push/register', { method: 'POST', body: JSON.stringify({ expo_push_token: token, platform: Platform.OS }) });
// }

// export function subscribeToPushNavigation() {
//   const response = Notifications.addNotificationResponseReceivedListener(response => {
//     const data = response.notification.request.content.data as any;
//     if (data?.role === 'teacher') {
//       router.push('/notices' as any);
//     } else if (data?.type === 'result') {
//       router.push('/guardian?tab=result' as any);
//     } else if (data?.type === 'notice') {
//       router.push('/guardian?tab=notifications' as any);
//     }
//   });
//   return () => response.remove();
// }





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

export async function registerPushNotifications() {
  if (isExpoGo || Platform.OS === 'web' || !Device.isDevice) return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let permission = existing.status;
    if (permission !== 'granted') permission = (await Notifications.requestPermissionsAsync()).status;
    if (permission !== 'granted') return;
    await Notifications.setNotificationChannelAsync('default', { name: 'Al-Ameen updates', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' });
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await api('/api/push/register', { method: 'POST', body: JSON.stringify({ expo_push_token: token, platform: Platform.OS }) });
  } catch (err) {
    console.warn('Push registration skipped:', err);
  }
}

export function subscribeToPushNavigation() {
  if (isExpoGo) return () => { };
  const Notifications = getNotificationsModule();
  if (!Notifications) return () => { };

  try {
    const response = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data as any;
      if (data?.role === 'teacher') router.push('/notices' as any);
      else if (data?.type === 'result') router.push('/guardian?tab=result' as any);
      else if (data?.type === 'notice') router.push('/guardian?tab=notifications' as any);
    });
    return () => response.remove();
  } catch {
    return () => { };
  }
}
