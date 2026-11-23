import React, { useMemo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getDaySchedule } from '../lib/prayerSchedule';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PrayerTimeModal({ visible, onClose }: Props) {
  const schedule = useMemo(() => getDaySchedule(new Date()), [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 24 }}>🕌</Text>
              <View>
                <Text style={styles.headerTitle}>দৈনিক নামাজের সময়সূচি (হানাফী মাযহাব)</Text>
                <Text style={styles.headerSubtitle}>আল-আমীন মিশন একাডেমি মেমারি</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* 3 Dates Banner */}
            <View style={styles.dateCard}>
              <View style={styles.dateRow}>
                <Text style={styles.dateIcon}>📅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateLabel}>ইংরেজি তারিখ</Text>
                  <Text style={styles.dateValue}>{schedule.englishDate}</Text>
                </View>
              </View>
              <View style={styles.dateDivider} />
              <View style={styles.dateRow}>
                <Text style={styles.dateIcon}>🌾</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateLabel}>বাংলা তারিখ</Text>
                  <Text style={styles.dateValue}>{schedule.bengaliDate}</Text>
                </View>
              </View>
              <View style={styles.dateDivider} />
              <View style={styles.dateRow}>
                <Text style={styles.dateIcon}>🌙</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateLabel}>হিজরি / আরবি তারিখ</Text>
                  <Text style={styles.dateValue}>{schedule.hijriDate}</Text>
                </View>
              </View>
            </View>

            {/* Current Waqt Banner */}
            <View style={styles.currentBanner}>
              <Text style={styles.currentTitle}>{schedule.currentWaqt}</Text>
              {schedule.currentWaqtSubtext ? (
                <Text style={styles.currentDesc}>{schedule.currentWaqtSubtext}</Text>
              ) : null}
            </View>

            {/* Prayer Times Table */}
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1.6 }]}>ওয়াক্ত / পর্যায়</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'center' }]}>আরম্ভ</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'center' }]}>শেষ</Text>
              </View>

              {schedule.rows.map((row) => {
                const isProh = row.isProhibited;
                const isCurr = row.isCurrent;

                return (
                  <View
                    key={row.key}
                    style={[
                      styles.tableRow,
                      isProh && styles.rowProhibited,
                      isCurr && styles.rowCurrent,
                    ]}
                  >
                    <View style={{ flex: 1.6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[
                          styles.rowName,
                          isProh && styles.nameProhibited,
                          isCurr && styles.nameCurrent,
                        ]}>
                          {isProh ? '🚫 ' : row.isNafal ? '✨ ' : '• '}
                          {row.name}
                        </Text>
                        {row.arabicName ? (
                          <Text style={styles.arabicName}>{row.arabicName}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.rowNote} numberOfLines={1}>{row.note}</Text>
                    </View>

                    <Text style={[
                      styles.rowTime,
                      { flex: 1.2, textAlign: 'center' },
                      isProh && styles.timeProhibited,
                      isCurr && styles.timeCurrent,
                    ]}>
                      {row.startText}
                    </Text>

                    <Text style={[
                      styles.rowTime,
                      { flex: 1.2, textAlign: 'center' },
                      isProh && styles.timeProhibited,
                      isCurr && styles.timeCurrent,
                    ]}>
                      {row.endText}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Note & Prohibited Times Explanation */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>📌 বিশেষ জ্ঞাতব্য:</Text>
              <Text style={styles.infoText}>• সূর্যোদয়, ঠিক দ্বিপ্রহর (জাওয়ালে আফতাব) ও সূর্যাস্তের নির্দিষ্ট সময়গুলোতে যেকোনো প্রকার নামাজ আদায় করা নিষিদ্ধ (মাকরূহ তাহরিমি)।</Text>
              <Text style={styles.infoText}>• হানাফী মাযহাব অনুসারে কোনো বস্তুর ছায়া তার মূল ছায়া বাদে দ্বিগুণ হলে আসরের ওয়াক্ত গণনা করা হয়।</Text>
              <Text style={styles.infoText}>• প্রতিদিন সূর্যের সঠিক কোণ ও সময়ের সঙ্গে ওয়াক্ত স্বয়ংক্রিয়ভাবে পরিবর্তিত হয়।</Text>
            </View>
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.footerCloseBtn}>
              <Text style={styles.footerCloseText}>বন্ধ করুন (Close)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 620,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#064e3b',
    borderBottomWidth: 1,
    borderBottomColor: '#047857',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#a7f3d0',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  dateCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateIcon: {
    fontSize: 18,
  },
  dateLabel: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064e3b',
  },
  dateDivider: {
    height: 1,
    backgroundColor: '#dcfce7',
  },
  currentBanner: {
    backgroundColor: '#ecfdf5',
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
    padding: 12,
    borderRadius: 8,
  },
  currentTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065f46',
  },
  currentDesc: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    fontWeight: '600',
  },
  tableCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f766e',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  th: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowProhibited: {
    backgroundColor: '#fff1f2',
    borderLeftWidth: 3,
    borderLeftColor: '#e11d48',
  },
  rowCurrent: {
    backgroundColor: '#dcfce7',
    borderLeftWidth: 3,
    borderLeftColor: '#16a34a',
  },
  rowName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
  },
  nameProhibited: {
    color: '#be123c',
    fontWeight: '900',
  },
  nameCurrent: {
    color: '#15803d',
    fontWeight: '900',
  },
  arabicName: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  rowNote: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  rowTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  timeProhibited: {
    color: '#9f1239',
  },
  timeCurrent: {
    color: '#166534',
    fontWeight: '900',
  },
  infoCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 2,
  },
  infoText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  footer: {
    padding: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },
  footerCloseBtn: {
    backgroundColor: '#047857',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  footerCloseText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
