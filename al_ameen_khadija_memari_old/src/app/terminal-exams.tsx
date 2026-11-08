import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { Field } from '../components/ui';
import { Select } from '../components/StudentDirectory';
import { api, API_BASE } from '../lib/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { SUBJECTS, SUBJECT_OPTIONS } from '../lib/subjects';
import DatePickerField from '../components/DatePickerField';
import { getToken, getUser } from '../lib/auth';
import { STUDENT_CLASSES } from '../lib/studentClasses';
import { confirmAction, successMessage } from '../lib/confirm';

const blank = { subject_name: '', theory_marks: '', mcq_marks: '', oral_marks: '', exam_date: '', teacher_id: '' };
const TERMINAL_SUBJECTS = SUBJECT_OPTIONS;
const SESSION_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i;
  return [`${y}-${y}`, `${y}-${y + 1}`];
}).flat();

export default function TerminalExams() {
  const [admin, setAdmin] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    exam_name: 'Terminal Exam',
    class_name: '',
    session_name: '2026',
    subjects: [{ ...blank }]
  });
  const [uploadingExcel, setUploadingExcel] = useState<number | null>(null);

  const downloadMasterExcel = async (examId: number, examName?: string, className?: string) => {
    try {
      setDownloadingExcel(examId);
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/terminal-exams/${examId}/master-excel`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Excel download failed');
      }
      const blob = await res.blob();
      const cleanExam = (examName || 'exam').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanClass = (className || 'class').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `terminal-master-${cleanExam}-${cleanClass}.xlsx`;

      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const fileUri = `${(FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || ''}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: (FileSystem as any).EncodingType?.Base64 || 'base64' });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              dialogTitle: 'Download All Subjects Excel'
            });
          } else {
            Alert.alert('Excel Downloaded', `File saved to ${fileUri}`);
          }
        };
        reader.readAsDataURL(blob);
      }
    } catch (e: any) {
      Alert.alert('Download Error', e.message || 'Failed to download Excel');
    } finally {
      setDownloadingExcel(null);
    }
  };

  const uploadMasterExcel = async (examId: number) => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream',
          '.xlsx'
        ],
        copyToCacheDirectory: true
      });

      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];

      setUploadingExcel(examId);

      const token = await getToken();
      const fd = new FormData();
      if (Platform.OS === 'web' && (asset as any).file) {
        fd.append('file', (asset as any).file);
      } else {
        fd.append('file', {
          uri: asset.uri,
          name: asset.name || 'marks.xlsx',
          type: asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        } as any);
      }

      const res = await fetch(`${API_BASE}/api/terminal-exams/${examId}/upload-excel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to upload Excel');
      }

      Alert.alert('Excel Upload Successful', data.message || 'Marks updated successfully.');
      await load();
    } catch (e: any) {
      Alert.alert('Upload Error', e.message || 'Could not upload Excel file.');
    } finally {
      setUploadingExcel(null);
    }
  };

  const [downloadingExcel, setDownloadingExcel] = useState<number | null>(null);

  const downloadSubjectExcel = async (subjectId: number, subjectName?: string, examName?: string) => {
    try {
      setDownloadingExcel(subjectId);
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/terminal-exams/subjects/${subjectId}/excel`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Excel download failed');
      }
      const blob = await res.blob();
      const cleanSubject = (subjectName || 'subject').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanExam = (examName || 'exam').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `terminal-marks-${cleanExam}-${cleanSubject}.xlsx`;

      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const fileUri = `${(FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || ''}${fileName}`;
          await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: (FileSystem as any).EncodingType?.Base64 || 'base64' });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              dialogTitle: 'Download Subject Excel'
            });
          } else {
            Alert.alert('Excel Downloaded', `File saved to ${fileUri}`);
          }
        };
        reader.readAsDataURL(blob);
      }
    } catch (e: any) {
      Alert.alert('Download Error', e.message || 'Failed to download Excel');
    } finally {
      setDownloadingExcel(null);
    }
  };

  const [entry, setEntry] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [markErrors, setMarkErrors] = useState<Record<number, string>>({});
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [submittingMode, setSubmittingMode] = useState<'draft' | 'final' | null>(null);
  const [entrySearch, setEntrySearch] = useState('');
  const [entryFilter, setEntryFilter] = useState<'all' | 'completed' | 'pending' | 'absent'>('all');
  const [entrySortColumn, setEntrySortColumn] = useState<'sl' | 'rank' | 'reg' | 'name' | 'marks' | null>('sl');
  const [entrySortDirection, setEntrySortDirection] = useState<'asc' | 'desc'>('asc');
  const [entryActiveHeaderMenu, setEntryActiveHeaderMenu] = useState<'sl' | 'rank' | 'reg' | 'name' | 'marks' | 'absent' | null>(null);

  // Class-wise & Exam-wise Filter & Accordion states
  const [statusTab, setStatusTab] = useState<'all' | 'ongoing' | 'published'>('all');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [examNameFilter, setExamNameFilter] = useState<string>('ALL');
  const [expandedExams, setExpandedExams] = useState<Record<number, boolean>>({});

  const load = async () => {
    const u = await getUser<any>();
    const manage = ['admin', 'super_admin'].includes(u?.role);
    setAdmin(manage);
    const calls: any[] = [api('/api/terminal-exams')];
    if (manage) calls.push(api('/api/teachers'));
    const data = await Promise.all(calls);
    setExams(data[0].exams || []);
    if (manage) setTeachers(data[1].teachers || []);
  };

  useEffect(() => {
    void load().catch(e => Alert.alert('Error', e.message));
  }, []);

  const set = (k: string, v: any) => setForm((x: any) => ({ ...x, [k]: v }));
  const subject = (i: number, k: string, v: string) =>
    setForm((x: any) => ({
      ...x,
      subjects: x.subjects.map((a: any, n: number) => (n === i ? { ...a, [k]: v } : a))
    }));

  const create = async () => {
    if (!(await confirmAction('Create terminal exam', 'Create this exam and assign the selected teachers?'))) return;
    try {
      await api('/api/terminal-exams', { method: 'POST', body: JSON.stringify(form) });
      setForm({ exam_name: 'Terminal Exam', class_name: '', session_name: '2026', subjects: [{ ...blank }] });
      await load();
      Alert.alert('Created', 'Exam and teacher assignments created.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const open = async (id: number) => {
    try {
      const d = await api(`/api/terminal-exams/subjects/${id}/entry`);
      setEntry(d.assignment);
      setMarkErrors({});
      setEntrySearch('');
      setEntryFilter('all');
      setStudents(
        (d.students || []).map((x: any) => ({
          ...x,
          written: x.written_marks === null || x.written_marks === undefined ? '' : String(x.written_marks),
          mcq: x.mcq_obtained === null || x.mcq_obtained === undefined ? '' : String(x.mcq_obtained),
          oral: x.oral_obtained === null || x.oral_obtained === undefined ? '' : String(x.oral_obtained),
          mark: x.obtained_marks === null || x.obtained_marks === undefined ? '' : String(x.obtained_marks),
          absent: x.obtained_marks === null && x.remarks === 'Absent'
        }))
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const submit = async (submit_mode: 'draft' | 'final') => {
    if (submittingMode !== null) return;
    if (
      !(await confirmAction(
        submit_mode === 'draft' ? 'Save draft' : 'Final submit',
        submit_mode === 'draft' ? 'Save these marks as a draft?' : 'Submit and lock these marks?'
      ))
    )
      return;
    const errors: Record<number, string> = {};
    students.forEach(x => {
      if (x.absent) return;
      const w = x.written === '' ? null : Number(x.written);
      const m = x.mcq === '' ? null : Number(x.mcq);
      const o = x.oral === '' ? null : Number(x.oral);
      if (submit_mode === 'final' && w === null && m === null && o === null)
        errors[x.student_id] = 'Enter marks';
      else if (w !== null && w > Number(entry.theory_marks))
        errors[x.student_id] = `Written marks cannot exceed ${entry.theory_marks}`;
      else if (m !== null && m > Number(entry.mcq_marks || 0))
        errors[x.student_id] = `MCQ marks cannot exceed ${entry.mcq_marks}`;
      else if (o !== null && o > Number(entry.oral_marks))
        errors[x.student_id] = `Oral marks cannot exceed ${entry.oral_marks}`;
      else if ((Number(w) || 0) + (Number(m) || 0) + (Number(o) || 0) > Number(entry.full_marks))
        errors[x.student_id] = `Total cannot exceed ${entry.full_marks}`;
    });
    setMarkErrors(errors);
    if (Object.keys(errors).length) {
      setSubmittingMode(null);
      Alert.alert('Check marks', String(Object.keys(errors).length) + ' student mark(s) need correction.');
      return;
    }
    setSubmittingMode(submit_mode);
    try {
      await api(`/api/terminal-exams/subjects/${entry.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          submit_mode,
          entries: students.map(x => ({
            student_id: x.student_id,
            absent: !!x.absent,
            written_marks: x.absent ? null : x.written === '' ? null : Number(x.written),
            mcq_obtained: x.absent ? null : x.mcq === '' ? null : Number(x.mcq),
            oral_obtained: x.absent ? null : x.oral === '' ? null : Number(x.oral)
          }))
        })
      });
      setEntry(null);
      setStudents([]);
      await load();
      successMessage('Submitted', submit_mode === 'draft' ? 'Draft saved.' : 'Marks submitted and locked.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingMode(null);
    }
  };

  const publish = async (id: number) => {
    if (publishingId !== null) return;
    if (!(await confirmAction('Publish result', 'Publish this complete terminal result to guardians?'))) return;
    setPublishingId(id);
    try {
      await api('/api/terminal-exams/' + id + '/publish', { method: 'PATCH' });
      await load();
      successMessage('Published', 'Complete terminal result published.');
    } catch (e: any) {
      Alert.alert('Cannot publish', e.message);
    } finally {
      setPublishingId(null);
    }
  };

  const unpublish = async (id: number) => {
    if (!(await confirmAction('Unpublish result', 'Reopen this published result for correction?'))) return;
    try {
      await api(`/api/terminal-exams/${id}/unpublish`, { method: 'PATCH' });
      await load();
      successMessage('Unpublished', 'Result reopened for Admin correction.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const removeExam = async (id: number) => {
    if (!(await confirmAction('Delete terminal exam', 'Delete this test exam, its subject assignments and entered marks?')))
      return;
    try {
      await api(`/api/terminal-exams/${id}`, { method: 'DELETE' });
      await load();
      successMessage('Deleted', 'Terminal exam deleted.');
    } catch (e: any) {
      Alert.alert('Cannot delete', e.message);
    }
  };

  // Extract distinct classes and exam names for menu filters
  const { distinctClasses, distinctExamNames, publishedCount, ongoingCount } = useMemo(() => {
    const classSet = new Set<string>();
    const nameSet = new Set<string>();
    let pubCount = 0;
    let onCount = 0;

    exams.forEach(e => {
      if (e.class_name) classSet.add(e.class_name);
      if (e.exam_name) nameSet.add(e.exam_name);
      if (e.status === 'published') pubCount++;
      else onCount++;
    });

    const sortedClasses = Array.from(classSet).sort((a, b) => {
      const idxA = STUDENT_CLASSES.indexOf(a);
      const idxB = STUDENT_CLASSES.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

    const sortedNames = Array.from(nameSet).sort();

    return {
      distinctClasses: sortedClasses,
      distinctExamNames: sortedNames,
      publishedCount: pubCount,
      ongoingCount: onCount
    };
  }, [exams]);

  // Compute rank for each student based on total marks (written + MCQ + oral)
  const rankMap = useMemo(() => {
    // Calculate total marks for each student
    const totals = students.map(s => ({
      id: s.student_id,
      total: Number(s.written || 0) + Number(s.mcq || 0) + Number(s.oral || 0)
    }));
    // Sort descending by total marks
    totals.sort((a, b) => b.total - a.total);
    const map: Record<number, number> = {};
    let rank = 1;
    for (let i = 0; i < totals.length; i++) {
      if (i > 0 && totals[i].total < totals[i - 1].total) {
        rank = i + 1; // increment rank when score drops (handles ties)
      }
      map[totals[i].id] = rank;
    }
    return map;
  }, [students]);

  const entryCompletedCount = useMemo(() => {
    return students.filter(s => s.absent || (s.written !== '' || s.mcq !== '' || s.oral !== '')).length;
  }, [students]);
  const entryAbsentCount = useMemo(() => {
    return students.filter(s => s.absent).length;
  }, [students]);
  const entryPendingCount = useMemo(() => {
    return students.filter(s => !s.absent && s.written === '' && s.mcq === '' && s.oral === '').length;
  }, [students]);

  const toggleEntrySort = (col: 'sl' | 'rank' | 'reg' | 'name' | 'marks') => {
    if (entrySortColumn === col) {
      setEntrySortDirection(curr => (curr === 'asc' ? 'desc' : 'asc'));
    } else {
      setEntrySortColumn(col);
      setEntrySortDirection(col === 'marks' ? 'desc' : 'asc');
    }
  };

  const resetEntryFilters = () => {
    setEntrySortColumn('sl');
    setEntrySortDirection('asc');
    setEntryFilter('all');
    setEntrySearch('');
    setEntryActiveHeaderMenu(null);
  };

  const filteredEntryStudents = useMemo(() => {
    const list = students.map((s, idx) => ({ ...s, originalIndex: idx })).filter(s => {
      const isCompleted = s.absent || (s.written !== '' || s.mcq !== '' || s.oral !== '');
      if (entryFilter === 'completed' && !isCompleted) return false;
      if (entryFilter === 'pending' && isCompleted) return false;
      if (entryFilter === 'absent' && !s.absent) return false;
      if (entrySearch.trim()) {
        const q = entrySearch.trim().toLowerCase();
        const mName = String(s.student_name || '').toLowerCase().includes(q);
        const mReg = String(s.registration_no || '').toLowerCase().includes(q);
        if (!mName && !mReg) return false;
      }
      return true;
    });

    if (!entrySortColumn) return list;

    return list.slice().sort((a, b) => {
      if (entrySortColumn === 'sl') {
        return entrySortDirection === 'asc' ? a.originalIndex - b.originalIndex : b.originalIndex - a.originalIndex;
      }
      if (entrySortColumn === 'rank') {
        const rA = rankMap[a.student_id] ?? 999999;
        const rB = rankMap[b.student_id] ?? 999999;
        return entrySortDirection === 'asc' ? rA - rB : rB - rA;
      }
      if (entrySortColumn === 'reg') {
        const numA = Number(a.registration_no) || 0;
        const numB = Number(b.registration_no) || 0;
        if (numA !== numB) {
          return entrySortDirection === 'asc' ? numA - numB : numB - numA;
        }
        return entrySortDirection === 'asc'
          ? String(a.registration_no).localeCompare(String(b.registration_no))
          : String(b.registration_no).localeCompare(String(a.registration_no));
      }
      if (entrySortColumn === 'name') {
        const comp = String(a.student_name || '').localeCompare(String(b.student_name || ''));
        return entrySortDirection === 'asc' ? comp : -comp;
      }
      if (entrySortColumn === 'marks') {
        if (a.absent && !b.absent) return 1;
        if (!a.absent && b.absent) return -1;
        if (a.absent && b.absent) return 0;
        const totA = (Number(a.written) || 0) + (Number(a.mcq) || 0) + (Number(a.oral) || 0);
        const totB = (Number(b.written) || 0) + (Number(b.mcq) || 0) + (Number(b.oral) || 0);
        return entrySortDirection === 'asc' ? totA - totB : totB - totA;
      }
      return 0;
    });
  }, [students, entryFilter, entrySearch, entrySortColumn, entrySortDirection, rankMap]);

  // Filtered exams according to active status tab, class, and exam name
  const filteredExams = useMemo(() => {
    return exams.filter(e => {
      if (statusTab === 'published' && e.status !== 'published') return false;
      if (statusTab === 'ongoing' && e.status === 'published') return false;
      if (classFilter !== 'ALL' && e.class_name !== classFilter) return false;
      if (examNameFilter !== 'ALL' && e.exam_name !== examNameFilter) return false;
      return true;
    });
  }, [exams, statusTab, classFilter, examNameFilter]);

  // Accordion expand/collapse helper
  const isExamExpanded = (e: any) => {
    if (expandedExams[e.id] !== undefined) {
      return expandedExams[e.id];
    }
    // Published results are COLLAPSED by default to eliminate massive scrolling
    // Open/ongoing exams stay EXPANDED by default for easy marking access
    return e.status !== 'published';
  };

  const toggleExam = (id: number, currentExpanded: boolean) => {
    setExpandedExams(prev => ({
      ...prev,
      [id]: !currentExpanded
    }));
  };

  const setAllExpanded = (expand: boolean) => {
    const next: Record<number, boolean> = {};
    exams.forEach(e => {
      next[e.id] = expand;
    });
    setExpandedExams(next);
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />
        <View style={s.nav}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace(admin ? '/superadmin' : '/teacher'))}
            style={s.navButton}
          >
            <Text style={s.navText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push((admin ? '/superadmin' : '/teacher') as any)}
            style={s.navButton}
          >
            <Text style={s.navText}>Home</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.title}>Terminal Exam</Text>

        {entry ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginVertical: 6
              }}
            >
              <TouchableOpacity onPress={() => setEntry(null)}>
                <Text style={s.link}>← Back to exams</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  disabled={downloadingExcel === entry.id}
                  onPress={() => downloadSubjectExcel(entry.id, entry.subject_name, entry.exam_name)}
                  style={{
                    backgroundColor: '#16a34a',
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 7,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {downloadingExcel === entry.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : null}
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                    📊 Print / Export Excel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/omr-evaluation' as any)}
                  style={{
                    backgroundColor: '#0F52BA',
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 7,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                    📷 OMR Scan & Auto-Fill MCQ
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={s.heading}>
              {entry.exam_name} - Class {entry.class_name}
            </Text>
            <Text style={s.help}>
              {entry.subject_name} - Full Marks {entry.full_marks} - {String(entry.exam_date || '').slice(0, 10)}
            </Text>

            <View style={s.entrySummary}>
              <Text style={s.entrySummaryText}>Total: {students.length}</Text>
              <Text style={[s.entrySummaryText, { color: '#166534' }]}>Completed: {entryCompletedCount}</Text>
              <Text style={[s.entrySummaryText, { color: '#b45309' }]}>Pending: {entryPendingCount}</Text>
              <Text style={[s.entrySummaryText, { color: '#b91c1c' }]}>Absent: {entryAbsentCount}</Text>
            </View>

            <View style={s.entryFilterRow}>
              <View style={s.entrySearchWrap}>
                <TextInput
                  placeholder="🔍 Search name or Reg No..."
                  placeholderTextColor="#8492a6"
                  value={entrySearch}
                  onChangeText={setEntrySearch}
                  style={s.entrySearchInput}
                />
                {entrySearch ? (
                  <TouchableOpacity onPress={() => setEntrySearch('')} style={s.entryClearBtn}>
                    <Text style={s.entryClearBtnText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={s.entryFilterTabs}>
                {[
                  { id: 'all', label: `All (${students.length})` },
                  { id: 'pending', label: `Pending (${entryPendingCount})` },
                  { id: 'completed', label: `Completed (${entryCompletedCount})` },
                  { id: 'absent', label: `Absent (${entryAbsentCount})` }
                ].map(tab => (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setEntryFilter(tab.id as any)}
                    style={[s.entryFilterChip, entryFilter === tab.id && s.entryFilterChipActive]}
                  >
                    <Text style={[s.entryFilterChipText, entryFilter === tab.id && s.entryFilterChipTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(entrySortColumn !== 'sl' || entrySortDirection !== 'asc' || entryFilter !== 'all' || entrySearch !== '') && (
                  <TouchableOpacity onPress={resetEntryFilters} style={s.resetAllBtn}>
                    <Text style={s.resetAllText}>🔄 Reset Filter & Sort</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={s.entryTableCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: '100%' }}>
                <View style={{ flex: 1, minWidth: 680, position: 'relative' }}>
                  <View style={s.entryTableHeader}>
                    <View style={[s.thCellWrap, s.entryColSl]}>
                      <TouchableOpacity onPress={() => toggleEntrySort('sl')} style={s.thTitleBtn}>
                        <Text style={s.entryThCell}>sl no</Text>
                        {entrySortColumn === 'sl' && <Text style={s.sortBadge}>{entrySortDirection === 'asc' ? ' ▲' : ' ▼'}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEntryActiveHeaderMenu(entryActiveHeaderMenu === 'sl' ? null : 'sl')} style={s.filterTrigger}>
                        <Text style={[s.filterTriggerText, entryActiveHeaderMenu === 'sl' && s.filterTriggerActive]}>▾</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[s.thCellWrap, s.entryColRank]}>
                      <TouchableOpacity onPress={() => toggleEntrySort('rank')} style={s.thTitleBtn}>
                        <Text style={s.entryThCell}>rank</Text>
                        {entrySortColumn === 'rank' && <Text style={s.sortBadge}>{entrySortDirection === 'asc' ? ' ▲' : ' ▼'}</Text>}
                      </TouchableOpacity>
                    </View>

                    <View style={[s.thCellWrap, s.entryColReg]}>
                      <TouchableOpacity onPress={() => toggleEntrySort('reg')} style={s.thTitleBtn}>
                        <Text style={s.entryThCell}>reg no</Text>
                        {entrySortColumn === 'reg' && <Text style={s.sortBadge}>{entrySortDirection === 'asc' ? ' ▲' : ' ▼'}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEntryActiveHeaderMenu(entryActiveHeaderMenu === 'reg' ? null : 'reg')} style={s.filterTrigger}>
                        <Text style={[s.filterTriggerText, entryActiveHeaderMenu === 'reg' && s.filterTriggerActive]}>▾</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[s.thCellWrap, s.entryColName]}>
                      <TouchableOpacity onPress={() => toggleEntrySort('name')} style={s.thTitleBtn}>
                        <Text style={s.entryThCell}>name</Text>
                        {entrySortColumn === 'name' && <Text style={s.sortBadge}>{entrySortDirection === 'asc' ? ' ▲' : ' ▼'}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEntryActiveHeaderMenu(entryActiveHeaderMenu === 'name' ? null : 'name')} style={s.filterTrigger}>
                        <Text style={[s.filterTriggerText, entryActiveHeaderMenu === 'name' && s.filterTriggerActive]}>▾</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[s.thCellWrap, s.entryColMarks]}>
                      <TouchableOpacity onPress={() => toggleEntrySort('marks')} style={s.thTitleBtn}>
                        <Text style={s.entryThCell}>written / mcq / oral</Text>
                        {entrySortColumn === 'marks' && <Text style={s.sortBadge}>{entrySortDirection === 'asc' ? ' ▲' : ' ▼'}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEntryActiveHeaderMenu(entryActiveHeaderMenu === 'marks' ? null : 'marks')} style={s.filterTrigger}>
                        <Text style={[s.filterTriggerText, entryActiveHeaderMenu === 'marks' && s.filterTriggerActive]}>▾</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[s.thCellWrap, s.entryColAbsent]}>
                      <TouchableOpacity onPress={() => setEntryActiveHeaderMenu(entryActiveHeaderMenu === 'absent' ? null : 'absent')} style={s.thTitleBtn}>
                        <Text style={s.entryThCell}>absent</Text>
                        <Text style={s.filterTriggerText}>▾</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {entryActiveHeaderMenu && (
                    <View style={[
                      s.columnMenuDropdown,
                      entryActiveHeaderMenu === 'sl' && { left: 4 },
                      entryActiveHeaderMenu === 'reg' && { left: 80 },
                      entryActiveHeaderMenu === 'name' && { left: 160 },
                      entryActiveHeaderMenu === 'marks' && { right: 120 },
                      entryActiveHeaderMenu === 'absent' && { right: 6 }
                    ]}>
                      {entryActiveHeaderMenu === 'sl' && (
                        <>
                          <Text style={s.menuHeader}>Sl No Filter & Sort</Text>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('sl'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬆️ Sort: 1 → {students.length} (Ascending)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('sl'); setEntrySortDirection('desc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬇️ Sort: {students.length} → 1 (Descending)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('sl'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={[s.menuItemText, { color: '#0F52BA' }]}>🔄 Reset to Default (1 → {students.length})</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {entryActiveHeaderMenu === 'reg' && (
                        <>
                          <Text style={s.menuHeader}>Reg No Filter & Sort</Text>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('reg'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬆️ Sort: Lowest Reg No first</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('reg'); setEntrySortDirection('desc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬇️ Sort: Highest Reg No first</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('sl'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={[s.menuItemText, { color: '#0F52BA' }]}>🔄 Reset to Original Order</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {entryActiveHeaderMenu === 'name' && (
                        <>
                          <Text style={s.menuHeader}>Name Filter & Sort</Text>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('name'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬆️ Sort: A → Z (Alphabetical)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('name'); setEntrySortDirection('desc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬇️ Sort: Z → A (Reverse)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('sl'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={[s.menuItemText, { color: '#0F52BA' }]}>🔄 Reset to Original Order</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {entryActiveHeaderMenu === 'marks' && (
                        <>
                          <Text style={s.menuHeader}>Marks Filter & Sort</Text>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('marks'); setEntrySortDirection('desc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬇️ Sort: Highest Total First</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntrySortColumn('marks'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⬆️ Sort: Lowest Total First</Text>
                          </TouchableOpacity>
                          <View style={s.menuDivider} />
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntryFilter('completed'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>✓ Filter: Entered Marks Only ({entryCompletedCount})</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntryFilter('pending'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>⏳ Filter: Missing / Pending Only ({entryPendingCount})</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntryFilter('absent'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>❌ Filter: Absent Only ({entryAbsentCount})</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntryFilter('all'); setEntrySortColumn('sl'); setEntrySortDirection('asc'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={[s.menuItemText, { color: '#0F52BA' }]}>🔄 Show All & Reset Sort</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {entryActiveHeaderMenu === 'absent' && (
                        <>
                          <Text style={s.menuHeader}>Absent Filter</Text>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntryFilter('absent'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>❌ Filter: Absent Only ({entryAbsentCount})</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntryFilter('completed'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={s.menuItemText}>✓ Filter: Present / With Marks</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.menuItem} onPress={() => { setEntryFilter('all'); setEntryActiveHeaderMenu(null); }}>
                            <Text style={[s.menuItemText, { color: '#0F52BA' }]}>📋 Show All Students ({students.length})</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity style={s.menuCloseBtn} onPress={() => setEntryActiveHeaderMenu(null)}>
                        <Text style={s.menuCloseText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {filteredEntryStudents.length === 0 ? (
                    <View style={s.entryEmptyRow}>
                      <Text style={s.entryEmptyRowText}>No students match the search/filter criteria.</Text>
                    </View>
                  ) : (
                    filteredEntryStudents.map((x, i) => (
                      <View
                        key={x.student_id}
                        style={[
                          s.entryTableRow,
                          x.absent && s.entryRowAbsent,
                          i % 2 === 1 && s.entryRowAlt
                        ]}
                      >
                        <Text style={[s.entryTdCell, s.entryColSl, { fontWeight: '700', color: '#64748b' }]}>
                          {x.originalIndex + 1}
                        </Text>
                        <Text style={[s.entryTdCell, s.entryColRank, { fontWeight: '700', color: '#0369a1' }]}>
                          {rankMap[x.student_id] ?? '-'}
                        </Text>
                        <Text style={[s.entryTdCell, s.entryColReg, s.entryRegText]}>
                          {x.registration_no}
                        </Text>
                        <View style={[s.entryColName, { paddingHorizontal: 6 }]}>
                          <Text numberOfLines={1} ellipsizeMode="tail" style={s.entryNameText}>
                            {x.student_name}
                          </Text>
                        </View>

                        <View style={s.entryColMarks}>
                          {x.absent ? (
                            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#b91c1c', fontWeight: '800', fontSize: 12 }}>ABSENT</Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                              <TextInput
                                editable={entry.status !== 'submitted' || admin}
                                value={x.written}
                                placeholder="Written"
                                placeholderTextColor="#cbd5e1"
                                onChangeText={v =>
                                  setStudents(a =>
                                    a.map(y => (y.student_id === x.student_id ? { ...y, written: v.replace(/[^0-9.]/g, ''), absent: false } : y))
                                  )
                                }
                                keyboardType="numeric"
                                style={[s.mark, { width: 70 }]}
                              />
                              <TextInput
                                editable={entry.status !== 'submitted' || admin}
                                value={x.mcq}
                                placeholder="MCQ"
                                placeholderTextColor="#cbd5e1"
                                onChangeText={v =>
                                  setStudents(a =>
                                    a.map(y => (y.student_id === x.student_id ? { ...y, mcq: v.replace(/[^0-9.]/g, ''), absent: false } : y))
                                  )
                                }
                                keyboardType="numeric"
                                style={[s.mark, { width: 70 }]}
                              />
                              <TextInput
                                editable={entry.status !== 'submitted' || admin}
                                value={x.oral}
                                placeholder="Oral"
                                placeholderTextColor="#cbd5e1"
                                onChangeText={v =>
                                  setStudents(a =>
                                    a.map(y => (y.student_id === x.student_id ? { ...y, oral: v.replace(/[^0-9.]/g, ''), absent: false } : y))
                                  )
                                }
                                keyboardType="numeric"
                                style={[s.mark, { width: 70 }]}
                              />
                            </View>
                          )}
                          {markErrors[x.student_id] && (
                            <Text style={{ color: '#c62828', fontSize: 11, fontWeight: '800', marginTop: 3 }}>
                              {markErrors[x.student_id]}
                            </Text>
                          )}
                        </View>

                        <View style={s.entryColAbsent}>
                          <TouchableOpacity
                            onPress={() =>
                              setStudents(a =>
                                a.map(y =>
                                  y.student_id === x.student_id
                                    ? { ...y, absent: !y.absent, written: '', mcq: '', oral: '', mark: '' }
                                    : y
                                )
                              )
                            }
                            style={[s.absent, x.absent && s.absentOn]}
                          >
                            <Text style={x.absent ? s.white : s.red}>{x.absent ? 'ABSENT' : 'Mark Absent'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            </View>

            {(entry.status !== 'submitted' || admin) && (
              <TouchableOpacity
                disabled={submittingMode !== null}
                onPress={() => submit('draft')}
                style={[s.primary, submittingMode !== null && s.submitDisabled]}
              >
                {submittingMode === 'draft' ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={s.white}>Saving...</Text>
                  </>
                ) : (
                  <Text style={s.white}>Save as Draft</Text>
                )}
              </TouchableOpacity>
            )}

            {(entry.status !== 'submitted' || admin) && (
              <TouchableOpacity
                disabled={submittingMode !== null}
                onPress={() => submit('final')}
                style={[s.primary, { backgroundColor: '#16814d' }, submittingMode !== null && s.submitDisabled]}
              >
                {submittingMode === 'final' ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={s.white}>Submitting...</Text>
                  </>
                ) : (
                  <Text style={s.white}>Final Submit</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {admin && (
              <View style={s.panel}>
                <Text style={s.heading}>Create Terminal Exam</Text>
                <Field placeholder="Exam name" value={form.exam_name} onChangeText={(v: string) => set('exam_name', v)} />
                <Select
                  searchable
                  label="Class"
                  value={form.class_name}
                  onChange={v => set('class_name', v)}
                  options={[{ value: '', label: 'Select class' }, ...STUDENT_CLASSES.map(v => ({ value: v, label: v }))]}
                />
                <Select
                  searchable
                  label="Session"
                  value={form.session_name}
                  onChange={v => set('session_name', v)}
                  options={SESSION_OPTIONS.map(v => ({ value: v, label: v }))}
                />
                {form.subjects.map((x: any, i: number) => (
                  <View key={i} style={s.subject}>
                    <View style={s.flex}>
                      <Select
                        searchable
                        label="Subject"
                        value={x.subject_name}
                        onChange={v => subject(i, 'subject_name', v)}
                        options={(() => {
                          const list: any[] = [{ value: '', label: 'Select subject' }, ...TERMINAL_SUBJECTS];
                          if (x.subject_name && !list.some(o => o.value === x.subject_name)) {
                            list.push({ value: x.subject_name, label: x.subject_name, shortLabel: x.subject_name, keywords: [x.subject_name] });
                          }
                          return list;
                        })()}
                      />
                    </View>
                    <View>
                      <Text style={s.help}>Theory</Text>
                      <Field
                        placeholder="Theory"
                        value={x.theory_marks}
                        onChangeText={(v: string) => subject(i, 'theory_marks', v)}
                        keyboardType="numeric"
                        style={s.small}
                      />
                    </View>
                    <View>
                      <Text style={s.help}>MCQ</Text>
                      <Field
                        placeholder="MCQ"
                        value={x.mcq_marks}
                        onChangeText={(v: string) => subject(i, 'mcq_marks', v)}
                        keyboardType="numeric"
                        style={s.small}
                      />
                    </View>
                    <View>
                      <Text style={s.help}>Oral</Text>
                      <Field
                        placeholder="Oral"
                        value={x.oral_marks}
                        onChangeText={(v: string) => subject(i, 'oral_marks', v)}
                        keyboardType="numeric"
                        style={s.small}
                      />
                    </View>
                    <DatePickerField label="Exam Date" value={x.exam_date} onChange={v => subject(i, 'exam_date', v)} style={s.date} />
                    <View style={s.teacher}>
                      <Select
                        searchable
                        label="Teacher"
                        value={String(x.teacher_id)}
                        onChange={v => subject(i, 'teacher_id', v)}
                        options={[
                          { value: '', label: 'Assign teacher' },
                          ...teachers.map(t => ({
                            value: String(t.id),
                            label: String(t.name || 'Teacher') + ' - Emp ID: ' + String(t.staff_id || 'N/A')
                          }))
                        ]}
                      />
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setForm((x: any) => ({ ...x, subjects: [...x.subjects, { ...blank }] }))}>
                  <Text style={s.link}>+ Add subject</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={create} style={s.primary}>
                  <Text style={s.white}>Create & Assign</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              <Text style={s.heading}>{admin ? 'Terminal Exams' : 'My Assigned Subjects'}</Text>
            </View>

            {/* 🎯 CLASS-WISE & EXAM-WISE FILTER MENU TOOLBAR */}
            <View style={s.filterContainer}>
              {/* Row 1: Status Tabs + Quick Expand/Collapse Actions */}
              <View style={s.statusTabsRow}>
                <View style={s.statusTabsGroup}>
                  <TouchableOpacity
                    style={[s.statusTab, statusTab === 'all' && s.statusTabActive]}
                    onPress={() => setStatusTab('all')}
                  >
                    <Text style={[s.statusTabText, statusTab === 'all' && s.statusTabTextActive]}>
                      All Exams ({exams.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.statusTab, statusTab === 'ongoing' && s.statusTabActive]}
                    onPress={() => setStatusTab('ongoing')}
                  >
                    <Text style={[s.statusTabText, statusTab === 'ongoing' && s.statusTabTextActive]}>
                      ⏳ In Progress / Open ({ongoingCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      s.statusTab,
                      s.statusTabPublished,
                      statusTab === 'published' && s.statusTabPublishedActive
                    ]}
                    onPress={() => setStatusTab('published')}
                  >
                    <Text
                      style={[
                        s.statusTabText,
                        s.statusTabPublishedText,
                        statusTab === 'published' && s.statusTabPublishedTextActive
                      ]}
                    >
                      🟢 Published Results ({publishedCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Exam Name Dropdown & Clear Filter (moved to top empty space as requested) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {distinctExamNames.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[s.filterLabel, { marginBottom: 0 }]}>Exam Wise Menu:</Text>
                      {Platform.OS === 'web' ? (
                        <select
                          style={{
                            padding: '6px 10px',
                            borderRadius: 7,
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            fontSize: 12,
                            color: '#1e293b',
                            fontWeight: '600',
                            cursor: 'pointer',
                            outline: 'none',
                            maxWidth: 260
                          }}
                          value={examNameFilter}
                          onChange={(e: any) => setExamNameFilter(e.target.value)}
                        >
                          <option value="ALL">All Exams</option>
                          {distinctExamNames.map(n => (
                            <option key={n} value={n}>
                              {n.trim()}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </View>
                  )}

                  {/* Reset Filters button */}
                  {(classFilter !== 'ALL' || examNameFilter !== 'ALL' || statusTab !== 'all') && (
                    <TouchableOpacity
                      style={s.btnClearFilter}
                      onPress={() => {
                        setClassFilter('ALL');
                        setExamNameFilter('ALL');
                        setStatusTab('all');
                      }}
                    >
                      <Text style={s.btnClearFilterText}>✕ Clear Filter</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={s.btnExpandToggle}
                    onPress={() => setAllExpanded(true)}
                  >
                    <Text style={s.btnExpandToggleText}>▾ Expand All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.btnExpandToggle}
                    onPress={() => setAllExpanded(false)}
                  >
                    <Text style={s.btnExpandToggleText}>▴ Collapse All</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Row 2: Class Wise Menu */}
              <View style={s.menuFiltersRow}>
                {/* Class Wise Pill Menu */}
                <View style={{ flex: 1, minWidth: '100%' }}>
                  <Text style={s.filterLabel}>Class Wise Menu (ক্লাস অনুযায়ী ফিল্টার):</Text>
                  <View style={s.classPillsContent}>
                    <TouchableOpacity
                      style={[s.classPill, classFilter === 'ALL' && s.classPillActive]}
                      onPress={() => setClassFilter('ALL')}
                    >
                      <Text style={[s.classPillText, classFilter === 'ALL' && s.classPillTextActive]}>
                        All Classes
                      </Text>
                    </TouchableOpacity>
                    {distinctClasses.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[s.classPill, classFilter === c && s.classPillActive]}
                        onPress={() => setClassFilter(c)}
                      >
                        <Text style={[s.classPillText, classFilter === c && s.classPillTextActive]}>
                          Class {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {/* EMPTY STATE */}
            {filteredExams.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>
                  No exams match the selected filter criteria.
                </Text>
                <TouchableOpacity
                  style={[s.btnClearFilter, { marginTop: 10 }]}
                  onPress={() => {
                    setClassFilter('ALL');
                    setExamNameFilter('ALL');
                    setStatusTab('all');
                  }}
                >
                  <Text style={s.btnClearFilterText}>View All Exams</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* EXAM CARDS (ACCORDION / COMPACT FOR PUBLISHED RESULTS) */}
            {filteredExams.map(e => {
              const isPub = e.status === 'published';
              const expanded = isExamExpanded(e);

              return (
                <View key={e.id} style={[s.card, isPub && s.cardPublished]}>
                  {/* CARD HEADER - Click header or arrow to toggle expand / collapse */}
                  <TouchableOpacity
                    style={s.cardHeaderRow}
                    onPress={() => toggleExam(e.id, expanded)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, minWidth: 200 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={s.bold}>
                          {e.exam_name} - Class {e.class_name}
                        </Text>
                        {isPub ? (
                          <View style={s.badgePublished}>
                            <Text style={s.badgePublishedText}>🟢 Published</Text>
                          </View>
                        ) : (
                          <View style={s.badgeOngoing}>
                            <Text style={s.badgeOngoingText}>
                              {e.submitted_count === e.subject_count ? 'Ready to Publish' : 'In Progress'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.help}>
                        {e.submitted_count}/{e.subject_count} subjects submitted • {isPub ? 'Result Live' : e.status}
                      </Text>
                    </View>

                    {/* Right side: Unpublish button on collapsed card & Toggle badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {admin && isPub && !expanded && (
                        <TouchableOpacity
                          onPress={ev => {
                            ev.stopPropagation?.();
                            unpublish(e.id);
                          }}
                          style={s.quickUnpublishBtn}
                        >
                          <Text style={s.quickUnpublishText}>Unpublish</Text>
                        </TouchableOpacity>
                      )}

                      <View style={[s.expandBadge, expanded && s.expandBadgeActive]}>
                        <Text style={[s.expandBadgeText, expanded && s.expandBadgeTextActive]}>
                          {expanded ? '▲ Hide Subjects' : `▼ View ${e.subject_count || (e.subjects || []).length} Subjects`}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* EXPANDED CONTENT: All Subjects & Admin action buttons */}
                  {expanded && (
                    <View style={s.cardExpandedBody}>
                      {/* Master Excel Action Bar for All Subjects */}
                      <View style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 10,
                        backgroundColor: '#f1f5f9',
                        padding: 10,
                        borderRadius: 10,
                        marginBottom: 14,
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        borderWidth: 1,
                        borderColor: '#e2e8f0'
                      }}>
                        <TouchableOpacity
                          disabled={downloadingExcel === e.id}
                          onPress={() => downloadMasterExcel(e.id, e.exam_name, e.class_name)}
                          style={{
                            backgroundColor: '#0F52BA',
                            paddingHorizontal: 13,
                            paddingVertical: 8,
                            borderRadius: 7,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          {downloadingExcel === e.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : null}
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                            📥 Download All Subjects Excel
                          </Text>
                        </TouchableOpacity>

                        {admin && (
                          <TouchableOpacity
                            disabled={uploadingExcel === e.id}
                            onPress={() => uploadMasterExcel(e.id)}
                            style={{
                              backgroundColor: '#15803d',
                              paddingHorizontal: 13,
                              paddingVertical: 8,
                              borderRadius: 7,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            {uploadingExcel === e.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : null}
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                              📤 Upload All Subjects Excel
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={s.assignmentGrid}>
                        {(e.subjects || []).map((x: any) => (
                          <TouchableOpacity
                            key={x.id}
                            onPress={() => open(x.id)}
                            style={[
                              s.assignment,
                              x.status === 'submitted' && s.assignmentSubmitted
                            ]}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={s.bold}>
                                {x.subject_name} - Full {x.full_marks}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '800',
                                  color: x.status === 'submitted' ? '#166534' : '#b45309'
                                }}
                              >
                                {x.status === 'submitted' ? '✓ Submitted' : '⏳ Pending'}
                              </Text>
                            </View>
                            <Text style={s.help}>
                              {x.teacher_name || 'Unassigned'} • {x.status}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {admin && (
                        <View style={{ marginTop: 10 }}>
                          {isPub ? (
                            <TouchableOpacity
                              onPress={() => unpublish(e.id)}
                              style={[s.publish, { backgroundColor: '#b33b47' }]}
                            >
                              <Text style={s.white}>↩️ Unpublish for Correction</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                              <TouchableOpacity
                                disabled={publishingId === e.id}
                                onPress={() => publish(e.id)}
                                style={[
                                  s.publish,
                                  { flex: 2, minWidth: 200 },
                                  publishingId === e.id && s.publishDisabled
                                ]}
                              >
                                {publishingId === e.id ? (
                                  <>
                                    <ActivityIndicator color="#fff" size="small" />
                                    <Text style={s.white}>Publishing...</Text>
                                  </>
                                ) : (
                                  <Text style={s.white}>📢 Publish Complete Result</Text>
                                )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => removeExam(e.id)}
                                style={[s.publish, { flex: 1, minWidth: 140, backgroundColor: '#9b1c31' }]}
                              >
                                <Text style={s.white}>🗑️ Delete Test Exam</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
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
  nav: { flexDirection: 'row', gap: 8, marginTop: 8 },
  navButton: { backgroundColor: '#e4eef8', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  navText: { color: '#174f7d', fontWeight: '900' },
  page: { flex: 1, backgroundColor: '#f3f6fa' },
  body: { width: '100%', maxWidth: 1050, alignSelf: 'center', padding: 16, paddingBottom: 50 },
  title: { fontSize: 27, fontWeight: '900', color: '#173f68', marginVertical: 12 },
  heading: { fontSize: 19, fontWeight: '900', color: '#263f58', marginVertical: 10 },
  help: { color: '#6e7d8b', fontSize: 12, marginTop: 3 },
    rank: { fontWeight: '600', color: '#333', marginRight: 8 },
  panel: { backgroundColor: '#fff', padding: 15, borderRadius: 14, marginBottom: 18 },
  subject: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  flex: { flex: 1, minWidth: 150 },
  small: { width: 100 },
  date: { width: 190 },
  teacher: { width: 210 },
  primary: { backgroundColor: '#175e9d', padding: 14, borderRadius: 9, marginTop: 10 },
  publish: {
    backgroundColor: '#16814d',
    padding: 11,
    borderRadius: 8,
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  publishDisabled: { opacity: 0.7 },
  submitDisabled: { opacity: 0.7 },
  white: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  link: { color: '#1662a5', fontWeight: '900', marginVertical: 10 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dbe4ed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1
  },
  cardPublished: {
    borderColor: '#bbf7d0',
    backgroundColor: '#fcfdfc'
  },
  bold: { fontWeight: '900', color: '#273e55', fontSize: 14.5 },
  assignmentGrid: { gap: 8 },
  assignment: { backgroundColor: '#edf4fb', padding: 11, borderRadius: 8, marginTop: 4 },
  assignmentSubmitted: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  student: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e9ed'
  },
  sl: { width: 28, textAlign: 'center' },
  mark: { width: 75, borderWidth: 1, borderColor: '#aab8c5', borderRadius: 7, padding: 8, textAlign: 'center' },
  absent: { borderWidth: 1, borderColor: '#c83c48', padding: 8, borderRadius: 7 },
  absentOn: { backgroundColor: '#c83c48' },
  red: { color: '#b52f3a', fontWeight: '800' },

  // FILTER & MENU STYLES
  filterContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#dbe4ed'
  },
  statusTabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  statusTabsGroup: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  statusTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  statusTabActive: {
    backgroundColor: '#175e9d',
    borderColor: '#175e9d'
  },
  statusTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  statusTabTextActive: {
    color: '#ffffff'
  },
  statusTabPublished: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0'
  },
  statusTabPublishedActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a'
  },
  statusTabPublishedText: {
    color: '#166534'
  },
  statusTabPublishedTextActive: {
    color: '#ffffff'
  },
  btnExpandToggle: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  btnExpandToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155'
  },
  menuFiltersRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10
  },
  filterLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5
  },
  classPillsContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    paddingVertical: 2
  },
  classPill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  classPillActive: {
    backgroundColor: '#0F52BA',
    borderColor: '#0F52BA'
  },
  classPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155'
  },
  classPillTextActive: {
    color: '#ffffff'
  },
  examSelect: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    width: '100%'
  },
  btnClearFilter: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7
  },
  btnClearFilterText: {
    color: '#b91c1c',
    fontSize: 11.5,
    fontWeight: '800'
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 10
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600'
  },

  // CARD ACCORDION STYLES
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  badgePublished: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12
  },
  badgePublishedText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800'
  },
  badgeOngoing: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12
  },
  badgeOngoingText: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '700'
  },
  expandBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  expandBadgeActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc'
  },
  expandBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569'
  },
  expandBadgeTextActive: {
    color: '#0369a1'
  },
  quickUnpublishBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6
  },
  quickUnpublishText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '800'
  },
  cardExpandedBody: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  entrySummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#dfeefe',
    borderRadius: 10,
    padding: 12,
    marginVertical: 12,
    flexWrap: 'wrap',
    gap: 8
  },
  entrySummaryText: {
    fontWeight: '900',
    color: '#214e7d',
    fontSize: 13.5
  },
  entryFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10
  },
  entrySearchWrap: {
    flex: 1,
    minWidth: 220,
    position: 'relative',
    justifyContent: 'center'
  },
  entrySearchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#1e293b'
  },
  entryClearBtn: {
    position: 'absolute',
    right: 10,
    padding: 4
  },
  entryClearBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '800'
  },
  entryFilterTabs: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap'
  },
  entryFilterChip: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7
  },
  entryFilterChipActive: {
    backgroundColor: '#0F52BA',
    borderColor: '#0F52BA'
  },
  entryFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  entryFilterChipTextActive: {
    color: '#ffffff'
  },
  entryTableCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8e2ed',
    overflow: 'hidden',
    marginBottom: 12
  },
  entryTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#173d68',
    paddingVertical: 11,
    paddingHorizontal: 8
  },
  entryThCell: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  thCellWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  thTitleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  sortBadge: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '900'
  },
  filterTrigger: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 2
  },
  filterTriggerText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '900'
  },
  filterTriggerActive: {
    color: '#ffffff',
    backgroundColor: '#1e40af'
  },
  resetAllBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7
  },
  resetAllText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800'
  },
  columnMenuDropdown: {
    position: 'absolute',
    top: 44,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 8,
    minWidth: 210,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000
  },
  menuHeader: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
    paddingHorizontal: 6,
    textTransform: 'uppercase'
  },
  menuItem: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginVertical: 1
  },
  menuItemText: {
    fontSize: 12.5,
    color: '#1e293b',
    fontWeight: '700'
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 5
  },
  menuCloseBtn: {
    marginTop: 6,
    paddingVertical: 5,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center'
  },
  menuCloseText: {
    color: '#64748b',
    fontSize: 11.5,
    fontWeight: '700'
  },
  entryTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff'
  },
  entryRowAlt: {
    backgroundColor: '#f8fafc'
  },
  entryRowAbsent: {
    backgroundColor: '#fef2f2'
  },
  entryTdCell: {
    fontSize: 13,
    color: '#334155'
  },
  entryRegText: {
    fontWeight: '800',
    color: '#0F52BA'
  },
  entryNameText: {
    fontWeight: '800',
    color: '#1e293b',
    fontSize: 13.5
  },
  entryColSl: {
    width: 48,
    textAlign: 'center'
  },
  entryColRank: {
    width: 45,
    textAlign: 'center'
  },
  entryColReg: {
    width: 85,
    textAlign: 'center'
  },
  entryColName: {
    flex: 1,
    minWidth: 160
  },
  entryColMarks: {
    width: 240,
    alignItems: 'center',
    justifyContent: 'center'
  },
  entryColAbsent: {
    width: 110,
    alignItems: 'center',
    justifyContent: 'center'
  },
  entryEmptyRow: {
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center'
  },
  entryEmptyRowText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600'
  }
});
