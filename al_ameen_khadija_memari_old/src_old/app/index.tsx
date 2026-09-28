import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function HomeScreen() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!userId || !password) {
      Alert.alert('Required', 'Please enter User ID and Password');
      return;
    }

    try {
      const response = await fetch(
        'http://192.168.0.189:3000/api/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            login_id: userId.trim(),
            password: password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        Alert.alert(
          'Login Failed',
          data.message || 'Unable to login'
        );
        return;
      }

      if (data.user.role === 'super_admin') {
        router.replace('/superadmin');
        return;
      }

      Alert.alert(
        'Login Successful',
        `Welcome ${data.user.full_name}\nRole: ${data.user.role}`
      );

    } catch (error) {
      console.log('LOGIN ERROR:', error);

      Alert.alert(
        'Connection Error',
        'Cannot connect to the school server.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>

        <Text style={styles.title}>
          Al-Ameen Mission
        </Text>

        <Text style={styles.subtitle}>
          Memari Khadija Campus
        </Text>

        <Text style={styles.label}>
          User ID
        </Text>

        <TextInput
          style={styles.input}
          value={userId}
          onChangeText={setUserId}
          placeholder="Enter User ID"
          autoCapitalize="none"
        />

        <Text style={styles.label}>
          Password
        </Text>

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter Password"
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>
            Login
          </Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f5f8',
    justifyContent: 'center',
    padding: 20,
  },

  card: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 18,
    elevation: 5,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 30,
  },

  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 7,
    marginTop: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },

  button: {
    backgroundColor: '#1565c0',
    padding: 14,
    borderRadius: 10,
    marginTop: 25,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
});