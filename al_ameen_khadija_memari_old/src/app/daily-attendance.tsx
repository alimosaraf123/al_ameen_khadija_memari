import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import DatePickerField from '../components/DatePickerField';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';

function getLocalDateString(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateDisplay(ymd: string) {
  if (!ymd) return '';
  const parts = ymd.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return ymd;
}

function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
}

export default function DailyAttendance() {
  const [date, setDate] = useState(getLocalDateString());
  const [students, setStudents] = useState<any[]>([]);
  const [initialStatuses, setInitialStatuses] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncingGatepasses, setSyncingGatepasses] = useState(false);
  const [userRole, setUserRole] = useState('');
  
  // Filters
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all' | 'present' | 'absent' | 'unmarked'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Available options from backend
  const [classList, setClassList] = useState<string[]>([]);
  const [roomList, setRoomList] = useState<string[]>([]);
  const [submissionInfo, setSubmissionInfo] = useState<any>(null);

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Load Daily Attendance data
  const loadDailyAttendance = async (targetDate = date, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await api(`/api/attendance/daily?date=${targetDate}`);
      if (data.success) {
        const loadedStudents: any[] = data.students || [];
        setStudents(loadedStudents);
        setClassList(data.classes || []);
        setRoomList(data.rooms || []);
        setSubmissionInfo(data.submission || null);

        // Record initial status for reset button
        const initMap: Record<number, string> = {};
        loadedStudents.forEach((s) => {
          initMap[s.id] = s.status;
        });
        setInitialStatuses(initMap);
        setSelectedIds([]);
      } else {
        Alert.alert('Error', data.message || 'Failed to load attendance');
      }
    } catch (err: any) {
      Alert.alert('Attendance Error', err.message || 'Could not connect to server');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    void getUser<any>().then((u) => setUserRole(u?.role || ''));
    void loadDailyAttendance(date);
  }, [date]);

  // Handle Date Navigation
  const handlePrevDay = () => setDate(addDays(date, -1));
  const handleNextDay = () => setDate(addDays(date, 1));
  const handleToday = () => setDate(getLocalDateString());

  // Individual Actions
  const handleSetStatus = (studentId: number, newStatus: 'present' | 'absent') => {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s))
    );
  };

  const handleReset = (studentId: number) => {
    const orig = initialStatuses[studentId] || 'present';
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status: orig } : s))
    );
  };

  // Bulk Actions
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllInView = () => {
    const visibleIds = filteredStudents.map((s) => s.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkMark = (statusToSet: 'present' | 'absent') => {
    if (selectedIds.length === 0) {
      Alert.alert('Selection Required', 'Please select one or more students using checkboxes first.');
      return;
    }
    setStudents((prev) =>
      prev.map((s) => (selectedIds.includes(s.id) ? { ...s, status: statusToSet } : s))
    );
  };

  // Fetch / Sync Gate Passes
  const handleFetchAttendanceGatepasses = async () => {
    setSyncingGatepasses(true);
    try {
      const data = await api(`/api/attendance/daily/fetch-gatepasses?date=${date}`, {
        method: 'POST',
      });
      if (data.success) {
        const gpStudentIds = new Set((data.gate_passes || []).map((gp: any) => Number(gp.student_id)));
        setStudents((prev) =>
          prev.map((s) => {
            if (gpStudentIds.has(Number(s.id))) {
              return {
                ...s,
                has_active_gatepass: true,
                status: 'absent',
                remarks: s.remarks || 'Active Gate Pass',
              };
            }
            return s;
          })
        );
        Alert.alert(
          'Gate Passes Synced',
          `Found and applied ${data.count || 0} active gate pass records for ${formatDateDisplay(date)}.`
        );
      }
    } catch (err: any) {
      Alert.alert('Fetch Error', err.message);
    } finally {
      setSyncingGatepasses(false);
    }
  };

  // Submit / Save Daily Attendance
  const handleSubmitAttendance = async () => {
    if (students.length === 0) return;
    setSubmitting(true);
    try {
      const entries = students.map((s) => ({
        student_id: s.id,
        status: s.status,
        remarks: s.remarks || null,
        room_id: s.room_id || null,
      }));

      const res = await api('/api/attendance/daily/submit', {
        method: 'POST',
        body: JSON.stringify({
          attendance_date: date,
          entries,
        }),
      });

      if (res.success) {
        Alert.alert(
          'Success',
          `Daily student attendance for ${formatDateDisplay(date)} submitted and recorded successfully!`
        );
        await loadDailyAttendance(date, false);
      } else {
        Alert.alert('Submit Failed', res.message || 'Could not save attendance');
      }
    } catch (err: any) {
      Alert.alert('Submission Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Students List
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Class filter
      if (selectedClass !== 'all' && s.class_name !== selectedClass) return false;
      // Room filter
      if (selectedRoom !== 'all' && s.room_name !== selectedRoom) return false;
      // Status filter
      if (selectedStatus === 'present' && s.status !== 'present') return false;
      if (selectedStatus === 'absent' && s.status !== 'absent') return false;
      if (selectedStatus === 'unmarked' && (s.status === 'present' || s.status === 'absent')) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = String(s.student_name || '').toLowerCase().includes(q);
        const matchesReg = String(s.registration_no || '').toLowerCase().includes(q);
        const matchesRoom = String(s.room_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesReg && !matchesRoom) return false;
      }
      return true;
    });
  }, [students, selectedClass, selectedRoom, selectedStatus, searchQuery]);

  // Overall Statistics
  const totalEligible = students.length;
  const totalPresent = students.filter((s) => s.status === 'present').length;
  const totalAbsent = students.filter((s) => s.status === 'absent').length;
  const totalUnmarked = 0;

  // In-View Statistics
  const viewEligible = filteredStudents.length;
  const viewPresent = filteredStudents.filter((s) => s.status === 'present').length;
  const viewAbsent = filteredStudents.filter((s) => s.status === 'absent').length;
  const viewUnmarked = 0;

  // Has unsaved edits
  const hasEdits = useMemo(() => {
    return students.some((s) => initialStatuses[s.id] !== undefined && s.status !== initialStatuses[s.id]);
  }, [students, initialStatuses]);

  // Grouped by Room for Room Grid View
  const groupedByRoom = useMemo(() => {
    const map = new Map<string, any[]>();
    filteredStudents.forEach((s) => {
      const rName = s.room_name || 'Unassigned';
      if (!map.has(rName)) map.set(rName, []);
      map.get(rName)!.push(s);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [filteredStudents]);

  const allVisibleSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedIds.includes(s.id));

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.container}>
        <AcademyHeader compact />

        {/* TOP CONTROLS & FILTER BAR */}
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            {/* Date Navigator */}
            <View style={styles.dateControlGroup}>
              <Text style={styles.controlLabel}>Date:</Text>
              <TouchableOpacity onPress={handlePrevDay} style={styles.dateNavBtn}>
                <Text style={styles.dateNavBtnText}>‹</Text>
              </TouchableOpacity>

              <View style={styles.dateDisplayBox}>
                <Text style={styles.dateDisplayText}>{formatDateDisplay(date)}</Text>
              </View>

              <TouchableOpacity onPress={handleNextDay} style={styles.dateNavBtn}>
                <Text style={styles.dateNavBtnText}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleToday} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>

            {/* Class Dropdown */}
            <View style={styles.dropdownGroup}>
              <Text style={styles.controlLabel}>Class:</Text>
              <select
                aria-label="Filter by Class"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                style={webSelectStyle}
              >
                <option value="all">All Classes</option>
                {classList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </View>

            {/* Room Dropdown */}
            <View style={styles.dropdownGroup}>
              <Text style={styles.controlLabel}>Room:</Text>
              <select
                aria-label="Filter by Room"
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                style={webSelectStyle}
              >
                <option value="all">All Rooms</option>
                {roomList.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </View>

            {/* Status Dropdown */}
            <View style={styles.dropdownGroup}>
              <Text style={styles.controlLabel}>Status:</Text>
              <select
                aria-label="Filter by Status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={webSelectStyle}
              >
                <option value="all">All Statuses</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="unmarked">Unmarked</option>
              </select>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search Reg / Name..."
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* View Mode Toggle: All Students vs Room Grid */}
            <View style={styles.viewToggleGroup}>
              <TouchableOpacity
                onPress={() => setViewMode('table')}
                style={[styles.viewToggleBtn, viewMode === 'table' && styles.viewToggleBtnActive]}
              >
                <Text style={[styles.viewToggleText, viewMode === 'table' && styles.viewToggleTextActive]}>
                  ≡ All Students
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setViewMode('grid')}
                style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
              >
                <Text style={[styles.viewToggleText, viewMode === 'grid' && styles.viewToggleTextActive]}>
                  ⊞ Room Grid
                </Text>
              </TouchableOpacity>
            </View>

            {/* Fetch Gate Pass Records Button */}
            <TouchableOpacity
              onPress={handleFetchAttendanceGatepasses}
              disabled={syncingGatepasses}
              style={styles.fetchBtn}
              
            >
              <Text style={styles.fetchBtnText}>
                {syncingGatepasses ? '☁ Fetching...' : '☁ Fetch Attendance'}
              </Text>
            </TouchableOpacity>

            {/* Refresh Button */}
            <TouchableOpacity
              onPress={() => void loadDailyAttendance(date)}
              style={styles.refreshBtn}
            >
              <Text style={styles.refreshBtnText}>🔄</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4 SUMMARY STAT CARDS */}
        <View style={styles.statsRow}>
          {/* Card 1: Total Eligible */}
          <View style={[styles.statCard, styles.statCardBlue]}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>TOTAL ELIGIBLE</Text>
              <Text style={[styles.statValue, styles.statValueBlue]}>{totalEligible}</Text>
              <Text style={styles.statSub}>In View: {viewEligible}</Text>
            </View>
            <View style={[styles.statIconBox, styles.statIconBlue]}>
              <Text style={styles.statIconSymbol}>🎓</Text>
            </View>
          </View>

          {/* Card 2: Present */}
          <View style={[styles.statCard, styles.statCardGreen]}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>PRESENT</Text>
              <Text style={[styles.statValue, styles.statValueGreen]}>{totalPresent}</Text>
              <Text style={styles.statSub}>In View: {viewPresent}</Text>
            </View>
            <View style={[styles.statIconBox, styles.statIconGreen]}>
              <Text style={styles.statIconSymbol}>✓</Text>
            </View>
          </View>

          {/* Card 3: Absent */}
          <View style={[styles.statCard, styles.statCardRed]}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>ABSENT</Text>
              <Text style={[styles.statValue, styles.statValueRed]}>{totalAbsent}</Text>
              <Text style={styles.statSub}>In View: {viewAbsent}</Text>
            </View>
            <View style={[styles.statIconBox, styles.statIconRed]}>
              <Text style={styles.statIconSymbol}>✕</Text>
            </View>
          </View>

          {/* Card 4: Unmarked */}
          <View style={[styles.statCard, styles.statCardGray]}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>UNMARKED</Text>
              <Text style={[styles.statValue, styles.statValueGray]}>{totalUnmarked}</Text>
              <Text style={styles.statSub}>In View: {viewUnmarked}</Text>
            </View>
            <View style={[styles.statIconBox, styles.statIconGray]}>
              <Text style={styles.statIconSymbol}>⏳</Text>
            </View>
          </View>
        </View>

        {/* BULK ACTIONS & SUBMIT BAR */}
        <View style={styles.bulkRow}>
          <View style={styles.bulkLeft}>
            <TouchableOpacity onPress={handleSelectAllInView} style={styles.bulkCheckboxRow}>
              <View style={[styles.checkbox, allVisibleSelected && styles.checkboxActive]}>
                {allVisibleSelected ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.bulkCheckboxLabel}>Select All in View</Text>
            </TouchableOpacity>

            <View style={styles.selectedPill}>
              <Text style={styles.selectedPillText}>{selectedIds.length} Selected</Text>
            </View>
          </View>

          <View style={styles.bulkRight}>
            <TouchableOpacity
              onPress={() => handleBulkMark('present')}
              style={[styles.bulkBtn, styles.bulkBtnPresent]}
            >
              <Text style={styles.bulkBtnPresentText}>✓ Mark Present</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleBulkMark('absent')}
              style={[styles.bulkBtn, styles.bulkBtnAbsent]}
            >
              <Text style={styles.bulkBtnAbsentText}>✕ Mark Absent</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmitAttendance}
              disabled={submitting}
              style={[styles.submitMainBtn, hasEdits && styles.submitMainBtnHighlight]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitMainBtnText}>
                  💾 Submit Attendance Record
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* SUBMISSION STATUS NOTICE */}
        {submissionInfo ? (
          <View style={styles.submittedBanner}>
            <Text style={styles.submittedBannerText}>
              ✓ Attendance for this date was recorded by{' '}
              <Text style={{ fontWeight: '800' }}>
                {submissionInfo.submitted_by_name || 'Staff'}
              </Text>{' '}
              on {new Date(submissionInfo.updated_at || submissionInfo.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            </Text>
          </View>
        ) : null}

        {/* CONTENT LOADING */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.loadingText}>Loading attendance data...</Text>
          </View>
        ) : viewMode === 'table' ? (
          /* TABLE VIEW: ALL STUDENTS */
          <View style={styles.tableCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableInner}>
                {/* TABLE HEADER */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.th, styles.colIndex]}>#</Text>
                  <View style={styles.colCheck}>
                    <TouchableOpacity onPress={handleSelectAllInView}>
                      <View style={[styles.checkboxSmall, allVisibleSelected && styles.checkboxActive]}>
                        {allVisibleSelected ? <Text style={styles.checkboxTickSmall}>✓</Text> : null}
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.th, styles.colReg]}>Reg No</Text>
                  <Text style={[styles.th, styles.colName]}>Student Name</Text>
                  <Text style={[styles.th, styles.colClass]}>Class</Text>
                  <Text style={[styles.th, styles.colRoom]}>Room</Text>
                  <Text style={[styles.th, styles.colGatePass]}>Gate Pass</Text>
                  <Text style={[styles.th, styles.colAttendance]}>Attendance</Text>
                  <Text style={[styles.th, styles.colActions]}>Actions</Text>
                </View>

                {/* TABLE BODY */}
                {filteredStudents.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>No students matching filters.</Text>
                  </View>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const isChecked = selectedIds.includes(student.id);
                    const isPresent = student.status === 'present';
                    const isAbsent = student.status === 'absent';

                    return (
                      <View
                        key={student.id}
                        style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                      >
                        {/* Serial Number */}
                        <Text style={[styles.td, styles.colIndex]}>{idx + 1}</Text>

                        {/* Checkbox */}
                        <View style={styles.colCheck}>
                          <TouchableOpacity onPress={() => handleToggleSelect(student.id)}>
                            <View style={[styles.checkboxSmall, isChecked && styles.checkboxActive]}>
                              {isChecked ? <Text style={styles.checkboxTickSmall}>✓</Text> : null}
                            </View>
                          </TouchableOpacity>
                        </View>

                        {/* Reg No */}
                        <Text style={[styles.td, styles.colReg, styles.regText]}>
                          {student.registration_no}
                        </Text>

                        {/* Student Name */}
                        <Text style={[styles.td, styles.colName, styles.nameText]}>
                          {student.student_name}
                        </Text>

                        {/* Class */}
                        <View style={styles.colClass}>
                          <View style={styles.classBadge}>
                            <Text style={styles.classBadgeText}>{student.class_name}</Text>
                          </View>
                        </View>

                        {/* Room */}
                        <Text style={[styles.td, styles.colRoom, styles.roomText]}>
                          {student.room_name || '-'}
                        </Text>

                        {/* Gate Pass Badge */}
                        <View style={styles.colGatePass}>
                          {student.has_active_gatepass ? (
                            <TouchableOpacity
                              onPress={() =>
                                Alert.alert(
                                  'Active Gate Pass',
                                  `Token: ${student.active_gatepass_token || '-'}\nReason: ${student.active_gatepass_reason || 'Gate Pass Issued'}`
                                )
                              }
                              style={styles.activePassBadge}
                            >
                              <Text style={styles.activePassText}>🚫 Active Pass</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.noPassText}>-</Text>
                          )}
                        </View>

                        {/* Attendance Status Badge */}
                        <View style={styles.colAttendance}>
                          {isPresent ? (
                            <View style={styles.presentBadge}>
                              <Text style={styles.presentBadgeText}>✓ Present</Text>
                            </View>
                          ) : isAbsent ? (
                            <View style={styles.absentBadge}>
                              <Text style={styles.absentBadgeText}>✕ Absent</Text>
                            </View>
                          ) : (
                            <View style={styles.unmarkedBadge}>
                              <Text style={styles.unmarkedBadgeText}>⏳ Unmarked</Text>
                            </View>
                          )}
                        </View>

                        {/* Action Buttons: [✓ P] [✕ A] [↺] */}
                        <View style={[styles.colActions, styles.actionsRow]}>
                          <TouchableOpacity
                            onPress={() => handleSetStatus(student.id, 'present')}
                            style={[styles.actionBtn, styles.actionBtnP, isPresent && styles.actionBtnActive]}
                            
                          >
                            <Text style={styles.actionBtnPText}>✓ P</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleSetStatus(student.id, 'absent')}
                            style={[styles.actionBtn, styles.actionBtnA, isAbsent && styles.actionBtnActive]}
                            
                          >
                            <Text style={styles.actionBtnAText}>✕ A</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleReset(student.id)}
                            style={[styles.actionBtn, styles.actionBtnReset]}
                            
                          >
                            <Text style={styles.actionBtnResetText}>↺</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </View>
        ) : (
          /* ROOM GRID VIEW */
          <View style={styles.gridContainer}>
            {groupedByRoom.map(([roomName, roomStudents]) => {
              const rPresent = roomStudents.filter((s) => s.status === 'present').length;
              const rAbsent = roomStudents.filter((s) => s.status === 'absent').length;

              return (
                <View key={roomName} style={styles.roomCard}>
                  <View style={styles.roomCardHeader}>
                    <View>
                      <Text style={styles.roomCardTitle}>Room {roomName}</Text>
                      <Text style={styles.roomCardCounts}>
                        {roomStudents.length} Students • <Text style={{ color: '#16a34a', fontWeight: '800' }}>{rPresent} Present</Text> • <Text style={{ color: '#dc2626', fontWeight: '800' }}>{rAbsent} Absent</Text>
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        const ids = roomStudents.map((s) => s.id);
                        setStudents((prev) =>
                          prev.map((s) => (ids.includes(s.id) ? { ...s, status: 'present' } : s))
                        );
                      }}
                      style={styles.roomAllPresentBtn}
                    >
                      <Text style={styles.roomAllPresentText}>Mark All Present</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.roomStudentsList}>
                    {roomStudents.map((student) => {
                      const isP = student.status === 'present';
                      return (
                        <View key={student.id} style={styles.roomStudentItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.roomStudentName}>{student.student_name}</Text>
                            <Text style={styles.roomStudentSub}>
                              Reg: {student.registration_no} • {student.class_name}
                            </Text>
                            {student.has_active_gatepass ? (
                              <Text style={styles.roomActivePassTag}>🚫 Active Pass</Text>
                            ) : null}
                          </View>

                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => handleSetStatus(student.id, 'present')}
                              style={[styles.gridBtnP, isP && styles.gridBtnPActive]}
                            >
                              <Text style={[styles.gridBtnText, isP && styles.gridBtnTextActive]}>P</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleSetStatus(student.id, 'absent')}
                              style={[styles.gridBtnA, !isP && styles.gridBtnAActive]}
                            >
                              <Text style={[styles.gridBtnText, !isP && styles.gridBtnTextActive]}>A</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const webSelectStyle: any = {
  backgroundColor: '#fff',
  borderWidth: '1px',
  borderColor: '#cbd5e1',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '13px',
  fontWeight: '600',
  color: '#1e293b',
  outline: 'none',
  minHeight: '34px',
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  container: {
    padding: 12,
    maxWidth: 1680,
    alignSelf: 'center',
    width: '100%',
    gap: 12,
  },
  /* FILTER BAR */
  filterCard: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0369a1',
  },
  dateControlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minHeight: 34,
  },
  dateNavBtn: {
    backgroundColor: '#64748b',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dateNavBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  dateDisplayBox: {
    paddingHorizontal: 8,
  },
  dateDisplayText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  todayBtn: {
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  dropdownGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    minHeight: 34,
    minWidth: 180,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 4,
  },
  clearSearchBtn: {
    padding: 2,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '800',
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    overflow: 'hidden',
  },
  viewToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  viewToggleBtnActive: {
    backgroundColor: '#334155',
  },
  viewToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  viewToggleTextActive: {
    color: '#fff',
  },
  fetchBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fetchBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  refreshBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  refreshBtnText: {
    fontSize: 14,
  },

  /* 4 STAT CARDS */
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  statCardBlue: { borderColor: '#bfdbfe', borderLeftWidth: 4, borderLeftColor: '#2563eb' },
  statCardGreen: { borderColor: '#bbf7d0', borderLeftWidth: 4, borderLeftColor: '#16a34a' },
  statCardRed: { borderColor: '#fecaca', borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  statCardGray: { borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: '#64748b' },

  statContent: {
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '900',
  },
  statValueBlue: { color: '#1d4ed8' },
  statValueGreen: { color: '#15803d' },
  statValueRed: { color: '#b91c1c' },
  statValueGray: { color: '#475569' },
  statSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  statIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconBlue: { backgroundColor: '#eff6ff' },
  statIconGreen: { backgroundColor: '#f0fdf4' },
  statIconRed: { backgroundColor: '#fef2f2' },
  statIconGray: { backgroundColor: '#f8fafc' },
  statIconSymbol: {
    fontSize: 20,
  },

  /* BULK ACTIONS ROW */
  bulkRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  bulkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bulkCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxSmall: {
    width: 17,
    height: 17,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  checkboxTickSmall: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  bulkCheckboxLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  selectedPill: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  selectedPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  bulkRight: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  bulkBtn: {
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  bulkBtnPresent: {
    backgroundColor: '#16a34a',
  },
  bulkBtnPresentText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  bulkBtnAbsent: {
    backgroundColor: '#dc2626',
  },
  bulkBtnAbsentText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  submitMainBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  submitMainBtnHighlight: {
    backgroundColor: '#059669',
  },
  submitMainBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },

  /* SUBMIT NOTICE */
  submittedBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 6,
    padding: 8,
    paddingHorizontal: 12,
  },
  submittedBannerText: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '600',
  },

  /* TABLE */
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  tableInner: {
    minWidth: 1080,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  th: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  td: {
    fontSize: 12,
    color: '#1e293b',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: '#fafbfc',
  },

  /* COLUMN WIDTHS */
  colIndex: { width: 36, textAlign: 'center' },
  colCheck: { width: 36, alignItems: 'center' },
  colReg: { width: 90, paddingLeft: 6 },
  colName: { width: 220, paddingLeft: 6 },
  colClass: { width: 120 },
  colRoom: { width: 100 },
  colGatePass: { width: 130, alignItems: 'center' },
  colAttendance: { width: 120, alignItems: 'center' },
  colActions: { width: 140, alignItems: 'center' },

  regText: { fontWeight: '700', color: '#0f172a' },
  nameText: { fontWeight: '700', color: '#1e293b' },
  roomText: { fontWeight: '600', color: '#475569' },

  classBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 2,
    paddingHorizontal: 6,
    alignSelf: 'flex-start',
  },
  classBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },

  activePassBadge: {
    backgroundColor: '#dc2626',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  activePassText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  noPassText: {
    color: '#94a3b8',
    fontSize: 13,
  },

  presentBadge: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  presentBadgeText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  absentBadge: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  absentBadgeText: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '800',
  },
  unmarkedBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  unmarkedBadgeText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderWidth: 1,
  },
  actionBtnP: {
    backgroundColor: '#16a34a',
    borderColor: '#15803d',
  },
  actionBtnPText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  actionBtnA: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
  actionBtnAText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  actionBtnReset: {
    backgroundColor: '#fff',
    borderColor: '#cbd5e1',
  },
  actionBtnResetText: {
    color: '#64748b',
    fontWeight: '900',
    fontSize: 12,
  },
  actionBtnActive: {
    opacity: 0.9,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },

  /* ROOM GRID */
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  roomCard: {
    width: '32%',
    minWidth: 320,
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  roomCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  roomCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  roomCardCounts: {
    fontSize: 11,
    color: '#64748b',
  },
  roomAllPresentBtn: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roomAllPresentText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  roomStudentsList: {
    gap: 6,
  },
  roomStudentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
  },
  roomStudentName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  roomStudentSub: {
    fontSize: 11,
    color: '#64748b',
  },
  roomActivePassTag: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 10,
    marginTop: 2,
  },
  gridBtnP: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  gridBtnPActive: {
    backgroundColor: '#16a34a',
    borderColor: '#15803d',
  },
  gridBtnA: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  gridBtnAActive: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
  gridBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  gridBtnTextActive: {
    color: '#fff',
  },

  /* GENERAL */
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
  },
});
