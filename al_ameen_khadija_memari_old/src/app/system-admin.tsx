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

export interface PermissionItem {
  key: string;
  label: string;
  route?: string;
  desc?: string;
}

export interface MenuGroup {
  id: string;
  title: string;
  icon: string;
  color: string;
  badgeBg: string;
  badgeColor: string;
  description?: string;
  items: PermissionItem[];
}

export const MENU_PERMISSION_GROUPS: MenuGroup[] = [
  {
    id: 'students',
    title: 'Students',
    icon: '🎓',
    color: '#0284c7',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    items: [
      { key: 'students', label: 'Student Details', route: '/students', desc: 'All student profiles and list' },
      { key: 'student_entry', label: 'Student Entry', route: '/student-entry', desc: 'New admission entry form' },
      { key: 'daily_attendance', label: 'Student Attendance', route: '/daily-attendance', desc: 'Daily classroom attendance' },
      { key: 'id_cards', label: 'ID Cards & Form', route: '/id-cards', desc: 'ID card and application print' },
      { key: 'documents', label: 'Document Upload', route: '/documents', desc: 'Documents and photo upload' },
      { key: 'student_lifecycle', label: 'Promotion / TC', route: '/student-lifecycle', desc: 'Promotion, TC and reactivation' },
      { key: 'student_transfer', label: 'Excel & Bulk Documents', route: '/student-transfer', desc: 'Excel export and bulk student documents' },
      { key: 'behavior', label: 'Student Behavior', route: '/behavior', desc: 'Discipline and conduct records' },
      { key: 'gate_passes', label: 'Student Gate Pass', route: '/gate-pass', desc: 'Full gate pass access' },
      { key: 'visits', label: 'Visit Permission', route: '/visits', desc: 'Visiting day permission and records' },
      { key: 'guardians', label: 'Guardian & Password', route: '/guardians', desc: 'Guardian directory and passwords' },
      { key: 'dues', label: 'Student Dues', route: '/dues', desc: 'Due fees tracking' },
      { key: 'gate_pass_generate', label: 'Generate Gate Pass', route: 'Generate tab', desc: 'Create single gate pass' },
      { key: 'gate_pass_bulk', label: 'Bulk Gate Pass', route: 'Bulk tab', desc: 'Generate bulk gate passes' },
      { key: 'gate_pass_execute', label: 'Execute Return', route: 'Return tab', desc: 'Mark student return from leave' },
      { key: 'gate_pass_ready', label: 'Ready to Print', route: 'Print tab', desc: 'Print pending gate passes' },
      { key: 'gate_pass_records', label: 'Gate Pass Records', route: 'Records tab', desc: 'Gate pass history and search' },
    ],
  },
  {
    id: 'staff',
    title: 'Staff',
    icon: '👥',
    color: '#0d9488',
    badgeBg: '#ccfbf1',
    badgeColor: '#0f766e',
    items: [
      { key: 'teachers', label: 'View Staff', route: '/teachers?mode=view', desc: 'Staff directory and profiles' },
      { key: 'teachers_add', label: 'Add Staff', route: '/teachers?mode=add', desc: 'Register new teachers and staff' },
      { key: 'teachers_icard', label: 'I-Card & Form', route: '/teachers?mode=icard', desc: 'Staff ID card and biodata form' },
      { key: 'teacher_attendance', label: 'Staff Attendance', route: '/teacher-attendance', desc: 'Daily teacher & staff attendance' },
      { key: 'staff_summary', label: 'Staff Summary', route: '/staff-summary', desc: 'Department and role breakdown' },
      { key: 'gateman_sheet', label: 'Gateman Sheet', route: 'Excel Download', desc: 'Security gateman excel register' },
      { key: 'service_staff', label: 'Staff Accounts', route: '/service-staff', desc: 'Gateman & service staff accounts' },
      { key: 'gateman_panel', label: 'Gateman Portal', route: '/gateman', desc: 'Security entry/exit portal' },
    ],
  },
  {
    id: 'hostel',
    title: 'Hostel',
    icon: '🏢',
    color: '#7c3aed',
    badgeBg: '#ede9fe',
    badgeColor: '#6d28d9',
    items: [
      { key: 'rooms', label: 'Rooms List', route: '/rooms', desc: 'Room list and bed capacities' },
      { key: 'room_assignments', label: 'Room Assignment', route: '/room-assignments', desc: 'Room and floor allocations' },
      { key: 'attendance', label: 'Evening Attendance', route: '/attendance', desc: 'Hostel evening rollcall attendance' },
      { key: 'dining_stock', label: 'Dining Stock', route: '/dining-stock', desc: 'Mess and food ration inventory' },
      { key: 'asset_register', label: 'Asset Register', route: '/asset-register', desc: 'Campus assets and equipment' },
      { key: 'rooms_support', label: 'Room Lookup', route: 'Quick Lookup', desc: 'Student room lookup' },
    ],
  },
  {
    id: 'academic',
    title: 'Academy',
    icon: '📚',
    color: '#2563eb',
    badgeBg: '#dbeafe',
    badgeColor: '#1d4ed8',
    items: [
      { key: 'marks', label: 'Weekly Marks', route: '/marks', desc: 'Weekly test score entry' },
      { key: 'omr_evaluation', label: 'OMR Exam & Eval', route: '/omr-evaluation', desc: 'OMR sheets evaluation & results' },
      { key: 'terminal_exams', label: 'Terminal Exam', route: '/terminal-exams', desc: 'Terminal exam marks entry' },
      { key: 'published_results', label: 'Print Result', route: '/class-results', desc: 'Class-wise published exam results' },
      { key: 'routines', label: 'Teacher Routine', route: '/routines', desc: 'Weekly school timetable' },
      { key: 'notices', label: 'Notice Board', route: '/notices', desc: 'Notice publish and broadcast' },
      { key: 'library_panel', label: 'Library Portal', route: '/library', desc: 'Library catalog and book issue' },
      { key: 'illness', label: 'Student Illness', route: '/illness', desc: 'Medical and sickness logs' },
      { key: 'problems', label: 'Room Problems', route: '/problems', desc: 'Infrastructure complaints' },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts',
    icon: '💳',
    color: '#059669',
    badgeBg: '#d1fae5',
    badgeColor: '#047857',
    items: [
      { key: 'fees', label: 'Fee Collection', route: '/fees?tab=fees_collection', desc: 'Monthly tuition fee collection' },
      { key: 'due_fees', label: 'Due Fees Tracker', route: '/due-fees', desc: 'Pending fee ledger & tracking' },
      { key: 'receipt_payment', label: 'Receipt & Payment', route: '/fees?tab=receipt_payment', desc: 'Cash receipts and expenses' },
      { key: 'bank_matcher', label: 'Bank Matcher', route: '/bank-statement-matcher', desc: 'Bank statement reconciliation' },
      { key: 'deposit_fund', label: 'Deposit Fund', route: '/deposit-fund', desc: 'Student personal deposit fund' },
    ],
  },
  {
    id: 'audit_log',
    title: 'Audit Log',
    icon: '📜',
    color: '#475569',
    badgeBg: '#f1f5f9',
    badgeColor: '#334155',
    items: [
      { key: 'audit_log', label: 'Activity Audit Log', route: '/audit-log', desc: 'GPS-enabled audit trails' },
    ],
  },
  {
    id: 'system_admin',
    title: 'System Admin',
    icon: '⚙️',
    color: '#334155',
    badgeBg: '#f1f5f9',
    badgeColor: '#1e293b',
    items: [
      { key: 'office_panel', label: 'Office Service Panel', route: '/office', desc: 'Office operations helpdesk' },
      { key: 'display_control', label: 'Display Control', route: '/display-control', desc: 'Projector display control' },
    ],
  },
];

// Flat fallback mapping for legacy compatibility
const modules: [string, string][] = MENU_PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((item) => [item.key, `${g.title} > ${item.label}`] as [string, string])
);

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
  const [searchPerm, setSearchPerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [savingPerms, setSavingPerms] = useState(false);

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
    const warningMessage = `⚠️ WARNING:\n\nAre you sure you want to reset the password for Super Admin "${x.full_name || x.login_id}" (${x.login_id})?\n\nThis will invalidate the current password and generate a new temporary password.`;
    const ok = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.confirm(warningMessage)
      : await new Promise<boolean>((resolve) =>
          Alert.alert('Confirm Password Reset', warningMessage, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Reset Password', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!ok) return;

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
    if (!selected) return;
    setSavingPerms(true);
    try {
      await api('/api/system-admin/admins/' + selected.id + '/permissions', {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      });
      await load();
      const msg = `Permissions for ${selected.full_name} (${selected.login_id}) saved successfully! Total ${permissions.length} items active.`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Permissions Saved', msg);
      }
    } catch (e: any) {
      Alert.alert('Permissions', e.message);
    } finally {
      setSavingPerms(false);
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
    const warningMessage = `⚠️ WARNING:\n\nAre you sure you want to reset the password for Office Admin "${x.full_name || x.login_id}" (${x.login_id})?\n\nThis will invalidate the current password and generate a new temporary password.`;
    const ok = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.confirm(warningMessage)
      : await new Promise<boolean>((resolve) =>
          Alert.alert('Confirm Password Reset', warningMessage, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Reset Password', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!ok) return;

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

  const deleteAdmin = async (x: any) => {
    const message = `Are you sure you want to delete Office Admin "${x.full_name}" (${x.login_id})?`;
    const ok = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.confirm(message)
      : await new Promise<boolean>((resolve) =>
          Alert.alert('Delete Office Admin', message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!ok) return;
    try {
      await api('/api/system-admin/admins/' + x.id, {
        method: 'DELETE',
      });
      await load();
      if (selected?.id === x.id) setSelected(null);
      Alert.alert('Office Admin', 'Office Admin deleted successfully.');
    } catch (e: any) {
      Alert.alert('Delete Failed', e.message);
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

  const selectAllPermissions = () => {
    const all = Array.from(new Set(MENU_PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))));
    setPermissions(all);
  };

  const clearAllPermissions = () => {
    setPermissions([]);
  };

  const selectGroup = (groupId: string) => {
    const group = MENU_PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const groupKeys = group.items.map((i) => i.key);
    setPermissions((prev) => Array.from(new Set([...prev, ...groupKeys])));
  };

  const clearGroup = (groupId: string) => {
    const group = MENU_PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const groupKeys = new Set(group.items.map((i) => i.key));
    setPermissions((prev) => prev.filter((k) => !groupKeys.has(k)));
  };

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
              <Text style={[s.heading, { color: '#991b1b' }]}>👑 Super Admin Accounts</Text>
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
            <Text style={s.heading}>🏢 Office Admin Accounts</Text>
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
                <TouchableOpacity
                  style={[s.danger, { backgroundColor: '#b91c1c' }]}
                  onPress={() => deleteAdmin(x)}
                >
                  <Text style={s.white}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Selected Office Admin Permissions */}
        {selected && (
          <View style={[s.card, { borderColor: '#1d4ed8', borderWidth: 2, padding: 16, gap: 14 }]}>
            {/* Header with Title and Save */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingBottom: 12 }}>
              <View>
                <Text style={[s.heading, { color: '#0f172a', fontSize: 20 }]}>
                  🔐 Permissions: <Text style={{ color: '#1d4ed8' }}>{selected.full_name}</Text> ({selected.login_id})
                </Text>
                <Text style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
                  Click any sub-menu item to toggle permission Active (Green) or Inactive (White).
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: '#eff6ff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e40af' }}>
                    Active: {permissions.length} / {MENU_PERMISSION_GROUPS.reduce((acc, g) => acc + g.items.length, 0)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.primary, { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#15803d' }, savingPerms && { opacity: 0.7 }]}
                  onPress={savePermissions}
                  disabled={savingPerms}
                >
                  <Text style={s.white}>{savingPerms ? 'Saving...' : '💾 Save Permissions'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Search Bar & Quick Toggles */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
              <TextInput
                value={searchPerm}
                onChangeText={setSearchPerm}
                placeholder="🔍 Search permission, menu, route (e.g. student entry, gate pass, fees)..."
                style={[s.input, { flex: 1, minWidth: 260, backgroundColor: '#fff' }]}
              />

              {/* Status Filter Pills */}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <TouchableOpacity
                  style={[s.light, { paddingVertical: 8, paddingHorizontal: 11 }, filterStatus === 'all' && { backgroundColor: '#0f172a' }]}
                  onPress={() => setFilterStatus('all')}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: filterStatus === 'all' ? '#fff' : '#475569' }}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.light, { paddingVertical: 8, paddingHorizontal: 11 }, filterStatus === 'active' && { backgroundColor: '#15803d' }]}
                  onPress={() => setFilterStatus('active')}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: filterStatus === 'active' ? '#fff' : '#15803d' }}>
                    Active ({permissions.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.light, { paddingVertical: 8, paddingHorizontal: 11 }, filterStatus === 'inactive' && { backgroundColor: '#dc2626' }]}
                  onPress={() => setFilterStatus('inactive')}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: filterStatus === 'inactive' ? '#fff' : '#dc2626' }}>
                    Inactive ({MENU_PERMISSION_GROUPS.reduce((acc, g) => acc + g.items.length, 0) - permissions.length})
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[s.light, { backgroundColor: '#dbeafe', borderColor: '#bfdbfe', borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 }]}
                onPress={selectAllPermissions}
              >
                <Text style={{ color: '#1e40af', fontWeight: '800', fontSize: 12 }}>✓ Enable All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.light, { backgroundColor: '#fee2e2', borderColor: '#fecaca', borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 }]}
                onPress={clearAllPermissions}
              >
                <Text style={{ color: '#991b1b', fontWeight: '800', fontSize: 12 }}>✗ Deselect All</Text>
              </TouchableOpacity>
              {searchPerm.trim() ? (
                <TouchableOpacity
                  style={[s.light, { paddingHorizontal: 10, paddingVertical: 8 }]}
                  onPress={() => setSearchPerm('')}
                >
                  <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 12 }}>✕ Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Detailed Table Grid */}
            <View style={s.tableScrollWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: 960, flexGrow: 1 }}>
                <View style={{ flex: 1 }}>
                  {/* Table Header */}
                  <View style={s.tableHeaderRow}>
                    <View style={s.tableColMenuHeader}>
                      <Text style={s.tableHeaderTitle}>Main Menu</Text>
                      <Text style={s.tableHeaderSubtitle}>Category & Status</Text>
                    </View>
                    <View style={s.tableColSubmenuHeader}>
                      <Text style={s.tableHeaderTitle}>Sub Menus</Text>
                      <Text style={s.tableHeaderSubtitle}>Click items to toggle Active or Inactive</Text>
                    </View>
                    <View style={s.tableColActionHeader}>
                      <Text style={s.tableHeaderTitle}>Quick Actions</Text>
                      <Text style={s.tableHeaderSubtitle}>One-click toggle</Text>
                    </View>
                  </View>

                  {/* Table Rows */}
                  {MENU_PERMISSION_GROUPS.map((group, index) => {
                    const q = searchPerm.toLowerCase().trim();
                    const filteredItems = group.items.filter((item) => {
                      const isChecked = permissions.includes(item.key);
                      if (filterStatus === 'active' && !isChecked) return false;
                      if (filterStatus === 'inactive' && isChecked) return false;
                      if (!q) return true;
                      return (
                        item.label.toLowerCase().includes(q) ||
                        item.key.toLowerCase().includes(q) ||
                        (item.desc && item.desc.toLowerCase().includes(q)) ||
                        (item.route && item.route.toLowerCase().includes(q)) ||
                        group.title.toLowerCase().includes(q)
                      );
                    });

                    if ((q || filterStatus !== 'all') && filteredItems.length === 0) return null;

                    const groupSelectedCount = group.items.filter((i) => permissions.includes(i.key)).length;
                    const isAllSelected = groupSelectedCount === group.items.length;
                    const isNoneSelected = groupSelectedCount === 0;

                    return (
                      <View
                        key={group.id}
                        style={[
                          s.tableRow,
                          index % 2 === 1 && s.tableRowAlt,
                          groupSelectedCount > 0 && { borderLeftColor: group.color, borderLeftWidth: 4 },
                        ]}
                      >
                        {/* Main Menu Col */}
                        <View style={s.tableColMenu}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[s.menuIconCircle, { backgroundColor: group.badgeBg }]}>
                              <Text style={{ fontSize: 18 }}>{group.icon}</Text>
                            </View>
                            <View>
                              <Text style={[s.menuTitle, { color: '#0f172a' }]}>{group.title}</Text>
                            </View>
                          </View>
                          <View style={[s.menuCountPill, { backgroundColor: groupSelectedCount > 0 ? group.badgeBg : '#f1f5f9' }]}>
                            <Text style={[s.menuCountText, { color: groupSelectedCount > 0 ? group.badgeColor : '#64748b' }]}>
                              {groupSelectedCount} / {group.items.length} Active
                            </Text>
                          </View>
                        </View>

                        {/* Sub-Menus Col */}
                        <View style={s.tableColSubmenus}>
                          <View style={s.submenuGrid}>
                            {filteredItems.map((item) => {
                              const isChecked = permissions.includes(item.key);
                              return (
                                <TouchableOpacity
                                  key={item.key}
                                  activeOpacity={0.7}
                                  onPress={() => toggle(item.key)}
                                  style={[
                                    s.subMenuItem,
                                    isChecked ? s.subMenuItemActive : s.subMenuItemInactive,
                                  ]}
                                >
                                  <View style={[s.subItemBadge, isChecked ? s.subItemBadgeActive : s.subItemBadgeInactive]}>
                                    <Text style={[s.subItemBadgeText, isChecked && { color: '#fff' }]}>
                                      {isChecked ? '✓' : '✕'}
                                    </Text>
                                  </View>
                                  <View style={{ flexShrink: 1 }}>
                                    <Text style={[s.subItemTitle, isChecked ? s.subItemTitleActive : s.subItemTitleInactive]}>
                                      {item.label}
                                    </Text>
                                    {item.route && (
                                      <Text style={[s.subItemRoute, isChecked ? s.subItemRouteActive : s.subItemRouteInactive]}>
                                        {item.route}
                                      </Text>
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Quick Toggle Col */}
                        <View style={s.tableColActions}>
                          <TouchableOpacity
                            style={[s.quickToggleBtn, isAllSelected ? s.quickToggleBtnActive : s.quickToggleBtnOutline]}
                            onPress={() => selectGroup(group.id)}
                          >
                            <Text style={[s.quickToggleText, isAllSelected && { color: '#fff' }]}>
                              {isAllSelected ? '✓ All On' : 'Enable All'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.quickToggleBtn, s.quickToggleBtnClear, isNoneSelected && { opacity: 0.5 }]}
                            onPress={() => clearGroup(group.id)}
                            disabled={isNoneSelected}
                          >
                            <Text style={s.quickToggleClearText}>✕ All Off</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Bottom Save Action */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 12, borderTopWidth: 1, borderColor: '#e2e8f0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700' }}>
                  Selected Admin: <Text style={{ color: '#1d4ed8', fontWeight: '900' }}>{selected.full_name}</Text> ({selected.login_id})
                </Text>
                <View style={{ backgroundColor: '#ecfdf5', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 6, borderWidth: 1, borderColor: '#a7f3d0' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#047857' }}>
                    Total Active: {permissions.length} permissions
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[s.primary, { paddingVertical: 12, paddingHorizontal: 26, backgroundColor: '#15803d', flexDirection: 'row', alignItems: 'center', gap: 8 }, savingPerms && { opacity: 0.7 }]}
                onPress={savePermissions}
                disabled={savingPerms}
              >
                <Text style={[s.white, { fontSize: 15 }]}>{savingPerms ? 'Saving Changes...' : '💾 Save All Permissions'}</Text>
              </TouchableOpacity>
            </View>
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
  body: { padding: 16, maxWidth: 1250, width: '100%', alignSelf: 'center', gap: 14 },
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

  // Table Matrix Styles
  tableScrollWrap: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  tableColMenuHeader: {
    width: 210,
    paddingRight: 10,
  },
  tableColSubmenuHeader: {
    flex: 1,
    paddingHorizontal: 10,
  },
  tableColActionHeader: {
    width: 125,
    alignItems: 'center',
    paddingLeft: 6,
  },
  tableHeaderTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  tableHeaderSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
  },
  tableRowAlt: {
    backgroundColor: '#fbfcfd',
  },
  tableColMenu: {
    width: 210,
    paddingRight: 12,
    gap: 8,
  },
  menuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  menuBengali: {
    fontSize: 12,
    fontWeight: '700',
  },
  menuCountPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 2,
  },
  menuCountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  tableColSubmenus: {
    flex: 1,
    paddingHorizontal: 8,
  },
  submenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1.5,
    minWidth: 165,
    maxWidth: '100%',
  },
  subMenuItemActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  subMenuItemInactive: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  subItemBadge: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subItemBadgeActive: {
    backgroundColor: '#059669',
  },
  subItemBadgeInactive: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  subItemBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94a3b8',
  },
  subItemTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  subItemTitleActive: {
    color: '#064e3b',
  },
  subItemTitleInactive: {
    color: '#475569',
  },
  subItemRoute: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  subItemRouteActive: {
    color: '#059669',
  },
  subItemRouteInactive: {
    color: '#94a3b8',
  },
  tableColActions: {
    width: 125,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  quickToggleBtn: {
    width: '100%',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  quickToggleBtnOutline: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  quickToggleBtnActive: {
    backgroundColor: '#2563eb',
  },
  quickToggleBtnClear: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  quickToggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  quickToggleClearText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
  },
});
