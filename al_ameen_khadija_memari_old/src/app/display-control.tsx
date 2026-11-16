import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import AcademyHeader from '../components/AcademyHeader';
import { api, imageUrl } from '../lib/api';

const MODES = [
  ['display', 'Display'],
  ['routine', 'Routine'],
  ['notice', 'Notice'],
  ['weekly_exam', 'Weekly Test'],
  ['result', 'Result'],
] as const;

export interface WeeklyItem {
  class_name: string;
  subject: string;
  time: string;
  from_time?: string;
  to_time?: string;
  full_marks: string;
  syllabus: string;
}

export const CLASS_OPTIONS = [
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XA',
  'XB',
  'XI',
  'XI-Sc.',
  'XI-Arts',
  'XII',
  'XII-Sc.',
  'XII-Arts',
];

export const SUBJECT_OPTIONS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Bengali',
  'English',
  'English-I',
  'English-II',
  'History',
  'Geography',
  'Life Science',
  'Physical Science',
  'Arabic',
  'Computer',
  'Hindi',
  'Art',
  'Science',
];

const splitTime = (timeStr: string) => {
  const s = String(timeStr || '').trim();
  const parts = s.split(/\s*-\s*|\s+to\s+/i);
  return {
    from_time: parts[0]?.trim() || '',
    to_time: parts[1]?.trim() || '',
  };
};

const fromText = (text: string): WeeklyItem[] =>
  text
    .split(/\n+/)
    .map(x => x.split('|').map(y => y.trim()))
    .filter(parts => parts.some(Boolean))
    .map(parts => {
      const className = parts[0] || '';
      const subject = parts[1] || '';
      const timeStr = parts[2] || '';
      const times = splitTime(timeStr);
      if (parts.length >= 5) {
        return {
          class_name: className,
          subject: subject,
          time: timeStr,
          from_time: times.from_time,
          to_time: times.to_time,
          full_marks: parts[3] || '',
          syllabus: parts.slice(4).join(' | ') || '',
        };
      }
      return {
        class_name: className,
        subject: subject,
        time: timeStr,
        from_time: times.from_time,
        to_time: times.to_time,
        full_marks: '',
        syllabus: parts[3] || '',
      };
    });

const toText = (items: WeeklyItem[]): string =>
  (items || [])
    .map(x => {
      const time = x.time || [x.from_time, x.to_time].filter(Boolean).join(' - ');
      return [x.class_name, x.subject, time, x.full_marks || '', x.syllabus].join(' | ');
    })
    .join('\n');

const DEFAULTS: any = {
  v_x_start_time: '10:00',
  v_x_end_time: '15:00',
  xi_xii_start_time: '06:00',
  xi_xii_end_time: '13:00',
  coaching_start_time: '18:00',
  coaching_end_time: '21:15',
  weekly_start_time: '06:00',
  weekly_end_time: '13:00',
  result_start_time: '06:00',
  result_end_time: '13:00',
};

const initial = {
  mode: 'display',
  routine_group: 'all',
  class_end_time: '15:00',
  coaching_start_time: '18:00',
  coaching_end_time: '21:15',
  v_x_start_time: '10:00',
  v_x_end_time: '15:00',
  xi_xii_start_time: '06:00',
  xi_xii_end_time: '13:00',
  weekly_start_time: '06:00',
  weekly_end_time: '13:00',
  result_start_time: '06:00',
  result_end_time: '13:00',
  result_type: 'weekly',
  result_exam_id: null,
  weekly_result_batch_id: null,
  display_notices: [] as any[],
  weekly_exam_items: [] as WeeklyItem[],
};

export default function DisplayControl() {
  const router = useRouter();
  const [settings, setSettings] = useState<any>(initial);
  const settingsRef = useRef<any>(initial);
  const [terminalResults, setTerminalResults] = useState<any[]>([]);
  const [weeklyResults, setWeeklyResults] = useState<any[]>([]);
  const [weeklyText, setWeeklyText] = useState('');
  const [weeklyItems, setWeeklyItems] = useState<WeeklyItem[]>([
    { class_name: '', subject: '', time: '', from_time: '', to_time: '', full_marks: '', syllabus: '' },
  ]);
  const weeklyItemsRef = useRef<WeeklyItem[]>(weeklyItems);
  const [showBulkText, setShowBulkText] = useState(false);

  const addWeeklyRow = () => {
    const next: WeeklyItem[] = [
      ...weeklyItemsRef.current,
      { class_name: '', subject: '', time: '', from_time: '', to_time: '', full_marks: '', syllabus: '' },
    ];
    weeklyItemsRef.current = next;
    setWeeklyItems(next);
    setWeeklyText(toText(next));
  };

  const updateWeeklyRow = (index: number, key: keyof WeeklyItem, value: string) => {
    const next = weeklyItemsRef.current.map((row, i) =>
      i === index ? { ...row, [key]: value } : row
    );
    weeklyItemsRef.current = next;
    setWeeklyItems(next);
    setWeeklyText(toText(next));
  };

  const updateWeeklyTime = (index: number, field: 'from_time' | 'to_time', val: string) => {
    const next = weeklyItemsRef.current.map((row, i) => {
      if (i !== index) return row;
      const from_time = field === 'from_time' ? val : (row.from_time || '');
      const to_time = field === 'to_time' ? val : (row.to_time || '');
      const time = [from_time, to_time].filter(Boolean).join(' - ');
      return { ...row, [field]: val, time };
    });
    weeklyItemsRef.current = next;
    setWeeklyItems(next);
    setWeeklyText(toText(next));
  };

  const removeWeeklyRow = (index: number) => {
    let next = weeklyItemsRef.current.filter((_, i) => i !== index);
    if (next.length === 0) {
      next = [{ class_name: '', subject: '', time: '', from_time: '', to_time: '', full_marks: '', syllabus: '' }];
    }
    weeklyItemsRef.current = next;
    setWeeklyItems(next);
    setWeeklyText(toText(next));
  };

  const onBulkTextChange = (text: string) => {
    setWeeklyText(text);
    const parsed = fromText(text);
    const items =
      parsed.length > 0
        ? parsed
        : [{ class_name: '', subject: '', time: '', from_time: '', to_time: '', full_marks: '', syllabus: '' }];
    weeklyItemsRef.current = items;
    setWeeklyItems(items);
  };
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [resultSubTab, setResultSubTab] = useState<'weekly' | 'terminal'>('weekly');
  const [notice, setNotice] = useState({
    title: '',
    text: '',
    start: '06:00',
    end: '23:00',
    file: null as any,
  });

  const load = async () => {
    try {
      const control = await api('/api/display-board/control');
      const loaded = control.settings || initial;
      if (loaded.mode === 'auto') loaded.mode = 'display';
      loaded.routine_group = 'all';
      setSettings(loaded);
      settingsRef.current = loaded;
      const loadedItems: WeeklyItem[] =
        loaded.weekly_exam_items && loaded.weekly_exam_items.length > 0
          ? loaded.weekly_exam_items.map((it: any) => {
              const times = splitTime(it.time);
              return {
                class_name: String(it.class_name || ''),
                subject: String(it.subject || ''),
                time: String(it.time || ''),
                from_time: it.from_time || times.from_time,
                to_time: it.to_time || times.to_time,
                full_marks: String(it.full_marks || ''),
                syllabus: String(it.syllabus || ''),
              };
            })
          : [{ class_name: '', subject: '', time: '', from_time: '', to_time: '', full_marks: '', syllabus: '' }];
      setWeeklyItems(loadedItems);
      weeklyItemsRef.current = loadedItems;
      setWeeklyText(toText(loadedItems));
      setAuthError('');
      if (loaded.result_type === 'terminal') setResultSubTab('terminal');
      else setResultSubTab('weekly');

      const [terminal, weeklyData] = await Promise.allSettled([
        api('/api/terminal-exams/published'),
        api('/api/marks/weekly-tests'),
      ]);
      setTerminalResults(terminal.status === 'fulfilled' ? terminal.value.exams || [] : []);
      setWeeklyResults(
        weeklyData.status === 'fulfilled'
          ? (weeklyData.value.tests || []).filter((x: any) => x.locked && x.is_published)
          : []
      );
    } catch (e: any) {
      console.error('Display Control load error:', e);
      setAuthError(e.message || 'Admin login is required.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const put = async (next?: any) => {
    setBusy(true);
    const toSend = next || settingsRef.current;
    try {
      const validItems = weeklyItemsRef.current.filter(
        x =>
          (x.class_name && x.class_name.trim()) ||
          (x.subject && x.subject.trim()) ||
          (x.syllabus && x.syllabus.trim())
      );
      const saved = await api('/api/display-board/control', {
        method: 'PUT',
        body: JSON.stringify({
          ...toSend,
          mode: toSend.mode === 'display' ? 'display' : toSend.mode,
          routine_group: 'all',
          weekly_exam_items: validItems,
        }),
      });
      const updated = saved.settings;
      if (updated.mode === 'auto') updated.mode = 'display';
      updated.routine_group = 'all';
      setSettings(updated);
      settingsRef.current = updated;
      const updatedItems: WeeklyItem[] =
        updated.weekly_exam_items && updated.weekly_exam_items.length > 0
          ? updated.weekly_exam_items.map((it: any) => {
              const times = splitTime(it.time);
              return {
                class_name: String(it.class_name || ''),
                subject: String(it.subject || ''),
                time: String(it.time || ''),
                from_time: it.from_time || times.from_time,
                to_time: it.to_time || times.to_time,
                full_marks: String(it.full_marks || ''),
                syllabus: String(it.syllabus || ''),
              };
            })
          : [{ class_name: '', subject: '', time: '', from_time: '', to_time: '', full_marks: '', syllabus: '' }];
      setWeeklyItems(updatedItems);
      weeklyItemsRef.current = updatedItems;
      setWeeklyText(toText(updatedItems));
      return true;
    } catch (e: any) {
      Alert.alert('Display Board', e.message || 'Could not save.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const board = () => {
    if (Platform.OS === 'web') window.open('/display-board', '_blank');
    else router.push('/display-board' as any);
  };

  const changeMode = async (id: string) => {
    const next = { ...settingsRef.current, mode: id };
    settingsRef.current = next;
    setSettings(next);
    await put(next);
  };

  const toggleRoutine = async (start: string, end: string, label = 'Routine') => {
    const current = settingsRef.current;
    const isOff = current[start] === 'off' || current[end] === 'off';
    const next = {
      ...current,
      [start]: isOff ? DEFAULTS[start] || '06:00' : 'off',
      [end]: isOff ? DEFAULTS[end] || '13:00' : 'off',
    };
    settingsRef.current = next;
    setSettings(next);
    if (await put(next)) {
      Alert.alert(isOff ? `${label} On` : `${label} Off`, `${label} is now ${isOff ? 'on' : 'off'} on the projector.`);
    } else {
      await load();
    }
  };

  const chooseFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!r.canceled && r.assets && r.assets.length > 0) {
        setNotice(o => ({ ...o, file: r.assets[0] }));
      }
    } catch (e: any) {
      Alert.alert('File Picker', e.message || 'Could not select file.');
    }
  };

  const addNotice = async () => {
    if (!notice.title.trim()) {
      return Alert.alert('Notice title required', 'Enter a notice title.');
    }
    setBusy(true);
    try {
      let attachment_url: string | null = null;
      let file_type = 'image';
      if (notice.file) {
        const form = new FormData();
        const f = notice.file;
        const isPdf =
          f.mimeType === 'application/pdf' ||
          String(f.name || '').toLowerCase().endsWith('.pdf');
        file_type = isPdf ? 'pdf' : 'image';
        if (f.file) {
          form.append('image', f.file);
        } else {
          form.append('image', {
            uri: f.uri,
            name: f.name || (isPdf ? 'notice.pdf' : 'notice.jpg'),
            type: f.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg'),
          } as any);
        }
        const uploaded = await api('/api/notices/image', { method: 'POST', body: form });
        attachment_url = uploaded.url;
      }

      const next = {
        ...settingsRef.current,
        mode: 'notice',
        display_notices: [
          ...settingsRef.current.display_notices,
          {
            id: `display-${Date.now()}`,
            title: notice.title.trim(),
            notice_text: notice.text.trim(),
            attachment_url,
            file_type,
            start_time: notice.start || '06:00',
            end_time: notice.end || '23:00',
            active: true,
          },
        ],
      };
      settingsRef.current = next;
      setSettings(next);
      await put(next);
      setNotice({ title: '', text: '', start: '06:00', end: '23:00', file: null });
      Alert.alert('Notice Added', 'Notice has been uploaded and added to the projector.');
    } catch (e: any) {
      Alert.alert('Notice Upload Error', e.message || 'Could not save notice.');
    } finally {
      setBusy(false);
    }
  };

  const updateNotice = (id: string, key: string, value: any) => {
    const next = {
      ...settingsRef.current,
      display_notices: settingsRef.current.display_notices.map((n: any) =>
        n.id === id ? { ...n, [key]: value } : n
      ),
    };
    settingsRef.current = next;
    setSettings(next);
  };

  const toggleNotice = async (n: any) => {
    const next = {
      ...settingsRef.current,
      display_notices: settingsRef.current.display_notices.map((x: any) =>
        x.id === n.id ? { ...x, active: !x.active } : x
      ),
    };
    settingsRef.current = next;
    setSettings(next);
    if (!(await put(next))) await load();
  };

  const removeNotice = async (id: string) => {
    const next = {
      ...settingsRef.current,
      display_notices: settingsRef.current.display_notices.filter((n: any) => n.id !== id),
    };
    settingsRef.current = next;
    setSettings(next);
    if (await put(next)) setEditId(null);
  };

  const handleSave = async () => {
    const ok = await put();
    if (ok) Alert.alert('Saved', 'Display settings have been saved successfully.');
  };

  const isRoutineOn = (start: string, end: string) =>
    settings[start] !== 'off' && settings[end] !== 'off';

  // ---------------- Sub-views ----------------

  const renderDashboard = () => {
    const vxOn = isRoutineOn('v_x_start_time', 'v_x_end_time');
    const xiOn = isRoutineOn('xi_xii_start_time', 'xi_xii_end_time');
    const coachOn = isRoutineOn('coaching_start_time', 'coaching_end_time');
    const weeklyOn = isRoutineOn('weekly_start_time', 'weekly_end_time');
    const resultOn = isRoutineOn('result_start_time', 'result_end_time');
    const activeNotices = (settings.display_notices || []).filter((n: any) => n.active);

    const activeList = [
      vxOn && 'Class V–X Routine',
      xiOn && 'Class XI–XII Routine',
      coachOn && 'Coaching Routine',
      activeNotices.length > 0 && `${activeNotices.length} Notice(s)`,
      weeklyOn && 'Weekly Test',
      resultOn && 'Result',
    ].filter(Boolean);

    return (
      <View style={s.dashboardContainer}>
        <View style={s.statusBanner}>
          <Text style={s.bannerTitle}>Display Status Overview (প্রজেক্টর স্ট্যাটাস)</Text>
          <Text style={s.bannerSub}>
            বর্তমানে যা চালু আছে: {activeList.length ? activeList.join(' • ') : 'সব বন্ধ আছে (All Off)'}
          </Text>
        </View>

        {/* Routine Overview Card */}
        <View style={s.dashCard}>
          <View style={s.dashCardHeader}>
            <Text style={s.dashCardTitle}>1. Routine Status (রুটিন)</Text>
            <TouchableOpacity onPress={() => changeMode('routine')} style={s.dashActionBtn}>
              <Text style={s.dashActionBtnText}>Edit Routine →</Text>
            </TouchableOpacity>
          </View>
          <View style={s.dashRow}>
            <Text style={s.dashItemLabel}>Class V–X Routine:</Text>
            <View style={s.dashStatusGroup}>
              <Text style={s.dashTimeText}>{vxOn ? `${settings.v_x_start_time} - ${settings.v_x_end_time}` : 'Disabled'}</Text>
              <View style={[s.badge, vxOn ? s.badgeOn : s.badgeOff]}>
                <Text style={s.badgeText}>{vxOn ? 'ON' : 'OFF'}</Text>
              </View>
            </View>
          </View>
          <View style={s.dashRow}>
            <Text style={s.dashItemLabel}>Class XI–XII Routine:</Text>
            <View style={s.dashStatusGroup}>
              <Text style={s.dashTimeText}>{xiOn ? `${settings.xi_xii_start_time} - ${settings.xi_xii_end_time}` : 'Disabled'}</Text>
              <View style={[s.badge, xiOn ? s.badgeOn : s.badgeOff]}>
                <Text style={s.badgeText}>{xiOn ? 'ON' : 'OFF'}</Text>
              </View>
            </View>
          </View>
          <View style={s.dashRow}>
            <Text style={s.dashItemLabel}>Coaching Routine:</Text>
            <View style={s.dashStatusGroup}>
              <Text style={s.dashTimeText}>{coachOn ? `${settings.coaching_start_time} - ${settings.coaching_end_time}` : 'Disabled'}</Text>
              <View style={[s.badge, coachOn ? s.badgeOn : s.badgeOff]}>
                <Text style={s.badgeText}>{coachOn ? 'ON' : 'OFF'}</Text>
              </View>
            </View>
          </View>
          <Text style={s.help}>
            রোটেশন মোড:{' '}
            {settings.routine_group === 'all'
              ? 'সব সক্রিয় রুটিন প্রতি ৫ সেকেন্ড পর পর ঘুরবে'
              : `শুধুমাত্র ${settings.routine_group}`}
          </Text>
        </View>

        {/* Notice Overview Card */}
        <View style={s.dashCard}>
          <View style={s.dashCardHeader}>
            <Text style={s.dashCardTitle}>
              2. Notice Status ({activeNotices.length} active notices)
            </Text>
            <TouchableOpacity onPress={() => changeMode('notice')} style={s.dashActionBtn}>
              <Text style={s.dashActionBtnText}>Manage Notices →</Text>
            </TouchableOpacity>
          </View>
          {activeNotices.length ? (
            activeNotices.map((n: any, idx: number) => {
              const isPdf =
                n.file_type === 'pdf' ||
                String(n.attachment_url || '').toLowerCase().endsWith('.pdf');
              return (
                <View key={n.id || idx} style={s.dashNoticeRow}>
                  <Text style={s.dashNoticeTitle}>• {n.title || 'Untitled Notice'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {n.attachment_url ? (
                      <View style={[s.fileTypeBadge, isPdf ? s.pdfBadge : s.jpgBadge]}>
                        <Text style={s.fileTypeBadgeText}>{isPdf ? 'PDF' : 'JPG'}</Text>
                      </View>
                    ) : null}
                    <Text style={s.dashTimeText}>{n.start_time} - {n.end_time}</Text>
                    <View style={[s.badge, s.badgeOn]}>
                      <Text style={s.badgeText}>ON</Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={s.emptyNoticeText}>কোনো active notice চালু নেই।</Text>
          )}
        </View>

        {/* Weekly Test Overview Card */}
        <View style={s.dashCard}>
          <View style={s.dashCardHeader}>
            <Text style={s.dashCardTitle}>3. Weekly Test Schedule</Text>
            <TouchableOpacity onPress={() => changeMode('weekly_exam')} style={s.dashActionBtn}>
              <Text style={s.dashActionBtnText}>Edit Weekly Test →</Text>
            </TouchableOpacity>
          </View>
          <View style={s.dashRow}>
            <Text style={s.dashItemLabel}>Display Status:</Text>
            <View style={s.dashStatusGroup}>
              <Text style={s.dashTimeText}>{weeklyOn ? `${settings.weekly_start_time} - ${settings.weekly_end_time}` : 'Disabled'}</Text>
              <View style={[s.badge, weeklyOn ? s.badgeOn : s.badgeOff]}>
                <Text style={s.badgeText}>{weeklyOn ? 'ON' : 'OFF'}</Text>
              </View>
            </View>
          </View>
          <Text style={s.help}>
            Schedule Items:{' '}
            {(settings.weekly_exam_items || []).length
              ? `${settings.weekly_exam_items.length} items configured`
              : 'None'}
          </Text>
        </View>

        {/* Result Overview Card */}
        <View style={s.dashCard}>
          <View style={s.dashCardHeader}>
            <Text style={s.dashCardTitle}>4. Result Display</Text>
            <TouchableOpacity onPress={() => changeMode('result')} style={s.dashActionBtn}>
              <Text style={s.dashActionBtnText}>Configure Result →</Text>
            </TouchableOpacity>
          </View>
          <View style={s.dashRow}>
            <Text style={s.dashItemLabel}>Display Status:</Text>
            <View style={s.dashStatusGroup}>
              <Text style={s.dashTimeText}>{resultOn ? `${settings.result_start_time} - ${settings.result_end_time}` : 'Disabled'}</Text>
              <View style={[s.badge, resultOn ? s.badgeOn : s.badgeOff]}>
                <Text style={s.badgeText}>{resultOn ? 'ON' : 'OFF'}</Text>
              </View>
            </View>
          </View>
          <Text style={s.help}>
            Result Type: {settings.result_type === 'weekly' ? 'Weekly Test Result' : 'Terminal Exam Result'}
            {settings.result_type === 'weekly' && settings.weekly_result_batch_id
              ? ` (Batch ID: ${settings.weekly_result_batch_id})`
              : ''}
            {settings.result_type !== 'weekly' && settings.result_exam_id
              ? ` (Exam ID: ${settings.result_exam_id})`
              : ''}
          </Text>
        </View>
      </View>
    );
  };

  const renderRoutine = () => (
    <>
      <Text style={s.label}>Routine group and display timing</Text>
      <View style={s.modeRow}>
        <View style={[s.mode, s.active]}>
          <Text style={[s.modeText, s.activeText]}>✓ All groups (rotate)</Text>
        </View>
      </View>
      <Text style={s.help}>
        নিচে যেসব রুটিন On করা থাকবে, সেগুলো প্রজেক্টরে পর্যায়ক্রমে ৫ সেকেন্ড অন্তর অন্তর রোটেট করবে।
      </Text>

      {[
        ['Class V–X', 'v_x_start_time', 'v_x_end_time'],
        ['Class XI–XII', 'xi_xii_start_time', 'xi_xii_end_time'],
        ['Coaching', 'coaching_start_time', 'coaching_end_time'],
      ].map(([label, start, end]) => {
        const isOff = settings[start] === 'off' || settings[end] === 'off';
        return (
          <View key={label} style={s.card}>
            <View style={s.head}>
              <Text style={s.strong}>{label}</Text>
              <TouchableOpacity
                disabled={busy}
                onPress={() => void toggleRoutine(start, end, label)}
                style={isOff ? s.off : s.on}
              >
                <Text style={s.white}>{isOff ? 'Off' : 'On'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.timeRow}>
              <TextInput
                value={settings[start] || ''}
                onChangeText={v => {
                  const next = { ...settingsRef.current, [start]: v };
                  settingsRef.current = next;
                  setSettings(next);
                }}
                style={[s.input, s.time]}
                placeholder="06:00"
              />
              <TextInput
                value={settings[end] || ''}
                onChangeText={v => {
                  const next = { ...settingsRef.current, [end]: v };
                  settingsRef.current = next;
                  setSettings(next);
                }}
                style={[s.input, s.time]}
                placeholder="13:00"
              />
            </View>
            <Text style={s.help}>সময় ফরম্যাট: শুরু | শেষ (HH:MM)</Text>
          </View>
        );
      })}
    </>
  );

  const renderNotice = () => (
    <>
      <Text style={s.label}>Projector-only notices ({settings.display_notices.length})</Text>
      <Text style={s.help}>Off করলে notice মুছবে না, শুধু projector-এ দেখা বন্ধ হবে।</Text>

      {settings.display_notices.map((n: any) => {
        const editing = editId === n.id;
        const isPdf =
          n.file_type === 'pdf' ||
          String(n.attachment_url || '').toLowerCase().endsWith('.pdf');
        return (
          <View key={n.id} style={[s.noticeCard, !n.active && s.dim]}>
            <View style={{ flex: 1 }}>
              {editing ? (
                <>
                  <TextInput
                    value={n.title || ''}
                    onChangeText={v => updateNotice(n.id, 'title', v)}
                    style={s.editTitle}
                    placeholder="Notice title"
                  />
                  <TextInput
                    value={n.notice_text || ''}
                    onChangeText={v => updateNotice(n.id, 'notice_text', v)}
                    multiline
                    style={[s.input, s.details]}
                    placeholder="Notice details"
                  />
                </>
              ) : (
                <>
                  <Text style={s.strong}>{n.title}</Text>
                  {n.notice_text ? <Text style={s.help}>{n.notice_text}</Text> : null}
                  {n.attachment_url ? (
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web') window.open(imageUrl(n.attachment_url), '_blank');
                      }}
                      style={s.attachmentBadgeRow}
                    >
                      <View style={[s.fileTypeBadge, isPdf ? s.pdfBadge : s.jpgBadge]}>
                        <Text style={s.fileTypeBadgeText}>{isPdf ? 'PDF' : 'JPG'}</Text>
                      </View>
                      <Text style={s.attachmentLinkText}>
                        {isPdf ? 'PDF Document attached (Click to preview)' : 'JPG Image attached'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
              <View style={s.timeRow}>
                <TextInput
                  value={n.start_time || ''}
                  onChangeText={v => updateNotice(n.id, 'start_time', v)}
                  style={[s.input, s.time]}
                  placeholder="06:00"
                />
                <TextInput
                  value={n.end_time || ''}
                  onChangeText={v => updateNotice(n.id, 'end_time', v)}
                  style={[s.input, s.time]}
                  placeholder="23:00"
                />
              </View>
              <Text style={s.help}>সময়: শুরু | শেষ (HH:MM)</Text>
            </View>
            <View style={s.actions}>
              <TouchableOpacity
                disabled={busy}
                onPress={() =>
                  editing ? void put().then(ok => ok && setEditId(null)) : setEditId(n.id)
                }
                style={s.edit}
              >
                <Text style={s.editText}>{editing ? 'Save' : 'Edit'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy}
                onPress={() => void toggleNotice(n)}
                style={n.active ? s.on : s.off}
              >
                <Text style={s.white}>{n.active ? 'On' : 'Off'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy}
                onPress={() => void removeNotice(n.id)}
                style={s.remove}
              >
                <Text style={s.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <Text style={s.label}>Add projector notice (JPG বা PDF আপলোড করুন)</Text>
      <TextInput
        value={notice.title}
        onChangeText={v => setNotice(o => ({ ...o, title: v }))}
        style={s.input}
        placeholder="Notice title (যেমন: আগামীকালের ছুটির বিজ্ঞপ্তি)"
      />
      <TextInput
        value={notice.text}
        onChangeText={v => setNotice(o => ({ ...o, text: v }))}
        multiline
        style={[s.input, s.details]}
        placeholder="Notice details (optional)"
      />
      <View style={s.timeRow}>
        <TextInput
          value={notice.start}
          onChangeText={v => setNotice(o => ({ ...o, start: v }))}
          style={[s.input, s.time]}
          placeholder="06:00"
        />
        <TextInput
          value={notice.end}
          onChangeText={v => setNotice(o => ({ ...o, end: v }))}
          style={[s.input, s.time]}
          placeholder="23:00"
        />
      </View>

      <TouchableOpacity onPress={() => void chooseFile()} style={s.filePickerBtn}>
        <Text style={s.filePickerBtnText}>
          {notice.file
            ? `File selected: ${notice.file.name} (${String(notice.file.name || '').toLowerCase().endsWith('.pdf') ? 'PDF' : 'Image'})`
            : '📎 Attach JPG or PDF Notice File'}
        </Text>
      </TouchableOpacity>
      {notice.file && (
        <TouchableOpacity
          onPress={() => setNotice(o => ({ ...o, file: null }))}
          style={s.removeFileBtn}
        >
          <Text style={s.removeFileBtnText}>Clear Selected File</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity disabled={busy} onPress={() => void addNotice()} style={s.blue}>
        <Text style={s.white}>Upload & Show Now</Text>
      </TouchableOpacity>
    </>
  );

  const renderWeeklyExam = () => {
    const isOff = settings.weekly_start_time === 'off' || settings.weekly_end_time === 'off';
    const previewItems = weeklyItems.filter(
      x => x.class_name?.trim() || x.subject?.trim() || x.syllabus?.trim()
    );

    return (
      <>
        <View style={s.head}>
          <Text style={s.label}>Weekly Test display timing</Text>
          <TouchableOpacity
            disabled={busy}
            onPress={() => void toggleRoutine('weekly_start_time', 'weekly_end_time', 'Weekly Test')}
            style={isOff ? s.off : s.on}
          >
            <Text style={s.white}>{isOff ? 'Off' : 'On'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.timeRow}>
          <TextInput
            value={settings.weekly_start_time || ''}
            onChangeText={v => {
              const next = { ...settingsRef.current, weekly_start_time: v };
              settingsRef.current = next;
              setSettings(next);
            }}
            style={[s.input, s.time]}
            placeholder="06:00"
          />
          <TextInput
            value={settings.weekly_end_time || ''}
            onChangeText={v => {
              const next = { ...settingsRef.current, weekly_end_time: v };
              settingsRef.current = next;
              setSettings(next);
            }}
            style={[s.input, s.time]}
            placeholder="13:00"
          />
        </View>

        <Text style={s.label}>Weekly Test Schedule Editor (টেবিল ফরম্যাট)</Text>
        <Text style={s.help}>
          প্রতিটি বিষয়ের ক্লাস (ড্রপডাউন), বিষয় (ড্রপডাউন), সময় (হতে - পর্যন্ত), পূর্ণমান ও সিলেবাস নিচের টেবিলে লিখুন।
        </Text>

        {/* Table Editor matching user screenshot */}
        <View style={s.tableCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 6 }}>
            <View style={s.tableRowsContainer}>
              {weeklyItems.map((row, index) => {
                const currentClass = row.class_name || '';
                const classList = currentClass && !CLASS_OPTIONS.includes(currentClass)
                  ? [currentClass, ...CLASS_OPTIONS]
                  : CLASS_OPTIONS;

                const currentSub = row.subject || '';
                const subList = currentSub && !SUBJECT_OPTIONS.includes(currentSub)
                  ? [currentSub, ...SUBJECT_OPTIONS]
                  : SUBJECT_OPTIONS;

                return (
                  <View key={index} style={s.tableRowLine}>
                    {/* 1. Class Dropdown */}
                    <View style={s.cellClass}>
                      <Text style={s.tableRowLabel}>Class:</Text>
                      {Platform.OS === 'web' ? (
                        <select
                          value={row.class_name}
                          onChange={(e: any) => updateWeeklyRow(index, 'class_name', e.target.value)}
                          style={{
                            width: 105,
                            height: 36,
                            border: '1px solid #ced4da',
                            borderRadius: 4,
                            padding: '6px 8px',
                            fontSize: 14,
                            backgroundColor: '#fff',
                            outline: 'none',
                            color: '#212529',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">Select Class</option>
                          {classList.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <TextInput
                          value={row.class_name}
                          onChangeText={val => updateWeeklyRow(index, 'class_name', val)}
                          placeholder="Class"
                          style={s.cellInputClass}
                        />
                      )}
                    </View>

                    {/* 2. Subject Dropdown */}
                    <View style={s.cellSubject}>
                      <Text style={s.tableRowLabel}>Subject:</Text>
                      {Platform.OS === 'web' ? (
                        <select
                          value={row.subject}
                          onChange={(e: any) => updateWeeklyRow(index, 'subject', e.target.value)}
                          style={{
                            width: 155,
                            height: 36,
                            border: '1px solid #ced4da',
                            borderRadius: 4,
                            padding: '6px 8px',
                            fontSize: 14,
                            backgroundColor: '#fff',
                            outline: 'none',
                            color: '#212529',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">Select Subject</option>
                          {subList.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                      ) : (
                        <TextInput
                          value={row.subject}
                          onChangeText={val => updateWeeklyRow(index, 'subject', val)}
                          placeholder="Subject"
                          style={s.cellInputSubject}
                        />
                      )}
                    </View>

                    {/* 3. Time: From - To */}
                    <View style={s.cellTime}>
                      <Text style={s.tableRowLabel}>Time:</Text>
                      <TextInput
                        value={row.from_time || ''}
                        onChangeText={val => updateWeeklyTime(index, 'from_time', val)}
                        placeholder="10:00"
                        style={s.cellInputTimeSmall}
                      />
                      <Text style={s.toLabel}>to</Text>
                      <TextInput
                        value={row.to_time || ''}
                        onChangeText={val => updateWeeklyTime(index, 'to_time', val)}
                        placeholder="11:30"
                        style={s.cellInputTimeSmall}
                      />
                    </View>

                    {/* 4. Full Marks (FM) */}
                    <View style={s.cellMarks}>
                      <Text style={s.tableRowLabel}>FM:</Text>
                      <TextInput
                        value={row.full_marks || ''}
                        onChangeText={val => updateWeeklyRow(index, 'full_marks', val)}
                        placeholder="50"
                        keyboardType="numeric"
                        style={s.cellInputMarks}
                      />
                    </View>

                    {/* 5. Syllabus */}
                    <View style={s.cellSyllabus}>
                      <Text style={s.tableRowLabel}>Syllabus:</Text>
                      <TextInput
                        value={row.syllabus || ''}
                        onChangeText={val => updateWeeklyRow(index, 'syllabus', val)}
                        placeholder="Enter Syllabus / Chapters"
                        style={s.cellInputSyllabus}
                      />
                    </View>

                    {/* 6. Action (+Add / Remove) */}
                    <View style={s.cellActions}>
                      {index === 0 ? (
                        <TouchableOpacity onPress={addWeeklyRow} style={s.actionBtnText}>
                          <Text style={s.tableAddText}>+ Add</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => removeWeeklyRow(index)} style={s.actionBtnText}>
                          <Text style={s.tableRemoveText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Table Bottom Action Bar */}
          <View style={s.tableBottomBar}>
            <TouchableOpacity onPress={addWeeklyRow} style={s.addMoreBtn}>
              <Text style={s.addMoreBtnText}>+ Add More Row</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowBulkText(prev => !prev)} style={s.toggleBulkBtn}>
              <Text style={s.toggleBulkBtnText}>
                {showBulkText ? 'Hide Bulk Text Editor' : 'Bulk Text Paste Editor'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Optional Bulk Text Mode */}
        {showBulkText && (
          <View style={{ marginTop: 12 }}>
            <Text style={s.help}>
              প্রতি লাইনে লিখুন ফরম্যাট:{' '}
              <Text style={{ fontWeight: 'bold' }}>Class | Subject | Time | Full Marks | Syllabus</Text>
            </Text>
            <TextInput
              value={weeklyText}
              onChangeText={onBulkTextChange}
              multiline
              style={[s.input, s.details, { minHeight: 120, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }]}
              placeholder="V | Bengali | 10:00-11:00 | 25 | Chapter 1 to 3&#10;X | Mathematics | 11:30-01:00 | 50 | Geometry & Algebra"
            />
          </View>
        )}

        {/* Structured Preview */}
        <Text style={[s.label, { marginTop: 16 }]}>Scheduled Items Preview ({previewItems.length})</Text>
        <View style={s.weeklyPreviewContainer}>
          {previewItems.length ? (
            previewItems.map((item, idx) => (
              <View key={idx} style={s.weeklyPreviewCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.weeklyClassBadge}>CLASS {item.class_name || '-'}</Text>
                  {item.full_marks ? (
                    <View style={s.fullMarksBadge}>
                      <Text style={s.fullMarksText}>Full Marks: {item.full_marks}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.weeklySubjectText}>{item.subject || '-'}</Text>
                <Text style={s.weeklyTimeText}>Time: {item.time || '-'}</Text>
                {item.syllabus ? (
                  <Text style={s.weeklySyllabusText}>Syllabus: {item.syllabus}</Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={s.help}>কোনো শিডিউল আইটেম যোগ করা হয়নি। উপরের টেবিলে তথ্য লিখুন।</Text>
          )}
        </View>
      </>
    );
  };

  const renderResult = () => {
    const isOff = settings.result_start_time === 'off' || settings.result_end_time === 'off';
    return (
      <>
        <View style={s.head}>
          <Text style={s.label}>Result display timing</Text>
          <TouchableOpacity
            disabled={busy}
            onPress={() => void toggleRoutine('result_start_time', 'result_end_time', 'Result')}
            style={isOff ? s.off : s.on}
          >
            <Text style={s.white}>{isOff ? 'Off' : 'On'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.timeRow}>
          <TextInput
            value={settings.result_start_time || ''}
            onChangeText={v => {
              const next = { ...settingsRef.current, result_start_time: v };
              settingsRef.current = next;
              setSettings(next);
            }}
            style={[s.input, s.time]}
            placeholder="06:00"
          />
          <TextInput
            value={settings.result_end_time || ''}
            onChangeText={v => {
              const next = { ...settingsRef.current, result_end_time: v };
              settingsRef.current = next;
              setSettings(next);
            }}
            style={[s.input, s.time]}
            placeholder="13:00"
          />
        </View>

        <Text style={s.label}>Select Result Type (রেজাল্ট ধরণ নির্বাচন করুন)</Text>
        <View style={s.modeRow}>
          <TouchableOpacity
            onPress={() => {
              setResultSubTab('weekly');
              const next = { ...settingsRef.current, result_type: 'weekly' };
              settingsRef.current = next;
              setSettings(next);
            }}
            style={[s.mode, resultSubTab === 'weekly' && s.active]}
          >
            <Text style={[s.modeText, resultSubTab === 'weekly' && s.activeText]}>Weekly Test Results</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setResultSubTab('terminal');
              const next = { ...settingsRef.current, result_type: 'terminal' };
              settingsRef.current = next;
              setSettings(next);
            }}
            style={[s.mode, resultSubTab === 'terminal' && s.active]}
          >
            <Text style={[s.modeText, resultSubTab === 'terminal' && s.activeText]}>Terminal Exam Results</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.examScroller} nestedScrollEnabled>
          {resultSubTab === 'weekly' ? (
            weeklyResults.length ? (
              weeklyResults.map(test => {
                const isSelected =
                  Number(settings.weekly_result_batch_id) === Number(test.id);
                return (
                  <TouchableOpacity
                    key={test.id}
                    onPress={() => {
                      const next = {
                        ...settingsRef.current,
                        result_type: 'weekly',
                        weekly_result_batch_id: isSelected ? null : test.id,
                        result_exam_id: null,
                      };
                      settingsRef.current = next;
                      setSettings(next);
                    }}
                    style={[s.card, isSelected && s.selected]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={s.strong}>
                        {test.exam_name} — Class {test.class_name}
                      </Text>
                      {isSelected ? (
                        <View style={s.selectedBadge}>
                          <Text style={s.selectedBadgeText}>✓ SELECTED FOR PROJECTOR</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={s.help}>
                      Subject: {test.subject_name} | Date: {String(test.exam_date || '').slice(0, 10)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={s.emptyNoticeText}>কোনো published weekly test result পাওয়া যায়নি।</Text>
            )
          ) : terminalResults.length ? (
            terminalResults.map(exam => {
              const isSelected =
                Number(settings.result_exam_id) === Number(exam.id);
              return (
                <TouchableOpacity
                  key={exam.id}
                  onPress={() => {
                    const next = {
                      ...settingsRef.current,
                      result_type: 'terminal',
                      result_exam_id: isSelected ? null : exam.id,
                      weekly_result_batch_id: null,
                    };
                    settingsRef.current = next;
                    setSettings(next);
                  }}
                  style={[s.card, isSelected && s.selected]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.strong}>
                      {exam.exam_name} — Class {exam.class_name}
                    </Text>
                    {isSelected ? (
                      <View style={s.selectedBadge}>
                        <Text style={s.selectedBadgeText}>✓ SELECTED FOR PROJECTOR</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.help}>Session: {exam.session_name || 'Current'}</Text>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={s.emptyNoticeText}>কোনো published terminal exam result পাওয়া যায়নি।</Text>
          )}
        </ScrollView>
      </>
    );
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <AcademyHeader />
      <View style={s.top}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={{ fontWeight: '700' }}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={board} style={s.blue}>
          <Text style={s.white}>Open Projector Display 🖥️</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.title}>Projector Display Control</Text>

      <Text style={s.label}>Display Mode / Navigation</Text>
      <View style={s.modeRow}>
        {MODES.map(([id, label]) => (
          <TouchableOpacity
            key={id}
            onPress={() => void changeMode(id)}
            style={[s.mode, settings.mode === id && s.active]}
          >
            <Text style={[s.modeText, settings.mode === id && s.activeText]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {Boolean(authError) && (
        <View style={s.authWarningCard}>
          <Text style={s.authWarningTitle}>⚠️ Admin Access Required</Text>
          <Text style={s.authWarningText}>{authError}</Text>
          <TouchableOpacity onPress={() => router.push('/' as any)} style={s.authLoginBtn}>
            <Text style={s.authLoginBtnText}>Go to Login Page →</Text>
          </TouchableOpacity>
        </View>
      )}

      {settings.mode === 'display' && renderDashboard()}
      {settings.mode === 'routine' && renderRoutine()}
      {settings.mode === 'notice' && renderNotice()}
      {settings.mode === 'weekly_exam' && renderWeeklyExam()}
      {settings.mode === 'result' && renderResult()}

      {settings.mode !== 'notice' && settings.mode !== 'display' && (
        <TouchableOpacity disabled={busy} onPress={() => void handleSave()} style={s.save}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.white}>Save Display Settings</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef4f9' },
  content: { padding: 16, width: '100%', maxWidth: 1000, alignSelf: 'center', paddingBottom: 60 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  back: { backgroundColor: '#e0eaf3', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6 },
  blue: { backgroundColor: '#174f75', paddingVertical: 11, paddingHorizontal: 18, borderRadius: 7, alignItems: 'center' },
  white: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '900', color: '#173f77', marginTop: 18 },
  label: { color: '#173f77', fontSize: 16, fontWeight: '900', marginTop: 20, marginBottom: 8 },
  help: { color: '#5b7085', marginTop: 4, fontSize: 13 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  mode: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 7, borderWidth: 1, borderColor: '#9cb4cb', backgroundColor: '#fff' },
  active: { backgroundColor: '#174f75', borderColor: '#174f75' },
  modeText: { color: '#173f77', fontWeight: '800' },
  activeText: { color: '#fff' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#aabed0', borderRadius: 7, padding: 12, fontSize: 15, marginTop: 8 },
  timeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  time: { flex: 1 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#b8c9d8', marginTop: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  strong: { fontWeight: '900', color: '#173f77', fontSize: 16 },
  noticeCard: { flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#b8c9d8', borderRadius: 7, padding: 12, marginTop: 10 },
  dim: { opacity: 0.55 },
  actions: { gap: 8, justifyContent: 'center' },
  edit: { backgroundColor: '#dbeafe', borderRadius: 5, paddingVertical: 8, paddingHorizontal: 12 },
  editText: { color: '#174f75', fontWeight: '900', textAlign: 'center' },
  off: { backgroundColor: '#b91c1c', borderRadius: 5, paddingVertical: 8, paddingHorizontal: 14 },
  on: { backgroundColor: '#167447', borderRadius: 5, paddingVertical: 8, paddingHorizontal: 14 },
  remove: { backgroundColor: '#fee2e2', borderRadius: 5, paddingVertical: 8, paddingHorizontal: 12 },
  removeText: { color: '#b91c1c', fontWeight: '900' },
  editTitle: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#aabed0', padding: 7, fontWeight: '800', fontSize: 16 },
  details: { minHeight: 90, textAlignVertical: 'top' },
  selected: { backgroundColor: '#e2f0fc', borderColor: '#1768c5', borderWidth: 2 },
  save: { backgroundColor: '#167447', borderRadius: 7, padding: 14, marginTop: 24, alignItems: 'center' },
  examScroller: { maxHeight: 420, marginTop: 10 },

  // Dashboard styles
  dashboardContainer: { marginTop: 14, gap: 14 },
  statusBanner: { backgroundColor: '#174f75', padding: 16, borderRadius: 8 },
  bannerTitle: { color: '#f9d56d', fontWeight: '900', fontSize: 18 },
  bannerSub: { color: '#fff', marginTop: 4, fontSize: 14, fontWeight: '700' },
  dashCard: { backgroundColor: '#fff', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#b8c9d8' },
  dashCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderColor: '#eef2f6', paddingBottom: 8 },
  dashCardTitle: { fontSize: 17, fontWeight: '900', color: '#173f77' },
  dashActionBtn: { backgroundColor: '#e0eaf3', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 5 },
  dashActionBtnText: { color: '#174f75', fontWeight: '800', fontSize: 13 },
  dashRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f4f7fa' },
  dashItemLabel: { color: '#243b53', fontSize: 15, fontWeight: '700' },
  dashStatusGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dashTimeText: { color: '#5b7085', fontSize: 13, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  badgeOn: { backgroundColor: '#167447' },
  badgeOff: { backgroundColor: '#b91c1c' },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  dashNoticeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f0f4f8' },
  dashNoticeTitle: { color: '#173f77', fontWeight: '700', fontSize: 14, flex: 1 },
  emptyNoticeText: { color: '#71869e', fontStyle: 'italic', paddingVertical: 8 },

  // File badges & upload buttons
  fileTypeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  pdfBadge: { backgroundColor: '#dc2626' },
  jpgBadge: { backgroundColor: '#2563eb' },
  fileTypeBadgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  attachmentBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  attachmentLinkText: { color: '#174f75', fontWeight: '700', fontSize: 13 },
  filePickerBtn: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#174f75', borderStyle: 'dashed', borderRadius: 7, padding: 14, marginTop: 10, alignItems: 'center' },
  filePickerBtnText: { color: '#174f75', fontWeight: '800', fontSize: 15 },
  removeFileBtn: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 4 },
  removeFileBtnText: { color: '#b91c1c', fontSize: 13, fontWeight: '700' },

  // Weekly Preview styles
  weeklyPreviewContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  weeklyPreviewCard: { backgroundColor: '#fff', padding: 12, borderRadius: 7, borderWidth: 1, borderColor: '#b8c9d8', minWidth: 260, flex: 1 },
  weeklyClassBadge: { color: '#174f75', fontWeight: '900', fontSize: 15 },
  fullMarksBadge: { backgroundColor: '#174f75', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  fullMarksText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  weeklySubjectText: { color: '#102a45', fontWeight: '800', fontSize: 16, marginTop: 4 },
  weeklyTimeText: { color: '#b45309', fontWeight: '700', fontSize: 13, marginTop: 2 },
  weeklySyllabusText: { color: '#5b7085', fontSize: 13, marginTop: 4 },

  // Selected badge in result
  selectedBadge: { backgroundColor: '#167447', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  selectedBadgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },

  // Table form styles matching office.tsx and user screenshot
  tableCard: {
    backgroundColor: '#fcd3c7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5b5a6',
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  tableRowScroller: {
    width: '100%',
  },
  tableRowsContainer: {
    gap: 10,
    minWidth: 1050,
    paddingVertical: 4,
  },
  tableRowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tableRowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#212529',
  },
  cellClass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 155,
  },
  cellInputClass: {
    width: 95,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#212529',
  },
  cellSubject: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 220,
  },
  cellInputSubject: {
    width: 155,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#212529',
  },
  cellTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 245,
  },
  cellInputTimeSmall: {
    width: 80,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 13,
    color: '#212529',
  },
  toLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#495057',
  },
  cellMarks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 105,
  },
  cellInputMarks: {
    width: 65,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 14,
    color: '#212529',
  },
  cellSyllabus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 240,
  },
  cellInputSyllabus: {
    flex: 1,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#212529',
  },
  cellActions: {
    width: 70,
    alignItems: 'flex-start',
  },
  actionBtnText: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableAddText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0d6efd',
  },
  tableRemoveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0d6efd',
  },
  tableBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#f5b5a6',
    paddingTop: 10,
    marginTop: 4,
  },
  addMoreBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0d6efd',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  addMoreBtnText: {
    color: '#0d6efd',
    fontWeight: '800',
    fontSize: 13,
  },
  toggleBulkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  toggleBulkBtnText: {
    color: '#6c757d',
    fontSize: 13,
    textDecorationLine: 'underline',
  },

  // Auth warning card
  authWarningCard: { backgroundColor: '#fee2e2', borderColor: '#ef4444', borderWidth: 1, padding: 14, borderRadius: 8, marginTop: 12 },
  authWarningTitle: { color: '#991b1b', fontWeight: '900', fontSize: 16 },
  authWarningText: { color: '#b91c1c', fontSize: 14, marginTop: 4, fontWeight: '600' },
  authLoginBtn: { alignSelf: 'flex-start', backgroundColor: '#dc2626', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, marginTop: 8 },
  authLoginBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
