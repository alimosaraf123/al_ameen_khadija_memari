import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { api, API_BASE } from '../lib/api';
import { getToken, getUser } from '../lib/auth';

const modules = [
  ['students', 'Students > Student List'],
  ['documents', 'Students > Documents & Family Photos'],
  ['dues', 'Students > Student Dues'],
  ['student_transfer', 'Students > Student Transfer'],
  ['student_lifecycle', 'Students > Promotion / TC / Re-Activation'],
  ['illness', 'Students > Illness / Problem'],
  ['teachers', 'Teachers > Teacher List'],
  ['teachers_support', 'Teachers > Teacher Lookup'],
  ['room_assignments', 'Teachers > Room Assignment'],
  ['guardians', 'Guardians > Guardian Records'],
  ['rooms', 'Rooms > Room List'],
  ['rooms_support', 'Rooms > Room Lookup'],
  ['attendance', 'Rooms > Evening Attendance'],
  ['behavior', 'Rooms > Student Behaviour'],
  ['problems', 'Rooms > Room Problems'],
  ['gate_passes', 'Gate Pass > Generate & Records'],
  ['visits', 'Visiting Day > Permission & Records'],
  ['marks', 'Exams > Weekly Test'],
  ['omr_evaluation', 'Exams > OMR Exam & Evaluation'],
  ['terminal_exams', 'Exams > Terminal Exam'],
  ['published_results', 'Exams > Published Results'],
  ['routines', 'Routine'],
  ['notices', 'Notice'],
  ['deposit_fund', 'Student Deposit Fund'],
  ['service_staff', 'Service Panels > Staff Accounts (ID / Password Reset)'],
  ['gateman_panel', 'Service Panels > Gateman'],
  ['office_panel', 'Service Panels > Office'],
  ['library_panel', 'Service Panels > Library'],
  ['dining_stock', 'Office > Dining Stock'],
  ['fees', 'Fees & Accounts > Fee Collection, Due Fees & Bank Matcher'],
  ['asset_register', 'Asset Register'],
  ['audit_log', 'Activity Audit Log'],
];

export default function SystemAdmin() {
  // Super Admin state
  const [superAdmins, setSuperAdmins] = useState<any[]>([]);
  const [saName, setSaName] = useState('');
  const [saLogin, setSaLogin] = useState('');
  const [saPassword, setSaPassword] = useState('');
  const [saConfirmPassword, setSaConfirmPassword] = useState('');

  // Office Admin state
  const [admins, setAdmins] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  // Settings & System state
  const [settings, setSettings] = useState<any[]>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const load = async () => {
    const u = await getUser<any>();
    if (u?.role !== 'super_admin') {
      router.replace('/superadmin');
      return;
    }
    try {
      const [a, sa, s] = await Promise.all([
        api('/api/system-admin/admins'),
        api('/api/system-admin/super-admins'),
        api('/api/system-admin/settings'),
      ]);
      setAdmins(a.admins || []);
      setSuperAdmins(sa.super_admins || []);
      setSettings(s.settings || []);
    } catch (e: any) {
      Alert.alert('System Admin', e.message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Super Admin Operations
  const createSuperAdmin = async () => {
    if (!saName.trim() || !saLogin.trim()) {
      return Alert.alert('Required Fields', 'Full name and User ID are required.');
    }
    if (saPassword !== saConfirmPassword) {
      return Alert.alert('Password mismatch', 'Password and Re-enter Password must match.');
    }
    if (String(saPassword).length < 6) {
      return Alert.alert('Password too short', 'Password must be at least 6 characters.');
    }
    try {
      await api('/api/system-admin/super-admins', {
        method: 'POST',
        body: JSON.stringify({
          full_name: saName.trim(),
          login_id: saLogin.trim(),
          password: saPassword,
          confirm_password: saConfirmPassword,
        }),
      });
      setSaName('');
      setSaLogin('');
      setSaPassword('');
      setSaConfirmPassword('');
      await load();
      Alert.alert('Super Admin', 'Super Admin account saved successfully.');
    } catch (e: any) {
      Alert.alert('Super Admin Error', e.message);
    }
  };

  const resetSuperAdmin = async (x: any) => {
    const temporaryPassword = 'Super@' + Math.floor(100000 + Math.random() * 900000);
    try {
      await api('/api/system-admin/super-admins/' + x.id, {
        method: 'PATCH',
        body: JSON.stringify({
          password: temporaryPassword,
          confirm_password: temporaryPassword,
        }),
      });
      await load();
      const msg = `Super Admin: ${x.login_id}\nNew temporary password: ${temporaryPassword}`;
      if (typeof window !== 'undefined') window.alert(msg);
      else Alert.alert('Password Reset', msg);
    } catch (e: any) {
      Alert.alert('Super Admin', e.message);
    }
  };

  const updateSuperAdmin = async (x: any, body: any) => {
    try {
      await api('/api/system-admin/super-admins/' + x.id, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
    } catch (e: any) {
      Alert.alert('Super Admin', e.message);
    }
  };

  // Office Admin Operations
  const createAdmin = async () => {
    if (!name.trim() || !login.trim()) {
      return Alert.alert('Required Fields', 'Full name and User ID are required.');
    }
    if (password !== confirmPassword) {
      return Alert.alert('Password mismatch', 'Password and Re-enter Password must match.');
    }
    try {
      await api('/api/system-admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          full_name: name,
          login_id: login,
          password,
          confirm_password: confirmPassword,
        }),
      });
      setName('');
      setLogin('');
      setPassword('');
      setConfirmPassword('');
      await load();
      Alert.alert('Office Admin', 'Office Admin created successfully.');
    } catch (e: any) {
      Alert.alert('Admin Error', e.message);
    }
  };

  const choose = (x: any) => {
    setSelected(x);
    setPermissions(x.permissions || []);
  };

  const savePermissions = async () => {
    try {
      await api('/api/system-admin/admins/' + selected.id + '/permissions', {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      });
      await load();
      Alert.alert('Permissions', 'Permissions saved successfully.');
    } catch (e: any) {
      Alert.alert('Permissions', e.message);
    }
  };

  const updateAdmin = async (x: any, body: any) => {
    try {
      await api('/api/system-admin/admins/' + x.id, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
    } catch (e: any) {
      Alert.alert('Admin', e.message);
    }
  };

  const resetAdmin = async (x: any) => {
    const temporaryPassword = 'Temp@' + Math.floor(100000 + Math.random() * 900000);
    try {
      await api('/api/system-admin/admins/' + x.id, {
        method: 'PATCH',
        body: JSON.stringify({
          password: temporaryPassword,
          confirm_password: temporaryPassword,
        }),
      });
      await load();
      const msg = `User ID: ${x.login_id}\nNew temporary password: ${temporaryPassword}`;
      if (typeof window !== 'undefined') window.alert(msg);
      else Alert.alert('Password Reset', msg);
    } catch (e: any) {
      Alert.alert('Admin', e.message);
    }
  };

  const saveSetting = async () => {
    try {
      await api('/api/system-admin/settings/' + encodeURIComponent(key), {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      setKey('');
      setValue('');
      await load();
    } catch (e: any) {
      Alert.alert('Settings', e.message);
    }
  };

  const backup = async () => {
    try {
      const token = await getToken();
      const r = await fetch(API_BASE + '/api/system-admin/backup', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!r.ok) throw new Error((await r.json()).message);
      const blob = await r.blob();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'al-ameen-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert('Backup', 'Download backup from the web Admin panel.');
      }
    } catch (e: any) {
      Alert.alert('Backup', e.message);
    }
  };

  const toggle = (k: string) =>
    setPermissions((x) => (x.includes(k) ? x.filter((v) => v !== k) : [...x, k]));

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />
        <View style={s.top}>
          <TouchableOpacity
            style={s.light}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/superadmin'))}
          >
            <Text style={{ fontWeight: '700' }}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={s.title}>System Administration</Text>
        </View>

        {/* ============================================================== */}
        {/* SECTION 1: SUPER ADMIN ACCOUNTS (SEPARATED FROM OFFICE ADMINS) */}
        {/* ============================================================== */}
        <View style={[s.card, { borderColor: '#b91c1c', borderWidth: 2 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <View>
              <Text style={[s.heading, { color: '#991b1b' }]}>👑 Super Admin Accounts (২টি Super Admin অ্যাকাউন্ট)</Text>
              <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                Super Admin accounts have master unrestricted access to all modules and system administration.
              </Text>
            </View>
            <View style={{ backgroundColor: '#fee2e2', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#991b1b' }}>Total Super Admins: {superAdmins.length}</Text>
            </View>
          </View>

          {/* Form to Create/Add Super Admin */}
          <View style={{ marginTop: 8, padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#7f1d1d', marginBottom: 6 }}>Create / Set Up Super Admin</Text>
            <View style={s.grid}>
              <Field p="Full name (e.g. Master Superadmin)" v={saName} set={setSaName} />
              <Field p="User ID (e.g. superadmin)" v={saLogin} set={setSaLogin} />
              <Field p="Initial / reset password" v={saPassword} set={setSaPassword} secure />
              <Field p="Re-enter password" v={saConfirmPassword} set={setSaConfirmPassword} secure />
              <TouchableOpacity style={[s.primary, { backgroundColor: '#b91c1c' }]} onPress={createSuperAdmin}>
                <Text style={s.white}>Save Super Admin</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* List of Super Admins */}
          <View style={{ gap: 8, marginTop: 4 }}>
            {superAdmins.map((x) => (
              <View key={x.id} style={[s.admin, { borderColor: '#fca5a5', borderWidth: 1, backgroundColor: '#fff' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bold, { color: '#991b1b', fontSize: 16 }]}>
                    👑 {x.full_name} - <Text style={{ color: '#0f172a' }}>{x.login_id}</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    Role: <Text style={{ fontWeight: '700', color: '#991b1b' }}>Super Admin (Master Access)</Text> | Status:{' '}
                    <Text style={{ fontWeight: '700', color: x.is_active ? '#166534' : '#991b1b' }}>
                      {x.is_active ? 'Active' : 'Disabled'}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity style={s.reset} onPress={() => resetSuperAdmin(x)}>
                  <Text style={s.white}>Reset Password</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={x.is_active ? s.danger : s.ok}
                  onPress={() => updateSuperAdmin(x, { is_active: !x.is_active })}
                >
                  <Text style={s.white}>{x.is_active ? 'Disable' : 'Enable'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* ============================================================== */}
        {/* SECTION 2: OFFICE ADMIN ACCOUNTS (THE 7 IDS IN IMAGE 1)         */}
        {/* ============================================================== */}
        <View style={s.card}>
          <View>
            <Text style={s.heading}>🏢 Office Admin Accounts (Office Admin আইডিগুলি)</Text>
            <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              Manage office personnel accounts (Masema, Nasmin, Noorsaba, Office Admin, Hasibul, etc.) and their module permissions.
            </Text>
          </View>

          {/* Create Office Admin Form */}
          <View style={s.grid}>
            <Field p="Full name" v={name} set={setName} />
            <Field p="User ID" v={login} set={setLogin} />
            <Field p="Initial / reset password" v={password} set={setPassword} secure />
            <Field p="Re-enter password" v={confirmPassword} set={setConfirmPassword} secure />
            <TouchableOpacity style={s.primary} onPress={createAdmin}>
              <Text style={s.white}>Create Office Admin</Text>
            </TouchableOpacity>
          </View>

          {/* List of Office Admins */}
          <View style={{ gap: 8, marginTop: 6 }}>
            {admins.map((x) => (
              <View key={x.id} style={s.admin}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => choose(x)}>
                  <Text style={s.bold}>
                    {x.full_name} - <Text style={{ color: '#0369a1' }}>{x.login_id}</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {x.is_active ? 'Active' : 'Inactive'} - {(x.permissions || []).length} permissions
                    {selected?.id === x.id ? ' (Click to edit permissions below)' : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.reset} onPress={() => resetAdmin(x)}>
                  <Text style={s.white}>Reset Password</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={x.is_active ? s.danger : s.ok}
                  onPress={() => updateAdmin(x, { is_active: !x.is_active })}
                >
                  <Text style={s.white}>{x.is_active ? 'Disable' : 'Enable'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Selected Office Admin Permissions */}
        {selected && (
          <View style={s.card}>
            <Text style={s.heading}>Permissions: {selected.full_name} ({selected.login_id})</Text>
            <View style={s.permissionGrid}>
              {modules.map(([k, l]) => (
                <TouchableOpacity
                  key={k}
                  style={[s.permission, permissions.includes(k) && s.permissionOn]}
                  onPress={() => toggle(k)}
                >
                  <Text style={permissions.includes(k) ? s.white : undefined}>
                    {permissions.includes(k) ? '[x] ' : ''}
                    {l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.primary} onPress={savePermissions}>
              <Text style={s.white}>Save Permissions</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Other System Utilities */}
        <View style={s.card}>
          <Text style={s.heading}>Gateman / Office &gt; Library Accounts</Text>
          <Text style={s.help}>Create accounts, change User ID and reset passwords. Existing passwords are never shown.</Text>
          <TouchableOpacity style={s.primary} onPress={() => router.push('/service-staff')}>
            <Text style={s.white}>Open Staff Accounts</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.heading}>System Settings</Text>
          <View style={s.grid}>
            <Field p="Setting key" v={key} set={setKey} />
            <Field p="Setting value" v={value} set={setValue} />
            <TouchableOpacity style={s.primary} onPress={saveSetting}>
              <Text style={s.white}>Save Setting</Text>
            </TouchableOpacity>
          </View>
          {settings.map((x) => (
            <Text key={x.setting_key} style={s.setting}>
              {x.setting_key}: {x.setting_value}
            </Text>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Database Backup / Restore</Text>
          <TouchableOpacity style={s.ok} onPress={backup}>
            <Text style={s.white}>Download Database Backup</Text>
          </TouchableOpacity>
          <Text style={s.help}>Restore validates backup first and requires server maintenance mode; it never overwrites live data from this screen.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Field = ({ p, v, set, secure }: any) => (
  <TextInput
    secureTextEntry={secure}
    value={v}
    onChangeText={set}
    placeholder={p}
    style={s.input}
  />
);

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef3f7' },
  body: { padding: 16, maxWidth: 1050, width: '100%', alignSelf: 'center', gap: 14 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { fontSize: 25, fontWeight: '900' },
  light: { backgroundColor: '#e2ebf3', padding: 11, borderRadius: 7 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 10, gap: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  heading: { fontSize: 18, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { minWidth: 190, flex: 1, borderWidth: 1, borderColor: '#b9c5d0', borderRadius: 7, padding: 10, backgroundColor: '#fff' },
  primary: { backgroundColor: '#1769aa', padding: 12, borderRadius: 7 },
  white: { color: '#fff', fontWeight: '800' },
  admin: { backgroundColor: '#f8fafc', padding: 13, borderRadius: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  bold: { fontWeight: '900' },
  reset: { backgroundColor: '#7048a8', padding: 9, borderRadius: 6 },
  danger: { backgroundColor: '#b52d3a', padding: 9, borderRadius: 6 },
  ok: { backgroundColor: '#198754', padding: 11, borderRadius: 7 },
  permissionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permission: { borderWidth: 1, borderColor: '#b7c3cf', padding: 10, borderRadius: 7, backgroundColor: '#fff' },
  permissionOn: { backgroundColor: '#1769aa' },
  setting: { padding: 8, borderBottomWidth: 1, borderColor: '#eee' },
  help: { color: '#64748b' },
});
