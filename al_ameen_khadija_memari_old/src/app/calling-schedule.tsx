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
  Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import ScrollNavigationButtons from '../components/ScrollNavigationButtons';
import { api } from '../lib/api';
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
  const [activeTab, setActiveTab] = useState<'schedules' | 'details' | 'logs' | 'dialer'>('schedules');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);

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

  // Interactive IVR Dialer Simulator State
  const [dialRegNo, setDialRegNo] = useState('');
  const [dialStep, setDialStep] = useState<1 | 2 | 3>(1);
  const [ivrResponse, setIvrResponse] = useState<any>(null);
  const [ivrLoading, setIvrLoading] = useState(false);
  const [activeCallStatus, setActiveCallStatus] = useState<string | null>(null);

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

  // Fetch Call Logs
  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const res = await api('/api/calls/logs?limit=50');
      if (res && res.calls) {
        setCallLogs(res.calls || []);
      }
    } catch (err: any) {
      console.error('Failed to load call logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
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
      Alert.alert('Required', 'Please enter a Student Registration Number');
      return;
    }
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
        Alert.alert('Not Found', res?.message || 'Registration number not found');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not verify registration number');
    } finally {
      setIvrLoading(false);
    }
  };

  // Interactive IVR Step 2: Confirm Reg No (Press 1)
  const handleIvrStep2 = async (confirmDigit: string) => {
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
        Alert.alert('Access Denied', res?.message || 'Calling schedule not active');
        if (res?.status === 'reenter') {
          setDialStep(1);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Schedule check failed');
    } finally {
      setIvrLoading(false);
    }
  };

  // Interactive IVR Step 3: Select Relation & Dial
  const handleIvrStep3 = async (digit: number) => {
    try {
      setIvrLoading(true);
      setActiveCallStatus('Connecting via Exotel...');
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
        setActiveCallStatus(`✓ Guardian selected. Connected to ${res.target_relation} (${res.target_mobile}). Talk time limit: ${res.allowed_talk_time} min.`);
        Alert.alert('Guardian Selected', `Guardian selected. Calling ${res.target_relation} (${res.target_mobile}). Limit: ${res.allowed_talk_time} minutes.`);
      } else {
        setActiveCallStatus(null);
        Alert.alert('Call Failed', res?.message || 'Could not initiate call');
      }
    } catch (err: any) {
      setActiveCallStatus(null);
      Alert.alert('Error', err?.message || 'Call connection failed');
    } finally {
      setIvrLoading(false);
    }
  };

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
              style={[styles.tabBtn, activeTab === 'dialer' && styles.activeTabBtn]}
              onPress={() => {
                setActiveTab('dialer');
                setDialStep(1);
                setActiveCallStatus(null);
              }}
            >
              <Text style={[styles.tabBtnText, activeTab === 'dialer' && styles.activeTabText]}>IVR Dialer Test</Text>
            </TouchableOpacity>
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
              <TouchableOpacity style={styles.primaryBtn} onPress={handleOpenNew}>
                <Text style={styles.primaryBtnText}>+ Add Schedule</Text>
              </TouchableOpacity>
            </View>

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
                    <View key={item.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
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
                    <View key={stu.student_id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
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
                      <Text style={styles.primaryBtnText}>Press 1 (Confirm & Check Schedule)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: '#6e7781', flex: 1 }]}
                      onPress={() => handleIvrStep2('2')}
                      disabled={ivrLoading}
                    >
                      <Text style={styles.primaryBtnText}>Press 2 (Cancel / Re-enter)</Text>
                    </TouchableOpacity>
                  </View>
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

                  <Text style={{ fontWeight: '700', fontSize: 15, marginVertical: 8, color: '#173f77' }}>
                    Press digit to connect to guardian:
                  </Text>

                  <View style={{ gap: 10 }}>
                    {ivrResponse.options?.map((opt: any) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={styles.relationDialCard}
                        onPress={() => handleIvrStep3(opt.key)}
                        disabled={ivrLoading}
                      >
                        <View style={styles.keyBadge}>
                          <Text style={styles.keyBadgeText}>{opt.key}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.relationCardLabel}>{opt.label}</Text>
                          <Text style={styles.relationCardMobile}>📞 {opt.mobile}</Text>
                        </View>
                        <Text style={styles.dialCallNowText}>Call Now →</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

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
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardHeading}>Hostel Call Logs & History</Text>
                <Text style={styles.cardSub}>Recorded calls, duration, and status updates via Exotel</Text>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={fetchLogs}>
                <Text style={styles.primaryBtnText}>🔄 Refresh</Text>
              </TouchableOpacity>
            </View>

            {logsLoading ? (
              <ActivityIndicator size="large" color="#1768c5" style={{ marginVertical: 32 }} />
            ) : callLogs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No call history recorded yet.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.table}>
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, { width: 50 }]}>#</Text>
                    <Text style={[styles.th, { width: 80 }]}>Reg No</Text>
                    <Text style={[styles.th, { width: 140 }]}>Student</Text>
                    <Text style={[styles.th, { width: 100 }]}>Relation</Text>
                    <Text style={[styles.th, { width: 120 }]}>Dialed To</Text>
                    <Text style={[styles.th, { width: 90 }]}>Status</Text>
                    <Text style={[styles.th, { width: 80 }]}>Duration</Text>
                    <Text style={[styles.th, { width: 140 }]}>Time Limit</Text>
                    <Text style={[styles.th, { width: 120 }]}>Recording</Text>
                  </View>

                  {callLogs.map((log, idx) => (
                    <View key={log.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.td, { width: 50 }]}>{idx + 1}</Text>
                      <Text style={[styles.td, { width: 80, fontWeight: '700', color: '#173f77' }]}>{log.reg_no || '-'}</Text>
                      <Text style={[styles.td, { width: 140 }]}>{log.student_name || '-'}</Text>
                      <Text style={[styles.td, { width: 100, fontWeight: '600' }]}>{log.called_relation || 'Manual'}</Text>
                      <Text style={[styles.td, { width: 120 }]}>{log.to_number}</Text>
                      <View style={{ width: 90 }}>
                        <Text style={[
                          styles.badgeText,
                          log.status === 'completed' ? styles.badgeTextActive : styles.badgeTextInactive,
                          { fontWeight: '700' }
                        ]}>
                          {log.status}
                        </Text>
                      </View>
                      <Text style={[styles.td, { width: 80, fontWeight: '700' }]}>{log.duration ? `${log.duration}s` : '0s'}</Text>
                      <Text style={[styles.td, { width: 140, color: '#0969da' }]}>
                        {log.allowed_talk_time ? `${log.allowed_talk_time} min` : 'Standard'}
                      </Text>
                      <View style={{ width: 120 }}>
                        {log.recording_url ? (
                          <TouchableOpacity
                            onPress={() => {
                              if (Platform.OS === 'web') window.open(log.recording_url!, '_blank');
                              else Alert.alert('Recording URL', log.recording_url!);
                            }}
                          >
                            <Text style={{ color: '#1768c5', textDecorationLine: 'underline', fontSize: 12 }}>▶ Listen</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={{ fontSize: 12, color: '#999' }}>None</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

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

  table: { minWidth: 800 },
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

