import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, imageUrl, API_BASE } from '../lib/api';
import AcademyHeader from '../components/AcademyHeader';
import CardQrScanner from '../components/CardQrScanner';
import { Select } from '../components/StudentDirectory';
import { checkVisitingSchedule } from '../lib/visitingSchedule';
import { confirmAction } from '../lib/confirm';

const PERSON_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => ({
  value: n,
  label: n,
}));

const safeImageUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:/.test(url)) return url;
  if (typeof imageUrl === 'function') {
    try {
      return imageUrl(url);
    } catch {}
  }
  const clean = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE || ''}${clean}`;
};

export default function Gateman() {
  const [reg, setReg] = useState('');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<any[]>([]);
  const [todayVisitors, setTodayVisitors] = useState<any[]>([]);
  const [visitorTab, setVisitorTab] = useState<'inside' | 'all'>('inside');
  const [sourcePersons, setSourcePersons] = useState<Record<string, string>>({});
  const [visitPersons, setVisitPersons] = useState<Record<number, string>>({});
  const inputRef = useRef<any>(null);

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
    void loadToday();
  }, []);

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
      const msg = `Entry recorded successfully (${personCount} ${personCount > 1 ? 'persons' : 'person'}) in system & Admin Panel.`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Entry', msg);
      }
      await search();
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
    if (todayCount > 0 && typeof window !== 'undefined') {
      const ok = window.confirm(
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
      const msg = `${name} (${source}) entry saved (${personCount} ${personCount > 1 ? 'persons' : 'person'})! Total student visits: ${result.total}`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Entry Recorded', msg);
      }
      await search();
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
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Confirm exit for ${name} (${source})? Departure time will be recorded.`);
      if (!ok) return;
    }
    try {
      const result = await api('/api/service-panels/guardian-exit', {
        method: 'POST',
        body: JSON.stringify({
          entry_id: entryId,
          student_id: data.student.id,
          visitor_source: source,
        }),
      });
      const msg = result.message || `${name} (${source}) exit recorded successfully!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Exit Recorded', msg);
      }
      await search();
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
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Confirm return / exit for ${v.visitor_name} (${v.visitor_relation || 'Visitor'})? Departure time will be recorded.`
      );
      if (!ok) return;
    }
    try {
      const result = await api('/api/service-panels/guardian-exit', {
        method: 'POST',
        body: JSON.stringify({ entry_id: v.id }),
      });
      const msg = result.message || `${v.visitor_name} exit recorded successfully!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Exit Recorded', msg);
      }
      if (data?.student?.registration_no) {
        await search();
      }
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

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />
        <CardQrScanner onRegistration={fetchRegistration} />

        {/* CURRENTLY INSIDE VISITORS & GUARDIANS */}
        <View style={s.visitorsCard}>
          <View style={s.todayTitle}>
            <View>
              <Text style={s.heading}>
                👥 Currently Inside Campus ({insideVisitors.length})
              </Text>
              <Text style={s.subText}>
                Visitors who entered today and have not yet returned.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => setVisitorTab('inside')}
                style={[s.tabButton, visitorTab === 'inside' && s.tabButtonActive]}
              >
                <Text style={visitorTab === 'inside' ? s.white : s.tabButtonText}>
                  Inside ({insideVisitors.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setVisitorTab('all')}
                style={[s.tabButton, visitorTab === 'all' && s.tabButtonActive]}
              >
                <Text style={visitorTab === 'all' ? s.white : s.tabButtonText}>
                  All Today ({todayVisitors.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={loadToday} style={s.refresh}>
                <Text style={s.bold}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {displayedVisitors.length === 0 ? (
            <Text style={s.none}>
              {visitorTab === 'inside'
                ? 'No visitors currently inside campus.'
                : 'No visitor entries recorded today.'}
            </Text>
          ) : (
            displayedVisitors.map((v: any) => {
              const isInside = v.status === 'inside';
              return (
                <View
                  key={'v-entry-' + v.id}
                  style={[s.visitorRow, isInside && s.visitorRowInside]}
                >
                  {v.photo_url ? (
                    <Image source={{ uri: safeImageUrl(v.photo_url) }} style={s.todayPhoto} />
                  ) : (
                    <View style={[s.todayPhoto, s.empty]}>
                      <Text style={{ fontSize: 10 }}>No Photo</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={{ flex: 1 }}
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
                      {v.exited_at ? ` · Exited: ${new Date(v.exited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ` · ${v.duration_minutes || 0}m inside`}
                    </Text>
                  </TouchableOpacity>

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
            })
          )}
        </View>

        <View style={s.todayCard}>
          <View style={s.todayTitle}>
            <Text style={s.heading}>Today's Approved Students ({today.length})</Text>
            <TouchableOpacity onPress={loadToday} style={s.refresh}>
              <Text style={s.bold}>Refresh</Text>
            </TouchableOpacity>
          </View>
          {!today.length && (
            <Text style={s.none}>No visiting or gate pass permission today.</Text>
          )}
          {today.map((x) => (
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
                  {x.student_name} - {x.registration_no}
                </Text>
                <Text>
                  Class {x.class_name || '-'} - Room {x.room_name || '-'} -{' '}
                  {x.permission_type === 'visit' ? `Visit (👥 ${x.person_count || 1})` : 'Gate Pass'}
                </Text>
                <Text>
                  {x.permission_type === 'visit'
                    ? (x.detail_name || '-') + ' (' + (x.detail_relation || '-') + ')'
                    : x.reason || '-'}
                </Text>
              </View>
              <Text style={[s.status, x.entered && s.statusEntered]}>
                {x.entered ? 'Entered' : 'View'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.search}>
          <TextInput
            ref={inputRef}
            value={reg}
            onChangeText={setReg}
            onSubmitEditing={search}
            placeholder="Student Registration / Barcode Scan"
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={search} style={s.primary}>
            <Text style={s.white}>{busy ? 'Checking...' : 'Check'}</Text>
          </TouchableOpacity>
        </View>

        {data && (
          <>
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

            <Text style={s.heading}>Today's Visiting Permissions</Text>
            {!data.visits.length && (
              <Text style={s.none}>No visiting permission today.</Text>
            )}
            {data.visits.map((x: any) => (
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

            <Text style={s.heading}>Today's Gate Passes</Text>
            {!data.gate_passes.length && (
              <Text style={s.none}>No gate pass today.</Text>
            )}
            {data.gate_passes.map((x: any) => (
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

            <Text style={s.heading}>
              Student's Visitor Entries ({data.meeting_history?.length || 0})
            </Text>
            {(!data.meeting_history || !data.meeting_history.length) && (
              <Text style={s.none}>No visitor entries recorded yet for this student.</Text>
            )}
            {(data.meeting_history || []).slice(0, 10).map((m: any) => {
              const isInside = !m.exited_at && new Date(m.entered_at).toDateString() === new Date().toDateString();
              return (
                <View key={'m-' + m.id} style={[s.permission, isInside && s.insideRow]}>
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
                      Entry: {new Date(m.entered_at).toLocaleString()}
                      {m.exited_at ? ` · Exit: ${new Date(m.exited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  </View>
                  {isInside ? (
                    <TouchableOpacity
                      style={s.exitSmallButton}
                      onPress={() => recordExit(m.visitor_source, m.visitor_name, m.id)}
                    >
                      <Text style={s.white}>Exit (ফিরে গেছেন)</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={m.exited_at ? s.exitedBadge : s.pastBadge}>
                      {m.exited_at ? 'Exited (ফিরে গেছেন)' : 'Past Entry'}
                    </Text>
                  )}
                </View>
              );
            })}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: '#d6e0e9',
    borderRadius: 8,
    backgroundColor: '#fff',
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
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
});
