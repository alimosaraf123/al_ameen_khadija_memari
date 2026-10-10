import { Platform } from 'react-native';

let secureStoreModule: Promise<typeof import('expo-secure-store') | null> | null = null;
async function getSecureStore() {
  if (!secureStoreModule) secureStoreModule = import('expo-secure-store').catch(() => null);
  return secureStoreModule;
}
const SecureStore = {
  async setItemAsync(key: string, value: string) { const store = await getSecureStore(); if (store) await store.setItemAsync(key, value); },
  async getItemAsync(key: string) { const store = await getSecureStore(); return store ? store.getItemAsync(key) : null; },
  async deleteItemAsync(key: string) { const store = await getSecureStore(); if (store) await store.deleteItemAsync(key); },
};

const GUARDIAN_LOGIN_ID_KEY =
  'guardian_device_login_id';

const GUARDIAN_QUICK_LOGIN_KEY =
  'guardian_quick_login_enabled';

const GUARDIAN_BIOMETRIC_TOKEN_KEY =
  'guardian_biometric_device_token';

const BIOMETRIC_ACCOUNT_ROLE_KEY = 'biometric_device_account_role';
const BIOMETRIC_ACCOUNT_LOGIN_KEY = 'biometric_device_account_login';
const biometricTokenKey = (role: string) => `biometric_device_token_${String(role || '').trim()}`;


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

export async function saveRoleBiometricToken(role: string, token: string, loginId?: string) {
  if (Platform.OS === 'web') return;
  const cleanRole = String(role || '').trim();
  const cleanToken = String(token || '').trim();
  if (!cleanRole || !cleanToken) return;
  await SecureStore.setItemAsync(biometricTokenKey(cleanRole), cleanToken);
  await SecureStore.setItemAsync(BIOMETRIC_ACCOUNT_ROLE_KEY, cleanRole);
  if (loginId) await SecureStore.setItemAsync(BIOMETRIC_ACCOUNT_LOGIN_KEY, String(loginId));
}

export async function getRoleBiometricToken(role: string) {
  if (Platform.OS === 'web') return null;
  const cleanRole = String(role || '').trim();
  return cleanRole ? SecureStore.getItemAsync(biometricTokenKey(cleanRole)) : null;
}

export async function getBiometricAccount() {
  if (Platform.OS === 'web') return null;
  const role = await SecureStore.getItemAsync(BIOMETRIC_ACCOUNT_ROLE_KEY);
  const loginId = await SecureStore.getItemAsync(BIOMETRIC_ACCOUNT_LOGIN_KEY);
  return role && loginId ? { role, loginId } : null;
}

export async function clearRoleBiometricToken(role: string) {
  if (Platform.OS === 'web') return;
  const cleanRole = String(role || '').trim();
  if (!cleanRole) return;
  await SecureStore.deleteItemAsync(biometricTokenKey(cleanRole));
  const account = await getBiometricAccount();
  if (account?.role === cleanRole) {
    await SecureStore.deleteItemAsync(BIOMETRIC_ACCOUNT_ROLE_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_ACCOUNT_LOGIN_KEY);
  }
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
