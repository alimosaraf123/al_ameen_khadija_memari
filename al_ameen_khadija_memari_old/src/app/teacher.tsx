import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import AcademyHeader from '../components/AcademyHeader';
import { clearSession } from '../lib/auth';

const items: any[] = [
  ['Evening Room Attendance', '/attendance', '#157347'],
  ['Room Problems', '/problems', '#c56a14'],
  ['Student Behaviour', '/behavior', '#754bbd'],
  ['Marks Entry', '/marks', '#2369b3'],
  ['Routine', '/routines', '#39758e'],
  ['Notice', '/notices', '#9a3d67'],
];

export default function Teacher() {
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <AcademyHeader />
        <Text style={s.title}>Room Teacher Dashboard</Text>
        <Text style={s.subtitle}>Evening duty, attendance and room reports</Text>
        <View style={s.grid}>
          {items.map(([title, path, color]) => (
            <TouchableOpacity key={title} style={[s.card, { borderLeftColor: color }]} onPress={() => router.push(path as any)}>
              <Text style={[s.cardText, { color }]}>{title}</Text>
              <Text style={s.openText}>Open →</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.logout} onPress={async () => { await clearSession(); router.replace('/'); }}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f2f7f4' },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 16, paddingBottom: 40 },
  title: { fontSize: 25, fontWeight: '900', color: '#173d2b', marginTop: 6 },
  subtitle: { color: '#68786f', marginTop: 3, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', minWidth: 240, flexGrow: 1, backgroundColor: '#fff', borderRadius: 14, borderLeftWidth: 6, padding: 18, elevation: 2 },
  cardText: { fontSize: 17, fontWeight: '900' },
  openText: { color: '#7a8780', marginTop: 12, fontWeight: '600' },
  logout: { backgroundColor: '#b52d3a', padding: 14, borderRadius: 10, marginTop: 18 },
  logoutText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
});
