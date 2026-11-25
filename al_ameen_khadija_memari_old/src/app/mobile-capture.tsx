import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { API_BASE } from '../lib/api';

type SessionInfo = {
  status: 'pending' | 'completed' | 'expired';
  target: string;
  target_label: string;
  student_name: string;
  registration_no: string;
  class_name: string;
  uploaded_url?: string | null;
};

export default function MobileCaptureScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = String(params.token || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [previewUri, setPreviewUri] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [doneUrl, setDoneUrl] = useState('');

  const cameraInputRef = useRef<any>(null);
  const galleryInputRef = useRef<any>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing capture link.');
      setLoading(false);
      return;
    }
    let active = true;
    fetch(`${API_BASE}/api/mobile-capture/public/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.success) throw new Error(data.message || 'Invalid or expired link');
        if (active) {
          setInfo(data);
          if (data.status === 'completed' && data.uploaded_url) {
            setDoneUrl(data.uploaded_url);
          }
        }
      })
      .catch((err: any) => {
        if (active) setError(err.message || 'Could not load capture session.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleWebFileChange = (e: any) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setError('');
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUri(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleNativePick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setError('');
    setSelectedFile(asset);
    setPreviewUri(asset.uri);
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile || !token) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      if (Platform.OS === 'web' && selectedFile instanceof File) {
        form.append('file', selectedFile, selectedFile.name || 'capture.jpg');
      } else {
        form.append('file', {
          uri: selectedFile.uri,
          name: selectedFile.name || 'capture.jpg',
          type: selectedFile.mimeType || 'image/jpeg',
        } as any);
      }

      const res = await fetch(`${API_BASE}/api/mobile-capture/public/${encodeURIComponent(token)}/upload`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Upload failed. Please try again.');
      }
      setDoneUrl(data.uploaded_url || previewUri);
      setInfo((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const resetCapture = () => {
    setPreviewUri('');
    setSelectedFile(null);
    setError('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  return (
    <ScrollView contentContainerStyle={st.page}>
      <View style={st.card}>
        <View style={st.header}>
          <Text style={st.school}>Al-Ameen Mission Academy Memari</Text>
          <Text style={st.subtitle}>Mobile Photo Capture & Upload</Text>
        </View>

        {loading ? (
          <View style={st.center}>
            <ActivityIndicator size="large" color="#1d4ed8" />
            <Text style={st.muted}>Loading student details...</Text>
          </View>
        ) : error && !info ? (
          <View style={st.center}>
            <Text style={st.errorTitle}>Link Unavailable</Text>
            <Text style={st.errorText}>{error}</Text>
          </View>
        ) : info?.status === 'expired' ? (
          <View style={st.center}>
            <Text style={st.errorTitle}>Link Expired</Text>
            <Text style={st.errorText}>This QR link has expired. Please generate a fresh QR code on the computer.</Text>
          </View>
        ) : doneUrl || info?.status === 'completed' ? (
          <View style={st.center}>
            <Text style={st.successBadge}>UPLOADED</Text>
            <Text style={st.successTitle}>Photo Uploaded Successfully!</Text>
            <Text style={st.muted}>
              {info?.target_label} for {info?.student_name} (Reg. {info?.registration_no}) has been saved to the system.
            </Text>
            {!!doneUrl && <Image source={{ uri: doneUrl }} style={st.previewImg} resizeMode="contain" />}
            <Text style={st.closeHint}>You can close this page now. The computer screen will update automatically.</Text>
          </View>
        ) : (
          <>
            <View style={st.studentBox}>
              <Text style={st.targetBadge}>{info?.target_label}</Text>
              <Text style={st.studentName}>{info?.student_name}</Text>
              <Text style={st.studentMeta}>
                Reg. No: {info?.registration_no} {info?.class_name ? `• Class: ${info.class_name}` : ''}
              </Text>
            </View>

            {!!error && <Text style={st.inlineError}>{error}</Text>}

            {!previewUri ? (
              <View style={st.actionBlock}>
                <Text style={st.stepText}>Step 1: Take a clear photo using your phone camera</Text>

                {Platform.OS === 'web' && (
                  <>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleWebFileChange}
                      style={{ display: 'none' }}
                    />
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleWebFileChange}
                      style={{ display: 'none' }}
                    />
                  </>
                )}

                <TouchableOpacity
                  style={st.cameraBtn}
                  onPress={() => {
                    if (Platform.OS === 'web') cameraInputRef.current?.click();
                    else void handleNativePick();
                  }}
                >
                  <Text style={st.cameraBtnText}>Open Camera & Take Photo</Text>
                </TouchableOpacity>

                {Platform.OS === 'web' && (
                  <TouchableOpacity style={st.galleryBtn} onPress={() => galleryInputRef.current?.click()}>
                    <Text style={st.galleryBtnText}>Choose from Gallery</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={st.actionBlock}>
                <Text style={st.stepText}>Step 2: Confirm Photo & Upload</Text>
                <View style={st.previewBox}>
                  <Image source={{ uri: previewUri }} style={st.previewImg} resizeMode="contain" />
                </View>

                <TouchableOpacity
                  disabled={uploading}
                  style={[st.confirmBtn, uploading && { opacity: 0.6 }]}
                  onPress={handleConfirmUpload}
                >
                  <Text style={st.confirmBtnText}>
                    {uploading ? 'Uploading...' : 'Confirm & Upload Photo'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity disabled={uploading} style={st.retakeBtn} onPress={resetCapture}>
                  <Text style={st.retakeBtnText}>Retake Photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: '#f1f5f9',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  header: {
    backgroundColor: '#0f172a',
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  school: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#93c5fd', fontSize: 12, fontWeight: '600', marginTop: 4 },
  center: { padding: 28, alignItems: 'center', gap: 10 },
  muted: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorTitle: { color: '#b91c1c', fontSize: 18, fontWeight: '800' },
  errorText: { color: '#475569', fontSize: 14, textAlign: 'center' },
  inlineError: {
    marginHorizontal: 18,
    marginTop: 10,
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  studentBox: {
    margin: 18,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
  },
  targetBadge: {
    backgroundColor: '#1d4ed8',
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
  },
  studentName: { fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  studentMeta: { fontSize: 13, color: '#475569', marginTop: 4, fontWeight: '600' },
  actionBlock: { padding: 18, gap: 12 },
  stepText: { fontSize: 14, fontWeight: '700', color: '#334155', textAlign: 'center' },
  cameraBtn: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  cameraBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  galleryBtn: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  galleryBtnText: { color: '#1e293b', fontSize: 14, fontWeight: '700' },
  previewBox: {
    height: 280,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImg: { width: '100%', height: 240, borderRadius: 8 },
  confirmBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  retakeBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  retakeBtnText: { color: '#334155', fontSize: 14, fontWeight: '700' },
  successBadge: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    fontWeight: '900',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
  successTitle: { fontSize: 20, fontWeight: '800', color: '#15803d', textAlign: 'center' },
  closeHint: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 6 },
});
