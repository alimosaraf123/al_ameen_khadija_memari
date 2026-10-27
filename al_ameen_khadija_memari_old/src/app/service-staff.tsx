import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
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
import { api } from '../lib/api';
import { Select } from '../components/StudentDirectory';

const ROLE_OPTIONS = [
  { value: 'gateman', label: '👮 Gateman' },
  { value: 'office', label: '🏢 Office' },
  { value: 'library', label: '📚 Library' },
];

export default function ServiceStaff() {
  const [list, setList] = useState<any[]>([]);
  const [roleFilter, setRoleFilter] = useState<'all' | 'gateman' | 'office' | 'library'>('all');

  // Create form state
  const [role, setRole] = useState('gateman');
  const [staffId, setStaffId] = useState('');
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editItem, setEditItem] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    try {
      const d = await api('/api/service-panels/staff');
      setList(d.staff || []);
    } catch (e: any) {
      Alert.alert('Staff', e.message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    if (!name.trim() || !login.trim() || !password) {
      return Alert.alert('Missing Fields', 'Please fill in Name, User ID, and Password.');
    }
    if (password !== confirmPassword) {
      return Alert.alert('Password Mismatch', 'Password and Re-enter Password must match.');
    }
    setCreating(true);
    try {
      await api('/api/service-panels/staff', {
        method: 'POST',
        body: JSON.stringify({
          role,
          staff_id: staffId,
          name: name.trim(),
          login_id: login.trim(),
          password,
          confirm_password: confirmPassword,
          mobile: mobile.trim(),
        }),
      });
      setStaffId('');
      setName('');
      setLogin('');
      setPassword('');
      setConfirmPassword('');
      setMobile('');
      await load();
      Alert.alert('Success', 'Staff login account created successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditName(item.name || '');
    setEditMobile(item.mobile || '');
    setEditStaffId(item.staff_id || '');
    setEditIsActive(!!item.is_active);
    setEditPassword('');
    setEditConfirmPassword('');
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (editPassword && editPassword !== editConfirmPassword) {
      return Alert.alert('Password Mismatch', 'New Password and Confirm Password do not match.');
    }

    setSavingEdit(true);
    try {
      const payload: any = {
        name: editName.trim(),
        mobile: editMobile.trim(),
        staff_id: editStaffId.trim(),
        is_active: editIsActive,
      };
      if (editPassword) {
        payload.password = editPassword;
        payload.confirm_password = editConfirmPassword;
      }

      await api('/api/service-panels/staff/' + editItem.id, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setEditItem(null);
      await load();
      Alert.alert('Saved', 'Staff profile updated successfully.');
    } catch (e: any) {
      Alert.alert('Save Error', e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const toggle = async (x: any) => {
    try {
      await api('/api/service-panels/staff/' + x.id, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !x.is_active }),
      });
      await load();
    } catch (e: any) {
      Alert.alert('Staff', e.message);
    }
  };

  const reset = async (x: any) => {
    const temporaryPassword = 'Temp@' + Math.floor(100000 + Math.random() * 900000);
    try {
      await api('/api/service-panels/staff/' + x.id, {
        method: 'PATCH',
        body: JSON.stringify({ password: temporaryPassword, confirm_password: temporaryPassword }),
      });
      if (typeof window !== 'undefined') {
        window.alert(`User ID: ${x.login_id}\nNew temporary password: ${temporaryPassword}`);
      } else {
        Alert.alert('Password Reset', `User ID: ${x.login_id}\nNew temporary password: ${temporaryPassword}`);
      }
    } catch (e: any) {
      Alert.alert('Staff', e.message);
    }
  };

  const filteredList = list.filter((item) => {
    if (roleFilter === 'all') return true;
    const itemRole = String(item.staff_role || item.role || '').toLowerCase();
    return itemRole === roleFilter;
  });

  const gatemanCount = list.filter(
    (x) => String(x.staff_role || x.role || '').toLowerCase() === 'gateman'
  ).length;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />

        {/* TOP BAR */}
        <View style={s.top}>
          <TouchableOpacity
            style={s.light}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/superadmin'))}
          >
            <Text style={s.bold}>‹ Back</Text>
          </TouchableOpacity>
          <View>
            <Text style={s.title}>Gateman / Office / Library Accounts</Text>
            <Text style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
              Manage logins, reset passwords, change names, and activate/deactivate accounts.
            </Text>
          </View>
        </View>

        {/* ROLE FILTER TABS */}
        <View style={s.filterRow}>
          <TouchableOpacity
            style={[s.filterTab, roleFilter === 'all' && s.filterTabActive]}
            onPress={() => setRoleFilter('all')}
          >
            <Text style={[s.filterTabText, roleFilter === 'all' && s.filterTabTextActive]}>
              All Staff ({list.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.filterTab, roleFilter === 'gateman' && s.filterTabActive]}
            onPress={() => setRoleFilter('gateman')}
          >
            <Text style={[s.filterTabText, roleFilter === 'gateman' && s.filterTabTextActive]}>
              👮 Gateman ({gatemanCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.filterTab, roleFilter === 'office' && s.filterTabActive]}
            onPress={() => setRoleFilter('office')}
          >
            <Text style={[s.filterTabText, roleFilter === 'office' && s.filterTabTextActive]}>
              🏢 Office ({list.filter((x) => (x.staff_role || x.role) === 'office').length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.filterTab, roleFilter === 'library' && s.filterTabActive]}
            onPress={() => setRoleFilter('library')}
          >
            <Text style={[s.filterTabText, roleFilter === 'library' && s.filterTabTextActive]}>
              📚 Library ({list.filter((x) => (x.staff_role || x.role) === 'library').length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* CREATE NEW LOGIN CARD */}
        <View style={s.card}>
          <Text style={s.cardHeading}>➕ Create New Staff Login</Text>
          <View style={s.createGrid}>
            <View style={{ minWidth: 150 }}>
              <Select
                label="Role"
                value={role}
                onChange={setRole}
                options={ROLE_OPTIONS}
              />
            </View>
            <Field p="Staff ID (e.g. GATE-005)" v={staffId} set={setStaffId} />
            <Field p="Full Name (e.g. Rahul Mondal)" v={name} set={setName} />
            <Field p="User ID / Login (e.g. gateman05)" v={login} set={setLogin} />
            <Field p="Initial Password" v={password} set={setPassword} secure />
            <Field p="Re-enter Password" v={confirmPassword} set={setConfirmPassword} secure />
            <Field p="Mobile Number" v={mobile} set={setMobile} />
            <TouchableOpacity style={s.primary} onPress={add} disabled={creating}>
              <Text style={s.white}>{creating ? 'Creating...' : 'Create Login'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* STAFF LIST */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e3a5f' }}>
            Current Logins ({filteredList.length})
          </Text>

          {filteredList.length === 0 ? (
            <View style={[s.card, { alignItems: 'center', padding: 24 }]}>
              <Text style={{ color: '#64748b', fontSize: 14 }}>No staff logins found for this filter.</Text>
            </View>
          ) : (
            filteredList.map((x) => {
              const isGateman = String(x.staff_role || x.role).toLowerCase() === 'gateman';
              return (
                <View key={x.id} style={[s.row, !x.is_active && s.inactiveRow]}>
                  <View style={{ flex: 1, minWidth: 260 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 18 }}>{isGateman ? '👮' : x.role === 'library' ? '📚' : '🏢'}</Text>
                      <Text style={s.bold}>{x.name || 'Unnamed'}</Text>
                      <View style={[s.roleBadge, isGateman && s.roleBadgeGate]}>
                        <Text style={[s.roleBadgeText, isGateman && s.roleBadgeTextGate]}>
                          {(x.staff_role || x.role).toUpperCase()}
                        </Text>
                      </View>
                      <View style={[s.statusBadge, x.is_active ? s.statusActive : s.statusInactive]}>
                        <Text style={s.statusBadgeText}>{x.is_active ? 'Active' : 'Disabled'}</Text>
                      </View>
                    </View>

                    <Text style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>
                      <Text style={{ fontWeight: '700' }}>User ID: </Text>
                      <Text style={{ color: '#0f3a61', fontWeight: '800', backgroundColor: '#e0f2fe', paddingHorizontal: 5, borderRadius: 3 }}>
                        {x.login_id}
                      </Text>
                      {'  '}· Staff ID: {x.staff_id || '—'}
                      {'  '}· Mobile: {x.mobile || '—'}
                    </Text>

                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>
                      Access: {isGateman ? 'Gate Scanner, Approved Visits & Entry/Exit Logs' : x.role === 'office' ? 'Gate Pass, Hostel Stock' : 'Library Books, Issue / Return'}
                    </Text>
                  </View>

                  {/* ACTION BUTTONS */}
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <TouchableOpacity style={s.editBtn} onPress={() => openEdit(x)}>
                      <Text style={s.white}>✏️ Edit Details / Password</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.reset} onPress={() => reset(x)}>
                      <Text style={s.white}>🔑 Quick Reset</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.toggle, x.is_active ? s.activeToggle : s.inactiveToggle]}
                      onPress={() => toggle(x)}
                    >
                      <Text style={s.white}>{x.is_active ? 'Deactivate' : 'Activate'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* EDIT MODAL */}
        <Modal
          visible={!!editItem}
          transparent
          animationType="fade"
          onRequestClose={() => setEditItem(null)}
        >
          <View style={s.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditItem(null)} />
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>
                  Edit Staff: {editItem?.login_id} ({editItem?.staff_role?.toUpperCase()})
                </Text>
                <TouchableOpacity onPress={() => setEditItem(null)}>
                  <Text style={{ fontSize: 22, color: '#64748b', fontWeight: '800' }}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12, paddingVertical: 10 }}>
                <View>
                  <Text style={s.inputLabel}>Staff Full Name</Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Full Name"
                    style={s.modalInput}
                  />
                </View>

                <View>
                  <Text style={s.inputLabel}>Staff ID / Badge</Text>
                  <TextInput
                    value={editStaffId}
                    onChangeText={setEditStaffId}
                    placeholder="Staff ID"
                    style={s.modalInput}
                  />
                </View>

                <View>
                  <Text style={s.inputLabel}>Mobile Number</Text>
                  <TextInput
                    value={editMobile}
                    onChangeText={setEditMobile}
                    placeholder="Mobile Number"
                    keyboardType="phone-pad"
                    style={s.modalInput}
                  />
                </View>

                <View style={{ borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 10 }}>
                  <Text style={[s.inputLabel, { color: '#0f3a61', fontWeight: '900' }]}>
                    Change Password (Leave blank to keep current password)
                  </Text>
                  <TextInput
                    value={editPassword}
                    onChangeText={setEditPassword}
                    placeholder="New Password (optional)"
                    secureTextEntry
                    style={[s.modalInput, { marginTop: 6 }]}
                  />
                  <TextInput
                    value={editConfirmPassword}
                    onChangeText={setEditConfirmPassword}
                    placeholder="Confirm New Password"
                    secureTextEntry
                    style={[s.modalInput, { marginTop: 6 }]}
                  />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <Text style={s.inputLabel}>Account Status:</Text>
                  <TouchableOpacity
                    style={[s.statusButton, editIsActive ? s.statusActiveBtn : s.statusInactiveBtn]}
                    onPress={() => setEditIsActive(!editIsActive)}
                  >
                    <Text style={s.white}>{editIsActive ? '🟢 Active' : '🔴 Inactive'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View style={s.modalFooter}>
                <TouchableOpacity
                  style={s.light}
                  onPress={() => setEditItem(null)}
                  disabled={savingEdit}
                >
                  <Text style={s.bold}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.primary}
                  onPress={saveEdit}
                  disabled={savingEdit}
                >
                  <Text style={s.white}>{savingEdit ? 'Saving...' : 'Save Changes'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  page: { flex: 1, backgroundColor: '#f0f4f8' },
  body: { padding: 16, maxWidth: 1050, width: '100%', alignSelf: 'center', gap: 14 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: '#0f3a61' },
  light: { backgroundColor: '#e2ecf8', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  bold: { fontWeight: '800', color: '#1e3a5f' },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd8e4',
    gap: 10,
  },
  cardHeading: { fontSize: 16, fontWeight: '800', color: '#1e3a5f' },
  createGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  input: {
    minWidth: 160,
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#bbc7d2',
    borderRadius: 7,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  primary: { backgroundColor: '#1769aa', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 7 },
  white: { color: '#fff', fontWeight: '800', fontSize: 13 },
  row: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#cbd8e4',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  inactiveRow: { opacity: 0.6, backgroundColor: '#f8fafc' },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e2ecf8',
  },
  filterTabActive: { backgroundColor: '#0f3a61' },
  filterTabText: { fontWeight: '700', color: '#1e3a5f', fontSize: 13 },
  filterTabTextActive: { color: '#fff' },
  roleBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeGate: { backgroundColor: '#dbeafe' },
  roleBadgeText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  roleBadgeTextGate: { color: '#1d4ed8' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  statusActive: { backgroundColor: '#dcfce7' },
  statusInactive: { backgroundColor: '#fee2e2' },
  statusBadgeText: { fontSize: 11, fontWeight: '800', color: '#15803d' },
  editBtn: { backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  reset: { backgroundColor: '#6366f1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  toggle: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  activeToggle: { backgroundColor: '#dc2626' },
  inactiveToggle: { backgroundColor: '#16a34a' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    padding: 18,
    gap: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f3a61' },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    paddingTop: 10,
  },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  statusButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  statusActiveBtn: { backgroundColor: '#16a34a' },
  statusInactiveBtn: { backgroundColor: '#dc2626' },
});
