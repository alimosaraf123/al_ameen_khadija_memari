import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const options = [
  ['entry', 'Entry'], ['details', 'Details'], ['forms', 'Form & I-Card'], ['behavior', 'Behavior'],
  ['attendance', 'Attendance'], ['visit', 'Visit Permission'], ['gatepass', 'Gate Pass'], ['marks', 'Marksheet'], ['documents', 'Documents'], ['dues', 'Dues'],
  ['promotion', 'Promotion'], ['verification', 'Verification'], ['passwords', 'Passwords'],
  ['data', 'Excel & Bulk Photos'], ['tc', 'T.C'], ['reactivation', 'Re-Activation Request'], ['transfer', 'Transfer'],
];
const enabled = new Set([
  'entry', 'details', 'forms', 'behavior', 'attendance', 'visit', 'gatepass', 'marks', 'documents', 'dues', 'promotion', 'passwords', 'data', 'tc', 'reactivation',
]);

export default function StudentMenu({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (key: string) => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.overlay}><View style={s.panel}>
      <View style={s.header}><Text style={s.title}>Student</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close student menu" onPress={onClose}><Text style={s.close}>X</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={s.grid}>{options.map(([key, title]) => <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ disabled: !enabled.has(key) }} disabled={!enabled.has(key)} style={[s.item, !enabled.has(key) && s.disabled]} onPress={() => onSelect(key)}>
        <Text style={s.label}>-  {title}</Text>{!enabled.has(key) && <Text style={s.hint}>Coming soon</Text>}
      </TouchableOpacity>)}</ScrollView>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  panel: { backgroundColor: '#fff', width: '100%', maxWidth: 510, maxHeight: '85%', borderRadius: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#11101e', paddingHorizontal: 18, paddingVertical: 14 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' }, close: { color: '#fff', fontSize: 26, paddingHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  item: { flexGrow: 1, flexBasis: '46%', minHeight: 48, justifyContent: 'center', padding: 12, backgroundColor: '#f8fafc', borderColor: '#d8dee7', borderWidth: 1, borderRadius: 6 },
  label: { color: '#15334f', fontSize: 13 }, disabled: { opacity: 0.55 }, hint: { fontSize: 10, color: '#64748b', marginTop: 4 },
});
