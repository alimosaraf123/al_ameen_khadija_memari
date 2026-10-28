import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { API_BASE, api } from '../lib/api';
import { getDeviceId, saveSession } from '../lib/auth';
import {
  getGuardianDeviceLoginId,
  getRoleBiometricToken,
  saveGuardianDeviceAccount,
  saveRoleBiometricToken,
} from '../lib/guardianDevice';

export default function GatemanLogin() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mpin, setMpin] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'mpin'>('password');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Biometric
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const savedId = await getGuardianDeviceLoginId();
        if (savedId) {
          setLoginId(savedId);
        } else {
          setLoginId('gateman01');
        }

        if (Platform.OS !== 'web') {
          const hasHw = await LocalAuthentication.hasHardwareAsync();
          const isEn = await LocalAuthentication.isEnrolledAsync();
          const token = await getRoleBiometricToken('gateman');
          if (hasHw && isEn && token) {
            setBiometricAvailable(true);
          }
        }
      } catch {}
    })();
  }, []);

  const handlePasswordLogin = async () => {
    const trimmedId = loginId.trim();
    const trimmedPass = password.trim();

    if (!trimmedId) {
      setLoginError('Staff ID / Login ID is required');
      return;
    }
    if (!trimmedPass) {
      setLoginError('Password is required');
      return;
    }

    setBusy(true);
    setLoginError('');

    try {
      const deviceId = await getDeviceId();
      const res = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          login_id: trimmedId,
          password: trimmedPass,
          device_id: deviceId,
        }),
      });

      if (!res?.token || !res?.user) {
        throw new Error('Invalid login response from server');
      }

      await saveSession(res.token, res.user);
      await saveGuardianDeviceAccount(trimmedId);

      // Auto biometric registration on device if available
      if (Platform.OS !== 'web') {
        try {
          const hasHw = await LocalAuthentication.hasHardwareAsync();
          const isEn = await LocalAuthentication.isEnrolledAsync();
          if (hasHw && isEn) {
            const bioReg = await api('/api/biometric/register', {
              method: 'POST',
              body: JSON.stringify({ device_name: `Gateman Device (${trimmedId})` }),
            });
            if (bioReg?.device_token) {
              await saveRoleBiometricToken('gateman', bioReg.device_token, trimmedId);
            }
          }
        } catch {}
      }

      if (res.user.password_change_required) {
        router.replace('/settings');
      } else {
        router.replace('/gateman');
      }
    } catch (e: any) {
      setLoginError(e.message || 'Login failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleMpinLogin = async () => {
    const trimmedId = loginId.trim();
    const cleanMpin = mpin.replace(/\D/g, '').slice(0, 6);

    if (!trimmedId) {
      setLoginError('Staff ID is required');
      return;
    }
    if (cleanMpin.length !== 6) {
      setLoginError('Enter 6-digit mPIN');
      return;
    }

    setBusy(true);
    setLoginError('');

    try {
      const deviceId = await getDeviceId();
      const response = await fetch(`${API_BASE}/api/mpin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login_id: trimmedId,
          mpin: cleanMpin,
          device_id: deviceId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'mPIN login failed');
      }

      await saveSession(data.token, data.user);
      await saveGuardianDeviceAccount(trimmedId);

      if (data.user?.password_change_required) {
        router.replace('/settings');
      } else {
        router.replace('/gateman');
      }
    } catch (e: any) {
      setLoginError(e.message || 'mPIN Login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (Platform.OS === 'web') return;

    try {
      setBiometricBusy(true);
      const deviceToken = await getRoleBiometricToken('gateman');
      if (!deviceToken) {
        Alert.alert('Fingerprint Login', 'Fingerprint is not linked yet. Please login with password or mPIN first.');
        return;
      }

      const authRes = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Login to Al-Ameen Gate Security',
        fallbackLabel: 'Use Password / mPIN',
      });

      if (!authRes.success) return;

      const deviceId = await getDeviceId();
      const response = await fetch(`${API_BASE}/api/biometric/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_token: deviceToken,
          device_id: deviceId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Biometric authentication failed');
      }

      await saveSession(data.token, data.user);
      router.replace('/gateman');
    } catch (e: any) {
      Alert.alert('Fingerprint Login', e.message || 'Fingerprint verification failed');
    } finally {
      setBiometricBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* LOGO & HEADING */}
          <View style={styles.brandSection}>
            <Image
              source={require('../../assets/images/al-ameen-logo.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.schoolName}>Al-Ameen Mission Academy</Text>
            <Text style={styles.branchName}>MEMARI CAMPUS</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.gateBadge}>👮 GATE SECURITY & VISITOR SYSTEM</Text>
            </View>
          </View>

          {/* LOGIN CARD */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {loginMode === 'password' ? 'Gate Duty Login' : '6-Digit mPIN Login'}
            </Text>
            <Text style={styles.cardSubtitle}>
              গেটের দায়িত্বপালন ও ভিজিটর এন্ট্রি রেকর্ড করার জন্য লগইন করুন
            </Text>

            {!!loginError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {loginError}</Text>
              </View>
            )}

            {/* STAFF ID */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Staff Login ID / ইউজার আইডি</Text>
              <TextInput
                style={styles.input}
                value={loginId}
                onChangeText={setLoginId}
                placeholder="e.g. gateman01, gateman03"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {loginMode === 'password' ? (
              /* PASSWORD INPUT */
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password / পাসওয়ার্ড</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <Text style={{ fontSize: 16 }}>{showPassword ? '👁️' : '🙈'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* 6-DIGIT MPIN INPUT */
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>6-Digit mPIN (ডিফল্ট: 123456)</Text>
                <TextInput
                  style={[styles.input, styles.mpinInput]}
                  value={mpin}
                  onChangeText={(v) => setMpin(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                />
              </View>
            )}

            {/* LOGIN BUTTON */}
            <TouchableOpacity
              onPress={loginMode === 'password' ? handlePasswordLogin : handleMpinLogin}
              disabled={busy}
              style={[styles.primaryButton, busy && { opacity: 0.7 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {loginMode === 'password' ? 'Gate Login (লগইন করুন)' : 'Verify mPIN & Login'}
                </Text>
              )}
            </TouchableOpacity>

            {/* TOGGLE LOGIN MODE */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                onPress={() => {
                  setLoginMode(loginMode === 'password' ? 'mpin' : 'password');
                  setLoginError('');
                }}
              >
                <Text style={styles.toggleText}>
                  {loginMode === 'password'
                    ? '🔢 Login with 6-digit mPIN'
                    : '🔑 Login with Password'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* BIOMETRIC FINGERPRINT LOGIN */}
            {biometricAvailable && (
              <TouchableOpacity
                onPress={handleBiometricLogin}
                disabled={biometricBusy}
                style={styles.biometricButton}
              >
                <Text style={{ fontSize: 18 }}>👆</Text>
                <Text style={styles.biometricText}>
                  {biometricBusy ? 'Verifying...' : 'Fingerprint Login (ফিঙ্গারপ্রিন্ট)'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* FOOTER */}
          <Text style={styles.footerText}>
            Al-Ameen Mission Academy Memari · Gate Security App v1.0
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 65,
    height: 65,
    marginBottom: 8,
  },
  schoolName: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  branchName: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 2,
  },
  badgeRow: {
    marginTop: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#34d399',
  },
  gateBadge: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingRight: 10,
  },
  eyeButton: {
    padding: 6,
  },
  mpinInput: {
    fontSize: 22,
    letterSpacing: 10,
    textAlign: 'center',
    fontWeight: '800',
    color: '#047857',
  },
  primaryButton: {
    backgroundColor: '#059669',
    paddingVertical: 13,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  toggleRow: {
    alignItems: 'center',
    marginTop: 14,
  },
  toggleText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '700',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 9,
    paddingVertical: 11,
    marginTop: 14,
    gap: 8,
  },
  biometricText: {
    color: '#166534',
    fontSize: 13.5,
    fontWeight: '800',
  },
  footerText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
  },
});
