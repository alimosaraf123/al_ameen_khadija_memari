import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, API_BASE } from '../lib/api';
import { STUDENT_CLASSES, isVisibleStudentClass } from '../lib/studentClasses';
import { filterStudents, sessionYears, normalizeStudentClass } from '../lib/studentDirectory';

type Option = { value: string; label: string };
export function Select({ label, value, options, onChange, searchable=false }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const visibleOptions = searchable && query ? options.filter(option => option.label.toLowerCase().includes(query.toLowerCase())) : options;
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${options.find(o => o.value === value)?.label || value}`} onPress={() => { setQuery(''); setOpen(true); }} style={s.select}>
      <Text style={s.selectText}>{options.find(o => o.value === value)?.label || value}  ▾</Text>
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Close dropdown" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => setOpen(false)} /><View style={s.selectPanel}>
        <Text style={s.panelTitle}>{label}</Text>
        {searchable && <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Type teacher name..." style={s.search} />}
        <ScrollView keyboardShouldPersistTaps="handled">{visibleOptions.map(option => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} style={[s.option, value === option.value && s.selected]} onPress={() => { onChange(option.value); setOpen(false); }}>
          <Text>{option.label}{value === option.value ? '  ✓' : ''}</Text>
        </TouchableOpacity>)}</ScrollView>

      </View></View>
    </Modal>
  </>;
}

const columns: [string, string, number][] = [
  ['serial', 'S.L', 45], ['photo', 'Photo', 66], ['registration_no', 'Reg.', 95],
  ['student_name', 'Name', 185], ['class_name', 'Class', 65], ['monthly_fees', 'Fees', 85],
  ['mobile_number', 'Mobile', 125], ['whatsapp_number', 'WhatsApp', 125], ['room_name', 'Room No.', 105], ['is_active', 'Status', 90], ['action', 'Action', 155],
];

export default function StudentDirectory({ students, loading, error, onEdit, onRefresh, onDeactivate }: {
  students: any[]; loading: boolean; error: string; onEdit: (student: any) => void; onRefresh: () => void; onDeactivate: (student: any) => void;
}) {
  const [year, setYear] = useState('all');
  const [className, setClassName] = useState('all');
  const [gender, setGender] = useState('all');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [size, setSize] = useState('10');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'student_name', ascending: true });
  const [detail, setDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const years = useMemo(() => [...new Set(students.flatMap(sessionYears))].sort((a, b) => b - a), [students]);
  const classes = useMemo(() => [...new Set<string>([
    ...STUDENT_CLASSES,
    ...students.map(student => normalizeStudentClass(student.class_name)).filter(Boolean).filter(isVisibleStudentClass),
  ])], [students]);
  const filtered = useMemo(() => filterStudents(students, { year, className, gender, status, search }).sort((a, b) => {
    const result = sort.key === 'monthly_fees' ? Number(a[sort.key] || 0) - Number(b[sort.key] || 0)
      : String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), undefined, { numeric: true });
    return sort.ascending ? result : -result;
  }), [students, year, className, gender, status, search, sort]);
  useEffect(() => { setPage(1); }, [year, className, gender, status, search, size]);
  const pages = Math.max(1, Math.ceil(filtered.length / Number(size)));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * Number(size);
  const rows = filtered.slice(start, start + Number(size));
  const openDetails = async (student: any) => {
    setDetailOpen(true); setDetail(null); setDetailError(''); setDetailLoading(true);
    try { const data = await api(`/api/students/${student.id}`); setDetail(data.student); }
    catch (error: any) { setDetailError(error.message || 'Unable to load student.'); }
    finally { setDetailLoading(false); }
  };
  return <View style={s.directory}>
    <View style={s.filters}>
      <Select label="Session year" value={year} onChange={setYear} options={[{ value: 'all', label: 'All Years' }, ...years.map(y => ({ value: String(y), label: String(y) }))]} />
      <Select label="Class" value={className} onChange={setClassName} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(c => ({ value: c, label: c }))]} />
      <Select label="Gender" value={gender} onChange={setGender} options={[{ value: 'all', label: 'All Genders' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
      <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'dropout', label: 'Dropout' }, { value: 'all', label: 'All Statuses' }]} />
    </View>
    <View style={s.toolbar}>
      <View style={s.inline}><Text>Show</Text><Select label="Entries per page" value={size} onChange={setSize} options={['10', '25', '50', '100'].map(value => ({ value, label: value }))} /><Text>Entries</Text></View>
      <View style={s.inline}><Text>Search:</Text><TextInput accessibilityLabel="Search students" value={search} onChangeText={setSearch} style={s.search} placeholder="Name, Reg. or mobile" /></View>
      <TouchableOpacity accessibilityRole="button" onPress={onRefresh} style={s.select}><Text>Refresh</Text></TouchableOpacity>
    </View>
    {loading ? <ActivityIndicator style={{ margin: 20 }} /> : error ? <Text style={s.error}>{error}</Text> : <>
      <ScrollView horizontal>
        <View>
          <View style={[s.row, s.tableHead]}>{columns.map(([key, title, width]) => <TouchableOpacity key={key} disabled={['serial', 'photo', 'action'].includes(key)} accessibilityRole="button" style={[s.cell, { width }]} onPress={() => setSort({ key, ascending: sort.key === key ? !sort.ascending : true })}><Text style={s.columnTitle}>{title}{sort.key === key ? (sort.ascending ? ' ↑' : ' ↓') : ''}</Text></TouchableOpacity>)}</View>
          {rows.map((student, index) => <View key={student.id} style={[s.row, index % 2 === 0 && s.striped]}>
            {columns.map(([key, , width]) => <View key={key} style={[s.cell, { width }]}>
              {key === 'serial' ? <Text>{start + index + 1}</Text> : key === 'photo' ? <Photo student={student} /> : key === 'action' ? <View style={s.inline}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${student.student_name}`} style={[s.action, s.edit]} onPress={() => onEdit(student)}><Text>Edit</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`View ${student.student_name}`} style={[s.action, s.view]} onPress={() => openDetails(student)}><Text>View</Text></TouchableOpacity>
                {student.is_active && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Mark ${student.student_name} as dropout`} style={[s.action, s.remove]} onPress={() => onDeactivate(student)}><Text style={{ color: '#fff' }}>×</Text></TouchableOpacity>}
              </View> : key === 'is_active' ? <Text style={{ color: student.is_active ? '#166534' : '#b91c1c', fontWeight: '700' }}>{student.is_active ? 'Active' : 'Dropout'}</Text>
                : <Text selectable style={s.cellText}>{String(student[key] ?? '—')}</Text>}
            </View>)}
          </View>)}
        </View>
      </ScrollView>
      {!rows.length && <Text style={s.empty}>No students match these filters.</Text>}
      <View style={s.toolbar}><Text>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + Number(size), filtered.length)} of {filtered.length} entries</Text>
        <View style={s.inline}><TouchableOpacity accessibilityRole="button" disabled={currentPage === 1} onPress={() => setPage(currentPage - 1)} style={[s.select, currentPage === 1 && s.disabled]}><Text>Previous</Text></TouchableOpacity><Text>{currentPage} / {pages}</Text><TouchableOpacity accessibilityRole="button" disabled={currentPage === pages} onPress={() => setPage(currentPage + 1)} style={[s.select, currentPage === pages && s.disabled]}><Text>Next</Text></TouchableOpacity></View>
      </View>
    </>}
    <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}><View style={s.overlay}><View style={s.detailPanel}>
      <View style={s.modalHeader}><Text style={s.modalTitle}>Student Details</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close student details" onPress={() => setDetailOpen(false)}><Text style={s.close}>×</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={{ padding: 18 }}>{detailLoading ? <ActivityIndicator /> : detailError ? <Text style={s.error}>{detailError}</Text> : detail && <><Photo student={detail} /><Text style={s.panelTitle}>{detail.student_name}</Text><RecordDetails record={detail} /></>}</ScrollView>
    </View></View></Modal>
  </View>;
}

function Photo({ student }: { student: any }) {
  const [failed, setFailed] = useState(false);
  const path = student.photo_url;
  return path && !failed ? <Image accessibilityLabel={`${student.student_name} photo`} onError={() => setFailed(true)} source={{ uri: /^https?:\/\//.test(path) ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}` }} style={s.photo} />
    : <View style={[s.photo, s.avatar]}><Text>{String(student.student_name || '?').charAt(0)}</Text></View>;
}

function RecordDetails({ record }: { record: any }) {
  return <>{Object.entries(record).filter(([key, value]) => !['id', 'room_id', 'room_name', 'photo_url', 'created_at', 'updated_at', 'user_id', 'visitor1', 'visitor2'].includes(key) && value !== null && value !== '').map(([key, value]) => <View key={key} style={s.detailRow}><Text style={s.detailLabel}>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text><Text selectable style={{ flex: 1 }}>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</Text></View>)}
    {(record.room_number || record.room_name) && <View style={s.detailRow}><Text style={s.detailLabel}>Room Number</Text><Text selectable style={{ flex: 1 }}>{record.room_number || record.room_name}</Text></View>}
    {['visitor1', 'visitor2'].map((key, index) => record[key] && <View key={key}><Text style={s.panelTitle}>Visitor {index + 1}</Text><RecordDetails record={record[key]} /></View>)}
  </>;
}

const s = StyleSheet.create({
  directory: { backgroundColor: '#fff', padding: 12, borderWidth: 1, borderColor: '#ccd5df', borderRadius: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: '#add8e6', padding: 8, borderRadius: 4 },
  select: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42, justifyContent: 'center' },
  selectText: { color: '#163451', fontSize: 13 }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 }, search: { borderWidth: 1, borderColor: '#aeb5bd', borderRadius: 3, width: 190, padding: 9, fontSize: 13 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#c3c7cc', minHeight: 48, alignItems: 'center' }, tableHead: { backgroundColor: '#cfe2ff', minHeight: 38 },
  cell: { paddingHorizontal: 7, paddingVertical: 6 }, cellText: { fontSize: 12, color: '#172b4d' }, columnTitle: { fontSize: 12, fontWeight: '800' }, striped: { backgroundColor: '#f1f1f1' },
  photo: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#94a3b8' }, avatar: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  action: { paddingHorizontal: 7, minHeight: 36, justifyContent: 'center', borderRadius: 4 }, edit: { backgroundColor: '#ffc107' }, view: { backgroundColor: '#22d3ee' }, remove: { backgroundColor: '#e11d48' },
  empty: { padding: 24, textAlign: 'center', color: '#64748b' }, disabled: { opacity: 0.4 }, error: { padding: 16, color: '#b91c1c' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 16 }, selectPanel: { backgroundColor: '#fff', padding: 16, borderRadius: 12, width: '100%', maxWidth: 340, maxHeight: '75%' },
  option: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#edf2f7' }, selected: { backgroundColor: '#dbeafe' }, panelTitle: { fontWeight: '800', fontSize: 17, marginVertical: 12 },
  detailPanel: { backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '90%', overflow: 'hidden' }, modalHeader: { backgroundColor: '#11101e', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' }, close: { color: '#fff', fontSize: 28, paddingHorizontal: 8 }, detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }, detailLabel: { width: '42%', color: '#475569', fontWeight: '600' },
});
