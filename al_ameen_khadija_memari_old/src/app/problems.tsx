import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AcademyHeader from '../components/AcademyHeader';
import { Field } from '../components/ui';
import { Select } from '../components/StudentDirectory';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';

const problemTypes = ['Light problem', 'Fan problem', 'Water problem', 'Electrical problem', 'Other'];
const statusLabel: Record<string, string> = { open: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' };

export default function Problems() {
  const [list, setList] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomNumber, setRoomNumber] = useState('');
  const [type, setType] = useState('');
  const [details, setDetails] = useState('');
  const [filter, setFilter] = useState('all');
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [problemData, roomData, user] = await Promise.all([
        api('/api/problems'),
        api('/api/rooms/accessible'),
        getUser<any>(),
      ]);
      setList(problemData.problems || []);
      const availableRooms = roomData.rooms || [];
      setRooms(availableRooms);
      if (!roomNumber && availableRooms.length === 1) setRoomNumber(String(availableRooms[0].room_name));
      setCanManage(user?.role === 'admin' || user?.role === 'super_admin');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!roomNumber || !type) {
      Alert.alert('Required', 'Select a room and problem type.');
      return;
    }
    setSaving(true);
    try {
      await api('/api/problems', {
        method: 'POST',
        body: JSON.stringify({ room_number: roomNumber, problem_type: type, details: details.trim() }),
      });
      setType('');
      setDetails('');
      await load();
      Alert.alert('Reported', 'Room problem sent to Admin.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await api(`/api/problems/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const filtered = useMemo(
    () => filter === 'all' ? list : list.filter((item) => item.status === filter),
    [list, filter]
  );
  const pending = list.filter((item) => item.status === 'open').length;
  const inProgress = list.filter((item) => item.status === 'in_progress').length;
  const resolved = list.filter((item) => item.status === 'resolved').length;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <AcademyHeader />
        <Text style={s.title}>Room Problems</Text>
        <Text style={s.help}>Report light, fan, water or electrical problems from the assigned room.</Text>

        <View style={s.formCard}>
          <Text style={s.sectionTitle}>New Problem Report</Text>
          <Text style={s.label}>Room Number</Text>
          <Select
            label="Room number"
            value={roomNumber}
            onChange={setRoomNumber}
            options={[{ value: '', label: 'Select room' }, ...rooms.map((room) => ({ value: String(room.room_name), label: String(room.room_name) }))]}
          />
          <View style={s.space} />
          <Text style={s.label}>Problem Type</Text>
          <Select
            label="Problem type"
            value={type}
            onChange={setType}
            options={[{ value: '', label: 'Select problem type' }, ...problemTypes.map((value) => ({ value, label: value }))]}
          />
          <View style={s.space} />
          <Field
            placeholder="Write details (optional)"
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={3}
            style={s.detailsInput}
          />
          <TouchableOpacity disabled={saving} onPress={add} style={[s.reportButton, saving && s.disabled]}>
            <Text style={s.reportText}>{saving ? 'Sending...' : 'Report Problem'}</Text>
          </TouchableOpacity>
          {!rooms.length && <Text style={s.warning}>No room is assigned to this account.</Text>}
        </View>

        <View style={s.summaryRow}>
          <View style={[s.summary, s.pendingSummary]}><Text style={s.summaryNumber}>{pending}</Text><Text>Pending</Text></View>
          <View style={[s.summary, s.progressSummary]}><Text style={s.summaryNumber}>{inProgress}</Text><Text>In Progress</Text></View>
          <View style={[s.summary, s.resolvedSummary]}><Text style={s.summaryNumber}>{resolved}</Text><Text>Resolved</Text></View>
        </View>

        <View style={s.listHeader}>
          <Text style={s.sectionTitle}>Problem Reports</Text>
          <View style={s.filterBox}>
            <Select
              label="Problem status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'open', label: 'Pending' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'resolved', label: 'Resolved' },
              ]}
            />
          </View>
        </View>

        {loading ? <ActivityIndicator size="large" color="#1565c0" /> : filtered.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No room problem found.</Text></View>
        ) : filtered.map((item) => (
          <View key={item.id} style={s.problemCard}>
            <View style={s.problemTop}>
              <View style={s.roomBadge}><Text style={s.roomText}>Room {item.room_name || '-'}</Text></View>
              <View style={[s.statusBadge, item.status === 'open' ? s.pendingBadge : item.status === 'in_progress' ? s.progressBadge : s.resolvedBadge]}>
                <Text style={s.statusText}>{statusLabel[item.status] || item.status}</Text>
              </View>
            </View>
            <Text style={s.problemType}>{item.problem_type}</Text>
            {!!item.details && <Text style={s.problemDetails}>{item.details}</Text>}
            <Text style={s.meta}>Reported by {item.reported_by_name || 'User'} · {new Date(item.reported_at).toLocaleString()}</Text>
            {canManage && item.status === 'open' && (
              <TouchableOpacity onPress={() => updateStatus(item.id, 'in_progress')} style={s.progressButton}><Text style={s.actionText}>Move to In Progress</Text></TouchableOpacity>
            )}
            {canManage && item.status === 'in_progress' && (
              <TouchableOpacity onPress={() => updateStatus(item.id, 'resolved')} style={s.resolveButton}><Text style={s.actionText}>Mark Resolved</Text></TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f6fa' },
  content: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 16, paddingBottom: 50 },
  title: { fontSize: 27, fontWeight: '900', color: '#17375e', marginTop: 6 },
  help: { color: '#607085', lineHeight: 20, marginTop: 4, marginBottom: 16 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#dce4ee' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#203b5b', marginBottom: 10 },
  label: { color: '#465b72', fontWeight: '700', marginBottom: 6 }, space: { height: 10 },
  detailsInput: { minHeight: 86, textAlignVertical: 'top' },
  reportButton: { backgroundColor: '#1565c0', padding: 14, borderRadius: 10 }, reportText: { color: '#fff', textAlign: 'center', fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.55 }, warning: { color: '#775900', backgroundColor: '#fff3cd', borderRadius: 8, padding: 10, marginTop: 10 },
  summaryRow: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  summary: { flex: 1, minWidth: 90, alignItems: 'center', padding: 12, borderRadius: 13 }, summaryNumber: { fontSize: 23, fontWeight: '900' },
  pendingSummary: { backgroundColor: '#fff1cf' }, progressSummary: { backgroundColor: '#dcecff' }, resolvedSummary: { backgroundColor: '#dff5e7' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }, filterBox: { minWidth: 150 },
  problemCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#dce4ee' },
  problemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomBadge: { backgroundColor: '#e5effb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }, roomText: { color: '#18538d', fontWeight: '900' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 }, pendingBadge: { backgroundColor: '#f4b942' }, progressBadge: { backgroundColor: '#2b79c9' }, resolvedBadge: { backgroundColor: '#24834f' }, statusText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  problemType: { fontSize: 17, fontWeight: '900', color: '#22384f', marginTop: 12 }, problemDetails: { color: '#4f6072', marginTop: 5, lineHeight: 20 },
  meta: { color: '#798796', fontSize: 12, marginTop: 10 },
  progressButton: { backgroundColor: '#246eb9', borderRadius: 9, padding: 11, marginTop: 12 }, resolveButton: { backgroundColor: '#21834f', borderRadius: 9, padding: 11, marginTop: 12 }, actionText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
  empty: { backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center' }, emptyText: { color: '#6c7b8b' },
});
