import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export const STUDENT_MENU_ITEMS: [string, string][] = [
  ['Student Details', '/students'],
  ['Student Entry', '/student-entry'],
  ['Daily Student Attendance', '/daily-attendance'],
  ['Student ID Cards & Form', '/id-cards'],
  ['Document Upload', '/documents'],
  ['Promotion / TC (Lifecycle)', '/student-lifecycle'],
  ['Student Transfer & Bulk Data', '/student-transfer'],
  ['Student Behavior', '/behavior'],
  ['Student Gate Pass', '/gate-pass'],
  ['Visit Permission', '/visits'],
  ['Academic Marksheet', '/marks'],
  ['Guardians & Passwords', '/guardians'],
];

export default function StudentMenu({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close student menu"
        />
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Student Management</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close student menu"
            >
              <Text style={s.closeText}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalGrid} bounces={false}>
            {STUDENT_MENU_ITEMS.map(([label, path]) => (
              <TouchableOpacity
                key={label}
                style={s.modalItem}
                onPress={() => onSelect(path)}
                activeOpacity={0.7}
              >
                <Text style={s.arrow}>›</Text>
                <Text style={s.modalItemText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 9999,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  closeText: {
    color: '#9ca3af',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 22,
  },
  modalGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalItem: {
    width: '48%',
    minWidth: 230,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arrow: {
    fontSize: 18,
    color: '#0284c7',
    fontWeight: '800',
  },
  modalItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
});
