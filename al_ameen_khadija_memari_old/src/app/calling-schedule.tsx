import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  ScrollView,
  Text,
  View,
  Alert,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
  Pressable,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import ScrollNavigationButtons from '../components/ScrollNavigationButtons';
import DatePickerField from '../components/DatePickerField';
import { api, getApiBase } from '../lib/api';
import { getToken, getUser } from '../lib/auth';
import { STUDENT_CLASSES } from '../lib/studentClasses';

interface Schedule {
  id: number;
  branch_name: string;
  session_name: string;
  class_name: string;
  section: string;
  gender: string;
  allowed_talk_time: number;
  days: string[];
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface StudentScheduled {
  student_id: number;
  registration_no: string;
  student_name: string;
  class_name: string;
  gender: string;
  father_mobile: string | null;
  mother_mobile: string | null;
  guardian_1_mobile: string | null;
  guardian_1_relation: string | null;
  guardian_2_mobile: string | null;
  guardian_2_relation: string | null;
  guardian_3_mobile: string | null;
  guardian_3_relation: string | null;
  is_emergency_call: boolean;
  is_scheduled: boolean;
}

interface CallLog {
  id: number;
  call_sid: string;
  reg_no: string;
  student_name?: string;
  from_number: string;
  to_number: string;
  called_relation: string;
  status: string;
  duration: number;
  allowed_talk_time: number;
  recording_url: string | null;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RELATIONS_LIST = [
  'Sister',
  'Brother',
  'Grandfather',
  'Grandmother',
  'Nana',
  'Nani',
  'Dadu',
  'Dadi',
  'Mama',
  'Mami',
  'Fupi',
  'Fupa',
  'Khala',
  'Khalu',
  'Chacha',
  'Chachi',
  'Dada',
  'Bhabi',
  'Kaka',
  'Kaki',
  'Jethu',
  'Jethi',
  'Thakurda',
  'Thakurma',
  'Aunt',
  'Uncle',
  'Dulavai',
  'Cousin',
  'Gurdian'
];

export default function CallingScheduleScreen() {
  const scrollRef = useRef<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedules' | 'details' | 'logs' | 'dialer'>('schedules');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [incomingEnabled, setIncomingEnabled] = useState(false);
  const [incomingBusy, setIncomingBusy] = useState(false);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<{
    url: string;
    downloadUrl: string;
    title: string;
    subtitle: string;
  } | null>(null);
  const [incomingToast, setIncomingToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('All');
  const [sessionFilter, setSessionFilter] = useState<string>('2026');

  // Schedule Details State
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [scheduledStudents, setScheduledStudents] = useState<StudentScheduled[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Schedule Form Modal State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [formBranch, setFormBranch] = useState('Al-Ameen Mission Academy Memari (Khadija Campus)');
  const [formSession, setFormSession] = useState('2026');
  const [formClass, setFormClass] = useState('XI-Sc.');
  const [formSection, setFormSection] = useState('0');
  const [formGender, setFormGender] = useState('Female');
  const [formTalkTime, setFormTalkTime] = useState('8');
  const [formDays, setFormDays] = useState<string[]>(['Sun', 'Sat']);
  const [formStartTime, setFormStartTime] = useState('04:00');
  const [formEndTime, setFormEndTime] = useState('23:55');

  // Edit Mobile & Relation Modal State
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [targetStudent, setTargetStudent] = useState<StudentScheduled | null>(null);
  const [fatherMobile, setFatherMobile] = useState('');
  const [motherMobile, setMotherMobile] = useState('');
  const [guardian1Mobile, setGuardian1Mobile] = useState('');
  const [guardian1Relation, setGuardian1Relation] = useState('Grandfather');
  const [guardian2Mobile, setGuardian2Mobile] = useState('');
  const [guardian2Relation, setGuardian2Relation] = useState('Uncle');
  const [guardian3Mobile, setGuardian3Mobile] = useState('');
  const [guardian3Relation, setGuardian3Relation] = useState('Other');
  const [savingContacts, setSavingContacts] = useState(false);

  // Call Logs State
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFromDate, setLogsFromDate] = useState('');
  const [logsToDate, setLogsToDate] = useState('');
  const [logGlobalSearch, setLogGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [columnSort, setColumnSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
  const [colDropdownSearch, setColDropdownSearch] = useState('');
  const [draftSelectedValues, setDraftSelectedValues] = useState<string[]>([]);
  const [exportingLogs, setExportingLogs] = useState(false);

  // Interactive IVR Dialer Simulator State
  const [dialRegNo, setDialRegNo] = useState('');
  const [dialStep, setDialStep] = useState<1 | 2 | 3>(1);
  const [ivrResponse, setIvrResponse] = useState<any>(null);
  const [ivrLoading, setIvrLoading] = useState(false);
  const [ivrError, setIvrError] = useState<string | null>(null);
  const [activeCallStatus, setActiveCallStatus] = useState<string | null>(null);
  const [activeCallSession, setActiveCallSession] = useState<{
    callId?: string;
    studentName: string;
    targetRelation: string;
    targetMobile: string;
    remainingSeconds: number;
    initialSeconds: number;
    elapsedSeconds: number;
    isAnswered: boolean;
  } | null>(null);

  useEffect(() => {
    if (!activeCallSession) return;
    // Don't count down if phone is just ringing! Quota only starts when conversation begins!
    if (!activeCallSession.isAnswered) return;

    const interval = setInterval(() => {
      setActiveCallSession((prev) => {
        if (!prev) return null;
        if (!prev.isAnswered) return prev;
        if (prev.remainingSeconds <= 1) {
          void handleEndCall(prev.callId, prev.elapsedSeconds + 1, '8min_timeout');
          return null;
        }
        return {
          ...prev,
          remainingSeconds: prev.remainingSeconds - 1,
          elapsedSeconds: prev.elapsedSeconds + 1,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCallSession]);

  const handleEndCall = async (callId?: string, duration?: number, reason?: string) => {
    const isNoAnswer = !activeCallSession?.isAnswered || reason === 'no_answer' || !duration;
    const finalDuration = isNoAnswer ? 0 : (duration || 0);
    const finalStatus = isNoAnswer ? 'no_answer' : 'completed';

    try {
      if (callId) {
        await api('/api/calling-booth/end-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: callId,
            duration_seconds: finalDuration,
            status: finalStatus,
            end_reason: reason || (isNoAnswer ? 'no_answer' : 'manual_hangup')
          })
        });
      }
    } catch {}
    setActiveCallSession(null);
    if (isNoAnswer) {
      setActiveCallStatus(`📞 কল কানেক্ট হয়নি / অভিভাবক ফোন তোলেনি। শিক্ষার্থীর কোটা থেকে কোনো সময় কাটা হয়নি (০ সেকেন্ড)।`);
    } else {
      setActiveCallStatus(`✓ কথা শেষ হয়েছে (${finalDuration} সেকেন্ড)। শিক্ষার্থীর ব্যবহৃত সময় সেভ করা হলো।`);
    }
    fetchLogs();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatStartDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const mins = String(d.getMinutes()).padStart(2, '0');
      const secs = String(d.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const hh = String(hours).padStart(2, '0');
      return `${day}-${month}-${year} ${hh}:${mins}:${secs} ${ampm}`;
    } catch {
      return '—';
    }
  };

  const formatEndTime = (startStr?: string, endStr?: string, duration?: number) => {
    let targetDate: Date | null = null;
    if (endStr) {
      const d = new Date(endStr);
      if (!isNaN(d.getTime())) targetDate = d;
    }
    if (!targetDate && startStr && duration && duration > 0) {
      const s = new Date(startStr);
      if (!isNaN(s.getTime())) {
        targetDate = new Date(s.getTime() + duration * 1000);
      }
    }
    if (!targetDate) return '—';

    try {
      let hours = targetDate.getHours();
      const mins = String(targetDate.getMinutes()).padStart(2, '0');
      const secs = String(targetDate.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const hh = String(hours).padStart(2, '0');
      return `${hh}:${mins}:${secs} ${ampm}`;
    } catch {
      return '—';
    }
  };

  const formatDurationDisplay = (durationSecs?: number, status?: string) => {
    const secs = Number(durationSecs) || 0;
    if (secs <= 0) {
      return '0s';
    }
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m > 0 && s > 0) return `${m}m ${s}s`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  // Fetch Schedules
  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await api('/api/calling-schedules');
      if (res && res.schedules) {
        setSchedules(res.schedules || []);
      }
    } catch (err: any) {
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Call Logs (with optional From Date / To Date)
  const fetchLogs = async (fromOverride?: string, toOverride?: string) => {
    try {
      setLogsLoading(true);
      const fDate = fromOverride !== undefined ? fromOverride : logsFromDate;
      const tDate = toOverride !== undefined ? toOverride : logsToDate;
      const params = new URLSearchParams();
      params.set('limit', (fDate || tDate) ? '1000' : '100');
      if (fDate) params.set('from_date', fDate);
      if (tDate) params.set('to_date', tDate);

      const res = await api(`/api/calls/logs?${params.toString()}`);
      if (res && res.calls) {
        setCallLogs(res.calls || []);
      }
    } catch (err: any) {
      console.error('Failed to load call logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Unified Column Definitions for Excel-style Dropdown Filter & Sort
  const logColumns = useMemo(() => [
    { key: 'reg_no', label: 'Reg No', width: 85, getValue: (l: CallLog) => String(l.reg_no || '-'), getSortValue: (l: CallLog) => String(l.reg_no || '') },
    { key: 'student_name', label: 'Student', width: 145, getValue: (l: CallLog) => String(l.student_name || '-'), getSortValue: (l: CallLog) => String(l.student_name || '').toLowerCase() },
    { key: 'called_relation', label: 'Relation', width: 105, getValue: (l: CallLog) => String(l.called_relation || 'Manual'), getSortValue: (l: CallLog) => String(l.called_relation || 'Manual').toLowerCase() },
    { key: 'to_number', label: 'Dialed To', width: 120, getValue: (l: CallLog) => String(l.to_number || '-'), getSortValue: (l: CallLog) => String(l.to_number || '') },
    { key: 'status', label: 'Status', width: 105, getValue: (l: CallLog) => l.status === 'completed' ? 'Completed' : l.status === 'no_answer' ? 'No Answer' : String(l.status || '-'), getSortValue: (l: CallLog) => String(l.status || '').toLowerCase() },
    { key: 'start_time', label: 'Start Time', width: 165, getValue: (l: CallLog) => formatStartDateTime(l.started_at || l.created_at), getSortValue: (l: CallLog) => new Date(l.started_at || l.created_at || 0).getTime() },
    { key: 'stop_time', label: 'Stop Time', width: 115, getValue: (l: CallLog) => formatEndTime(l.started_at || l.created_at, l.ended_at, l.duration), getSortValue: (l: CallLog) => new Date(l.ended_at || l.started_at || l.created_at || 0).getTime() },
    { key: 'duration', label: 'Duration', width: 100, getValue: (l: CallLog) => formatDurationDisplay(l.duration, l.status), getSortValue: (l: CallLog) => Number(l.duration || 0) },
    { key: 'time_limit', label: 'Time Limit', width: 100, getValue: (l: CallLog) => l.allowed_talk_time ? `${l.allowed_talk_time} min` : '8 min', getSortValue: (l: CallLog) => Number(l.allowed_talk_time || 8) },
    { key: 'recording', label: 'Recording', width: 105, getValue: (l: CallLog) => l.recording_url ? 'Available' : 'None', getSortValue: (l: CallLog) => (l.recording_url ? 1 : 0) },
  ], []);

  const getUniqueValuesForCol = (colKey: string) => {
    const col = logColumns.find((c) => c.key === colKey);
    if (!col) return [];
    const seen = new Set<string>();
    callLogs.forEach((l) => seen.add(col.getValue(l)));
    return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  const openColumnFilter = (colKey: string) => {
    const allVals = getUniqueValuesForCol(colKey);
    const current = columnFilters[colKey];
    setDraftSelectedValues(current ? [...current] : [...allVals]);
    setColDropdownSearch('');
    setActiveFilterCol(colKey);
  };

  const filteredCallLogs = useMemo(() => {
    const q = logGlobalSearch.trim().toLowerCase();
    let list = callLogs.filter((log) => {
      if (q) {
        const hay = `${log.reg_no || ''} ${log.student_name || ''} ${log.called_relation || ''} ${log.to_number || ''} ${log.status || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const col of logColumns) {
        const allowed = columnFilters[col.key];
        if (allowed && !allowed.includes(col.getValue(log))) {
          return false;
        }
      }
      return true;
    });

    if (columnSort) {
      const sortCol = logColumns.find((c) => c.key === columnSort.key);
      if (sortCol) {
        list = [...list].sort((a, b) => {
          const va = sortCol.getSortValue(a);
          const vb = sortCol.getSortValue(b);
          let cmp = 0;
          if (typeof va === 'number' && typeof vb === 'number') {
            cmp = va - vb;
          } else {
            cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
          }
          return columnSort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [callLogs, logGlobalSearch, columnFilters, columnSort, logColumns]);

  const hasActiveLogFilters = Boolean(
    logsFromDate ||
    logsToDate ||
    logGlobalSearch.trim() ||
    Object.keys(columnFilters).length > 0 ||
    columnSort
  );

  const resetAllLogFilters = () => {
    setLogsFromDate('');
    setLogsToDate('');
    setLogGlobalSearch('');
    setColumnFilters({});
    setColumnSort(null);
    fetchLogs('', '');
  };

  // Download Call Logs as Excel (.xlsx)
  const handleExportLogsExcel = async () => {
    if (exportingLogs) return;
    try {
      setExportingLogs(true);
      const base = getApiBase();
      const token = await getToken();
      const dateTag = (logsFromDate || logsToDate) ? `${logsFromDate || 'start'}_to_${logsToDate || 'today'}` : 'all';
      const filename = `Hostel_Call_Logs_${dateTag}.xlsx`;

      if (Platform.OS === 'web') {
        const res = await fetch(`${base}/api/calls/logs/export`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            from_date: logsFromDate,
            to_date: logsToDate,
            records: filteredCallLogs,
          }),
        });
        if (!res.ok) {
          throw new Error(`Export failed (${res.status})`);
        }
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
      } else {
        const params = new URLSearchParams();
        if (logsFromDate) params.set('from_date', logsFromDate);
        if (logsToDate) params.set('to_date', logsToDate);
        await Linking.openURL(`${base}/api/calls/logs/export?${params.toString()}`);
      }
    } catch (err: any) {
      Alert.alert('Download Error', err?.message || 'Failed to download Excel file.');
    } finally {
      setExportingLogs(false);
    }
  };

  const fetchBoothSettings = async () => {
    try {
      const res = await api('/api/calling-schedules/settings');
      if (res && res.settings) {
        setIncomingEnabled(Boolean(res.settings.incoming_calls_enabled));
        setRecordingEnabled(Boolean(res.settings.call_recording_enabled));
      }
    } catch {}
  };

  const handleToggleRecording = async () => {
    if (recordingBusy) return;
    const nextVal = !recordingEnabled;
    setRecordingEnabled(nextVal);
    setRecordingBusy(true);
    setIncomingToast({
      message: nextVal
        ? '🎙️ কল রেকর্ডিং সক্রিয় করা হয়েছে (Call Recording: ON - Saving locally)'
        : '🔇 কল রেকর্ডিং বন্ধ করা হয়েছে (Call Recording: OFF)',
      type: 'success',
    });
    setTimeout(() => setIncomingToast(null), 4000);

    try {
      const res = await api('/api/calling-schedules/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_recording_enabled: nextVal }),
      });
      if (res && res.settings) {
        setRecordingEnabled(Boolean(res.settings.call_recording_enabled));
      }
    } catch (err: any) {
      setRecordingEnabled(!nextVal);
      setIncomingToast({
        message: err?.message || 'Failed to update call recording setting',
        type: 'error',
      });
      setTimeout(() => setIncomingToast(null), 4000);
      Alert.alert('Error', err?.message || 'Failed to update call recording setting');
    } finally {
      setRecordingBusy(false);
    }
  };

  const handleOpenRecording = async (log: CallLog) => {
    if (!log.recording_url) return;
    try {
      const token = await getToken();
      const base = getApiBase();
      const isAbsolute = /^https?:\/\//i.test(log.recording_url);
      const rawUrl = isAbsolute ? log.recording_url : `${base}${log.recording_url.startsWith('/') ? '' : '/'}${log.recording_url}`;
      const sep = rawUrl.includes('?') ? '&' : '?';
      const authUrl = token ? `${rawUrl}${sep}token=${encodeURIComponent(token)}` : rawUrl;
      const downloadUrl = `${authUrl}${authUrl.includes('?') ? '&' : '?'}download=1`;

      if (Platform.OS === 'web') {
        setPlayingRecording({
          url: authUrl,
          downloadUrl,
          title: `${log.student_name || 'Student'} (${log.reg_no || '-'})`,
          subtitle: `${log.called_relation || 'Guardian'} • ${log.to_number} • ${formatStartDateTime(log.started_at || log.created_at)}`,
        });
      } else {
        await Linking.openURL(authUrl);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not open recording');
    }
  };

  const handleToggleIncoming = async () => {
    if (incomingBusy) return;
    const nextVal = !incomingEnabled;
    // Instant optimistic update
    setIncomingEnabled(nextVal);
    setIncomingBusy(true);
    setIncomingToast({
      message: nextVal
        ? '📞 ইনকামিং কল সক্রিয় করা হয়েছে (Incoming Calls: ON - Handset will ring)'
        : '📵 ইনকামিং কল সম্পূর্ণ বন্ধ করা হয়েছে (Incoming Calls: OFF - Calls blocked)',
      type: 'success',
    });
    setTimeout(() => setIncomingToast(null), 4000);

    try {
      const res = await api('/api/calling-schedules/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incoming_calls_enabled: nextVal }),
      });
      if (res && res.settings) {
        setIncomingEnabled(Boolean(res.settings.incoming_calls_enabled));
      }
    } catch (err: any) {
      // Revert if error
      setIncomingEnabled(!nextVal);
      setIncomingToast({
        message: err?.message || 'Failed to update incoming call setting',
        type: 'error',
      });
      setTimeout(() => setIncomingToast(null), 4000);
      Alert.alert('Error', err?.message || 'Failed to update incoming call setting');
    } finally {
      setIncomingBusy(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u: any = await getUser();
        if (!mounted) return;
        if (u && u.role === 'super_admin') {
          setIsSuperAdmin(true);
          fetchSchedules();
          fetchBoothSettings();
        } else {
          setIsSuperAdmin(false);
        }
      } catch {
        if (mounted) setIsSuperAdmin(false);
      } finally {
        if (mounted) setAuthChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Filtered schedules
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (selectedClassFilter !== 'All' && s.class_name !== selectedClassFilter) return false;
      if (selectedStatusFilter === 'Active' && !s.is_active) return false;
      if (selectedStatusFilter === 'Inactive' && s.is_active) return false;
      if (sessionFilter && s.session_name !== sessionFilter) return false;
      return true;
    });
  }, [schedules, selectedClassFilter, selectedStatusFilter, sessionFilter]);

  // View Schedule Students
  const handleOpenDetails = async (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setActiveTab('details');
    try {
      setDetailsLoading(true);
      const res = await api(`/api/calling-schedules/${schedule.id}/students`);
      if (res && res.students) {
        setScheduledStudents(res.students || []);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not load student list');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Toggle Schedule Active/Inactive
  const handleToggleStatus = async (id: number) => {
    try {
      const res = await api(`/api/calling-schedules/${id}/toggle-status`, { method: 'PATCH' });
      if (res?.success) {
        fetchSchedules();
      }
    } catch {
      Alert.alert('Error', 'Failed to toggle status');
    }
  };

  // Delete Schedule
  const handleDeleteSchedule = (id: number) => {
    const doDelete = async () => {
      try {
        const res = await api(`/api/calling-schedules/${id}`, { method: 'DELETE' });
        if (res?.success) {
          fetchSchedules();
        }
      } catch {
        Alert.alert('Error', 'Failed to delete schedule');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this calling schedule?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Schedule', 'Are you sure you want to delete this calling schedule?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete }
      ]);
    }
  };

  // Open Edit Schedule Modal
  const handleOpenEdit = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    setFormBranch(schedule.branch_name);
    setFormSession(schedule.session_name);
    setFormClass(schedule.class_name);
    setFormSection(schedule.section || '0');
    setFormGender(schedule.gender || 'Female');
    setFormTalkTime(String(schedule.allowed_talk_time || 8));
    setFormDays(Array.isArray(schedule.days) ? schedule.days : ['Sun', 'Sat']);
    setFormStartTime(schedule.start_time || '04:00');
    setFormEndTime(schedule.end_time || '23:55');
    setShowScheduleModal(true);
  };

  // Open New Schedule Modal
  const handleOpenNew = () => {
    setEditingScheduleId(null);
    setFormBranch('Al-Ameen Mission Academy Memari (Khadija Campus)');
    setFormSession('2026');
    setFormClass('XI-Sc.');
    setFormSection('0');
    setFormGender('Female');
    setFormTalkTime('8');
    setFormDays(['Sun', 'Sat']);
    setFormStartTime('04:00');
    setFormEndTime('23:55');
    setShowScheduleModal(true);
  };

  // Save Schedule Form
  const handleSaveSchedule = async () => {
    const payload = {
      branch_name: formBranch,
      session_name: formSession,
      class_name: formClass,
      section: formSection,
      gender: formGender,
      allowed_talk_time: parseInt(formTalkTime, 10) || 8,
      days: formDays,
      start_time: formStartTime,
      end_time: formEndTime,
      is_active: true
    };

    try {
      let res;
      if (editingScheduleId) {
        res = await api(`/api/calling-schedules/${editingScheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await api('/api/calling-schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res && res.success) {
        setShowScheduleModal(false);
        fetchSchedules();
        Alert.alert('Success', 'Calling schedule saved successfully!');
      } else {
        Alert.alert('Error', res?.message || 'Failed to save schedule');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Server connection error');
    }
  };

  // Toggle Day Selection in Modal
  const handleToggleDay = (day: string) => {
    if (formDays.includes(day)) {
      setFormDays(formDays.filter(d => d !== day));
    } else {
      setFormDays([...formDays, day]);
    }
  };

  // Open "Edit Mobile No & Relation" Modal
  const handleOpenContactsModal = (student: StudentScheduled) => {
    setTargetStudent(student);
    setFatherMobile(student.father_mobile || '');
    setMotherMobile(student.mother_mobile || '');
    setGuardian1Mobile(student.guardian_1_mobile || '');
    setGuardian1Relation(student.guardian_1_relation || '');
    setGuardian2Mobile(student.guardian_2_mobile || '');
    setGuardian2Relation(student.guardian_2_relation || '');
    setGuardian3Mobile(student.guardian_3_mobile || '');
    setGuardian3Relation(student.guardian_3_relation || '');
    setShowContactsModal(true);
  };

  // Save Guardian Contacts
  const handleSaveContacts = async () => {
    if (!targetStudent) return;
    try {
      setSavingContacts(true);
      const res = await api(`/api/calling-schedules/student-contacts/${targetStudent.student_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          father_mobile: fatherMobile,
          mother_mobile: motherMobile,
          guardian_1_mobile: guardian1Mobile,
          guardian_1_relation: guardian1Relation,
          guardian_2_mobile: guardian2Mobile,
          guardian_2_relation: guardian2Relation,
          guardian_3_mobile: guardian3Mobile,
          guardian_3_relation: guardian3Relation
        })
      });

      if (res && res.success) {
        setShowContactsModal(false);
        if (selectedSchedule) {
          handleOpenDetails(selectedSchedule);
        }
        Alert.alert('Success', 'Guardian mobile numbers and relations saved!');
      } else {
        Alert.alert('Error', res?.message || 'Failed to update contacts');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Server error while saving contacts');
    } finally {
      setSavingContacts(false);
    }
  };

  // Toggle Emergency Call
  const handleToggleEmergency = async (student: StudentScheduled) => {
    const newVal = !student.is_emergency_call;
    try {
      const res = await api(`/api/calling-schedules/emergency-call/${student.student_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_emergency_call: newVal })
      });
      if (res && res.success) {
        setScheduledStudents(prev =>
          prev.map(s => (s.student_id === student.student_id ? { ...s, is_emergency_call: newVal } : s))
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to update emergency call access');
    }
  };

  // Filter students in details view
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return scheduledStudents;
    const q = studentSearch.toLowerCase();
    return scheduledStudents.filter(
      s => s.registration_no.toLowerCase().includes(q) || s.student_name.toLowerCase().includes(q)
    );
  }, [scheduledStudents, studentSearch]);

  // Interactive IVR Step 1
  const handleIvrStep1 = async () => {
    if (!dialRegNo.trim()) {
      setIvrError('Please enter a Student Registration Number');
      return;
    }
    setIvrError(null);
    try {
      setIvrLoading(true);
      const res = await api('/api/calls/ivr/step1-verify-reg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg_no: dialRegNo.trim() })
      });
      if (res && res.success) {
        setIvrResponse(res);
        setDialStep(2);
      } else {
        setIvrError(res?.message_bn || res?.message || 'Registration number not found');
      }
    } catch (err: any) {
      setIvrError(err?.message || 'Could not verify registration number');
    } finally {
      setIvrLoading(false);
    }
  };

  // Interactive IVR Step 2: Confirm Reg No (Press 1)
  const handleIvrStep2 = async (confirmDigit: string) => {
    setIvrError(null);
    try {
      setIvrLoading(true);
      const res = await api('/api/calls/ivr/step2-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: ivrResponse?.student_id,
          reg_no: dialRegNo.trim(),
          confirm_digit: confirmDigit
        })
      });
      if (res && res.success) {
        setIvrResponse(res);
        setDialStep(3);
      } else {
        const errorText = res?.message_bn || res?.message || 'Calling schedule not active';
        setIvrError(errorText);
        if (res?.status === 'reenter') {
          setDialStep(1);
        }
      }
    } catch (err: any) {
      setIvrError(err?.message || 'Schedule check failed');
    } finally {
      setIvrLoading(false);
    }
  };

  // Interactive IVR Step 3: Select Relation & Dial
  const handleIvrStep3 = async (digit: number) => {
    setIvrError(null);
    try {
      setIvrLoading(true);
      setActiveCallStatus('Connecting call to guardian...');
      const res = await api('/api/calls/ivr/step3-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: ivrResponse?.student_id,
          reg_no: dialRegNo.trim(),
          selected_digit: digit
        })
      });
      if (res && res.success) {
        setActiveCallSession({
          callId: res.call_id ? String(res.call_id) : undefined,
          studentName: ivrResponse?.student_name || 'Student',
          targetRelation: res.target_relation || 'Guardian',
          targetMobile: res.target_mobile || '',
          remainingSeconds: res.max_allowed_seconds || 480,
          initialSeconds: res.max_allowed_seconds || 480,
          elapsedSeconds: 0,
          isAnswered: false
        });
        const gsmNote = res.gsm_dialed
          ? `📞 আসল GSM কল ডায়াল হচ্ছে (${res.gsm_device || 'Connected Phone'})...`
          : `📞 কল ডায়াল হচ্ছে...`;
        setActiveCallStatus(`${gsmNote} অভিভাবকের ফোন রিং হচ্ছে। ফোন রিসিভ করলে 'Start Talking' চাপুন। কথা শুরু হলে তবেই টাইমার চলবে।`);
      } else {
        setActiveCallStatus(null);
        setIvrError(res?.message_bn || res?.message || 'Could not initiate call');
      }
    } catch (err: any) {
      setActiveCallStatus(null);
      setIvrError(err?.message || 'Call connection failed');
    } finally {
      setIvrLoading(false);
    }
  };

  if (authChecking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AcademyHeader />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color="#1768c5" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isSuperAdmin) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AcademyHeader />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={[styles.card, { maxWidth: 440, alignItems: 'center', padding: 28 }]}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🔒</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#991b1b', marginBottom: 8, textAlign: 'center' }}>
              Access Restricted (Super Admin Only)
            </Text>
            <Text style={{ fontSize: 13.5, color: '#475569', textAlign: 'center', marginBottom: 18, lineHeight: 20 }}>
              Calling Schedule and Call Recordings are restricted to Super Admin login only.
            </Text>
            <TouchableOpacity onPress={() => router.replace('/')} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>← Go Back Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AcademyHeader />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>

        {/* Navigation Bar */}
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.replace('/superadmin')} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Home</Text>
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Calling Schedule (IPBX)</Text>
          <View style={styles.navTabs}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'schedules' && styles.activeTabBtn]}
              onPress={() => setActiveTab('schedules')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'schedules' && styles.activeTabText]}>Schedules</Text>
            </TouchableOpacity>
            {selectedSchedule && (
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'details' && styles.activeTabBtn]}
                onPress={() => setActiveTab('details')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'details' && styles.activeTabText]}>Students List</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'logs' && styles.activeTabBtn]}
              onPress={() => {
                setActiveTab('logs');
                fetchLogs();
              }}
            >
              <Text style={[styles.tabBtnText, activeTab === 'logs' && styles.activeTabText]}>Call Logs</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ========================================================= */}
        {/* TAB 1: SCHEDULE MASTER VIEW                               */}
        {/* ========================================================= */}
        {activeTab === 'schedules' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardHeading}>Hostel Calling Schedule</Text>
                <Text style={styles.cardSub}>Configure calling hours, talk-time limit, and allowed days per class</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  disabled={incomingBusy}
                  onPress={handleToggleIncoming}
                  activeOpacity={0.7}
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                      borderWidth: 1.5,
                      backgroundColor: incomingEnabled ? '#ecfdf5' : '#fef2f2',
                      borderColor: incomingEnabled ? '#10b981' : '#ef4444',
                      opacity: incomingBusy ? 0.7 : 1,
                      shadowColor: incomingEnabled ? '#10b981' : '#ef4444',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.15,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                    (Platform.OS === 'web' ? ({ cursor: incomingBusy ? 'wait' : 'pointer', userSelect: 'none' } as any) : {})
                  ]}
                >
                  {/* Switch Pill & Slider */}
                  <View
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: incomingEnabled ? '#10b981' : '#cbd5e1',
                      padding: 2,
                      justifyContent: 'center',
                      alignItems: incomingEnabled ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: '#ffffff',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.25,
                        shadowRadius: 2,
                        elevation: 2,
                      }}
                    />
                  </View>

                  <Text style={{ fontWeight: '800', fontSize: 13, color: incomingEnabled ? '#065f46' : '#991b1b' }}>
                    {incomingEnabled ? '📞 Incoming Calls: ON' : '📵 Incoming Calls: OFF (Blocked)'}
                  </Text>
                </TouchableOpacity>
                {/* Call Recording Toggle Switch */}
                <TouchableOpacity
                  onPress={handleToggleRecording}
                  activeOpacity={0.7}
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                      borderWidth: 1.5,
                      backgroundColor: recordingEnabled ? '#eff6ff' : '#f8fafc',
                      borderColor: recordingEnabled ? '#2563eb' : '#94a3b8',
                      opacity: recordingBusy ? 0.7 : 1,
                      shadowColor: recordingEnabled ? '#2563eb' : '#64748b',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.12,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                    (Platform.OS === 'web' ? ({ cursor: recordingBusy ? 'wait' : 'pointer', userSelect: 'none' } as any) : {})
                  ]}
                >
                  <View
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: recordingEnabled ? '#2563eb' : '#cbd5e1',
                      padding: 2,
                      justifyContent: 'center',
                      alignItems: recordingEnabled ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: '#ffffff',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.25,
                        shadowRadius: 2,
                        elevation: 2,
                      }}
                    />
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 13, color: recordingEnabled ? '#1e40af' : '#475569' }}>
                    {recordingEnabled ? '🎙️ Recording: ON' : '🔇 Recording: OFF'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleOpenNew}>
                  <Text style={styles.primaryBtnText}>+ Add Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Incoming Status Toast / Alert Banner */}
            {incomingToast && (
              <View
                style={{
                  marginHorizontal: 16,
                  marginTop: 4,
                  marginBottom: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 8,
                  backgroundColor: incomingToast.type === 'success' ? '#dcfce7' : '#fee2e2',
                  borderColor: incomingToast.type === 'success' ? '#86efac' : '#fca5a5',
                  borderWidth: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    fontWeight: '700',
                    fontSize: 13,
                    color: incomingToast.type === 'success' ? '#166534' : '#991b1b',
                  }}
                >
                  {incomingToast.message}
                </Text>
              </View>
            )}

            {/* Filter Bar */}
            <View style={styles.filterRow}>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Class:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {['All', ...STUDENT_CLASSES].map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, selectedClassFilter === c && styles.activeChip]}
                      onPress={() => setSelectedClassFilter(c)}
                    >
                      <Text style={[styles.chipText, selectedClassFilter === c && styles.activeChipText]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Status:</Text>
                {['All', 'Active', 'Inactive'].map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.chip, selectedStatusFilter === st && styles.activeChip]}
                    onPress={() => setSelectedStatusFilter(st)}
                  >
                    <Text style={[styles.chipText, selectedStatusFilter === st && styles.activeChipText]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Schedules Table */}
            {loading ? (
              <ActivityIndicator size="large" color="#1768c5" style={{ marginVertical: 32 }} />
            ) : filteredSchedules.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No calling schedules configured for the selected filter.</Text>
                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={handleOpenNew}>
                  <Text style={styles.primaryBtnText}>+ Create First Schedule</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.table}>
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, { width: 50 }]}>#</Text>
                    <Text style={[styles.th, { width: 170 }]}>Action</Text>
                    <Text style={[styles.th, { width: 90 }]}>Status</Text>
                    <Text style={[styles.th, { width: 100 }]}>Class</Text>
                    <Text style={[styles.th, { width: 70 }]}>Session</Text>
                    <Text style={[styles.th, { width: 80 }]}>Gender</Text>
                    <Text style={[styles.th, { width: 130 }]}>Days</Text>
                    <Text style={[styles.th, { width: 120 }]}>Timing</Text>
                    <Text style={[styles.th, { width: 110 }]}>Talk Time</Text>
                  </View>

                  {filteredSchedules.map((item, idx) => (
                    <View key={`sched-${item.id}-${idx}`} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.td, { width: 50, fontWeight: '700' }]}>{idx + 1}</Text>
                      <View style={[styles.tdActions, { width: 170 }]}>
                        <TouchableOpacity style={styles.btnSmallView} onPress={() => handleOpenDetails(item)}>
                          <Text style={styles.btnSmallViewText}>Students</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnSmallEdit} onPress={() => handleOpenEdit(item)}>
                          <Text style={styles.btnSmallEditText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnSmallDel} onPress={() => handleDeleteSchedule(item.id)}>
                          <Text style={styles.btnSmallDelText}>Del</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ width: 90, paddingHorizontal: 6 }}>
                        <TouchableOpacity
                          style={[styles.badgeStatus, item.is_active ? styles.badgeActive : styles.badgeInactive]}
                          onPress={() => handleToggleStatus(item.id)}
                        >
                          <Text style={[styles.badgeText, item.is_active ? styles.badgeTextActive : styles.badgeTextInactive]}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.td, { width: 100, fontWeight: '700', color: '#173f77' }]}>{item.class_name}</Text>
                      <Text style={[styles.td, { width: 70 }]}>{item.session_name}</Text>
                      <Text style={[styles.td, { width: 80 }]}>{item.gender}</Text>
                      <Text style={[styles.td, { width: 130, color: '#0969da' }]}>
                        {Array.isArray(item.days) ? item.days.join(', ') : item.days}
                      </Text>
                      <Text style={[styles.td, { width: 120 }]}>
                        {item.start_time} - {item.end_time}
                      </Text>
                      <Text style={[styles.td, { width: 110, fontWeight: '700', color: '#1a7f37' }]}>
                        {item.allowed_talk_time} min
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SCHEDULE DETAILS & STUDENTS LIST                   */}
        {/* ========================================================= */}
        {activeTab === 'details' && selectedSchedule && (
          <View style={styles.card}>
            <View style={styles.detailsHeaderBox}>
              <TouchableOpacity style={styles.btnBackOutline} onPress={() => setActiveTab('schedules')}>
                <Text style={styles.btnBackOutlineText}>← Back to Schedules</Text>
              </TouchableOpacity>
              <View style={{ marginTop: 8 }}>
                <Text style={styles.detailsHeading}>
                  Schedule Details: Class {selectedSchedule.class_name} ({selectedSchedule.gender})
                </Text>
                <Text style={styles.detailsSubText}>
                  Days: {Array.isArray(selectedSchedule.days) ? selectedSchedule.days.join(', ') : selectedSchedule.days} | Hours: {selectedSchedule.start_time} - {selectedSchedule.end_time} | Max Talk Time: {selectedSchedule.allowed_talk_time} min
                </Text>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by Student Reg No or Name..."
                value={studentSearch}
                onChangeText={setStudentSearch}
              />
              <Text style={styles.searchCount}>{filteredStudents.length} Students</Text>
            </View>

            {detailsLoading ? (
              <ActivityIndicator size="large" color="#1768c5" style={{ marginVertical: 32 }} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.table}>
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, { width: 40 }]}>#</Text>
                    <Text style={[styles.th, { width: 80 }]}>Reg No</Text>
                    <Text style={[styles.th, { width: 170 }]}>Student Name</Text>
                    <Text style={[styles.th, { width: 340 }]}>Guardian Numbers (Dial 1, 2, 3...)</Text>
                    <Text style={[styles.th, { width: 130 }]}>Emergency Call</Text>
                    <Text style={[styles.th, { width: 130 }]}>Action</Text>
                  </View>

                  {filteredStudents.map((stu, i) => (
                    <View key={`stu-${stu.student_id}-${i}`} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.td, { width: 40 }]}>{i + 1}</Text>
                      <Text style={[styles.td, { width: 80, fontWeight: '700', color: '#173f77' }]}>{stu.registration_no}</Text>
                      <Text style={[styles.td, { width: 170, fontWeight: '600' }]}>{stu.student_name}</Text>
                      <View style={{ width: 340, paddingVertical: 6, gap: 4 }}>
                        {stu.father_mobile ? (
                          <View style={styles.contactRowBadge}>
                            <View style={styles.dialKeyBadge}><Text style={styles.dialKeyText}>Dial 1</Text></View>
                            <Text style={styles.contactItemText}>👨 {stu.father_mobile} — <Text style={{ fontWeight: '700' }}>Father</Text></Text>
                          </View>
                        ) : null}
                        {stu.mother_mobile ? (
                          <View style={styles.contactRowBadge}>
                            <View style={[styles.dialKeyBadge, { backgroundColor: '#8250df' }]}><Text style={styles.dialKeyText}>Dial 2</Text></View>
                            <Text style={styles.contactItemText}>👩 {stu.mother_mobile} — <Text style={{ fontWeight: '700' }}>Mother</Text></Text>
                          </View>
                        ) : null}
                        {stu.guardian_1_mobile ? (
                          <View style={styles.contactRowBadge}>
                            <View style={[styles.dialKeyBadge, { backgroundColor: '#1a7f37' }]}><Text style={styles.dialKeyText}>Dial 3</Text></View>
                            <Text style={styles.contactItemText}>👤 {stu.guardian_1_mobile} — {stu.guardian_1_relation || 'Guardian 1'}</Text>
                          </View>
                        ) : null}
                        {stu.guardian_2_mobile ? (
                          <View style={styles.contactRowBadge}>
                            <View style={[styles.dialKeyBadge, { backgroundColor: '#d97706' }]}><Text style={styles.dialKeyText}>Dial 4</Text></View>
                            <Text style={styles.contactItemText}>👤 {stu.guardian_2_mobile} — {stu.guardian_2_relation || 'Guardian 2'}</Text>
                          </View>
                        ) : null}
                        {stu.guardian_3_mobile ? (
                          <View style={styles.contactRowBadge}>
                            <View style={[styles.dialKeyBadge, { backgroundColor: '#475569' }]}><Text style={styles.dialKeyText}>Dial 5</Text></View>
                            <Text style={styles.contactItemText}>👤 {stu.guardian_3_mobile} — {stu.guardian_3_relation || 'Guardian 3'}</Text>
                          </View>
                        ) : null}
                        {!stu.father_mobile && !stu.mother_mobile && !stu.guardian_1_mobile && !stu.guardian_2_mobile && !stu.guardian_3_mobile && (
                          <Text style={{ fontSize: 11, color: '#cf222e', fontStyle: 'italic' }}>No phone numbers registered</Text>
                        )}
                      </View>
                      <View style={{ width: 130, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={[styles.badgeStatus, stu.is_emergency_call ? styles.badgeActive : styles.badgeInactive]}
                          onPress={() => handleToggleEmergency(stu)}
                        >
                          <Text style={[styles.badgeText, stu.is_emergency_call ? styles.badgeTextActive : styles.badgeTextInactive]}>
                            {stu.is_emergency_call ? '✓ Allowed' : '✗ Off'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ width: 130, flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.btnSmallEditNumbers}
                          onPress={() => handleOpenContactsModal(stu)}
                        >
                          <Text style={styles.btnSmallEditNumbersText}>✏️ Edit Numbers</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB 3: INTERACTIVE IVR DIALER SIMULATOR                   */}
        {/* ========================================================= */}
        {activeTab === 'dialer' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardHeading}>Yealink / Phone Booth IVR Simulator</Text>
                <Text style={styles.cardSub}>Simulate the student phone booth experience directly from your browser</Text>
              </View>
            </View>

            <View style={styles.dialerContainer}>
              {/* Step 1: Input Reg No */}
              {dialStep === 1 && (
                <View style={styles.dialStepBox}>
                  <Text style={styles.dialStepTitle}>Step 1: Enter Student Registration Number</Text>
                  <Text style={styles.dialStepDesc}>Student lifts the receiver and keys in their Registration Number.</Text>

                  <View style={styles.dialInputGroup}>
                    <TextInput
                      style={styles.keypadInput}
                      placeholder="e.g. 60753, 78888"
                      value={dialRegNo}
                      onChangeText={setDialRegNo}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity
                      style={[styles.primaryBtn, { height: 48, justifyContent: 'center' }]}
                      onPress={handleIvrStep1}
                      disabled={ivrLoading}
                    >
                      {ivrLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Dial Number →</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Step 2: Confirm Reg No */}
              {dialStep === 2 && ivrResponse && (
                <View style={styles.dialStepBox}>
                  <Text style={styles.dialStepTitle}>Step 2: IVR Confirmation Prompt</Text>
                  <View style={styles.ivrPromptBox}>
                    <Text style={styles.ivrVoiceSpeaker}>🎙️ IVR Voice Message:</Text>
                    <Text style={styles.ivrVoiceText}>"{ivrResponse.prompt}"</Text>
                    <Text style={styles.ivrStudentBadge}>Student: {ivrResponse.student_name} (Class {ivrResponse.class_name})</Text>
                  </View>

                  <View style={styles.confirmBtnRow}>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: '#1a7f37', flex: 1 }]}
                      onPress={() => handleIvrStep2('1')}
                      disabled={ivrLoading}
                    >
                      {ivrLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Press 1 (Confirm & Check Schedule)</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: '#6e7781', flex: 1 }]}
                      onPress={() => handleIvrStep2('2')}
                      disabled={ivrLoading}
                    >
                      <Text style={styles.primaryBtnText}>Press 2 (Cancel / Re-enter)</Text>
                    </TouchableOpacity>
                  </View>

                  {ivrError && (
                    <View style={{ backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1, padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 16 }}>⚠️</Text>
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 13, flex: 1 }}>{ivrError}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Step 3: Choose Guardian & Connect */}
              {dialStep === 3 && ivrResponse && (
                <View style={styles.dialStepBox}>
                  <Text style={styles.dialStepTitle}>Step 3: Schedule Passed! Select Relation</Text>
                  <View style={styles.ivrSuccessBox}>
                    <Text style={styles.ivrSuccessTitle}>✓ Calling Allowed for {ivrResponse.student_name}</Text>
                    <Text style={styles.ivrSuccessSub}>Allowed Talk Time: {ivrResponse.allowed_talk_time} minutes</Text>
                  </View>

                  {/* Active Call Live Overlay */}
                  {activeCallSession && (
                    <View style={{
                      backgroundColor: '#0f172a',
                      borderRadius: 12,
                      padding: 20,
                      marginVertical: 14,
                      borderWidth: 2,
                      borderColor: activeCallSession.isAnswered ? '#22c55e' : '#f59e0b',
                      alignItems: 'center',
                      gap: 12,
                    }}>
                      {!activeCallSession.isAnswered ? (
                        /* RINGING STATE: No talk time counted while ringing! */
                        <View style={{ alignItems: 'center', gap: 10, width: '100%' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 18 }}>📞</Text>
                            <Text style={{ color: '#fbbf24', fontWeight: '900', fontSize: 16 }}>
                              RINGING... (কল হচ্ছে... রিং বাজছে)
                            </Text>
                          </View>

                          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>
                            {activeCallSession.targetRelation}: {activeCallSession.targetMobile}
                          </Text>
                          <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                            Student: {activeCallSession.studentName}
                          </Text>

                          <View style={{ backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginTop: 4 }}>
                            <Text style={{ color: '#fde68a', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
                              ⏳ অভিভাবক ফোন তুললে তবেই ৮ মিনিটের সময় গণনা শুরু হবে। ফোন না ধরলে কোটা কাটা যাবে না।
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                            <TouchableOpacity
                              onPress={() => {
                                setActiveCallSession(prev => prev ? { ...prev, isAnswered: true } : null);
                                setActiveCallStatus('🟢 অভিভাবক ফোন ধরেছেন, কথা শুরু হয়েছে! ৮-মিনিটের কোটা গণনা শুরু...');
                              }}
                              style={{
                                backgroundColor: '#16a34a',
                                paddingVertical: 12,
                                paddingHorizontal: 22,
                                borderRadius: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                              }}
                            >
                              <Text style={{ fontSize: 18 }}>🟢</Text>
                              <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 14 }}>
                                Start Talking (কথা শুরু হয়েছে)
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => handleEndCall(activeCallSession.callId, 0, 'no_answer')}
                              style={{
                                backgroundColor: '#dc2626',
                                paddingVertical: 12,
                                paddingHorizontal: 20,
                                borderRadius: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                              }}
                            >
                              <Text style={{ fontSize: 18 }}>📵</Text>
                              <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 14 }}>
                                No Answer / ফোন ধরেনি (০ সেকেন্ড)
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        /* IN CONVERSATION STATE: Timer actively counting down */
                        <View style={{ alignItems: 'center', gap: 10, width: '100%' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e' }} />
                            <Text style={{ color: '#22c55e', fontWeight: '900', fontSize: 16 }}>
                              🟢 IN CONVERSATION (কথা চলছে)
                            </Text>
                          </View>

                          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800' }}>
                            {activeCallSession.targetRelation}: {activeCallSession.targetMobile}
                          </Text>
                          <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                            Student: {activeCallSession.studentName}
                          </Text>

                          {/* Countdown Timer */}
                          <View style={{ backgroundColor: '#1e293b', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, marginTop: 4 }}>
                            <Text style={{ color: '#cbd5e1', fontSize: 11, fontWeight: '700', textAlign: 'center', letterSpacing: 1 }}>
                              TALK TIME REMAINING (অবশিষ্ট সময়)
                            </Text>
                            <Text style={{ color: activeCallSession.remainingSeconds <= 60 ? '#ef4444' : '#38bdf8', fontSize: 36, fontWeight: '900', textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                              {formatTimer(activeCallSession.remainingSeconds)}
                            </Text>
                          </View>

                          {activeCallSession.remainingSeconds <= 60 && (
                            <Text style={{ color: '#f87171', fontWeight: '800', fontSize: 12 }}>
                              ⚠️ আর ১ মিনিট বাকি আছে! ৮ মিনিট পূর্ণ হলে কল স্বয়ংক্রিয়ভাবে কেটে যাবে।
                            </Text>
                          )}

                          {/* End Call Button */}
                          <TouchableOpacity
                            onPress={() => handleEndCall(activeCallSession.callId, activeCallSession.elapsedSeconds, 'manual_hangup')}
                            style={{
                              backgroundColor: '#dc2626',
                              paddingVertical: 12,
                              paddingHorizontal: 28,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 6,
                              ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                            }}
                          >
                            <Text style={{ fontSize: 18 }}>🔴</Text>
                            <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 15 }}>
                              Hang Up Call (কথা শেষ / কাটুন)
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  <Text style={{ fontWeight: '700', fontSize: 15, marginVertical: 8, color: '#173f77' }}>
                    Press digit or click button to connect:
                  </Text>

                  <View style={{ gap: 10 }}>
                    {ivrResponse.options?.map((opt: any) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.relationDialCard,
                          (Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                          activeCallSession?.targetMobile === opt.mobile && { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
                        ]}
                        onPress={() => handleIvrStep3(opt.key)}
                        disabled={ivrLoading || !!activeCallSession}
                      >
                        <View style={styles.keyBadge}>
                          <Text style={styles.keyBadgeText}>{opt.key}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.relationCardLabel}>{opt.label} ({opt.name || opt.relation})</Text>
                          <Text style={styles.relationCardMobile}>📞 {opt.mobile}</Text>
                        </View>
                        <View style={{
                          backgroundColor: '#16a34a',
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 6,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}>
                          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>Call Now →</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {ivrError && (
                    <View style={{ backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1, padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <Text style={{ fontSize: 16 }}>⚠️</Text>
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 13, flex: 1 }}>{ivrError}</Text>
                    </View>
                  )}

                  {activeCallStatus && (
                    <View style={styles.activeCallBanner}>
                      <Text style={styles.activeCallBannerText}>{activeCallStatus}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.btnBackOutline, { alignSelf: 'flex-start', marginTop: 16 }]}
                    onPress={() => {
                      setDialStep(1);
                      setActiveCallStatus(null);
                    }}
                  >
                    <Text style={styles.btnBackOutlineText}>← Dial Another Student</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB 4: CALL LOGS & RECORDINGS                             */}
        {/* ========================================================= */}
        {activeTab === 'logs' && (
          <View style={styles.card}>
            {/* Header + Top Date & Export Controls */}
            <View style={[styles.cardHeader, { flexWrap: 'wrap', gap: 12, marginBottom: 10 }]}>
              <View>
                <Text style={styles.cardHeading}>Hostel Call Logs & History</Text>
                <Text style={styles.cardSub}>
                  Showing {filteredCallLogs.length} of {callLogs.length} records
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <DatePickerField
                  label="From Date"
                  value={logsFromDate}
                  onChange={(val) => {
                    setLogsFromDate(val);
                    fetchLogs(val, logsToDate);
                  }}
                  style={{ minWidth: 145, height: 38, marginBottom: 0 }}
                />
                <DatePickerField
                  label="To Date"
                  value={logsToDate}
                  onChange={(val) => {
                    setLogsToDate(val);
                    fetchLogs(logsFromDate, val);
                  }}
                  style={{ minWidth: 145, height: 38, marginBottom: 0 }}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#15803d', height: 38, justifyContent: 'center', opacity: exportingLogs ? 0.6 : 1 }]}
                  onPress={handleExportLogsExcel}
                  disabled={exportingLogs}
                >
                  <Text style={styles.primaryBtnText}>{exportingLogs ? '⏳ Exporting...' : '📥 Excel Download'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { height: 38, justifyContent: 'center' }]}
                  onPress={() => fetchLogs()}
                >
                  <Text style={styles.primaryBtnText}>🔄 Refresh</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Top Search Panel (Above the Table) */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              backgroundColor: '#f8fafc',
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 8,
              padding: 10,
              marginBottom: 14,
            }}>
              <Text style={{ fontSize: 15 }}>🔍</Text>
              <TextInput
                value={logGlobalSearch}
                onChangeText={setLogGlobalSearch}
                placeholder="Search Reg No, Student Name, Relation, Mobile Number, or Status..."
                placeholderTextColor="#94a3b8"
                style={{
                  flex: 1,
                  minWidth: 240,
                  height: 36,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  fontSize: 13.5,
                  color: '#0f172a',
                }}
              />
              {hasActiveLogFilters && (
                <TouchableOpacity
                  style={[styles.btnBackOutline, { height: 36, justifyContent: 'center', paddingHorizontal: 14 }]}
                  onPress={resetAllLogFilters}
                >
                  <Text style={styles.btnBackOutlineText}>✕ Clear All Filters</Text>
                </TouchableOpacity>
              )}
            </View>

            {logsLoading ? (
              <ActivityIndicator size="large" color="#1768c5" style={{ marginVertical: 32 }} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.table}>
                  {/* Table Heading Row with Excel-style Column Dropdowns */}
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, { width: 45 }]}>#</Text>
                    {logColumns.map((col) => {
                      const isFiltered = Boolean(columnFilters[col.key]);
                      const isSorted = columnSort?.key === col.key;
                      const sortArrow = isSorted ? (columnSort?.dir === 'asc' ? ' ↑' : ' ↓') : '';
                      return (
                        <TouchableOpacity
                          key={col.key}
                          onPress={() => openColumnFilter(col.key)}
                          style={[
                            {
                              width: col.width,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingHorizontal: 6,
                              paddingVertical: 4,
                              borderRadius: 4,
                              backgroundColor: isFiltered ? 'rgba(250, 204, 21, 0.16)' : 'transparent',
                            },
                            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.th,
                              { paddingHorizontal: 0, color: isFiltered ? '#fde047' : '#ffffff' }
                            ]}
                          >
                            {col.label}{sortArrow}
                          </Text>
                          <Text style={{ fontSize: 11, color: isFiltered ? '#fde047' : '#94a3b8', marginLeft: 4 }}>
                            {isFiltered ? '⧨' : '▾'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {filteredCallLogs.length === 0 ? (
                    <View style={[styles.emptyBox, { width: 1190 }]}>
                      <Text style={styles.emptyText}>No call history matches the selected date or filters.</Text>
                    </View>
                  ) : (
                    filteredCallLogs.map((log, idx) => (
                      <View key={log.call_sid ? `${log.call_sid}-${idx}` : `log-${log.id || 'x'}-${idx}`} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                        <Text style={[styles.td, { width: 45 }]}>{idx + 1}</Text>
                        <Text style={[styles.td, { width: 85, fontWeight: '700', color: '#173f77' }]}>{log.reg_no || '-'}</Text>
                        <Text style={[styles.td, { width: 145 }]}>{log.student_name || '-'}</Text>
                        <Text style={[styles.td, { width: 105, fontWeight: '600' }]}>{log.called_relation || 'Manual'}</Text>
                        <Text style={[styles.td, { width: 120 }]}>{log.to_number}</Text>
                        <View style={{ width: 105 }}>
                          <Text style={[
                            styles.badgeText,
                            log.status === 'completed' ? styles.badgeTextActive : styles.badgeTextInactive,
                            { fontWeight: '700' }
                          ]}>
                            {log.status === 'completed' ? '✓ Completed' : log.status === 'no_answer' ? '✕ No Answer' : log.status}
                          </Text>
                        </View>
                        <Text style={[styles.td, { width: 165, fontSize: 12, color: '#334155' }]}>
                          {formatStartDateTime(log.started_at || log.created_at)}
                        </Text>
                        <Text style={[styles.td, { width: 115, fontSize: 12, color: '#475569' }]}>
                          {formatEndTime(log.started_at || log.created_at, log.ended_at, log.duration)}
                        </Text>
                        <Text style={[styles.td, { width: 100, fontWeight: '800', color: (log.duration && log.duration > 0) ? '#16a34a' : '#64748b' }]}>
                          {formatDurationDisplay(log.duration, log.status)}
                        </Text>
                        <Text style={[styles.td, { width: 100, color: '#0969da' }]}>
                          {log.allowed_talk_time ? `${log.allowed_talk_time} min` : '8 min'}
                        </Text>
                        <View style={{ width: 105 }}>
                          {log.recording_url ? (
                            <TouchableOpacity
                              onPress={() => handleOpenRecording(log)}
                              style={{
                                backgroundColor: '#eff6ff',
                                borderColor: '#93c5fd',
                                borderWidth: 1,
                                borderRadius: 6,
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>▶ Listen</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={{ fontSize: 12, color: '#999' }}>None</Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* MODAL: EXCEL-STYLE COLUMN FILTER & SORT DROPDOWN          */}
        {/* ========================================================= */}
        <Modal
          visible={activeFilterCol !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveFilterCol(null)}
        >
          <Pressable
            style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}
            onPress={() => setActiveFilterCol(null)}
          >
            <Pressable
              style={[styles.modalContent, { width: 340, maxWidth: '92%', padding: 0, overflow: 'hidden' }]}
              onPress={(e) => e.stopPropagation()}
            >
              {(() => {
                const colObj = logColumns.find((c) => c.key === activeFilterCol);
                if (!colObj) return null;
                const allValues = getUniqueValuesForCol(colObj.key);
                const visibleValues = allValues.filter((v) =>
                  v.toLowerCase().includes(colDropdownSearch.trim().toLowerCase())
                );
                const allSelected = visibleValues.length > 0 && visibleValues.every((v) => draftSelectedValues.includes(v));

                return (
                  <View>
                    {/* Dropdown Title */}
                    <View style={[styles.modalHeader, { backgroundColor: '#0f172a', paddingVertical: 12, paddingHorizontal: 16 }]}>
                      <Text style={[styles.modalTitle, { color: '#ffffff', fontSize: 14.5 }]}>
                        ⧨ Filter: {colObj.label}
                      </Text>
                      <TouchableOpacity onPress={() => setActiveFilterCol(null)}>
                        <Text style={[styles.modalCloseText, { color: '#cbd5e1' }]}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ padding: 14 }}>
                      {/* Sort Options */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setColumnSort({ key: colObj.key, dir: 'asc' });
                            setActiveFilterCol(null);
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 7,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: (columnSort?.key === colObj.key && columnSort.dir === 'asc') ? '#1768c5' : '#cbd5e1',
                            backgroundColor: (columnSort?.key === colObj.key && columnSort.dir === 'asc') ? '#eff6ff' : '#f8fafc',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e293b' }}>↑ Sort A → Z</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setColumnSort({ key: colObj.key, dir: 'desc' });
                            setActiveFilterCol(null);
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 7,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: (columnSort?.key === colObj.key && columnSort.dir === 'desc') ? '#1768c5' : '#cbd5e1',
                            backgroundColor: (columnSort?.key === colObj.key && columnSort.dir === 'desc') ? '#eff6ff' : '#f8fafc',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e293b' }}>↓ Sort Z → A</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Value Search Box */}
                      <TextInput
                        value={colDropdownSearch}
                        onChangeText={setColDropdownSearch}
                        placeholder={`Search ${colObj.label}...`}
                        placeholderTextColor="#94a3b8"
                        style={{
                          height: 34,
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          fontSize: 13,
                          marginBottom: 8,
                          color: '#0f172a',
                        }}
                      />

                      {/* Select All Toggle */}
                      <TouchableOpacity
                        onPress={() => {
                          if (allSelected) {
                            setDraftSelectedValues((prev) => prev.filter((v) => !visibleValues.includes(v)));
                          } else {
                            setDraftSelectedValues((prev) => Array.from(new Set([...prev, ...visibleValues])));
                          }
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 7,
                          paddingHorizontal: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: '#e2e8f0',
                        }}
                      >
                        <Text style={{ fontSize: 14, marginRight: 8 }}>{allSelected ? '☑️' : '⬜'}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>(Select All)</Text>
                      </TouchableOpacity>

                      {/* Checkbox Value List */}
                      <ScrollView style={{ maxHeight: 220, marginVertical: 4 }}>
                        {visibleValues.map((val) => {
                          const checked = draftSelectedValues.includes(val);
                          return (
                            <TouchableOpacity
                              key={val}
                              onPress={() => {
                                setDraftSelectedValues((prev) =>
                                  prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
                                );
                              }}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 6,
                                paddingHorizontal: 6,
                                borderRadius: 4,
                                backgroundColor: checked ? '#f8fafc' : 'transparent',
                              }}
                            >
                              <Text style={{ fontSize: 14, marginRight: 8 }}>{checked ? '☑️' : '⬜'}</Text>
                              <Text numberOfLines={1} style={{ fontSize: 13, color: '#334155', flex: 1 }}>
                                {val}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Footer Buttons */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setColumnFilters((prev) => {
                              const next = { ...prev };
                              delete next[colObj.key];
                              return next;
                            });
                            if (columnSort?.key === colObj.key) setColumnSort(null);
                            setActiveFilterCol(null);
                          }}
                          style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' }}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#dc2626' }}>Clear Filter</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => setActiveFilterCol(null)}
                            style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' }}
                          >
                            <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#475569' }}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              setColumnFilters((prev) => {
                                const next = { ...prev };
                                if (draftSelectedValues.length === allValues.length) {
                                  delete next[colObj.key];
                                } else {
                                  next[colObj.key] = draftSelectedValues;
                                }
                                return next;
                              });
                              setActiveFilterCol(null);
                            }}
                            style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 6, backgroundColor: '#1768c5' }}
                          >
                            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#ffffff' }}>OK / Apply</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ========================================================= */}
        {/* MODAL: CALL RECORDING AUDIO PLAYER                        */}
        {/* ========================================================= */}
        <Modal
          visible={playingRecording !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPlayingRecording(null)}
        >
          <Pressable
            style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}
            onPress={() => setPlayingRecording(null)}
          >
            <Pressable
              style={[styles.modalContent, { width: 420, maxWidth: '94%', padding: 0, overflow: 'hidden' }]}
              onPress={(e) => e.stopPropagation()}
            >
              {playingRecording && (
                <View>
                  <View style={[styles.modalHeader, { backgroundColor: '#0f172a', paddingVertical: 12, paddingHorizontal: 16 }]}>
                    <Text style={[styles.modalTitle, { color: '#ffffff', fontSize: 15 }]}>
                      🎙️ Call Recording Player
                    </Text>
                    <TouchableOpacity onPress={() => setPlayingRecording(null)}>
                      <Text style={[styles.modalCloseText, { color: '#cbd5e1' }]}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ padding: 18 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 4 }}>
                      {playingRecording.title}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: '#475569', marginBottom: 14 }}>
                      {playingRecording.subtitle}
                    </Text>

                    {Platform.OS === 'web' && React.createElement('audio', {
                      controls: true,
                      autoPlay: true,
                      src: playingRecording.url,
                      style: { width: '100%', marginBottom: 14 },
                    })}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS === 'web') window.open(playingRecording.downloadUrl, '_blank');
                        }}
                        style={[styles.primaryBtn, { backgroundColor: '#15803d', flex: 1, alignItems: 'center' }]}
                      >
                        <Text style={styles.primaryBtnText}>📥 Download (.wav)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setPlayingRecording(null)}
                        style={[styles.btnBackOutline, { paddingHorizontal: 18 }]}
                      >
                        <Text style={styles.btnBackOutlineText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ========================================================= */}
        {/* MODAL: ADD / EDIT CALLING SCHEDULE FORM                   */}
        {/* ========================================================= */}
        <Modal visible={showScheduleModal} transparent animationType="fade" onRequestClose={() => setShowScheduleModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingScheduleId ? 'Edit Calling Schedule' : 'Schedule Form (Add Schedule)'}
                </Text>
                <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 18, maxHeight: 520 }}>
                <Text style={styles.fieldLabel}>Branch:</Text>
                <TextInput style={styles.textInput} value={formBranch} onChangeText={setFormBranch} />

                <View style={styles.formRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Session:</Text>
                    <TextInput style={styles.textInput} value={formSession} onChangeText={setFormSession} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Section:</Text>
                    <TextInput style={styles.textInput} value={formSection} onChangeText={setFormSection} />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Class:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                      {STUDENT_CLASSES.map(c => (
                        <TouchableOpacity
                          key={c}
                          style={[styles.chip, formClass === c && styles.activeChip]}
                          onPress={() => setFormClass(c)}
                        >
                          <Text style={[styles.chipText, formClass === c && styles.activeChipText]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <View style={{ width: 120 }}>
                    <Text style={styles.fieldLabel}>Gender:</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {['Female', 'Male'].map(g => (
                        <TouchableOpacity
                          key={g}
                          style={[styles.chip, formGender === g && styles.activeChip]}
                          onPress={() => setFormGender(g)}
                        >
                          <Text style={[styles.chipText, formGender === g && styles.activeChipText]}>{g}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Allowed Talk Time (Minutes):</Text>
                <TextInput
                  style={styles.textInput}
                  value={formTalkTime}
                  onChangeText={setFormTalkTime}
                  keyboardType="numeric"
                  placeholder="e.g. 8"
                />

                <Text style={styles.fieldLabel}>Allowed Days of Week:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 }}>
                  {ALL_DAYS.map(day => {
                    const selected = formDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.dayCheckbox, selected && styles.dayCheckboxSelected]}
                        onPress={() => handleToggleDay(day)}
                      >
                        <Text style={[styles.dayCheckboxText, selected && styles.dayCheckboxTextSelected]}>
                          {selected ? '☑ ' : '☐ '} {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.formRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Start Time (HH:MM):</Text>
                    <TextInput style={styles.textInput} value={formStartTime} onChangeText={setFormStartTime} placeholder="04:00" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>End Time (HH:MM):</Text>
                    <TextInput style={styles.textInput} value={formEndTime} onChangeText={setFormEndTime} placeholder="23:55" />
                  </View>
                </View>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={styles.btnCancel} onPress={() => setShowScheduleModal(false)}>
                    <Text style={styles.btnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveSchedule}>
                    <Text style={styles.primaryBtnText}>Save Schedule</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ========================================================= */}
        {/* MODAL: EDIT MOBILE NO & RELATION                          */}
        {/* ========================================================= */}
        <Modal visible={showContactsModal} transparent animationType="fade" onRequestClose={() => setShowContactsModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxWidth: 540 }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Edit Mobile No & Relation</Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    Student: {targetStudent?.student_name} (Reg No: {targetStudent?.registration_no})
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowContactsModal(false)}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 18, maxHeight: 520 }}>
                {/* 1. Father */}
                <View style={styles.contactEditRow}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.fieldLabel}>Father Mobile (Key 1):</Text>
                    <TextInput
                      style={styles.textInput}
                      value={fatherMobile}
                      onChangeText={setFatherMobile}
                      placeholder="e.g. 9434454908"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ width: 140 }}>
                    <Text style={styles.fieldLabel}>Relation:</Text>
                    <View style={styles.fixedRelationBox}><Text style={styles.fixedRelationText}>Father</Text></View>
                  </View>
                </View>

                {/* 2. Mother */}
                <View style={styles.contactEditRow}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.fieldLabel}>Mother Mobile (Key 2):</Text>
                    <TextInput
                      style={styles.textInput}
                      value={motherMobile}
                      onChangeText={setMotherMobile}
                      placeholder="e.g. 9732300744"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ width: 140 }}>
                    <Text style={styles.fieldLabel}>Relation:</Text>
                    <View style={styles.fixedRelationBox}><Text style={styles.fixedRelationText}>Mother</Text></View>
                  </View>
                </View>

                {/* 3. Guardian 1 */}
                <View style={styles.contactEditRow}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.fieldLabel}>Guardian 1 Mobile (Key 3):</Text>
                    <TextInput
                      style={styles.textInput}
                      value={guardian1Mobile}
                      onChangeText={setGuardian1Mobile}
                      placeholder="Optional"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ width: 140 }}>
                    <Text style={styles.fieldLabel}>Relation:</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{
                          height: 38,
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          padding: '0 8px',
                          fontSize: 12.5,
                          backgroundColor: '#fff',
                          color: '#1e293b',
                          fontWeight: '600',
                          width: '100%',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                        value={guardian1Relation}
                        onChange={(e: any) => setGuardian1Relation(e.target.value)}
                      >
                        <option value="">Select Relation</option>
                        {RELATIONS_LIST.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {guardian1Relation && !RELATIONS_LIST.includes(guardian1Relation) && (
                          <option value={guardian1Relation}>{guardian1Relation}</option>
                        )}
                      </select>
                    ) : (
                      <TextInput
                        style={styles.textInput}
                        value={guardian1Relation}
                        onChangeText={setGuardian1Relation}
                        placeholder="Select Relation"
                      />
                    )}
                  </View>
                </View>

                {/* 4. Guardian 2 */}
                <View style={styles.contactEditRow}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.fieldLabel}>Guardian 2 Mobile (Key 4):</Text>
                    <TextInput
                      style={styles.textInput}
                      value={guardian2Mobile}
                      onChangeText={setGuardian2Mobile}
                      placeholder="Optional"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ width: 140 }}>
                    <Text style={styles.fieldLabel}>Relation:</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{
                          height: 38,
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          padding: '0 8px',
                          fontSize: 12.5,
                          backgroundColor: '#fff',
                          color: '#1e293b',
                          fontWeight: '600',
                          width: '100%',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                        value={guardian2Relation}
                        onChange={(e: any) => setGuardian2Relation(e.target.value)}
                      >
                        <option value="">Select Relation</option>
                        {RELATIONS_LIST.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {guardian2Relation && !RELATIONS_LIST.includes(guardian2Relation) && (
                          <option value={guardian2Relation}>{guardian2Relation}</option>
                        )}
                      </select>
                    ) : (
                      <TextInput
                        style={styles.textInput}
                        value={guardian2Relation}
                        onChangeText={setGuardian2Relation}
                        placeholder="Select Relation"
                      />
                    )}
                  </View>
                </View>

                {/* 5. Guardian 3 */}
                <View style={styles.contactEditRow}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.fieldLabel}>Guardian 3 Mobile (Key 5):</Text>
                    <TextInput
                      style={styles.textInput}
                      value={guardian3Mobile}
                      onChangeText={setGuardian3Mobile}
                      placeholder="Optional"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ width: 140 }}>
                    <Text style={styles.fieldLabel}>Relation:</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{
                          height: 38,
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          padding: '0 8px',
                          fontSize: 12.5,
                          backgroundColor: '#fff',
                          color: '#1e293b',
                          fontWeight: '600',
                          width: '100%',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                        value={guardian3Relation}
                        onChange={(e: any) => setGuardian3Relation(e.target.value)}
                      >
                        <option value="">Select Relation</option>
                        {RELATIONS_LIST.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {guardian3Relation && !RELATIONS_LIST.includes(guardian3Relation) && (
                          <option value={guardian3Relation}>{guardian3Relation}</option>
                        )}
                      </select>
                    ) : (
                      <TextInput
                        style={styles.textInput}
                        value={guardian3Relation}
                        onChangeText={setGuardian3Relation}
                        placeholder="Select Relation"
                      />
                    )}
                  </View>
                </View>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={styles.btnCancel} onPress={() => setShowContactsModal(false)}>
                    <Text style={styles.btnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveContacts} disabled={savingContacts}>
                    {savingContacts ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save Details</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

      </ScrollView>
      <ScrollNavigationButtons scrollRef={scrollRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f4f9' },
  container: { padding: 16, gap: 14 },
  topNav: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d5e0ec',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  backBtn: { backgroundColor: '#e0ebf6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  backBtnText: { color: '#173f77', fontWeight: '700' },
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#173f77' },
  navTabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#f1f5f9' },
  activeTabBtn: { backgroundColor: '#1768c5' },
  tabBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  activeTabText: { color: '#fff' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d5e0ec',
    padding: 16,
    gap: 14
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f7',
    paddingBottom: 12
  },
  cardHeading: { fontSize: 18, fontWeight: '800', color: '#173f77' },
  cardSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  primaryBtn: {
    backgroundColor: '#1768c5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 7,
    alignItems: 'center'
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  filterItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  chipScroll: { flexDirection: 'row' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    marginRight: 6
  },
  activeChip: { backgroundColor: '#1768c5' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  activeChipText: { color: '#fff' },

  table: { minWidth: 1125 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#11101e',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  th: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f7'
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  td: { fontSize: 13, color: '#334155' },
  tdActions: { flexDirection: 'row', gap: 4 },
  btnSmallView: { backgroundColor: '#0969da', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4 },
  btnSmallViewText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  btnSmallEdit: { backgroundColor: '#1f883d', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4 },
  btnSmallEditText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  btnSmallDel: { backgroundColor: '#cf222e', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4 },
  btnSmallDelText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  badgeStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignItems: 'center' },
  badgeActive: { backgroundColor: '#dafbe1' },
  badgeInactive: { backgroundColor: '#f1f5f9' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextActive: { color: '#1a7f37' },
  badgeTextInactive: { color: '#64748b' },

  emptyBox: { alignItems: 'center', padding: 32 },
  emptyText: { color: '#64748b', fontSize: 14 },

  // Details
  detailsHeaderBox: {
    backgroundColor: '#f1f5f9',
    padding: 14,
    borderRadius: 8,
    gap: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#1768c5'
  },
  btnBackOutline: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  btnBackOutlineText: { color: '#173f77', fontWeight: '700', fontSize: 12 },
  detailsHeading: { fontSize: 16, fontWeight: '800', color: '#173f77' },
  detailsSubText: { fontSize: 12, color: '#475569', marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13
  },
  searchCount: { fontWeight: '700', color: '#64748b', fontSize: 13 },
  contactItemText: { fontSize: 12, color: '#1e293b' },
  contactRowBadge: { flexDirection: 'row', alignItems: 'center' },
  dialKeyBadge: {
    backgroundColor: '#0969da',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 6
  },
  dialKeyText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  btnSmallEditNumbers: {
    backgroundColor: '#e0ebf6',
    borderWidth: 1,
    borderColor: '#bad4ed',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5
  },
  btnSmallEditNumbersText: { color: '#173f77', fontSize: 11, fontWeight: '700' },

  // Dialer
  dialerContainer: { padding: 16, backgroundColor: '#f8fafc', borderRadius: 8, gap: 16 },
  dialStepBox: { backgroundColor: '#fff', padding: 20, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 },
  dialStepTitle: { fontSize: 16, fontWeight: '800', color: '#173f77' },
  dialStepDesc: { fontSize: 13, color: '#64748b' },
  dialInputGroup: { flexDirection: 'row', gap: 10, marginTop: 8 },
  keypadInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#1768c5',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '800',
    color: '#173f77'
  },
  ivrPromptBox: {
    backgroundColor: '#e0ebf6',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0969da',
    gap: 6
  },
  ivrVoiceSpeaker: { fontSize: 12, fontWeight: '800', color: '#0969da' },
  ivrVoiceText: { fontSize: 15, fontWeight: '600', color: '#173f77', fontStyle: 'italic' },
  ivrStudentBadge: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 4 },
  confirmBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  ivrSuccessBox: {
    backgroundColor: '#dafbe1',
    padding: 14,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1a7f37'
  },
  ivrSuccessTitle: { fontWeight: '800', fontSize: 15, color: '#1a7f37' },
  ivrSuccessSub: { fontSize: 12, color: '#1e293b', marginTop: 2 },
  relationDialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 12
  },
  keyBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1768c5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  keyBadgeText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  relationCardLabel: { fontSize: 15, fontWeight: '700', color: '#173f77' },
  relationCardMobile: { fontSize: 13, color: '#475569' },
  dialCallNowText: { color: '#0969da', fontWeight: '800', fontSize: 13 },
  activeCallBanner: {
    backgroundColor: '#11101e',
    padding: 14,
    borderRadius: 8,
    marginTop: 10
  },
  activeCallBannerText: { color: '#4ade80', fontWeight: '700', fontSize: 13, textAlign: 'center' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    overflow: 'hidden'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#173f77',
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalCloseText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 10, marginBottom: 4 },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#fff'
  },
  formRow: { flexDirection: 'row', gap: 12 },
  dayCheckbox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc'
  },
  dayCheckboxSelected: { backgroundColor: '#e0ebf6', borderColor: '#1768c5' },
  dayCheckboxText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  dayCheckboxTextSelected: { color: '#173f77', fontWeight: '800' },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
    paddingBottom: 10
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#e2e8f0'
  },
  btnCancelText: { color: '#334155', fontWeight: '700' },

  contactEditRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  fixedRelationBox: {
    height: 38,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  fixedRelationText: { fontWeight: '700', color: '#334155', fontSize: 12 },
  relationChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    marginRight: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  relationChipActive: { backgroundColor: '#1768c5', borderColor: '#1768c5' },
  relationChipText: { fontSize: 11, color: '#334155' },
  relationChipTextActive: { color: '#fff', fontWeight: '700' }
});

