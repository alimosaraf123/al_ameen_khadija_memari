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
import { api } from '../lib/api';
import { SUBJECTS } from '../lib/subjects';
import DatePickerField from '../components/DatePickerField';
import { getUser } from '../lib/auth';
import { STUDENT_CLASSES } from '../lib/studentClasses';
import { confirmAction, successMessage } from '../lib/confirm';

const blank = { subject_name: '', theory_marks: '', mcq_marks: '', oral_marks: '', exam_date: '', teacher_id: '' };
const TERMINAL_SUBJECTS = SUBJECTS;
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
  const [entry, setEntry] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [markErrors, setMarkErrors] = useState<Record<number, string>>({});
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [submittingMode, setSubmittingMode] = useState<'draft' | 'final' | null>(null);

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
        errors[x.student_id] = 'Enter Written or Oral marks';
      else if (w !== null && w > Number(entry.theory_marks))
        errors[x.student_id] = `Written marks cannot exceed ${entry.theory_marks}`;
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
              <TouchableOpacity
                onPress={() => router.push('/omr-evaluation' as any)}
                style={{
                  backgroundColor: '#0F52BA',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
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

            <Text style={s.heading}>
              {entry.exam_name} - Class {entry.class_name}
            </Text>
            <Text style={s.help}>
              {entry.subject_name} - Full Marks {entry.full_marks} - {String(entry.exam_date || '').slice(0, 10)}
            </Text>

            {students.map((x, i) => (
              <View key={x.student_id} style={s.student}>
                <Text style={s.sl}>{i + 1}</Text>
                <View style={{ width: 210, flexShrink: 1, marginRight: 12 }}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={s.bold}>
                    {x.student_name}
                  </Text>
                  <Text style={s.help}>Reg. {x.registration_no}</Text>
                </View>
                <View style={{ width: 250, display: x.absent ? 'none' : 'flex' }}>
                  <Text style={s.help}>Written / MCQ / Oral</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <TextInput
                      editable={entry.status !== 'submitted' || admin}
                      value={x.written}
                      placeholder="Written"
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
                      onChangeText={v =>
                        setStudents(a =>
                          a.map(y => (y.student_id === x.student_id ? { ...y, oral: v.replace(/[^0-9.]/g, ''), absent: false } : y))
                        )
                      }
                      keyboardType="numeric"
                      style={[s.mark, { width: 70 }]}
                    />
                  </View>
                </View>
                {markErrors[x.student_id] && (
                  <Text style={{ color: '#c62828', fontSize: 11, fontWeight: '800', width: 150 }}>
                    {markErrors[x.student_id]}
                  </Text>
                )}
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
                  <Text style={x.absent ? s.white : s.red}>{x.absent ? 'Absent' : 'Mark Absent'}</Text>
                </TouchableOpacity>
              </View>
            ))}

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
                  label="Class"
                  value={form.class_name}
                  onChange={v => set('class_name', v)}
                  options={[{ value: '', label: 'Select class' }, ...STUDENT_CLASSES.map(v => ({ value: v, label: v }))]}
                />
                <Select
                  label="Session"
                  value={form.session_name}
                  onChange={v => set('session_name', v)}
                  options={SESSION_OPTIONS.map(v => ({ value: v, label: v }))}
                />
                {form.subjects.map((x: any, i: number) => (
                  <View key={i} style={s.subject}>
                    <View style={s.flex}>
                      <Select
                        label="Subject"
                        value={x.subject_name}
                        onChange={v => subject(i, 'subject_name', v)}
                        options={[{ value: '', label: 'Select subject' }, ...TERMINAL_SUBJECTS.map(v => ({ value: v, label: v }))]}
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

              {/* Row 2: Class Wise & Exam Wise Menu */}
              <View style={s.menuFiltersRow}>
                {/* Class Wise Pill Menu */}
                <View style={{ flex: 2, minWidth: 260 }}>
                  <Text style={s.filterLabel}>Class Wise Menu (ক্লাস অনুযায়ী ফিল্টার):</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.classPillsContent}
                  >
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
                  </ScrollView>
                </View>

                {/* Exam Name Dropdown (if multiple exams exist) */}
                {distinctExamNames.length > 1 && (
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <Text style={s.filterLabel}>Exam Wise Menu:</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={s.examSelect}
                        value={examNameFilter}
                        onChange={(e: any) => setExamNameFilter(e.target.value)}
                      >
                        <option value="ALL">All Exams</option>
                        {distinctExamNames.map(n => (
                          <option key={n} value={n}>
                            {n}
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
  }
});
