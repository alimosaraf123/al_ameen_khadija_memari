import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
const DEVICE_KEY = 'app_device_id';


export async function getDeviceId() {
  let value: string | null = Platform.OS === 'web' ? localStorage.getItem(DEVICE_KEY) : await SecureStore.getItemAsync(DEVICE_KEY);
  if (!value) {
    value = `device-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    if (Platform.OS === 'web') localStorage.setItem(DEVICE_KEY, value);
    else await SecureStore.setItemAsync(DEVICE_KEY, value);
  }
  return value;
}

export async function saveSession(token: string, user: unknown) {
  const userJson = JSON.stringify(user);

  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, userJson);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, userJson);
}

export async function getToken() {
  if (Platform.OS === 'web') {
    return localStorage.getItem(TOKEN_KEY);
  }

  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getUser<T = any>(): Promise<T | null> {
  let raw: string | null;

  if (Platform.OS === 'web') {
    raw = localStorage.getItem(USER_KEY);
  } else {
    raw = await SecureStore.getItemAsync(USER_KEY);
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
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
