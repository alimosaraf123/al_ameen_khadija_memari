import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AcademyHeader from '../components/AcademyHeader';
import { Select } from '../components/StudentDirectory';
import { STUDENT_CLASSES } from '../lib/studentClasses';
import { API_BASE, api } from '../lib/api';
import { getToken } from '../lib/auth';

type Asset = DocumentPicker.DocumentPickerAsset;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface ColumnDef {
  key: string;
  label: string;
}

interface CategoryDef {
  id: string;
  title: string;
  headerBg: string;
  headerText: string;
  icon: string;
  columns: ColumnDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'student_details',
    title: 'Student Details',
    headerBg: '#48a999', // Greenish-teal matching screenshot
    headerText: '#ffffff',
    icon: '👤',
    columns: [
      { key: 'class_name', label: 'Class' },
      { key: 'roll_no', label: 'Roll No' },
      { key: 'monthly_fees', label: 'Monthly Fees' },
      { key: 'admission_date', label: 'Admission Date' },
      { key: 'session_from', label: 'Session From' },
      { key: 'session_to', label: 'Session To' },
      { key: 'mobile_number', label: 'Mobile Number' },
      { key: 'whatsapp_number', label: 'WhatsApp Number' },
      { key: 'email', label: 'Email Id' },
      { key: 'gender', label: 'Gender' },
      { key: 'date_of_birth', label: 'Date Of Birth' },
      { key: 'aadhaar_no', label: 'Aadhar No' },
      { key: 'caste_name', label: 'Caste' },
      { key: 'blood_group', label: 'Blood Group' },
      { key: 'admitted_school_name', label: "Adm. School's Name" },
      { key: 'stream', label: 'Stream' },
      { key: 'is_handicapped', label: 'Handicapped' },
      { key: 'is_orphan', label: 'Orphan' },
      { key: 'banglarshiksha_id', label: 'Banglarshiksha ID' },
      { key: 'kanyashree_id', label: 'Kanyashree ID' },
      { key: 'aikyashree_id', label: 'Aikyashree ID' },
      { key: 'school_reg_no', label: 'School Reg No' },
      { key: 'council_reg_no', label: 'Council Reg No' },
      { key: 'previous_branch_name', label: 'Previous Branch Name' },
      { key: 'student_type', label: 'Student Type' },
    ],
  },
  {
    id: 'parents_info',
    title: 'Parents Information',
    headerBg: '#6ba4d9', // Blue matching screenshot
    headerText: '#ffffff',
    icon: '👪',
    columns: [
      { key: 'father_name', label: 'Father Name' },
      { key: 'father_aadhaar_no', label: 'Father AADHAR No' },
      { key: 'father_qualification', label: 'Father Qualification' },
      { key: 'father_occupation', label: 'Father Occupation' },
      { key: 'father_annual_income', label: 'Father Annual Income' },
      { key: 'father_mobile', label: 'Father Mobile No' },
      { key: 'mother_name', label: 'Mother Name' },
      { key: 'mother_aadhaar_no', label: 'Mother AADHAR No' },
      { key: 'mother_qualification', label: 'Mother Qualification' },
      { key: 'mother_occupation', label: 'Mother Occupation' },
      { key: 'mother_annual_income', label: 'Mother Annual Income' },
      { key: 'mother_mobile', label: 'Mother Mobile No' },
      { key: 'guardian_name', label: 'Guardian Name' },
      { key: 'guardian_mobile', label: 'Guardian Mobile' },
      { key: 'alternate_mobile', label: 'Alternate Mobile' },
    ],
  },
  {
    id: 'address_details',
    title: 'Address Details',
    headerBg: '#e9b657', // Yellow/Gold matching screenshot
    headerText: '#1f2937',
    icon: '🏠',
    columns: [
      { key: 'present_village', label: 'Present Village' },
      { key: 'present_post_office', label: 'Present Post Office' },
      { key: 'present_police_station', label: 'Present Police Station' },
      { key: 'present_pin_code', label: 'Present PIN Code' },
      { key: 'present_block', label: 'Present Block' },
      { key: 'present_district', label: 'Present District' },
      { key: 'present_state', label: 'Present State' },
      { key: 'permanent_village', label: 'Permanent Village' },
      { key: 'permanent_post_office', label: 'Permanent Post Office' },
      { key: 'permanent_police_station', label: 'Permanent Police Station' },
      { key: 'permanent_pin_code', label: 'Permanent PIN Code' },
      { key: 'permanent_block', label: 'Permanent Block' },
      { key: 'permanent_district', label: 'Permanent District' },
      { key: 'permanent_state', label: 'Permanent State' },
      { key: 'address', label: 'Full Address' },
    ],
  },
  {
    id: 'bank_details',
    title: 'Bank Details',
    headerBg: '#b088cc', // Soft purple matching screenshot
    headerText: '#ffffff',
    icon: '🏦',
    columns: [
      { key: 'bank_account_no', label: 'Bank Account No' },
      { key: 'bank_name', label: 'Bank Name' },
      { key: 'bank_ifsc_code', label: 'Bank IFSC Code' },
      { key: 'bank_branch_name', label: 'Bank Branch Name' },
      { key: 'bank_branch_address', label: 'Bank Branch Address' },
    ],
  },
  {
    id: 'visitor_details',
    title: 'Visitor Details',
    headerBg: '#e57373', // Coral matching legacy screenshot
    headerText: '#ffffff',
    icon: '👥',
    columns: [
      { key: 'visi_1_name', label: 'Visitor-1 Name' },
      { key: 'visi_1_relation', label: 'Visitor-1 Relation' },
      { key: 'visi_1_mobile', label: 'Visitor-1 Mobile' },
      { key: 'visi_1_village', label: 'Visitor-1 Village' },
      { key: 'visi_1_police_station', label: 'Visitor-1 P.S.' },
      { key: 'visi_1_post_office', label: 'Visitor-1 P.O.' },
      { key: 'visi_1_pin_code', label: 'Visitor-1 PIN' },
      { key: 'visi_1_block', label: 'Visitor-1 Block' },
      { key: 'visi_1_district', label: 'Visitor-1 District' },
      { key: 'visi_1_state', label: 'Visitor-1 State' },
      { key: 'visi_2_name', label: 'Visitor-2 Name' },
      { key: 'visi_2_relation', label: 'Visitor-2 Relation' },
      { key: 'visi_2_mobile', label: 'Visitor-2 Mobile' },
      { key: 'visi_2_village', label: 'Visitor-2 Village' },
      { key: 'visi_2_police_station', label: 'Visitor-2 P.S.' },
      { key: 'visi_2_post_office', label: 'Visitor-2 P.O.' },
      { key: 'visi_2_pin_code', label: 'Visitor-2 PIN' },
      { key: 'visi_2_block', label: 'Visitor-2 Block' },
      { key: 'visi_2_district', label: 'Visitor-2 District' },
      { key: 'visi_2_state', label: 'Visitor-2 State' },
    ],
  },
  {
    id: 'other_details',
    title: 'Hostel & Other Details',
    headerBg: '#607d8b', // Slate grey
    headerText: '#ffffff',
    icon: '🚪',
    columns: [
      { key: 'room_number', label: 'Room / Hostel No' },
      { key: 'admission_no', label: 'Admission No' },
      { key: 'sdf_book_no', label: 'SDF Book No' },
      { key: 'is_active', label: 'Status (Active/Dropout)' },
    ],
  },
];

const ALL_COLUMN_KEYS = CATEGORIES.flatMap((c) => c.columns.map((col) => col.key));

// Bulk Document Types matching the legacy portal screenshot
const BULK_DOC_OPTIONS = [
  { key: 'birth_certificate', label: 'Birth Certificate' },
  { key: 'mp_admit', label: 'M.P Admit' },
  { key: 'mp_marksheet', label: 'M.P Marksheet' },
  { key: 'aadhaar', label: 'Aadhar' },
  { key: 'bank_passbook', label: 'Passbook' },
  { key: 'obc_certificate', label: 'OBC' },
  { key: 'ph_certificate', label: 'P.H Certificate' },
  { key: 'xi_registration', label: 'X.I Registration' },
  { key: 'hs_admit', label: 'H.S Admit' },
  { key: 'hs_marksheet', label: 'H.S Marksheet' },
  { key: 'hs_certificate', label: 'H.S Certificate' },
  { key: 'photo', label: 'Student Photo (Profile Photo)' },
  { key: 'father_photo', label: 'Father Photo' },
  { key: 'mother_photo', label: 'Mother Photo' },
  { key: 'visitor_photo', label: 'Visitor Photo' },
  { key: 'admission_slip', label: 'Admission Slip' },
  { key: 'transfer_certificate', label: 'Transfer Certificate (T.C.)' },
];

async function attachFile(form: FormData, key: string, file: Asset) {
  if (Platform.OS === 'web') {
    const blob = file.file || (await (await fetch(file.uri)).blob());
    form.append(key, blob, file.name);
  } else {
    form.append(key, {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as any);
  }
}

async function request(path: string, body?: FormData) {
  const token = await getToken();
  const response = await fetch(API_BASE + '/api/student-transfer' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token },
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Request failed (' + response.status + ')');
  }
  return response;
}

export default function StudentTransfer() {
  const [activeMainTab, setActiveMainTab] = useState<'excel' | 'documents'>('excel');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Common Filter Options
  const [sessionOptions, setSessionOptions] = useState<string[]>(['2026', '2026-2026', '2026-2027']);
  const [classOptions, setClassOptions] = useState<string[]>(STUDENT_CLASSES);

  // Tab 1: Excel Filter States
  const [session, setSession] = useState('2026');
  const [className, setClassName] = useState('all');
  const [stream, setStream] = useState('all');
  const [status, setStatus] = useState('active');

  // Column Selection States
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'class_name',
    'roll_no',
    'mobile_number',
    'father_name',
    'father_mobile',
  ]);

  // Accordion Expand/Collapse
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    student_details: true,
    parents_info: true,
    address_details: false,
    bank_details: false,
    visitor_details: false,
    other_details: false,
  });

  // Tab 2: Bulk Document States (Matching screenshot)
  const [docSession, setDocSession] = useState('2026');
  const [docClass, setDocClass] = useState('V');
  const [docStream, setDocStream] = useState('all');
  const [docStatus, setDocStatus] = useState('active');
  const [selectedDocType, setSelectedDocType] = useState('birth_certificate');

  const [docPreviewData, setDocPreviewData] = useState<{
    document_type: string;
    document_label: string;
    total_students: number;
    uploaded_count: number;
    missing_count: number;
    students: any[];
  } | null>(null);

  // Upload States
  const [excel, setExcel] = useState<Asset | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [photoResults, setPhotoResults] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api('/api/student-transfer/filter-options');
        if (data.sessions?.length) {
          setSessionOptions(data.sessions);
          setSession(data.sessions[0]);
          setDocSession(data.sessions[0]);
        }
        if (data.classes?.length) {
          setClassOptions(data.classes);
        }
      } catch {
        // Fallbacks already in place
      }
    })();
  }, []);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e: any) {
      setError(e.message || 'Operation failed');
    } finally {
      setBusy('');
    }
  };

  const toggleCategory = (id: string) => {
    setExpanded((curr) => ({ ...curr, [id]: !curr[id] }));
  };

  const toggleColumn = (key: string) => {
    setSelectedColumns((curr) =>
      curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key]
    );
  };

  const selectCategoryColumns = (catId: string, select: boolean) => {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    const catKeys = cat.columns.map((c) => c.key);
    setSelectedColumns((curr) => {
      if (select) {
        return Array.from(new Set([...curr, ...catKeys]));
      } else {
        return curr.filter((k) => !catKeys.includes(k));
      }
    });
  };

  const selectPreset = (type: 'all' | 'none' | 'basic' | 'parents' | 'contact' | 'visitors') => {
    if (type === 'all') {
      setSelectedColumns([...ALL_COLUMN_KEYS]);
    } else if (type === 'none') {
      setSelectedColumns([]);
    } else if (type === 'basic') {
      setSelectedColumns([
        'class_name',
        'roll_no',
        'session_from',
        'session_to',
        'gender',
        'date_of_birth',
        'mobile_number',
        'father_name',
        'father_mobile',
      ]);
    } else if (type === 'parents') {
      const pKeys = CATEGORIES.find((c) => c.id === 'parents_info')?.columns.map((c) => c.key) || [];
      setSelectedColumns(['class_name', 'roll_no', ...pKeys]);
    } else if (type === 'contact') {
      setSelectedColumns([
        'class_name',
        'roll_no',
        'mobile_number',
        'whatsapp_number',
        'father_name',
        'father_mobile',
        'present_village',
        'present_police_station',
        'present_district',
        'present_pin_code',
      ]);
    } else if (type === 'visitors') {
      const vKeys = CATEGORIES.find((c) => c.id === 'visitor_details')?.columns.map((c) => c.key) || [];
      setSelectedColumns(['class_name', 'roll_no', ...vKeys]);
    }
  };

  const handleSearchExcel = () =>
    run('Checking student count...', async () => {
      const res = await api('/api/student-transfer/preview-count', {
        method: 'POST',
        body: JSON.stringify({
          session: session === 'all' ? undefined : session,
          class_name: className === 'all' ? undefined : className,
          stream: stream === 'all' ? undefined : stream,
          status: status === 'all' ? undefined : status,
        }),
      });
      setMessage(`Found ${res.count} student(s) matching your filter criteria.`);
    });

  const exportCustomExcel = () =>
    run('Exporting Excel...', async () => {
      const token = await getToken();
      const body = {
        session: session === 'all' ? undefined : session,
        class_name: className === 'all' ? undefined : className,
        stream: stream === 'all' ? undefined : stream,
        status: status === 'all' ? undefined : status,
        columns: selectedColumns,
      };

      const response = await fetch(API_BASE + '/api/student-transfer/excel-custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Export failed (' + response.status + ')');
      }

      const cPart = className !== 'all' ? className.replace(/[^a-zA-Z0-9]/g, '_') : 'all';
      const sPart = session !== 'all' ? session.replace(/[^a-zA-Z0-9]/g, '_') : 'all';
      const fileName = `students_${cPart}_${sPart}.xlsx`;

      if (Platform.OS === 'web') {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage(`Excel download started (${fileName})`);
      } else {
        const downloadDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!downloadDirectory) throw new Error('A writable download folder is unavailable.');
        const target = downloadDirectory + Date.now() + '-' + fileName;

        const queryParams = new URLSearchParams({
          class_name: className === 'all' ? '' : className,
          session: session === 'all' ? '' : session,
          stream: stream === 'all' ? '' : stream,
          status: status === 'all' ? '' : status,
          columns: selectedColumns.join(','),
        });

        const result = await FileSystem.downloadAsync(
          API_BASE + '/api/student-transfer/excel?' + queryParams.toString(),
          target,
          { headers: { Authorization: 'Bearer ' + token } }
        );

        if (result.status !== 200) {
          await FileSystem.deleteAsync(target, { idempotent: true });
          throw new Error('Download failed.');
        }
        if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing unavailable.');
        await Sharing.shareAsync(result.uri, {
          mimeType: XLSX,
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
        setMessage('Excel file ready. Use the share menu to save it.');
      }
    });

  // Tab 2: Bulk Document Handlers
  const handleGenerateDocuments = () =>
    run('Fetching document records...', async () => {
      const res = await api('/api/student-transfer/documents-preview', {
        method: 'POST',
        body: JSON.stringify({
          session: docSession === 'all' ? undefined : docSession,
          class_name: docClass === 'all' ? undefined : docClass,
          stream: docStream === 'all' ? undefined : docStream,
          status: docStatus === 'all' ? undefined : docStatus,
          document_type: selectedDocType,
        }),
      });
      setDocPreviewData(res);
      setMessage(
        `${res.document_label}: Found ${res.total_students} student(s). ${res.uploaded_count} uploaded, ${res.missing_count} missing.`
      );
    });

  const downloadDocumentsZip = () =>
    run('Packaging documents into ZIP...', async () => {
      const token = await getToken();
      const body = {
        session: docSession === 'all' ? undefined : docSession,
        class_name: docClass === 'all' ? undefined : docClass,
        stream: docStream === 'all' ? undefined : docStream,
        status: docStatus === 'all' ? undefined : docStatus,
        document_type: selectedDocType,
      };

      const response = await fetch(API_BASE + '/api/student-transfer/documents-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'ZIP download failed (' + response.status + ')');
      }

      const cPart = docClass !== 'all' ? docClass.replace(/[^a-zA-Z0-9]/g, '_') : 'All';
      const dPart = selectedDocType.replace(/[^a-zA-Z0-9]/g, '_');
      const zipFileName = `Students_${cPart}_${dPart}.zip`;

      if (Platform.OS === 'web') {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage(`ZIP download started (${zipFileName})`);
      } else {
        const downloadDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!downloadDirectory) throw new Error('Download folder unavailable.');
        const target = downloadDirectory + Date.now() + '-' + zipFileName;

        const queryParams = new URLSearchParams({
          class_name: docClass === 'all' ? '' : docClass,
          session: docSession === 'all' ? '' : docSession,
          stream: docStream === 'all' ? '' : docStream,
          status: docStatus === 'all' ? '' : docStatus,
          document_type: selectedDocType,
        });

        const result = await FileSystem.downloadAsync(
          API_BASE + '/api/student-transfer/documents-zip?' + queryParams.toString(),
          target,
          { headers: { Authorization: 'Bearer ' + token } }
        );

        if (result.status !== 200) {
          await FileSystem.deleteAsync(target, { idempotent: true });
          throw new Error('ZIP download failed.');
        }
        if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable.');
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/zip',
          UTI: 'public.zip-archive',
        });
        setMessage('ZIP archive ready. Use the share menu to save it.');
      }
    });

  const downloadFull = (template: boolean) =>
    run('Downloading Excel...', async () => {
      const endpoint = '/excel' + (template ? '?template=true' : '');
      const name = template ? 'student-template.xlsx' : 'students_all.xlsx';
      if (Platform.OS === 'web') {
        const response = await request(endpoint);
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage('Excel download started.');
      } else {
        const token = await getToken();
        const downloadDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!downloadDirectory) throw new Error('Writable download folder unavailable.');
        const target = downloadDirectory + Date.now() + '-' + name;
        const result = await FileSystem.downloadAsync(
          API_BASE + '/api/student-transfer' + endpoint,
          target,
          { headers: { Authorization: 'Bearer ' + token } }
        );
        if (result.status !== 200) {
          await FileSystem.deleteAsync(target, { idempotent: true });
          throw new Error('Download failed.');
        }
        if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable.');
        await Sharing.shareAsync(result.uri, {
          mimeType: XLSX,
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
        setMessage('Excel file ready.');
      }
    });

  const chooseExcel = () =>
    run('Checking Excel...', async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: [XLSX, 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      setPreview(null);
      setExcel(null);
      const file = result.assets[0];
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Please select an .xlsx file.');
      if (file.size && file.size > 10 * 1024 * 1024) throw new Error('Excel file must be under 10 MB.');
      const form = new FormData();
      await attachFile(form, 'file', file);
      const data = await (await request('/excel/preview', form)).json();
      setExcel(file);
      setPreview(data);
    });

  const importExcel = () =>
    run('Importing students...', async () => {
      if (!excel || !preview || preview.errors.length) return;
      const form = new FormData();
      await attachFile(form, 'file', excel);
      const data = await (await request('/excel/import', form)).json();
      setMessage(
        'Import complete: ' + data.created + ' students added, ' + data.updated + ' updated.'
      );
      setPreview(null);
      setExcel(null);
    });

  const choosePhotos = () =>
    run('Selecting photos...', async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      if (result.assets.length > 100) throw new Error('Select up to 100 photos at a time.');
      const seen = new Set<string>();
      for (const file of result.assets) {
        if (!/\.(jpe?g|png|webp)$/i.test(file.name))
          throw new Error(file.name + ': use JPG, PNG or WebP.');
        if (file.size && file.size > 5 * 1024 * 1024)
          throw new Error(file.name + ': photo exceeds 5 MB.');
        const registration = file.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
        if (seen.has(registration))
          throw new Error('More than one photo selected for registration ' + registration);
        seen.add(registration);
      }
      setPhotos(result.assets);
      setPhotoResults([]);
    });

  const uploadPhotos = () =>
    run('Uploading photos...', async () => {
      const allResults: any[] = [];
      setPhotoResults([]);
      for (let start = 0; start < photos.length; start += 10) {
        const batch = photos.slice(start, start + 10);
        setBusy(
          'Uploading photos ' +
            (start + 1) +
            '–' +
            Math.min(start + 10, photos.length) +
            ' of ' +
            photos.length
        );
        const form = new FormData();
        for (const photo of batch) await attachFile(form, 'photos', photo);
        const data = await (await request('/photos', form)).json();
        allResults.push(...data.results);
        setPhotoResults([...allResults]);
      }
      const uploaded = allResults.filter((result) => result.success).length;
      setMessage(
        uploaded + ' photos uploaded; ' + (allResults.length - uploaded) + ' not uploaded.'
      );
      setPhotos([]);
    });

  const action = (title: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: !!busy || disabled }}
      disabled={!!busy || disabled}
      onPress={onPress}
      style={[s.button, (!!busy || disabled) && s.disabled]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <AcademyHeader />
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.replace('/students')}
          style={s.backButton}
        >
          <Text style={s.backText}>← Back to Students</Text>
        </TouchableOpacity>

        <Text style={s.title}>Student Data, Excel & Bulk Documents Export</Text>

        {/* TOP MAIN NAVIGATION TABS */}
        <View style={s.mainTabContainer}>
          <TouchableOpacity
            onPress={() => setActiveMainTab('excel')}
            style={[s.mainTabBtn, activeMainTab === 'excel' && s.mainTabBtnActive]}
          >
            <Text
              style={[
                s.mainTabBtnText,
                activeMainTab === 'excel' && s.mainTabBtnTextActive,
              ]}
            >
              📊 Student Excel (Data Download & Upload)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveMainTab('documents')}
            style={[s.mainTabBtn, activeMainTab === 'documents' && s.mainTabBtnActive]}
          >
            <Text
              style={[
                s.mainTabBtnText,
                activeMainTab === 'documents' && s.mainTabBtnTextActive,
              ]}
            >
              📁 Bulk Documents & Photos (Download & Upload)
            </Text>
          </TouchableOpacity>
        </View>

        {!!busy && (
          <View style={s.notice}>
            <ActivityIndicator color="#0d6efd" />
            <Text style={s.busyText}>{busy}</Text>
          </View>
        )}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!message && <Text accessibilityRole="alert" style={s.success}>{message}</Text>}

        {/* ========================================================================= */}
        {/* TAB 1: STUDENT EXCEL DOWNLOAD & UPLOAD */}
        {/* ========================================================================= */}
        {activeMainTab === 'excel' && (
          <>
            {/* 1. CUSTOM EXCEL DOWNLOAD CARD */}
            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.heading}>Excel Download (Class, Session & Custom Data)</Text>
                <Text style={s.help}>
                  Filter by Session, Class, and Status, then select only the specific fields you need to export.
                </Text>
              </View>

              {/* Filter Bar */}
              <View style={s.filterBar}>
                <View style={s.filterField}>
                  <Text style={s.filterLabel}>Session</Text>
                  <Select
                    label=""
                    value={session}
                    onChange={setSession}
                    options={[
                      { value: 'all', label: 'All Sessions' },
                      ...sessionOptions.map((v) => ({ value: v, label: v })),
                    ]}
                    style={s.selectInput}
                  />
                </View>

                <View style={s.filterField}>
                  <Text style={s.filterLabel}>Class</Text>
                  <Select
                    label=""
                    value={className}
                    onChange={setClassName}
                    options={[
                      { value: 'all', label: 'All Classes' },
                      ...classOptions.map((v) => ({ value: v, label: v })),
                    ]}
                    style={s.selectInput}
                  />
                </View>

                <View style={s.filterField}>
                  <Text style={s.filterLabel}>Stream</Text>
                  <Select
                    label=""
                    value={stream}
                    onChange={setStream}
                    options={[
                      { value: 'all', label: 'All Streams' },
                      { value: 'Science', label: 'Science' },
                      { value: 'Arts', label: 'Arts' },
                      { value: 'Commerce', label: 'Commerce' },
                      { value: 'General', label: 'General' },
                    ]}
                    style={s.selectInput}
                  />
                </View>

                <View style={s.filterField}>
                  <Text style={s.filterLabel}>Status</Text>
                  <Select
                    label=""
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'dropout', label: 'Dropout' },
                      { value: 'all', label: 'All' },
                    ]}
                    style={s.selectInput}
                  />
                </View>

                <View style={s.filterBtnGroup}>
                  <TouchableOpacity
                    onPress={handleSearchExcel}
                    style={[s.searchBtn, !!busy && s.disabled]}
                    disabled={!!busy}
                  >
                    <Text style={s.searchBtnText}>🔍 Search</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={exportCustomExcel}
                    style={[s.exportExcelBtn, !!busy && s.disabled]}
                    disabled={!!busy}
                  >
                    <Text style={s.exportExcelBtnText}>⤓ Export to Excel</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Presets */}
              <View style={s.presetsRow}>
                <Text style={s.presetLabel}>Quick Presets:</Text>
                <TouchableOpacity onPress={() => selectPreset('all')} style={s.presetChip}>
                  <Text style={s.presetChipText}>Select All ({ALL_COLUMN_KEYS.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectPreset('basic')} style={s.presetChip}>
                  <Text style={s.presetChipText}>Basic Info</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectPreset('parents')} style={s.presetChip}>
                  <Text style={s.presetChipText}>Parents Info</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectPreset('contact')} style={s.presetChip}>
                  <Text style={s.presetChipText}>Contact & Address</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectPreset('visitors')} style={s.presetChip}>
                  <Text style={s.presetChipText}>Visitor Details</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectPreset('none')} style={s.presetChipClear}>
                  <Text style={s.presetChipClearText}>Clear All</Text>
                </TouchableOpacity>
                <Text style={s.selectedCountBadge}>
                  {selectedColumns.length} field(s) selected
                </Text>
              </View>

              {/* Accordion Categories */}
              <View style={s.accordionList}>
                {CATEGORIES.map((cat) => {
                  const isOpen = expanded[cat.id];
                  const catKeys = cat.columns.map((c) => c.key);
                  const selectedInCat = cat.columns.filter((c) => selectedColumns.includes(c.key)).length;
                  const isAllSelected = selectedInCat === cat.columns.length && cat.columns.length > 0;

                  return (
                    <View key={cat.id} style={s.accordionCard}>
                      <TouchableOpacity
                        onPress={() => toggleCategory(cat.id)}
                        style={[s.accordionHeader, { backgroundColor: cat.headerBg }]}
                        activeOpacity={0.8}
                      >
                        <View style={s.accordionHeaderLeft}>
                          <Text style={[s.accordionChevron, { color: cat.headerText }]}>
                            {isOpen ? '▾' : '▸'}
                          </Text>
                          <Text style={[s.accordionTitle, { color: cat.headerText }]}>
                            {cat.title}
                          </Text>
                          <View style={s.catCountBadge}>
                            <Text style={s.catCountText}>
                              {selectedInCat}/{cat.columns.length}
                            </Text>
                          </View>
                        </View>

                        <View style={s.catActions}>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              selectCategoryColumns(cat.id, !isAllSelected);
                            }}
                            style={s.catActionBtn}
                          >
                            <Text style={s.catActionBtnText}>
                              {isAllSelected ? 'Deselect All' : 'Select All'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>

                      {isOpen && (
                        <View style={s.accordionBody}>
                          <View style={s.checkboxGrid}>
                            {cat.columns.map((col) => {
                              const isChecked = selectedColumns.includes(col.key);
                              return (
                                <TouchableOpacity
                                  key={col.key}
                                  onPress={() => toggleColumn(col.key)}
                                  style={[s.checkboxItem, isChecked && s.checkboxItemActive]}
                                  activeOpacity={0.7}
                                >
                                  <View style={[s.checkboxBox, isChecked && s.checkboxBoxChecked]}>
                                    {isChecked && <Text style={s.checkmark}>✓</Text>}
                                  </View>
                                  <Text
                                    style={[s.checkboxLabel, isChecked && s.checkboxLabelChecked]}
                                    numberOfLines={1}
                                  >
                                    {col.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Bottom Export Bar */}
              <View style={s.bottomExportBar}>
                <View>
                  <Text style={s.bottomExportSummary}>
                    Exporting {selectedColumns.length} fields for Class: {className === 'all' ? 'All Classes' : className},{' '}
                    Session: {session === 'all' ? 'All Sessions' : session}
                  </Text>
                  <Text style={s.bottomExportSub}>
                    Note: Registration No and Student Name are always automatically included.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={exportCustomExcel}
                  style={[s.exportExcelBtnLarge, !!busy && s.disabled]}
                  disabled={!!busy}
                >
                  <Text style={s.exportExcelBtnTextLarge}>⤓ Download Custom Excel (.xlsx)</Text>
                </TouchableOpacity>
              </View>

              {/* Secondary System Downloads */}
              <View style={s.secondaryDownloads}>
                <Text style={s.secondaryTitle}>System Backups & Templates:</Text>
                <View style={s.actions}>
                  {action('Download Full Backup (.xlsx)', () => downloadFull(false))}
                  {action('Download Empty Template', () => downloadFull(true))}
                </View>
              </View>
            </View>

            {/* 2. EXCEL UPLOAD CARD */}
            <View style={s.card}>
              <Text style={s.heading}>Excel Upload & Import</Text>
              <Text style={s.help}>
                Complete the Students sheet in the template. Registration number and student name are required. Existing
                registration numbers will be updated; blank cells will keep old values. Maximum 2,000 students / 10 MB.
              </Text>
              {action('Choose Excel & Preview', chooseExcel)}
              {preview && (
                <View style={s.preview}>
                  <Text style={s.heading}>{excel?.name}</Text>
                  <Text>
                    New: {preview.created} Update: {preview.updated} Errors: {preview.errors.length}
                  </Text>
                  {preview.errors.map((item: any, index: number) => (
                    <Text key={index} style={s.error}>
                      Row {item.row || '—'}: {item.message}
                    </Text>
                  ))}
                  {action('Import ' + preview.total + ' Students', importExcel, !!preview.errors.length)}
                </View>
              )}
            </View>
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: BULK DOCUMENTS & PHOTOS DOWNLOAD (Matching user's screenshot)      */}
        {/* ========================================================================= */}
        {activeMainTab === 'documents' && (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.heading}>Bulk Student Documents & Photos Download</Text>
              <Text style={s.help}>
                Select Session, Class, and Document Type, then click 'Generate' to see all uploaded files and download them in a single ZIP file.
              </Text>
            </View>

            {/* Top Filter Bar (Matching screenshot 4e29af05) */}
            <View style={s.filterBar}>
              <View style={s.filterField}>
                <Text style={s.filterLabel}>Session</Text>
                <Select
                  label=""
                  value={docSession}
                  onChange={setDocSession}
                  options={[
                    { value: 'all', label: 'All Sessions' },
                    ...sessionOptions.map((v) => ({ value: v, label: v })),
                  ]}
                  style={s.selectInput}
                />
              </View>

              <View style={s.filterField}>
                <Text style={s.filterLabel}>Class</Text>
                <Select
                  label=""
                  value={docClass}
                  onChange={setDocClass}
                  options={[
                    { value: 'all', label: 'All Classes' },
                    ...classOptions.map((v) => ({ value: v, label: v })),
                  ]}
                  style={s.selectInput}
                />
              </View>

              <View style={s.filterField}>
                <Text style={s.filterLabel}>Stream</Text>
                <Select
                  label=""
                  value={docStream}
                  onChange={setDocStream}
                  options={[
                    { value: 'all', label: 'All Streams' },
                    { value: 'Science', label: 'Science' },
                    { value: 'Arts', label: 'Arts' },
                    { value: 'Commerce', label: 'Commerce' },
                    { value: 'General', label: 'General' },
                  ]}
                  style={s.selectInput}
                />
              </View>

              <View style={s.filterField}>
                <Text style={s.filterLabel}>Status</Text>
                <Select
                  label=""
                  value={docStatus}
                  onChange={setDocStatus}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'dropout', label: 'Dropout' },
                    { value: 'all', label: 'All' },
                  ]}
                  style={s.selectInput}
                />
              </View>

              <View style={s.filterBtnGroup}>
                <TouchableOpacity
                  onPress={handleGenerateDocuments}
                  style={[s.generateBtn, !!busy && s.disabled]}
                  disabled={!!busy}
                >
                  <Text style={s.generateBtnText}>Generate</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Side-by-Side: Left Radio Menu & Right Content Area (Matching screenshot 4e29af05) */}
            <View style={s.docLayoutRow}>
              {/* Left Column: Document Type Radio List */}
              <View style={s.docLeftCol}>
                <Text style={s.docColHeader}>Select Document Type:</Text>
                <View style={s.docRadioList}>
                  {BULK_DOC_OPTIONS.map((opt) => {
                    const isSelected = selectedDocType === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => setSelectedDocType(opt.key)}
                        style={[s.docRadioItem, isSelected && s.docRadioItemActive]}
                        activeOpacity={0.7}
                      >
                        <View style={[s.radioOuter, isSelected && s.radioOuterActive]}>
                          {isSelected && <View style={s.radioInner} />}
                        </View>
                        <Text style={[s.docRadioText, isSelected && s.docRadioTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Right Column: Results & Download Area */}
              <View style={s.docRightCol}>
                {!docPreviewData ? (
                  <View style={s.docPlaceholderBox}>
                    <Text style={s.docPlaceholderIcon}>📂</Text>
                    <Text style={s.docPlaceholderTitle}>
                      Ready to Search Documents
                    </Text>
                    <Text style={s.docPlaceholderSub}>
                      Select the Class, Session, and Document Type from the left menu, then click the blue "Generate" button above.
                    </Text>
                  </View>
                ) : (
                  <View style={s.docResultsBox}>
                    {/* Header Summary & ZIP Download Button */}
                    <View style={s.docSummaryHead}>
                      <View style={{ flex: 1, minWidth: 240 }}>
                        <Text style={s.docSummaryTitle}>
                          {docPreviewData.document_label}
                        </Text>
                        <Text style={s.docSummarySubtitle}>
                          Class: {docClass === 'all' ? 'All Classes' : docClass} • Session: {docSession === 'all' ? 'All Sessions' : docSession}
                        </Text>
                        <View style={s.docBadgeRow}>
                          <View style={s.statBadgeGreen}>
                            <Text style={s.statBadgeGreenText}>
                              ✓ Uploaded: {docPreviewData.uploaded_count}
                            </Text>
                          </View>
                          <View style={s.statBadgeRed}>
                            <Text style={s.statBadgeRedText}>
                              ✗ Missing: {docPreviewData.missing_count}
                            </Text>
                          </View>
                          <View style={s.statBadgeGray}>
                            <Text style={s.statBadgeGrayText}>
                              Total: {docPreviewData.total_students}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Download ZIP Button */}
                      {docPreviewData.uploaded_count > 0 && (
                        <TouchableOpacity
                          onPress={downloadDocumentsZip}
                          style={[s.downloadZipBtn, !!busy && s.disabled]}
                          disabled={!!busy}
                        >
                          <Text style={s.downloadZipBtnText}>
                            ⤓ Download All as ZIP ({docPreviewData.uploaded_count} files)
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Student Records List Table with Vertical & Horizontal Scrollbar */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={true} style={s.tableScrollHoriz}>
                      <View style={s.docTable}>
                        <ScrollView
                          style={s.docTableVerticalScroll}
                          nestedScrollEnabled={true}
                          showsVerticalScrollIndicator={true}
                          stickyHeaderIndices={[0]}
                        >
                          <View style={[s.tr, s.th]}>
                            <Text style={[s.cellHead, { width: 45 }]}>Sl</Text>
                            <Text style={[s.cellHead, { width: 85 }]}>Reg No</Text>
                            <Text style={[s.cellHead, { width: 170 }]}>Student Name</Text>
                            <Text style={[s.cellHead, { width: 75 }]}>Class</Text>
                            <Text style={[s.cellHead, { width: 65 }]}>Roll</Text>
                            <Text style={[s.cellHead, { width: 105 }]}>Status</Text>
                            <Text style={[s.cellHead, { width: 120 }]}>Action</Text>
                          </View>

                          {docPreviewData.students.map((st, idx) => (
                            <View key={st.id} style={[s.tr, idx % 2 === 1 && s.trAlt]}>
                              <Text style={[s.cell, { width: 45, textAlign: 'center' }]}>{idx + 1}</Text>
                              <Text style={[s.cell, s.bold, { width: 85, color: '#0F52BA' }]}>{st.registration_no}</Text>
                              <Text style={[s.cell, s.bold, { width: 170 }]}>{st.student_name}</Text>
                              <Text style={[s.cell, { width: 75 }]}>{st.class_name || '-'}</Text>
                              <Text style={[s.cell, { width: 65 }]}>{st.roll_no || '-'}</Text>
                              <View style={[s.cell, { width: 105, justifyContent: 'center' }]}>
                                {st.has_document ? (
                                  <View style={s.statusPillUploaded}>
                                    <Text style={s.statusPillUploadedText}>✓ Uploaded</Text>
                                  </View>
                                ) : (
                                  <View style={s.statusPillMissing}>
                                    <Text style={s.statusPillMissingText}>✗ Missing</Text>
                                  </View>
                                )}
                              </View>
                              <View style={[s.cell, { width: 120, flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
                                {st.has_document && st.file_url ? (
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                        window.open(st.file_url, '_blank');
                                      } else {
                                        void Linking.openURL(st.file_url);
                                      }
                                    }}
                                    style={s.viewFileBtn}
                                  >
                                    <Text style={s.viewFileBtnText}>👁️ View</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <Text style={s.notAvailText}>—</Text>
                                )}
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    </ScrollView>

                    <View style={s.tableFooterRow}>
                      <Text style={s.tableFooterText}>
                        Showing all {docPreviewData.students.length} student records • Scroll vertically using the scrollbar on the right
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Bulk Student Photos Upload Card within Documents Tab */}
            <View style={s.subSectionDivider} />
            <Text style={s.heading}>Bulk Student Photos Upload</Text>
            <Text style={s.help}>
              Name each photo with its registration number: 75276.jpg, 75566.png. JPG, PNG, or WebP; maximum 5 MB per
              photo. You can select up to 100 photos at once. A matching number will replace the existing profile photo.
            </Text>
            {action('Choose Photos to Upload', choosePhotos)}
            {!!photos.length && (
              <>
                <Text style={s.help}>{photos.length} photos selected</Text>
                <Text style={s.help}>{photos.map((photo) => photo.name).join(', ')}</Text>
                {action('Upload ' + photos.length + ' Photos', uploadPhotos)}
              </>
            )}
            {photoResults.map((result, index) => (
              <Text key={index} style={result.success ? s.success : s.error}>
                {result.file}: {result.success ? 'Uploaded' : result.message}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f6f9' },
  content: {
    padding: 16,
    paddingBottom: 60,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  backText: { color: '#163451', fontWeight: '700' },
  title: { fontSize: 23, fontWeight: '800', color: '#163451', marginBottom: 14 },

  // Top Main Tabs
  mainTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  mainTabBtn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTabBtnActive: {
    backgroundColor: '#0F52BA',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  mainTabBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  mainTabBtnTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dde5ed',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHead: { marginBottom: 12 },
  heading: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 6 },
  help: { color: '#64748b', lineHeight: 22, marginBottom: 12, fontSize: 13.5 },

  // Filter Bar (Matching screenshot 2 & 4e29af05)
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-end',
    backgroundColor: '#e1effa',
    borderWidth: 1,
    borderColor: '#b9d9f2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  filterField: {
    minWidth: 140,
    flex: 1,
  },
  filterLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1e3a5f',
    marginBottom: 5,
  },
  selectInput: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 6,
    height: 40,
  },
  filterBtnGroup: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchBtn: {
    backgroundColor: '#0d6efd',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13.5,
  },
  generateBtn: {
    backgroundColor: '#0d6efd',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 6,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  generateBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  exportExcelBtn: {
    backgroundColor: '#198754',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportExcelBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13.5,
  },

  // Presets Row
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  presetChip: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  presetChipClear: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  presetChipClearText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b91c1c',
  },
  selectedCountBadge: {
    marginLeft: 'auto',
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0d6efd',
    backgroundColor: '#e0f2fe',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },

  // Accordion Categories
  accordionList: {
    gap: 12,
    marginBottom: 18,
  },
  accordionCard: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionChevron: {
    fontSize: 16,
    fontWeight: '900',
  },
  accordionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  catCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 6,
  },
  catCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  catActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catActionBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  catActionBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },

  accordionBody: {
    backgroundColor: '#ffffff',
    padding: 12,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    minWidth: '23%',
    flex: 1,
  },
  checkboxItemActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#0d6efd',
    borderColor: '#0d6efd',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  checkboxLabelChecked: {
    color: '#1e293b',
    fontWeight: '700',
  },

  // Bottom Export Bar
  bottomExportBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  bottomExportSummary: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1e293b',
  },
  bottomExportSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
  },
  exportExcelBtnLarge: {
    backgroundColor: '#198754',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 7,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  exportExcelBtnTextLarge: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 14,
  },

  secondaryDownloads: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  secondaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
  },

  // =========================================================
  // TAB 2: BULK DOCUMENTS SIDE-BY-SIDE STYLES (Matching 4e29af05)
  // =========================================================
  docLayoutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 6,
  },
  docLeftCol: {
    width: 250,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
  },
  docColHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  docRadioList: {
    gap: 6,
  },
  docRadioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  docRadioItemActive: {
    borderColor: '#0d6efd',
    backgroundColor: '#eff6ff',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterActive: {
    borderColor: '#0d6efd',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#0d6efd',
  },
  docRadioText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  docRadioTextActive: {
    color: '#0d6efd',
    fontWeight: '800',
  },

  // Right Results Area
  docRightCol: {
    flex: 1,
    minWidth: 320,
  },
  docPlaceholderBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  docPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  docPlaceholderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 6,
  },
  docPlaceholderSub: {
    fontSize: 13.5,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 20,
  },

  docResultsBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 14,
    gap: 14,
  },
  docSummaryHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  docSummaryTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F52BA',
  },
  docSummarySubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  docBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  statBadgeGreen: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statBadgeGreenText: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '800',
  },
  statBadgeRed: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statBadgeRedText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
  },
  statBadgeGray: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statBadgeGrayText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  downloadZipBtn: {
    backgroundColor: '#198754',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  downloadZipBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
  },

  // Table styles
  tableScrollHoriz: {
    width: '100%',
  },
  docTable: {
    minWidth: 680,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  docTableVerticalScroll: {
    maxHeight: 520,
    ...(Platform.OS === 'web' ? {
      overflowY: 'auto' as any,
    } : {}),
  },
  tableFooterRow: {
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableFooterText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  trAlt: {
    backgroundColor: '#f8fafc',
  },
  th: {
    backgroundColor: '#173d68',
    zIndex: 2,
    elevation: 3,
  },
  cellHead: {
    padding: 10,
    fontWeight: '800',
    color: '#ffffff',
    fontSize: 12.5,
  },
  cell: {
    padding: 9,
    fontSize: 13,
    color: '#334155',
  },
  bold: {
    fontWeight: '800',
  },
  statusPillUploaded: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusPillUploadedText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '800',
  },
  statusPillMissing: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusPillMissingText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '800',
  },
  viewFileBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  viewFileBtnText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  notAvailText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  subSectionDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 20,
  },

  // Legacy upload styles
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: {
    padding: 12,
    minHeight: 42,
    backgroundColor: '#1565c0',
    borderRadius: 8,
    marginVertical: 4,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.5 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    marginBottom: 12,
  },
  busyText: { color: '#1e40af', fontWeight: '700', fontSize: 13.5 },
  error: { color: '#b91c1c', marginVertical: 8, lineHeight: 21, fontWeight: '700' },
  success: { color: '#166534', marginVertical: 8, lineHeight: 21, fontWeight: '700' },
  preview: { backgroundColor: '#eff6ff', padding: 14, marginTop: 12, borderRadius: 10 },
});
