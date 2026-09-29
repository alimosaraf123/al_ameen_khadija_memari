import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AcademyHeader from '../components/AcademyHeader';
import { API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';
import {
  ScrollView,
  Text,
  View,
  Alert,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import StudentDirectory, { Select } from '../components/StudentDirectory';
import { STUDENT_CLASSES, isVisibleStudentClass } from '../lib/studentClasses';
import StudentMenu from '../components/StudentMenu';
import { normalizeStudentClass } from '../lib/studentDirectory';

import { api } from '../lib/api';
import {
  Field,
  Button,
  H1,
} from '../components/ui';

const StudentFormContext = React.createContext<any>(null);

const LabeledField = ({
  label,
  field,
  value,
  onChangeText,
}: any) => {
  const ctx = React.useContext(StudentFormContext);

  const actualValue =
    value !== undefined
      ? value
      : field
      ? ctx?.form?.[field] ?? ''
      : '';

  const handleChange =
    onChangeText ||
    ((v: string) => {
      if (field) ctx?.update?.(field, v);
    });

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Field
        placeholder={label}
        value={actualValue}
        onChangeText={handleChange}
      />
    </View>
  );
};

const SectionTitle = ({ children }: any) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{children}</Text>
  </View>
);

const EMPTY_FORM: any = {
  registration_no: '',
  admission_no: '',
  student_name: '',
  class_name: '',
  roll_no: '',
  room_id: null,

  admission_date: '',
  session_from: '',
  session_to: '',
  monthly_fees: '',
  mobile_number: '',
  whatsapp_number: '',
  email: '',
  student_type: 'hostel',

  date_of_birth: '',
  gender: '',
  aadhaar_no: '',
  caste_name: '',
  blood_group: '',
  admitted_school_name: '',
  stream: '',
  is_handicapped: false,
  is_orphan: false,
  previous_branch_name: '',
  banglarshiksha_id: '',
  kanyashree_id: '',
  aikyashree_id: '',

  father_name: '',
  father_aadhaar_no: '',
  father_qualification: '',
  father_occupation: '',
  father_annual_income: '',
  father_mobile: '',

  mother_name: '',
  mother_aadhaar_no: '',
  mother_qualification: '',
  mother_occupation: '',
  mother_annual_income: '',
  mother_mobile: '',

  guardian_name: '',
  guardian_mobile: '',
  alternate_mobile: '',

  present_village: '',
  present_police_station: '',
  present_pin_code: '',
  present_post_office: '',
  present_block: '',
  present_district: '',
  present_state: 'WEST BENGAL',

  permanent_village: '',
  permanent_police_station: '',
  permanent_pin_code: '',
  permanent_post_office: '',
  permanent_block: '',
  permanent_district: '',
  permanent_state: 'WEST BENGAL',

  bank_account_no: '',
  bank_name: '',
  bank_ifsc_code: '',
  bank_branch_name: '',
  bank_branch_address: '',

  photo_url: '',
};

const EMPTY_VISITOR: any = {
  visitor_name: '',
  relation: '',
  mobile_number: '',
  email: '',
  village: '',
  police_station: '',
  pin_code: '',
  post_office: '',
  block: '',
  district: '',
  state: 'WEST BENGAL',
  address_source: 'custom',
};

const asText = (value: any) =>
  value === undefined || value === null ? '' : String(value);

const asDate = (value: any) =>
  value ? String(value).slice(0, 10) : '';

type TransferAsset = DocumentPicker.DocumentPickerAsset;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function appendUploadFile(form: FormData, field: string, file: TransferAsset) {
  if (Platform.OS === 'web') { const blob = file.file || await (await fetch(file.uri)).blob(); form.append(field, blob, file.name); }
  else form.append(field, { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
}
async function transferRequest(path: string, body?: FormData) {
  const token = await getToken();
  const response = await fetch(`${API_BASE}/api/student-transfer${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` }, ...(body ? { body } : {}) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `Request failed (${response.status})`); }
  return response;
}
export default function Students() {
  const [students, setStudents] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<any>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [screen, setScreen] = useState<'details' | 'entry'>('details');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [transferBusy, setTransferBusy] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [transferError, setTransferError] = useState('');
  const [excelFile, setExcelFile] = useState<TransferAsset | null>(null);
  const [excelPreview, setExcelPreview] = useState<any>(null);
  const [photoFiles, setPhotoFiles] = useState<TransferAsset[]>([]);
  const [photoResults, setPhotoResults] = useState<any[]>([]);

  const [form, setForm] = useState<any>({ ...EMPTY_FORM });
  const [visitor1, setVisitor1] = useState<any>({ ...EMPTY_VISITOR });
  const [visitor2, setVisitor2] = useState<any>({ ...EMPTY_VISITOR });

  const update = (key: string, value: any) => {
    setForm((old: any) => ({ ...old, [key]: value }));
  };

  const updateVisitor = (no: 1 | 2, key: string, value: any) => {
    const setter = no === 1 ? setVisitor1 : setVisitor2;
    setter((old: any) => ({ ...old, [key]: value }));
  };

  const loadStudents = async () => {
    setListLoading(true);
    setListError('');
    try {
      const data = await api('/api/students?include_inactive=true');
      setStudents(data.students || []);
    } catch (e: any) {
      setListError(e.message || 'Unable to load students');
    } finally {
      setListLoading(false);
    }
  };

  const loadRooms = async () => {
    try {
      const data = await api('/api/rooms');
      setRooms(data.rooms || []);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  useEffect(() => {
    loadStudents();
    loadRooms();
  }, []);

  const runTransfer = async (label: string, action: () => Promise<void>) => {
    setTransferBusy(label); setTransferError(''); setTransferMessage('');
    try { await action(); } catch (error: any) { setTransferError(error.message || 'Operation failed'); }
    finally { setTransferBusy(''); }
  };
  const downloadStudentsExcel = (template: boolean) => runTransfer('Preparing Excel...', async () => {
    const suffix = template ? '?template=true' : ''; const fileName = template ? 'student-template.xlsx' : 'students.xlsx';
    if (Platform.OS === 'web') {
      const response = await transferRequest('/excel' + suffix); const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      const token = await getToken(); const target = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + Date.now() + '-' + fileName;
      const result = await FileSystem.downloadAsync(`${API_BASE}/api/student-transfer/excel${suffix}`, target, { headers: { Authorization: 'Bearer ' + token } });
      if (result.status !== 200) throw new Error('Excel download failed. Please retry.');
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(result.uri, { mimeType: XLSX_MIME, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
    }
    setTransferMessage(template ? 'Excel template downloaded.' : 'Student Excel downloaded.');
  });
  const chooseStudentsExcel = () => runTransfer('Checking Excel...', async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: [XLSX_MIME, 'application/octet-stream'], copyToCacheDirectory: true }); if (result.canceled) return;
    const file = result.assets[0]; if (!/\.xlsx$/i.test(file.name)) throw new Error('Select an .xlsx Excel workbook.');
    if (file.size && file.size > 10 * 1024 * 1024) throw new Error('Excel file must be under 10 MB.');
    const form = new FormData(); await appendUploadFile(form, 'file', file); const preview = await (await transferRequest('/excel/preview', form)).json();
    setExcelFile(file); setExcelPreview(preview);
  });
  const importStudentsExcel = () => runTransfer('Importing students...', async () => {
    if (!excelFile || !excelPreview || excelPreview.errors.length) return;
    const form = new FormData(); await appendUploadFile(form, 'file', excelFile); const result = await (await transferRequest('/excel/import', form)).json();
    setTransferMessage(`Import complete: ${result.created} added, ${result.updated} updated.`); setExcelFile(null); setExcelPreview(null); await loadStudents();
  });
  const chooseStudentPhotos = () => runTransfer('Selecting photos...', async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: true, copyToCacheDirectory: true }); if (result.canceled) return;
    if (result.assets.length > 100) throw new Error('Select up to 100 photos at a time.'); const seen = new Set<string>();
    for (const file of result.assets) {
      if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error(`${file.name}: use JPG, PNG or WebP.`);
      if (file.size && file.size > 5 * 1024 * 1024) throw new Error(`${file.name}: photo exceeds 5 MB.`);
      const registration = file.name.replace(/\.[^.]+$/, '').trim().toLowerCase(); if (!registration || seen.has(registration)) throw new Error(`Missing or duplicate registration number: ${file.name}`); seen.add(registration);
    }
    setPhotoFiles(result.assets); setPhotoResults([]);
  });
  const uploadStudentPhotos = () => runTransfer('Uploading photos...', async () => {
    const results: any[] = []; setPhotoResults([]);
    for (let start = 0; start < photoFiles.length; start += 10) {
      const batch = photoFiles.slice(start, start + 10); setTransferBusy(`Uploading ${start + 1}-${Math.min(start + 10, photoFiles.length)} of ${photoFiles.length} photos...`);
      const form = new FormData(); for (const file of batch) await appendUploadFile(form, 'photos', file);
      const data = await (await transferRequest('/photos', form)).json(); results.push(...data.results); setPhotoResults([...results]);
    }
    const uploaded = results.filter(result => result.success).length; setTransferMessage(`${uploaded} photos uploaded; ${results.length - uploaded} failed.`); setPhotoFiles([]); await loadStudents();
  });
  const transferButton = (title: string, onPress: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!transferBusy || disabled }} disabled={!!transferBusy || disabled} onPress={onPress} style={[styles.transferButton, (!!transferBusy || disabled) && styles.transferButtonDisabled]}><Text style={styles.transferButtonText}>{title}</Text></TouchableOpacity>;
  const clearForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setVisitor1({ ...EMPTY_VISITOR });
    setVisitor2({ ...EMPTY_VISITOR });
  };

  const choice = (
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <TouchableOpacity
      key={label}
      style={[styles.option, selected && styles.selectedOption]}
      onPress={onPress}
    >
      <Text style={selected ? styles.selectedText : styles.optionText}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const saveStudent = async () => {
    if (!form.registration_no.trim()) {
      Alert.alert('Required', 'Registration Number is required');
      return;
    }

    if (!form.student_name.trim()) {
      Alert.alert('Required', 'Student Name is required');
      return;
    }

    const normalizedRegistration = form.registration_no
      .trim()
      .toLowerCase();

    const duplicateRegistration = students.some((student) =>
      student.id !== editingId &&
      String(student.registration_no || '')
        .trim()
        .toLowerCase() === normalizedRegistration
    );

    if (duplicateRegistration) {
      Alert.alert(
        'Duplicate Registration',
        'This Registration Number already exists.'
      );
      return;
    }

    try {
      const body = {
        ...form,
        registration_no: form.registration_no.trim(),
        room_id: form.room_id || null,
        visitor1,
        visitor2,
      };

      if (editingId !== null) {
        await api(`/api/students/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        Alert.alert('Success', 'Student updated successfully');
      } else {
        await api('/api/students', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        Alert.alert('Success', 'Student added successfully');
      }

      clearForm();
      setScreen('details');
      await loadStudents();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const startEdit = async (student: any) => {
    try {
      const data = await api(`/api/students/${student.id}`);
      const s = data.student;
      const next: any = { ...EMPTY_FORM };

      Object.keys(next).forEach((key) => {
        if (key === 'room_id') {
          next[key] = s[key] ? Number(s[key]) : null;
        } else if (key === 'is_handicapped' || key === 'is_orphan') {
          next[key] = !!s[key];
        } else if (key === 'date_of_birth' || key === 'admission_date') {
          next[key] = asDate(s[key]);
        } else {
          next[key] = asText(s[key]);
        }
      });

      if (!next.student_type) next.student_type = 'hostel';

      const normalizeVisitor = (v: any) => {
        const out: any = { ...EMPTY_VISITOR };
        if (!v) return out;

        Object.keys(out).forEach((key) => {
          out[key] = asText(v[key]);
        });

        if (!out.address_source) out.address_source = 'custom';
        return out;
      };

      setEditingId(s.id);
      setForm(next);
      setVisitor1(normalizeVisitor(s.visitor1));
      setVisitor2(normalizeVisitor(s.visitor2));
      setScreen('entry');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteStudent = (student: any) => {
    const deactivate = async () => {
      try {
        await api(`/api/students/${student.id}`, { method: 'DELETE' });
        if (editingId === student.id) clearForm();
        await loadStudents();
      } catch (e: any) { Alert.alert('Error', e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Mark ${student.student_name} as Dropout? The student will be removed from the active list.`)) void deactivate();
      return;
    }
    Alert.alert(
      'Mark as Dropout',
      `Remove ${student.student_name} from the active list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Dropout',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/api/students/${student.id}`, {
                method: 'DELETE',
              });

              if (editingId === student.id) clearForm();
              await loadStudents();
              Alert.alert('Deleted', 'Student removed from active list');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const copyPresentToPermanent = () => {
    setForm((old: any) => ({
      ...old,
      permanent_village: old.present_village,
      permanent_police_station: old.present_police_station,
      permanent_pin_code: old.present_pin_code,
      permanent_post_office: old.present_post_office,
      permanent_block: old.present_block,
      permanent_district: old.present_district,
      permanent_state: old.present_state,
    }));
  };

  const copyAddressToVisitor = (
    no: 1 | 2,
    source: 'present' | 'permanent'
  ) => {
    const prefix = source === 'present' ? 'present_' : 'permanent_';

    const data = {
      village: form[`${prefix}village`],
      police_station: form[`${prefix}police_station`],
      pin_code: form[`${prefix}pin_code`],
      post_office: form[`${prefix}post_office`],
      block: form[`${prefix}block`],
      district: form[`${prefix}district`],
      state: form[`${prefix}state`],
      address_source: source,
    };

    const setter = no === 1 ? setVisitor1 : setVisitor2;
    setter((old: any) => ({ ...old, ...data }));
  };

  const dobPickerValue = () => {
    if (form.date_of_birth) {
      const parts = String(form.date_of_birth).split('-');
      if (parts.length === 3) {
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = Number(parts[2]);

        if (y && m && d) {
          return new Date(y, m - 1, d);
        }
      }
    }

    return new Date(2010, 0, 1);
  };

  const onDobChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDobPicker(false);
    }

    if (!selectedDate) return;

    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');

    update('date_of_birth', `${y}-${m}-${d}`);
  };

  const renderVisitor = (no: 1 | 2, title: string, visitor: any) => (
    <View>
      <SectionTitle>{title}</SectionTitle>

      <LabeledField
        label="Name"
        value={visitor.visitor_name}
        onChangeText={(v: string) => updateVisitor(no, 'visitor_name', v)}
      />
      <LabeledField
        label="Relation"
        value={visitor.relation}
        onChangeText={(v: string) => updateVisitor(no, 'relation', v)}
      />
      <LabeledField
        label="Mobile Number"
        value={visitor.mobile_number}
        onChangeText={(v: string) => updateVisitor(no, 'mobile_number', v)}
      />
      <LabeledField
        label="Email ID"
        value={visitor.email}
        onChangeText={(v: string) => updateVisitor(no, 'email', v)}
      />

      <Text style={styles.label}>Address source</Text>
      <View style={styles.options}>
        {choice(
          'Present Address',
          visitor.address_source === 'present',
          () => copyAddressToVisitor(no, 'present')
        )}
        {choice(
          'Permanent Address',
          visitor.address_source === 'permanent',
          () => copyAddressToVisitor(no, 'permanent')
        )}
        {choice(
          'Custom',
          visitor.address_source === 'custom',
          () => updateVisitor(no, 'address_source', 'custom')
        )}
      </View>

      <LabeledField
        label="Village"
        value={visitor.village}
        onChangeText={(v: string) => updateVisitor(no, 'village', v)}
      />
      <LabeledField
        label="Police Station"
        value={visitor.police_station}
        onChangeText={(v: string) => updateVisitor(no, 'police_station', v)}
      />
      <LabeledField
        label="PIN Code"
        value={visitor.pin_code}
        onChangeText={(v: string) => updateVisitor(no, 'pin_code', v)}
      />
      <LabeledField
        label="Post Office"
        value={visitor.post_office}
        onChangeText={(v: string) => updateVisitor(no, 'post_office', v)}
      />
      <LabeledField
        label="Block"
        value={visitor.block}
        onChangeText={(v: string) => updateVisitor(no, 'block', v)}
      />
      <LabeledField
        label="District"
        value={visitor.district}
        onChangeText={(v: string) => updateVisitor(no, 'district', v)}
      />
      <LabeledField
        label="State"
        value={visitor.state}
        onChangeText={(v: string) => updateVisitor(no, 'state', v)}
      />
    </View>
  );

  if (screen === 'details') {
    return <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AcademyHeader />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <H1>Students</H1>
          <Button title="Student Menu" onPress={() => setMenuOpen(true)} />
        </View>
        <View style={styles.transferCard}>
          <Text style={styles.transferTitle}>Student Data Excel</Text>
          <Text style={styles.transferHelp}>Download student records or a template. Upload an Excel file to preview changes before importing.</Text>
          <View style={styles.transferActions}>{transferButton('Download Students (.xlsx)', () => downloadStudentsExcel(false))}{transferButton('Download Template', () => downloadStudentsExcel(true))}{transferButton('Choose Excel & Preview', chooseStudentsExcel)}</View>
          {excelPreview && <View style={styles.transferPreview}><Text style={styles.transferHelp}>{excelFile?.name}: {excelPreview.created} new, {excelPreview.updated} to update, {excelPreview.errors.length} errors</Text>{excelPreview.errors.map((item: any, index: number) => <Text key={index} style={styles.transferError}>Row {item.row || '—'}: {item.message}</Text>)}{transferButton(`Import ${excelPreview.total} Students`, importStudentsExcel, !!excelPreview.errors.length)}</View>}
        </View>
<View style={styles.transferCard}>
          <Text style={styles.transferTitle}>Bulk Student Photos</Text>
          <Text style={styles.transferHelp}>Name each JPG, PNG or WebP image with the student's registration number, such as 75276.jpg. Up to 100 photos can be selected; they upload in batches of 10.</Text>
          {transferButton('Choose Photos', chooseStudentPhotos)}
          {!!photoFiles.length && <><Text style={styles.transferHelp}>{photoFiles.length} selected: {photoFiles.map(file => file.name).join(', ')}</Text>{transferButton(`Upload ${photoFiles.length} Photos`, uploadStudentPhotos)}</>}
          {photoResults.map((result, index) => <Text key={index} style={result.success ? styles.transferSuccess : styles.transferError}>{result.file}: {result.success ? 'Uploaded' : result.message}</Text>)}
        </View>
        {!!transferBusy && <View style={styles.transferNotice}><ActivityIndicator /><Text>{transferBusy}</Text></View>}
        {!!transferError && <Text accessibilityRole="alert" style={styles.transferError}>{transferError}</Text>}
        {!!transferMessage && <Text accessibilityRole="alert" style={styles.transferSuccess}>{transferMessage}</Text>}
        <StudentDirectory students={students} loading={listLoading} error={listError} onRefresh={loadStudents} onEdit={startEdit} onDeactivate={deleteStudent} />
      </ScrollView>
      <StudentMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onSelect={key => {
        setMenuOpen(false);
        if (key === 'entry') { clearForm(); setScreen('entry'); }
        if (key === 'behavior') router.push('/behavior');
        if (key === 'passwords') router.push('/guardians');
      }} />
    </SafeAreaView>;
  }

  return (
    <StudentFormContext.Provider value={{ form, update }}>
      <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Button title="â† Back to Student Details" onPress={() => { clearForm(); setScreen('details'); }} />
        <H1>{editingId !== null ? 'Edit Student' : 'Student Entry'}</H1>

        {editingId !== null && (
          <Text style={styles.editing}>Editing Student</Text>
        )}

        <SectionTitle>Student Necessary Details</SectionTitle>

        <LabeledField label="Registration No *" field="registration_no" />
        <LabeledField label="Monthly Fees" field="monthly_fees" />
        <LabeledField label="Student Name *" field="student_name" />
        <LabeledField label="Mobile Number" field="mobile_number" />
        <LabeledField label="Admission No" field="admission_no" />
        <LabeledField
          label="Admission Date YYYY-MM-DD"
          field="admission_date"
        />
        <LabeledField label="WhatsApp Number" field="whatsapp_number" />
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Class Name</Text>
          <Select
            label="Class Name"
            value={normalizeStudentClass(form.class_name)}
            onChange={value => update('class_name', value)}
            options={[
              { value: '', label: 'Select Class' },
              ...[...new Set([...STUDENT_CLASSES, ...(form.class_name ? [normalizeStudentClass(form.class_name)] : [])])]
                .filter(isVisibleStudentClass).map(value => ({ value, label: value })),
            ]}
          />
        </View>
        <LabeledField label="Roll No" field="roll_no" />
        <LabeledField label="Email ID" field="email" />
        <LabeledField label="Session From" field="session_from" />
        <LabeledField label="Session To" field="session_to" />

        <Text style={styles.label}>Room No</Text>
        <View style={styles.options}>
          {rooms.map((room) =>
            choice(
              room.room_name,
              form.room_id === Number(room.id),
              () => update('room_id', Number(room.id))
            )
          )}
        </View>

        <Text style={styles.label}>Student Type</Text>
        <View style={styles.options}>
          {choice(
            'Hostel',
            form.student_type === 'hostel',
            () => update('student_type', 'hostel')
          )}
          {choice(
            'Day Scholar',
            form.student_type === 'day_scholar',
            () => update('student_type', 'day_scholar')
          )}
        </View>

        <SectionTitle>Student Information</SectionTitle>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Date of Birth</Text>

          <TouchableOpacity
            style={styles.dateBox}
            onPress={() => setShowDobPicker(true)}
          >
            <Text
              style={
                form.date_of_birth
                  ? styles.dateText
                  : styles.datePlaceholder
              }
            >
              {form.date_of_birth || 'Select Date of Birth'}
            </Text>
          </TouchableOpacity>

          {showDobPicker && (
            <DateTimePicker
              value={dobPickerValue()}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={onDobChange}
            />
          )}
        </View>

        <Text style={styles.label}>Gender</Text>
        <View style={styles.options}>
          {['Male', 'Female', 'Other'].map((item) =>
            choice(
              item,
              form.gender === item,
              () => update('gender', item)
            )
          )}
        </View>

        <LabeledField label="Aadhaar No" field="aadhaar_no" />
        <LabeledField label="Caste Name" field="caste_name" />
        <LabeledField label="Blood Group" field="blood_group" />
        <LabeledField
          label="Admitted School Name"
          field="admitted_school_name"
        />
        <LabeledField label="Stream" field="stream" />

        <Text style={styles.label}>Handicapped</Text>
        <View style={styles.options}>
          {choice(
            'Yes',
            form.is_handicapped === true,
            () => update('is_handicapped', true)
          )}
          {choice(
            'No',
            form.is_handicapped === false,
            () => update('is_handicapped', false)
          )}
        </View>

        <Text style={styles.label}>Orphan</Text>
        <View style={styles.options}>
          {choice(
            'Yes',
            form.is_orphan === true,
            () => update('is_orphan', true)
          )}
          {choice(
            'No',
            form.is_orphan === false,
            () => update('is_orphan', false)
          )}
        </View>

        <LabeledField
          label="Previous Branch Name"
          field="previous_branch_name"
        />
        <LabeledField
          label="Banglarshiksha ID"
          field="banglarshiksha_id"
        />
        <LabeledField label="Kanyashree ID" field="kanyashree_id" />
        <LabeledField label="Aikyashree ID" field="aikyashree_id" />

        <SectionTitle>Parents Information</SectionTitle>

        <LabeledField label="Father Name" field="father_name" />
        <LabeledField
          label="Father Aadhaar No"
          field="father_aadhaar_no"
        />
        <LabeledField
          label="Father Qualification"
          field="father_qualification"
        />
        <LabeledField
          label="Father Occupation"
          field="father_occupation"
        />
        <LabeledField
          label="Father Annual Income"
          field="father_annual_income"
        />
        <LabeledField label="Father Mobile No" field="father_mobile" />

        <LabeledField label="Mother Name" field="mother_name" />
        <LabeledField
          label="Mother Aadhaar No"
          field="mother_aadhaar_no"
        />
        <LabeledField
          label="Mother Qualification"
          field="mother_qualification"
        />
        <LabeledField
          label="Mother Occupation"
          field="mother_occupation"
        />
        <LabeledField
          label="Mother Annual Income"
          field="mother_annual_income"
        />
        <LabeledField label="Mother Mobile No" field="mother_mobile" />

        <LabeledField label="Guardian Name" field="guardian_name" />
        <LabeledField label="Guardian Mobile" field="guardian_mobile" />
        <LabeledField label="Alternate Mobile" field="alternate_mobile" />

        <SectionTitle>Address Details</SectionTitle>

        <Text style={styles.subSection}>Present Address</Text>

        <LabeledField label="Village" field="present_village" />
        <LabeledField
          label="Police Station"
          field="present_police_station"
        />
        <LabeledField label="PIN Code" field="present_pin_code" />
        <LabeledField label="Post Office" field="present_post_office" />
        <LabeledField label="Block" field="present_block" />
        <LabeledField label="District" field="present_district" />
        <LabeledField label="State" field="present_state" />

        <Text style={styles.subSection}>Permanent Address</Text>

        <TouchableOpacity
          style={styles.copyButton}
          onPress={copyPresentToPermanent}
        >
          <Text style={styles.copyButtonText}>
            Same as Present Address
          </Text>
        </TouchableOpacity>

        <LabeledField label="Village" field="permanent_village" />
        <LabeledField
          label="Police Station"
          field="permanent_police_station"
        />
        <LabeledField label="PIN Code" field="permanent_pin_code" />
        <LabeledField
          label="Post Office"
          field="permanent_post_office"
        />
        <LabeledField label="Block" field="permanent_block" />
        <LabeledField label="District" field="permanent_district" />
        <LabeledField label="State" field="permanent_state" />

        <SectionTitle>Student Account Details</SectionTitle>

        <LabeledField label="Account No" field="bank_account_no" />
        <LabeledField label="Bank Name" field="bank_name" />
        <LabeledField label="IFSC Code" field="bank_ifsc_code" />
        <LabeledField label="Branch Name" field="bank_branch_name" />
        <LabeledField
          label="Branch Address"
          field="bank_branch_address"
        />

        {renderVisitor(1, 'Visitor-1 Information', visitor1)}
        {renderVisitor(2, 'Visitor-2 Information', visitor2)}

        <View style={styles.saveArea}>
          <Button
            title={
              editingId !== null
                ? 'Update Student'
                : 'Add Student'
            }
            onPress={saveStudent}
          />

          {editingId !== null && (
            <TouchableOpacity
              style={styles.cancel}
              onPress={() => { clearForm(); setScreen('details'); }}
            >
              <Text style={styles.cancelText}>Cancel Edit</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
      </SafeAreaView>
    </StudentFormContext.Provider>
  );
}

const styles = StyleSheet.create({
  transferCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: '#dce4eb' },
  transferTitle: { fontSize: 17, fontWeight: '800', color: '#163451', marginBottom: 8 },
  transferHelp: { color: '#475569', lineHeight: 21, marginBottom: 10 },
  transferActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  transferButton: { paddingVertical: 11, paddingHorizontal: 14, minHeight: 42, backgroundColor: '#1565c0', borderRadius: 8, marginVertical: 4 },
  transferButtonText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  transferButtonDisabled: { opacity: 0.45 },
  transferPreview: { backgroundColor: '#eff6ff', padding: 12, marginTop: 10, borderRadius: 9 },
  transferNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#dbeafe', marginBottom: 10 },
  transferError: { color: '#b91c1c', marginVertical: 6, lineHeight: 20 },
  transferSuccess: { color: '#166534', marginVertical: 6, lineHeight: 20 },
  container: {
    flex: 1,
    backgroundColor: '#f3f6f9',
  },

  content: {
    padding: 14,
    paddingBottom: 60,
  },

  editing: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },

  sectionHeader: {
    backgroundColor: '#d7d7d7',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 7,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginTop: 18,
    marginBottom: 12,
  },

  sectionHeaderText: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: '#111',
  },

  subSection: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 8,
  },

  fieldWrap: {
    marginBottom: 2,
  },

  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
    marginBottom: 4,
  },

  label: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 8,
  },

  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },

  option: {
    borderWidth: 1,
    borderColor: '#aaa',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fff',
  },

  selectedOption: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },

  optionText: {
    color: '#222',
    fontWeight: '600',
  },

  selectedText: {
    color: '#fff',
    fontWeight: '700',
  },

  copyButton: {
    borderWidth: 1,
    borderColor: '#1565c0',
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },

  copyButtonText: {
    color: '#1565c0',
    textAlign: 'center',
    fontWeight: '800',
  },

  dateBox: {
    minHeight: 54,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: 10,
  },

  dateText: {
    fontSize: 16,
    color: '#222',
  },

  datePlaceholder: {
    fontSize: 16,
    color: '#888',
  },

  saveArea: {
    marginTop: 24,
  },

  cancel: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#777',
    borderRadius: 9,
    marginTop: 7,
  },

  cancelText: {
    textAlign: 'center',
    fontWeight: '700',
  },

  listTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 32,
    marginBottom: 12,
  },

  studentName: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 5,
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },

  edit: {
    flex: 1,
    backgroundColor: '#1565c0',
    paddingVertical: 11,
    borderRadius: 9,
  },

  delete: {
    flex: 1,
    backgroundColor: '#c62828',
    paddingVertical: 11,
    borderRadius: 9,
  },

  actionText: {
    textAlign: 'center',
    color: '#fff',
    fontWeight: '700',
  },
});
