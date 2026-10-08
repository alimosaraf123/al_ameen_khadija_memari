import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AcademyHeader from '../components/AcademyHeader';
import { API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';

type Asset = DocumentPicker.DocumentPickerAsset;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function attachFile(form: FormData, key: string, file: Asset) {
  if (Platform.OS === 'web') {
    const blob = file.file || await (await fetch(file.uri)).blob();
    form.append(key, blob, file.name);
  } else {
    form.append(key, { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
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
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [excel, setExcel] = useState<Asset | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [photoResults, setPhotoResults] = useState<any[]>([]);
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError(''); setMessage('');
    try { await action(); } catch (e: any) { setError(e.message || 'Operation failed'); }
    finally { setBusy(''); }
  };
  const download = (template: boolean) => run('Downloading Excel...', async () => {
    const endpoint = '/excel' + (template ? '?template=true' : '');
    const name = template ? 'student-template.xlsx' : 'students.xlsx';
    if (Platform.OS === 'web') {
      const response = await request(endpoint);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage('Excel download started.');
    } else {
      const token = await getToken();
      const downloadDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!downloadDirectory) throw new Error('A writable download folder is unavailable on this device.');
      const target = downloadDirectory + Date.now() + '-' + name;
      const result = await FileSystem.downloadAsync(API_BASE + '/api/student-transfer' + endpoint, target, { headers: { Authorization: 'Bearer ' + token } });
      if (result.status !== 200) { await FileSystem.deleteAsync(target, { idempotent: true }); throw new Error('Download failed. Please sign in again or retry.'); }
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(result.uri, { mimeType: XLSX, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
      setMessage('Excel file ready. Use the share menu to save it.');
    }
  });
  const chooseExcel = () => run('Checking Excel...', async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: [XLSX, 'application/octet-stream'], copyToCacheDirectory: true });
    if (result.canceled) return;
    setPreview(null); setExcel(null);
    const file = result.assets[0];
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Please select an .xlsx file.');
    if (file.size && file.size > 10 * 1024 * 1024) throw new Error('Excel file must be under 10 MB.');
    const form = new FormData(); await attachFile(form, 'file', file);
    const data = await (await request('/excel/preview', form)).json();
    setExcel(file); setPreview(data);
  });
  const importExcel = () => run('Importing students...', async () => {
    if (!excel || !preview || preview.errors.length) return;
    const form = new FormData(); await attachFile(form, 'file', excel);
    const data = await (await request('/excel/import', form)).json();
    setMessage('Import complete: ' + data.created + ' students added, ' + data.updated + ' updated.');
    setPreview(null); setExcel(null);
  });
  const choosePhotos = () => run('Selecting photos...', async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    if (result.assets.length > 100) throw new Error('Select up to 100 photos at a time.');
    const seen = new Set<string>();
    for (const file of result.assets) {
      if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error(file.name + ': use JPG, PNG or WebP.');
      if (file.size && file.size > 5 * 1024 * 1024) throw new Error(file.name + ': photo exceeds 5 MB.');
      const registration = file.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
      if (seen.has(registration)) throw new Error('More than one photo selected for registration ' + registration);
      seen.add(registration);
    }
    setPhotos(result.assets); setPhotoResults([]);
  });
  const uploadPhotos = () => run('Uploading photos...', async () => {
    const allResults: any[] = [];
    setPhotoResults([]);
    for (let start = 0; start < photos.length; start += 10) {
      const batch = photos.slice(start, start + 10);
      setBusy('Uploading photos ' + (start + 1) + '–' + Math.min(start + 10, photos.length) + ' of ' + photos.length);
      const form = new FormData();
      for (const photo of batch) await attachFile(form, 'photos', photo);
      const data = await (await request('/photos', form)).json();
      allResults.push(...data.results); setPhotoResults([...allResults]);
    }
    const uploaded = allResults.filter(result => result.success).length;
    setMessage(uploaded + ' photos uploaded; ' + (allResults.length - uploaded) + ' not uploaded.');
    setPhotos([]);
  });
  const action = (title: string, onPress: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!busy || disabled }} disabled={!!busy || disabled} onPress={onPress} style={[s.button, (!!busy || disabled) && s.disabled]}><Text style={s.buttonText}>{title}</Text></TouchableOpacity>;

  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <AcademyHeader />
    <TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/students')} style={s.backButton}><Text style={s.backText}>← Back to Students</Text></TouchableOpacity>
    <Text style={s.title}>Student Excel & Bulk Photos</Text>
    {!!busy && <View style={s.notice}><ActivityIndicator /><Text>{busy}</Text></View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!message && <Text accessibilityRole="alert" style={s.success}>{message}</Text>}
    <View style={s.card}>
      <Text style={s.heading}>Excel Download</Text>
      <Text style={s.help}>Download all Active and Dropout student records, or start with an empty template.</Text>
      <View style={s.actions}>{action('Download Students (.xlsx)', () => download(false))}{action('Download Template', () => download(true))}</View>
    </View>
    <View style={s.card}>
      <Text style={s.heading}>Excel Upload</Text>
      <Text style={s.help}>Complete the Students sheet in the template. Registration number and student name are required. Existing registration numbers will be updated; blank cells will keep old values. Maximum 2,000 students / 10 MB.</Text>
      {action('Choose Excel & Preview', chooseExcel)}
      {preview && <View style={s.preview}>
        <Text style={s.heading}>{excel?.name}</Text>
        <Text>New: {preview.created}   Update: {preview.updated}   Errors: {preview.errors.length}</Text>
        {preview.errors.map((item: any, index: number) => <Text key={index} style={s.error}>Row {item.row || '—'}: {item.message}</Text>)}
        {action('Import ' + preview.total + ' Students', importExcel, !!preview.errors.length)}
      </View>}
    </View>
    <View style={s.card}>
      <Text style={s.heading}>Bulk Student Photos</Text>
      <Text style={s.help}>Name each photo with its registration number: 75276.jpg, 75566.png. JPG, PNG, or WebP; maximum 5 MB per photo. You can select up to 100 photos at once. A matching number will replace the existing profile photo.</Text>
      {action('Choose Photos', choosePhotos)}
      {!!photos.length && <><Text style={s.help}>{photos.length} photos selected</Text><Text style={s.help}>{photos.map(photo => photo.name).join(', ')}</Text>{action('Upload ' + photos.length + ' Photos', uploadPhotos)}</>}
      {photoResults.map((result, index) => <Text key={index} style={result.success ? s.success : s.error}>{result.file}: {result.success ? 'Uploaded' : result.message}</Text>)}
    </View>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f6f9' }, content: { padding: 16, paddingBottom: 60, width: '100%', maxWidth: 960, alignSelf: 'center' },
  backButton: { alignSelf: 'flex-start', backgroundColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginBottom: 12 },
  backText: { color: '#163451', fontWeight: '700' },
  title: { fontSize: 23, fontWeight: '800', color: '#163451', marginBottom: 18 }, card: { backgroundColor: '#fff', padding: 18, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: '#dde5ed' },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 10 }, help: { color: '#475569', lineHeight: 23, marginBottom: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, button: { padding: 14, minHeight: 46, backgroundColor: '#1565c0', borderRadius: 8, marginVertical: 6 }, buttonText: { color: '#fff', textAlign: 'center', fontWeight: '700' }, disabled: { opacity: 0.45 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#dbeafe', marginBottom: 12 }, error: { color: '#b91c1c', marginVertical: 8, lineHeight: 21 }, success: { color: '#166534', marginVertical: 8, lineHeight: 21 }, preview: { backgroundColor: '#eff6ff', padding: 14, marginTop: 12, borderRadius: 10 },
});
