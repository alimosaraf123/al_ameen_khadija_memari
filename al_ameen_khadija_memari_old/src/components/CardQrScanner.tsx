import React, { useRef, useState } from 'react';
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

  const fileInputRef = useRef<any>(null);
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

  const showAlert = (title: string, msg: string) => {
    if (isWeb) {
      window.alert(`${title}\n${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  // Option 1: Live Video Camera
  const startLive = async () => {
    setStatusMsg('');

    // Check if running on web without mediaDevices
    if (isWeb && !navigator?.mediaDevices?.getUserMedia) {
      setStatusMsg(
        '⚠️ ব্রাউজারে লাইভ ভিডিও ক্যামেরা সাপোর্ট করছে না (HTTP IP সংযোগের কারণে)।\n' +
        '👉 অনুগ্রহ করে পাশের "📸 কার্ডের ছবি তুলে স্ক্যান করুন" বোতামটি ব্যবহার করুন, এটি যেকোনো মোবাইল ফোনেই অবিলম্বে কাজ করবে।'
      );
      return;
    }

    try {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          setStatusMsg(
            '⚠️ ক্যামেরার অনুমতি পাওয়া যায়নি। ব্রাউজারে ক্যামেরা পারমিশন Allow করুন অথবা "📸 ছবি তুলে স্ক্যান" অপশনটি ব্যবহার করুন।'
          );
          return;
        }
      }
      setLocked(false);
      setLiveOpen(true);
    } catch (err: any) {
      setStatusMsg(
        `⚠️ লাইভ ক্যামেরা শুরু হতে পারেনি (${err.message || 'Error'})। অনুগ্রহ করে "📸 ছবি তুলে স্ক্যান" ব্যবহার করুন।`
      );
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
      // Dynamically load barcode detector
      let BarcodeDetectorClass = (globalThis as any).BarcodeDetector;
      if (!BarcodeDetectorClass) {
        const mod = await import('barcode-detector/pure');
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

    // Reset input so same photo can be re-selected if needed
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
          onPress={liveOpen ? () => setLiveOpen(false) : startLive}
          style={[s.liveBtn, liveOpen && s.liveBtnClose]}
        >
          <Text style={s.white}>
            {liveOpen ? '✖ লাইভ ক্যামেরা বন্ধ করুন' : '🎥 লাইভ ভিডিও ক্যামেরা'}
          </Text>
        </TouchableOpacity>

        {liveOpen && (
          <TouchableOpacity
            onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
            style={s.switchBtn}
          >
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

      {/* STATUS / INSTRUCTION BANNER */}
      {!!statusMsg && (
        <View style={s.msgBox}>
          <Text style={s.msgText}>{statusMsg}</Text>
        </View>
      )}

      {/* LIVE CAMERA BOX */}
      {liveOpen && (
        <View style={s.cameraBox}>
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
          <Text style={s.cameraHelp}>
            আইডি কার্ডের Barcode বা QR code ফ্রেমের মাঝে সোজাভাবে স্থির রাখুন।
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
