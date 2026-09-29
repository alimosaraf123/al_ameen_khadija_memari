import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export default function AcademyHeader() {
  return <View style={styles.header}>
    <Image source={require('../../assets/images/al-ameen-logo.jpg')} resizeMode="contain" accessibilityLabel="Al-Ameen Mission Academy Memari logo" style={styles.logo} />
    <Text style={styles.name}>Al-Ameen Mission Academy Memari</Text>
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 14 },
  logo: { width: 58, height: 60 },
  name: { flex: 1, color: '#166534', fontSize: 21, fontWeight: '800' },
});
