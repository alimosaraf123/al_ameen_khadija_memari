import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

function registrationFromQr(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^\d{4,8}$/.test(value)) return value;
  const aamMatch = value.match(/^aam(\d{4,8})$/i);
  if (aamMatch) return aamMatch[1];
  const values = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) values.push(decoded);
  } catch {}
  for (const candidate of values) {
    try {
      const parsed = JSON.parse(candidate);
      for (const key of ['registration_no', 'registration', 'reg_no', 'reg', 'student', 'id']) {
        const v = String(parsed?.[key] ?? '').trim();
        if (/^\d{4,8}$/.test(v)) return v;
        const m = v.match(/^aam(\d{4,8})$/i);
        if (m) return m[1];
      }
    } catch {}
  }
  try {
    const url = new URL(value);
    for (const key of ['registration_no', 'registration', 'reg_no', 'reg', 'student', 'id']) {
      const candidate = url.searchParams.get(key);
      if (candidate && /^\d{4,8}$/.test(candidate.trim())) return candidate.trim();
      const m = candidate?.match(/^aam(\d{4,8})$/i);
      if (m) return m[1];
    }
  } catch {}
  const marked = value.match(/(?:registration|reg|student|stu|id)(?:istration)?(?:[\s_\-]?no)?[\s_:\=\/\-]*(\d{4,8})/i);
  if (marked) return marked[1];
  const candidates = value.match(/\b\d{4,8}\b/g) || [];
  return candidates[0] || '';
}

export default function CardQrScanner({
  onRegistration,
}: {
  onRegistration: (registration: string) => void | Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [liveOpen, setLiveOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [scanningPhoto, setScanningPhoto] = useState(false);
  const [quickReg, setQuickReg] = useState('');
  const [showHttpNotice, setShowHttpNotice] = useState(false);

  const fileInputRef = useRef<any>(null);
  const videoRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);

  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

  const showAlert = (title: string, msg: string) => {
    if (isWeb) {
      window.alert(`${title}\n${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const stopWebCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
  };

  useEffect(() => {
    return () => {
      stopWebCamera();
    };
  }, []);

  // Web Live Camera Stream & Continuous Detection Loop
  const startWebCamera = async (targetFacing: 'back' | 'front') => {
    stopWebCamera();
    setStatusMsg('⏳ ক্যামেরা শুরু করা হচ্ছে...');

    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: targetFacing === 'back' ? { ideal: 'environment' } : 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback to ANY available camera (desktop webcam, laptop camera, USB camera)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!stream) throw new Error('ক্যামেরা স্ট্রিম পাওয়া যায়নি');
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Load barcode detector
      let BarcodeDetectorClass = (globalThis as any).BarcodeDetector;
      if (!BarcodeDetectorClass) {
        const mod = await import('barcode-detector/pure');
        if (mod.setZXingModuleOverrides) {
          mod.setZXingModuleOverrides({
            locateFile: (file: string) => `/${file}`,
          });
        }
        BarcodeDetectorClass = mod.BarcodeDetector;
      }

      const detector = new BarcodeDetectorClass({
        formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'upc_a', 'ean_8'],
      });

      setStatusMsg('🎥 লাইভ ক্যামেরা সক্রিয়। কার্ডের Barcode বা QR code ফ্রেমের মাঝে স্থির রাখুন।');

      let isDetecting = false;
      scanIntervalRef.current = setInterval(async () => {
        const videoEl = videoRef.current;
        if (!videoEl || videoEl.readyState < 2 || isDetecting) return;

        isDetecting = true;
        try {
          const results = await detector.detect(videoEl);
          if (results && results.length > 0) {
            for (const item of results) {
              const raw = item?.rawValue || '';
              const reg = registrationFromQr(raw);
              if (reg) {
                stopWebCamera();
                setLiveOpen(false);
                setStatusMsg(`✅ সফলভাবে স্ক্যান হয়েছে: Reg. ${reg}`);
                await onRegistration(reg);
                return;
              }
            }
          }
        } catch {
          // Keep scanning on next frame
        } finally {
          isDetecting = false;
        }
      }, 180);
    } catch (err: any) {
      stopWebCamera();
      setStatusMsg(`⚠️ ক্যামেরা চালু হতে পারেনি: ${err.message || 'Permission denied or no webcam'}`);
    }
  };

  // Option 1: Live Video Camera
  const startLive = async () => {
    setStatusMsg('');
    setShowHttpNotice(false);

    if (isWeb) {
      const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
      if (!hasMedia) {
        setShowHttpNotice(true);
        setStatusMsg('');
        return;
      }

      setLiveOpen(true);
      void startWebCamera(facing);
    } else {
      // Native Mobile App
      try {
        if (!permission?.granted) {
          const result = await requestPermission();
          if (!result.granted) {
            setStatusMsg('⚠️ ক্যামেরার অনুমতি পাওয়া যায়নি। অ্যাপে ক্যামেরা পারমিশন Allow করুন।');
            return;
          }
        }
        setLocked(false);
        setLiveOpen(true);
      } catch (err: any) {
        setStatusMsg(`⚠️ লাইভ ক্যামেরা শুরু হতে পারেনি: ${err.message || 'Error'}`);
      }
    }
  };

  const closeLive = () => {
    setLiveOpen(false);
    if (isWeb) stopWebCamera();
    setStatusMsg('');
  };

  const toggleFacing = () => {
    const next = facing === 'back' ? 'front' : 'back';
    setFacing(next);
    if (isWeb && liveOpen) {
      void startWebCamera(next);
    }
  };

  const scannedLive = async ({ data }: any) => {
    if (locked) return;
    setLocked(true);
    const reg = registrationFromQr(data);
    if (!reg) {
      setLocked(false);
      return showAlert('Invalid Card', 'Card-e registration number paowa jaini.');
    }
    setLiveOpen(false);
    await onRegistration(reg);
  };

  // Option 2: Photo Capture / File Barcode Detector (Works on all mobile browsers over HTTP without restriction)
  const triggerPhotoCapture = () => {
    if (isWeb && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    setStatusMsg('⏳ কার্ডের ছবি থেকে বারকোড স্ক্যান করা হচ্ছে...');
    setScanningPhoto(true);

    try {
      let BarcodeDetectorClass = (globalThis as any).BarcodeDetector;
      if (!BarcodeDetectorClass) {
        const mod = await import('barcode-detector/pure');
        if (mod.setZXingModuleOverrides) {
          mod.setZXingModuleOverrides({
            locateFile: (f: string) => `/${f}`,
          });
        }
        BarcodeDetectorClass = mod.BarcodeDetector;
      }

      const detector = new BarcodeDetectorClass({
        formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'upc_a', 'ean_8'],
      });

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      img.onload = async () => {
        try {
          const results = await detector.detect(img);
          URL.revokeObjectURL(objectUrl);

          if (!results || results.length === 0) {
            setScanningPhoto(false);
            setStatusMsg('⚠️ ছবিতে কোনো স্পষ্ট Barcode বা QR code পাওয়া যায়নি। দয়া করে কার্ডটি সোজাসুজি ধরে আলোতে স্পষ্ট ছবি তুলুন।');
            return;
          }

          const rawValue = results[0]?.rawValue || '';
          const reg = registrationFromQr(rawValue);

          if (!reg) {
            setScanningPhoto(false);
            setStatusMsg(`⚠️ বারকোড পড়া গেছে (${rawValue}) কিন্তু এতে স্টুডেন্ট রেজিস্ট্রেশন নম্বর মেলেনি।`);
            return;
          }

          setScanningPhoto(false);
          setStatusMsg(`✅ সফলভাবে স্ক্যান হয়েছে: Reg. ${reg}`);
          await onRegistration(reg);
        } catch (scanErr: any) {
          setScanningPhoto(false);
          setStatusMsg(`⚠️ স্ক্যান এরর: ${scanErr.message || 'Failed to detect barcode'}`);
        }
      };

      img.onerror = () => {
        setScanningPhoto(false);
        setStatusMsg('⚠️ ছবিটি লোড করা যায়নি।');
      };
    } catch (err: any) {
      setScanningPhoto(false);
      setStatusMsg(`⚠️ বারকোড রিডার লোড করা যায়নি: ${err.message}`);
    }

    if (e.target) e.target.value = '';
  };

  const handleQuickSubmit = async () => {
    const val = quickReg.trim();
    if (!val) return showAlert('Required', 'Please enter a registration number.');
    await onRegistration(val);
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>🔍 Student ID Card Scanner / Lookup</Text>
      <Text style={s.cardSubtitle}>
        নিচের যেকোনো একটি সহজ উপায়ে স্টুডেন্ট কার্ড স্ক্যান বা সার্চ করুন:
      </Text>

      {/* ACTION BUTTONS ROW */}
      <View style={s.buttonRow}>
        {/* BUTTON 1: PHOTO CAPTURE (WORKS EVERYWHERE INCLUDING MOBILE HTTP) */}
        {isWeb && (
          <TouchableOpacity
            style={s.photoBtn}
            onPress={triggerPhotoCapture}
            disabled={scanningPhoto}
          >
            <Text style={s.white}>
              {scanningPhoto ? '⏳ স্ক্যান হচ্ছে...' : '📸 কার্ডের ছবি তুলে স্ক্যান করুন'}
            </Text>
          </TouchableOpacity>
        )}

        {/* BUTTON 2: LIVE VIDEO CAMERA */}
        <TouchableOpacity
          onPress={liveOpen ? closeLive : startLive}
          style={[s.liveBtn, liveOpen && s.liveBtnClose]}
        >
          <Text style={s.white}>
            {liveOpen ? '✖ লাইভ ক্যামেরা বন্ধ করুন' : '🎥 লাইভ ভিডিও ক্যামেরা'}
          </Text>
        </TouchableOpacity>

        {liveOpen && (
          <TouchableOpacity onPress={toggleFacing} style={s.switchBtn}>
            <Text style={s.switchText}>🔄 Switch Camera ({facing})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* HIDDEN HTML FILE INPUT FOR INSTANT MOBILE CAMERA CAPTURE */}
      {isWeb && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}

      {/* HTTP SECURITY NOTICE BANNER (WHEN ON MOBILE OVER HTTP LAN IP) */}
      {showHttpNotice && (
        <View style={s.noticeBox}>
          <View style={s.noticeHeader}>
            <Text style={s.noticeTitle}>ℹ️ মোবাইল ব্রাউজার সিকিউরিটি নোটিশ</Text>
            <TouchableOpacity onPress={() => setShowHttpNotice(false)}>
              <Text style={s.noticeClose}>✖ বন্ধ</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.noticeText}>
            গুগল ক্রোম ও মোবাইল ব্রাউজারে সাধারণ <Text style={{ fontWeight: '700' }}>http://</Text> আইপি সংযোগে সরাসরি লাইভ ভিডিও ক্যামেরা বন্ধ থাকে।
          </Text>
          <View style={s.noticeActionBox}>
            <Text style={s.noticeActionTitle}>👉 সহজ সমাধান (যেকোনো ফোনেই সাথে সাথে কাজ করে):</Text>
            <TouchableOpacity
              style={s.noticeBtn}
              onPress={() => {
                setShowHttpNotice(false);
                triggerPhotoCapture();
              }}
            >
              <Text style={s.noticeBtnText}>📸 এখনই ফোনের ক্যামেরা দিয়ে ছবি তুলে স্ক্যান করুন</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.noticeActionBox, { marginTop: 6, backgroundColor: '#f1f5f9' }]}>
            <Text style={[s.noticeActionTitle, { color: '#475569' }]}>
              💡 আপনি যদি মোবাইলেও বেগুনি লাইভ ভিডিও স্ট্রিম চালাতে চান:
            </Text>
            <Text style={{ fontSize: 11, color: '#64748b', lineHeight: 16 }}>
              Android Chrome-এ যান: chrome://flags/#unsafely-treat-insecure-origin-as-secure{'\n'}
              সেখানে এই URL যোগ করে Enabled করে Relaunch দিন: http://{typeof window !== 'undefined' ? window.location.host : '192.168.0.189:8081'}
            </Text>
          </View>
        </View>
      )}

      {/* STATUS / INSTRUCTION BANNER */}
      {!!statusMsg && (
        <View style={s.msgBox}>
          <Text style={s.msgText}>{statusMsg}</Text>
        </View>
      )}

      {/* LIVE CAMERA BOX */}
      {liveOpen && (
        <View style={s.cameraBox}>
          {isWeb ? (
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: 440,
              height: 290,
              borderRadius: 10,
              overflow: 'hidden',
              backgroundColor: '#000',
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
            }}>
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />

              {/* Viewfinder Target & Laser Overlay */}
              <div style={{
                position: 'absolute',
                top: '18%',
                left: '10%',
                right: '10%',
                bottom: '18%',
                border: '2px solid rgba(56, 189, 248, 0.9)',
                borderRadius: 8,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {/* Corner lines */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 14, borderTop: '3px solid #38bdf8', borderLeft: '3px solid #38bdf8' }} />
                <div style={{ position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderTop: '3px solid #38bdf8', borderRight: '3px solid #38bdf8' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 14, height: 14, borderBottom: '3px solid #38bdf8', borderLeft: '3px solid #38bdf8' }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderBottom: '3px solid #38bdf8', borderRight: '3px solid #38bdf8' }} />

                <div style={{
                  position: 'absolute',
                  top: 6,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}>
                  কার্ডের বারকোড বা কিউআর কোড এখানে ধরুন
                </div>

                {/* Laser scan line */}
                <div style={{
                  width: '90%',
                  height: 2,
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 8px #ef4444',
                }} />
              </div>

              {/* Live badge */}
              <div style={{
                position: 'absolute',
                top: 8,
                left: 8,
                backgroundColor: 'rgba(220, 38, 38, 0.9)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 5,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#fff', display: 'inline-block' }} />
                LIVE CAMERA
              </div>
            </div>
          ) : (
            <CameraView
              style={s.camera}
              facing={facing}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr',
                  'code128',
                  'code39',
                  'code93',
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                ],
              }}
              onBarcodeScanned={locked ? undefined : scannedLive}
            />
          )}
          <Text style={s.cameraHelp}>
            আইডি কার্ডের Barcode বা QR code ফ্রেমের মাঝে সোজাভাবে স্থির রাখুন। পাওয়া মাত্রই অবিলম্বে স্ক্যান সম্পন্ন হবে।
          </Text>
        </View>
      )}

      {/* METHOD 3: QUICK INPUT / BARCODE GUN SCANNER */}
      <View style={s.quickRow}>
        <TextInput
          value={quickReg}
          onChangeText={setQuickReg}
          onSubmitEditing={handleQuickSubmit}
          placeholder="রেজিস্ট্রেশন নম্বর লিখুন বা বারকোড গান দিয়ে স্ক্যান করুন..."
          style={s.quickInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={s.quickBtn} onPress={handleQuickSubmit}>
          <Text style={s.white}>Search / Check</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd8e4',
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f3a61',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -4,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  photoBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 7,
  },
  liveBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 7,
  },
  liveBtnClose: {
    backgroundColor: '#dc2626',
  },
  switchBtn: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 7,
  },
  switchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  white: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  noticeBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  noticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noticeTitle: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '800',
  },
  noticeClose: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 12,
  },
  noticeText: {
    color: '#7f1d1d',
    fontSize: 12,
    lineHeight: 18,
  },
  noticeActionBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 6,
    padding: 10,
    gap: 6,
  },
  noticeActionTitle: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '700',
  },
  noticeBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  noticeBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  msgBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    padding: 10,
  },
  msgText: {
    color: '#1e293b',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  cameraBox: {
    marginTop: 6,
    maxWidth: 440,
  },
  camera: {
    width: '100%',
    height: 280,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraHelp: {
    marginTop: 6,
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    alignItems: 'center',
  },
  quickInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 7,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    fontSize: 13,
  },
  quickBtn: {
    backgroundColor: '#0f3a61',
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

