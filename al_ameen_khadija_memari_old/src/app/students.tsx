import React, { useEffect, useState } from 'react';
import AcademyHeader from '../components/AcademyHeader';
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
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import { File as ExpoFile } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { router } from 'expo-router';
import StudentDirectory, { Select } from '../components/StudentDirectory';
import { STUDENT_CLASSES, isVisibleStudentClass } from '../lib/studentClasses';
import StudentMenu from '../components/StudentMenu';
import DatePickerField from '../components/DatePickerField';
import { normalizeStudentClass } from '../lib/studentDirectory';

import { api, API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';
import {
  Field,
  Button,
  H1,
} from '../components/ui';

const StudentFormContext = React.createContext<any>(null);
const PARENT_QUALIFICATIONS=['Illiterate','Primary','Madhyamik','Higher Secondary','ITI','Diploma','Graduate','Post Graduate','Other'];
const PARENT_OCCUPATIONS=['Farmer','Business','Daily Labourer','Private Service','Government Service','Teacher','Driver','Mason','Carpenter','Housewife','Unemployed','Other'];

const STUDENT_DOCUMENT_TYPES = [
  { key: 'birth_certificate', label: 'Date of Birth Certificate' },
  { key: 'aadhaar', label: 'Aadhaar Card' },
  { key: 'mp_admit', label: 'MP Admit' },
  { key: 'mp_marksheet', label: 'MP Marksheet' },
  { key: 'bank_passbook', label: 'Bank Passbook' },
  { key: 'obc_certificate', label: 'OBC Certificate' },
  { key: 'ph_certificate', label: 'PH Certificate' },
  { key: 'xi_registration', label: 'XI Registration' },
  { key: 'xi_admission_slip', label: 'XI Admission Slip' },
  { key: 'xi_marksheet', label: 'XI Marksheet' },
  { key: 'hs_admit_3rd', label: 'HS Admit 3rd Semester' },
  { key: 'hs_admit_4th', label: 'HS Admit 4th Semester' },
  { key: 'hs_marksheet', label: 'HS Marksheet' },
  { key: 'hs_certificate', label: 'HS Certificate' },
  { key: 'admission_slip', label: 'Admission Slip' },
  { key: 'signature', label: 'Signature' },
  { key: 'transfer_certificate', label: 'T.C.' },
  { key: 'other', label: 'Others' },
  { key: 'other_2', label: 'Others-2' },
  { key: 'other_3', label: 'Others-3' },
];

const LabeledField = ({
  label,
  field,
  value,
  onChangeText,
  ...inputProps
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
        {...inputProps}
      />
    </View>
  );
};


const DigitField = ({ label, field, value, onChangeText, length }: any) => {
  const ctx = React.useContext(StudentFormContext);
  const current = String(value !== undefined ? value : ctx?.form?.[field] ?? '');
  const valid = current.length === length;
  const touched = current.length > 0;
  const change = onChangeText || ((next: string) => ctx?.update?.(field, next));
  return <View>
    <LabeledField label={label} field={field} value={value} keyboardType="numeric" maxLength={length}
      onChangeText={(next: string) => change(next.replace(/\D/g, '').slice(0, length))}
      style={touched ? { borderColor: valid ? '#16803a' : '#d92d20', borderWidth: 2 } : undefined} />
    {touched && <Text style={{ color: valid ? '#16803a' : '#d92d20', fontWeight: '700', marginTop: -7, marginBottom: 9 }}>
      {valid ? 'Valid' : current.length + '/' + length + ' digits'}
    </Text>}
  </View>;
};

const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SESSION_OPTIONS = Array.from({ length: 25 }, (_, index) => 2026 + index).flatMap(year => [year + '-' + year, year + '-' + (year + 1)]);

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
  room_number: '',

  admission_date: '',
  session_from: '',
  session_to: '',
  academic_session: '',
  monthly_fees: '',
  mobile_number: '',
  whatsapp_number: '',
  email: '',
  student_type: 'hostel',

  date_of_birth: '',
  gender: 'Female',
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

export default function Students() {
  const [students, setStudents] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [screen, setScreen] = useState<'details' | 'entry'>('details');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [entryDocuments, setEntryDocuments] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [exitForm,setExitForm]=useState({dropout_date:new Date().toISOString().slice(0,10),dropout_reason:''});
  const [exitClearance,setExitClearance]=useState<any>(null);
  const [exitBusy,setExitBusy]=useState(false);
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [ifscMessage, setIfscMessage] = useState('');


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


  const lookupPin = async (field: 'present_pin_code'|'permanent_pin_code', value: string) => {
    const pin=String(value||'').replace(/\D/g,'').slice(0,6); update(field,pin);
    if(pin.length!==6)return;
    try { const response=await fetch('https://api.postalpincode.in/pincode/'+pin); const data=await response.json(); const offices=data?.[0]?.PostOffice||[]; if(!offices.length)return; const office=offices[0]; const prefix=field.startsWith('present')?'present_':'permanent_'; setForm((old:any)=>({...old,[field]:pin,[prefix+'post_office']:office.Name||old[prefix+'post_office'],[prefix+'block']:office.Block||old[prefix+'block'],[prefix+'police_station']:office.Block||old[prefix+'police_station'],[prefix+'district']:office.District||old[prefix+'district'],[prefix+'state']:office.State||old[prefix+'state']})); } catch {}
  };

  useEffect(() => {
    if (!sameAsPresent) return;
    setForm((old: any) => ({ ...old, permanent_village: old.present_village, permanent_police_station: old.present_police_station, permanent_pin_code: old.present_pin_code, permanent_post_office: old.present_post_office, permanent_block: old.present_block, permanent_district: old.present_district, permanent_state: old.present_state }));
  }, [sameAsPresent, form.present_village, form.present_police_station, form.present_pin_code, form.present_post_office, form.present_block, form.present_district, form.present_state]);

  useEffect(() => {
    const ifsc = String(form.bank_ifsc_code || '').trim().toUpperCase();
    if (ifsc.length !== 11) { setIfscMessage(ifsc ? 'IFSC must be 11 characters' : ''); return; }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { setIfscMessage('Invalid IFSC format'); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIfscMessage('Finding bank...');
      try { const data = await api('/api/students/bank/ifsc/' + encodeURIComponent(ifsc)); if (!cancelled) { setForm((old: any) => ({ ...old, bank_ifsc_code: ifsc, bank_name: data.bank_name || old.bank_name, bank_branch_name: data.branch_name || old.bank_branch_name, bank_branch_address: data.branch_address || old.bank_branch_address })); setIfscMessage('Bank details found. You may edit them manually.'); } }
      catch (error: any) { if (!cancelled) setIfscMessage(error.message || 'Bank not found; enter details manually'); }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.bank_ifsc_code]);

  const clearForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setVisitor1({ ...EMPTY_VISITOR });
    setVisitor2({ ...EMPTY_VISITOR });
    setEntryDocuments({});
    setExitClearance(null);
    setSameAsPresent(false);
    setIfscMessage('');
    setExitForm({dropout_date:new Date().toISOString().slice(0,10),dropout_reason:''});
  };

  const chooseEntryDocument = async (documentType: string) => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    setEntryDocuments((old) => ({ ...old, [documentType]: picked.assets[0] }));
  };

  const appendEntryFile = async (fd: FormData, asset: any) => {
    if (Platform.OS === 'web') {
      if (asset.file) {
        fd.append('file', asset.file, asset.name);
        return;
      }
      const response = await fetch(asset.uri);
      fd.append('file', await response.blob(), asset.name);
      return;
    }
    const nativeFile = new ExpoFile(asset.uri);
    fd.append('file', nativeFile as any);
  };

  const uploadEntryDocuments = async (studentId: number) => {
    const selections = Object.entries(entryDocuments);
    if (!selections.length) return 0;

    const current = await api('/api/documents/student/' + studentId);
    const existingDocuments = current.documents || [];
    const token = await getToken();

    for (const [documentType, asset] of selections) {
      const selectedAsset: any = asset;
      const definition = STUDENT_DOCUMENT_TYPES.find((item) => item.key === documentType);
      const existing = existingDocuments.find((item: any) => item.document_type === documentType || (documentType === 'hs_admit_3rd' && item.document_type === 'hs_admit'));
      const fd = new FormData();
      fd.append('document_title', definition?.label || selectedAsset.name);
      if (!existing) {
        fd.append('document_type', documentType);
        fd.append('guardian_visible', 'true');
        fd.append('guardian_download_allowed', 'true');
      }
      await appendEntryFile(fd, selectedAsset);

      const url = existing
        ? API_BASE + '/api/documents/' + existing.id + '/replace'
        : API_BASE + '/api/documents/student/' + studentId;
      const request = {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd,
      };
      const response = Platform.OS === 'web'
        ? await fetch(url, request as any)
        : await expoFetch(url, request as any);
      if (!response.ok) {
        let message = 'Document upload failed';
        try {
          const data: any = await response.json();
          message = data.message || message;
        } catch {}
        throw new Error(message);
      }
    }
    return selections.length;
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
    if (saving) return;
    if (!form.registration_no.trim()) {
      Alert.alert('Required', 'Registration Number is required');
      return;
    }

    if (!form.student_name.trim()) {
      Alert.alert('Required', 'Student Name is required');
      return;
    }
    const requiredFields = [
      ['Admission Date', form.admission_date], ['Class', form.class_name], ['Admission Session', form.academic_session],
      ['Date of Birth', form.date_of_birth], ['Father Name', form.father_name], ['Mother Name', form.mother_name],
      ['Present Village', form.present_village], ['Present Police Station', form.present_police_station], ['Present PIN Code', form.present_pin_code],
      ['Present Post Office', form.present_post_office], ['Present Block', form.present_block], ['Present District', form.present_district], ['Present State', form.present_state],
      ['Permanent Village', form.permanent_village], ['Permanent Police Station', form.permanent_police_station], ['Permanent PIN Code', form.permanent_pin_code],
      ['Permanent Post Office', form.permanent_post_office], ['Permanent Block', form.permanent_block], ['Permanent District', form.permanent_district], ['Permanent State', form.permanent_state],
    ].filter(([, value]) => !String(value || '').trim());
    if (requiredFields.length) {
      Alert.alert('Required', 'Complete these mandatory fields:\n' + requiredFields.map(([label]) => '• ' + label).join('\n'));
      return;
    }
    const invalidAadhaar = [['Student Aadhaar', form.aadhaar_no], ['Father Aadhaar', form.father_aadhaar_no], ['Mother Aadhaar', form.mother_aadhaar_no]].find(([, value]) => value && String(value).length !== 12);
    if (invalidAadhaar) { Alert.alert('Invalid Aadhaar', invalidAadhaar[0] + ' number must be exactly 12 digits.'); return; }
    const invalidMobile = [['Student Mobile', form.mobile_number], ['WhatsApp', form.whatsapp_number], ['Father Mobile', form.father_mobile], ['Mother Mobile', form.mother_mobile], ['Guardian Mobile', form.guardian_mobile], ['Alternate Mobile', form.alternate_mobile], ['Visitor-1 Mobile', visitor1.mobile_number], ['Visitor-2 Mobile', visitor2.mobile_number]].find(([, value]) => value && String(value).length !== 10);
    if (invalidMobile) { Alert.alert('Invalid Mobile Number', invalidMobile[0] + ' must be exactly 10 digits.'); return; }
    const sessionMatch=String(form.academic_session||'').trim().match(/^(\d{4})-(\d{4})$/);
    if(!sessionMatch){Alert.alert('Invalid Session','Use session format 2026-2026 or 2026-2027.');return;}

    const normalizedRegistration = form.registration_no.trim().toLowerCase();
    const duplicateRegistration = students.some((student) =>
      student.id !== editingId &&
      String(student.registration_no || '').trim().toLowerCase() === normalizedRegistration
    );

    if (duplicateRegistration) {
      Alert.alert('Duplicate Registration', 'This Registration Number already exists.');
      return;
    }

    setSaving(true);
    let studentSaved = false;
    try {
      const { room_number, ...studentFields } = form;
      const selectedRoom = rooms.find((room) => String(room.room_name) === String(room_number));
      const body = {
        ...studentFields,
        session_from:sessionMatch[1],
        session_to:sessionMatch[2],
        registration_no: form.registration_no.trim(),
        room_id: selectedRoom?.id || null,
        visitor1,
        visitor2,
      };

      let studentId: number;
      if (editingId !== null) {
        await api('/api/students/' + editingId, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        studentId = Number(editingId);
      } else {
        const created = await api('/api/students', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        studentId = Number(created.student.id);
      }
      studentSaved = true;

      const uploaded = await uploadEntryDocuments(studentId);
      Alert.alert(
        'Success',
        (editingId !== null ? 'Student updated successfully' : 'Student added successfully') +
          (uploaded ? ' with ' + uploaded + ' document(s).' : '.')
      );

      clearForm();
      setScreen('details');
      await loadStudents();
    } catch (e: any) {
      Alert.alert(
        studentSaved ? 'Student saved' : 'Error',
        studentSaved
          ? 'Student data was saved, but document upload failed: ' + e.message
          : e.message
      );
      if (studentSaved) await loadStudents();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = async (student: any) => {
    try {
      const data = await api(`/api/students/${student.id}`);
      const s = data.student;
      const next: any = { ...EMPTY_FORM };

      Object.keys(next).forEach((key) => {
        if (key === 'room_number') {
          next[key] = s.room_name || '';
        } else if (key === 'is_handicapped' || key === 'is_orphan') {
          next[key] = !!s[key];
        } else if (key === 'date_of_birth' || key === 'admission_date') {
          next[key] = asDate(s[key]);
        } else {
          next[key] = asText(s[key]);
        }
      });

      if (!next.student_type) next.student_type = 'hostel';
      if (!next.gender) next.gender = 'Female';

      const normalizeVisitor = (v: any) => {
        const out: any = { ...EMPTY_VISITOR };
        if (!v) return out;

        Object.keys(out).forEach((key) => {
          out[key] = asText(v[key]);
        });

        if (!out.address_source) out.address_source = 'custom';
        return out;
      };

      next.academic_session=s.session_from&&s.session_to?String(s.session_from)+'-'+String(s.session_to):'';
      setEditingId(s.id);
      setForm(next);
      setExitBusy(true);
      try{const clearance=await api('/api/students/'+s.id+'/exit-clearance');setExitClearance(clearance);if(clearance.exit)setExitForm({dropout_date:String(clearance.exit.dropout_date).slice(0,10),dropout_reason:clearance.exit.dropout_reason||''});}catch{}finally{setExitBusy(false)};
      setVisitor1(normalizeVisitor(s.visitor1));
      setVisitor2(normalizeVisitor(s.visitor2));
      setScreen('entry');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteStudent = (student: any) => {Alert.alert('Dropout','Open Student Edit and complete Dropout Date and Reason.');void startEdit(student);};

  const refreshExitClearance=async(id=editingId)=>{if(!id)return;setExitBusy(true);try{setExitClearance(await api('/api/students/'+id+'/exit-clearance'))}catch(e:any){Alert.alert('Clearance',e.message)}finally{setExitBusy(false)}};
  const saveDropout=async()=>{if(!editingId)return;if(!exitForm.dropout_date||!exitForm.dropout_reason.trim())return Alert.alert('Required','Dropout date and reason are required.');setExitBusy(true);try{await api('/api/students/'+editingId+'/dropout',{method:'POST',body:JSON.stringify(exitForm)});await refreshExitClearance(editingId);await loadStudents();Alert.alert('Saved','Student marked as Dropout.')}catch(e:any){Alert.alert('Dropout',e.message)}finally{setExitBusy(false)}};
  const issueAndPrintTc=async()=>{if(!editingId)return;setExitBusy(true);try{const d=await api('/api/students/'+editingId+'/transfer-certificate',{method:'POST'});setExitClearance(d);const st=d.student,ex=d.exit,session=[st.session_from,st.session_to].filter(Boolean).join('-'),monthly=Number(d.monthly_fee_due_total||0);const html=`<style>@page{size:A4;margin:18mm}body{font:15px Georgia,serif;color:#111}.sheet{border:2px solid #174c36;padding:28px;min-height:245mm}header{text-align:center;border-bottom:2px solid #174c36;padding-bottom:14px}h1{margin:6px;font-size:24px}h2{text-align:center;text-decoration:underline;margin:34px 0}.row{display:grid;grid-template-columns:190px 1fr;border-bottom:1px dotted #777;padding:10px 0}.note{margin-top:25px;padding:12px;border:1px solid #999}.sign{display:flex;justify-content:space-between;margin-top:70px}</style><div class="sheet"><header><h1>Al-Ameen Mission Academy Memari</h1><div>Memari, Purba Bardhaman - 713146</div></header><h2>TRANSFER CERTIFICATE</h2><div class="row"><b>Student Name</b><span>${st.student_name}</span></div><div class="row"><b>Registration No.</b><span>${st.registration_no}</span></div><div class="row"><b>Class</b><span>${st.class_name||'-'}</span></div><div class="row"><b>Academic Session</b><span>${session||'-'}</span></div><div class="row"><b>Guardian Name</b><span>${st.guardian_name||st.father_name||'-'}</span></div><div class="row"><b>Dropout Date</b><span>${String(ex.dropout_date).slice(0,10)}</span></div><div class="row"><b>Reason</b><span>${ex.dropout_reason}</span></div><div class="note"><b>Monthly Fees Due:</b> ${monthly>0?'Rs. '+monthly.toFixed(2):'No due'}${monthly>0?'<br/>The outstanding monthly fees remain payable.':''}</div><div class="sign"><span>Prepared By</span><span>Guardian</span><span>Principal / Administrator</span></div></div>`;await Print.printAsync({html});}catch(e:any){Alert.alert('TC cannot be issued',e.message)}finally{setExitBusy(false)}};

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
      <DigitField label="Mobile Number" value={visitor.mobile_number} length={10} onChangeText={(v: string) => updateVisitor(no, 'mobile_number', v)} />
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
        <StudentDirectory students={students} loading={listLoading} error={listError} onRefresh={loadStudents} onEdit={startEdit} onDeactivate={deleteStudent} />
      </ScrollView>
      <StudentMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onSelect={key => {
        setMenuOpen(false);
        if (key === 'entry') { clearForm(); setScreen('entry'); }
        if (key === 'details') setScreen('details');
        if (key === 'forms') router.push('/id-cards');
        if (key === 'behavior') router.push('/behavior');
        if (key === 'attendance') router.push('/attendance');
        if (key === 'gatepass') router.push('/gate-pass');
        if (key === 'visit') router.push('/visits');
        if (key === 'lifecycle') router.push('/student-lifecycle');
        if (key === 'marks') router.push('/marks');
        if (key === 'documents') router.push('/documents');
        if (key === 'dues') router.push('/dues');
        if (key === 'passwords') router.push('/guardians');
        if (key === 'data') router.push('/student-transfer');
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
        <AcademyHeader />
        <Button title="Back to Student Details" onPress={() => { clearForm(); setScreen('details'); }} />
        <H1>{editingId !== null ? 'Edit Student' : 'Student Entry'}</H1>

        {editingId !== null && (
          <Text style={styles.editing}>Editing Student</Text>
        )}

        <SectionTitle>Student Necessary Details</SectionTitle>

        <LabeledField label="Registration No *" field="registration_no" />
        <LabeledField label="Monthly Fees" field="monthly_fees" />
        <LabeledField label="Student Name *" field="student_name" />
        <DigitField label="Mobile Number" field="mobile_number" length={10} onChangeText={(value:string)=>setForm((old:any)=>({...old,mobile_number:value,whatsapp_number:value,father_mobile:value}))} />
        <LabeledField label="Admission No" field="admission_no" />
        <DatePickerField label="Admission Date *" value={form.admission_date} onChange={v=>update('admission_date',v)} />
        <DigitField label="WhatsApp Number" field="whatsapp_number" length={10} />
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Class Name *</Text>
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
        <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Admission Session *</Text><Select label="Select Admission Session" value={form.academic_session} onChange={value => update('academic_session', value)} options={[{value:'',label:'Select Session'}, ...SESSION_OPTIONS.map(value => ({value,label:value}))]} /></View>

        <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Room No</Text><Select label="Select Room" value={form.room_number} onChange={value => update('room_number', value)} searchable options={[{value:'',label:'Select Room'}, ...rooms.map(room => ({value:String(room.room_name),label:String(room.room_name)}))]} /></View>

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

        <DatePickerField label="Date of Birth *" value={form.date_of_birth} onChange={value => update('date_of_birth', value)} />
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

        <DigitField label="Aadhaar No" field="aadhaar_no" length={12} />
        <LabeledField label="Caste Name" field="caste_name" />
        <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Blood Group</Text><Select label="Select Blood Group" value={form.blood_group} onChange={value => update('blood_group', value)} options={BLOOD_GROUPS.map(value => ({value,label:value || 'Select Blood Group'}))} /></View>
        <LabeledField label="Admitted School Name" field="admitted_school_name" />
        {!!form.admitted_school_name && <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:-5,marginBottom:10}}>{[...new Set(students.map(item => String(item.admitted_school_name || '').trim()).filter(Boolean))].filter(name => name.toLowerCase().includes(String(form.admitted_school_name).toLowerCase()) && name !== form.admitted_school_name).slice(0,6).map(name => <TouchableOpacity key={name} onPress={() => update('admitted_school_name', name)} style={{paddingHorizontal:10,paddingVertical:7,backgroundColor:'#e8f1fb',borderRadius:15}}><Text>{name}</Text></TouchableOpacity>)}</View>}
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

        <LabeledField label="Father Name *" field="father_name" />
        <DigitField label="Father Aadhaar No" field="father_aadhaar_no" length={12} />
        <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Father Qualification</Text><Select label="Select Qualification" value={form.father_qualification} onChange={value=>update('father_qualification',value)} options={PARENT_QUALIFICATIONS.map(value=>({value,label:value}))} searchable /></View>
        <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Father Occupation</Text><Select label="Select Occupation" value={form.father_occupation} onChange={value=>update('father_occupation',value)} options={PARENT_OCCUPATIONS.map(value=>({value,label:value}))} searchable /></View>
        <LabeledField
          label="Father Annual Income"
          field="father_annual_income"
        />
        <DigitField label="Father Mobile No" field="father_mobile" length={10} />

        <LabeledField label="Mother Name *" field="mother_name" />
        <DigitField label="Mother Aadhaar No" field="mother_aadhaar_no" length={12} />
        <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Mother Qualification</Text><Select label="Select Qualification" value={form.mother_qualification} onChange={value=>update('mother_qualification',value)} options={PARENT_QUALIFICATIONS.map(value=>({value,label:value}))} searchable /></View>
        <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Mother Occupation</Text><Select label="Select Occupation" value={form.mother_occupation} onChange={value=>update('mother_occupation',value)} options={PARENT_OCCUPATIONS.map(value=>({value,label:value}))} searchable /></View>
        <LabeledField
          label="Mother Annual Income"
          field="mother_annual_income"
        />
        <DigitField label="Mother Mobile No" field="mother_mobile" length={10} />

        <LabeledField label="Guardian Name" field="guardian_name" />
        <DigitField label="Guardian Mobile" field="guardian_mobile" length={10} />
        <DigitField label="Alternate Mobile" field="alternate_mobile" length={10} />

        <SectionTitle>Address Details</SectionTitle>

        <Text style={styles.subSection}>Present Address (All fields mandatory)</Text>

        <LabeledField label="Village" field="present_village" />
        <LabeledField
          label="Police Station"
          field="present_police_station"
        />
        <LabeledField label="PIN Code" field="present_pin_code" onChangeText={(value:string)=>lookupPin('present_pin_code',value)} keyboardType="number-pad" maxLength={6} />
        <LabeledField label="Post Office" field="present_post_office" />
        <LabeledField label="Block" field="present_block" />
        <LabeledField label="District" field="present_district" />
        <LabeledField label="State" field="present_state" />

        <Text style={styles.subSection}>Permanent Address (All fields mandatory)</Text>

        <TouchableOpacity style={styles.copyButton} onPress={() => { const next=!sameAsPresent; setSameAsPresent(next); if(next) copyPresentToPermanent(); }}><Text style={styles.copyButtonText}>{sameAsPresent ? '[x]' : '[ ]'} Same as Present Address</Text></TouchableOpacity>

        <LabeledField label="Village" field="permanent_village" />
        <LabeledField
          label="Police Station"
          field="permanent_police_station"
        />
        <LabeledField label="PIN Code" field="permanent_pin_code" onChangeText={(value:string)=>lookupPin('permanent_pin_code',value)} keyboardType="number-pad" maxLength={6} />
        <LabeledField
          label="Post Office"
          field="permanent_post_office"
        />
        <LabeledField label="Block" field="permanent_block" />
        <LabeledField label="District" field="permanent_district" />
        <LabeledField label="State" field="permanent_state" />

        <SectionTitle>Student Account Details</SectionTitle>

        <LabeledField label="Account No" field="bank_account_no" keyboardType="numeric" />
        <LabeledField label="IFSC Code" field="bank_ifsc_code" maxLength={11} autoCapitalize="characters" onChangeText={(value:string) => update('bank_ifsc_code', value.replace(/[^a-z0-9]/gi,'').toUpperCase().slice(0,11))} />
        {!!ifscMessage && <Text style={{color:ifscMessage.startsWith('Bank details found')?'#16803a':'#b54708',fontWeight:'700',marginTop:-7,marginBottom:9}}>{ifscMessage}</Text>}
        <LabeledField label="Bank Name (editable)" field="bank_name" />
        <LabeledField label="Branch Name (editable)" field="bank_branch_name" />
        <LabeledField
          label="Branch Address"
          field="bank_branch_address"
        />

        {renderVisitor(1, 'Visitor-1 Information', visitor1)}
        {renderVisitor(2, 'Visitor-2 Information', visitor2)}

        <SectionTitle>Student Documents (Optional)</SectionTitle>
        <Text style={styles.documentHint}>
          Select an image or PDF. It will upload when the student is saved.
        </Text>
        <View style={styles.documentGrid}>
          {STUDENT_DOCUMENT_TYPES.map((item) => {
            const selected = entryDocuments[item.key];
            return (
              <View key={item.key} style={styles.documentRow}>
                <View style={styles.documentTextArea}>
                  <Text style={styles.documentLabel}>{item.label}</Text>
                  <Text numberOfLines={1} style={styles.documentFileName}>
                    {selected ? selected.name : 'No file selected'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.documentButton}
                  onPress={() => chooseEntryDocument(item.key)}
                  disabled={saving}
                >
                  <Text style={styles.documentButtonText}>
                    {selected ? 'Change' : 'Choose'}
                  </Text>
                </TouchableOpacity>
                {selected && (
                  <TouchableOpacity
                    style={styles.documentRemove}
                    onPress={() => setEntryDocuments((old) => {
                      const next = { ...old };
                      delete next[item.key];
                      return next;
                    })}
                    disabled={saving}
                  >
                    <Text style={styles.documentRemoveText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {editingId !== null && <View style={styles.exitPanel}><SectionTitle>Dropout & Transfer Certificate</SectionTitle><DatePickerField label="Dropout Date" value={exitForm.dropout_date} onChange={v=>setExitForm(x=>({...x,dropout_date:v}))}/><LabeledField label="Reason for Dropout" value={exitForm.dropout_reason} onChangeText={(v:string)=>setExitForm(x=>({...x,dropout_reason:v}))}/><TouchableOpacity disabled={exitBusy} style={styles.clearanceButton} onPress={()=>refreshExitClearance()}><Text style={styles.actionText}>{exitBusy?'Checking...':'Check SDF, Library & Fees Clearance'}</Text></TouchableOpacity>{exitClearance&&<View style={styles.clearanceBox}><Text style={exitClearance.sdf_dues?.length?styles.blockedText:styles.clearText}>SDF: {exitClearance.sdf_dues?.length?'Due â€” TC blocked':'Clear'}</Text><Text style={exitClearance.library_dues?.length?styles.blockedText:styles.clearText}>Library Book: {exitClearance.library_dues?.length?'Due â€” TC blocked':'Clear'}</Text><Text style={styles.feeDueText}>Monthly Fees Due: â‚¹{Number(exitClearance.monthly_fee_due_total||0).toFixed(2)} (will be printed on TC)</Text></View>}<View style={styles.exitActions}><TouchableOpacity disabled={exitBusy} style={styles.dropoutButton} onPress={saveDropout}><Text style={styles.actionText}>Save Dropout</Text></TouchableOpacity><TouchableOpacity disabled={exitBusy||!exitClearance?.exit||exitClearance?.tc_blocked} style={[styles.tcButton,(exitBusy||!exitClearance?.exit||exitClearance?.tc_blocked)&&styles.disabledButton]} onPress={issueAndPrintTc}><Text style={styles.actionText}>Preview / Print TC Form</Text></TouchableOpacity></View></View>}

        <View style={styles.saveArea}>
          <Button
            title={
              editingId !== null
                ? 'Update Student'
                : 'Add Student'
            }
            onPress={saveStudent}
            disabled={saving}
          />
          {saving && (
            <Text style={styles.savingText}>Saving student and documents...</Text>
          )}

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

  exitPanel:{marginTop:20,padding:14,borderWidth:1,borderColor:'#e0a800',borderRadius:10,backgroundColor:'#fffaf0'},
  clearanceButton:{backgroundColor:'#1565c0',padding:11,borderRadius:8,marginVertical:8},
  clearanceBox:{padding:11,borderWidth:1,borderColor:'#d7e0e7',borderRadius:8,backgroundColor:'#fff'},
  blockedText:{color:'#c62828',fontWeight:'800',marginVertical:2},clearText:{color:'#198754',fontWeight:'800',marginVertical:2},feeDueText:{color:'#7c4a03',fontWeight:'700',marginTop:5},
  exitActions:{flexDirection:'row',gap:9,marginTop:10,flexWrap:'wrap'},dropoutButton:{flex:1,minWidth:150,backgroundColor:'#c62828',padding:12,borderRadius:8},tcButton:{flex:1,minWidth:190,backgroundColor:'#198754',padding:12,borderRadius:8},disabledButton:{opacity:.4},
  saveArea: {
    marginTop: 24,
  },

  documentHint: {
    color: '#546e7a',
    marginBottom: 10,
  },

  documentGrid: {
    gap: 8,
  },

  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#d7e0e7',
    borderRadius: 9,
    padding: 10,
    backgroundColor: '#fff',
  },

  documentTextArea: {
    flex: 1,
    minWidth: 0,
  },

  documentLabel: {
    fontWeight: '700',
    color: '#263238',
  },

  documentFileName: {
    color: '#607d8b',
    fontSize: 12,
    marginTop: 3,
  },

  documentButton: {
    backgroundColor: '#1565c0',
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },

  documentButtonText: {
    color: '#fff',
    fontWeight: '700',
  },

  documentRemove: {
    borderWidth: 1,
    borderColor: '#c62828',
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },

  documentRemoveText: {
    color: '#c62828',
    fontWeight: '700',
    fontSize: 12,
  },

  savingText: {
    textAlign: 'center',
    color: '#1565c0',
    fontWeight: '700',
    marginTop: 8,
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
