import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
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
import * as DocumentPicker from 'expo-document-picker';
import AcademyHeader from '../components/AcademyHeader';
import { api, API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';
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
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    setEditPhotoUrl(item.photo_url || null);
  };

  const pickAndUploadPhoto = async (targetStaffId?: number) => {
    const targetId = targetStaffId || editItem?.id;
    if (!targetId) return;

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });

      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      setUploadingPhoto(true);

      const token = await getToken();
      const fd = new FormData();

      if (Platform.OS === 'web' && (asset as any).file) {
        fd.append('photo', (asset as any).file);
      } else {
        fd.append('photo', {
          uri: asset.uri,
          name: asset.name || 'photo.jpg',
          type: asset.mimeType || 'image/jpeg',
        } as any);
      }

      const res = await fetch(`${API_BASE}/api/service-panels/staff/${targetId}/photo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Photo upload failed');
      }

      setEditPhotoUrl(data.photo_url);
      if (editItem && editItem.id === targetId) {
        setEditItem((prev: any) => ({ ...prev, photo_url: data.photo_url }));
      }
      await load();
      Alert.alert('Success', 'Staff photo uploaded successfully!');
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message || 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = async (targetStaffId?: number) => {
    const targetId = targetStaffId || editItem?.id;
    if (!targetId) return;

    try {
      setUploadingPhoto(true);
      await api(`/api/service-panels/staff/${targetId}/photo`, {
        method: 'DELETE',
      });
      setEditPhotoUrl(null);
      if (editItem && editItem.id === targetId) {
        setEditItem((prev: any) => ({ ...prev, photo_url: null }));
      }
      await load();
      Alert.alert('Removed', 'Staff photo removed successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not remove photo.');
    } finally {
      setUploadingPhoto(false);
    }
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
      await load();
      Alert.alert('Temporary Password Created', `Login ID: ${x.login_id}\nTemporary Password: ${temporaryPassword}`);
    } catch (e: any) {
      Alert.alert('Reset Failed', e.message);
    }
  };

  const filteredList = list.filter((x) => {
    if (roleFilter === 'all') return true;
    return (x.staff_role || x.role) === roleFilter;
  });

  const gatemanCount = list.filter((x) => (x.staff_role || x.role) === 'gateman').length;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />

        {/* HEADER */}
        <View style={s.top}>
          <TouchableOpacity style={s.light} onPress={() => router.push('/superadmin' as any)}>
            <Text style={s.bold}>← Super Admin</Text>
          </TouchableOpacity>
          <View>
            <Text style={s.title}>Service Staff Management</Text>
            <Text style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
              Add, manage photos, passwords, and access for Gateman, Office, and Library staff.
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
              const hasPhoto = !!x.photo_url;
              return (
                <View key={x.id} style={[s.row, !x.is_active && s.inactiveRow]}>
                  {/* AVATAR / PHOTO */}
                  <TouchableOpacity
                    style={s.avatarContainer}
                    onPress={() => pickAndUploadPhoto(x.id)}
                    title="Click to add or change photo"
                  >
                    {hasPhoto ? (
                      <Image
                        source={{ uri: x.photo_url }}
                        style={s.avatarImage}
                      />
                    ) : (
                      <View style={[s.avatarCircle, isGateman && s.avatarCircleGate]}>
                        <Text style={{ fontSize: 22 }}>
                          {isGateman ? '👮' : x.role === 'library' ? '📚' : '🏢'}
                        </Text>
                      </View>
                    )}
                    <View style={s.cameraBadge}>
                      <Text style={{ fontSize: 9 }}>📷</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={{ flex: 1, minWidth: 240 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                    <TouchableOpacity
                      style={s.photoBtn}
                      onPress={() => pickAndUploadPhoto(x.id)}
                      disabled={uploadingPhoto}
                    >
                      <Text style={s.photoBtnText}>
                        {uploadingPhoto ? '⏳ Uploading...' : hasPhoto ? '📷 Change Photo' : '📷 Add Photo'}
                      </Text>
                    </TouchableOpacity>

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

              <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12, paddingVertical: 10 }}>
                {/* PHOTO UPLOAD & PREVIEW SECTION */}
                <View style={s.modalPhotoCard}>
                  <Text style={s.inputLabel}>Staff Profile Photo</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {editPhotoUrl ? (
                      <Image source={{ uri: editPhotoUrl }} style={s.modalPhotoPreview} />
                    ) : (
                      <View style={[s.modalPhotoPlaceholder, editItem?.staff_role === 'gateman' && { backgroundColor: '#fef3c7' }]}>
                        <Text style={{ fontSize: 36 }}>
                          {editItem?.staff_role === 'gateman' ? '👮' : '👤'}
                        </Text>
                      </View>
                    )}

                    <View style={{ gap: 6, flex: 1 }}>
                      <TouchableOpacity
                        style={s.modalUploadBtn}
                        onPress={() => pickAndUploadPhoto(editItem?.id)}
                        disabled={uploadingPhoto}
                      >
                        <Text style={s.modalUploadBtnText}>
                          {uploadingPhoto ? '⏳ Uploading...' : editPhotoUrl ? '📷 Change Photo' : '📷 Upload Photo'}
                        </Text>
                      </TouchableOpacity>

                      {editPhotoUrl && (
                        <TouchableOpacity
                          style={s.modalRemoveBtn}
                          onPress={() => removePhoto(editItem?.id)}
                          disabled={uploadingPhoto}
                        >
                          <Text style={s.modalRemoveBtnText}>🗑️ Remove Photo</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>

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
  bold: { fontWeight: '700', color: '#0f3a61' },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterTab: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  filterTabActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  filterTabText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  filterTabTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, gap: 12 },
  cardHeading: { fontSize: 16, fontWeight: '800', color: '#1e3a5f' },
  createGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    minWidth: 130,
    flex: 1,
  },
  primary: { backgroundColor: '#0284c7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 6 },
  white: { color: '#fff', fontWeight: '700', fontSize: 12 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inactiveRow: { opacity: 0.6, backgroundColor: '#f8fafc' },
  avatarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e2e8f0',
    borderWidth: 2,
    borderColor: '#0284c7',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  avatarCircleGate: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
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
  photoBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  photoBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
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
    maxWidth: 520,
    padding: 18,
    gap: 12,
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
  modalPhotoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalPhotoPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#0284c7',
  },
  modalPhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalUploadBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalUploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  modalRemoveBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  modalRemoveBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },
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
