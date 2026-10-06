import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  Alert,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { File as ExpoFile } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { fetch as expoFetch } from 'expo/fetch';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { api, API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';
import { Field, Button, Card, H1, Muted } from '../components/ui';
import PageNavigation from '../components/PageNavigation';

type StudentDocument = {
  id: number;
  student_id: number;
  document_type: string;
  document_title?: string;
  file_url?: string;
  guardian_visible: boolean;
  guardian_download_allowed: boolean;
  uploaded_at?: string;
};

const DOCUMENT_TYPES = [
  { key: 'photo', label: 'Student Photo' },
  { key: 'father_photo', label: 'Father Photo' },
  { key: 'mother_photo', label: 'Mother Photo' },
  { key: 'visitor1_photo', label: 'Visitor-1 Photo' },
  { key: 'visitor2_photo', label: 'Visitor-2 Photo' },
  { key: 'birth_certificate', label: 'Date of Birth Certificate' },
  { key: 'mp_admit', label: 'MP Admit' },
  { key: 'mp_marksheet', label: 'MP Marksheet' },
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'bank_passbook', label: 'Bank Passbook' },
  { key: 'obc_certificate', label: 'OBC Certificate' },
  { key: 'ph_certificate', label: 'P.H. Certificate' },
  { key: 'xi_registration', label: 'XI Registration' },
  { key: 'hs_admit_3rd', label: 'HS Admit 3rd Semester' },
  { key: 'hs_admit_4th', label: 'HS Admit 4th Semester' },
  { key: 'hs_marksheet', label: 'H.S Marksheet' },
  { key: 'hs_certificate', label: 'H.S Certificate' },
  { key: 'admission_slip', label: 'Admission Slip' },
  { key: 'signature', label: 'Signature' },
  { key: 'transfer_certificate', label: 'T.C.' },
  { key: 'other', label: 'Others' },
  { key: 'other_2', label: 'Others-2' },
  { key: 'other_3', label: 'Others-3' },
];

function safeFileName(name: string) {
  return (name || 'document')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

function extensionFromDocument(doc: StudentDocument) {
  const fromUrl = doc.file_url || '';
  const match = fromUrl.match(/(\.[A-Za-z0-9]{1,8})$/);
  return match ? match[1] : '';
}

function mimeFromDocument(doc: StudentDocument) {
  const value = String(doc.file_url || '').toLowerCase();

  if (value.endsWith('.pdf')) return 'application/pdf';
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.webp')) return 'image/webp';
  if (value.endsWith('.gif')) return 'image/gif';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
}

function fileNameForDocument(doc: StudentDocument) {
  const ext = extensionFromDocument(doc);

  return (
    safeFileName(
      doc.document_title ||
      doc.document_type ||
      'document'
    ) + ext
  );
}

function canRenderAsImage(uri: string) {
  return new Promise<boolean>((resolve) => {
    Image.getSize(
      uri,
      () => resolve(true),
      () => resolve(false)
    );
  });
}

async function responseMessage(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { message: text || 'Request failed' };
  }
}


async function saveBlobOnWeb(
  blob: Blob,
  fileName: string,
  mimeType: string
) {
  const browserWindow: any =
    typeof window !== 'undefined'
      ? window
      : null;

  if (!browserWindow) {
    throw new Error(
      'Browser download is not available'
    );
  }

  if (
    typeof browserWindow.showSaveFilePicker ===
    'function'
  ) {
    const extension =
      fileName.includes('.')
        ? `.${fileName.split('.').pop()}`
        : '';

    const options: any = {
      suggestedName: fileName,
    };

    if (extension) {
      options.types = [
        {
          description: 'Document',
          accept: {
            [mimeType ||
              'application/octet-stream']: [
              extension,
            ],
          },
        },
      ];
    }

    const handle =
      await browserWindow.showSaveFilePicker(
        options
      );

    const writable =
      await handle.createWritable();

    await writable.write(blob);
    await writable.close();

    return;
  }

  const objectUrl =
    URL.createObjectURL(blob);

  const link =
    document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function showValue(value: any) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value);
}

function showDate(value: any) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{showValue(value)}</Text>
    </View>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoSection}>
      <Text style={styles.infoSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function Documents() {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [visitor1, setVisitor1] = useState<any>(null);
  const [visitor2, setVisitor2] = useState<any>(null);

  const [list, setList] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [otherTitle, setOtherTitle] = useState('');
  const [legacyEmail,setLegacyEmail]=useState('');
  const [legacyPassword,setLegacyPassword]=useState('');
  const [legacySession,setLegacySession]=useState(String(new Date().getFullYear()));
  const [legacyBusy,setLegacyBusy]=useState(false);
  const [bulkXiBusy,setBulkXiBusy]=useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewObjectUrl, setPreviewObjectUrl] =
    useState<string | null>(null);

  const closePreview = () => {
    if (
      Platform.OS === 'web' &&
      previewObjectUrl &&
      typeof URL !== 'undefined'
    ) {
      URL.revokeObjectURL(previewObjectUrl);
    }

    setPreviewObjectUrl(null);
    setPreviewUri(null);
  };

  const loadStudents = async () => {
    try {
      const data = await api('/api/students');
      setStudents(data.students || []);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return [];

    return students
      .filter((s) => {
        const fields = [
          s.registration_no,
          s.student_name,
          s.class_name,
          s.father_name,
          s.mother_name,
          s.mobile_number,
          s.guardian_mobile,
          s.father_mobile,
        ];

        return fields.some((x) =>
          String(x || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [search, students]);

  const loadDocuments = async (studentId?: number) => {
    const id = studentId || selectedStudent?.id;
    if (!id) return;

    setLoading(true);

    try {
      const data = await api(`/api/documents/student/${id}`);
      setList(data.documents || []);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectStudent = async (student: any) => {
    setStudentLoading(true);
    setSearch('');
    setList([]);
    setVisitor1(null);
    setVisitor2(null);

    try {
      const data = await api(`/api/students/${student.id}`);

      const fullStudent = data.student || data;

      setSelectedStudent({
        ...student,
        ...fullStudent,
      });

      setVisitor1(
        data.visitor1 ||
        data.visitor_1 ||
        fullStudent.visitor1 ||
        fullStudent.visitor_1 ||
        null
      );

      setVisitor2(
        data.visitor2 ||
        data.visitor_2 ||
        fullStudent.visitor2 ||
        fullStudent.visitor_2 ||
        null
      );

      await loadDocuments(student.id);
    } catch (e: any) {
      setSelectedStudent(student);
      await loadDocuments(student.id);

      Alert.alert(
        'Student details',
        'Student selected, but full details could not be loaded.'
      );
    } finally {
      setStudentLoading(false);
    }
  };

  const pickFile = async () => {
    if (Platform.OS === 'web') {
      const picked =
        await DocumentPicker.getDocumentAsync({
          type: ['image/*', 'application/pdf'],
          multiple: false,
        });

      if (picked.canceled) {
        return null;
      }

      const asset = picked.assets[0];

      return {
        platform: 'web' as const,
        name: asset.name,
        mimeType:
          asset.mimeType ||
          'application/octet-stream',
        uri: asset.uri,
        webFile: (asset as any).file || null,
      };
    }

    const picked = await ExpoFile.pickFileAsync({
      multipleFiles: false,
      mimeTypes: ['image/*', 'application/pdf'],
    });

    if ((picked as any).canceled) {
      return null;
    }

    const file = (picked as any).result;

    return {
      platform: 'native' as const,
      name: file.name,
      mimeType:
        file.type ||
        'application/octet-stream',
      nativeFile: file,
    };
  };

  const appendPickedFile = async (
    fd: FormData,
    picked: any
  ) => {
    if (picked.platform === 'web') {
      if (picked.webFile) {
        fd.append(
          'file',
          picked.webFile,
          picked.name
        );
        return;
      }

      const fileResponse =
        await fetch(picked.uri);

      const blob =
        await fileResponse.blob();

      fd.append(
        'file',
        blob,
        picked.name
      );

      return;
    }

    fd.append(
      'file',
      picked.nativeFile as any
    );
  };

  const sendMultipart = async (
    url: string,
    fd: FormData,
    token: string | null
  ) => {
    const request = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: fd,
    };

    if (Platform.OS === 'web') {
      return fetch(
        url,
        request as any
      );
    }

    return expoFetch(
      url,
      request as any
    );
  };

  const uploadNew = async (
    documentType: string,
    defaultTitle: string
  ) => {
    if (!selectedStudent) {
      Alert.alert(
        'Student required',
        'Please select a student first'
      );
      return;
    }

    try {
      setBusyKey(`upload-${documentType}`);

      const picked = await pickFile();
      if (!picked) return;

      const token = await getToken();

      const fd = new FormData();

      fd.append(
        'document_type',
        documentType
      );

      fd.append(
        'document_title',
        documentType === 'other'
          ? otherTitle.trim() || picked.name
          : defaultTitle
      );

      fd.append(
        'guardian_visible',
        'true'
      );

      fd.append(
        'guardian_download_allowed',
        'true'
      );

      await appendPickedFile(
        fd,
        picked
      );

      const response =
        await sendMultipart(
          `${API_BASE}/api/documents/student/${selectedStudent.id}`,
          fd,
          token
        );

      const data =
        await responseMessage(
          response as any
        );

      if (!response.ok) {
        throw new Error(
          data.message ||
          'Upload failed'
        );
      }

      setOtherTitle('');
      await loadDocuments();

      Alert.alert(
        'Success',
        'Document uploaded successfully'
      );
    } catch (e: any) {
      Alert.alert(
        'Upload Error',
        e?.message ||
        'Upload failed'
      );
    } finally {
      setBusyKey(null);
    }
  };

  const bulkUploadXiRegistration = async () => {
    try {
      setBulkXiBusy(true);
      const picked = await pickFile();
      if (!picked) return;
      if (!String(picked.mimeType || '').toLowerCase().includes('pdf') && !String(picked.name || '').toLowerCase().endsWith('.pdf')) {
        throw new Error('Please select the XI Registration PDF file.');
      }
      const token = await getToken();
      const fd = new FormData();
      await appendPickedFile(fd, picked);
      const response = await sendMultipart(`${API_BASE}/api/documents/bulk/xi-registration`, fd, token);
      const data = await responseMessage(response as any);
      if (!response.ok) throw new Error(data.message || 'Bulk upload failed');
      const result = data.result || {};
      Alert.alert('XI Registration bulk upload', `Uploaded: ${result.uploaded?.length || 0}\nSkipped: ${result.skipped?.length || 0}\nUnmatched: ${result.unmatched?.length || 0}`);
    } catch (e: any) {
      Alert.alert('Bulk upload', e.message || 'Bulk upload failed');
    } finally {
      setBulkXiBusy(false);
    }
  };

  const bulkUploadBirthCertificate = async () => {
    try {
      setBulkXiBusy(true);
      const picked = await pickFile();
      if (!picked) return;
      if (!String(picked.mimeType || '').toLowerCase().includes('pdf') && !String(picked.name || '').toLowerCase().endsWith('.pdf')) throw new Error('Please select the Class XII Birth Certificate PDF file.');
      const token = await getToken();
      const fd = new FormData();
      await appendPickedFile(fd, picked);
      const response = await sendMultipart(`${API_BASE}/api/documents/bulk/xi-registration?document_type=birth_certificate`, fd, token);
      const data = await responseMessage(response as any);
      if (!response.ok) throw new Error(data.message || 'Bulk upload failed');
      const result = data.result || {};
      Alert.alert('Birth Certificate bulk upload', `Uploaded: ${result.uploaded?.length || 0}\nSkipped: ${result.skipped?.length || 0}\nUnmatched: ${result.unmatched?.length || 0}`);
    } catch (e: any) {
      Alert.alert('Bulk upload', e.message || 'Bulk upload failed');
    } finally {
      setBulkXiBusy(false);
    }
  };

  const replaceDocument = async (
    doc: StudentDocument
  ) => {
    try {
      setBusyKey(`replace-${doc.id}`);

      const picked = await pickFile();
      if (!picked) return;

      const token = await getToken();

      const fd = new FormData();

      fd.append(
        'document_title',
        doc.document_title ||
        picked.name
      );

      await appendPickedFile(
        fd,
        picked
      );

      const response =
        await sendMultipart(
          `${API_BASE}/api/documents/${doc.id}/replace`,
          fd,
          token
        );

      const data =
        await responseMessage(
          response as any
        );

      if (!response.ok) {
        throw new Error(
          data.message ||
          'Replace failed'
        );
      }

      await loadDocuments();

      Alert.alert(
        'Success',
        'Document changed successfully'
      );
    } catch (e: any) {
      Alert.alert(
        'Replace Error',
        e?.message ||
        'Replace failed'
      );
    } finally {
      setBusyKey(null);
    }
  };

  const updatePermissions = async (
    doc: StudentDocument,
    changes: Partial<StudentDocument>
  ) => {
    try {
      setBusyKey(`permission-${doc.id}`);

      let nextVisible =
        changes.guardian_visible ??
        doc.guardian_visible;

      let nextDownload =
        changes.guardian_download_allowed ??
        doc.guardian_download_allowed;

      if (nextVisible === false) {
        nextDownload = false;
      }

      if (nextDownload === true) {
        nextVisible = true;
      }

      await api(
        `/api/documents/${doc.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            document_title:
              doc.document_title ||
              doc.document_type,
            guardian_visible:
              nextVisible,
            guardian_download_allowed:
              nextDownload,
          }),
        }
      );

      await loadDocuments();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusyKey(null);
    }
  };

  const getProtectedFile = async (
    doc: StudentDocument,
    mode: 'view' | 'download'
  ) => {
    let webPdfWindow: any = null;

    try {
      setBusyKey(`${mode}-${doc.id}`);

      const token = await getToken();
      const localName =
        fileNameForDocument(doc);
      const mimeType =
        mimeFromDocument(doc);

      // WEB: browser preview/download
      if (Platform.OS === 'web') {
        if (
          mode === 'view' &&
          mimeType === 'application/pdf' &&
          typeof window !== 'undefined'
        ) {
          webPdfWindow =
            window.open(
              'about:blank',
              '_blank'
            );
        }

        const response = await fetch(
          `${API_BASE}/api/documents/${doc.id}/${
            mode === 'view'
              ? 'file'
              : 'download'
          }`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          const errorData =
            await responseMessage(
              response as any
            );

          throw new Error(
            errorData.message ||
            'Could not load the document'
          );
        }

        const blob =
          await response.blob();

        const objectUrl =
          URL.createObjectURL(blob);

        if (mode === 'download') {
          // We already have the protected file as a Blob.
          // Use the browser's Save As dialog when available.
          URL.revokeObjectURL(objectUrl);

          await saveBlobOnWeb(
            blob,
            localName,
            blob.type || mimeType
          );

          Alert.alert(
            'Download complete',
            `${localName} saved successfully.`
          );

          return;
        }

        if (
          blob.type.startsWith(
            'image/'
          ) ||
          mimeType.startsWith(
            'image/'
          )
        ) {
          if (previewObjectUrl) {
            URL.revokeObjectURL(
              previewObjectUrl
            );
          }

          setPreviewObjectUrl(
            objectUrl
          );

          setPreviewTitle(
            doc.document_title ||
            doc.document_type ||
            'Document'
          );

          setPreviewUri(
            objectUrl
          );

          return;
        }

        if (webPdfWindow) {
          webPdfWindow.location.href =
            objectUrl;

          setTimeout(
            () =>
              URL.revokeObjectURL(
                objectUrl
              ),
            60000
          );

          return;
        }

        const opened =
          window.open(
            objectUrl,
            '_blank'
          );

        if (!opened) {
          throw new Error(
            'Browser blocked the preview window'
          );
        }

        setTimeout(
          () =>
            URL.revokeObjectURL(
              objectUrl
            ),
          60000
        );

        return;
      }

      // MOBILE: existing secure local flow
      const target =
        `${FileSystem.cacheDirectory}${Date.now()}-${localName}`;

      const result =
        await FileSystem.downloadAsync(
          `${API_BASE}/api/documents/${doc.id}/${
            mode === 'view'
              ? 'file'
              : 'download'
          }`,
          target,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (
        result.status < 200 ||
        result.status >= 300
      ) {
        throw new Error(
          'Could not load the document'
        );
      }

      if (mode === 'view') {
        const isImage =
          await canRenderAsImage(
            result.uri
          );

        if (isImage) {
          setPreviewTitle(
            doc.document_title ||
            doc.document_type ||
            'Document'
          );

          setPreviewUri(
            result.uri
          );

          return;
        }

        if (
          Platform.OS === 'android'
        ) {
          const contentUri =
            await FileSystem
              .getContentUriAsync(
                result.uri
              );

          await IntentLauncher
            .startActivityAsync(
              'android.intent.action.VIEW',
              {
                data: contentUri,
                flags: 1,
                type: mimeType,
              }
            );

          return;
        }

        Alert.alert(
          'View',
          'This file is not an image and needs an external viewer.'
        );

        return;
      }

      if (
        Platform.OS === 'android'
      ) {
        const permission =
          await FileSystem
            .StorageAccessFramework
            .requestDirectoryPermissionsAsync();

        if (!permission.granted) {
          Alert.alert(
            'Download cancelled',
            'Folder permission was not granted.'
          );

          return;
        }

        const base64 =
          await FileSystem
            .readAsStringAsync(
              result.uri,
              {
                encoding:
                  FileSystem
                    .EncodingType
                    .Base64,
              }
            );

        const savedUri =
          await FileSystem
            .StorageAccessFramework
            .createFileAsync(
              permission.directoryUri,
              localName,
              mimeType
            );

        await FileSystem
          .writeAsStringAsync(
            savedUri,
            base64,
            {
              encoding:
                FileSystem
                  .EncodingType
                  .Base64,
            }
          );

        Alert.alert(
          'Download complete',
          `${localName} saved successfully.`
        );

        return;
      }

      Alert.alert(
        'Download',
        'Direct folder download is currently configured for Android.'
      );
    } catch (e: any) {
      if (
        webPdfWindow &&
        !webPdfWindow.closed
      ) {
        webPdfWindow.close();
      }

      Alert.alert(
        mode === 'view'
          ? 'View Error'
          : 'Download Error',
        e?.message ||
          (mode === 'view'
            ? 'Could not open the document'
            : 'Could not download the document')
      );
    } finally {
      setBusyKey(null);
    }
  };

  const getDocumentByType = (type: string) => {
    if (type === 'other') return null;

    return (
      list.find(
        (doc) => doc.document_type === type || (type === 'hs_admit_3rd' && doc.document_type === 'hs_admit')
      ) || null
    );
  };

  const otherDocuments = list.filter(
    (doc) => doc.document_type === 'other'
  );

  const renderExistingDocument = (
    doc: StudentDocument
  ) => (
    <View
      key={doc.id}
      style={styles.existingBox}
    >
      <Text style={styles.fileTitle}>
        {doc.document_title || doc.document_type}
      </Text>

      <Text style={styles.fileMeta}>
        Uploaded:{' '}
        {doc.uploaded_at
          ? String(doc.uploaded_at).slice(0, 10)
          : '-'}
      </Text>

      <View style={styles.actionRow}>
        <SmallButton
          title="View"
          onPress={() =>
            getProtectedFile(doc, 'view')
          }
          disabled={busyKey !== null}
        />

        <SmallButton
          title="Download"
          onPress={() =>
            getProtectedFile(doc, 'download')
          }
          disabled={busyKey !== null}
        />

        <SmallButton
          title="Change"
          onPress={() => replaceDocument(doc)}
          disabled={busyKey !== null}
        />

      </View>

      <Text style={styles.permissionHeading}>
        Guardian Permission
      </Text>

      <View style={styles.permissionRow}>
        <ToggleButton
          title="View"
          active={!!doc.guardian_visible}
          onPress={() =>
            updatePermissions(doc, {
              guardian_visible:
                !doc.guardian_visible,
            })
          }
          disabled={busyKey !== null}
        />

        <ToggleButton
          title="Download"
          active={
            !!doc.guardian_download_allowed
          }
          onPress={() =>
            updatePermissions(doc, {
              guardian_download_allowed:
                !doc.guardian_download_allowed,
            })
          }
          disabled={busyKey !== null}
        />
      </View>
    </View>
  );

  const importLegacyDocuments=async()=>{
    if(!selectedStudent||!legacyEmail.trim()||!legacyPassword)return Alert.alert('Required','Enter the legacy Office login ID and password.');
    setLegacyBusy(true);
    try{
      const d=await api('/api/documents/legacy-import',{method:'POST',body:JSON.stringify({email:legacyEmail.trim(),password:legacyPassword,session:legacySession,registration_no:selectedStudent.registration_no,class_name:String(selectedStudent.class_name||'').toLowerCase().replace(/.$/,'').replace(/s+/g,''),force_logout_all:true})});
      setLegacyPassword('');await loadDocuments(selectedStudent.id);Alert.alert('Legacy Import',d.imported+' imported, '+d.skipped+' already present, '+d.missing+' not found.');
    }catch(e:any){Alert.alert('Legacy Import',e.message);}finally{setLegacyBusy(false);}
  };
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <PageNavigation />
        <H1>Student Documents</H1>

        <Text style={styles.sectionTitle}>
          Find Student
        </Text>

        {selectedStudent ? (
          <>
            <Card>
              <Text style={styles.studentName}>
                {selectedStudent.student_name}
              </Text>

              {studentLoading && (
                <Muted>
                  Loading full student details...
                </Muted>
              )}

              <InfoSection title="Student Necessary Details">
                <InfoRow
                  label="Registration No"
                  value={selectedStudent.registration_no}
                />
                <InfoRow
                  label="Student Name"
                  value={selectedStudent.student_name}
                />
                <InfoRow
                  label="Admission Date"
                  value={showDate(selectedStudent.admission_date)}
                />
                <InfoRow
                  label="Class"
                  value={selectedStudent.class_name}
                />
                <InfoRow
                  label="Session From"
                  value={selectedStudent.session_from}
                />
                <InfoRow
                  label="Session To"
                  value={selectedStudent.session_to}
                />
                <InfoRow
                  label="Monthly Fees"
                  value={selectedStudent.monthly_fees}
                />
                <InfoRow
                  label="Mobile Number"
                  value={selectedStudent.mobile_number}
                />
                <InfoRow
                  label="WhatsApp Number"
                  value={selectedStudent.whatsapp_number}
                />
                <InfoRow
                  label="Email ID"
                  value={selectedStudent.email}
                />
                <InfoRow
                  label="Room No"
                  value={
                    selectedStudent.room_no ||
                    selectedStudent.room_name
                  }
                />
                <InfoRow
                  label="Gender"
                  value={selectedStudent.gender}
                />
                <InfoRow
                  label="Roll No"
                  value={selectedStudent.roll_no}
                />
                <InfoRow
                  label="Admission No"
                  value={selectedStudent.admission_no}
                />
                <InfoRow
                  label="Student Type"
                  value={selectedStudent.student_type}
                />
              </InfoSection>

              <InfoSection title="Student Information">
                <InfoRow
                  label="Date of Birth"
                  value={showDate(selectedStudent.date_of_birth)}
                />
                <InfoRow
                  label="Aadhaar No"
                  value={selectedStudent.aadhaar_no}
                />
                <InfoRow
                  label="Caste"
                  value={selectedStudent.caste_name}
                />
                <InfoRow
                  label="Blood Group"
                  value={selectedStudent.blood_group}
                />
                <InfoRow
                  label="Admitted School"
                  value={selectedStudent.admitted_school_name}
                />
                <InfoRow
                  label="Stream"
                  value={selectedStudent.stream}
                />
                <InfoRow
                  label="Handicapped"
                  value={selectedStudent.is_handicapped}
                />
                <InfoRow
                  label="Orphan"
                  value={selectedStudent.is_orphan}
                />
                <InfoRow
                  label="Previous Branch"
                  value={selectedStudent.previous_branch_name}
                />
                <InfoRow
                  label="Banglarshiksha ID"
                  value={selectedStudent.banglarshiksha_id}
                />
                <InfoRow
                  label="Kanyashree ID"
                  value={selectedStudent.kanyashree_id}
                />
                <InfoRow
                  label="Aikyashree ID"
                  value={selectedStudent.aikyashree_id}
                />
              </InfoSection>

              <InfoSection title="Father Information">
                <InfoRow
                  label="Father Name"
                  value={selectedStudent.father_name}
                />
                <InfoRow
                  label="Father Aadhaar"
                  value={selectedStudent.father_aadhaar_no}
                />
                <InfoRow
                  label="Qualification"
                  value={selectedStudent.father_qualification}
                />
                <InfoRow
                  label="Occupation"
                  value={selectedStudent.father_occupation}
                />
                <InfoRow
                  label="Annual Income"
                  value={selectedStudent.father_annual_income}
                />
                <InfoRow
                  label="Father Mobile"
                  value={selectedStudent.father_mobile}
                />
              </InfoSection>

              <InfoSection title="Mother Information">
                <InfoRow
                  label="Mother Name"
                  value={selectedStudent.mother_name}
                />
                <InfoRow
                  label="Mother Aadhaar"
                  value={selectedStudent.mother_aadhaar_no}
                />
                <InfoRow
                  label="Qualification"
                  value={selectedStudent.mother_qualification}
                />
                <InfoRow
                  label="Occupation"
                  value={selectedStudent.mother_occupation}
                />
                <InfoRow
                  label="Annual Income"
                  value={selectedStudent.mother_annual_income}
                />
                <InfoRow
                  label="Mother Mobile"
                  value={selectedStudent.mother_mobile}
                />
              </InfoSection>

              <InfoSection title="Guardian Information">
                <InfoRow
                  label="Guardian Name"
                  value={selectedStudent.guardian_name}
                />
                <InfoRow
                  label="Guardian Mobile"
                  value={selectedStudent.guardian_mobile}
                />
                <InfoRow
                  label="Alternate Mobile"
                  value={
                    selectedStudent.alternate_mobile ||
                    selectedStudent.guardian_alternate_mobile
                  }
                />
              </InfoSection>

              <InfoSection title="Present Address">
                <InfoRow
                  label="Village"
                  value={selectedStudent.present_village}
                />
                <InfoRow
                  label="Police Station"
                  value={selectedStudent.present_police_station}
                />
                <InfoRow
                  label="PIN"
                  value={selectedStudent.present_pin_code}
                />
                <InfoRow
                  label="Post Office"
                  value={selectedStudent.present_post_office}
                />
                <InfoRow
                  label="Block"
                  value={selectedStudent.present_block}
                />
                <InfoRow
                  label="District"
                  value={selectedStudent.present_district}
                />
                <InfoRow
                  label="State"
                  value={selectedStudent.present_state}
                />
              </InfoSection>

              <InfoSection title="Permanent Address">
                <InfoRow
                  label="Village"
                  value={selectedStudent.permanent_village}
                />
                <InfoRow
                  label="Police Station"
                  value={selectedStudent.permanent_police_station}
                />
                <InfoRow
                  label="PIN"
                  value={selectedStudent.permanent_pin_code}
                />
                <InfoRow
                  label="Post Office"
                  value={selectedStudent.permanent_post_office}
                />
                <InfoRow
                  label="Block"
                  value={selectedStudent.permanent_block}
                />
                <InfoRow
                  label="District"
                  value={selectedStudent.permanent_district}
                />
                <InfoRow
                  label="State"
                  value={selectedStudent.permanent_state}
                />
              </InfoSection>

              <InfoSection title="Student Bank Account">
                <InfoRow
                  label="Account No"
                  value={selectedStudent.bank_account_no}
                />
                <InfoRow
                  label="IFSC"
                  value={selectedStudent.bank_ifsc_code}
                />
                <InfoRow
                  label="Bank Name"
                  value={selectedStudent.bank_name}
                />
                <InfoRow
                  label="Branch Name"
                  value={selectedStudent.bank_branch_name}
                />
                <InfoRow
                  label="Branch Address"
                  value={selectedStudent.bank_branch_address}
                />
              </InfoSection>

              <InfoSection title="Visitor 1">
                <InfoRow
                  label="Name"
                  value={
                    visitor1?.visitor_name ||
                    selectedStudent.visitor1_name
                  }
                />
                <InfoRow
                  label="Relation"
                  value={
                    visitor1?.relation ||
                    selectedStudent.visitor1_relation
                  }
                />
                <InfoRow
                  label="Mobile"
                  value={
                    visitor1?.mobile_number ||
                    selectedStudent.visitor1_mobile
                  }
                />
                <InfoRow
                  label="Email"
                  value={
                    visitor1?.email ||
                    selectedStudent.visitor1_email
                  }
                />
                <InfoRow
                  label="Village"
                  value={
                    visitor1?.village ||
                    selectedStudent.visitor1_village
                  }
                />
                <InfoRow
                  label="Police Station"
                  value={
                    visitor1?.police_station ||
                    selectedStudent.visitor1_police_station
                  }
                />
                <InfoRow
                  label="PIN"
                  value={
                    visitor1?.pin_code ||
                    selectedStudent.visitor1_pin_code
                  }
                />
                <InfoRow
                  label="Post Office"
                  value={
                    visitor1?.post_office ||
                    selectedStudent.visitor1_post_office
                  }
                />
                <InfoRow
                  label="Block"
                  value={
                    visitor1?.block ||
                    selectedStudent.visitor1_block
                  }
                />
                <InfoRow
                  label="District"
                  value={
                    visitor1?.district ||
                    selectedStudent.visitor1_district
                  }
                />
                <InfoRow
                  label="State"
                  value={
                    visitor1?.state ||
                    selectedStudent.visitor1_state
                  }
                />
              </InfoSection>

              <InfoSection title="Visitor 2">
                <InfoRow
                  label="Name"
                  value={
                    visitor2?.visitor_name ||
                    selectedStudent.visitor2_name
                  }
                />
                <InfoRow
                  label="Relation"
                  value={
                    visitor2?.relation ||
                    selectedStudent.visitor2_relation
                  }
                />
                <InfoRow
                  label="Mobile"
                  value={
                    visitor2?.mobile_number ||
                    selectedStudent.visitor2_mobile
                  }
                />
                <InfoRow
                  label="Email"
                  value={
                    visitor2?.email ||
                    selectedStudent.visitor2_email
                  }
                />
                <InfoRow
                  label="Village"
                  value={
                    visitor2?.village ||
                    selectedStudent.visitor2_village
                  }
                />
                <InfoRow
                  label="Police Station"
                  value={
                    visitor2?.police_station ||
                    selectedStudent.visitor2_police_station
                  }
                />
                <InfoRow
                  label="PIN"
                  value={
                    visitor2?.pin_code ||
                    selectedStudent.visitor2_pin_code
                  }
                />
                <InfoRow
                  label="Post Office"
                  value={
                    visitor2?.post_office ||
                    selectedStudent.visitor2_post_office
                  }
                />
                <InfoRow
                  label="Block"
                  value={
                    visitor2?.block ||
                    selectedStudent.visitor2_block
                  }
                />
                <InfoRow
                  label="District"
                  value={
                    visitor2?.district ||
                    selectedStudent.visitor2_district
                  }
                />
                <InfoRow
                  label="State"
                  value={
                    visitor2?.state ||
                    selectedStudent.visitor2_state
                  }
                />
              </InfoSection>

              <TouchableOpacity
                style={styles.changeStudentButton}
                onPress={() => {
                  setSelectedStudent(null);
                  setVisitor1(null);
                  setVisitor2(null);
                  setList([]);
                  setSearch('');
                }}
              >
                <Text style={styles.changeStudentText}>
                  Change Student
                </Text>
              </TouchableOpacity>
            </Card>
          </>
        ) : (
          <>
            <Field
              placeholder="Registration No / Student Name / Father / Mobile"
              value={search}
              onChangeText={setSearch}
            />

            {filteredStudents.map((student) => (
              <TouchableOpacity
                key={student.id}
                style={styles.studentResult}
                onPress={() => selectStudent(student)}
              >
                <Text style={styles.studentResultName}>
                  {student.student_name}
                </Text>

                <Text style={styles.studentResultMeta}>
                  Reg: {student.registration_no || '-'} | Class:{' '}
                  {student.class_name || '-'}
                </Text>

                {!!student.father_name && (
                  <Text style={styles.studentResultMeta}>
                    Father: {student.father_name}
                  </Text>
                )}

                {!!(
                  student.mobile_number ||
                  student.guardian_mobile ||
                  student.father_mobile
                ) && (
                  <Text style={styles.studentResultMeta}>
                    Mobile:{' '}
                    {student.mobile_number ||
                      student.guardian_mobile ||
                      student.father_mobile}
                  </Text>
                )}
              </TouchableOpacity>
            ))}

            {!!search.trim() &&
              filteredStudents.length === 0 && (
                <Muted>
                  No matching student found
                </Muted>
              )}
          </>
        )}

        <Card>
          <Text style={styles.documentTypeTitle}>Bulk Class XII Documents</Text>
          <Muted>Select the multi-page PDF. Each page is matched by the registration number printed at the bottom and saved to the matching Class XII student.</Muted>
          <Button title={bulkXiBusy ? 'Uploading PDF pages...' : 'Upload Class XII Birth Certificate PDF'} onPress={bulkUploadBirthCertificate} />
          <Button title={bulkXiBusy ? 'Uploading PDF pages...' : 'Upload XI Registration PDF'} onPress={bulkUploadXiRegistration} />
        </Card>

        {selectedStudent && (
          <>
            <Card>
              <Text style={styles.documentTypeTitle}>Import from Legacy Website</Text>
              <Muted>Documents are matched by registration number. Password is used once and is not saved.</Muted>
              <Field placeholder="Legacy login ID" value={legacyEmail} onChangeText={setLegacyEmail} autoCapitalize="none" />
              <Field placeholder="Legacy password" value={legacyPassword} onChangeText={setLegacyPassword} secureTextEntry />
              <Field placeholder="Legacy session year" value={legacySession} onChangeText={setLegacySession} keyboardType="numeric" />
              <Button title={legacyBusy?'Importing...':'Import Available Documents'} onPress={importLegacyDocuments} />
            </Card>
            <Text style={styles.sectionTitle}>
              Family & Visitor Photos
            </Text>
            <Muted>Upload clear photos for ID cards and gate verification.</Muted>
            <View style={styles.familyPhotoGrid}>
              {DOCUMENT_TYPES
                .filter((item) => ['father_photo', 'mother_photo', 'visitor1_photo', 'visitor2_photo'].includes(item.key))
                .map((item) => {
                  const doc = getDocumentByType(item.key);
                  const personName = item.key === 'father_photo'
                    ? selectedStudent.father_name
                    : item.key === 'mother_photo'
                    ? selectedStudent.mother_name
                    : item.key === 'visitor1_photo'
                    ? (visitor1?.visitor_name || selectedStudent.visitor1_name)
                    : (visitor2?.visitor_name || selectedStudent.visitor2_name);
                  return (
                    <View key={item.key} style={styles.familyPhotoCard}>
                      <Text style={styles.documentTypeTitle}>{item.label}</Text>
                      <Text style={styles.photoPersonName}>{personName || 'Name not recorded'}</Text>
                      {doc ? renderExistingDocument(doc) : <>
                        <View style={styles.emptyPhoto}><Text style={styles.emptyPhotoText}>No photo</Text></View>
                        <View style={styles.uploadButtonWrap}><Button title={busyKey === 'upload-' + item.key ? 'Uploading...' : 'Upload Photo'} onPress={() => uploadNew(item.key, item.label)} /></View>
                      </>}
                    </View>
                  );
                })}
            </View>

            <Text style={styles.sectionTitle}>
              Documents
            </Text>

            {loading && (
              <Muted>Loading documents...</Muted>
            )}

            {DOCUMENT_TYPES
              .filter((item) => item.key !== 'other' && !['father_photo', 'mother_photo', 'visitor1_photo', 'visitor2_photo'].includes(item.key))
              .map((item) => {
                const doc =
                  getDocumentByType(item.key);

                return (
                  <Card key={item.key}>
                    <Text style={styles.documentTypeTitle}>
                      {item.label}
                    </Text>

                    {doc ? (
                      renderExistingDocument(doc)
                    ) : (
                      <>
                        <Muted>
                          Not uploaded
                        </Muted>

                        <View style={styles.uploadButtonWrap}>
                          <Button
                            title={
                              busyKey ===
                              `upload-${item.key}`
                                ? 'Uploading...'
                                : 'Upload'
                            }
                            onPress={() =>
                              uploadNew(
                                item.key,
                                item.label
                              )
                            }
                          />
                        </View>
                      </>
                    )}
                  </Card>
                );
              })}

            <Card>
              <Text style={styles.documentTypeTitle}>
                Other Document
              </Text>

              <Field
                placeholder="Document Title"
                value={otherTitle}
                onChangeText={setOtherTitle}
              />

              <Button
                title="Upload Other Document"
                onPress={() =>
                  uploadNew(
                    'other',
                    'Other Document'
                  )
                }
              />

              {otherDocuments.length > 0 && (
                <View style={styles.otherList}>
                  {otherDocuments.map(
                    renderExistingDocument
                  )}
                </View>
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!previewUri}
        transparent={false}
        animationType="fade"
        onRequestClose={closePreview}
      >
        <SafeAreaView style={styles.previewContainer}>
          <View style={styles.previewHeader}>
            <Text
              numberOfLines={1}
              style={styles.previewTitle}
            >
              {previewTitle || 'Document'}
            </Text>

            <TouchableOpacity
              style={styles.previewCloseButton}
              onPress={closePreview}
            >
              <Text style={styles.previewCloseText}>
                Close
              </Text>
            </TouchableOpacity>
          </View>

          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function SmallButton({
  title,
  onPress,
  danger = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.smallButton,
        danger && styles.dangerButton,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.smallButtonText}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function ToggleButton({
  title,
  active,
  onPress,
  disabled = false,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.toggleButton,
        active && styles.toggleActive,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.toggleText,
          active && styles.toggleActiveText,
        ]}
      >
        {title}: {active ? 'ON' : 'OFF'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f6f9',
  },

  content: {
    padding: 16,
    paddingBottom: 60,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 10,
  },

  studentName: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },

  infoSection: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d9e0e5',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },

  infoSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#eef4fa',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef1f3',
  },

  infoLabel: {
    width: 135,
    fontWeight: '700',
    color: '#444',
  },

  infoValue: {
    flex: 1,
    color: '#111',
  },

  changeStudentButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1565c0',
    borderRadius: 9,
    paddingVertical: 10,
  },

  changeStudentText: {
    textAlign: 'center',
    fontWeight: '800',
    color: '#1565c0',
  },

  studentResult: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d8de',
    borderRadius: 10,
    padding: 13,
    marginBottom: 8,
  },

  studentResultName: {
    fontSize: 17,
    fontWeight: '800',
  },

  studentResultMeta: {
    marginTop: 4,
    color: '#555',
  },

  documentTypeTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },

  existingBox: {
    marginTop: 4,
  },

  fileTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },

  fileMeta: {
    color: '#666',
    fontSize: 13,
    marginBottom: 10,
  },

  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  smallButton: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 13,
    minWidth: 78,
  },

  dangerButton: {
    backgroundColor: '#c62828',
  },

  disabledButton: {
    opacity: 0.5,
  },

  smallButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
  },

  permissionHeading: {
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 8,
  },

  permissionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  toggleButton: {
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },

  toggleActive: {
    borderColor: '#1565c0',
    backgroundColor: '#e7f0fb',
  },

  toggleText: {
    fontWeight: '700',
    color: '#444',
  },

  toggleActiveText: {
    color: '#1565c0',
  },

  familyPhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
  },

  familyPhotoCard: {
    width: 245,
    minHeight: 220,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 13,
  },

  photoPersonName: {
    color: '#52606d',
    marginBottom: 10,
  },

  emptyPhoto: {
    height: 110,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#aab7c4',
    borderRadius: 9,
    backgroundColor: '#f7fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyPhotoText: {
    color: '#718096',
    fontWeight: '700',
  },

  uploadButtonWrap: {
    marginTop: 10,
  },

  otherList: {
    marginTop: 16,
  },

  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },

  previewHeader: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
  },

  previewTitle: {
    flex: 1,
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    marginRight: 12,
  },

  previewCloseButton: {
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  previewCloseText: {
    color: '#fff',
    fontWeight: '800',
  },

  previewImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
});
