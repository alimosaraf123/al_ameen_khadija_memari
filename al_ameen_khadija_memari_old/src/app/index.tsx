import React, {
  useEffect,
  useState,
} from 'react';

import {
  View,
  Text,
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

import * as LocalAuthentication
  from 'expo-local-authentication';

import {
  API_BASE,
} from '../lib/api';

import {
  saveSession,
} from '../lib/auth';

import {
  saveGuardianDeviceAccount,
  getGuardianDeviceLoginId,
  hasGuardianQuickLogin,
  clearGuardianDeviceAccount,
  getGuardianBiometricToken,
  hasGuardianBiometricToken,
} from '../lib/guardianDevice';

import {
  Field,
  Button,
} from '../components/ui';


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
  ] = useState(true);


  // FINGERPRINT
  const [
    fingerprintAvailable,
    setFingerprintAvailable
  ] = useState(false);

  const [
    fingerprintBusy,
    setFingerprintBusy
  ] = useState(false);


  // =====================================
  // CHECK SAVED GUARDIAN
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


          if (
            enabled &&
            loginId
          ) {

            setGuardianLoginId(
              loginId
            );

            setUsePasswordLogin(
              false
            );

          }


          if (
            biometric &&
            Platform.OS !== 'web'
          ) {

            setFingerprintAvailable(
              true
            );

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

        const response =
          await fetch(
            `${API_BASE}/api/login`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  login_id:
                    userId.trim(),

                  password,
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
            'Login failed'
          );

        }


        await saveSession(
          data.token,
          data.user
        );


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

        const message =
          e.message ||
          'Unable to login';

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

      if (!guardianLoginId) {

        Alert.alert(
          'Guardian Account',
          'Guardian account is not saved on this device.'
        );

        setUsePasswordLogin(
          true
        );

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
              },

              body:
                JSON.stringify({
                  login_id:
                    guardianLoginId,

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


        setMpin('');


        router.replace(
          '/guardian'
        );


      } catch (e: any) {

        Alert.alert(
          'mPIN Login Failed',
          e.message ||
          'Unable to login'
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


        const deviceToken =
          await getGuardianBiometricToken();


        if (!deviceToken) {

          Alert.alert(
            'Fingerprint Login',
            'Fingerprint Login এই device-এ enabled নেই।'
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
            'এই ফোনে biometric hardware পাওয়া যায়নি।'
          );

          return;

        }


        const enrolled =
          await LocalAuthentication
            .isEnrolledAsync();


        if (!enrolled) {

          Alert.alert(
            'Fingerprint Not Set',
            'ফোনের Settings থেকে Fingerprint সেট করুন।'
          );

          return;

        }


        const authResult =
          await LocalAuthentication
            .authenticateAsync({

              promptMessage:
                'Guardian Login',

              cancelLabel:
                'Cancel',

              fallbackLabel:
                'Use mPIN',

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


        router.replace(
          '/guardian'
        );


      } catch (e: any) {

        Alert.alert(
          'Fingerprint Login Failed',
          e.message ||
          'Unable to login'
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

        'এই device থেকে Guardian quick login বন্ধ হবে। আবার Registration No + Password দিয়ে login করতে হবে।',

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

    <SafeAreaView
      style={styles.page}
    >

      <View
        style={styles.card}
      >

        <Text
          style={styles.title}
        >
          Al-Ameen Mission
        </Text>


        <Text
          style={styles.sub}
        >
          Memari Khadija Campus
        </Text>


        {!usePasswordLogin &&
         guardianLoginId ? (

          <>

            <Text
              style={styles.quickTitle}
            >
              Guardian Quick Login
            </Text>


            <Text
              style={styles.quickHelp}
            >
              mPIN অথবা Fingerprint দিয়ে login করুন।
            </Text>


            {/* FINGERPRINT */}

            {fingerprintAvailable &&
             Platform.OS !== 'web' && (

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


                <Text
                  style={styles.orText}
                >
                  OR
                </Text>

              </>

            )}


            {/* MPIN */}

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
                Forget Guardian from this device
              </Text>

            </TouchableOpacity>

          </>

        ) : (

          <>

            <Field
              value={userId}
              onChangeText={
                setUserId
              }
              placeholder="User ID"
              autoCapitalize="none"
            />


            <Field
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={login}
            />
            <TouchableOpacity onPress={() => setShowPassword(value => !value)} style={{alignSelf:'flex-end',marginTop:-8,marginBottom:12,padding:5}}>
              <Text style={{color:'#1764a5',fontWeight:'800'}}>{showPassword ? 'Hide password' : 'View password'}</Text>
            </TouchableOpacity>


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
                  Guardian Quick Login
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
      padding: 20,
    },

    card: {
      backgroundColor: '#fff',
      padding: 24,
      borderRadius: 18,
      elevation: 5,
    },

    title: {
      fontSize: 28,
      fontWeight: '800',
      textAlign: 'center',
    },

    sub: {
      fontSize: 17,
      color: '#666',
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 28,
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