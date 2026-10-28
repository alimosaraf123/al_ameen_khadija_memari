import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
const DEVICE_KEY = 'app_device_id';
const memoryStore = new Map<string, string>();
let secureStoreModule: Promise<typeof import('expo-secure-store') | null> | null = null;
async function getSecureStore() {
  if (!secureStoreModule) {
    secureStoreModule = import('expo-secure-store').catch(() => null);
  }
  return secureStoreModule;
}
async function readNative(key: string) {
  const store = await getSecureStore();
  try { return store ? await store.getItemAsync(key) : memoryStore.get(key) || null; } catch { return memoryStore.get(key) || null; }
}
async function writeNative(key: string, value: string) {
  memoryStore.set(key, value);
  const store = await getSecureStore();
  try { if (store) await store.setItemAsync(key, value); } catch { /* memory fallback keeps the current session usable */ }
}
async function deleteNative(key: string) {
  memoryStore.delete(key);
  const store = await getSecureStore();
  try { if (store) await store.deleteItemAsync(key); } catch { /* ignore unavailable secure storage */ }
}
const sessionListeners = new Set<() => Promise<void>>();
export function subscribeSession(listener: () => Promise<void>) {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}
async function notifySessionChanged() {
  await Promise.allSettled([...sessionListeners].map(listener => listener()));
}
export async function refreshSession() {
  await notifySessionChanged();
}


export async function getDeviceId() {
  let value: string | null = Platform.OS === 'web' ? localStorage.getItem(DEVICE_KEY) : await readNative(DEVICE_KEY);
  if (!value) {
    value = `device-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    if (Platform.OS === 'web') localStorage.setItem(DEVICE_KEY, value);
    else await writeNative(DEVICE_KEY, value);
  }
  return value;
}

export async function saveSession(token: string, user: unknown) {
  const userJson = JSON.stringify(user);

  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, userJson);
    await notifySessionChanged();
    return;
  }

  await writeNative(TOKEN_KEY, token);
  await writeNative(USER_KEY, userJson);
  await notifySessionChanged();
}

export async function getToken() {
  if (Platform.OS === 'web') {
    return localStorage.getItem(TOKEN_KEY);
  }

  return readNative(TOKEN_KEY);
}

export async function getUser<T = any>(): Promise<T | null> {
  let raw: string | null;

  if (Platform.OS === 'web') {
    raw = localStorage.getItem(USER_KEY);
  } else {
    raw = await readNative(USER_KEY);
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearSession() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    await notifySessionChanged();
    return;
  }

  await deleteNative(TOKEN_KEY);
  await deleteNative(USER_KEY);
  await notifySessionChanged();
}
