import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { Select } from '../components/StudentDirectory';
import { api } from '../lib/api';

const CLASS_OPTIONS = [
  { value: 'all', label: 'All Classes (সব ক্লাস)' },
  { value: 'V', label: 'Class V' },
  { value: 'VI', label: 'Class VI' },
  { value: 'VII', label: 'Class VII' },
  { value: 'VIII', label: 'Class VIII' },
  { value: 'IX', label: 'Class IX' },
  { value: 'X', label: 'Class X' },
  { value: 'XI-Sc.', label: 'Class XI-Sc.' },
  { value: 'XII-Sc.', label: 'Class XII-Sc.' },
];

const PAGE_SIZE_OPTIONS = [
  { value: '25', label: '25 per page' },
  { value: '50', label: '50 per page' },
  { value: '100', label: '100 per page' },
  { value: 'all', label: 'All Students' },
];

export default function Rooms() {
  const [activeTab, setActiveTab] = useState<'students' | 'rooms'>('students');

  // Rooms state
  const [rooms, setRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [savingRoom, setSavingRoom] = useState(false);

  // Students state
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState('50');
  const [page, setPage] = useState(1);

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkTargetRoom, setBulkTargetRoom] = useState('');
  const [bulkMoving, setBulkMoving] = useState(false);

  // Single student quick edit modal
  const [singleModal, setSingleModal] = useState<{
    open: boolean;
    student: any | null;
    targetRoomId: string;
    saving: boolean;
  }>({
    open: false,
    student: null,
    targetRoomId: '',
    saving: false,
  });

  const loadRooms = async () => {
    setLoadingRooms(true);
    try {
      const data = await api('/api/rooms');
      setRooms(data.rooms || []);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load rooms');
    } finally {
      setLoadingRooms(false);
    }
  };

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const data = await api('/api/rooms/students');
      setStudents(data.students || []);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    void loadRooms();
    void loadStudents();
  }, []);

  // Filter options for rooms dropdowns
  const roomFilterOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Rooms (সব রুম)' },
      { value: 'unassigned', label: 'Without Room (রুমহীন)' },
      ...rooms.map((r) => ({
        value: String(r.id),
        label: `Room ${r.room_name} (${r.student_count || 0} students)`,
      })),
    ];
  }, [rooms]);

  const targetRoomOptions = useMemo(() => {
    return [
      { value: '', label: 'Select Target Room (নতুন রুম বাছুন)' },
      { value: 'unassign', label: 'Remove from Room (রুমহীন করুন)' },
      ...rooms.map((r) => ({
        value: String(r.id),
        label: `Room ${r.room_name} (${r.student_count || 0} students)`,
      })),
    ];
  }, [rooms]);

  // Filter pipeline
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (selectedClass !== 'all' && s.class_name !== selectedClass) return false;
      if (selectedRoomFilter === 'unassigned') {
        if (s.room_id) return false;
      } else if (selectedRoomFilter !== 'all') {
        if (String(s.room_id) !== selectedRoomFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = String(s.student_name || '').toLowerCase().includes(q);
        const matchesReg = String(s.registration_no || '').toLowerCase().includes(q);
        const matchesRoll = String(s.roll_no || '').toLowerCase().includes(q);
        const matchesRoom = String(s.room_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesReg && !matchesRoll && !matchesRoom) return false;
      }
      return true;
    });
  }, [students, selectedClass, selectedRoomFilter, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [selectedClass, selectedRoomFilter, searchQuery, pageSize]);

  // Pagination
  const effectivePageSize = pageSize === 'all' ? Math.max(1, filteredStudents.length) : Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / effectivePageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const paginatedStudents = filteredStudents.slice(startIndex, startIndex + effectivePageSize);

  // Checkbox handlers
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isAllPaginatedSelected =
    paginatedStudents.length > 0 &&
    paginatedStudents.every((s) => selectedIds.includes(Number(s.id)));

  const toggleSelectAllPaginated = () => {
    if (isAllPaginatedSelected) {
      const pageIds = paginatedStudents.map((s) => Number(s.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      const newIds = new Set([...selectedIds, ...paginatedStudents.map((s) => Number(s.id))]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const selectAllFiltered = () => {
    const allFilteredIds = filteredStudents.map((s) => Number(s.id));
    if (selectedIds.length === allFilteredIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allFilteredIds);
    }
  };

  // Bulk Move execution
  const executeBulkMove = async () => {
    if (!selectedIds.length) {
      Alert.alert('Required', 'Please select at least one student.');
      return;
    }
    if (!bulkTargetRoom) {
      Alert.alert('Required', 'Please select a target room.');
      return;
    }

    const isUnassign = bulkTargetRoom === 'unassign';
    const targetRoomName = isUnassign
      ? 'Unassigned (রুমহীন)'
      : rooms.find((r) => String(r.id) === bulkTargetRoom)?.room_name || bulkTargetRoom;

    const confirmMsg = `Are you sure you want to move ${selectedIds.length} student(s) to ${isUnassign ? 'Unassigned' : `Room ${targetRoomName}`}?`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(confirmMsg)) return;
    }

    setBulkMoving(true);
    try {
      const res = await api('/api/rooms/bulk-update-student-rooms', {
        method: 'POST',
        body: JSON.stringify({
          student_ids: selectedIds,
          room_id: isUnassign ? null : Number(bulkTargetRoom),
        }),
      });

      const successMsg = res.message || `${selectedIds.length} students moved successfully!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(successMsg);
      } else {
        Alert.alert('Success', successMsg);
      }

      setSelectedIds([]);
      setBulkTargetRoom('');
      await Promise.all([loadStudents(), loadRooms()]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to move students');
    } finally {
      setBulkMoving(false);
    }
  };

  // Single student update
  const openSingleEdit = (student: any) => {
    setSingleModal({
      open: true,
      student,
      targetRoomId: student.room_id ? String(student.room_id) : 'unassign',
      saving: false,
    });
  };

  const executeSingleUpdate = async () => {
    if (!singleModal.student) return;
    setSingleModal((prev) => ({ ...prev, saving: true }));

    const isUnassign = singleModal.targetRoomId === 'unassign' || !singleModal.targetRoomId;
    const roomId = isUnassign ? null : Number(singleModal.targetRoomId);

    try {
      await api('/api/rooms/update-student-room', {
        method: 'POST',
        body: JSON.stringify({
          student_id: singleModal.student.id,
          room_id: roomId,
        }),
      });

      const targetName = isUnassign
        ? 'Unassigned'
        : rooms.find((r) => Number(r.id) === roomId)?.room_name || String(roomId);

      const msg = `${singleModal.student.student_name} room updated to ${isUnassign ? 'Unassigned' : `Room ${targetName}`}!`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Success', msg);
      }

      setSingleModal({ open: false, student: null, targetRoomId: '', saving: false });
      await Promise.all([loadStudents(), loadRooms()]);
    } catch (e: any) {
      setSingleModal((prev) => ({ ...prev, saving: false }));
      Alert.alert('Error', e.message || 'Failed to update student room');
    }
  };

  // Room CRUD
  const saveRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Required', 'Please enter room name or number');
      return;
    }
    setSavingRoom(true);
    try {
      if (editingRoomId !== null) {
        await api(`/api/rooms/${editingRoomId}`, {
          method: 'PUT',
          body: JSON.stringify({
            room_name: roomName.trim(),
            description: roomDesc.trim(),
            is_active: true,
          }),
        });
        Alert.alert('Success', 'Room updated successfully');
      } else {
        await api('/api/rooms', {
          method: 'POST',
          body: JSON.stringify({
            room_name: roomName.trim(),
            description: roomDesc.trim(),
          }),
        });
        Alert.alert('Success', 'Room created successfully');
      }
      setRoomName('');
      setRoomDesc('');
      setEditingRoomId(null);
      await loadRooms();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save room');
    } finally {
      setSavingRoom(false);
    }
  };

  const startEditRoom = (room: any) => {
    setEditingRoomId(room.id);
    setRoomName(room.room_name || '');
    setRoomDesc(room.description || '');
  };

  const cancelEditRoom = () => {
    setEditingRoomId(null);
    setRoomName('');
    setRoomDesc('');
  };

  // Switch to student allocation tab filtered by this room
  const manageRoomStudents = (roomId: string) => {
    setSelectedRoomFilter(roomId);
    setSelectedClass('all');
    setSearchQuery('');
    setActiveTab('students');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Ultra Compact Top Header Bar */}
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
          <Text style={styles.headerTitle}>Hostel - Rooms & Student Allocation</Text>
        </View>

        <View style={styles.headerTabs}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'students' && styles.tabButtonActive]}
            onPress={() => setActiveTab('students')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'students' && styles.tabButtonTextActive]}>
              👥 Student Allocation ({students.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'rooms' && styles.tabButtonActive]}
            onPress={() => setActiveTab('rooms')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'rooms' && styles.tabButtonTextActive]}>
              🏢 Manage Rooms ({rooms.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Frozen Filter Toolbar for Students Tab */}
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

            <View style={{ width: 185 }}>
              <Select
                label="All Rooms"
                value={selectedRoomFilter}
                onChange={setSelectedRoomFilter}
                options={roomFilterOptions}
                searchable={true}
              />
            </View>

            <View style={{ flex: 1, minWidth: 160 }}>
              <TextInput
                style={styles.compactSearchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search name, reg. no, or roll..."
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={styles.compactStatsGroup}>
              <Text style={styles.compactStatsText}>
                <Text style={{ fontWeight: '800', color: '#0284c7' }}>{filteredStudents.length}</Text> / {students.length}
              </Text>
              {Boolean(selectedClass !== 'all' || selectedRoomFilter !== 'all' || searchQuery.trim().length > 0) ? (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedClass('all');
                    setSelectedRoomFilter('all');
                    setSearchQuery('');
                  }}
                  style={styles.compactResetBtn}
                  accessibilityLabel="Reset filters"
                >
                  <Text style={styles.compactResetText}>✕ Reset</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  void loadStudents();
                  void loadRooms();
                }}
                style={styles.compactRefreshBtn}
                accessibilityLabel="Refresh list"
              >
                <Text style={styles.compactRefreshText}>🔄</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* BULK ACTION BAR (FROZEN) */}
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
                <View style={{ minWidth: 220 }}>
                  <Select
                    label="Select Target Room"
                    value={bulkTargetRoom}
                    onChange={setBulkTargetRoom}
                    options={targetRoomOptions}
                    searchable={true}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.bulkMoveButton, (!bulkTargetRoom || bulkMoving) && styles.btnDisabled]}
                  onPress={executeBulkMove}
                  disabled={!bulkTargetRoom || bulkMoving}
                >
                  <Text style={styles.bulkMoveButtonText}>
                    {bulkMoving ? 'Moving...' : `🚀 Move (${selectedIds.length}) to Target Room`}
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* TAB 1: STUDENT ROOM ALLOCATION */}
        {activeTab === 'students' && (
          <View>

            {/* Students List */}
            {loadingStudents ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={styles.loadingText}>Loading students...</Text>
              </View>
            ) : filteredStudents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No students match the selected filters.</Text>
                <Text style={styles.emptySubtitle}>Try changing the class, room filter, or search term.</Text>
              </View>
            ) : (
              <View>
                {paginatedStudents.map((s, idx) => {
                  const isSelected = selectedIds.includes(Number(s.id));
                  const hasRoom = Boolean(s.room_id);

                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.studentCard,
                        isSelected && styles.studentCardSelected,
                      ]}
                    >
                      {/* Checkbox */}
                      <TouchableOpacity
                        onPress={() => toggleSelect(Number(s.id))}
                        style={styles.cardCheckbox}
                      >
                        <Text style={{ fontSize: 20 }}>{isSelected ? '☑️' : '⬜'}</Text>
                      </TouchableOpacity>

                      {/* Info */}
                      <View style={styles.studentInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.studentIndex}>{startIndex + idx + 1}</Text>
                          <Text style={styles.studentName}>{s.student_name}</Text>
                          <View style={styles.badgeClass}>
                            <Text style={styles.badgeClassText}>Class {s.class_name || '-'}</Text>
                          </View>
                          {Boolean(s.roll_no) ? (
                            <View style={styles.badgeRoll}>
                              <Text style={styles.badgeRollText}>Roll: {s.roll_no}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.studentMeta}>
                          Reg. No: <Text style={styles.metaHighlight}>{s.registration_no || '-'}</Text>
                          {s.gender ? ` · ${s.gender}` : ''}
                          {s.student_type ? ` · ${s.student_type}` : ''}
                        </Text>
                      </View>

                      {/* Current Room Badge */}
                      <View style={styles.roomStatusCol}>
                        <Text style={styles.roomStatusLabel}>Current Room:</Text>
                        <View style={[styles.roomBadge, hasRoom ? styles.roomBadgeActive : styles.roomBadgeNone]}>
                          <Text style={[styles.roomBadgeText, hasRoom ? styles.roomBadgeTextActive : styles.roomBadgeTextNone]}>
                            {hasRoom ? `🏠 Room ${s.room_name}` : '🔴 Unassigned'}
                          </Text>
                        </View>
                      </View>

                      {/* Action Button */}
                      <TouchableOpacity
                        style={styles.changeRoomButton}
                        onPress={() => openSingleEdit(s)}
                      >
                        <Text style={styles.changeRoomButtonText}>⇄ Change Room</Text>
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

        {/* TAB 2: MANAGE ROOMS MASTER */}
        {activeTab === 'rooms' && (
          <View>
            {/* Add / Edit Room Card */}
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                {editingRoomId !== null ? '✏️ Edit Room Details' : '➕ Add New Room'}
              </Text>
              <View style={styles.formGrid}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={styles.inputLabel}>Room Number / Name (যেমন: 201, 302):</Text>
                  <TextInput
                    style={styles.textInput}
                    value={roomName}
                    onChangeText={setRoomName}
                    placeholder="e.g. 201, 305, Dorm-A..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={{ flex: 1.5, minWidth: 260 }}>
                  <Text style={styles.inputLabel}>Description / Capacity / Details:</Text>
                  <TextInput
                    style={styles.textInput}
                    value={roomDesc}
                    onChangeText={setRoomDesc}
                    placeholder="e.g. 2nd floor, 16 beds..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={styles.formActions}>
                {editingRoomId !== null && (
                  <TouchableOpacity style={styles.cancelFormBtn} onPress={cancelEditRoom}>
                    <Text style={styles.cancelFormBtnText}>Cancel Edit</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.submitFormBtn, savingRoom && styles.btnDisabled]}
                  onPress={saveRoom}
                  disabled={savingRoom}
                >
                  <Text style={styles.submitFormBtnText}>
                    {savingRoom ? 'Saving...' : editingRoomId !== null ? 'Update Room' : 'Add Room'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Rooms Grid */}
            <View style={styles.roomsHeaderRow}>
              <Text style={styles.sectionHeading}>
                All Rooms List ({rooms.length} Rooms)
              </Text>
              <TouchableOpacity onPress={loadRooms} style={styles.refreshBtn}>
                <Text style={styles.refreshBtnText}>🔄 Refresh Rooms</Text>
              </TouchableOpacity>
            </View>

            {loadingRooms ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#0284c7" />
              </View>
            ) : rooms.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No rooms found.</Text>
                <Text style={styles.emptySubtitle}>Use the form above to add your first room.</Text>
              </View>
            ) : (
              <View style={styles.roomsGrid}>
                {rooms.map((room) => {
                  const studentCount = Number(room.student_count || 0);

                  return (
                    <View key={room.id} style={styles.roomCard}>
                      <View style={styles.roomCardTop}>
                        <View>
                          <Text style={styles.roomCardName}>Room {room.room_name}</Text>
                          <Text style={styles.roomCardDesc}>
                            {room.description || 'No description provided'}
                          </Text>
                        </View>
                        <View style={[styles.studentCountPill, studentCount > 0 ? styles.pillActive : styles.pillZero]}>
                          <Text style={[styles.studentCountPillText, studentCount > 0 ? styles.pillTextActive : styles.pillTextZero]}>
                            👥 {studentCount} {studentCount === 1 ? 'Student' : 'Students'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.roomCardButtons}>
                        <TouchableOpacity
                          style={styles.roomManageBtn}
                          onPress={() => manageRoomStudents(String(room.id))}
                        >
                          <Text style={styles.roomManageBtnText}>
                            ⇄ Manage Students ({studentCount})
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.roomEditBtn}
                          onPress={() => startEditRoom(room)}
                        >
                          <Text style={styles.roomEditBtnText}>✏️ Edit</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* SINGLE STUDENT QUICK ROOM CHANGE MODAL */}
      <Modal
        visible={singleModal.open}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSingleModal((prev) => ({ ...prev, open: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⇄ Change Student Room</Text>
              <TouchableOpacity
                onPress={() => setSingleModal((prev) => ({ ...prev, open: false }))}
                style={{ padding: 4 }}
              >
                <Text style={{ fontSize: 18, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {singleModal.student && (
              <View style={styles.modalBody}>
                <View style={styles.modalStudentCard}>
                  <Text style={styles.modalStudentName}>{singleModal.student.student_name}</Text>
                  <Text style={styles.modalStudentMeta}>
                    Reg: {singleModal.student.registration_no} · Class: {singleModal.student.class_name || '-'} · Roll: {singleModal.student.roll_no || '-'}
                  </Text>
                  <Text style={{ fontSize: 13, marginTop: 4, color: '#334155' }}>
                    Current Room:{' '}
                    <Text style={{ fontWeight: '800', color: singleModal.student.room_id ? '#0369a1' : '#b91c1c' }}>
                      {singleModal.student.room_id ? `Room ${singleModal.student.room_name}` : 'Unassigned (কোনো রুম নেই)'}
                    </Text>
                  </Text>
                </View>

                <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                  Select New Room (নতুন রুম বাছুন):
                </Text>
                <Select
                  label="Select Room"
                  value={singleModal.targetRoomId}
                  onChange={(val) => setSingleModal((prev) => ({ ...prev, targetRoomId: val }))}
                  options={targetRoomOptions}
                  searchable={true}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setSingleModal((prev) => ({ ...prev, open: false }))}
                    disabled={singleModal.saving}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalSaveBtn, singleModal.saving && styles.btnDisabled]}
                    onPress={executeSingleUpdate}
                    disabled={singleModal.saving}
                  >
                    <Text style={styles.modalSaveText}>
                      {singleModal.saving ? 'Updating...' : 'Save & Update Room'}
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
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
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
    gap: 10,
    flexWrap: 'wrap',
  },
  bulkMoveButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bulkMoveButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  bulkCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  bulkCancelText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 13,
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
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeClassText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  badgeRoll: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeRollText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369a1',
  },
  studentMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  metaHighlight: {
    fontWeight: '700',
    color: '#334155',
  },
  roomStatusCol: {
    alignItems: 'flex-end',
    minWidth: 130,
  },
  roomStatusLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
  },
  roomBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roomBadgeActive: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  roomBadgeNone: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  roomBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  roomBadgeTextActive: {
    color: '#047857',
  },
  roomBadgeTextNone: {
    color: '#dc2626',
  },
  changeRoomButton: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  changeRoomButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0369a1',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pageNavText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  pageCounter: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    paddingHorizontal: 6,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancelFormBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  cancelFormBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14,
  },
  submitFormBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
  },
  submitFormBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  roomsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  roomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  roomCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
    maxWidth: 360,
    flex: 1,
    minWidth: 260,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  roomCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  roomCardName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  roomCardDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  studentCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  pillActive: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  pillZero: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  studentCountPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pillTextActive: {
    color: '#047857',
  },
  pillTextZero: {
    color: '#94a3b8',
  },
  roomCardButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  roomManageBtn: {
    flex: 1,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  roomManageBtnText: {
    color: '#0369a1',
    fontWeight: '800',
    fontSize: 12,
  },
  roomEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    alignItems: 'center',
  },
  roomEditBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12,
  },
  centerBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#64748b',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalBody: {
    gap: 8,
  },
  modalStudentCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalStudentName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalStudentMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSaveBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#0284c7',
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
});
