import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AcademyHeader from '../components/AcademyHeader';
import { Select } from '../components/StudentDirectory';
import { API_BASE, api } from '../lib/api';

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function StudentPhoto({ student }: { student: any }) {
  const [failed, setFailed] = useState(false);
  const path = student.photo_url;
  if (!path || failed) {
    return <View style={[s.photo, s.avatar]}><Text style={s.avatarText}>{String(student.student_name || '?').charAt(0)}</Text></View>;
  }
  return (
    <Image
      source={{ uri: /^https?:\/\//.test(path) ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}` }}
      style={s.photo}
      onError={() => setFailed(true)}
    />
  );
}

export default function Attendance() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomNumber, setRoomNumber] = useState('');
  const [date, setDate] = useState(localDate());
  const [students, setStudents] = useState<any[]>([]);
  const [submission, setSubmission] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadHistory = async (selectedRoom = roomNumber) => {
    try {
      const query = selectedRoom ? `?room_number=${encodeURIComponent(selectedRoom)}` : '';
      const data = await api(`/api/attendance/history${query}`);
      setHistory(data.history || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const loadRooms = async () => {
    try {
      const data = await api('/api/rooms/accessible');
      const roomList = data.rooms || [];
      setRooms(roomList);
      if (roomList.length === 1) {
        const onlyRoom = String(roomList[0].room_name);
        setRoomNumber(onlyRoom);
        await loadHistory(onlyRoom);
      } else {
        await loadHistory('');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const loadAttendance = async () => {
    if (!roomNumber) {
      Alert.alert('Required', 'Select a room number first.');
      return;
    }
    setLoading(true);
    try {
      const data = await api(`/api/attendance/room/${encodeURIComponent(roomNumber)}?date=${encodeURIComponent(date)}`);
      setStudents(data.students || []);
      setSubmission(data.submission || null);
      setLoaded(true);
      setSearch('');
      await loadHistory(roomNumber);
    } catch (error: any) {
      setLoaded(false);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const selectRoom = (value: string) => {
    setRoomNumber(value);
    setStudents([]);
    setSubmission(null);
    setLoaded(false);
    loadHistory(value);
  };

  const toggle = (studentId: number) => {
    setStudents((current) => current.map((student) => student.id === studentId
      ? { ...student, status: student.status === 'present' ? 'absent' : 'present' }
      : student));
  };

  const markAllPresent = () => {
    setStudents((current) => current.map((student) => ({ ...student, status: 'present' })));
  };

  const save = async () => {
    if (!loaded) return;
    setSaving(true);
    try {
      const result = await api('/api/attendance/batch', {
        method: 'POST',
        body: JSON.stringify({
          room_number: roomNumber,
          attendance_date: date,
          entries: students.map((student) => ({
            student_id: student.id,
            status: student.status,
            remarks: student.remarks || null,
          })),
        }),
      });
      await loadAttendance();
      Alert.alert(result.action === 'updated' ? 'Updated' : 'Submitted', 'Evening room attendance saved successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const present = students.filter((student) => student.status === 'present').length;
  const absent = students.length - present;
  const visibleStudents = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return students;
    return students.filter((student) => [student.student_name, student.registration_no, student.class_name]
      .some((field) => String(field || '').toLowerCase().includes(value)));
  }, [students, search]);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <AcademyHeader />
        <Text style={s.title}>Evening Room Attendance</Text>
        <Text style={s.help}>Everyone starts as Present. Tap only the girls who are absent, then submit.</Text>

        <View style={s.controlCard}>
          <View style={s.controlRow}>
            <View style={s.controlField}>
              <Text style={s.label}>Room Number</Text>
              <Select
                label="Room number"
                value={roomNumber}
                onChange={selectRoom}
                options={[{ value: '', label: 'Select room' }, ...rooms.map((room) => ({ value: String(room.room_name), label: String(room.room_name) }))]}
              />
            </View>
            <View style={s.controlField}>
              <Text style={s.label}>Attendance Date</Text>
              <TextInput value={date} onChangeText={(value) => { setDate(value); setLoaded(false); }} placeholder="YYYY-MM-DD" style={s.input} />
            </View>
          </View>
          <TouchableOpacity onPress={loadAttendance} disabled={loading} style={[s.loadButton, loading && s.disabled]}>
            <Text style={s.buttonText}>{loading ? 'Loading...' : 'Load Room Students'}</Text>
          </TouchableOpacity>
          {!rooms.length && <Text style={s.warning}>No room is assigned to this account. Ask an Admin to assign a room first.</Text>}
        </View>

        {loaded && <>
          <View style={s.summaryRow}>
            <View style={[s.summaryCard, s.totalCard]}><Text style={s.summaryNumber}>{students.length}</Text><Text style={s.summaryLabel}>Total</Text></View>
            <View style={[s.summaryCard, s.presentCard]}><Text style={s.summaryNumber}>{present}</Text><Text style={s.summaryLabel}>Present</Text></View>
            <View style={[s.summaryCard, s.absentCard]}><Text style={s.summaryNumber}>{absent}</Text><Text style={s.summaryLabel}>Absent</Text></View>
          </View>

          {submission && (
            <View style={s.savedBox}>
              <Text style={s.savedTitle}>Attendance already submitted</Text>
              <Text style={s.savedText}>Submitted by {submission.submitted_by_name || 'User'} · Last updated by {submission.last_updated_by_name || submission.submitted_by_name || 'User'}</Text>
            </View>
          )}

          <View style={s.studentToolbar}>
            <TextInput value={search} onChangeText={setSearch} placeholder="Search name or registration no." style={s.search} />
            <TouchableOpacity onPress={markAllPresent} style={s.allPresentButton}><Text style={s.allPresentText}>Present All</Text></TouchableOpacity>
          </View>

          {visibleStudents.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyText}>{students.length ? 'No student matches the search.' : 'No active student is assigned to this room.'}</Text></View>
          ) : visibleStudents.map((student) => (
            <TouchableOpacity key={student.id} onPress={() => toggle(student.id)} style={[s.studentCard, student.status === 'absent' && s.absentStudent]}>
              <StudentPhoto student={student} />
              <View style={s.studentInfo}>
                <Text style={s.studentName}>{student.student_name}</Text>
                <Text style={s.studentMeta}>Reg. {student.registration_no} · Class {student.class_name || '-'}</Text>
              </View>
              <View style={[s.statusBadge, student.status === 'absent' ? s.absentBadge : s.presentBadge]}>
                <Text style={s.statusText}>{student.status === 'absent' ? 'ABSENT' : 'PRESENT'}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity disabled={saving} onPress={save} style={[s.submitButton, saving && s.disabled]}>
            <Text style={s.submitText}>{saving ? 'Saving...' : submission ? 'Update Attendance' : 'Submit Attendance'}</Text>
          </TouchableOpacity>
        </>}

        <View style={s.historyHeader}>
          <Text style={s.sectionTitle}>Recent Attendance</Text>
          <TouchableOpacity onPress={() => loadHistory(roomNumber)}><Text style={s.refresh}>Refresh</Text></TouchableOpacity>
        </View>
        {history.length === 0 ? <Text style={s.noHistory}>No submitted attendance found.</Text> : history.map((item) => (
          <View key={item.id} style={s.historyCard}>
            <View><Text style={s.historyTitle}>Room {item.room_name} · {String(item.attendance_date).slice(0, 10)}</Text><Text style={s.historyMeta}>{item.last_updated_by_name || item.submitted_by_name || 'User'}</Text></View>
            <View style={s.historyCounts}><Text style={s.greenText}>{item.present} P</Text><Text style={s.redText}>{item.absent} A</Text></View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f6f3' },
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 16, paddingBottom: 50 },
  title: { fontSize: 27, fontWeight: '900', color: '#163c2b', marginTop: 6 },
  help: { color: '#566b60', marginTop: 4, marginBottom: 16, lineHeight: 20 },
  controlCard: { backgroundColor: '#fff', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#d7e6dc' },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  controlField: { flex: 1, minWidth: 220 },
  label: { color: '#40564b', fontWeight: '700', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5cf', borderRadius: 7, padding: 11, minHeight: 42 },
  loadButton: { backgroundColor: '#1565c0', borderRadius: 9, padding: 13, marginTop: 14 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
  disabled: { opacity: 0.55 },
  warning: { backgroundColor: '#fff3cd', color: '#775900', borderRadius: 8, padding: 10, marginTop: 12 },
  summaryRow: { flexDirection: 'row', gap: 10, marginVertical: 14 },
  summaryCard: { flex: 1, minWidth: 90, borderRadius: 14, padding: 13, alignItems: 'center' },
  totalCard: { backgroundColor: '#e3efff' }, presentCard: { backgroundColor: '#d9f6e5' }, absentCard: { backgroundColor: '#ffe1e4' },
  summaryNumber: { fontSize: 25, fontWeight: '900', color: '#18352a' }, summaryLabel: { color: '#425b50', fontWeight: '700' },
  savedBox: { backgroundColor: '#e7f2ff', borderLeftWidth: 4, borderLeftColor: '#1565c0', padding: 12, borderRadius: 8, marginBottom: 12 },
  savedTitle: { color: '#114b8b', fontWeight: '800' }, savedText: { color: '#48627e', fontSize: 12, marginTop: 3 },
  studentToolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  search: { flex: 1, minWidth: 220, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5cf', borderRadius: 9, padding: 11 },
  allPresentButton: { backgroundColor: '#e2f5e8', borderWidth: 1, borderColor: '#57a773', borderRadius: 9, paddingHorizontal: 18, justifyContent: 'center' },
  allPresentText: { color: '#146b37', fontWeight: '800' },
  studentCard: { backgroundColor: '#fff', borderRadius: 13, padding: 12, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#dce6e0' },
  absentStudent: { backgroundColor: '#fff1f2', borderColor: '#f0a4ac' },
  photo: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: '#a9b8b0' },
  avatar: { backgroundColor: '#dceee3', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#185f3b', fontWeight: '900', fontSize: 18 },
  studentInfo: { flex: 1 }, studentName: { fontSize: 16, fontWeight: '800', color: '#182b22' }, studentMeta: { color: '#65746d', marginTop: 3, fontSize: 12 },
  statusBadge: { minWidth: 82, paddingHorizontal: 9, paddingVertical: 9, borderRadius: 20, alignItems: 'center' },
  presentBadge: { backgroundColor: '#168447' }, absentBadge: { backgroundColor: '#c93442' }, statusText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  submitButton: { backgroundColor: '#0b6b3a', borderRadius: 11, padding: 15, marginTop: 10 }, submitText: { color: '#fff', textAlign: 'center', fontSize: 17, fontWeight: '900' },
  empty: { backgroundColor: '#fff', padding: 24, borderRadius: 12, alignItems: 'center' }, emptyText: { color: '#64756c' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 10 },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: '#173a2a' }, refresh: { color: '#1565c0', fontWeight: '800' },
  noHistory: { backgroundColor: '#fff', padding: 18, borderRadius: 10, color: '#697870' },
  historyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontWeight: '800', color: '#233b30' }, historyMeta: { color: '#718078', fontSize: 12, marginTop: 3 },
  historyCounts: { flexDirection: 'row', gap: 10 }, greenText: { color: '#167844', fontWeight: '900' }, redText: { color: '#c12c3a', fontWeight: '900' },
});
