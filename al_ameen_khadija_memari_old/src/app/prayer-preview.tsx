import React, { useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PrayerTimeModal from '../components/PrayerTimeModal';
import { getDaySchedule } from '../lib/prayerSchedule';

export default function PrayerPreview() {
  const [visible, setVisible] = useState(true);
  const sched = getDaySchedule(new Date());

  return (
    <SafeAreaView style={styles.page}>
      <PrayerTimeModal visible={visible} onClose={() => setVisible(false)} />
      {!visible && (
        <View style={styles.center}>
          <Text style={styles.title}>🕌 নামাজের সময়সূচি (হানাফী)</Text>
          <Text style={styles.subtitle}>{sched.bengaliDate} · {sched.hijriDate}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => setVisible(true)}>
            <Text style={styles.btnText}>পপআপ আবার খুলুন (Open Popup)</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    padding: 24,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    gap: 10,
    elevation: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#065f46',
  },
  subtitle: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  btn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 8,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
});
