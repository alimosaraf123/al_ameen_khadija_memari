import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, usePathname } from 'expo-router';

export const STUDENT_MENU_ITEMS: [string, string][] = [
  ['Student Details', '/students'],
  ['Student Entry', '/student-entry'],
  ['Student Registration Form', '/student-registration-form'],
  ['Daily Student Attendance', '/daily-attendance'],
  ['Student ID Cards & Form', '/id-cards'],
  ['Document Upload', '/documents'],
  ['Promotion / TC (Lifecycle)', '/student-lifecycle'],
  ['Excel & Bulk Documents', '/student-transfer'],
  ['Kanyashree Portal (K1/K2)', '/kanyashree'],
  ['Student Behavior', '/behavior'],
  ['Student Gate Pass', '/gate-pass'],
  ['Visit Permission', '/visits'],
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
  const pathname = usePathname();
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
            {STUDENT_MENU_ITEMS.map(([label, path]) => {
              const isCurrent = pathname === path;
              return (
                <TouchableOpacity
                  key={label}
                  style={[s.modalItem, isCurrent && s.modalItemActive]}
                  onPress={() => onSelect(path)}
                  activeOpacity={0.7}
                >
                  <Text style={s.arrow}>›</Text>
                  <Text style={[s.modalItemText, isCurrent && s.modalItemTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function StudentMenuActions({
  onStudentEntry,
  onSelect,
  showEntryButton = true,
  compact = false,
}: {
  onStudentEntry?: () => void;
  onSelect?: (path: string) => void;
  showEntryButton?: boolean;
  compact?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const handleSelect = (path: string) => {
    setMenuOpen(false);
    if (onSelect) {
      onSelect(path);
      return;
    }
    if (pathname === path) return;
    router.push(path as any);
  };

  const handleEntryPress = () => {
    if (onStudentEntry) {
      onStudentEntry();
      return;
    }
    if (pathname === '/student-entry') return;
    router.push('/student-entry' as any);
  };

  return (
    <>
      <View style={[s.actionRow, compact && s.actionRowCompact]}>
        {showEntryButton && (
          <TouchableOpacity
            onPress={handleEntryPress}
            style={[s.entryBtn, compact && s.compactBtn]}
            activeOpacity={0.8}
          >
            <Text style={[s.entryBtnText, compact && s.compactBtnText]}>+ Student Entry</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={[s.menuBtn, compact && s.compactBtn]}
          activeOpacity={0.8}
        >
          <Text style={[s.menuBtnText, compact && s.compactBtnText]}>Student Menu</Text>
        </TouchableOpacity>
      </View>
      <StudentMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={handleSelect}
      />
    </>
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
  modalItemActive: {
    borderColor: '#1565c0',
    backgroundColor: '#e0f2fe',
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
  modalItemTextActive: {
    color: '#0369a1',
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionRowCompact: {
    gap: 6,
    flexWrap: 'nowrap',
  },
  entryBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13.5,
  },
  menuBtn: {
    backgroundColor: '#1565c0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  compactBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 6,
  },
  compactBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
});
