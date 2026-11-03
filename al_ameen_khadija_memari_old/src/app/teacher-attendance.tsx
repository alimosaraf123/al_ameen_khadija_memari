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
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { api, API_BASE } from '../lib/api';

type DayCol = {
  date: string;
  day: string;
  number: number;
};

type StaffMember = {
  id: number;
  staff_id: string;
  name: string;
  photo_url?: string;
  designation?: string;
  attendance: Record<string, string>;
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

const STATUS_CYCLE = ['Present', 'Absent', 'Late', 'Leave', ''];

const getTodayDateStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function TeacherAttendance() {
  const todayStr = useMemo(() => getTodayDateStr(), []);
  const todayObj = useMemo(() => new Date(), []);

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

  const effectivePageSize = pageSize === 0 ? Math.max(1, staffList.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(staffList.length / effectivePageSize));
  const paginatedStaff = useMemo(() => {
    if (pageSize === 0) return staffList;
    const start = (page - 1) * pageSize;
    return staffList.slice(start, start + pageSize);
  }, [staffList, page, pageSize]);

  const markAllPresent = async (targetDate: string = todayStr) => {
    if (targetDate > todayStr) {
      Alert.alert('Not allowed', 'Cannot mark attendance for future dates.');
      return;
    }

    if (targetDate < todayStr) {
      Alert.alert('Attendance Locked', 'Back-dated attendance is turned off. Attendance can only be marked for today.');
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

  const cycleStatus = async (staffId: number, dateStr: string) => {
    if (dateStr > todayStr) return; // Future days are disabled
    if (dateStr < todayStr) {
      Alert.alert('Attendance Locked', 'Back-dated attendance is turned off. Only today’s attendance can be marked.');
      return;
    }

    const currentStaff = staffList.find(s => s.id === staffId);
    const currentVal = currentStaff?.attendance?.[dateStr] || '';
    const currentIndex = STATUS_CYCLE.indexOf(currentVal);
    const nextVal = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];

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
            }
          : item
      )
    );

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
              }
            : item
        )
      );
    } finally {
      setSavingCell(null);
    }
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
          <Text style={s.pageTitle}>Staff Attendance</Text>
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

        {/* Attendance Grid Card */}
        <View style={s.card}>
          {loading && !staffList.length ? (
            <View style={s.centerLoading}>
              <ActivityIndicator size="large" color="#0d6efd" />
              <Text style={s.loadingText}>Loading attendance sheet...</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              style={s.horizontalScroll}
            >
              <View>
                {/* Header Row */}
                <View style={s.row}>
                  <View style={[s.colHash, s.thCell]}>
                    <Text style={s.thText}>#</Text>
                  </View>
                  <View style={[s.colPhoto, s.thCell]}>
                    <Text style={s.thText}>Photo</Text>
                  </View>
                  <View style={[s.colId, s.thCell]}>
                    <Text style={s.thText}>ID</Text>
                  </View>
                  <View style={[s.colName, s.thCell]}>
                    <Text style={[s.thText, { textAlign: 'left', paddingLeft: 4 }]}>
                      Staff Name
                    </Text>
                  </View>

                  {/* Day Header Columns */}
                  {days.map(day => {
                    const isToday = day.date === todayStr;
                    if (!isToday) {
                      return (
                        <View
                          key={day.date}
                          style={[s.colDay, s.thCell]}
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

                {/* Body Rows */}
                {paginatedStaff.map((person, idx) => {
                  const rowNumber =
                    pageSize === 0 ? idx + 1 : (page - 1) * pageSize + idx + 1;
                  return (
                    <View key={person.id} style={s.row}>
                      {/* # Col */}
                      <View style={[s.colHash, s.fixedTdCell]}>
                        <Text style={s.hashText}>{rowNumber}</Text>
                      </View>

                      {/* Photo Col */}
                      <View style={[s.colPhoto, s.fixedTdCell]}>
                        {person.photo_url ? (
                          <Image
                            source={{
                              uri: /^https?:/.test(person.photo_url)
                                ? person.photo_url
                                : API_BASE + person.photo_url,
                            }}
                            style={s.avatarImg}
                          />
                        ) : (
                          <View style={s.avatarPlaceholder}>
                            <Text style={s.avatarLetter}>
                              {person.name.trim().charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* ID Col */}
                      <View style={[s.colId, s.fixedTdCell]}>
                        <Text style={s.idText}>{person.staff_id}</Text>
                      </View>

                      {/* Name Col */}
                      <View style={[s.colName, s.fixedTdCell, s.nameCellContent]}>
                        <Text style={s.nameText} numberOfLines={1}>
                          {person.name}
                        </Text>
                        <Text style={s.designationText} numberOfLines={1}>
                          {person.designation || 'Staff'}
                        </Text>
                      </View>

                      {/* Day Cells */}
                      {days.map(day => {
                        const dateKey = day.date;
                        const isFuture = dateKey > todayStr;
                        const isToday = dateKey === todayStr;
                        const isPast = dateKey < todayStr;
                        const val = person.attendance?.[dateKey];
                        const symbol = getStatusSymbol(val);
                        const isSavingThis = savingCell === `${person.id}_${dateKey}`;

                        if (isFuture) {
                          return (
                            <View
                              key={dateKey}
                              style={[s.colDay, s.tdCell, s.futureDayCell]}
                            />
                          );
                        }

                        if (isPast) {
                          return (
                            <View
                              key={dateKey}
                              style={[s.colDay, s.tdCell, s.pastDayCell]}
                            >
                              <Text
                                style={[
                                  s.statusSymbolText,
                                  s.pastSymbolText,
                                  symbol === 'A' && s.absentColor,
                                  symbol === 'P' && s.presentColor,
                                  (symbol === 'L' || symbol === 'LV') && s.lateColor,
                                ]}
                              >
                                {symbol}
                              </Text>
                            </View>
                          );
                        }

                        return (
                          <TouchableOpacity
                            key={dateKey}
                            activeOpacity={0.65}
                            onPress={() => cycleStatus(person.id, dateKey)}
                            style={[
                              s.colDay,
                              s.tdCell,
                              s.activeDayCell,
                              s.todayBodyCell,
                            ]}
                          >
                            {isSavingThis ? (
                              <ActivityIndicator size="small" color="#0d6efd" />
                            ) : (
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
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
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
            <Text style={s.autoSaveHint}>
              • Only today's attendance can be edited • Back dates and future dates are locked
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
});
