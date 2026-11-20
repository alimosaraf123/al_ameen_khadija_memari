import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Select } from '../components/StudentDirectory';
import { api } from '../lib/api';

const CLASS_OPTIONS = [
  { value: 'all', label: 'All Classes (সব ক্লাস)' },
  { value: 'VIII', label: 'Class VIII' },
  { value: 'IX', label: 'Class IX' },
  { value: 'X', label: 'Class X' },
  { value: 'XI-Sc.', label: 'Class XI-Sc.' },
  { value: 'XII-Sc.', label: 'Class XII-Sc.' },
  { value: 'V', label: 'Class V' },
  { value: 'VI', label: 'Class VI' },
  { value: 'VII', label: 'Class VII' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status (সব স্ট্যাটাস)' },
  { value: 'not_applied', label: '⚠️ Not Applied / Blank (খালি)' },
  { value: 'K1 Sanctioned', label: '🟩 K1 Sanctioned' },
  { value: 'K1 Applied', label: '🟦 K1 Applied' },
  { value: 'K2 Sanctioned', label: '🟩 K2 Sanctioned' },
  { value: 'K2 Applied', label: '🟦 K2 Applied' },
  { value: 'Under Process', label: '🟨 Under Process / Pending' },
  { value: 'Document Required', label: '🟪 Document Required' },
  { value: 'Rejected', label: '🟥 Rejected' },
];

const ID_FILTER_OPTIONS = [
  { value: 'all', label: 'All ID Status (সব)' },
  { value: 'has_id', label: '🆔 With Kanyashree ID' },
  { value: 'no_id', label: '⚠️ Without ID (আইডি ছাড়া)' },
];

const AGE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Ages (সব বয়স)' },
  { value: 'k2_age', label: '🎂 18+ Years (K2 Eligible)' },
  { value: 'k1_age', label: '👧 13–17 Years (K1 Range)' },
];

const BULK_STATUS_OPTIONS = [
  { value: '', label: 'Select Target Status (স্ট্যাটাস বাছুন)' },
  { value: 'K1 Applied', label: '🟦 K1 Applied' },
  { value: 'K1 Sanctioned', label: '🟩 K1 Sanctioned' },
  { value: 'K2 Applied', label: '🟦 K2 Applied' },
  { value: 'K2 Sanctioned', label: '🟩 K2 Sanctioned' },
  { value: 'Under Process', label: '🟨 Under Process / Pending' },
  { value: 'Document Required', label: '🟪 Document Required' },
  { value: 'Not Applied', label: '⚠️ Not Applied (আবেদনহীন)' },
  { value: 'clear', label: '🗑️ Clear Status (স্ট্যাটাস মুছুন)' },
];

const QUICK_STATUS_PRESETS = [
  'K1 Applied',
  'K1 Sanctioned',
  'K2 Applied',
  'K2 Sanctioned',
  'Under Process',
  'Document Required',
  'Not Applied',
];

const PAGE_SIZE_OPTIONS = [
  { value: '25', label: '25 per page' },
  { value: '50', label: '50 per page' },
  { value: '100', label: '100 per page' },
  { value: 'all', label: 'All Students' },
];

function calculateAge(dobStr?: string | null): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

function getTodayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function KanyashreePortal() {
  const [activeTab, setActiveTab] = useState<'students' | 'summary'>('students');

  // Students data
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedIdFilter, setSelectedIdFilter] = useState('all');
  const [selectedAgeFilter, setSelectedAgeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState('50');
  const [page, setPage] = useState(1);

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkDate, setBulkDate] = useState(getTodayString());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Single student quick update modal
  const [modal, setModal] = useState<{
    open: boolean;
    student: any | null;
    kanyashreeId: string;
    kanyashreeStatus: string;
    kanyashreeDate: string;
    admittedSchoolName: string;
    saving: boolean;
  }>({
    open: false,
    student: null,
    kanyashreeId: '',
    kanyashreeStatus: '',
    kanyashreeDate: '',
    admittedSchoolName: '',
    saving: false,
  });

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await api('/api/students/kanyashree/list');
      setStudents(data.students || []);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load student list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStudents();
  }, []);

  // Distinct school options for filter dropdown
  const schoolOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((st) => {
      const sch = String(st.admitted_school_name || '').trim();
      if (sch) set.add(sch);
    });
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    return [
      { value: 'all', label: 'All Schools (সব স্কুল)' },
      { value: 'no_school', label: '⚠️ School Not Set (স্কুল ছাড়া)' },
      ...sorted.map((sch) => ({ value: sch, label: `🏫 ${sch}` })),
    ];
  }, [students]);

  // Filter pipeline
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Class filter
      if (selectedClass !== 'all' && s.class_name !== selectedClass) return false;

      // School filter
      if (selectedSchoolFilter === 'no_school') {
        if (s.admitted_school_name && String(s.admitted_school_name).trim()) return false;
      } else if (selectedSchoolFilter !== 'all') {
        if (String(s.admitted_school_name || '').trim().toLowerCase() !== selectedSchoolFilter.toLowerCase()) return false;
      }

      // Status filter
      const st = String(s.kanyashree_status || '').trim();
      if (selectedStatusFilter === 'not_applied') {
        if (st && st.toLowerCase() !== 'not applied') return false;
      } else if (selectedStatusFilter !== 'all') {
        if (!st.toLowerCase().includes(selectedStatusFilter.toLowerCase())) return false;
      }

      // ID filter
      const id = String(s.kanyashree_id || '').trim();
      if (selectedIdFilter === 'has_id' && !id) return false;
      if (selectedIdFilter === 'no_id' && id) return false;

      // Age filter
      const age = calculateAge(s.date_of_birth);
      if (selectedAgeFilter === 'k2_age') {
        if (age === null || age < 18) return false;
      } else if (selectedAgeFilter === 'k1_age') {
        if (age === null || age < 13 || age >= 18) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = String(s.student_name || '').toLowerCase().includes(q);
        const matchesReg = String(s.registration_no || '').toLowerCase().includes(q);
        const matchesRoll = String(s.roll_no || '').toLowerCase().includes(q);
        const matchesKid = String(s.kanyashree_id || '').toLowerCase().includes(q);
        const matchesStatus = String(s.kanyashree_status || '').toLowerCase().includes(q);
        const matchesSchool = String(s.admitted_school_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesReg && !matchesRoll && !matchesKid && !matchesStatus && !matchesSchool) return false;
      }

      return true;
    });
  }, [students, selectedClass, selectedSchoolFilter, selectedStatusFilter, selectedIdFilter, selectedAgeFilter, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [selectedClass, selectedSchoolFilter, selectedStatusFilter, selectedIdFilter, selectedAgeFilter, searchQuery, pageSize]);

  // Pagination
  const effectivePageSize = pageSize === 'all' ? Math.max(1, filteredStudents.length) : Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / effectivePageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const paginatedStudents = filteredStudents.slice(startIndex, startIndex + effectivePageSize);

  // Checkbox selection
  const paginatedIds = useMemo(() => paginatedStudents.map((s) => Number(s.id)), [paginatedStudents]);
  const isAllPaginatedSelected =
    paginatedIds.length > 0 && paginatedIds.every((id) => selectedIds.includes(id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPaginated = () => {
    if (isAllPaginatedSelected) {
      setSelectedIds((prev) => prev.filter((id) => !paginatedIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...paginatedIds])));
    }
  };

  const selectAllFiltered = () => {
    if (selectedIds.length === filteredStudents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map((s) => Number(s.id)));
    }
  };

  // Open single edit modal
  const openSingleEdit = (s: any) => {
    setModal({
      open: true,
      student: s,
      kanyashreeId: s.kanyashree_id || '',
      kanyashreeStatus: s.kanyashree_status || 'K1 Applied',
      kanyashreeDate: s.kanyashree_date || getTodayString(),
      admittedSchoolName: s.admitted_school_name || '',
      saving: false,
    });
  };

  // Save single student
  const executeSingleUpdate = async () => {
    if (!modal.student) return;
    setModal((prev) => ({ ...prev, saving: true }));

    try {
      await api(`/api/students/kanyashree/${modal.student.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          kanyashree_id: modal.kanyashreeId.trim() || null,
          kanyashree_status: modal.kanyashreeStatus.trim() || null,
          kanyashree_date: modal.kanyashreeDate.trim() || null,
          admitted_school_name: modal.admittedSchoolName.trim() || null,
        }),
      });

      const msg = `Updated Kanyashree details for ${modal.student.student_name}!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Success', msg);
      }

      setModal({ open: false, student: null, kanyashreeId: '', kanyashreeStatus: '', kanyashreeDate: '', admittedSchoolName: '', saving: false });
      await loadStudents();
    } catch (e: any) {
      setModal((prev) => ({ ...prev, saving: false }));
      Alert.alert('Error', e.message || 'Failed to update Kanyashree details');
    }
  };

  // Bulk update
  const executeBulkUpdate = async () => {
    if (!selectedIds.length) {
      Alert.alert('Notice', 'Please select at least one student');
      return;
    }
    if (!bulkStatus) {
      Alert.alert('Notice', 'Please select a target status');
      return;
    }

    const finalStatus = bulkStatus === 'clear' ? null : bulkStatus;

    const confirmMsg = `Update Kanyashree status to "${finalStatus || 'Cleared'}" for ${selectedIds.length} student(s)?`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(confirmMsg)) return;
    }

    setBulkUpdating(true);
    try {
      await api('/api/students/kanyashree/bulk-update', {
        method: 'POST',
        body: JSON.stringify({
          student_ids: selectedIds,
          kanyashree_status: finalStatus,
          kanyashree_date: bulkDate.trim() || null,
        }),
      });

      const msg = `Successfully updated Kanyashree status for ${selectedIds.length} student(s)!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Success', msg);
      }

      setSelectedIds([]);
      setBulkStatus('');
      await loadStudents();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Bulk update failed');
    } finally {
      setBulkUpdating(false);
    }
  };

  // CSV Export
  const exportCsv = () => {
    if (!filteredStudents.length) {
      Alert.alert('Notice', 'No students to export.');
      return;
    }

    const headers = [
      'Sl No',
      'Registration No',
      'Student Name',
      'Class',
      'Roll No',
      'Present / Admitted School',
      'Date of Birth',
      'Age',
      'Kanyashree ID',
      'Kanyashree Status',
      'Application Date',
      'Father Name',
      'Mobile Number',
    ];

    const rows = filteredStudents.map((s, idx) => {
      const age = calculateAge(s.date_of_birth);
      return [
        idx + 1,
        `"${s.registration_no || ''}"`,
        `"${(s.student_name || '').replace(/"/g, '""')}"`,
        `"${s.class_name || ''}"`,
        `"${s.roll_no || ''}"`,
        `"${(s.admitted_school_name || '').replace(/"/g, '""')}"`,
        `"${s.date_of_birth || ''}"`,
        age !== null ? age : '',
        `"${s.kanyashree_id || ''}"`,
        `"${s.kanyashree_status || ''}"`,
        `"${s.kanyashree_date || ''}"`,
        `"${(s.father_name || '').replace(/"/g, '""')}"`,
        `"${s.mobile_number || ''}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `kanyashree_register_${getTodayString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('CSV Ready', 'Export is available directly in the web browser.');
    }
  };

  // Print Register
  const printRegister = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Kanyashree Prakalpa Register - Al-Ameen Mission Academy</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
            .title { font-size: 20px; font-weight: bold; color: #0369a1; }
            .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; color: #334155; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .status-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; }
            .badge-sanctioned { background-color: #dcfce7; color: #166534; }
            .badge-applied { background-color: #e0f2fe; color: #0369a1; }
            .badge-pending { background-color: #fef3c7; color: #92400e; }
            .badge-none { background-color: #f1f5f9; color: #64748b; }
            @media print {
              body { padding: 0; }
              @page { size: landscape; margin: 12mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Al-Ameen Mission Academy Memari (Khadija Campus)</div>
            <div class="sub">Kanyashree Prakalpa Register · Date: ${getTodayString()} · Total Records: ${filteredStudents.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 35px;">Sl</th>
                <th>Student Name</th>
                <th>Class</th>
                <th>Roll</th>
                <th>Present / Admitted School</th>
                <th>Reg. No</th>
                <th>DOB / Age</th>
                <th>Kanyashree ID</th>
                <th>Kanyashree Status</th>
                <th>Date</th>
                <th>Father Name</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStudents
                .map((s, idx) => {
                  const age = calculateAge(s.date_of_birth);
                  const st = s.kanyashree_status || 'Not Applied';
                  const badgeClass = st.includes('Sanctioned')
                    ? 'badge-sanctioned'
                    : st.includes('Applied')
                    ? 'badge-applied'
                    : st.includes('Pending') || st.includes('Process')
                    ? 'badge-pending'
                    : 'badge-none';
                  return `
                    <tr>
                      <td>${idx + 1}</td>
                      <td><b>${s.student_name || ''}</b></td>
                      <td>${s.class_name || ''}</td>
                      <td>${s.roll_no || ''}</td>
                      <td><b>${s.admitted_school_name || '<span style="color:#94a3b8;">Not Set</span>'}</b></td>
                      <td>${s.registration_no || ''}</td>
                      <td>${s.date_of_birth || '-'} ${age !== null ? `(${age}y)` : ''}</td>
                      <td style="font-family: monospace; font-weight: bold;">${s.kanyashree_id || '-'}</td>
                      <td><span class="status-badge ${badgeClass}">${st}</span></td>
                      <td>${s.kanyashree_date || '-'}</td>
                      <td>${s.father_name || '-'}</td>
                      <td>${s.mobile_number || '-'}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } else {
      Alert.alert('Print Ready', 'Please use a desktop web browser to print the Kanyashree register.');
    }
  };

  // Summary statistics
  const stats = useMemo(() => {
    let k1Sanctioned = 0;
    let k1Applied = 0;
    let k2Sanctioned = 0;
    let k2Applied = 0;
    let pending = 0;
    let notApplied = 0;
    let withId = 0;
    let eligible18Plus = 0;

    const classMap: Record<string, { total: number; withId: number; k1: number; k2: number; notApplied: number }> = {};

    students.forEach((s) => {
      const st = String(s.kanyashree_status || '').trim().toLowerCase();
      const id = String(s.kanyashree_id || '').trim();
      const age = calculateAge(s.date_of_birth);
      const c = s.class_name || 'Other';

      if (!classMap[c]) {
        classMap[c] = { total: 0, withId: 0, k1: 0, k2: 0, notApplied: 0 };
      }
      classMap[c].total++;

      if (id) {
        withId++;
        classMap[c].withId++;
      }
      if (age !== null && age >= 18) {
        eligible18Plus++;
      }

      if (st.includes('k1') && st.includes('sanctioned')) {
        k1Sanctioned++;
        classMap[c].k1++;
      } else if (st.includes('k1') && (st.includes('applied') || st.includes('submitted'))) {
        k1Applied++;
        classMap[c].k1++;
      } else if (st.includes('k2') && st.includes('sanctioned')) {
        k2Sanctioned++;
        classMap[c].k2++;
      } else if (st.includes('k2') && (st.includes('applied') || st.includes('submitted'))) {
        k2Applied++;
        classMap[c].k2++;
      } else if (st.includes('pending') || st.includes('process') || st.includes('document')) {
        pending++;
      } else {
        notApplied++;
        classMap[c].notApplied++;
      }
    });

    return {
      total: students.length,
      k1Sanctioned,
      k1Applied,
      k2Sanctioned,
      k2Applied,
      pending,
      notApplied,
      withId,
      eligible18Plus,
      classMap,
    };
  }, [students]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.compactHeader}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/superadmin'))}
            style={styles.navButton}
          >
            <Text style={styles.navButtonText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/superadmin')} style={styles.navButton}>
            <Text style={styles.navButtonText}>🏠 SuperAdmin</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kanyashree Portal (কন্যাশ্রী ব্যবস্থাপনা)</Text>
        </View>

        <View style={styles.headerTabs}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'students' && styles.tabButtonActive]}
            onPress={() => setActiveTab('students')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'students' && styles.tabButtonTextActive]}>
              👩‍🎓 Student List ({students.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'summary' && styles.tabButtonActive]}
            onPress={() => setActiveTab('summary')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'summary' && styles.tabButtonTextActive]}>
              📊 Status Summary & Reports
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* FROZEN FILTER TOOLBAR */}
      {activeTab === 'students' && (
        <View style={styles.frozenFilterWrapper}>
          <View style={styles.compactFilterCard}>
            <View style={{ width: 140 }}>
              <Select
                label="All Classes"
                value={selectedClass}
                onChange={setSelectedClass}
                options={CLASS_OPTIONS}
              />
            </View>

            <View style={{ width: 220 }}>
              <Select
                label="All Schools"
                value={selectedSchoolFilter}
                onChange={setSelectedSchoolFilter}
                options={schoolOptions}
                searchable={true}
              />
            </View>

            <View style={{ width: 190 }}>
              <Select
                label="All Status"
                value={selectedStatusFilter}
                onChange={setSelectedStatusFilter}
                options={STATUS_FILTER_OPTIONS}
                searchable={true}
              />
            </View>

            <View style={{ width: 170 }}>
              <Select
                label="All ID Status"
                value={selectedIdFilter}
                onChange={setSelectedIdFilter}
                options={ID_FILTER_OPTIONS}
              />
            </View>

            <View style={{ width: 175 }}>
              <Select
                label="All Ages"
                value={selectedAgeFilter}
                onChange={setSelectedAgeFilter}
                options={AGE_FILTER_OPTIONS}
              />
            </View>

            <View style={{ flex: 1, minWidth: 160 }}>
              <TextInput
                style={styles.compactSearchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search name, reg. no, roll, school, or ID..."
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={styles.compactStatsGroup}>
              <Text style={styles.compactStatsText}>
                <Text style={{ fontWeight: '800', color: '#0284c7' }}>{filteredStudents.length}</Text> / {students.length}
              </Text>

              {Boolean(
                selectedClass !== 'all' ||
                  selectedSchoolFilter !== 'all' ||
                  selectedStatusFilter !== 'all' ||
                  selectedIdFilter !== 'all' ||
                  selectedAgeFilter !== 'all' ||
                  searchQuery.trim().length > 0
              ) ? (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedClass('all');
                    setSelectedSchoolFilter('all');
                    setSelectedStatusFilter('all');
                    setSelectedIdFilter('all');
                    setSelectedAgeFilter('all');
                    setSearchQuery('');
                  }}
                  style={styles.compactResetBtn}
                  accessibilityLabel="Reset filters"
                >
                  <Text style={styles.compactResetText}>✕ Reset</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => void loadStudents()}
                style={styles.compactRefreshBtn}
                accessibilityLabel="Refresh list"
              >
                <Text style={styles.compactRefreshText}>🔄</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={printRegister} style={styles.printBtn}>
                <Text style={styles.printBtnText}>🖨️ Print</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={exportCsv} style={styles.exportBtn}>
                <Text style={styles.exportBtnText}>📥 Excel</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* FROZEN BULK ACTION BAR */}
          <View style={[styles.bulkBar, selectedIds.length > 0 && styles.bulkBarActive]}>
            <View style={styles.bulkLeft}>
              <TouchableOpacity onPress={toggleSelectAllPaginated} style={styles.checkboxRow}>
                <Text style={styles.checkboxIcon}>{isAllPaginatedSelected ? '☑️' : '⬜'}</Text>
                <Text style={styles.bulkSelectText}>
                  {isAllPaginatedSelected ? 'Deselect Page' : 'Select Page'}
                </Text>
              </TouchableOpacity>

              {filteredStudents.length > paginatedStudents.length && (
                <TouchableOpacity onPress={selectAllFiltered} style={styles.selectAllBtn}>
                  <Text style={styles.selectAllBtnText}>
                    {selectedIds.length === filteredStudents.length
                      ? 'Deselect All'
                      : `Select All (${filteredStudents.length})`}
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.selectedCountBadge}>
                ✓ Selected: <Text style={{ fontWeight: '900' }}>{selectedIds.length}</Text>
              </Text>
            </View>

            {selectedIds.length > 0 && (
              <View style={styles.bulkRight}>
                <View style={{ minWidth: 230 }}>
                  <Select
                    label="Select Target Status"
                    value={bulkStatus}
                    onChange={setBulkStatus}
                    options={BULK_STATUS_OPTIONS}
                  />
                </View>

                <View style={{ width: 125 }}>
                  <TextInput
                    style={styles.dateInput}
                    value={bulkDate}
                    onChangeText={setBulkDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.bulkMoveButton, (!bulkStatus || bulkUpdating) && styles.btnDisabled]}
                  onPress={executeBulkUpdate}
                  disabled={!bulkStatus || bulkUpdating}
                >
                  <Text style={styles.bulkMoveButtonText}>
                    {bulkUpdating ? 'Updating...' : `🚀 Update (${selectedIds.length}) Status`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.bulkCancelButton}
                  onPress={() => setSelectedIds([])}
                >
                  <Text style={styles.bulkCancelText}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* MAIN CONTENT AREA */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* TAB 1: STUDENT LIST */}
        {activeTab === 'students' && (
          <View>
            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={styles.loadingText}>Loading Kanyashree student records...</Text>
              </View>
            ) : filteredStudents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No students match the selected filters.</Text>
                <Text style={styles.emptySubtitle}>Try changing the class, status, age, or search term.</Text>
              </View>
            ) : (
              <View>
                {paginatedStudents.map((s, idx) => {
                  const isSelected = selectedIds.includes(Number(s.id));
                  const hasKid = Boolean(s.kanyashree_id && s.kanyashree_id.trim());
                  const st = s.kanyashree_status || '';
                  const hasStatus = Boolean(st.trim() && st.toLowerCase() !== 'not applied');
                  const age = calculateAge(s.date_of_birth);
                  const is18Plus = age !== null && age >= 18;

                  const isSanctioned = st.toLowerCase().includes('sanctioned');
                  const isApplied = st.toLowerCase().includes('applied') || st.toLowerCase().includes('submitted');
                  const isPending = st.toLowerCase().includes('pending') || st.toLowerCase().includes('process');

                  return (
                    <View
                      key={s.id}
                      style={[styles.studentCard, isSelected && styles.studentCardSelected]}
                    >
                      {/* Checkbox */}
                      <TouchableOpacity
                        onPress={() => toggleSelect(Number(s.id))}
                        style={styles.cardCheckbox}
                      >
                        <Text style={{ fontSize: 20 }}>{isSelected ? '☑️' : '⬜'}</Text>
                      </TouchableOpacity>

                      {/* Info Column */}
                      <View style={styles.studentInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.studentIndex}>{startIndex + idx + 1}</Text>
                          <Text style={styles.studentName}>{s.student_name}</Text>

                          <View style={styles.badgeClass}>
                            <Text style={styles.badgeClassText}>Class {s.class_name || '-'}</Text>
                          </View>

                          {Boolean(s.admitted_school_name && String(s.admitted_school_name).trim()) ? (
                            <View style={styles.badgeSchool}>
                              <Text style={styles.badgeSchoolText}>🏫 {String(s.admitted_school_name).trim()}</Text>
                            </View>
                          ) : (
                            <View style={styles.badgeSchoolMissing}>
                              <Text style={styles.badgeSchoolMissingText}>🏫 School: Not Set</Text>
                            </View>
                          )}

                          {is18Plus && (
                            <View style={styles.badge18Plus}>
                              <Text style={styles.badge18PlusText}>🎂 18+ (K2 Eligible)</Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.studentMeta}>
                          Reg. No: <Text style={styles.metaHighlight}>{s.registration_no || '-'}</Text>
                          {Boolean(s.roll_no) ? ` · Roll: ${s.roll_no}` : ''}
                          {s.date_of_birth ? ` · DOB: ${s.date_of_birth}` : ''}
                          {age !== null ? ` (${age} yrs)` : ''}
                          {s.room_name ? ` · Room ${s.room_name}` : ''}
                          {s.father_name ? ` · Father: ${s.father_name}` : ''}
                        </Text>
                      </View>

                      {/* Kanyashree ID & Status Box */}
                      <View style={styles.kanyashreeStatusCol}>
                        <View style={styles.kanyashreeIdRow}>
                          <Text style={styles.kanyashreeIdLabel}>Kanyashree ID:</Text>
                          <Text style={[styles.kanyashreeIdText, hasKid ? styles.idPresent : styles.idMissing]}>
                            {hasKid ? s.kanyashree_id : '⚠️ Not Set'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View
                            style={[
                              styles.statusBadge,
                              isSanctioned
                                ? styles.statusBadgeSanctioned
                                : isApplied
                                ? styles.statusBadgeApplied
                                : isPending
                                ? styles.statusBadgePending
                                : hasStatus
                                ? styles.statusBadgeOther
                                : styles.statusBadgeNone,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isSanctioned
                                  ? styles.statusTextSanctioned
                                  : isApplied
                                  ? styles.statusTextApplied
                                  : isPending
                                  ? styles.statusTextPending
                                  : hasStatus
                                  ? styles.statusTextOther
                                  : styles.statusTextNone,
                              ]}
                            >
                              {hasStatus ? st : '⚪ Not Applied'}
                            </Text>
                          </View>

                          {Boolean(s.kanyashree_date) && (
                            <Text style={styles.dateBadgeText}>📅 {s.kanyashree_date}</Text>
                          )}
                        </View>
                      </View>

                      {/* Action Button */}
                      <TouchableOpacity
                        style={styles.updateButton}
                        onPress={() => openSingleEdit(s)}
                      >
                        <Text style={styles.updateButtonText}>✏️ Update</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* Pagination Controls */}
                <View style={styles.paginationCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.paginationText}>Page Size:</Text>
                    <View style={{ width: 140 }}>
                      <Select
                        label="50 per page"
                        value={pageSize}
                        onChange={setPageSize}
                        options={PAGE_SIZE_OPTIONS}
                      />
                    </View>
                  </View>

                  <Text style={styles.paginationText}>
                    Showing {startIndex + 1} - {Math.min(startIndex + effectivePageSize, filteredStudents.length)} of {filteredStudents.length}
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      disabled={currentPage <= 1}
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                      style={[styles.pageNavBtn, currentPage <= 1 && styles.btnDisabled]}
                    >
                      <Text style={styles.pageNavText}>← Prev</Text>
                    </TouchableOpacity>
                    <Text style={styles.pageCounter}>
                      {currentPage} / {totalPages}
                    </Text>
                    <TouchableOpacity
                      disabled={currentPage >= totalPages}
                      onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                      style={[styles.pageNavBtn, currentPage >= totalPages && styles.btnDisabled]}
                    >
                      <Text style={styles.pageNavText}>Next →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* TAB 2: SUMMARY & REPORTS */}
        {activeTab === 'summary' && (
          <View style={styles.summaryContainer}>
            {/* 6 Metrics Grid */}
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { borderTopColor: '#0284c7' }]}>
                <Text style={styles.metricLabel}>Total Girls (মোট ছাত্রী)</Text>
                <Text style={[styles.metricValue, { color: '#0369a1' }]}>{stats.total}</Text>
                <Text style={styles.metricSub}>With ID: {stats.withId}</Text>
              </View>

              <View style={[styles.metricCard, { borderTopColor: '#16a34a' }]}>
                <Text style={styles.metricLabel}>K1 Sanctioned (অনুমোদিত)</Text>
                <Text style={[styles.metricValue, { color: '#15803d' }]}>{stats.k1Sanctioned}</Text>
                <Text style={styles.metricSub}>Annual scholarship sanctioned</Text>
              </View>

              <View style={[styles.metricCard, { borderTopColor: '#0284c7' }]}>
                <Text style={styles.metricLabel}>K1 Applied (আবেদনকৃত)</Text>
                <Text style={[styles.metricValue, { color: '#0284c7' }]}>{stats.k1Applied}</Text>
                <Text style={styles.metricSub}>Submitted / Under review</Text>
              </View>

              <View style={[styles.metricCard, { borderTopColor: '#15803d' }]}>
                <Text style={styles.metricLabel}>K2 Sanctioned (এককালীন)</Text>
                <Text style={[styles.metricValue, { color: '#166534' }]}>{stats.k2Sanctioned}</Text>
                <Text style={styles.metricSub}>₹25,000 grant sanctioned</Text>
              </View>

              <View style={[styles.metricCard, { borderTopColor: '#0369a1' }]}>
                <Text style={styles.metricLabel}>K2 Applied (18+ আবেদনকৃত)</Text>
                <Text style={[styles.metricValue, { color: '#0369a1' }]}>{stats.k2Applied}</Text>
                <Text style={styles.metricSub}>18+ age candidates applied</Text>
              </View>

              <View style={[styles.metricCard, { borderTopColor: '#f59e0b' }]}>
                <Text style={styles.metricLabel}>18+ Watchlist (K2 উপযুক্ত)</Text>
                <Text style={[styles.metricValue, { color: '#d97706' }]}>{stats.eligible18Plus}</Text>
                <Text style={styles.metricSub}>Turned 18 years of age</Text>
              </View>
            </View>

            {/* Class Breakdown Table */}
            <View style={styles.tableCard}>
              <View style={styles.tableCardHeader}>
                <Text style={styles.tableCardTitle}>Class-wise Kanyashree Breakdown (শ্রেণিভিত্তিক পরিসংখ্যান)</Text>
                <TouchableOpacity onPress={exportCsv} style={styles.exportBtn}>
                  <Text style={styles.exportBtnText}>📥 Export Excel</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.tableWrapper}>
                <View style={styles.tableRowHeader}>
                  <Text style={[styles.thCell, { flex: 1.5 }]}>Class</Text>
                  <Text style={[styles.thCell, { flex: 1 }]}>Total</Text>
                  <Text style={[styles.thCell, { flex: 1 }]}>With ID</Text>
                  <Text style={[styles.thCell, { flex: 1 }]}>K1</Text>
                  <Text style={[styles.thCell, { flex: 1 }]}>K2</Text>
                  <Text style={[styles.thCell, { flex: 1 }]}>Not Applied</Text>
                  <Text style={[styles.thCell, { flex: 1.2 }]}>Action</Text>
                </View>

                {Object.entries(stats.classMap).map(([className, cStats]) => (
                  <View key={className} style={styles.tableRow}>
                    <Text style={[styles.tdCell, { flex: 1.5, fontWeight: '800', color: '#0f172a' }]}>
                      Class {className}
                    </Text>
                    <Text style={[styles.tdCell, { flex: 1, fontWeight: '700' }]}>{cStats.total}</Text>
                    <Text style={[styles.tdCell, { flex: 1, color: '#0369a1' }]}>{cStats.withId}</Text>
                    <Text style={[styles.tdCell, { flex: 1, color: '#16a34a', fontWeight: '700' }]}>{cStats.k1}</Text>
                    <Text style={[styles.tdCell, { flex: 1, color: '#2563eb', fontWeight: '700' }]}>{cStats.k2}</Text>
                    <Text style={[styles.tdCell, { flex: 1, color: '#64748b' }]}>{cStats.notApplied}</Text>
                    <TouchableOpacity
                      style={[styles.manageBtn, { flex: 1.2 }]}
                      onPress={() => {
                        setSelectedClass(className);
                        setActiveTab('students');
                      }}
                    >
                      <Text style={styles.manageBtnText}>View List →</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* SINGLE STUDENT QUICK UPDATE MODAL */}
      <Modal
        visible={modal.open}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModal((prev) => ({ ...prev, open: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✏️ Update Kanyashree Details</Text>
              <TouchableOpacity
                onPress={() => setModal((prev) => ({ ...prev, open: false }))}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 18, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {modal.student && (
              <View style={styles.modalBody}>
                {/* Student Mini Card */}
                <View style={styles.modalStudentCard}>
                  <Text style={styles.modalStudentName}>{modal.student.student_name}</Text>
                  <Text style={styles.modalStudentMeta}>
                    Reg: {modal.student.registration_no} · Class: {modal.student.class_name || '-'} · Roll: {modal.student.roll_no || '-'}
                  </Text>
                  <Text style={[styles.modalStudentMeta, { marginTop: 2, color: '#0369a1', fontWeight: '700' }]}>
                    🏫 Present School: {modal.student.admitted_school_name || 'Not Set'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Text style={{ fontSize: 13, color: '#475569' }}>
                      DOB: <Text style={{ fontWeight: '700' }}>{modal.student.date_of_birth || 'Not recorded'}</Text>
                      {calculateAge(modal.student.date_of_birth) !== null && ` (${calculateAge(modal.student.date_of_birth)} yrs)`}
                    </Text>
                    {calculateAge(modal.student.date_of_birth) !== null &&
                      (calculateAge(modal.student.date_of_birth) as number) >= 18 && (
                        <View style={styles.badge18Plus}>
                          <Text style={styles.badge18PlusText}>🎂 18+ (K2 Eligible)</Text>
                        </View>
                      )}
                  </View>
                </View>

                {/* Admitted / Present School Name */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Present / Admitted School Name (ভর্তিকৃত স্কুলের নাম):</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={modal.admittedSchoolName}
                    onChangeText={(val) => setModal((prev) => ({ ...prev, admittedSchoolName: val }))}
                    placeholder="e.g. Baidyadanga Girls High School (H.S)..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                {/* Kanyashree ID */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Kanyashree ID (কন্যাশ্রী আইডি):</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={modal.kanyashreeId}
                    onChangeText={(val) => setModal((prev) => ({ ...prev, kanyashreeId: val }))}
                    placeholder="e.g. 191201000000000001..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                {/* Quick Status Presets */}
                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.inputLabel}>Quick Status Selection (দ্রুত স্ট্যাটাস বাছুন):</Text>
                  <View style={styles.presetRow}>
                    {QUICK_STATUS_PRESETS.map((p) => {
                      const isSelected = modal.kanyashreeStatus === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[styles.presetBtn, isSelected && styles.presetBtnActive]}
                          onPress={() => setModal((prev) => ({ ...prev, kanyashreeStatus: p }))}
                        >
                          <Text style={[styles.presetBtnText, isSelected && styles.presetBtnTextActive]}>
                            {p}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Custom Status Input */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Status Remarks / Details (স্ট্যাটাস বিবরণ):</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={modal.kanyashreeStatus}
                    onChangeText={(val) => setModal((prev) => ({ ...prev, kanyashreeStatus: val }))}
                    placeholder="e.g. K1 Applied, K1 Sanctioned, K2 Applied..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                {/* Application Date */}
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.inputLabel}>Date (আবেদনের / অনুমোদনের তারিখ):</Text>
                    <TouchableOpacity
                      onPress={() => setModal((prev) => ({ ...prev, kanyashreeDate: getTodayString() }))}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0284c7' }}>📅 Set Today</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.modalInput}
                    value={modal.kanyashreeDate}
                    onChangeText={(val) => setModal((prev) => ({ ...prev, kanyashreeDate: val }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                {/* Actions */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setModal((prev) => ({ ...prev, open: false }))}
                    disabled={modal.saving}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalSaveBtn, modal.saving && styles.btnDisabled]}
                    onPress={executeSingleUpdate}
                    disabled={modal.saving}
                  >
                    <Text style={styles.modalSaveText}>
                      {modal.saving ? 'Saving...' : '💾 Save Kanyashree Details'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  compactHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    marginLeft: 4,
  },
  headerTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  navButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  navButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  tabButtonActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  tabButtonTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  frozenFilterWrapper: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    gap: 6,
    zIndex: 10,
  },
  content: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 24,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    gap: 8,
  },
  compactFilterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  compactSearchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0f172a',
  },
  compactStatsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactStatsText: {
    fontSize: 13,
    color: '#475569',
  },
  compactResetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: '#fee2e2',
  },
  compactResetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  compactRefreshBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: '#e0f2fe',
  },
  compactRefreshText: {
    fontSize: 13,
  },
  printBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  printBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  exportBtn: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  bulkBar: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  bulkBarActive: {
    backgroundColor: '#f0f9ff',
    borderColor: '#7dd3fc',
    borderWidth: 1.5,
  },
  bulkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkboxIcon: {
    fontSize: 18,
  },
  bulkSelectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  selectAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  selectedCountBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  bulkRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dateInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0f172a',
  },
  bulkMoveButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  bulkMoveButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  bulkCancelButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  bulkCancelText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  studentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  studentCardSelected: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderWidth: 1.5,
  },
  cardCheckbox: {
    padding: 4,
  },
  studentInfo: {
    flex: 1,
  },
  studentIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
  studentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  badgeClass: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeClassText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  badgeRoll: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeRollText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803d',
  },
  badgeSchool: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 340,
  },
  badgeSchoolText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  badgeSchoolMissing: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeSchoolMissingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  badge18Plus: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badge18PlusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
  },
  studentMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
  },
  metaHighlight: {
    fontWeight: '700',
    color: '#334155',
  },
  kanyashreeStatusCol: {
    alignItems: 'flex-end',
    minWidth: 190,
  },
  kanyashreeIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kanyashreeIdLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  kanyashreeIdText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontWeight: '800',
  },
  idPresent: {
    color: '#0369a1',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  idMissing: {
    color: '#dc2626',
    fontSize: 11,
    fontStyle: 'italic',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeSanctioned: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  statusTextSanctioned: {
    color: '#166534',
    fontWeight: '800',
    fontSize: 12,
  },
  statusBadgeApplied: {
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
  },
  statusTextApplied: {
    color: '#0369a1',
    fontWeight: '800',
    fontSize: 12,
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  statusTextPending: {
    color: '#92400e',
    fontWeight: '800',
    fontSize: 12,
  },
  statusBadgeOther: {
    backgroundColor: '#f3e8ff',
    borderColor: '#d8b4fe',
  },
  statusTextOther: {
    color: '#6b21a8',
    fontWeight: '800',
    fontSize: 12,
  },
  statusBadgeNone: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  statusTextNone: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 12,
  },
  dateBadgeText: {
    fontSize: 11,
    color: '#64748b',
  },
  updateButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  updateButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  paginationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paginationText: {
    fontSize: 13,
    color: '#475569',
  },
  pageNavBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  pageNavText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  pageCounter: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    paddingHorizontal: 4,
  },
  centerBox: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  // SUMMARY TAB STYLES
  summaryContainer: {
    gap: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderTopWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '900',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 11,
    color: '#94a3b8',
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tableCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tableCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  tableWrapper: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  thCell: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tdCell: {
    fontSize: 13,
    color: '#334155',
  },
  manageBtn: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
  },
  manageBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369a1',
  },
  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    maxWidth: 500,
    width: '100%',
    overflow: 'hidden',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalBody: {
    padding: 16,
  },
  modalStudentCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalStudentName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalStudentMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  presetBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  presetBtnTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: '#0284c7',
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
});
