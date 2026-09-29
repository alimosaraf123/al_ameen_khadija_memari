import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AcademyHeader from '../components/AcademyHeader';
import { Select } from '../components/StudentDirectory';
import { api } from '../lib/api';

export default function RoomAssignments() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [teacherId, setTeacherId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [teacherData, roomData, assignmentData] = await Promise.all([
        api('/api/teachers'),
        api('/api/rooms'),
        api('/api/rooms/assignments'),
      ]);
      setTeachers(teacherData.teachers || []);
      setRooms((roomData.rooms || []).filter((room: any) => room.is_active !== false));
      setAssignments(assignmentData.assignments || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loginTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.user_id && teacher.user_active !== false),
    [teachers]
  );

  const save = async () => {
    if (!teacherId || !roomId) {
      Alert.alert('Required', 'Select a room teacher and a room.');
      return;
    }
    setSaving(true);
    try {
      await api(editingId ? '/api/rooms/assignments/' + editingId : '/api/rooms/assignments', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ teacher_id: Number(teacherId), room_id: Number(roomId) }),
      });
      setTeacherId('');
      setRoomId('');
      setEditingId(null);
      await load();
      Alert.alert(editingId ? 'Updated' : 'Assigned', 'Room teacher assignment saved.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (assignment: any) => {
    try {
      await api(`/api/rooms/assignments/${assignment.id}`, { method: 'DELETE' });
      await load();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <AcademyHeader />
        <Text style={s.title}>Teacher Room Assignment</Text>
        <Text style={s.help}>Assign one evening room to each room teacher. Reassigning a teacher or room automatically closes the old assignment.</Text>

        <View style={s.formCard}>
          <Text style={s.sectionTitle}>{editingId ? 'Edit Assignment' : 'New Assignment'}</Text>
          <Select
            label="Room teacher"
            value={teacherId}
            onChange={setTeacherId}
            options={[
              { value: '', label: 'Select room teacher' },
              ...loginTeachers.map((teacher) => ({
                value: String(teacher.id),
                label: `${teacher.name}${teacher.staff_id ? ` (${teacher.staff_id})` : ''}`,
              })),
            ]}
          />
          <View style={s.fieldSpace} />
          <Select
            label="Room number"
            value={roomId}
            onChange={setRoomId}
            options={[
              { value: '', label: 'Select room number' },
              ...rooms.map((room) => ({ value: String(room.id), label: String(room.room_name) })),
            ]}
          />
          <TouchableOpacity disabled={saving} onPress={save} style={[s.primaryButton, saving && s.disabled]}>
            <Text style={s.primaryText}>{saving ? 'Saving...' : editingId ? 'Update Assignment' : 'Assign Room Teacher'}</Text>
          </TouchableOpacity>
          {editingId && <TouchableOpacity onPress={() => { setEditingId(null); setTeacherId(''); setRoomId(''); }} style={s.cancelButton}><Text style={s.cancelText}>Cancel Edit</Text></TouchableOpacity>}
          {teachers.length > loginTeachers.length && (
            <Text style={s.note}>Teachers without an active login are hidden. Add their login ID and password before assigning a room.</Text>
          )}
        </View>

        <Text style={s.sectionTitle}>Active Assignments ({assignments.length})</Text>
        {loading ? <ActivityIndicator size="large" color="#157347" /> : assignments.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No active room teacher assignment.</Text></View>
        ) : assignments.map((assignment) => (
          <View key={assignment.id} style={s.assignmentCard}>
            <View style={s.roomBadge}><Text style={s.roomBadgeText}>Room {assignment.room_name}</Text></View>
            <View style={s.assignmentInfo}>
              <Text style={s.teacherName}>{assignment.teacher_name}</Text>
              <Text style={s.meta}>{assignment.staff_id || 'Room Teacher'} · Assigned {String(assignment.assigned_date).slice(0, 10)}</Text>
            </View>
            <View style={s.assignmentActions}>
              <TouchableOpacity onPress={() => { setEditingId(Number(assignment.id)); setTeacherId(String(assignment.teacher_id)); setRoomId(String(assignment.room_id)); }} style={s.editButton}>
                <Text style={s.editText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(assignment)} style={s.removeButton}>
                <Text style={s.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef5f0' },
  content: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '900', color: '#153b2b', marginTop: 6 },
  help: { color: '#52645c', lineHeight: 20, marginTop: 5, marginBottom: 16 },
  formCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#d7e5db', elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#183c2c', marginBottom: 12 },
  fieldSpace: { height: 10 },
  primaryButton: { backgroundColor: '#157347', padding: 14, borderRadius: 10, marginTop: 14 },
  primaryText: { color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  note: { color: '#8a5a00', backgroundColor: '#fff5d6', borderRadius: 8, padding: 10, marginTop: 12, fontSize: 12 },
  assignmentCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#dce8df' },
  roomBadge: { backgroundColor: '#d9f4e4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  roomBadgeText: { color: '#11643d', fontWeight: '900' },
  assignmentInfo: { flex: 1, minWidth: 120 },
  teacherName: { fontSize: 16, fontWeight: '800', color: '#172b21' },
  meta: { color: '#66766e', marginTop: 3, fontSize: 12 },
  assignmentActions:{flexDirection:'row',gap:6},editButton:{backgroundColor:'#1565c0',borderRadius:8,paddingHorizontal:12,paddingVertical:9},editText:{color:'#fff',fontWeight:'800'},cancelButton:{borderWidth:1,borderColor:'#64748b',borderRadius:8,padding:10,marginTop:8},cancelText:{textAlign:'center',fontWeight:'800'},
  removeButton: { borderWidth: 1, borderColor: '#dc3545', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  removeText: { color: '#b42331', fontWeight: '700' },
  empty: { padding: 28, backgroundColor: '#fff', borderRadius: 14, alignItems: 'center' },
  emptyText: { color: '#65756d' },
});
