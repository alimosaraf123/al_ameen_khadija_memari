import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { api, API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';
import { STUDENT_CLASSES, isVisibleStudentClass } from '../lib/studentClasses';
import { filterStudents, studentSession, normalizeStudentClass } from '../lib/studentDirectory';

type Option = { value: string; label: string };
export function Select({ label, value, options, onChange, searchable=false }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const visibleOptions = searchable && query ? options.filter(option => option.label.toLowerCase().includes(query.toLowerCase())) : options;
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${options.find(o => o.value === value)?.label || value}`} onPress={() => { setQuery(''); setOpen(true); }} style={s.select}>
      <Text style={s.selectText}>{options.find(o => o.value === value)?.label || label}  ▼</Text>
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close dropdown" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => setOpen(false)} /><View style={s.selectPanel}>
        <Text style={s.panelTitle}>{label}</Text>
        {searchable && <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={label ? `Search ${label}...` : "Type to search..."} style={s.search} />}
        <ScrollView keyboardShouldPersistTaps="handled">{visibleOptions.map(option => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} style={[s.option, value === option.value && s.selected]} onPress={() => { onChange(option.value); setOpen(false); }}>
          <Text>{option.label}{value === option.value ? '  Selected' : ''}</Text>
        </TouchableOpacity>)}</ScrollView>

      </View></View>
    </Modal>
  </>;
}

const DOCUMENT_SLOTS = [
  ['father_photo','Father Photo'], ['mother_photo','Mother Photo'],
  ['visitor1_photo','Visitor-1 Photo'], ['visitor2_photo','Visitor-2 Photo'],
  ['birth_certificate','Date Of Birth'], ['aadhaar','Aadhaar'], ['bank_passbook','Passbook'], ['obc_certificate','OBC'],
  ['ph_certificate','P.H. Certificate'], ['ix_registration','MP Registration'], ['mp_admit','MP Admit'], ['mp_marksheet','MP Marksheet'],
  ['xi_registration','XI Registration'],
  ['xi_admission_slip','XI Admission Slip'],
  ['xi_marksheet','XI Marksheet'],
  ['hs_admit_3rd','HS Admit 3rd Semester'], ['hs_admit_4th','HS Admit 4th Semester'],
  ['hs_marksheet','H.S Marksheet'], ['hs_certificate','H.S Certificate'], ['admission_slip','Admission Slip'],
  ['signature','Signature'], ['transfer_certificate','T.C.'], ['other','Others'],
  ['other_2','Others-2'], ['other_3','Others-3'],
] as const;

const columns: [string, string, number][] = [
  ['serial', 'S.L', 45], ['photo', 'Photo', 66], ['registration_no', 'Reg.', 95],
  ['student_name', 'Name', 185], ['class_name', 'Class', 65], ['monthly_fees', 'Fees', 85],
  ['mobile_number', 'Mobile', 125], ['whatsapp_number', 'WhatsApp', 125], ['room_name', 'Room No.', 105], ['is_active', 'Status', 90], ['action', 'Action', 195],
];

export default function StudentDirectory({ students, loading, error, onEdit, onRefresh, onDeactivate }: {
  students: any[]; loading: boolean; error: string; onEdit: (student: any) => void; onRefresh: () => void; onDeactivate: (student: any) => void;
}) {
  const [year, setYear] = useState('all');
  const [className, setClassName] = useState('all');
  const [gender, setGender] = useState('all');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [size, setSize] = useState('10');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'student_name', ascending: true });
  const [detail, setDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [documentStudent, setDocumentStudent] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [documentBusy, setDocumentBusy] = useState<string | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<Record<string, any>>({});
  const sessions = useMemo(() => [...new Set(students.map(studentSession).filter(Boolean))].sort().reverse(), [students]);
  const classes = useMemo(() => [...new Set<string>([
    ...STUDENT_CLASSES,
    ...students.map(student => normalizeStudentClass(student.class_name)).filter(Boolean).filter(isVisibleStudentClass),
  ])], [students]);
  const filtered = useMemo(() => filterStudents(students, { year, className, gender, status, search }).sort((a, b) => {
    const result = sort.key === 'monthly_fees' ? Number(a[sort.key] || 0) - Number(b[sort.key] || 0)
      : String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), undefined, { numeric: true });
    return sort.ascending ? result : -result;
  }), [students, year, className, gender, status, search, sort]);
  useEffect(() => { setPage(1); }, [year, className, gender, status, search, size]);
  const pageSize = size === 'all' ? Math.max(1, filtered.length) : Number(size);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  const openDetails = async (student: any) => {
    setDetailOpen(true); setDetail(null); setDetailError(''); setDetailLoading(true);
    try { const data = await api(`/api/students/${student.id}`); setDetail(data.student); }
    catch (error: any) { setDetailError(error.message || 'Unable to load student.'); }
    finally { setDetailLoading(false); }
  };
  const openDocuments = async (student: any) => {
    setDocumentStudent(student);
    setDocuments([]);
    setDocumentsError('');
    setPendingDocuments({});
    setDocumentsOpen(true);
    setDocumentsLoading(true);
    try {
      const data = await api('/api/documents/student/' + student.id);
      setDocuments(data.documents || []);
    } catch (error: any) {
      setDocumentsError(error.message || 'Unable to load documents.');
    } finally {
      setDocumentsLoading(false);
    }
  };

  const chooseDocument = async (type: string) => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (!picked.canceled) setPendingDocuments(current => ({ ...current, [type]: picked.assets[0] }));
  };

  const uploadStudentPhoto = async () => {
    if (!documentStudent) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    const file: any = picked.assets[0];
    setDocumentBusy('photo');
    try {
      const body = new FormData();
      const filename = `${documentStudent.registration_no || 'student'}.jpg`;
      if (Platform.OS === 'web' && file.file) body.append('photos', file.file, filename);
      else body.append('photos', { uri: file.uri, name: filename, type: file.mimeType || 'image/jpeg' } as any);
      await api('/api/student-transfer/photos', { method: 'POST', body });
      const refreshedStudent = await api(`/api/students/${documentStudent.id}`);
      setDocumentStudent(refreshedStudent.student || { ...documentStudent, photo_url: refreshedStudent.student?.photo_url });
      onRefresh();
      Alert.alert('Uploaded', 'Student photo uploaded successfully.');
    } catch (error: any) {
      Alert.alert('Upload failed', error.message || 'Unable to upload student photo.');
    } finally { setDocumentBusy(null); }
  };

  const handleStudentPhoto = async (mode: 'view' | 'download' | 'print') => {
    const photoUrl = documentStudent?.photo_url;
    if (!photoUrl) return;
    const url = /^https?:\/\//.test(photoUrl) ? photoUrl : API_BASE + photoUrl;
    let browserWindow: any = null;
    try {
      setDocumentBusy('photo-' + mode);
      if (Platform.OS === 'web') {
        if (mode === 'download') {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Could not load the student photo');
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = window.document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `${documentStudent.registration_no || 'student'}-photo.jpg`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        } else {
          browserWindow = window.open('about:blank', '_blank');
          if (!browserWindow) throw new Error('Browser blocked the new window');
          browserWindow.document.write(`<html><body style="margin:0;text-align:center"><img src="${url}" style="max-width:100%;max-height:100vh" /></body></html>`);
          browserWindow.document.close();
          if (mode === 'print') setTimeout(() => { try { browserWindow.focus(); browserWindow.print(); } catch {} }, 800);
        }
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable');
        const target = FileSystem.cacheDirectory + Date.now() + '-student-photo.jpg';
        const result = await FileSystem.downloadAsync(url, target);
        if (mode === 'print') await Print.printAsync({ uri: result.uri });
        else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
        else Alert.alert('Saved', result.uri);
      }
    } catch (error: any) {
      if (browserWindow) browserWindow.close();
      Alert.alert('Student Photo', error.message || 'Photo action failed');
    } finally { setDocumentBusy(null); }
  };

  const uploadSelectedDocuments = async () => {
    if (!documentStudent) return;
    const selected = Object.entries(pendingDocuments);
    if (!selected.length) return Alert.alert('Select files', 'Choose one or more document files first.');
    setDocumentBusy('upload');
    try {
      for (const [type, file] of selected) {
        const existing = documents.find(item => item.document_type === type || (type === 'hs_admit_3rd' && item.document_type === 'hs_admit'));
        const body = new FormData();
        if ((file as any).file) body.append('file', (file as any).file);
        else body.append('file', { uri: (file as any).uri, name: (file as any).name || type, type: (file as any).mimeType || 'application/octet-stream' } as any);
        body.append('document_type', type);
        body.append('document_title', DOCUMENT_SLOTS.find(item => item[0] === type)?.[1] || (file as any).name || 'Document');
        await api(existing ? '/api/documents/' + existing.id + '/replace' : '/api/documents/student/' + documentStudent.id, { method: 'POST', body });
      }
      setPendingDocuments({});
      const refreshed = await api('/api/documents/student/' + documentStudent.id);
      setDocuments(refreshed.documents || []);
      Alert.alert('Uploaded', selected.length + ' document(s) uploaded successfully.');
    } catch (error: any) { Alert.alert('Upload failed', error.message); }
    finally { setDocumentBusy(null); }
  };

  const documentFor = (type: string) => documents.find(item => item.document_type === type || (type === 'hs_admit_3rd' && item.document_type === 'hs_admit'));
  const previewUrl = (doc: any) => doc?.file_url && !/\.pdf(?:[?#]|$)/i.test(doc.file_url) ? doc.file_url : '';

  const documentFileName = (doc: any) => {
    const title = String(doc.document_title || doc.document_type || 'document').replace(/[\\/:*?"<>|]/g, '_');
    const match = String(doc.file_url || '').match(/(\.[a-z0-9]{1,8})(?:[?#]|$)/i);
    return title + (match ? match[1] : '');
  };

  const handleDocument = async (doc: any, mode: 'view' | 'download' | 'print') => {
    let browserWindow: any = null;
    try {
      setDocumentBusy(mode + '-' + doc.id);
      if (Platform.OS === 'web' && mode !== 'download' && typeof window !== 'undefined') {
        browserWindow = window.open('about:blank', '_blank');
      }
      const token = await getToken();
      const endpoint = mode === 'download' ? 'download' : 'file';
      const url = API_BASE + '/api/documents/' + doc.id + '/' + endpoint;
      if (Platform.OS === 'web') {
        const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        if (!response.ok) throw new Error('Could not load the document');
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (mode === 'download') {
          const anchor = window.document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = documentFileName(doc);
          window.document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
          return;
        }
        if (!browserWindow) throw new Error('Browser blocked the new window');
        browserWindow.location.href = objectUrl;
        if (mode === 'print') {
          setTimeout(() => {
            try { browserWindow.focus(); browserWindow.print(); } catch {}
          }, 1000);
        }
        setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
        return;
      }
      if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable');
      const target = FileSystem.cacheDirectory + Date.now() + '-' + documentFileName(doc);
      const result = await FileSystem.downloadAsync(url, target, { headers: { Authorization: 'Bearer ' + token } });
      if (result.status < 200 || result.status >= 300) throw new Error('Could not load the document');
      if (mode === 'print') {
        await Print.printAsync({ uri: result.uri });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        Alert.alert('Saved', result.uri);
      }
    } catch (error: any) {
      if (browserWindow) browserWindow.close();
      Alert.alert('Document', error.message || 'Document action failed');
    } finally {
      setDocumentBusy(null);
    }
  };

  return <View style={s.directory}>
    <View style={s.filters}>
      <Select label="Session" value={year} onChange={setYear} options={[{ value: 'all', label: 'All Sessions' }, ...sessions.map(session => ({ value: session, label: session }))]} />
      <Select label="Class" value={className} onChange={setClassName} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(c => ({ value: c, label: c }))]} />
      <Select label="Gender" value={gender} onChange={setGender} options={[{ value: 'all', label: 'All Genders' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
      <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'dropout', label: 'Dropout' }, { value: 'all', label: 'All Statuses' }]} />
    </View>
    <View style={s.toolbar}>
      <View style={s.inline}><Text>Show</Text><Select label="Entries per page" value={size} onChange={setSize} options={['10', '25', '50', '100', 'all'].map(value => ({ value, label: value === 'all' ? 'All' : value }))} /><Text>Entries</Text></View>
      <View style={s.inline}><Text>Search:</Text><TextInput accessibilityLabel="Search students" value={search} onChangeText={setSearch} style={s.search} placeholder="Name, Reg. or mobile" /></View>
      <TouchableOpacity accessibilityRole="button" onPress={onRefresh} style={s.select}><Text>Refresh</Text></TouchableOpacity>
    </View>
    {loading ? <ActivityIndicator style={{ margin: 20 }} /> : error ? <Text style={s.error}>{error}</Text> : <>
      <ScrollView horizontal>
        <View>
          <View style={[s.row, s.tableHead]}>{columns.map(([key, title, width]) => <TouchableOpacity key={key} disabled={['serial', 'photo', 'action'].includes(key)} accessibilityRole="button" style={[s.cell, { width }]} onPress={() => setSort({ key, ascending: sort.key === key ? !sort.ascending : true })}><Text style={s.columnTitle}>{title}{sort.key === key ? (sort.ascending ? ' -' : ' -') : ''}</Text></TouchableOpacity>)}</View>
          {rows.map((student, index) => <View key={student.id} style={[s.row, index % 2 === 0 && s.striped]}>
            {columns.map(([key, , width]) => <View key={key} style={[s.cell, { width }]}>
              {key === 'serial' ? <Text style={s.numberText}>{start + index + 1}</Text> : key === 'photo' ? <Photo student={student} /> : key === 'action' ? <View style={s.inline}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${student.student_name}`} style={[s.action, s.edit]} onPress={() => onEdit(student)}><Text>Edit</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`View ${student.student_name}`} style={[s.action, s.view]} onPress={() => openDetails(student)}><Text>View</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Documents for ' + student.student_name} style={[s.action, s.documents]} onPress={() => openDocuments(student)}><Text style={s.documentIcon}>{String.fromCodePoint(0x1F4C4)}</Text></TouchableOpacity>
                {student.is_active && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Mark ${student.student_name} as dropout`} style={[s.action, s.remove]} onPress={() => onDeactivate(student)}><Text style={{ color: '#fff' }}>-</Text></TouchableOpacity>}
              </View> : key === 'is_active' ? <Text style={{ color: student.is_active ? '#166534' : '#b91c1c', fontWeight: '700' }}>{student.is_active ? 'Active' : 'Dropout'}</Text>
                : <Text selectable style={[s.cellText, ['registration_no','monthly_fees','mobile_number','whatsapp_number','room_name'].includes(key) && s.numberText]}>{String(student[key] ?? '-')}</Text>}
            </View>)}
          </View>)}
        </View>
      </ScrollView>
      {!rows.length && <Text style={s.empty}>No students match these filters.</Text>}
      <View style={s.toolbar}><Text>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} entries</Text>
        <View style={s.inline}><TouchableOpacity accessibilityRole="button" disabled={currentPage === 1} onPress={() => setPage(currentPage - 1)} style={[s.select, currentPage === 1 && s.disabled]}><Text>Previous</Text></TouchableOpacity><Text>{currentPage} / {pages}</Text><TouchableOpacity accessibilityRole="button" disabled={currentPage === pages} onPress={() => setPage(currentPage + 1)} style={[s.select, currentPage === pages && s.disabled]}><Text>Next</Text></TouchableOpacity></View>
      </View>
    </>}
    <Modal visible={documentsOpen} transparent animationType="fade" onRequestClose={() => setDocumentsOpen(false)}>
       <View style={[s.overlay,s.documentOverlay]}><View style={s.documentPanel}>
        <View style={s.documentTopBar}><TouchableOpacity style={s.documentCloseButton} onPress={() => setDocumentsOpen(false)}><Text style={s.whiteText}>Close</Text></TouchableOpacity><Text style={s.lastUpdated}>Last Updated{documents[0]?.uploaded_at ? '\n' + String(documents[0].uploaded_at).slice(0, 16).replace('T', ' ') : ''}</Text></View>
        <Text style={s.registrationLine}>Reg. No. {documentStudent?.registration_no || '-'}</Text>
        {documentsLoading ? <ActivityIndicator style={{margin:30}}/> : documentsError ? <Text style={s.error}>{documentsError}</Text> : <ScrollView contentContainerStyle={s.documentGrid}>
           <View style={s.documentTile}><Text style={s.tileTitle}>Photo</Text><View style={s.previewBox}>{documentStudent?.photo_url?<Image source={{uri:/^https?:/.test(documentStudent.photo_url)?documentStudent.photo_url:API_BASE+documentStudent.photo_url}} resizeMode="contain" style={s.documentPreview}/>:<Text style={s.noPreview}>No photo</Text>}</View><TouchableOpacity disabled={documentBusy!==null} style={s.chooseButton} onPress={uploadStudentPhoto}><Text style={s.chooseText}>{documentBusy==='photo'?'Uploading...':'Upload / Change Photo'}</Text></TouchableOpacity><View style={s.tileActions}><TouchableOpacity accessibilityLabel="View student photo" disabled={!documentStudent?.photo_url||documentBusy!==null} style={[s.iconButton,s.viewIcon,!documentStudent?.photo_url&&s.disabled]} onPress={()=>handleStudentPhoto('view')}><Text style={s.iconText}>{String.fromCodePoint(0x1F441)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Print student photo" disabled={!documentStudent?.photo_url||documentBusy!==null} style={[s.iconButton,s.printIcon,!documentStudent?.photo_url&&s.disabled]} onPress={()=>handleStudentPhoto('print')}><Text style={s.iconText}>{String.fromCodePoint(0x1F5A8)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Download student photo" disabled={!documentStudent?.photo_url||documentBusy!==null} style={[s.iconButton,s.downloadIcon,!documentStudent?.photo_url&&s.disabled]} onPress={()=>handleStudentPhoto('download')}><Text style={s.iconText}>{String.fromCodePoint(0x2B07)}</Text></TouchableOpacity></View></View>
           {DOCUMENT_SLOTS.map(([type,label])=>{const doc=documentFor(type),pending=pendingDocuments[type],preview=pending?.uri||previewUrl(doc),displayLabel=label.replace(' Photo','').replace('Visitor-','Visitor_');return <View key={type} style={s.documentTile}><Text numberOfLines={1} style={s.tileTitle}>{displayLabel}</Text><View style={s.previewBox}>{preview?<Image source={{uri:preview}} resizeMode="contain" style={s.documentPreview}/>:<Text style={s.noPreview}>{doc?'PDF / File':'No document'}</Text>}</View><TouchableOpacity disabled={documentBusy!==null} style={s.chooseButton} onPress={()=>chooseDocument(type)}><Text numberOfLines={1} style={s.chooseText}>{pending?pending.name:'Choose File'}</Text></TouchableOpacity><View style={s.tileActions}><TouchableOpacity accessibilityLabel={'View '+displayLabel} disabled={!doc||documentBusy!==null} style={[s.iconButton,s.viewIcon,!doc&&s.disabled]} onPress={()=>doc&&handleDocument(doc,'view')}><Text style={s.iconText}>{String.fromCodePoint(0x1F441)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel={'Print '+displayLabel} disabled={!doc||documentBusy!==null} style={[s.iconButton,s.printIcon,!doc&&s.disabled]} onPress={()=>doc&&handleDocument(doc,'print')}><Text style={s.iconText}>{String.fromCodePoint(0x1F5A8)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel={'Download '+displayLabel} disabled={!doc||documentBusy!==null} style={[s.iconButton,s.downloadIcon,!doc&&s.disabled]} onPress={()=>doc&&handleDocument(doc,'download')}><Text style={s.iconText}>{String.fromCodePoint(0x2B07)}</Text></TouchableOpacity></View></View>})}
        </ScrollView>}
        <TouchableOpacity disabled={documentBusy!==null} onPress={uploadSelectedDocuments} style={[s.uploadAllButton,documentBusy!==null&&s.disabled]}><Text style={s.whiteText}>{documentBusy==='upload'?'Uploading...':'Upload Selected Documents'}</Text></TouchableOpacity>
        {documentBusy && documentBusy!=='upload' && <Text style={s.busyText}>Preparing document...</Text>}
      </View></View>
    </Modal>
    <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}><View style={s.overlay}><View style={s.detailPanel}>
      <View style={s.modalHeader}><Text style={s.modalTitle}>Student Details</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close student details" onPress={() => setDetailOpen(false)}><Text style={s.close}>-</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={{ padding: 18 }}>{detailLoading ? <ActivityIndicator /> : detailError ? <Text style={s.error}>{detailError}</Text> : detail && <><Photo student={detail} /><Text style={s.panelTitle}>{detail.student_name}</Text><RecordDetails record={detail} /></>}</ScrollView>
    </View></View></Modal>
  </View>;
}

function Photo({ student, large = false }: { student: any; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const path = student.photo_url;
  return path && !failed ? <Image accessibilityLabel={`${student.student_name} photo`} onError={() => setFailed(true)} source={{ uri: /^https?:\/\//.test(path) ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}` }} style={[s.photo, large && s.largePhoto]} />
    : <View style={[s.photo, s.avatar, large && s.largePhoto]}><Text>{String(student.student_name || '?').charAt(0)}</Text></View>;
}

function RecordDetails({ record }: { record: any }) {
  return <>{Object.entries(record).filter(([key, value]) => !['id', 'room_id', 'room_name', 'photo_url', 'created_at', 'updated_at', 'user_id', 'visitor1', 'visitor2'].includes(key) && value !== null && value !== '').map(([key, value]) => <View key={key} style={s.detailRow}><Text style={s.detailLabel}>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text><Text selectable style={{ flex: 1 }}>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</Text></View>)}
    {(record.room_number || record.room_name) && <View style={s.detailRow}><Text style={s.detailLabel}>Room Number</Text><Text selectable style={{ flex: 1 }}>{record.room_number || record.room_name}</Text></View>}
    {['visitor1', 'visitor2'].map((key, index) => record[key] && <View key={key}><Text style={s.panelTitle}>Visitor {index + 1}</Text><RecordDetails record={record[key]} /></View>)}
  </>;
}

const s = StyleSheet.create({
  directory: { backgroundColor: '#fff', padding: 12, borderWidth: 1, borderColor: '#ccd5df', borderRadius: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: '#add8e6', padding: 8, borderRadius: 4 },
  select: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42, justifyContent: 'center' },
  selectText: { color: '#000000', fontSize: 17, fontFamily: 'Constantia' }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 }, search: { borderWidth: 1, borderColor: '#aeb5bd', borderRadius: 3, width: 190, padding: 9, fontSize: 17, color: '#000000', fontFamily: 'Constantia' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#c3c7cc', minHeight: 48, alignItems: 'center' }, tableHead: { backgroundColor: '#cfe2ff', minHeight: 38 },
  cell: { paddingHorizontal: 7, paddingVertical: 6 }, cellText: { fontSize: 16, color: '#000000', fontFamily: 'Constantia' }, numberText: { fontFamily: 'Arial' }, columnTitle: { fontSize: 16, fontWeight: '900', color: '#000000', fontFamily: 'Constantia' }, striped: { backgroundColor: '#f1f1f1' },
  photo: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#94a3b8' }, avatar: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  action: { paddingHorizontal: 7, minHeight: 36, justifyContent: 'center', borderRadius: 4 }, edit: { backgroundColor: '#ffc107' }, view: { backgroundColor: '#22d3ee' }, documents: { backgroundColor: '#0ea5e9', minWidth: 36, alignItems: 'center' }, documentIcon: { color: '#fff', fontSize: 20, fontWeight: '900' }, remove: { backgroundColor: '#e11d48' },
  empty: { padding: 24, textAlign: 'center', color: '#64748b' }, disabled: { opacity: 0.4 }, error: { padding: 16, color: '#b91c1c' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 16 }, selectPanel: { backgroundColor: '#fff', padding: 16, borderRadius: 12, width: '100%', maxWidth: 340, maxHeight: '75%' },
  option: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#edf2f7' }, selected: { backgroundColor: '#dbeafe' }, panelTitle: { fontWeight: '800', fontSize: 17, marginVertical: 12 },
  detailPanel: { backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '90%', overflow: 'hidden' },
  documentOverlay: { backgroundColor: '#fff', padding: 8 },
  documentPanel: { backgroundColor: '#fff', borderRadius: 7, width: '100%', maxWidth: 1760, height: '100%', overflow: 'hidden' },
  documentContent: { padding: 18, gap: 10 },
  studentDocumentHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#eff6ff', borderRadius: 10, padding: 14 },
  largePhoto: { width: 76, height: 76, borderRadius: 38 },
  documentStudentName: { fontSize: 20, fontWeight: '800', color: '#172b4d' },
  documentMeta: { color: '#64748b', fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  documentCard: { borderWidth: 1, borderColor: '#dbe3eb', borderRadius: 10, padding: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  documentTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  docAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 6 },
  download: { backgroundColor: '#2563eb' },
  print: { backgroundColor: '#475569' },
  whiteText: { color: '#fff', fontWeight: '700' },
  busyText: { textAlign: 'center', color: '#1565c0', fontWeight: '700', padding: 8 },
  documentTopBar:{minHeight:44,marginHorizontal:14,marginTop:12,backgroundColor:'#eef6fc',borderWidth:1,borderColor:'#64748b',borderRadius:5,padding:5,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},documentCloseButton:{backgroundColor:'#dc3545',paddingHorizontal:12,paddingVertical:8,borderRadius:4},lastUpdated:{fontSize:9,textAlign:'right',color:'#475569'},registrationLine:{paddingHorizontal:16,paddingTop:8,color:'#475569',fontSize:16},documentGrid:{padding:14,flexDirection:'row',flexWrap:'wrap',gap:18,justifyContent:'space-around',alignItems:'flex-start'},documentTile:{width:210,minHeight:270,borderWidth:1,borderColor:'#aeb7c1',borderRadius:7,backgroundColor:'#f8fafc',overflow:'hidden'},tileTitle:{textAlign:'center',fontSize:17,paddingVertical:4,color:'#111827',backgroundColor:'#fff'},previewBox:{height:172,marginHorizontal:15,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},documentPreview:{width:'100%',height:'100%'},noPreview:{color:'#94a3b8',fontSize:12},chooseButton:{height:29,backgroundColor:'#60a5fa',justifyContent:'center',paddingHorizontal:6},chooseText:{fontSize:11,color:'#0f172a'},tileActions:{minHeight:43,backgroundColor:'#d1d5db',flexDirection:'row',justifyContent:'space-around',alignItems:'center',padding:4},iconButton:{minWidth:38,alignItems:'center',paddingHorizontal:8,paddingVertical:7,borderRadius:4},viewIcon:{backgroundColor:'#0d6efd'},printIcon:{backgroundColor:'#059669'},downloadIcon:{backgroundColor:'#06b6d4'},iconText:{color:'#fff',fontSize:19,fontWeight:'800',lineHeight:21},uploadAllButton:{alignSelf:'center',backgroundColor:'#0d6efd',paddingHorizontal:18,paddingVertical:11,borderRadius:6,marginBottom:14},
    modalHeader: { backgroundColor: '#11101e', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' }, close: { color: '#fff', fontSize: 28, paddingHorizontal: 8 }, detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }, detailLabel: { width: '42%', color: '#475569', fontWeight: '600' },
});
