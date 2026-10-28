import React, {
  useEffect,
  useState,
} from 'react';

import {
  View,
  Text,
  Image,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  router,
} from 'expo-router';

import * as LocalAuthentication from 'expo-local-authentication';

import {
  API_BASE,
  api,
} from '../lib/api';

import {
  saveSession,
  getDeviceId,
} from '../lib/auth';

import {
  saveGuardianDeviceAccount,
  getGuardianDeviceLoginId,
  hasGuardianQuickLogin,
  clearGuardianDeviceAccount,
  getGuardianBiometricToken,
  hasGuardianBiometricToken,
  getBiometricAccount,
  getRoleBiometricToken,
  saveRoleBiometricToken,
} from '../lib/guardianDevice';

import {
  Field,
  Button,
} from '../components/ui';


const panelForRole=(role:string)=>role==='guardian'?'/guardian':role==='teacher'?'/teacher':role==='gateman'?'/gateman':role==='office'?'/office':role==='library'?'/library':'/';
const offlineMessage=(e:any)=>{const m=String(e?.message||'');return /network|fetch failed|unknownhost|unable to resolve host|internet|timeout|aborted/i.test(m)?'Please connect internet and try again.':(m||'Unable to login');};

export default function Login() {

  // NORMAL LOGIN
  const [userId, setUserId] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const [loginError, setLoginError] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);


  // GUARDIAN QUICK LOGIN
  const [
    guardianLoginId,
    setGuardianLoginId
  ] = useState<string | null>(null);

  const [
    mpin,
    setMpin
  ] = useState('');

  const [
    mpinBusy,
    setMpinBusy
  ] = useState(false);

  const [
    usePasswordLogin,
    setUsePasswordLogin
  ] = useState(Platform.OS === 'web');


  // FINGERPRINT
  const [
    fingerprintAvailable,
    setFingerprintAvailable
  ] = useState(false);

  const [
    fingerprintBusy,
    setFingerprintBusy
  ] = useState(false);

  const [fingerprintRole, setFingerprintRole] = useState<string | null>(null);
  const quickLoginLabel = fingerprintRole === 'gateman'
    ? 'Gateman Quick Login'
    : fingerprintRole === 'teacher'
    ? 'Teacher Quick Login'
    : fingerprintRole === 'admin'
    ? 'Admin Quick Login'
    : 'Guardian Quick Login';


  // =====================================
  // CHECK SAVED ACCOUNT / GATEMAN FINGERPRINT
  // =====================================

  useEffect(() => {

    const checkGuardian =
      async () => {

        try {

          const enabled =
            await hasGuardianQuickLogin();

          const loginId =
            await getGuardianDeviceLoginId();

          const biometric =
            await hasGuardianBiometricToken();

          // Keep the login action visible on native devices when the phone
          // supports enrolled biometrics. The saved device token is checked
          // again when the user presses the button.
          const nativeBiometricReady = Platform.OS !== 'web'
            && await LocalAuthentication.hasHardwareAsync()
            && await LocalAuthentication.isEnrolledAsync();

          const savedBiometricAccount = await getBiometricAccount();
          const savedRoleToken = savedBiometricAccount?.role
            ? await getRoleBiometricToken(savedBiometricAccount.role)
            : null;

          const isGatemanTarget = savedBiometricAccount?.role === 'gateman' ||
            String(savedBiometricAccount?.loginId || loginId || '').toLowerCase().startsWith('gateman');

          if (
            savedRoleToken &&
            ['admin','teacher','gateman'].includes(String(savedBiometricAccount?.role)) &&
            Platform.OS !== 'web'
          ) {
            setGuardianLoginId(savedBiometricAccount?.loginId || null);
            setFingerprintRole(String(savedBiometricAccount?.role));
            setFingerprintAvailable(true);
            setUserId(savedBiometricAccount?.loginId || '');
            setUsePasswordLogin(false);
          } else if (isGatemanTarget && Platform.OS !== 'web') {
            const gId = savedBiometricAccount?.loginId || loginId || '';
            setGuardianLoginId(gId);
            setFingerprintRole('gateman');
            setFingerprintAvailable(true);
            setUserId(gId);
            setUsePasswordLogin(false);
          } else if (enabled && loginId) {
            setGuardianLoginId(loginId);
            setFingerprintRole(loginId.toLowerCase().startsWith('gateman') ? 'gateman' : 'guardian');
            setUserId(loginId);
            setUsePasswordLogin(false);
          } else {
            setUsePasswordLogin(true);
          }

        } catch (e) {

          console.log(
            'Quick login check failed',
            e
          );

        }

      };


    checkGuardian();

  }, []);

  // Auto-prompt fingerprint for Gateman on mobile/native devices
  useEffect(() => {
    if (
      fingerprintRole === 'gateman' &&
      fingerprintAvailable &&
      !usePasswordLogin &&
      Platform.OS !== 'web'
    ) {
      void getRoleBiometricToken('gateman').then((token) => {
        if (token) {
          const timer = setTimeout(() => {
            void loginWithFingerprint();
          }, 500);
          return () => clearTimeout(timer);
        }
      });
    }
  }, [fingerprintRole, fingerprintAvailable, usePasswordLogin]);


  // =====================================
  // PASSWORD LOGIN
  // =====================================

  const login =
    async () => {

      if (
        !userId ||
        !password
      ) {

        return Alert.alert(
          'Required',
          'Enter User ID and Password'
        );

      }


      setLoginError('');
      setBusy(true);


      try {

        const deviceId =
          await getDeviceId();

        const response =
          await fetch(
            `${API_BASE}/api/login`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
                'X-Device-Id': deviceId,
              },

              body:
                JSON.stringify({
                  login_id:
                    userId.trim(),
                  password:
                    password.trim(),

                  device_id:
                    deviceId,
                }),
            }
          );


        const responseText = await response.text();
        let data: any = {};
        if (responseText.trim()) {
          try {
            data = JSON.parse(responseText);
          } catch {
            throw new Error(`Login server returned invalid data (${response.status})`);
          }
        } else if (!response.ok) {
          throw new Error(`Login server unavailable (${response.status})`);
        }


        if (
          !response.ok ||
          !data.success
        ) {

          throw new Error(
            data.message ||
            'Login failed'
          );

        }


        await saveSession(
          data.token,
          data.user
        );

        if (data.user.password_change_required) { router.replace('/settings'); return; }
        const savedLoginId = data.user.login_id || userId.trim();
        await saveGuardianDeviceAccount(savedLoginId);
        setGuardianLoginId(savedLoginId);


        if (['gateman','office','library'].includes(data.user.role)) {
          const staffLoginId = data.user.login_id || userId.trim();
          await saveGuardianDeviceAccount(staffLoginId);
          if (data.user.role === 'gateman' && Platform.OS !== 'web') {
            try {
              const hasHw = await LocalAuthentication.hasHardwareAsync();
              const isEn = await LocalAuthentication.isEnrolledAsync();
              if (hasHw && isEn) {
                const bioReg = await api('/api/biometric/register', {
                  method: 'POST',
                  body: JSON.stringify({ device_name: `Gateman Device (${staffLoginId})` })
                });
                if (bioReg?.device_token) {
                  await saveRoleBiometricToken('gateman', bioReg.device_token, staffLoginId);
                }
              }
            } catch (bioErr) {
              console.log('Gateman auto biometric setup:', bioErr);
            }
          }
          router.replace(panelForRole(data.user.role) as any);
          return;
        }

        if (
          data.user.role ===
          'guardian'
        ) {

          const loginId =
            data.user.login_id ||
            userId.trim();


          await saveGuardianDeviceAccount(
            loginId
          );


          setGuardianLoginId(
            loginId
          );


          router.replace(
            '/guardian'
          );

          return;

        }


        if (
          data.user.role ===
            'super_admin' ||
          data.user.role ===
            'admin'
        ) {

          router.replace(
            '/superadmin'
          );

          return;

        }


        if (
          data.user.role ===
          'teacher'
        ) {

          router.replace(
            '/teacher'
          );

          return;

        }


      } catch (e: any) {

        const message = `${e?.message || 'Error'} [URL: ${API_BASE}/api/login]`;

        setLoginError(message);

        Alert.alert(
          'Login Failed',
          message
        );


      } finally {

        setBusy(false);

      }

    };


  // =====================================
  // MPIN LOGIN
  // =====================================

  const loginWithMpin =
    async () => {

      const activeLoginId = guardianLoginId || userId || (Platform.OS !== 'web' ? 'gateman01' : '');
      if (!activeLoginId) {
        Alert.alert('Account Required', 'Please select or enter your User ID.');
        setUsePasswordLogin(true);
        return;
      }


      if (
        !/^\d{6}$/.test(mpin)
      ) {

        Alert.alert(
          'Invalid mPIN',
          'Enter your 6 digit mPIN.'
        );

        return;

      }


      setMpinBusy(true);


      try {

        const response =
          await fetch(
            `${API_BASE}/api/mpin-login`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
                'X-Device-Id': await getDeviceId(),
              },

              body:
                JSON.stringify({
                  login_id:
                    activeLoginId,

                  mpin,
                }),
            }
          );


        const data =
          await response.json();


        if (
          !response.ok ||
          !data.success
        ) {

          throw new Error(
            data.message ||
            'mPIN login failed'
          );

        }


        await saveSession(
          data.token,
          data.user
        );

        if (data.user.password_change_required) { router.replace('/settings'); return; }
        const savedLoginId = data.user.login_id || userId.trim();
        await saveGuardianDeviceAccount(savedLoginId);
        setGuardianLoginId(savedLoginId);

        if (data.user.role === 'gateman' && Platform.OS !== 'web') {
          try {
            const hasHw = await LocalAuthentication.hasHardwareAsync();
            const isEn = await LocalAuthentication.isEnrolledAsync();
            if (hasHw && isEn) {
              const bioReg = await api('/api/biometric/register', {
                method: 'POST',
                body: JSON.stringify({ device_name: `Gateman Device (${savedLoginId})` })
              });
              if (bioReg?.device_token) {
                await saveRoleBiometricToken('gateman', bioReg.device_token, savedLoginId);
              }
            }
          } catch (bioErr) {
            console.log('Gateman auto biometric setup via mpin:', bioErr);
          }
        }

        setMpin('');


        router.replace(panelForRole(data.user.role) as any);


      } catch (e: any) {

        Alert.alert(
          'mPIN Login Failed',
          offlineMessage(e)
        );


      } finally {

        setMpinBusy(false);

      }

    };


  // =====================================
  // FINGERPRINT LOGIN
  // =====================================

  const loginWithFingerprint =
    async () => {

      if (
        Platform.OS === 'web'
      ) {
        return;
      }


      try {

        setFingerprintBusy(
          true
        );


        const deviceToken = fingerprintRole === 'guardian'
          ? await getGuardianBiometricToken()
          : await getRoleBiometricToken(fingerprintRole || '');


        if (!deviceToken) {

          if (fingerprintRole === 'gateman') {
            Alert.alert(
              'Fingerprint Setup',
              'Please login once with your 6-digit mPIN (Default: 123456) or Password to link fingerprint on this phone.'
            );
            return;
          }

          Alert.alert(
            'Fingerprint Login',
            'Fingerprint Login is not enabled on this device.'
          );

          setFingerprintAvailable(
            false
          );

          return;

        }


        const hasHardware =
          await LocalAuthentication
            .hasHardwareAsync();


        if (!hasHardware) {

          Alert.alert(
            'Not Available',
            'Biometric hardware was not found on this phone.'
          );

          return;

        }


        const enrolled =
          await LocalAuthentication
            .isEnrolledAsync();


        if (!enrolled) {

          Alert.alert(
            'Fingerprint Not Set',
            'Set up Fingerprint from your phone Settings.'
          );

          return;

        }


        const authResult =
          await LocalAuthentication
            .authenticateAsync({

              promptMessage:
                fingerprintRole === 'gateman' ? 'Gateman Fingerprint Login' : fingerprintRole === 'teacher' ? 'Teacher Login' : fingerprintRole === 'admin' ? 'Admin Login' : 'Guardian Login',

              cancelLabel:
                'Cancel',

              fallbackLabel:
                fingerprintRole === 'gateman' ? 'Use Password' : 'Use mPIN',

            });


        if (
          !authResult.success
        ) {

          return;

        }


        const response =
          await fetch(
            `${API_BASE}/api/biometric-login`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
                'X-Device-Id': await getDeviceId(),
              },

              body:
                JSON.stringify({
                  device_token:
                    deviceToken,
                }),
            }
          );


        const data =
          await response.json();


        if (
          !response.ok ||
          !data.success
        ) {

          throw new Error(
            data.message ||
            'Fingerprint login failed'
          );

        }


        await saveSession(
          data.token,
          data.user
        );

        if (data.user.password_change_required) { router.replace('/settings'); return; }
        const savedLoginId = data.user.login_id || userId.trim();
        await saveGuardianDeviceAccount(savedLoginId);
        setGuardianLoginId(savedLoginId);


        router.replace(panelForRole(data.user.role) as any);


      } catch (e: any) {

        Alert.alert(
          'Fingerprint Login Failed',
          offlineMessage(e)
        );


      } finally {

        setFingerprintBusy(
          false
        );

      }

    };


  // =====================================
  // FORGET GUARDIAN ACCOUNT
  // =====================================

  const forgetGuardian =
    () => {

      Alert.alert(
        'Forget Guardian Account?',

        'Guardian quick login will be disabled on this device. You will need to log in again with Registration No + Password.',

        [
          {
            text: 'Cancel',
            style: 'cancel',
          },

          {
            text: 'Forget',
            style: 'destructive',

            onPress:
              async () => {

                await clearGuardianDeviceAccount();

                setGuardianLoginId(
                  null
                );

                setFingerprintAvailable(
                  false
                );

                setMpin('');

                setUsePasswordLogin(
                  true
                );

              },
          },
        ]
      );

    };


  return (

    <SafeAreaView style={styles.page}>

      <View
        style={styles.card}
      >

        <Image
          source={require('../../assets/images/al-ameen-logo.jpg')}
          resizeMode="contain"
          accessibilityLabel="Al-Ameen Mission Academy Memari logo"
          style={styles.loginLogo}
        />

        <Text
          style={styles.title}
        >
          Al-Ameen Mission Academy Memari
        </Text>


        <Text
          style={styles.sub}
        >
          Memari Khadija Campus (Bengali Medium)
        </Text>


        {!usePasswordLogin &&
         (Platform.OS !== 'web' || guardianLoginId || fingerprintAvailable) ? (

          <>

            <Text
              style={styles.quickTitle}
            >
              {quickLoginLabel}
            </Text>


            <Text
              style={styles.quickHelp}
            >
              {fingerprintRole === 'gateman'
                ? 'Log in with Fingerprint or 6-digit mPIN.'
                : 'Log in with mPIN or Fingerprint.'}
            </Text>

            {fingerprintRole === 'gateman' && Boolean(guardianLoginId || userId) && (
              <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 14, alignSelf: 'center', borderWidth: 1, borderColor: '#bae6fd' }}>
                <Text style={{ color: '#0369a1', fontSize: 13, fontWeight: '800' }}>
                  👮 Logged in: {guardianLoginId || userId}
                </Text>
              </View>
            )}


            {/* FINGERPRINT */}

            {(fingerprintAvailable || Platform.OS !== 'web') && (

              <>

                <Button

                  title={
                    fingerprintBusy
                      ? 'Checking Fingerprint...'
                      : 'Login with Fingerprint'
                  }

                  onPress={
                    loginWithFingerprint
                  }

                />


                <Text style={styles.orText}>OR</Text>

              </>

            )}


            {/* MPIN */}
                <Text style={styles.fieldLabel}>Enter 6-digit mPIN</Text>
                <Field
                  value={mpin}

                  onChangeText={(
                    value: string
                  ) => {

                    setMpin(
                      value
                        .replace(
                          /\D/g,
                          ''
                        )
                        .slice(0, 6)
                    );

                  }}

                  placeholder="Enter 6 Digit mPIN"

                  keyboardType="numeric"

                  secureTextEntry

                  maxLength={6}
                />


                <Button

                  title={
                    mpinBusy
                      ? 'Please wait...'
                      : 'Login with mPIN'
                  }

                  onPress={
                    loginWithMpin
                  }

                />


            <TouchableOpacity

              style={
                styles.passwordButton
              }

              onPress={() => {

                setUsePasswordLogin(
                  true
                );

                setMpin('');

              }}

            >

              <Text
                style={
                  styles.passwordText
                }
              >
                Login with Password instead
              </Text>

            </TouchableOpacity>


            <TouchableOpacity

              style={
                styles.forgetButton
              }

              onPress={
                forgetGuardian
              }

            >

              <Text
                style={
                  styles.forgetText
                }
              >
                {fingerprintRole === 'gateman' ? 'Switch Gateman Account / Forget from this device' : 'Forget Guardian from this device'}
              </Text>

            </TouchableOpacity>

          </>

        ) : (

          <>

            
            <Text style={styles.fieldLabel}>User ID / Registration No.</Text>
            <Field
              value={userId}
              onChangeText={
                setUserId
              }
              placeholder="Enter User ID / Registration No."
              autoCapitalize="none"
            />


            <Text style={styles.fieldLabel}>Password / Temporary Password</Text>
            <View style={styles.passwordFieldWrap}>
              <Field
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={login}
                style={styles.passwordField}
              />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(value => !value)} style={styles.passwordEye}>
                <Text style={styles.passwordEyeIcon}>{String.fromCodePoint(0x1F441)}</Text>
              </TouchableOpacity>
            </View>


            <Button

              title={
                busy
                  ? 'Please wait...'
                  : 'Login'
              }

              onPress={login}

            />

            {!!loginError && (
              <Text
                accessibilityRole="alert"
                style={{
                  color: '#b4232f',
                  backgroundColor: '#ffe8eb',
                  borderWidth: 1,
                  borderColor: '#efabb2',
                  borderRadius: 8,
                  padding: 10,
                  marginTop: 10,
                  textAlign: 'center',
                  fontWeight: '800',
                }}
              >
                {loginError}
              </Text>
            )}


            {guardianLoginId && (

              <TouchableOpacity

                style={
                  styles.mpinButton
                }

                onPress={() => {

                  setUsePasswordLogin(
                    false
                  );

                  setPassword('');

                }}

              >

                <Text
                  style={
                    styles.mpinText
                  }
                >
                {quickLoginLabel}
                </Text>

              </TouchableOpacity>

            )}

          </>

        )}

      </View>

    </SafeAreaView>

  );

}


const styles =
  StyleSheet.create({

    page: {
      flex: 1,
      backgroundColor: '#f2f5f8',
      justifyContent: 'center',
      padding: 12,
      width: '100%',
    },

    card: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      backgroundColor: 'rgba(255,255,255,0.94)',
      padding: 20,
      borderRadius: 18,
      elevation: 5,
    },

    gatemanPickerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 6,
    },
    gatemanPickerBtn: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 10,
      backgroundColor: '#f0f4f8',
      borderWidth: 1.5,
      borderColor: '#d0d7de',
      alignItems: 'center',
    },
    gatemanPickerBtnActive: {
      backgroundColor: '#005f73',
      borderColor: '#005f73',
    },
    gatemanPickerText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#475467',
    },
    gatemanPickerTextActive: {
      color: '#ffffff',
    },
    loginLogo: {
      width: 64,
      height: 64,
      alignSelf: 'center',
      marginBottom: 4,
    },

    title: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '800',
      textAlign: 'center',
    },

    sub: {
      fontSize: 14,
      lineHeight: 20,
      color: '#666',
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 20,
    },

    quickTitle: {
      fontSize: 21,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: 8,
    },

    quickHelp: {
      color: '#667085',
      textAlign: 'center',
      marginBottom: 18,
    },

    orText: {
      textAlign: 'center',
      marginVertical: 12,
      color: '#667085',
      fontWeight: '700',
    },

    passwordButton: {
      marginTop: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: '#1565c0',
      borderRadius: 9,
    },

    passwordFieldWrap: {
      position: 'relative',
      marginBottom: 10,
    },
    fieldLabel: {
      color: '#29445f',
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 5,
      marginTop: 4,
    },

    passwordField: {
      paddingRight: 54,
      marginBottom: 0,
    },

    passwordEye: {
      position: 'absolute',
      right: 8,
      top: 4,
      width: 42,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },

    passwordEyeIcon: {
      color: '#1764a5',
      fontSize: 22,
    },

    passwordText: {
      color: '#1565c0',
      textAlign: 'center',
      fontWeight: '700',
    },

    mpinButton: {
      marginTop: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: '#1565c0',
      borderRadius: 9,
    },

    mpinText: {
      color: '#1565c0',
      textAlign: 'center',
      fontWeight: '700',
    },

    forgetButton: {
      marginTop: 12,
      padding: 8,
    },

    forgetText: {
      color: '#c62828',
      textAlign: 'center',
      fontSize: 13,
    },

  });
