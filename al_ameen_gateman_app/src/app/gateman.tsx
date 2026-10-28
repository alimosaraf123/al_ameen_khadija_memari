import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { api, imageUrl, API_BASE } from '../lib/api';
import { getUser } from '../lib/auth';
import {
  getRoleBiometricToken,
  saveRoleBiometricToken,
  clearRoleBiometricToken,
} from '../lib/guardianDevice';
import AcademyHeader from '../components/AcademyHeader';
import CardQrScanner from '../components/CardQrScanner';
import { Select } from '../components/Select';
import { checkVisitingSchedule } from '../lib/visitingSchedule';
import { confirmAction } from '../lib/confirm';

const DEFAULT_GATEMAN_PHOTO_URL = 'https://ui-avatars.com/api/?name=Gate+Man&background=0D8ABC&color=fff&size=200';

const PERSON_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => ({
  value: n,
  label: n,
}));

const safeImageUrl = (url?: string | null) => {
  if (!url) return DEFAULT_GATEMAN_PHOTO_URL;
  let finalUrl = url;
  if (/^https?:/.test(finalUrl)) {
    return finalUrl.replace(/\.webp$/i, '.jpg');
  }
  if (typeof imageUrl === 'function') {
    try {
      const res = imageUrl(finalUrl);
      if (res) return res.replace(/\.webp$/i, '.jpg');
    } catch {}
  }
  const clean = finalUrl.startsWith('/') ? finalUrl : `/${finalUrl}`;
  return `${API_BASE || ''}${clean}`.replace(/\.webp$/i, '.jpg');
};

export default function Gateman() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showGreetingModal, setShowGreetingModal] = useState(true);
  const [reg, setReg] = useState('');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<any[]>([]);
  const [todayVisitors, setTodayVisitors] = useState<any[]>([]);
  const [visitorTab, setVisitorTab] = useState<'inside' | 'all'>('inside');
  const [sourcePersons, setSourcePersons] = useState<Record<string, string>>({});
  const [visitPersons, setVisitPersons] = useState<Record<number, string>>({});
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);

  
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [dutyStartTime, setDutyStartTime] = useState<string | null>(null);
  const [dutyBusy, setDutyBusy] = useState(false);

  const checkDutyStatus = async () => {
    try {
      const res = await api('/api/service-panels/gate-duty/status');
      if (res?.on_duty) {
        setIsOnDuty(true);
        setDutyStartTime(res.start_time);
      }
    } catch {}
  };

  const handleStartDuty = async () => {
    setDutyBusy(true);
    try {
      const res = await api('/api/service-panels/gate-duty/start', { method: 'POST' });
      setIsOnDuty(true);
      setDutyStartTime(res.start_time);
      setShowGreetingModal(false);
      Alert.alert('Gate Duty Started', 'ডিউটি শুরু হয়েছে এবং Staff Attendance-এ আপনি Present হিসেবে রেকর্ড হয়েছেন!');
    } catch (e: any) {
      Alert.alert('Duty Start Error', e.message || 'Could not record duty start.');
    } finally {
      setDutyBusy(false);
    }
  };

  const handleEndDuty = async () => {
    const confirmed = await confirmAction('End Gate Duty', 'আপনি কি আজকের গেট ডিউটি সমাপ্ত করতে চান?');
    if (!confirmed) return;
    setDutyBusy(true);
    try {
      await api('/api/service-panels/gate-duty/end', { method: 'POST' });
      setIsOnDuty(false);
      Alert.alert('Gate Duty Ended', 'আজকের গেট ডিউটি সমাপ্ত হয়েছে।');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setDutyBusy(false);
    }
  };

  const cleanBarcode = (val: string) => {
    let v = String(val || '').trim();
    if (/^aam\d+$/i.test(v)) return v.replace(/^aam/i, '');
    const marked = v.match(/(?:registration|reg|student|stu|id)[\s_\-:]*(\d{4,8})/i);
    if (marked) return marked[1];
    return v;
  };

  const loadToday = async () => {
    try {
      const d = await api('/api/service-panels/gate-today');
      setToday(d.permissions || []);
      setTodayVisitors(d.today_visitors || []);
    } catch (e: any) {
      Alert.alert('Today permissions', e.message);
    }
  };

  useEffect(() => {
    void getUser<any>().then(async (user) => {
      let u = user;
      if (!u?.photo_url || !u?.full_name || u?.full_name?.startsWith('Gateman')) {
        try {
          const res = await api('/api/service-panels/staff/me');
          if (res?.staff) {
            u = { ...u, ...res.staff };
          }
        } catch {}
      }
      setCurrentUser(u);
    });
    void loadToday();
    void checkDutyStatus();
    if (Platform.OS !== 'web') {
      void getRoleBiometricToken('gateman').then((token) => setFingerprintEnabled(!!token));
    }
  }, []);

  useEffect(() => {
    // Show greeting modal upon load, dismiss after 12 seconds
    setShowGreetingModal(true);
    const timer = setTimeout(() => {
      setShowGreetingModal(false);
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return { bengali: 'শুভ সকাল', english: 'Good Morning', icon: '🌅' };
    }
    if (hour >= 12 && hour < 17) {
      return { bengali: 'শুভ দুপুর', english: 'Good Afternoon', icon: '☀️' };
    }
    if (hour >= 17 && hour < 21) {
      return { bengali: 'শুভ সন্ধ্যা', english: 'Good Evening', icon: '🌇' };
    }
    return { bengali: 'শুভ রাত্রি / ডিউটি স্বাগতম', english: 'Duty Welcome', icon: '🌙' };
  };

  const gatemanName = currentUser?.full_name && !currentUser.full_name.startsWith('Gateman')
    ? currentUser.full_name
    : (currentUser?.name && !currentUser.name.startsWith('Gateman') ? currentUser.name : 'Aparna Mondal');
  const gatemanLoginId = currentUser?.login_id || 'gateman01';
  const gatemanPhotoUri = (currentUser?.photo_url && currentUser.photo_url.trim())
    ? safeImageUrl(currentUser.photo_url)
    : DEFAULT_GATEMAN_PHOTO_URL;
  const timeGreeting = getTimeGreeting();

  const toggleGatemanFingerprint = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Mobile App Only', 'Fingerprint login can be configured in the mobile app.');
      return;
    }
    try {
      if (fingerprintEnabled) {
        await clearRoleBiometricToken('gateman');
        setFingerprintEnabled(false);
        Alert.alert('Fingerprint Disabled', 'Fingerprint login for Gateman has been disabled on this device.');
      } else {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const isEn = await LocalAuthentication.isEnrolledAsync();
        if (!hasHw || !isEn) {
          Alert.alert('Fingerprint Unavailable', 'Please set up fingerprint authentication in your device Settings first.');
          return;
        }
        const auth = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm Fingerprint for Gateman Login' });
        if (!auth.success) return;
        const reg = await api('/api/biometric/register', {
          method: 'POST',
          body: JSON.stringify({ device_name: `Gateman Device (${currentUser?.login_id || 'gateman'})` })
        });
        if (reg?.device_token) {
          await saveRoleBiometricToken('gateman', reg.device_token, currentUser?.login_id || 'gateman01');
          setFingerprintEnabled(true);
          Alert.alert('Success', 'Fingerprint Login is now enabled as DEFAULT for Gateman on this device!');
        }
      }
    } catch (e: any) {
      Alert.alert('Fingerprint Error', e.message);
    }
  };

  // Hardware barcode scanner listener for web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBuffer.trim().length >= 3) {
          const scanned = cleanBarcode(barcodeBuffer.trim());
          barcodeBuffer = '';
          void fetchRegistration(scanned);
        } else {
          barcodeBuffer = '';
        }
        return;
      }

      if (e.key.length === 1) {
        if (diff > 80) {
          barcodeBuffer = e.key;
        } else {
          barcodeBuffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchRegistration = async (value: string) => {
    const registration = cleanBarcode(value);
    if (!registration) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Enter or scan a registration number / barcode.');
      } else {
        Alert.alert('Required', 'Enter or scan a registration number.');
      }
      return;
    }
    setReg(registration);
    setBusy(true);
    try {
      const d = await api('/api/service-panels/gate-check/' + encodeURIComponent(registration));
      setData(d);
    } catch (e: any) {
      setData(null);
      const err = e.message || 'Student not found';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Gate Check: ' + err);
      } else {
        Alert.alert('Gate Check', err);
      }
    } finally {
      setBusy(false);
    }
  };

  const search = async () => fetchRegistration(reg);

  const enter = async (type: string, id: number, personCount: number = 1) => {
    try {
      await api('/api/service-panels/gate-entry', {
        method: 'POST',
        body: JSON.stringify({ permission_type: type, permission_id: id }),
      });
      if (type === 'visit') {
        await api('/api/service-panels/gate-visitor-entry', {
          method: 'POST',
          body: JSON.stringify({ permission_id: id, person_count: personCount }),
        });
      }
      setToday((prev) => prev.filter((p) => !(p.permission_type === type && Number(p.permission_id) === Number(id))));
      const msg = `Entry recorded successfully (${personCount} ${personCount > 1 ? 'persons' : 'person'}) in system & Admin Panel.`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Entry', msg);
      }
      setData(null);
      setReg('');
      await loadToday();
    } catch (e: any) {
      const err = e.message || 'Error recording permission entry';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Entry: ' + err);
      } else {
        Alert.alert('Entry', err);
      }
    }
  };

  const recordMeeting = async (source: string, name: string, personCount: number = 1) => {
    if (!data?.student?.id || !name) return;

    // Check visiting schedule for student
    const sched = data?.student?.class_name
      ? checkVisitingSchedule(new Date(), data.student.class_name)
      : null;

    const hasPermission = Boolean(
      (data?.visits && data.visits.length > 0) ||
      (data?.gate_passes && data.gate_passes.length > 0)
    );

    if (sched && !sched.allowed && !hasPermission) {
      const confirmPrompt =
        `আজ ক্লাস ${data.student.class_name}-এর নির্ধারিত ভিজিটিং দিন নয়!\n\n` +
        `• নির্ধারিত দিন: ${sched.scheduledText}\n` +
        `• আজকের দিন: ${sched.todaySundayText}\n` +
        `• কারণ: ${sched.message}\n\n` +
        `আপনি কি বিশেষ অনুমতি / জরুরি ব্যতিক্রম (Exception) হিসেবে ${name} (${source})-এর এন্ট্রি রেকর্ড করতে চান?`;

      const proceed = await confirmAction(
        '⚠️ সতর্কবার্তা: নির্ধারিত ভিজিটিং দিন নয় (Unscheduled Visit)',
        confirmPrompt
      );
      if (!proceed) return;
    }

    const todayCount = meetingToday(source);
    if (todayCount > 0) {
      const ok = await confirmAction(
        'Already Entered Today',
        `${name} (${source}) has already entered today (${todayCount} time). Record another entry with ${personCount} persons?`
      );
      if (!ok) return;
    }
    try {
      const result = await api('/api/service-panels/guardian-entry', {
        method: 'POST',
        body: JSON.stringify({
          student_id: data.student.id,
          visitor_source: source,
          person_count: personCount,
        }),
      });
      setToday((prev) => prev.filter((p) => Number(p.student_id) !== Number(data.student.id)));
      const msg = `${name} (${source}) entry saved (${personCount} ${personCount > 1 ? 'persons' : 'person'})! Total student visits: ${result.total}`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Entry Recorded', msg);
      }
      setData(null);
      setReg('');
      await loadToday();
    } catch (e: any) {
      const err = e.message || 'Error recording entry';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Meeting Entry: ' + err);
      } else {
        Alert.alert('Meeting Entry', err);
      }
    }
  };

  const recordExit = async (source: string, name: string, entryId?: number) => {
    if (!data?.student?.id || !name) return;
    const ok = await confirmAction(
      'Confirm Exit',
      `Confirm exit for ${name} (${source})? Departure time will be recorded.`
    );
    if (!ok) return;
    try {
      const result = await api('/api/service-panels/guardian-exit', {
        method: 'POST',
        body: JSON.stringify({
          entry_id: entryId,
          student_id: data.student.id,
          visitor_source: source,
        }),
      });
      setToday((prev) => prev.filter((p) => Number(p.student_id) !== Number(data?.student?.id)));
      const msg = result.message || `${name} (${source}) exit recorded successfully!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Exit Recorded', msg);
      }
      setData(null);
      setReg('');
      await loadToday();
    } catch (e: any) {
      const err = e.message || 'Error recording exit';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Exit: ' + err);
      } else {
        Alert.alert('Exit', err);
      }
    }
  };

  const recordDirectExit = async (v: any) => {
    if (!v?.id) return;
    const ok = await confirmAction(
      'Confirm Return / Exit',
      `Confirm return / exit for ${v.visitor_name} (${v.visitor_relation || 'Visitor'})? Departure time will be recorded.`
    );
    if (!ok) return;
    try {
      const result = await api('/api/service-panels/guardian-exit', {
        method: 'POST',
        body: JSON.stringify({ entry_id: v.id }),
      });
      setToday((prev) => prev.filter((p) => Number(p.student_id) !== Number(v.student_id)));
      const msg = result.message || `${v.visitor_name} exit recorded successfully!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Exit Recorded', msg);
      }
      setData(null);
      setReg('');
      await loadToday();
    } catch (e: any) {
      const err = e.message || 'Error recording exit';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Exit: ' + err);
      } else {
        Alert.alert('Exit', err);
      }
    }
  };

  const meetingCount = (source: string) =>
    Number(
      (data?.meeting_counts || []).find((item: any) => item.visitor_source === source)?.visit_count || 0
    );

  const meetingToday = (source: string) =>
    Number(
      (data?.meeting_counts || []).find((item: any) => item.visitor_source === source)
        ?.today_visit_count || 0
    );

  const meetingInside = (source: string) => {
    const item = (data?.meeting_counts || []).find((item: any) => item.visitor_source === source);
    if (!item || !Number(item.inside_count)) return null;
    return {
      entryId: item.inside_entry_id,
      enteredAt: item.inside_entered_at,
    };
  };

  const Photo = ({ title, url, name, source }: any) => {
    const count = meetingCount(source);
    const todayCount = meetingToday(source);
    const insideInfo = source ? meetingInside(source) : null;
    const isInside = !!insideInfo;
    const displayName = (name && name.trim() && name !== '-') ? name.trim() : (source ? title : '');

    return (
      <View style={[s.photoCard, isInside && s.photoCardInside]}>
        {url ? (
          <Image source={{ uri: safeImageUrl(url) }} style={s.photo} />
        ) : (
          <View style={[s.photo, s.empty]}>
            <Text>No Photo</Text>
          </View>
        )}
        <Text style={[s.bold, { marginTop: 4, textAlign: 'center' }]} numberOfLines={1}>{title}</Text>
        <Text style={{ textAlign: 'center', marginTop: 2, fontSize: 13, color: '#334155', fontWeight: '500', minHeight: 18 }} numberOfLines={1}>
          {name || '-'}
        </Text>
        {source && (
          <>
            <Text style={s.visitCount}>Total visits: {count}</Text>
            {isInside ? (
              <View style={{ width: '100%', alignItems: 'center', marginTop: 5 }}>
                <View style={s.insideBadge}>
                  <Text style={s.insideBadgeText}>🟢 Inside Campus</Text>
                  {insideInfo?.enteredAt && (
                    <Text style={s.insideTimeText}>
                      Since {new Date(insideInfo.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={s.exitButton}
                  onPress={() => recordExit(source, displayName, insideInfo?.entryId)}
                >
                  <Text style={s.white}>Exit (ফিরে গেছেন)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: '100%', alignItems: 'center', marginTop: 5, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569' }}>Persons:</Text>
                  <View style={{ width: 62 }}>
                    <Select
                      label="1"
                      value={sourcePersons[source] || '1'}
                      onChange={(v) => setSourcePersons((prev) => ({ ...prev, [source]: v }))}
                      options={PERSON_OPTIONS}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.entryButton, todayCount > 0 && s.entryRepeatButton]}
                  onPress={() => recordMeeting(source, displayName, Number(sourcePersons[source] || '1'))}
                >
                  <Text style={s.white}>
                    {todayCount > 0 ? `Entered (${todayCount}) + Entry` : 'Entry'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const insideVisitors = todayVisitors.filter((x: any) => x.status === 'inside');
  const displayedVisitors = visitorTab === 'inside' ? insideVisitors : todayVisitors;

  // "Today's Approved Students" notification/list:
  // ONLY show students awaiting entry!
  // If active (entered/inside campus) or returned (exited), they must disappear from this notification/list.
  const pendingToday = useMemo(() => {
    return today.filter((x: any) => {
      if (x.entered) return false;
      const hasVisitorRecordToday = todayVisitors.some(
        (v: any) => Number(v.student_id) === Number(x.student_id)
      );
      if (hasVisitorRecordToday) return false;
      return true;
    });
  }, [today, todayVisitors]);

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader
          profilePhoto={gatemanPhotoUri}
          onPhotoPress={() => setShowGreetingModal(true)}
        />

        {/* LOGIN WELCOME GREETING MODAL */}
        <Modal
          visible={showGreetingModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowGreetingModal(false)}
        >
          <View style={s.greetingOverlay}>
            <View style={s.greetingCard}>
              {/* Header Badge */}
              <View style={s.greetingHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 16 }}>👮‍♀️</Text>
                  <Text style={s.greetingHeaderBadge}>AL-AMEEN MISSION GATE DUTY</Text>
                </View>
                <TouchableOpacity
                  style={s.greetingCloseButton}
                  onPress={() => setShowGreetingModal(false)}
                >
                  <Text style={s.greetingCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Photo */}
              <View style={s.greetingPhotoContainer}>
                <Image
                  source={{ uri: gatemanPhotoUri || DEFAULT_GATEMAN_PHOTO_URL }}
                  style={s.greetingPhoto}
                  resizeMode="cover"
                />
                <View style={s.greetingStatusDot}>
                  <Text style={{ fontSize: 12 }}>🟢</Text>
                </View>
              </View>

              {/* Greeting Text */}
              <Text style={s.greetingTimeText}>
                {timeGreeting.icon} {timeGreeting.bengali}!
              </Text>
              <Text style={s.greetingNameText}>
                {gatemanName}
              </Text>
              <Text style={s.greetingSubText}>
                {timeGreeting.english} · গেট ডিউটিতে আপনাকে স্বাগতম
              </Text>

              {/* Info Details */}
              <View style={s.greetingDetailsBox}>
                <View style={s.greetingDetailRow}>
                  <Text style={s.greetingDetailLabel}>Gate Post:</Text>
                  <Text style={s.greetingDetailVal}>Main Campus Gate (মূল ফটক - ১)</Text>
                </View>
                <View style={s.greetingDetailRow}>
                  <Text style={s.greetingDetailLabel}>Gateman ID:</Text>
                  <Text style={s.greetingDetailVal}>{gatemanLoginId} · Staff ID: 786786</Text>
                </View>
                <View style={s.greetingDetailRow}>
                  <Text style={s.greetingDetailLabel}>Campus:</Text>
                  <Text style={s.greetingDetailVal}>Al-Ameen Academy Memari</Text>
                </View>
                <View style={s.greetingDetailRow}>
                  <Text style={s.greetingDetailLabel}>Date & Time:</Text>
                  <Text style={s.greetingDetailVal}>
                    {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>

              {/* Continue button */}
              <TouchableOpacity
                style={s.greetingStartButton}
                onPress={() => setShowGreetingModal(false)}
              >
                <Text style={s.greetingStartButtonText}>
                  ডিউটি শুরু করুন (Start Gate Duty) →
                </Text>
              </TouchableOpacity>

              <Text style={s.greetingAutoDismissText}>
                স্বয়ংক্রিয়ভাবে কয়েক সেকেন্ডে বন্ধ হবে...
              </Text>
            </View>
          </View>
        </Modal>


        <CardQrScanner onRegistration={fetchRegistration} value={reg} busy={busy} />

        {/* CURRENTLY INSIDE VISITORS & GUARDIANS */}
        <View style={s.visitorsCard}>
          <View style={[s.todayTitle, displayedVisitors.length === 0 && { marginBottom: 0 }]}>
            <Text style={s.heading}>
              👥 Currently Inside Campus ({insideVisitors.length})
            </Text>
            <TouchableOpacity onPress={loadToday} style={s.refresh}>
              <Text style={s.bold}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {displayedVisitors.map((v: any) => {
              const isInside = v.status === 'inside';
              return (
                <View
                  key={'v-entry-' + v.id}
                  style={[s.visitorRow, isInside && s.visitorRowInside]}
                >
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', width: '100%' }}>
                    {v.photo_url ? (
                      <Image source={{ uri: safeImageUrl(v.photo_url) }} style={s.todayPhoto} />
                    ) : (
                      <View style={[s.todayPhoto, s.empty]}>
                        <Text style={{ fontSize: 10, textAlign: 'center' }}>No Photo</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={{ flex: 1, minWidth: 0 }}
                      onPress={() => {
                        setReg(v.registration_no);
                        void fetchRegistration(v.registration_no);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={s.bold}>
                          {v.visitor_name} ({v.visitor_relation})
                        </Text>
                        <Text style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          👥 {v.person_count || 1} {Number(v.person_count) > 1 ? 'persons' : 'person'}
                        </Text>
                        <Text style={isInside ? s.insideBadgeSmall : s.exitedBadgeSmall}>
                          {isInside ? '🟢 Inside' : '✓ Exited'}
                        </Text>
                      </View>
                      <Text style={{ color: '#254d75', fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                        Student: {v.student_name} (Reg. {v.registration_no}) · Class {v.class_name || '-'}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                        Entered: {new Date(v.entered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {(v.entered_by_name || v.entered_by_login) ? ` (By: ${v.entered_by_name || v.entered_by_login})` : ''}
                        {v.exited_at ? ` · Exited: ${new Date(v.exited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${(v.exited_by_name || v.exited_by_login) ? ` (By: ${v.exited_by_name || v.exited_by_login})` : ''}` : ` · ${v.duration_minutes || 0}m inside`}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isInside ? (
                    <TouchableOpacity
                      style={s.exitButtonDirect}
                      onPress={() => recordDirectExit(v)}
                    >
                      <Text style={s.white}>Return / Exit (ফিরে গেছেন)</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 12, paddingHorizontal: 8 }}>
                      Exited
                    </Text>
                  )}
                </View>
              );
            })}
        </View>

        {pendingToday.length > 0 && (
          <View style={s.todayCard}>
            <View style={s.todayTitle}>
              <Text style={s.heading}>Today's Approved Students ({pendingToday.length})</Text>
              <TouchableOpacity onPress={loadToday} style={s.refresh}>
                <Text style={s.bold}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {pendingToday.map((x) => (
              <TouchableOpacity
                key={x.permission_type + '-' + x.permission_id}
                onPress={() => {
                  setReg(x.registration_no);
                  void (async () => {
                    setBusy(true);
                    try {
                      setData(
                        await api(
                          '/api/service-panels/gate-check/' + encodeURIComponent(x.registration_no)
                        )
                      );
                    } catch (e: any) {
                      Alert.alert('Gate Check', e.message);
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                style={[s.todayRow, x.entered && s.entered]}
              >
                {x.photo_url ? (
                  <Image source={{ uri: safeImageUrl(x.photo_url) }} style={s.todayPhoto} />
                ) : (
                  <View style={[s.todayPhoto, s.empty]}>
                    <Text>No Photo</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>
                    {x.student_name} (Reg: {x.registration_no})
                  </Text>
                  <Text>Class {x.class_name || '-'}</Text>
                  <Text style={{ color: '#555', fontSize: 12 }}>
                    {x.permission_type === 'visit'
                      ? `Visitor: ${x.visitor_name || '-'} (${x.visitor_relation || '-'})`
                      : `Reason: ${x.reason || 'Gate Pass'}`}
                  </Text>
                </View>
                <View>
                  <Text style={[s.status, x.entered && s.statusEntered]}>
                    {x.entered ? 'Entered' : x.permission_type === 'visit' ? 'Visiting' : 'Gate Pass'}
                  </Text>
                  {!x.entered && (
                    <TouchableOpacity
                      onPress={() => enter(x.permission_type, x.permission_id)}
                      style={[s.allow, { marginTop: 4 }]}
                    >
                      <Text style={s.white}>Mark Entry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}


        {data && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 }}>
              <TouchableOpacity
                onPress={() => {
                  setData(null);
                  setReg('');
                }}
                style={{
                  backgroundColor: '#fee2e2',
                  borderWidth: 1,
                  borderColor: '#fca5a5',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Text style={{ color: '#b91c1c', fontWeight: '800', fontSize: 12.5 }}>
                  ✕ Close Details (বন্ধ করুন)
                </Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const hasPermission = Boolean(
                (data.visits && data.visits.length > 0) ||
                (data.gate_passes && data.gate_passes.length > 0)
              );
              const scheduleCheck = data.student?.class_name
                ? checkVisitingSchedule(new Date(), data.student.class_name)
                : null;
              if (!scheduleCheck) return null;

              // Don't show unscheduled visiting day warning if student already has approved visit permission or gate pass
              if (!scheduleCheck.allowed && hasPermission) {
                return null;
              }

              return (
                <View
                  style={[
                    s.scheduleBanner,
                    scheduleCheck.allowed ? s.scheduleBannerValid : s.scheduleBannerAlert,
                  ]}
                >
                  <View style={s.scheduleBannerHeader}>
                    <Text style={s.scheduleBannerIcon}>
                      {scheduleCheck.allowed ? '✅' : '⚠️'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.scheduleBannerTitle,
                          scheduleCheck.allowed
                            ? s.scheduleBannerTitleValid
                            : s.scheduleBannerTitleAlert,
                        ]}
                      >
                        {scheduleCheck.allowed
                          ? `আজ ক্লাস ${data.student.class_name}-এর নির্ধারিত ভিজিটিং দিন`
                          : `সতর্কবার্তা: আজ ক্লাস ${data.student.class_name}-এর নির্ধারিত ভিজিটিং দিন নয়!`}
                      </Text>
                      <Text style={s.scheduleBannerSubtitle}>
                        {scheduleCheck.allowed
                          ? 'SCHEDULED VISITING DAY'
                          : 'UN-SCHEDULED VISITING DAY WARNING'}
                      </Text>
                    </View>
                  </View>
                  <View style={s.scheduleBannerBody}>
                    <Text style={s.scheduleBannerInfo}>
                      • নির্ধারিত শিডিউল:{' '}
                      <Text style={s.scheduleBannerHighlight}>
                        {scheduleCheck.scheduledText}
                      </Text>
                      {'   '}• আজকের দিন:{' '}
                      <Text style={s.scheduleBannerHighlight}>
                        {scheduleCheck.todaySundayText}
                      </Text>
                    </Text>
                    <Text
                      style={[
                        s.scheduleBannerMsg,
                        !scheduleCheck.allowed && s.scheduleBannerMsgAlert,
                      ]}
                    >
                      {scheduleCheck.message}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {(() => {
              const formatTitle = (rel?: string | null, fallback?: string) => {
                const r = (rel && String(rel).trim()) ? String(rel).trim() : '';
                if (!r) return fallback || '';
                return r
                  .split(' ')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join(' ');
              };

              const v1 = (data.visitors || []).find((v: any) => Number(v.visitor_number) === 1);
              const v2 = (data.visitors || []).find((v: any) => Number(v.visitor_number) === 2);
              const extraVisitors = (data.visitors || []).filter((v: any) => Number(v.visitor_number) > 2);

              const v1Title = formatTitle(v1?.relation, 'Visitor 1');
              const v1Name = (v1?.visitor_name && String(v1.visitor_name).trim()) ? String(v1.visitor_name).trim() : '-';

              const v2Title = formatTitle(v2?.relation, 'Visitor 2');
              const v2Name = (v2?.visitor_name && String(v2.visitor_name).trim()) ? String(v2.visitor_name).trim() : '-';

              return (
                <View style={s.student}>
                  <Photo
                    title="Student"
                    url={data.student.photo_url}
                    name={data.student.student_name}
                  />
                  <Photo
                    title="Father"
                    source="father"
                    url={data.photos?.father_photo}
                    name={data.student.father_name}
                  />
                  <Photo
                    title="Mother"
                    source="mother"
                    url={data.photos?.mother_photo}
                    name={data.student.mother_name}
                  />
                  <Photo
                    title={v1Title}
                    source="visitor1"
                    url={data.photos?.visitor1_photo}
                    name={v1Name}
                  />
                  <Photo
                    title={v2Title}
                    source="visitor2"
                    url={data.photos?.visitor2_photo}
                    name={v2Name}
                  />
                  {extraVisitors.map((v: any) => {
                    const extraTitle = formatTitle(v.relation, 'Visitor ' + v.visitor_number);
                    const extraName = (v.visitor_name && String(v.visitor_name).trim()) ? String(v.visitor_name).trim() : '-';
                    return (
                      <Photo
                        key={v.visitor_number}
                        source={'visitor' + v.visitor_number}
                        title={extraTitle}
                        url={data.photos?.['visitor' + v.visitor_number + '_photo']}
                        name={extraName}
                      />
                    );
                  })}
                </View>
              );
            })()}

            <Text style={s.heading}>
              Today's Visiting Permissions ({data.visits?.length || 0})
            </Text>
            {data.visits?.map((x: any) => (
              <View key={'v' + x.id} style={s.permission}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>
                    {x.token_no} - {x.visitor_name} ({x.visitor_relation})
                  </Text>
                  <Text>
                    {new Date(x.visit_at).toLocaleString()} - {x.duration_minutes} minutes
                  </Text>
                </View>
                {!x.entered && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155' }}>Persons:</Text>
                    <View style={{ width: 62 }}>
                      <Select
                        label="1"
                        value={visitPersons[x.id] || String(x.person_count || '1')}
                        onChange={(v) => setVisitPersons((prev) => ({ ...prev, [x.id]: v }))}
                        options={PERSON_OPTIONS}
                      />
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  disabled={!!x.entered}
                  style={[s.allow, x.entered && s.entryDisabled]}
                  onPress={() => enter('visit', x.id, Number(visitPersons[x.id] || x.person_count || '1'))}
                >
                  <Text style={s.white}>
                    {x.entered ? 'Entered Today' : 'Allow Entry'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={s.heading}>
              Today's Gate Passes ({data.gate_passes?.length || 0})
            </Text>
            {data.gate_passes?.map((x: any) => (
              <View key={'g' + x.id} style={s.permission}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>
                    {x.token_no} - {x.reason}
                  </Text>
                  <Text>Status: {x.status}</Text>
                </View>
                <TouchableOpacity
                  disabled={!!x.entered}
                  style={[s.allow, x.entered && s.entryDisabled]}
                  onPress={() => enter('gate_pass', x.id)}
                >
                  <Text style={s.white}>
                    {x.entered ? 'Exited Today' : 'Allow Exit'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            {(() => {
              const activeInsideEntries = (data.meeting_history || []).filter(
                (m: any) => !m.exited_at && new Date(m.entered_at).toDateString() === new Date().toDateString()
              );
              return (
                <>
                  <Text style={s.heading}>
                    Student's Visitor Entries ({activeInsideEntries.length})
                  </Text>
                  {activeInsideEntries.map((m: any) => (
                    <View key={'m-' + m.id} style={[s.permission, s.insideRow]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={s.bold}>
                            {m.visitor_name} ({m.visitor_relation}) - <Text style={{ textTransform: 'capitalize' }}>{m.visitor_source}</Text>
                          </Text>
                          <Text style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                            👥 {m.person_count || 1}
                          </Text>
                        </View>
                        <Text style={s.historyTime}>
                          Entry: {new Date(m.entered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {(m.entered_by_name || m.entered_by_login) ? ` (By: ${m.entered_by_name || m.entered_by_login})` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={s.exitSmallButton}
                        onPress={() => recordExit(m.visitor_source, m.visitor_name, m.id)}
                      >
                        <Text style={s.white}>Exit (ফিরে গেছেন)</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              );
            })()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef4f7' },
  body: {
    padding: 16,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    gap: 13,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  passwordButton: {
    backgroundColor: '#e5edf6',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#afc1d4',
  },
  passwordText: { fontSize: 12, fontWeight: '800', color: '#254d75' },
  todayCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#cbd8e4',
    gap: 7,
  },
  todayTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refresh: {
    backgroundColor: '#e2ecf8',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: '#d6e0e9',
    borderRadius: 8,
  },
  entered: { backgroundColor: '#e4f3e9', borderColor: '#9bcbae' },
  todayPhoto: { width: 48, height: 56, borderRadius: 5, resizeMode: 'cover' },
  status: {
    backgroundColor: '#1769aa',
    color: '#fff',
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  statusEntered: { backgroundColor: '#198754' },
  title: { fontSize: 25, fontWeight: '900' },
  logout: { backgroundColor: '#b52d3a', padding: 11, borderRadius: 7 },
  white: { color: '#fff', fontWeight: '800' },
  search: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#aebbc8',
    borderRadius: 7,
    padding: 11,
    backgroundColor: '#fff',
  },
  primary: { backgroundColor: '#1769aa', padding: 13, borderRadius: 7 },
  student: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCard: {
    width: 150,
    backgroundColor: '#fff',
    padding: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  photo: { width: 105, height: 120, resizeMode: 'cover', borderRadius: 6 },
  empty: {
    backgroundColor: '#e6ebef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: { fontWeight: '800' },
  meta: { backgroundColor: '#dcecff', padding: 12, borderRadius: 7 },
  heading: { fontSize: 18, fontWeight: '900' },
  guardian: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d4dde5',
  },
  guardianPhoto: { width: 60, height: 68, borderRadius: 6, resizeMode: 'cover' },
  permission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d4dde5',
  },
  allow: { backgroundColor: '#198754', padding: 11, borderRadius: 7 },
  none: { color: '#b42318', backgroundColor: '#fff1f0', padding: 11, borderRadius: 7 },
  entryButton: {
    backgroundColor: '#198754',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 7,
    marginTop: 7,
  },
  entryRepeatButton: {
    backgroundColor: '#0284c7',
  },
  entryDisabled: { backgroundColor: '#94a3b8' },
  visitCount: { color: '#31566f', fontWeight: '700', marginTop: 5 },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d4dde5',
  },
  sourceBadge: {
    backgroundColor: '#e4edf7',
    color: '#234d6f',
    fontWeight: '800',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    textTransform: 'capitalize',
  },
  photoCardInside: {
    borderColor: '#16a34a',
    borderWidth: 2,
    backgroundColor: '#f0fdf4',
  },
  insideBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginVertical: 4,
    alignItems: 'center',
    width: '100%',
  },
  insideBadgeText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '800',
  },
  insideTimeText: {
    color: '#166534',
    fontSize: 10,
    marginTop: 2,
  },
  exitButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  exitSmallButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  insideRow: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderWidth: 1.5,
  },
  exitedBadge: {
    color: '#475569',
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 5,
    fontSize: 12,
  },
  pastBadge: {
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
  },
  historyTime: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  visitorsCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    gap: 8,
  },
  subText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  tabButton: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e2ecf8',
  },
  tabButtonActive: {
    backgroundColor: '#174c75',
  },
  tabButtonText: {
    color: '#254d75',
    fontWeight: '700',
    fontSize: 12,
  },
  visitorRow: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#d6e0e9',
    borderRadius: 10,
    backgroundColor: '#fff',
    gap: 8,
  },
  visitorRowInside: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderWidth: 1.5,
  },
  insideBadgeSmall: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exitedBadgeSmall: {
    backgroundColor: '#e2e8f0',
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exitButtonDirect: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginTop: 6,
  },
  scheduleBanner: {
    padding: 14,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1.5,
  },
  scheduleBannerValid: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  scheduleBannerAlert: {
    backgroundColor: '#fef2f2',
    borderColor: '#f87171',
  },
  scheduleBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleBannerIcon: {
    fontSize: 24,
  },
  scheduleBannerTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  scheduleBannerTitleValid: {
    color: '#15803d',
  },
  scheduleBannerTitleAlert: {
    color: '#b91c1c',
  },
  scheduleBannerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  scheduleBannerBody: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 3,
  },
  scheduleBannerInfo: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  scheduleBannerHighlight: {
    fontWeight: '800',
    color: '#0f172a',
  },
  scheduleBannerMsg: {
    fontSize: 12,
    color: '#475569',
  },
  scheduleBannerMsgAlert: {
    color: '#dc2626',
    fontWeight: '700',
  },

  /* Greeting Modal Styles */
  greetingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: { backdropFilter: 'blur(8px)' } as any,
      default: {},
    }),
  },
  greetingCard: {
    backgroundColor: '#ffffff',
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  greetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  greetingHeaderBadge: {
    color: '#047857',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  greetingCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingCloseText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },
  greetingPhotoContainer: {
    position: 'relative',
    marginBottom: 14,
  },
  greetingPhoto: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    borderColor: '#10b981',
  },
  greetingStatusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 2,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  greetingTimeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 2,
  },
  greetingNameText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  greetingSubText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  greetingDetailsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    gap: 7,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 18,
  },
  greetingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingDetailLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  greetingDetailVal: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '800',
  },
  greetingStartButton: {
    backgroundColor: '#059669',
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  greetingStartButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  greetingAutoDismissText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 8,
    fontStyle: 'italic',
  },

  /* Duty Banner Card */
  dutyBannerCard: {
    backgroundColor: '#0c2d48',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#1b4d75',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  dutyBannerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  dutyAvatarWrapper: {
    position: 'relative',
  },
  dutyAvatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2.5,
    borderColor: '#34d399',
  },
  dutyAvatarOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#0c2d48',
  },
  dutyGreetingSalutation: {
    color: '#a7f3d0',
    fontSize: 13,
    fontWeight: '700',
  },
  dutyActiveChip: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  dutyActiveChipText: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '800',
  },
  dutyGatemanName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  dutySubDetails: {
    color: '#93c5fd',
    fontSize: 11,
    marginTop: 2,
  },
  dutyBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  dutyGreetingBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  dutyGreetingBtnText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
  dutyFingerprintBtn: {
    backgroundColor: '#1e3a8a',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#60a5fa',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dutyFingerprintActiveBtn: {
    backgroundColor: '#059669',
    borderColor: '#34d399',
  },
  dutyFingerprintBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
});
