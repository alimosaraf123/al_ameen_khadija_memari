import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { api, API_BASE } from '../lib/api';
import { getUser } from '../lib/auth';

type DayCol = {
  date: string;
  day: string;
  number: number;
};

type PunchDetail = {
  status: string;
  punch_in: string | null;
  punch_out: string | null;
  distance: number | null;
  marked_by: number | null;
};

type StaffMember = {
  id: number;
  staff_id: string;
  name: string;
  photo_url?: string;
  designation?: string;
  attendance: Record<string, string>;
  details?: Record<string, PunchDetail>;
};

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const YEARS = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 0, label: 'All' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'All', label: 'All Statuses' },
  { value: 'Present', label: '✓ Present (P)' },
  { value: 'Absent', label: '✗ Absent (A)' },
  { value: 'Late', label: '⏱ Late (L)' },
  { value: 'Leave', label: '🏖 Leave (LV)' },
  { value: 'Unmarked', label: '⚪ Not Marked' },
];

const STATUS_CYCLE = ['Present', 'Absent', 'Late', 'Leave', ''];

const getTodayDateStr = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const formatPunchTime = (isoString?: string | null) => {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '--';
  }
};

const formatPunchDuration = (inIso?: string | null, outIso?: string | null) => {
  if (!inIso) return '--';
  try {
    const start = new Date(inIso).getTime();
    const end = outIso ? new Date(outIso).getTime() : Date.now();
    if (isNaN(start) || isNaN(end) || end < start) return '--';
    const diffSec = Math.floor((end - start) / 1000);
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    return `${hrs}h ${mins}m`;
  } catch {
    return '--';
  }
};

const formatFullDate = (dateStr: string) => {
  try {
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    return dt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      weekday: 'short',
    });
  } catch {
    return dateStr;
  }
};

export default function TeacherAttendance() {
  const { width: viewportWidth } = useWindowDimensions();
  const isCompactViewport = viewportWidth < 768;
  const colHashStyle = isCompactViewport ? { width: 32 } : s.colHash;
  const colPhotoStyle = isCompactViewport ? { width: 44 } : s.colPhoto;
  const colIdStyle = isCompactViewport ? { width: 54 } : s.colId;
  const colNameStyle = isCompactViewport ? { width: 124 } : s.colName;
  const todayStr = useMemo(() => getTodayDateStr(), []);
  const todayObj = useMemo(() => new Date(), []);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    void getUser<any>().then(u => {
      const role = String(u?.role || '').toLowerCase();
      setIsSuperAdmin(role === 'super_admin' || role === 'superadmin');
    });
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(() =>
    String(todayObj.getMonth() + 1).padStart(2, '0')
  );
  const [selectedYear, setSelectedYear] = useState(() =>
    String(todayObj.getFullYear())
  );

  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const [days, setDays] = useState<DayCol[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [pageSizePickerOpen, setPageSizePickerOpen] = useState(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [sortField, setSortField] = useState<'id' | 'name' | 'default'>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Punch Details & Daily In/Out Timings states
  const [interactionMode, setInteractionMode] = useState<'details' | 'quick'>('details');
  const [selectedPunchCell, setSelectedPunchCell] = useState<{
    staff: StaffMember;
    date: string;
    details?: PunchDetail;
  } | null>(null);
  const [punchDetailsModalOpen, setPunchDetailsModalOpen] = useState(false);

  const [dailyPunchLogModalOpen, setDailyPunchLogModalOpen] = useState(false);
  const [selectedLogDate, setSelectedLogDate] = useState<string>(() => todayStr);
  const [logStaffList, setLogStaffList] = useState<any[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');

  const monthParam = `${selectedYear}-${selectedMonth}`;

  const loadGrid = async (targetMonth: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api(
        `/api/teachers/attendance/monthly-grid?month=${encodeURIComponent(targetMonth)}`
      );
      if (data.success) {
        setDays(data.days || []);
        setStaffList(data.staff || []);
        setPage(1);
      } else {
        setError(data.message || 'Failed to load attendance');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGrid(monthParam);
  }, []);

  const handleGo = () => {
    void loadGrid(monthParam);
  };

  // Compute distinct roles with counts
  const roleOptions = useMemo(() => {
    const map = new Map<string, number>();
    staffList.forEach(s => {
      let d = String(s.designation || 'Staff').trim();
      if (!d) d = 'Staff';
      if (d.toLowerCase() === 'teacher' || d.toLowerCase() === 'teachers') {
        d = 'Teachers';
      }
      map.set(d, (map.get(d) || 0) + 1);
    });

    const sortedRoles = Array.from(map.keys()).sort((a, b) => {
      if (a === 'Teachers') return -1;
      if (b === 'Teachers') return 1;
      return (map.get(b) || 0) - (map.get(a) || 0);
    });

    return [
      { value: 'All', label: `All Roles (${staffList.length})` },
      ...sortedRoles.map(r => ({
        value: r,
        label: `${r} (${map.get(r)})`,
      })),
    ];
  }, [staffList]);

  // Filtered & Sorted Staff List
  const filteredStaff = useMemo(() => {
    let list = [...staffList];

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s => {
        const name = String(s.name || '').toLowerCase();
        const staffId = String(s.staff_id || '').toLowerCase();
        const desig = String(s.designation || '').toLowerCase();
        return name.includes(q) || staffId.includes(q) || desig.includes(q);
      });
    }

    // 2. Role / Designation Filter
    if (selectedRole !== 'All') {
      const target = selectedRole.toLowerCase();
      list = list.filter(s => {
        let d = String(s.designation || 'Staff').trim().toLowerCase();
        if (target === 'teachers' || target === 'teacher') {
          return d === 'teacher' || d === 'teachers';
        }
        return d === target;
      });
    }

    // 3. Today's Status Filter
    if (selectedStatus !== 'All') {
      list = list.filter(s => {
        const st = s.attendance?.[todayStr] || '';
        if (selectedStatus === 'Unmarked') {
          return !st;
        }
        return st.toLowerCase() === selectedStatus.toLowerCase();
      });
    }

    // 4. Sorting
    if (sortField === 'name') {
      list.sort((a, b) => {
        const cmp = String(a.name || '').localeCompare(String(b.name || ''));
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    } else if (sortField === 'id') {
      list.sort((a, b) => {
        const aId = String(a.staff_id || '');
        const bId = String(b.staff_id || '');
        const aNum = parseInt(aId.replace(/\D/g, ''), 10);
        const bNum = parseInt(bId.replace(/\D/g, ''), 10);
        let cmp = 0;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = aId.localeCompare(bId);
        }
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [staffList, searchQuery, selectedRole, selectedStatus, sortField, sortDirection, todayStr]);

  const effectivePageSize = pageSize === 0 ? Math.max(1, filteredStaff.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / effectivePageSize));
  const paginatedStaff = useMemo(() => {
    if (pageSize === 0) return filteredStaff;
    const start = (page - 1) * pageSize;
    return filteredStaff.slice(start, start + pageSize);
  }, [filteredStaff, page, pageSize]);

  const handleSort = (field: 'id' | 'name') => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField('default');
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const markAllPresent = async (targetDate: string = todayStr) => {
    if (targetDate > todayStr) {
      Alert.alert('Not allowed', 'Cannot mark attendance for future dates.');
      return;
    }

    if (targetDate < todayStr && !isSuperAdmin) {
      Alert.alert('Attendance Locked', 'শুধুমাত্র Super Admin পেছনের তারিখের (Back Date) স্টাফ হাজিরা দিতে বা পরিবর্তন করতে পারবেন।');
      return;
    }

    const [tYear, tMonth] = targetDate.split('-');
    const isCurrentView = tYear === selectedYear && tMonth === selectedMonth;

    // Optimistic UI update for all active staff
    setStaffList(prev =>
      prev.map(item => ({
        ...item,
        attendance: {
          ...(item.attendance || {}),
          [targetDate]: 'Present',
        },
      }))
    );

    setBulkSaving(true);
    setSuccessMsg(`Marking all active staff as Present for ${targetDate}...`);

    try {
      const res = await api('/api/teachers/attendance/mark-all-present', {
        method: 'POST',
        body: JSON.stringify({ date: targetDate }),
      });

      if (res.success) {
        setSuccessMsg(`✓ All ${res.count || staffList.length} staff marked Present for ${targetDate}`);
        if (!isCurrentView) {
          setSelectedYear(tYear);
          setSelectedMonth(tMonth);
          void loadGrid(`${tYear}-${tMonth}`);
        }
        setTimeout(() => setSuccessMsg(''), 4500);
      } else {
        throw new Error(res.message || 'Failed to mark all staff present');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to mark all staff present');
      void loadGrid(monthParam);
    } finally {
      setBulkSaving(false);
    }
  };

  const openDailyPunchLog = async (targetDate: string = todayStr) => {
    setSelectedLogDate(targetDate);
    setDailyPunchLogModalOpen(true);
    setLoadingLog(true);
    try {
      const res = await api(`/api/teachers/attendance?date=${encodeURIComponent(targetDate)}`);
      if (res.success) {
        setLogStaffList(res.staff || []);
      } else {
        Alert.alert('Error', res.message || 'Failed to load daily attendance');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load daily attendance');
    } finally {
      setLoadingLog(false);
    }
  };

  const filteredDailyLog = useMemo(() => {
    if (!logSearchQuery.trim()) return logStaffList;
    const q = logSearchQuery.trim().toLowerCase();
    return logStaffList.filter((s: any) =>
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.staff_id || '').toLowerCase().includes(q) ||
      String(s.designation || '').toLowerCase().includes(q)
    );
  }, [logStaffList, logSearchQuery]);

  const updateCellStatus = async (staffId: number, dateStr: string, nextVal: string) => {
    if (dateStr > todayStr) {
      Alert.alert('Not allowed', 'Cannot edit attendance for future dates.');
      return;
    }
    if (dateStr < todayStr && !isSuperAdmin) {
      Alert.alert('Attendance Locked', 'শুধুমাত্র Super Admin পেছনের তারিখের (Back Date) স্টাফ হাজিরা পরিবর্তন বা এন্ট্রি করতে পারবেন।');
      return;
    }

    const currentStaff = staffList.find(s => s.id === staffId);
    const currentVal = currentStaff?.attendance?.[dateStr] || '';
    const currentDetail = currentStaff?.details?.[dateStr];

    // Optimistic UI update
    setStaffList(prev =>
      prev.map(item =>
        item.id === staffId
          ? {
            ...item,
            attendance: {
              ...(item.attendance || {}),
              [dateStr]: nextVal,
            },
            details: {
              ...(item.details || {}),
              [dateStr]: {
                status: nextVal,
                punch_in: currentDetail?.punch_in || null,
                punch_out: currentDetail?.punch_out || null,
                distance: currentDetail?.distance || null,
                marked_by: currentDetail?.marked_by || null,
              },
            },
          }
          : item
      )
    );

    if (selectedPunchCell && selectedPunchCell.staff.id === staffId && selectedPunchCell.date === dateStr) {
      setSelectedPunchCell(prev => prev ? {
        ...prev,
        details: {
          status: nextVal,
          punch_in: currentDetail?.punch_in || null,
          punch_out: currentDetail?.punch_out || null,
          distance: currentDetail?.distance || null,
          marked_by: currentDetail?.marked_by || null,
        },
      } : null);
    }

    const cellKey = `${staffId}_${dateStr}`;
    setSavingCell(cellKey);
    try {
      await api('/api/teachers/attendance', {
        method: 'POST',
        body: JSON.stringify({
          date: dateStr,
          teacher_id: staffId,
          status: nextVal,
        }),
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save attendance');
      // Revert on error
      setStaffList(prev =>
        prev.map(item =>
          item.id === staffId
            ? {
              ...item,
              attendance: {
                ...(item.attendance || {}),
                [dateStr]: currentVal,
              },
              details: {
                ...(item.details || {}),
                [dateStr]: currentDetail || {
                  status: currentVal,
                  punch_in: null,
                  punch_out: null,
                  distance: null,
                  marked_by: null,
                },
              },
            }
            : item
        )
      );
    } finally {
      setSavingCell(null);
    }
  };

  const cycleStatus = async (staffId: number, dateStr: string) => {
    const currentStaff = staffList.find(s => s.id === staffId);
    const currentVal = currentStaff?.attendance?.[dateStr] || '';
    const currentIndex = STATUS_CYCLE.indexOf(currentVal);
    const nextVal = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
    await updateCellStatus(staffId, dateStr, nextVal);
  };

  const handleCellClick = (person: StaffMember, dateStr: string) => {
    if (dateStr > todayStr) return;
    const detail = person.details?.[dateStr];
    if (interactionMode === 'details') {
      setSelectedPunchCell({
        staff: person,
        date: dateStr,
        details: detail,
      });
      setPunchDetailsModalOpen(true);
      return;
    }
    void cycleStatus(person.id, dateStr);
  };

  const getStatusSymbol = (status?: string) => {
    if (!status) return '';
    switch (status) {
      case 'Present':
        return 'P';
      case 'Absent':
        return 'A';
      case 'Late':
        return 'L';
      case 'Leave':
        return 'LV';
      default:
        return '';
    }
  };

  const selectedMonthLabel =
    MONTHS.find(m => m.value === selectedMonth)?.label || 'November';

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <AcademyHeader />

        <View style={s.topNav}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.replace('/superadmin?menu=staff')}
          >
            <Text style={s.backBtnText}>← Back to Staff</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Text style={s.pageTitle}>Staff Attendance</Text>
            {isSuperAdmin && (
              <View style={s.superAdminBadge}>
                <Text style={s.superAdminBadgeText}>👑 Super Admin (Back Date Enabled)</Text>
              </View>
            )}
          </View>
        </View>

        {!!error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {!!successMsg && (
          <View style={s.successBox}>
            <Text style={s.successText}>{successMsg}</Text>
            <TouchableOpacity onPress={() => setSuccessMsg('')}>
              <Text style={s.successDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Toolbar matching Image 1 */}
        <View style={s.toolbar}>
          <View style={s.filterGroup}>
            {/* Month Dropdown */}
            <TouchableOpacity
              style={s.dropdownBtn}
              onPress={() => setMonthPickerOpen(true)}
            >
              <Text style={s.dropdownBtnText}>{selectedMonthLabel}</Text>
              <Text style={s.dropdownArrow}>⌵</Text>
            </TouchableOpacity>

            {/* Year Dropdown */}
            <TouchableOpacity
              style={s.dropdownBtn}
              onPress={() => setYearPickerOpen(true)}
            >
              <Text style={s.dropdownBtnText}>{selectedYear}</Text>
              <Text style={s.dropdownArrow}>⌵</Text>
            </TouchableOpacity>

            {/* Go Button */}
            <TouchableOpacity
              style={s.goBtn}
              onPress={handleGo}
              disabled={loading}
            >
              <Text style={s.goBtnText}>{loading ? '...' : 'Go'}</Text>
            </TouchableOpacity>

            {/* One-Click Present All Button */}
            <TouchableOpacity
              style={[s.presentAllBtn, bulkSaving && s.presentAllBtnDisabled]}
              onPress={() => markAllPresent(todayStr)}
              disabled={bulkSaving || loading}
              activeOpacity={0.8}
            >
              {bulkSaving ? (
                <View style={s.presentAllInner}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={s.presentAllBtnText}>Saving...</Text>
                </View>
              ) : (
                <View style={s.presentAllInner}>
                  <Text style={s.presentAllIcon}>✓</Text>
                  <Text style={s.presentAllBtnText}>One-Click Present All</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Daily In/Out Timings Log Button */}
            <TouchableOpacity
              style={s.punchLogHeaderBtn}
              onPress={() => void openDailyPunchLog(todayStr)}
              activeOpacity={0.8}
            >
              <Text style={s.punchLogHeaderBtnIcon}>⏱️</Text>
              <Text style={s.punchLogHeaderBtnText}>Punch Timings (ইন-আউট সময়)</Text>
            </TouchableOpacity>
          </View>

          {/* Page Size & Pagination controls */}
          <View style={s.paginationWrapper}>
            <View style={s.pageSizeGroup}>
              <Text style={s.pageSizeLabel}>Show:</Text>
              <TouchableOpacity
                style={s.pageSizeBtn}
                onPress={() => setPageSizePickerOpen(true)}
                activeOpacity={0.7}
                accessibilityLabel="Select staff count per page"
              >
                <Text style={s.pageSizeBtnText}>
                  {pageSize === 0 ? 'All' : pageSize}
                </Text>
                <Text style={s.dropdownArrow}>⌵</Text>
              </TouchableOpacity>
            </View>

            <View style={s.paginationGroup}>
              <TouchableOpacity
                disabled={page <= 1}
                onPress={() => setPage(p => Math.max(1, p - 1))}
                style={[s.pageArrowBtn, page <= 1 && s.disabledBtn]}
              >
                <Text style={s.pageArrowText}>←</Text>
              </TouchableOpacity>
              <Text style={s.pageStatusText}>
                Page {page} of {totalPages}
              </Text>
              <TouchableOpacity
                disabled={page >= totalPages}
                onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                style={[s.pageArrowBtn, page >= totalPages && s.disabledBtn]}
              >
                <Text style={s.pageArrowText}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Filter Bar (Search, Role, Status, Reset, Count) */}
        <View style={s.filterBar}>
          {/* Search Box */}
          <View style={s.searchBox}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search by name, ID or role..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={text => {
                setSearchQuery(text);
                setPage(1);
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
                style={s.clearSearchBtn}
                accessibilityLabel="Clear search"
              >
                <Text style={s.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Role / Designation Filter */}
          <View style={s.filterItem}>
            <Text style={s.filterLabel}>Role:</Text>
            <TouchableOpacity
              style={s.filterSelectBtn}
              onPress={() => setRolePickerOpen(true)}
              activeOpacity={0.7}
              accessibilityLabel="Filter by role"
            >
              <Text style={s.filterSelectBtnText} numberOfLines={1}>
                {selectedRole === 'All' ? 'All Roles' : selectedRole}
              </Text>
              <Text style={s.dropdownArrow}>⌵</Text>
            </TouchableOpacity>
          </View>

          {/* Today's Status Filter */}
          <View style={s.filterItem}>
            <Text style={s.filterLabel}>Today Status:</Text>
            <TouchableOpacity
              style={s.filterSelectBtn}
              onPress={() => setStatusPickerOpen(true)}
              activeOpacity={0.7}
              accessibilityLabel="Filter by today's attendance status"
            >
              <Text style={s.filterSelectBtnText} numberOfLines={1}>
                {STATUS_FILTER_OPTIONS.find(o => o.value === selectedStatus)?.label || selectedStatus}
              </Text>
              <Text style={s.dropdownArrow}>⌵</Text>
            </TouchableOpacity>
          </View>

          {/* Reset Filters button */}
          {(searchQuery.trim() !== '' || selectedRole !== 'All' || selectedStatus !== 'All' || sortField !== 'default') && (
            <TouchableOpacity
              style={s.resetBtn}
              onPress={() => {
                setSearchQuery('');
                setSelectedRole('All');
                setSelectedStatus('All');
                setSortField('default');
                setSortDirection('asc');
                setPage(1);
              }}
              activeOpacity={0.7}
            >
              <Text style={s.resetBtnText}>↺ Reset</Text>
            </TouchableOpacity>
          )}

          {/* Mode Toggle: View In/Out Details vs Quick Toggle */}
          <View style={s.modeToggleWrap}>
            <Text style={s.modeToggleLabel}>Cell Click:</Text>
            <View style={s.modeToggleGroup}>
              <TouchableOpacity
                style={[s.modeToggleBtn, interactionMode === 'details' && s.modeToggleBtnActive]}
                onPress={() => setInteractionMode('details')}
                activeOpacity={0.7}
              >
                <Text style={[s.modeToggleText, interactionMode === 'details' && s.modeToggleTextActive]}>
                  ℹ️ In/Out Details
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modeToggleBtn, interactionMode === 'quick' && s.modeToggleBtnActive]}
                onPress={() => setInteractionMode('quick')}
                activeOpacity={0.7}
              >
                <Text style={[s.modeToggleText, interactionMode === 'quick' && s.modeToggleTextActive]}>
                  ⚡ Quick Toggle
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Count Badge */}
          <View style={s.countBadge}>
            <Text style={s.countBadgeText}>
              {filteredStaff.length} of {staffList.length} Staff
            </Text>
          </View>
        </View>

        {/* Attendance Grid Card */}
        <View style={s.card}>
          {loading && !staffList.length ? (
            <View style={s.centerLoading}>
              <ActivityIndicator size="large" color="#0d6efd" />
              <Text style={s.loadingText}>Loading attendance sheet...</Text>
            </View>
          ) : paginatedStaff.length === 0 ? (
            <View style={s.noStaffRow}>
              <Text style={s.noStaffText}>
                No staff members match the current filter or search.
              </Text>
            </View>
          ) : (
            <View style={s.frozenTableWrapper}>
              {/* LEFT FROZEN COLUMNS: #, Photo, ID, Staff Name */}
              <View style={s.frozenLeftPane}>
                {/* Left Header Row */}
                <View style={[s.row, s.stickyHeaderRow, s.headerRowHeight]}>
                  <View style={[colHashStyle, s.thCell, s.headerRowHeight]}>
                    <Text style={s.thText}>#</Text>
                  </View>
                  <View style={[colPhotoStyle, s.thCell, s.headerRowHeight]}>
                    <Text style={s.thText}>Photo</Text>
                  </View>
                  <TouchableOpacity
                    style={[colIdStyle, s.thCell, s.thInteractiveCell, s.headerRowHeight]}
                    onPress={() => handleSort('id')}
                    activeOpacity={0.7}
                    accessibilityLabel="Sort by Staff ID"
                  >
                    <View style={s.thSortInner}>
                      <Text style={s.thText}>ID</Text>
                      <Text style={s.thSortArrow}>
                        {sortField === 'id' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[colNameStyle, s.thCell, s.thInteractiveCell, s.headerRowHeight, { paddingLeft: 6 }]}
                    onPress={() => handleSort('name')}
                    activeOpacity={0.7}
                    accessibilityLabel="Sort by Staff Name"
                  >
                    <View style={s.thSortInnerName}>
                      <Text style={[s.thText, { textAlign: 'left' }]} numberOfLines={1}>Staff Name</Text>
                      <Text style={s.thSortArrow}>
                        {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Left Body Rows */}
                {paginatedStaff.map((person, idx) => {
                  const rowNumber =
                    pageSize === 0 ? idx + 1 : (page - 1) * pageSize + idx + 1;
                  return (
                    <View key={`left-${person.id}`} style={[s.row, s.bodyRowHeight]}>
                      {/* # Col */}
                      <View style={[colHashStyle, s.fixedTdCell, s.bodyRowHeight]}>
                        <Text style={s.hashText}>{rowNumber}</Text>
                      </View>

                      {/* Photo Col */}
                      <View style={[colPhotoStyle, s.fixedTdCell, s.bodyRowHeight]}>
                        {person.photo_url ? (
                          <Image
                            source={{
                              uri: /^https?:/.test(person.photo_url)
                                ? person.photo_url
                                : API_BASE + person.photo_url,
                            }}
                            style={[s.avatarImg, isCompactViewport && { width: 30, height: 30, borderRadius: 15 }]}
                          />
                        ) : (
                          <View style={[s.avatarPlaceholder, isCompactViewport && { width: 30, height: 30, borderRadius: 15 }]}>
                            <Text style={[s.avatarLetter, isCompactViewport && { fontSize: 13 }]}>
                              {person.name.trim().charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* ID Col */}
                      <View style={[colIdStyle, s.fixedTdCell, s.bodyRowHeight]}>
                        <Text style={[s.idText, isCompactViewport && { fontSize: 11.5 }]} numberOfLines={1}>{person.staff_id}</Text>
                      </View>

                      {/* Name Col */}
                      <View style={[colNameStyle, s.fixedTdCell, s.nameCellContent, s.bodyRowHeight]}>
                        <Text style={[s.nameText, isCompactViewport && { fontSize: 12 }]} numberOfLines={1}>
                          {person.name}
                        </Text>
                        <Text style={[s.designationText, isCompactViewport && { fontSize: 10 }]} numberOfLines={1}>
                          {person.designation || 'Staff'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* RIGHT SCROLLABLE PANE: Days 1..30/31 */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={s.scrollableRightPane}
              >
                <View>
                  {/* Day Header Row */}
                  <View style={[s.row, s.stickyHeaderRow, s.headerRowHeight]}>
                    {days.map(day => {
                      const isToday = day.date === todayStr;
                      const isPast = day.date < todayStr;
                      if (!isToday) {
                        if (isPast && isSuperAdmin) {
                          return (
                            <TouchableOpacity
                              key={day.date}
                              activeOpacity={0.7}
                              onPress={() => markAllPresent(day.date)}
                              accessibilityLabel={`Mark all present for ${day.date}`}
                              style={[
                                s.colDay,
                                s.thCell,
                                s.headerRowHeight,
                                s.pastSuperAdminHeaderCell,
                              ]}
                            >
                              <Text style={s.thDayName}>{day.day}</Text>
                              <Text style={s.thDayNumber}>{day.number}</Text>
                              <View style={s.thPastQuickAllBadge}>
                                <Text style={s.thPastQuickAllBadgeText}>✓ All</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        }
                        return (
                          <View
                            key={day.date}
                            style={[s.colDay, s.thCell, s.headerRowHeight]}
                          >
                            <Text style={s.thDayName}>{day.day}</Text>
                            <Text style={s.thDayNumber}>{day.number}</Text>
                          </View>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={day.date}
                          activeOpacity={0.7}
                          onPress={() => markAllPresent(day.date)}
                          accessibilityLabel={`Mark all present for today (${day.date})`}
                          style={[
                            s.colDay,
                            s.thCell,
                            s.headerRowHeight,
                            s.todayHeaderCell,
                          ]}
                        >
                          <Text
                            style={[
                              s.thDayName,
                              s.todayHeaderText,
                            ]}
                          >
                            {day.day}
                          </Text>
                          <Text
                            style={[
                              s.thDayNumber,
                              s.todayHeaderText,
                            ]}
                          >
                            {day.number}
                          </Text>
                          <View style={s.thQuickAllBadge}>
                            <Text style={s.thQuickAllBadgeText}>✓ All</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Day Body Rows */}
                  {paginatedStaff.map(person => (
                    <View key={`days-${person.id}`} style={[s.row, s.bodyRowHeight]}>
                      {days.map(day => {
                        const dateKey = day.date;
                        const isFuture = dateKey > todayStr;
                        const isToday = dateKey === todayStr;
                        const isPast = dateKey < todayStr;
                        const val = person.attendance?.[dateKey];
                        const symbol = getStatusSymbol(val);
                        const detail = person.details?.[dateKey];
                        const hasPunch = Boolean(detail?.punch_in || detail?.punch_out);
                        const isSavingThis = savingCell === `${person.id}_${dateKey}`;

                        if (isFuture) {
                          return (
                            <View
                              key={dateKey}
                              style={[s.colDay, s.tdCell, s.bodyRowHeight, s.futureDayCell]}
                            />
                          );
                        }

                        const tooltipText = hasPunch
                          ? `${person.name} (${dateKey}):\n🟢 IN: ${formatPunchTime(detail?.punch_in)}\n🔴 OUT: ${formatPunchTime(detail?.punch_out)}\n⏱️ Hours: ${formatPunchDuration(detail?.punch_in, detail?.punch_out)}\n📍 Dist: ${detail?.distance != null ? detail.distance + 'm' : 'Campus'}`
                          : `${person.name} (${dateKey}): ${symbol ? (val || symbol) : 'Not Marked'}`;

                        return (
                          <TouchableOpacity
                            key={dateKey}
                            activeOpacity={0.65}
                            onPress={() => handleCellClick(person, dateKey)}
                            {...(Platform.OS === 'web' ? { title: tooltipText } : {})}
                            style={[
                              s.colDay,
                              s.tdCell,
                              s.bodyRowHeight,
                              s.activeDayCell,
                              isToday && s.todayBodyCell,
                              isPast && !isSuperAdmin && interactionMode === 'quick' && s.pastDayCell,
                            ]}
                          >
                            {isSavingThis ? (
                              <ActivityIndicator size="small" color="#0d6efd" />
                            ) : (
                              <>
                                <Text
                                  style={[
                                    s.statusSymbolText,
                                    symbol === 'A' && s.absentColor,
                                    symbol === 'P' && s.presentColor,
                                    (symbol === 'L' || symbol === 'LV') && s.lateColor,
                                  ]}
                                >
                                  {symbol}
                                </Text>
                                {hasPunch && <View style={s.punchDot} />}
                              </>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Quick legend footer */}
          <View style={s.footerLegend}>
            <Text style={s.legendTitle}>Legend (Today):</Text>
            <View style={s.legendItem}>
              <Text style={[s.legendBadge, s.presentColor]}>P</Text>
              <Text style={s.legendLabel}>Present</Text>
            </View>
            <View style={s.legendItem}>
              <Text style={[s.legendBadge, s.absentColor]}>A</Text>
              <Text style={s.legendLabel}>Absent</Text>
            </View>
            <View style={s.legendItem}>
              <Text style={[s.legendBadge, s.lateColor]}>L</Text>
              <Text style={s.legendLabel}>Late</Text>
            </View>
            <View style={s.legendItem}>
              <Text style={[s.legendBadge, s.lateColor]}>LV</Text>
              <Text style={s.legendLabel}>Leave</Text>
            </View>
            <View style={s.legendItem}>
              <View style={s.punchDotLegend} />
              <Text style={s.legendLabel}>Mobile Punch (ইন/আউট টাইম আছে)</Text>
            </View>
            <Text style={s.autoSaveHint}>
              {isSuperAdmin
                ? '• Super Admin Access: You can edit attendance for both Today and Back Dates • Future dates are locked'
                : "• Only today's attendance can be edited • Back dates are locked (Super Admin only) • Future dates are locked"}
            </Text>
          </View>
        </View>

        {/* Month Selection Modal */}
        <Modal
          visible={monthPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMonthPickerOpen(false)}
        >
          <Pressable
            style={s.modalBackdrop}
            onPress={() => setMonthPickerOpen(false)}
          >
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Select Month</Text>
              {MONTHS.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[
                    s.modalOption,
                    selectedMonth === m.value && s.modalOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedMonth(m.value);
                    setMonthPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      s.modalOptionText,
                      selectedMonth === m.value && s.modalOptionTextSelected,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* Year Selection Modal */}
        <Modal
          visible={yearPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setYearPickerOpen(false)}
        >
          <Pressable
            style={s.modalBackdrop}
            onPress={() => setYearPickerOpen(false)}
          >
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Select Year</Text>
              {YEARS.map(yr => (
                <TouchableOpacity
                  key={yr}
                  style={[
                    s.modalOption,
                    selectedYear === yr && s.modalOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedYear(yr);
                    setYearPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      s.modalOptionText,
                      selectedYear === yr && s.modalOptionTextSelected,
                    ]}
                  >
                    {yr}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* Page Size Selection Modal */}
        <Modal
          visible={pageSizePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPageSizePickerOpen(false)}
        >
          <Pressable
            style={s.modalBackdrop}
            onPress={() => setPageSizePickerOpen(false)}
          >
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Show Staff Per Page</Text>
              {PAGE_SIZE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    s.modalOption,
                    pageSize === opt.value && s.modalOptionSelected,
                  ]}
                  onPress={() => {
                    setPageSize(opt.value);
                    setPage(1);
                    setPageSizePickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      s.modalOptionText,
                      pageSize === opt.value && s.modalOptionTextSelected,
                    ]}
                  >
                    {opt.label === 'All' ? 'All (Show All Staff)' : `${opt.label} per page`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* Role Selection Modal */}
        <Modal
          visible={rolePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setRolePickerOpen(false)}
        >
          <Pressable
            style={s.modalBackdrop}
            onPress={() => setRolePickerOpen(false)}
          >
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Filter by Role / Designation</Text>
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator>
                {roleOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      s.modalOption,
                      selectedRole === opt.value && s.modalOptionSelected,
                    ]}
                    onPress={() => {
                      setSelectedRole(opt.value);
                      setPage(1);
                      setRolePickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        s.modalOptionText,
                        selectedRole === opt.value && s.modalOptionTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* Status Selection Modal */}
        <Modal
          visible={statusPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setStatusPickerOpen(false)}
        >
          <Pressable
            style={s.modalBackdrop}
            onPress={() => setStatusPickerOpen(false)}
          >
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Filter by Today's Status</Text>
              {STATUS_FILTER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    s.modalOption,
                    selectedStatus === opt.value && s.modalOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedStatus(opt.value);
                    setPage(1);
                    setStatusPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      s.modalOptionText,
                      selectedStatus === opt.value && s.modalOptionTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* Punch Details Modal (Mobile IN/OUT Timings) */}
        <Modal
          visible={punchDetailsModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPunchDetailsModalOpen(false)}
        >
          <Pressable style={s.modalBackdrop} onPress={() => setPunchDetailsModalOpen(false)}>
            <Pressable style={s.detailModalCard} onPress={e => e.stopPropagation()}>
              {/* Header */}
              <View style={s.detailModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {selectedPunchCell?.staff.photo_url ? (
                    <Image
                      source={{
                        uri: /^https?:/.test(selectedPunchCell.staff.photo_url)
                          ? selectedPunchCell.staff.photo_url
                          : API_BASE + selectedPunchCell.staff.photo_url,
                      }}
                      style={s.detailModalAvatar}
                    />
                  ) : (
                    <View style={s.detailModalAvatarPlaceholder}>
                      <Text style={s.detailModalAvatarLetter}>
                        {selectedPunchCell?.staff.name?.trim().charAt(0).toUpperCase() || 'S'}
                      </Text>
                    </View>
                  )}
                  <View>
                    <Text style={s.detailModalName}>{selectedPunchCell?.staff.name}</Text>
                    <Text style={s.detailModalSub}>
                      ID: {selectedPunchCell?.staff.staff_id} • {selectedPunchCell?.staff.designation || 'Staff'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={s.detailModalCloseBtn} onPress={() => setPunchDetailsModalOpen(false)}>
                  <Text style={s.detailModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Date & Current Status */}
              <View style={s.detailDateRow}>
                <Text style={s.detailDateText}>
                  📅 {selectedPunchCell ? formatFullDate(selectedPunchCell.date) : ''}
                </Text>
                <View style={[
                  s.detailStatusBadge,
                  selectedPunchCell?.details?.status === 'Present' && s.badgePresent,
                  selectedPunchCell?.details?.status === 'Absent' && s.badgeAbsent,
                  (selectedPunchCell?.details?.status === 'Late' || selectedPunchCell?.details?.status === 'Leave') && s.badgeLate,
                ]}>
                  <Text style={s.detailStatusBadgeText}>
                    Status: {selectedPunchCell?.details?.status || selectedPunchCell?.staff.attendance?.[selectedPunchCell.date] || 'Not Marked'}
                  </Text>
                </View>
              </View>

              {/* Punch IN / OUT Timings Card */}
              <View style={s.punchInfoCard}>
                <Text style={s.punchInfoCardTitle}>📱 Mobile Attendance Punch Timings (ইন-আউট সময়)</Text>

                <View style={s.punchTimesGrid}>
                  {/* Punch IN */}
                  <View style={s.punchTimeBox}>
                    <Text style={s.punchTimeLabel}>🟢 Punch IN (প্রবেশের সময়)</Text>
                    <Text style={[s.punchTimeVal, { color: '#16a34a' }]}>
                      {formatPunchTime(selectedPunchCell?.details?.punch_in)}
                    </Text>
                    <Text style={s.punchSubText}>
                      {selectedPunchCell?.details?.punch_in ? 'In-Time Recorded' : 'Not recorded'}
                    </Text>
                  </View>

                  {/* Punch OUT */}
                  <View style={s.punchTimeBox}>
                    <Text style={s.punchTimeLabel}>🔴 Punch OUT (প্রস্থানের সময়)</Text>
                    <Text style={[s.punchTimeVal, { color: '#dc2626' }]}>
                      {formatPunchTime(selectedPunchCell?.details?.punch_out)}
                    </Text>
                    <Text style={s.punchSubText}>
                      {selectedPunchCell?.details?.punch_out
                        ? 'Out-Time Recorded'
                        : selectedPunchCell?.details?.punch_in
                          ? '🟢 Currently Inside Campus'
                          : 'Not recorded'}
                    </Text>
                  </View>
                </View>

                {/* Duration & GPS Distance */}
                <View style={s.punchMetaRow}>
                  <View style={s.punchMetaItem}>
                    <Text style={s.punchMetaLabel}>⏱️ Working Duration (কাজের সময়):</Text>
                    <Text style={s.punchMetaValue}>
                      {formatPunchDuration(selectedPunchCell?.details?.punch_in, selectedPunchCell?.details?.punch_out)}
                    </Text>
                  </View>
                  <View style={s.punchMetaItem}>
                    <Text style={s.punchMetaLabel}>📍 GPS Distance (ক্যাম্পাস দূরত্ব):</Text>
                    <Text style={s.punchMetaValue}>
                      {selectedPunchCell?.details?.distance != null
                        ? `${selectedPunchCell.details.distance} meters (Within Campus)`
                        : 'Manual Entry'}
                    </Text>
                  </View>
                  <View style={s.punchMetaItem}>
                    <Text style={s.punchMetaLabel}>👤 Attendance Source:</Text>
                    <Text style={[s.punchMetaValue, { color: selectedPunchCell?.details?.punch_in ? '#059669' : '#475569' }]}>
                      {selectedPunchCell?.details?.punch_in ? '📱 Staff Mobile App (GPS Verified)' : 'Admin / Manual Entry'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Status Change Buttons (Super Admin or Today) */}
              <View style={s.statusChangeSection}>
                <Text style={s.statusChangeTitle}>Change Attendance Status (হাজিরা পরিবর্তন):</Text>
                <View style={s.statusButtonsRow}>
                  {['Present', 'Absent', 'Late', 'Leave', ''].map(st => (
                    <TouchableOpacity
                      key={st || 'Clear'}
                      style={[
                        s.statusBtn,
                        st === 'Present' && s.btnPresent,
                        st === 'Absent' && s.btnAbsent,
                        st === 'Late' && s.btnLate,
                        st === 'Leave' && s.btnLeave,
                        !st && s.btnClear,
                        selectedPunchCell?.details?.status === st && s.statusBtnSelected,
                      ]}
                      onPress={() => {
                        if (!selectedPunchCell) return;
                        void updateCellStatus(selectedPunchCell.staff.id, selectedPunchCell.date, st);
                      }}
                    >
                      <Text style={s.statusBtnText}>{st ? st : 'Clear'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Footer Close */}
              <TouchableOpacity
                style={s.detailModalCloseActionBtn}
                onPress={() => setPunchDetailsModalOpen(false)}
              >
                <Text style={s.detailModalCloseActionBtnText}>Close</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Daily Punch Log Modal (All staff in/out times for a day) */}
        <Modal
          visible={dailyPunchLogModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDailyPunchLogModalOpen(false)}
        >
          <Pressable style={s.modalBackdrop} onPress={() => setDailyPunchLogModalOpen(false)}>
            <Pressable style={s.dailyLogModalCard} onPress={e => e.stopPropagation()}>
              {/* Modal Top Bar */}
              <View style={s.dailyLogHeader}>
                <View>
                  <Text style={s.dailyLogTitle}>⏱️ Staff Daily In/Out Timings Log (দৈনিক পাঞ্চ লগ)</Text>
                  <Text style={s.dailyLogSubtitle}>
                    Selected Date: {formatFullDate(selectedLogDate)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.detailModalCloseBtn}
                  onPress={() => setDailyPunchLogModalOpen(false)}
                >
                  <Text style={s.detailModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Date Navigation & Search */}
              <View style={s.dailyLogToolbar}>
                <View style={s.dateNavGroup}>
                  <TouchableOpacity
                    style={s.dateNavBtn}
                    onPress={() => {
                      const prev = new Date(selectedLogDate);
                      prev.setDate(prev.getDate() - 1);
                      const pStr = prev.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                      void openDailyPunchLog(pStr);
                    }}
                  >
                    <Text style={s.dateNavBtnText}>◀ Prev Day</Text>
                  </TouchableOpacity>
                  <View style={s.currentDateBadge}>
                    <Text style={s.currentDateBadgeText}>{selectedLogDate}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.dateNavBtn, selectedLogDate >= todayStr && s.disabledBtn]}
                    disabled={selectedLogDate >= todayStr}
                    onPress={() => {
                      const next = new Date(selectedLogDate);
                      next.setDate(next.getDate() + 1);
                      const nStr = next.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                      void openDailyPunchLog(nStr);
                    }}
                  >
                    <Text style={s.dateNavBtnText}>Next Day ▶</Text>
                  </TouchableOpacity>
                  {selectedLogDate !== todayStr && (
                    <TouchableOpacity
                      style={s.todayNavBtn}
                      onPress={() => void openDailyPunchLog(todayStr)}
                    >
                      <Text style={s.todayNavBtnText}>Today</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Quick Search */}
                <View style={s.dailyLogSearchBox}>
                  <Text style={s.searchIcon}>🔍</Text>
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search staff by name or ID..."
                    placeholderTextColor="#94a3b8"
                    value={logSearchQuery}
                    onChangeText={setLogSearchQuery}
                  />
                  {logSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setLogSearchQuery('')}>
                      <Text style={s.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* KPI Counters */}
              <View style={s.kpiRow}>
                <View style={[s.kpiCard, { borderColor: '#0284c7' }]}>
                  <Text style={s.kpiVal}>{logStaffList.length}</Text>
                  <Text style={s.kpiLabel}>Total Staff</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#16a34a' }]}>
                  <Text style={[s.kpiVal, { color: '#16a34a' }]}>
                    {logStaffList.filter(s => s.punch_in).length}
                  </Text>
                  <Text style={s.kpiLabel}>Punched IN</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#059669' }]}>
                  <Text style={[s.kpiVal, { color: '#059669' }]}>
                    {logStaffList.filter(s => s.punch_in && !s.punch_out).length}
                  </Text>
                  <Text style={s.kpiLabel}>In Campus Now</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#dc2626' }]}>
                  <Text style={[s.kpiVal, { color: '#dc2626' }]}>
                    {logStaffList.filter(s => s.punch_out).length}
                  </Text>
                  <Text style={s.kpiLabel}>Punched OUT</Text>
                </View>
                <View style={[s.kpiCard, { borderColor: '#64748b' }]}>
                  <Text style={[s.kpiVal, { color: '#64748b' }]}>
                    {logStaffList.filter(s => s.status === 'Absent').length}
                  </Text>
                  <Text style={s.kpiLabel}>Absent</Text>
                </View>
              </View>

              {/* Table */}
              {loadingLog ? (
                <View style={s.centerLoading}>
                  <ActivityIndicator size="large" color="#0d6efd" />
                  <Text style={s.loadingText}>Loading punch log for {selectedLogDate}...</Text>
                </View>
              ) : (
                <ScrollView style={s.dailyLogTableScroll} horizontal showsHorizontalScrollIndicator>
                  <View style={{ minWidth: 960 }}>
                    {/* Table Header */}
                    <View style={s.dailyLogThRow}>
                      <Text style={[s.dailyLogTh, { width: 44 }]}>#</Text>
                      <Text style={[s.dailyLogTh, { width: 70 }]}>ID</Text>
                      <Text style={[s.dailyLogTh, { width: 200, textAlign: 'left', paddingLeft: 8 }]}>Staff Name</Text>
                      <Text style={[s.dailyLogTh, { width: 140, textAlign: 'left', paddingLeft: 8 }]}>Designation</Text>
                      <Text style={[s.dailyLogTh, { width: 85 }]}>Status</Text>
                      <Text style={[s.dailyLogTh, { width: 110 }]}>🟢 Punch IN</Text>
                      <Text style={[s.dailyLogTh, { width: 110 }]}>🔴 Punch OUT</Text>
                      <Text style={[s.dailyLogTh, { width: 95 }]}>⏱️ Duration</Text>
                      <Text style={[s.dailyLogTh, { width: 90 }]}>📍 Distance</Text>
                      <Text style={[s.dailyLogTh, { width: 110 }]}>Source</Text>
                    </View>

                    {/* Table Body */}
                    <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator>
                      {filteredDailyLog.map((person: any, idx: number) => {
                        const hasIn = Boolean(person.punch_in);
                        const hasOut = Boolean(person.punch_out);
                        const isInside = hasIn && !hasOut;
                        return (
                          <View key={`log-${person.id}`} style={[s.dailyLogTdRow, idx % 2 === 1 && s.rowOdd]}>
                            <Text style={[s.dailyLogTd, { width: 44 }]}>{idx + 1}</Text>
                            <Text style={[s.dailyLogTd, { width: 70, fontWeight: '700' }]}>{person.staff_id}</Text>
                            <View style={[{ width: 200, paddingLeft: 8, justifyContent: 'center' }]}>
                              <Text style={s.dailyLogNameText} numberOfLines={1}>{person.name}</Text>
                            </View>
                            <View style={[{ width: 140, paddingLeft: 8, justifyContent: 'center' }]}>
                              <Text style={s.dailyLogDesigText} numberOfLines={1}>{person.designation || 'Staff'}</Text>
                            </View>
                            <View style={[{ width: 85, alignItems: 'center', justifyContent: 'center' }]}>
                              <View style={[
                                s.statusPill,
                                person.status === 'Present' && s.pillPresent,
                                person.status === 'Absent' && s.pillAbsent,
                                (person.status === 'Late' || person.status === 'Leave') && s.pillLate,
                              ]}>
                                <Text style={s.statusPillText}>{person.status || 'Unmarked'}</Text>
                              </View>
                            </View>
                            <Text style={[s.dailyLogTd, { width: 110, color: hasIn ? '#16a34a' : '#94a3b8', fontWeight: hasIn ? '700' : '400' }]}>
                              {formatPunchTime(person.punch_in)}
                            </Text>
                            <Text style={[s.dailyLogTd, { width: 110, color: hasOut ? '#dc2626' : isInside ? '#0284c7' : '#94a3b8', fontWeight: hasOut || isInside ? '700' : '400' }]}>
                              {hasOut ? formatPunchTime(person.punch_out) : isInside ? '🟢 In Campus' : '--'}
                            </Text>
                            <Text style={[s.dailyLogTd, { width: 95, fontWeight: '700' }]}>
                              {formatPunchDuration(person.punch_in, person.punch_out)}
                            </Text>
                            <Text style={[s.dailyLogTd, { width: 90 }]}>
                              {person.distance_meters != null ? `${person.distance_meters}m` : '--'}
                            </Text>
                            <View style={[{ width: 110, alignItems: 'center', justifyContent: 'center' }]}>
                              {hasIn || hasOut ? (
                                <View style={s.sourceMobileBadge}>
                                  <Text style={s.sourceMobileBadgeText}>📱 Mobile App</Text>
                                </View>
                              ) : (
                                <Text style={s.sourceManualText}>Manual</Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </ScrollView>
              )}

              {/* Modal Footer */}
              <View style={s.dailyLogFooter}>
                <Text style={s.dailyLogFooterInfo}>
                  Total records: {filteredDailyLog.length} staff members
                </Text>
                <TouchableOpacity
                  style={s.detailModalCloseActionBtn}
                  onPress={() => setDailyPunchLogModalOpen(false)}
                >
                  <Text style={s.detailModalCloseActionBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f3f6fa',
  },
  content: {
    padding: 12,
    width: '100%',
    maxWidth: 1600,
    alignSelf: 'center',
    paddingBottom: 60,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10,
    flexWrap: 'wrap',
    gap: 10,
  },
  backBtn: {
    backgroundColor: '#0d6efd',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  backBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1e293b',
  },
  superAdminBadge: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  superAdminBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065f46',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#ef4444',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
  },
  successBox: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#22c55e',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  successText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 14,
  },
  successDismiss: {
    color: '#15803d',
    fontWeight: '900',
    fontSize: 16,
    paddingHorizontal: 6,
  },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 12,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 110,
    height: 36,
  },
  dropdownBtnText: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  dropdownArrow: {
    fontSize: 13,
    color: '#475569',
    marginLeft: 6,
  },
  goBtn: {
    backgroundColor: '#0d6efd',
    paddingHorizontal: 18,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  goBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  presentAllBtn: {
    backgroundColor: '#16a34a', // pleasant emerald green
    paddingHorizontal: 14,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  presentAllBtnDisabled: {
    backgroundColor: '#86efac',
    opacity: 0.8,
  },
  presentAllInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presentAllIcon: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 14,
  },
  presentAllBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  // Pagination
  paginationWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pageSizeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageSizeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  pageSizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 72,
    height: 34,
  },
  pageSizeBtnText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700',
  },
  paginationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    height: 34,
  },
  pageArrowBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    backgroundColor: '#f8fafc',
  },
  pageArrowText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  pageStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#cbd5e1',
  },
  disabledBtn: {
    opacity: 0.35,
  },

  // Filter Bar Styles
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 8,
    height: 34,
    flex: 1,
    minWidth: 200,
    maxWidth: 320,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
    color: '#64748b',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 2,
    height: 32,
    outlineStyle: 'none' as any,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '800',
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  filterSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 120,
    height: 34,
  },
  filterSelectBtnText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    maxWidth: 130,
  },
  resetBtn: {
    height: 34,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 4,
  },
  resetBtnText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 12,
  },
  countBadge: {
    height: 34,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginLeft: 'auto',
  },
  countBadgeText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12,
  },
  noStaffRow: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  noStaffText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  stickyHeaderRow: {
    position: 'sticky' as any,
    top: 0,
    zIndex: 10,
    backgroundColor: '#caa98a',
  },
  thInteractiveCell: {
    cursor: 'pointer' as any,
  },
  thSortInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  thSortInnerName: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    width: '100%',
  },
  thSortArrow: {
    fontSize: 11,
    color: '#1e293b',
    fontWeight: '900',
  },

  // Card & Table
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#94a3b8',
    overflow: 'hidden',
  },
  centerLoading: {
    padding: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#475569',
    fontWeight: '600',
  },
  horizontalScroll: {
    width: '100%',
  },
  frozenTableWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  frozenLeftPane: {
    flexShrink: 0,
    zIndex: 5,
    borderRightWidth: 2,
    borderRightColor: '#64748b',
    backgroundColor: '#b9d5f5',
    ...Platform.select({
      web: { boxShadow: '3px 0 8px rgba(15, 23, 42, 0.14)' as any },
      default: { elevation: 4 },
    }),
  },
  scrollableRightPane: {
    flex: 1,
  },
  headerRowHeight: {
    height: 56,
    overflow: 'hidden',
  },
  bodyRowHeight: {
    height: 54,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },

  // Column widths
  colHash: {
    width: 44,
  },
  colPhoto: {
    width: 60,
  },
  colId: {
    width: 72,
  },
  colName: {
    width: 200,
  },
  colDay: {
    width: 46,
  },

  // TH Header
  thCell: {
    backgroundColor: '#caa98a', // Tan/brown from Image 1
    borderWidth: 0.5,
    borderColor: '#71717a',
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  thText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  thDayName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
    lineHeight: 14,
    textAlign: 'center',
  },
  thDayNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    lineHeight: 15,
    textAlign: 'center',
  },

  // Today Header Highlight
  todayHeaderCell: {
    backgroundColor: '#38bdf8', // Bright sky blue / cyan from Image 1
  },
  todayHeaderText: {
    color: '#000000',
    fontWeight: '900',
  },
  thQuickAllBadge: {
    backgroundColor: '#0f172a',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
  },
  thQuickAllBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
  pastSuperAdminHeaderCell: {
    backgroundColor: '#dbeafe', // Soft sky blue for super admin past day column
    cursor: 'pointer' as any,
  },
  thPastQuickAllBadge: {
    backgroundColor: '#1d4ed8',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
  },
  thPastQuickAllBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },

  // Fixed Left TD Cells (Pastel blue background #b9d5f5 from Image 1)
  fixedTdCell: {
    backgroundColor: '#b9d5f5',
    borderWidth: 0.5,
    borderColor: '#8c98a5',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hashText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#475569',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#64748b',
  },
  avatarLetter: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
  },
  idText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  nameCellContent: {
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  designationText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
    marginTop: 2,
  },

  // Day TD Cells
  tdCell: {
    borderWidth: 0.5,
    borderColor: '#8c98a5',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeDayCell: {
    backgroundColor: '#ffffff',
  },
  todayBodyCell: {
    backgroundColor: '#f0f9ff',
  },
  pastDayCell: {
    backgroundColor: '#f8fafc',
  },
  pastEditableCell: {
    backgroundColor: '#ffffff',
    cursor: 'pointer' as any,
  },
  pastSymbolText: {
    color: '#1e293b',
    fontWeight: '800',
  },
  futureDayCell: {
    backgroundColor: '#cbd5e1', // Solid grey for future days from Image 1
  },
  statusSymbolText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  presentColor: {
    color: '#000000',
  },
  absentColor: {
    color: '#000000',
  },
  lateColor: {
    color: '#000000',
  },

  // Footer Legend
  footerLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderColor: '#cbd5e1',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendBadge: {
    fontSize: 13,
    fontWeight: '900',
    borderWidth: 1,
    borderColor: '#94a3b8',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  legendLabel: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  autoSaveHint: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
    marginLeft: 'auto',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    width: '100%',
    maxWidth: 280,
    maxHeight: '80%',
    padding: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingBottom: 6,
  },
  modalOption: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  modalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  modalOptionText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  modalOptionTextSelected: {
    color: '#0284c7',
    fontWeight: '800',
  },

  // Punch Timings Header Button
  punchLogHeaderBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  punchLogHeaderBtnIcon: {
    fontSize: 14,
  },
  punchLogHeaderBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  // Mode Toggle
  modeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeToggleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  modeToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    padding: 2,
    gap: 2,
  },
  modeToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
  },
  modeToggleBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  modeToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748b',
  },
  modeToggleTextActive: {
    color: '#0f172a',
    fontWeight: '800',
  },

  // Punch Indicator Dot
  punchDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
  },
  punchDotLegend: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
    marginRight: 4,
  },

  // Punch Details Modal
  detailModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    width: '94%',
    maxWidth: 520,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  detailModalAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailModalAvatarLetter: {
    fontSize: 18,
    fontWeight: '800',
    color: '#334155',
  },
  detailModalName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  detailModalSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  detailModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailModalCloseText: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '700',
  },
  detailDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  detailDateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  detailStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  badgePresent: {
    backgroundColor: '#dcfce7',
  },
  badgeAbsent: {
    backgroundColor: '#fee2e2',
  },
  badgeLate: {
    backgroundColor: '#fef3c7',
  },
  detailStatusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  punchInfoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 16,
  },
  punchInfoCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10,
  },
  punchTimesGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  punchTimeBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 10,
    alignItems: 'center',
  },
  punchTimeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  punchTimeVal: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  punchSubText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'center',
  },
  punchMetaRow: {
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    paddingTop: 10,
    gap: 6,
  },
  punchMetaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  punchMetaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  punchMetaValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  statusChangeSection: {
    marginBottom: 16,
  },
  statusChangeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  statusBtnSelected: {
    borderColor: '#0f172a',
    borderWidth: 2,
  },
  btnPresent: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  btnAbsent: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  btnLate: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde047',
  },
  btnLeave: {
    backgroundColor: '#f3e8ff',
    borderColor: '#d8b4fe',
  },
  btnClear: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  statusBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  detailModalCloseActionBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  detailModalCloseActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Daily Log Modal
  dailyLogModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    width: '96%',
    maxWidth: 1100,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  dailyLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  dailyLogTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  dailyLogSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  dailyLogToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    flexWrap: 'wrap',
    gap: 10,
  },
  dateNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateNavBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateNavBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  currentDateBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  currentDateBadgeText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  todayNavBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  todayNavBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  dailyLogSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 8,
    height: 34,
    minWidth: 220,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  kpiVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 1,
  },
  dailyLogTableScroll: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  dailyLogThRow: {
    flexDirection: 'row',
    backgroundColor: '#caa98a',
    borderBottomWidth: 1,
    borderColor: '#71717a',
    paddingVertical: 8,
    alignItems: 'center',
  },
  dailyLogTh: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  dailyLogTdRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  dailyLogTd: {
    fontSize: 12,
    color: '#0f172a',
    textAlign: 'center',
  },
  dailyLogNameText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  dailyLogDesigText: {
    fontSize: 11,
    color: '#64748b',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  pillPresent: {
    backgroundColor: '#dcfce7',
  },
  pillAbsent: {
    backgroundColor: '#fee2e2',
  },
  pillLate: {
    backgroundColor: '#fef3c7',
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  sourceMobileBadge: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sourceMobileBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065f46',
  },
  sourceManualText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  rowOdd: {
    backgroundColor: '#f8fafc',
  },
  dailyLogFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  dailyLogFooterInfo: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
});
