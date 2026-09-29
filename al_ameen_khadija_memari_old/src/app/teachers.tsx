import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

import AcademyHeader from '../components/AcademyHeader';
import { Select } from '../components/StudentDirectory';
import { Button, Card, Field } from '../components/ui';
import { api, API_BASE } from '../lib/api';

const emptyForm = {
  staff_id: '', name: '', mobile: '', whatsapp: '', gender: '', joining_date: '',
  subject: '', login_id: '', password: '',
};

export default function Teachers() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/api/teachers');
      setList(data.teachers || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (key: string, value: string) => setForm((current: any) => ({ ...current, [key]: value }));
  const uploadPhoto = async (teacher: any) => {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (picked.canceled) return;
    const file: any = picked.assets[0], form = new FormData();
    if (file.file) form.append('photo', file.file); else form.append('photo', { uri: file.uri, name: file.name || 'teacher.jpg', type: file.mimeType || 'image/jpeg' } as any);
    try { await api('/api/teachers/' + teacher.id + '/photo', { method: 'POST', body: form }); await load(); Alert.alert('Updated', 'Teacher photo compressed and uploaded.'); }
    catch (error: any) { Alert.alert('Photo upload', error.message); }
  };

  const saveTeacher = async () => {
    if (!form.staff_id.trim() || !form.name.trim()) {
      Alert.alert('Required', 'Staff ID and name are required.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api('/api/teachers/' + editingId, { method: 'PUT', body: JSON.stringify(form) });
        Alert.alert('Updated', 'Teacher data updated successfully.');
      } else {
        const data = await api('/api/teachers', { method: 'POST', body: JSON.stringify(form) });
        Alert.alert('Teacher Added', 'User ID: ' + data.credentials.login_id + String.fromCharCode(10) + 'Password: ' + data.credentials.initial_password);
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (teacher: any) => {
    setEditingId(Number(teacher.id));
    setForm({
      staff_id: teacher.staff_id || '', name: teacher.name || '', mobile: teacher.mobile || '',
      whatsapp: teacher.whatsapp || '', gender: teacher.gender || '', joining_date: String(teacher.joining_date || '').slice(0,10),
      subject: teacher.subject || '', login_id: teacher.login_id || '', password: '',
    });
  };

  const toggleStatus = async (teacher: any) => {
    try {
      await api('/api/teachers/' + teacher.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: teacher.user_active === false }),
      });
      await load();
    } catch (error: any) { Alert.alert('Status', error.message); }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <AcademyHeader />
        <Text style={s.title}>Teachers & Staff</Text>
        <Text style={s.help}>Default User ID is the first part of the name. Default password is the Staff ID.</Text>

        <View style={s.formCard}>
          <Text style={s.sectionTitle}>{editingId ? 'Update Teacher' : 'Add Teacher'}</Text>
          <View style={s.formGrid}>
            <Field placeholder="Staff ID *" value={form.staff_id} onChangeText={(value: string) => set('staff_id', value)} style={s.field} />
            <Field placeholder="Full name *" value={form.name} onChangeText={(value: string) => set('name', value)} style={s.field} />
            <Field placeholder="Mobile" value={form.mobile} onChangeText={(value: string) => set('mobile', value)} style={s.field} keyboardType="phone-pad" />
            <Field placeholder="WhatsApp" value={form.whatsapp} onChangeText={(value: string) => set('whatsapp', value)} style={s.field} keyboardType="phone-pad" />
            <View style={s.selectField}><Select label="Gender" value={form.gender} onChange={(value) => set('gender', value)} options={[{ value: '', label: 'Select gender' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]} /></View>
            <Field placeholder="Joining date (YYYY-MM-DD)" value={form.joining_date} onChangeText={(value: string) => set('joining_date', value)} style={s.field} />
            <Field placeholder="Subject (optional)" value={form.subject} onChangeText={(value: string) => set('subject', value)} style={s.field} />
            <Field placeholder="User ID (auto if blank)" value={form.login_id} onChangeText={(value: string) => set('login_id', value)} autoCapitalize="none" style={s.field} />
            <Field placeholder="Password (Staff ID if blank)" value={form.password} onChangeText={(value: string) => set('password', value)} secureTextEntry style={s.field} />
          </View>
          <Button title={saving ? 'Saving...' : editingId ? 'Update Teacher' : 'Add Teacher'} onPress={saveTeacher} />
          {editingId && <TouchableOpacity onPress={() => { setEditingId(null); setForm(emptyForm); }} style={s.cancelButton}><Text style={s.cancelText}>Cancel Edit</Text></TouchableOpacity>}
        </View>

        <Text style={s.sectionTitle}>Teacher List ({list.length})</Text>
        {loading ? <ActivityIndicator size="large" color="#1565c0" /> : list.map((teacher) => (
          <Card key={teacher.id}>
            <View style={s.teacherRow}>
              {teacher.photo_url?<Image source={{uri:/^https?:/.test(teacher.photo_url)?teacher.photo_url:API_BASE+teacher.photo_url}} style={s.avatar}/>:<View style={s.avatar}><Text style={s.avatarText}>{String(teacher.name || '?').charAt(0)}</Text></View>}
              <View style={s.teacherInfo}>
                <Text style={s.teacherName}>{teacher.name}</Text>
                <Text style={s.meta}>Staff ID: {teacher.staff_id} · User ID: {teacher.login_id || 'Not created'}</Text>
                <Text style={s.meta}>{teacher.gender || '-'} · {teacher.mobile || '-'} · WhatsApp {teacher.whatsapp || '-'}</Text>
              </View>
              <View style={s.teacherActions}>
                <TouchableOpacity onPress={()=>startEdit(teacher)} style={s.editButton}><Text style={s.photoButtonText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity onPress={()=>uploadPhoto(teacher)} style={s.photoButton}><Text style={s.photoButtonText}>Photo</Text></TouchableOpacity>
                <TouchableOpacity onPress={()=>toggleStatus(teacher)} style={[s.status, teacher.user_active === false && s.inactive]}><Text style={s.statusText}>{teacher.user_active === false ? 'Inactive' : 'Active'}</Text></TouchableOpacity>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f7f5' },
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 16, paddingBottom: 50 },
  title: { fontSize: 27, fontWeight: '900', color: '#193b2c', marginTop: 6 },
  help: { color: '#63736b', marginTop: 4, marginBottom: 16 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#d9e5dd' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#214333', marginBottom: 12 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, width: '31%', minWidth: 220 },
  selectField: { flexGrow: 1, width: '31%', minWidth: 220, marginBottom: 10 },
  teacherRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#dceee3', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#17613c', fontSize: 18, fontWeight: '900' },
  teacherInfo: { flex: 1 }, teacherName: { fontSize: 16, fontWeight: '900', color: '#233a2e' },
  meta: { color: '#687970', marginTop: 3, fontSize: 12 },
  status: { backgroundColor: '#21834f', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  teacherActions:{gap:5},editButton:{backgroundColor:'#d68a00',paddingHorizontal:9,paddingVertical:6,borderRadius:6},photoButton:{backgroundColor:'#1764a5',paddingHorizontal:9,paddingVertical:6,borderRadius:6},cancelButton:{borderWidth:1,borderColor:'#64748b',padding:11,borderRadius:8,marginTop:7},cancelText:{textAlign:'center',fontWeight:'800'},photoButtonText:{color:'#fff',fontSize:11,fontWeight:'800'},
  inactive: { backgroundColor: '#b23442' }, statusText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
