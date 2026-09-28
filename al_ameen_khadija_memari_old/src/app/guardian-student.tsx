import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  Text,
  Alert,
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { api, API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';
import { Button, Card, H1, Muted } from '../components/ui';

function safeFileName(name: string) {
  return (name || 'document')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

function extFromTitleOrType(doc: any) {
  const title = String(doc?.document_title || '');
  const m = title.match(/(\.[A-Za-z0-9]{1,8})$/);
  return m ? m[1] : '';
}

function guessMime(doc: any) {
  const name = String(doc?.document_title || '').toLowerCase();

  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  const type = String(doc?.document_type || '').toLowerCase();

  if (
    type.includes('photo') ||
    type.includes('image')
  ) {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
}

async function responseMessage(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { message: text || 'Request failed' };
  }
}

export default function Child() {
  const { id } = useLocalSearchParams();

  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [previewUri, setPreviewUri] =
    useState<string | null>(null);

  const [previewTitle, setPreviewTitle] =
    useState('');

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

  const load = async () => {
    setLoading(true);

    try {
      const data = await api(
        `/api/guardians/student/${id}`
      );

      setD(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const getDocumentUrl = (
    doc: any,
    mode: 'view' | 'download'
  ) => {
    if (mode === 'view') {
      return (
        doc.view_endpoint ||
        `/api/guardians/student/${id}/document/${doc.id}/view`
      );
    }

    return (
      doc.download_endpoint ||
      `/api/guardians/student/${id}/document/${doc.id}/download`
    );
  };

  const openDocument = async (doc: any) => {
    try {
      const token = await getToken();

      const endpoint =
        getDocumentUrl(doc, 'view');

      const url =
        `${API_BASE}${endpoint}`;

      if (Platform.OS === 'web') {
        let pdfWindow: any = null;

        const mime = guessMime(doc);

        if (
          mime === 'application/pdf' &&
          typeof window !== 'undefined'
        ) {
          pdfWindow = window.open(
            'about:blank',
            '_blank'
          );
        }

        const response = await fetch(
          url,
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
            'View failed'
          );
        }

        const blob =
          await response.blob();

        const objectUrl =
          URL.createObjectURL(blob);

        if (
          blob.type.startsWith('image/') ||
          mime.startsWith('image/')
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

        if (pdfWindow) {
          pdfWindow.location.href =
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

      const ext =
        extFromTitleOrType(doc);

      const local =
        `${FileSystem.cacheDirectory}${Date.now()}-${safeFileName(
          doc.document_title ||
          doc.document_type ||
          'document'
        )}${ext}`;

      const result =
        await FileSystem.downloadAsync(
          url,
          local,
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
          'View failed'
        );
      }

      const mime =
        guessMime(doc);

      if (mime.startsWith('image/')) {
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

      if (Platform.OS === 'android') {
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
              type: mime,
            }
          );
      }
    } catch (e: any) {
      Alert.alert(
        'View Error',
        e?.message ||
        'Could not open document'
      );
    }
  };

  const downloadDocument = async (
    doc: any
  ) => {
    try {
      if (!doc.guardian_download_allowed) {
        Alert.alert(
          'Not allowed',
          'Download permission is OFF for this document.'
        );

        return;
      }

      const token = await getToken();

      const endpoint =
        getDocumentUrl(
          doc,
          'download'
        );

      if (!endpoint) {
        Alert.alert(
          'Not allowed',
          'Download permission is OFF for this document.'
        );

        return;
      }

      const url =
        `${API_BASE}${endpoint}`;

      const mime =
        guessMime(doc);

      const fileName =
        safeFileName(
          doc.document_title ||
          doc.document_type ||
          'document'
        ) +
        extFromTitleOrType(doc);

      if (Platform.OS === 'web') {
        const response = await fetch(
          url,
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
            'Download failed'
          );
        }

        const blob =
          await response.blob();

        const objectUrl =
          URL.createObjectURL(blob);

        const link =
          document.createElement('a');

        link.href = objectUrl;
        link.download = fileName;
        link.style.display = 'none';

        document.body.appendChild(
          link
        );

        link.click();

        setTimeout(() => {
          link.remove();
          URL.revokeObjectURL(
            objectUrl
          );
        }, 1000);

        return;
      }

      const temp =
        `${FileSystem.cacheDirectory}${Date.now()}-${fileName}`;

      const result =
        await FileSystem.downloadAsync(
          url,
          temp,
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
          'Download failed'
        );
      }

      if (Platform.OS === 'android') {
        const permission =
          await FileSystem
            .StorageAccessFramework
            .requestDirectoryPermissionsAsync();

        if (!permission.granted) {
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
              fileName,
              mime
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
          'Downloaded',
          'Document saved successfully.'
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Download Error',
        e?.message ||
        'Could not download document'
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          padding: 16,
        }}
      >
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!d) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          padding: 16,
        }}
      >
        <Text>
          Student data not available.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={s.content}
      >
        <H1>
          {d.student?.student_name}
        </H1>

        <Card>
          <Text>
            Class:{' '}
            {d.student?.class_name ||
              '-'}
          </Text>

          <Text>
            Roll:{' '}
            {d.student?.roll_no ||
              '-'}
          </Text>

          <Text>
            Reg:{' '}
            {d.student?.registration_no ||
              '-'}
          </Text>

          <Text>
            Admission No:{' '}
            {d.student?.admission_no ||
              '-'}
          </Text>

          <Text>
            Date of Birth:{' '}
            {d.student?.date_of_birth
              ? String(
                  d.student.date_of_birth
                ).slice(0, 10)
              : '-'}
          </Text>

          <Text>
            Gender:{' '}
            {d.student?.gender ||
              '-'}
          </Text>

          <Text>
            Father:{' '}
            {d.student?.father_name ||
              '-'}
          </Text>

          <Text>
            Mother:{' '}
            {d.student?.mother_name ||
              '-'}
          </Text>

          <Text>
            Guardian:{' '}
            {d.student?.guardian_name ||
              '-'}
          </Text>

          <Text>
            Guardian Mobile:{' '}
            {d.student?.guardian_mobile ||
              '-'}
          </Text>
        </Card>

        <Text style={s.heading}>
          Result
        </Text>

        {!d.marks?.length && (
          <Muted>
            No published result
          </Muted>
        )}

        {d.marks?.map((m: any) => (
          <Card key={m.id}>
            <Text style={s.bold}>
              {m.exam_name}
            </Text>

            <Text>
              {m.subject_name}:{' '}
              {m.obtained_marks}
            </Text>
          </Card>
        ))}

        <Text style={s.heading}>
          Dues (View Only)
        </Text>

        {!d.dues?.length && (
          <Muted>No dues record</Muted>
        )}

        {d.dues?.map((x: any) => (
          <Card key={x.id}>
            <Text style={s.bold}>
              {x.due_title ||
                'Due'}
            </Text>

            <Text>
              Amount: ₹
              {x.amount}
            </Text>

            <Text>
              Status:{' '}
              {x.status}
            </Text>
          </Card>
        ))}

        <Text style={s.heading}>
          Documents
        </Text>

        {!d.documents?.length && (
          <Muted>
            No document is available for Guardian.
          </Muted>
        )}

        {d.documents?.map((x: any) => (
          <Card key={x.id}>
            <Text style={s.bold}>
              {x.document_title ||
                x.document_type}
            </Text>

            <View style={s.buttonRow}>
              <View style={s.buttonBox}>
                <Button
                  title="View"
                  onPress={() =>
                    openDocument(x)
                  }
                />
              </View>

              {x.guardian_download_allowed && (
                <View style={s.buttonBox}>
                  <Button
                    title="Download"
                    onPress={() =>
                      downloadDocument(x)
                    }
                  />
                </View>
              )}
            </View>

            {!x.guardian_download_allowed && (
              <Text style={s.permissionNote}>
                View allowed • Download not allowed
              </Text>
            )}
          </Card>
        ))}

        <Text style={s.heading}>
          Attendance
        </Text>

        {!d.attendance?.length && (
          <Muted>
            No attendance record
          </Muted>
        )}

        {d.attendance
          ?.slice(0, 20)
          .map((x: any) => (
            <Card key={x.id}>
              <Text>
                {x.attendance_date}:{' '}
                {x.status}
              </Text>
            </Card>
          ))}

        <Text style={s.heading}>
          Notices
        </Text>

        {!d.notices?.length && (
          <Muted>No notice</Muted>
        )}

        {d.notices?.map((x: any) => (
          <Card key={x.id}>
            <Text style={s.bold}>
              {x.title}
            </Text>

            <Text>
              {x.notice_text || ''}
            </Text>
          </Card>
        ))}
      </ScrollView>

      <Modal
        visible={!!previewUri}
        transparent={false}
        animationType="fade"
        onRequestClose={closePreview}
      >
        <SafeAreaView
          style={s.previewPage}
        >
          <View
            style={s.previewHeader}
          >
            <Text
              style={s.previewTitle}
              numberOfLines={1}
            >
              {previewTitle}
            </Text>

            <TouchableOpacity
              style={s.closeButton}
              onPress={closePreview}
            >
              <Text
                style={s.closeText}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>

          {previewUri && (
            <Image
              source={{
                uri: previewUri,
              }}
              style={s.previewImage}
              resizeMode="contain"
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f3f6f9',
  },

  content: {
    padding: 16,
    paddingBottom: 60,
  },

  heading: {
    fontSize: 19,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 10,
  },

  bold: {
    fontWeight: '800',
  },

  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },

  buttonBox: {
    minWidth: 120,
    flexGrow: 1,
  },

  permissionNote: {
    marginTop: 8,
    color: '#667085',
    fontSize: 13,
  },

  previewPage: {
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
    marginRight: 12,
  },

  closeButton: {
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  closeText: {
    color: '#fff',
    fontWeight: '800',
  },

  previewImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
