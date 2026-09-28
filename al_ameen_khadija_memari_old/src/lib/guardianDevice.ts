import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const GUARDIAN_LOGIN_ID_KEY =
  'guardian_device_login_id';

const GUARDIAN_QUICK_LOGIN_KEY =
  'guardian_quick_login_enabled';

const GUARDIAN_BIOMETRIC_TOKEN_KEY =
  'guardian_biometric_device_token';


// ========================================
// SAVE GUARDIAN ACCOUNT ON THIS DEVICE
// ========================================

export async function saveGuardianDeviceAccount(
  loginId: string
) {
  const cleanLoginId =
    String(loginId || '').trim();

  if (!cleanLoginId) return;

  if (Platform.OS === 'web') {
    localStorage.setItem(
      GUARDIAN_LOGIN_ID_KEY,
      cleanLoginId
    );

    localStorage.setItem(
      GUARDIAN_QUICK_LOGIN_KEY,
      'true'
    );

    return;
  }

  await SecureStore.setItemAsync(
    GUARDIAN_LOGIN_ID_KEY,
    cleanLoginId
  );

  await SecureStore.setItemAsync(
    GUARDIAN_QUICK_LOGIN_KEY,
    'true'
  );
}


// ========================================
// GET SAVED GUARDIAN USER ID
// ========================================

export async function getGuardianDeviceLoginId() {

  if (Platform.OS === 'web') {

    return localStorage.getItem(
      GUARDIAN_LOGIN_ID_KEY
    );

  }

  return await SecureStore.getItemAsync(
    GUARDIAN_LOGIN_ID_KEY
  );
}


// ========================================
// QUICK LOGIN AVAILABLE?
// ========================================

export async function hasGuardianQuickLogin() {

  if (Platform.OS === 'web') {

    return (
      localStorage.getItem(
        GUARDIAN_QUICK_LOGIN_KEY
      ) === 'true'
    );

  }

  const value =
    await SecureStore.getItemAsync(
      GUARDIAN_QUICK_LOGIN_KEY
    );

  return value === 'true';
}


// ========================================
// SAVE BIOMETRIC DEVICE TOKEN
// MOBILE ONLY
// ========================================

export async function saveGuardianBiometricToken(
  token: string
) {

  if (Platform.OS === 'web') {
    return;
  }

  const cleanToken =
    String(token || '').trim();

  if (!cleanToken) return;

  await SecureStore.setItemAsync(
    GUARDIAN_BIOMETRIC_TOKEN_KEY,
    cleanToken
  );
}


// ========================================
// GET BIOMETRIC DEVICE TOKEN
// ========================================

export async function getGuardianBiometricToken() {

  if (Platform.OS === 'web') {
    return null;
  }

  return await SecureStore.getItemAsync(
    GUARDIAN_BIOMETRIC_TOKEN_KEY
  );
}


// ========================================
// CHECK IF FINGERPRINT LOGIN IS ENABLED
// ========================================

export async function hasGuardianBiometricToken() {

  if (Platform.OS === 'web') {
    return false;
  }

  const token =
    await SecureStore.getItemAsync(
      GUARDIAN_BIOMETRIC_TOKEN_KEY
    );

  return !!token;
}


// ========================================
// REMOVE BIOMETRIC TOKEN
// ========================================

export async function clearGuardianBiometricToken() {

  if (Platform.OS === 'web') {
    return;
  }

  await SecureStore.deleteItemAsync(
    GUARDIAN_BIOMETRIC_TOKEN_KEY
  );
}


// ========================================
// FORGET GUARDIAN FROM THIS DEVICE
// ========================================

export async function clearGuardianDeviceAccount() {

  if (Platform.OS === 'web') {

    localStorage.removeItem(
      GUARDIAN_LOGIN_ID_KEY
    );

    localStorage.removeItem(
      GUARDIAN_QUICK_LOGIN_KEY
    );

    return;
  }

  await SecureStore.deleteItemAsync(
    GUARDIAN_LOGIN_ID_KEY
  );

  await SecureStore.deleteItemAsync(
    GUARDIAN_QUICK_LOGIN_KEY
  );

  await SecureStore.deleteItemAsync(
    GUARDIAN_BIOMETRIC_TOKEN_KEY
  );
}