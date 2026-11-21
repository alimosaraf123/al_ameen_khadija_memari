import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { api, API_BASE } from '../lib/api';
import { getToken, getUser } from '../lib/auth';
import { STUDENT_CLASSES, isVisibleStudentClass } from '../lib/studentClasses';
import { filterStudents, studentSession, normalizeStudentClass, studentStatusLabel } from '../lib/studentDirectory';

type Option = { value: string; label: string; shortLabel?: string; keywords?: string[] };
export function Select({ label, value, options, onChange, searchable = false, style, textStyle, placeholderTextStyle, chevron, panelWidth, panelMaxHeight }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; searchable?: boolean; style?: any; textStyle?: any; placeholderTextStyle?: any; chevron?: string; panelWidth?: number; panelMaxHeight?: number }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [previewLabel, setPreviewLabel] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [anchor, setAnchor] = useState({ x: 16, y: 60, width: 280, maxHeight: 380 });
  const buttonRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const lastKeyboardAction = useRef({ key: '', at: 0 });

  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();

    const scored = options.map((opt, origIndex) => {
      if (!opt.value && (opt.label || '').toLowerCase().startsWith('select')) {
        return { opt, score: -1, origIndex };
      }
      const lbl = (opt.label || '').toLowerCase();
      const val = (opt.value || '').toLowerCase();
      const short = (opt.shortLabel || '').toLowerCase();
      const kw = (opt.keywords || []).map(k => String(k).toLowerCase());

      let score = 0;
      if (val === q || short === q || lbl === q || kw.includes(q)) {
        score = 100;
      } else if (val.startsWith(q) || short.startsWith(q) || lbl.startsWith(q)) {
        score = 85;
      } else if (kw.some(k => k.startsWith(q))) {
        score = 80;
      } else if (q.startsWith(val) || (short && q.startsWith(short)) || kw.some(k => q.startsWith(k))) {
        score = 75;
      } else if (lbl.split(/[\s\-_()/]+/).some(w => w.startsWith(q))) {
        score = 65;
      } else if (val.includes(q) || short.includes(q) || lbl.includes(q) || kw.some(k => k.includes(q))) {
        score = 40;
      }

      return { opt, score, origIndex };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.origIndex - b.origIndex)
      .map(item => item.opt);
  }, [options, query, searchable]);

  useEffect(() => {
    if (searchable && query.trim() && visibleOptions.length > 0) {
      setActiveIndex(0);
    }
  }, [query, searchable, visibleOptions]);

  const previewOption = (index: number) => {
    const next = Math.max(0, Math.min(index, visibleOptions.length - 1));
    setActiveIndex(next);
  };

  const chooseOption = (option?: Option) => {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const handleSearchKey = (event: any) => {
    const rawKey = event?.key || event?.nativeEvent?.key || event?.code || event?.nativeEvent?.code;
    const key = String(rawKey || '').toLowerCase();
    const normalizedKey = key === 'arrowdown' || key === 'down' ? 'down'
      : key === 'arrowup' || key === 'up' ? 'up'
        : key === 'enter' || key === 'return' ? 'enter'
          : key === 'escape' || key === 'esc' ? 'escape' : '';
    if (!normalizedKey) return;
    const now = Date.now();
    if (lastKeyboardAction.current.key === normalizedKey && now - lastKeyboardAction.current.at < 60) return;
    lastKeyboardAction.current = { key: normalizedKey, at: now };
    if (normalizedKey === 'escape') { event.preventDefault?.(); setOpen(false); return; }
    if (!visibleOptions.length) return;
    if (normalizedKey === 'down') {
      event.preventDefault?.();
      previewOption(activeIndex < 0 ? 0 : activeIndex + 1);
      return;
    }
    if (normalizedKey === 'up') {
      event.preventDefault?.();
      previewOption(activeIndex <= 0 ? 0 : activeIndex - 1);
      return;
    }
    if (normalizedKey === 'enter') {
      event.preventDefault?.();
      const targetIndex = activeIndex >= 0 ? activeIndex : 0;
      if (visibleOptions[targetIndex]) {
        chooseOption(visibleOptions[targetIndex]);
      }
    }
  };

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return;

    let buffer = '';
    let bufferTimer: any = null;

    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT' && activeEl === inputRef.current) {
        return;
      }
      if (activeEl && activeEl.tagName === 'INPUT' && activeEl !== inputRef.current) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, visibleOptions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const targetIndex = activeIndex >= 0 ? activeIndex : 0;
        if (visibleOptions[targetIndex]) {
          chooseOption(visibleOptions[targetIndex]);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (searchable && inputRef.current) {
          try {
            inputRef.current.focus();
            setQuery(prev => prev + e.key);
            e.preventDefault();
            return;
          } catch (_) { }
        }

        e.preventDefault();
        buffer += e.key.toLowerCase();
        clearTimeout(bufferTimer);
        bufferTimer = setTimeout(() => { buffer = ''; }, 650);

        const matchIdx = visibleOptions.findIndex(o => {
          const l = (o.label || '').toLowerCase();
          const v = (o.value || '').toLowerCase();
          const sl = (o.shortLabel || '').toLowerCase();
          const kw = (o.keywords || []).map(k => String(k).toLowerCase());
          return v.startsWith(buffer) || sl.startsWith(buffer) || l.startsWith(buffer) || kw.some(k => k.startsWith(buffer));
        });

        if (matchIdx >= 0) {
          setActiveIndex(matchIdx);
        } else if (buffer.length > 1) {
          const char = e.key.toLowerCase();
          const singleIdx = visibleOptions.findIndex(o => {
            const l = (o.label || '').toLowerCase();
            const v = (o.value || '').toLowerCase();
            const sl = (o.shortLabel || '').toLowerCase();
            const kw = (o.keywords || []).map(k => String(k).toLowerCase());
            return v.startsWith(char) || sl.startsWith(char) || l.startsWith(char) || kw.some(k => k.startsWith(char));
          });
          if (singleIdx >= 0) {
            setActiveIndex(singleIdx);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(bufferTimer);
    };
  }, [open, visibleOptions, activeIndex, searchable]);

  const handleOpen = (event: any) => {
    const w = Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerHeight : 800;

    const calculate = (bx: number, by: number, bw: number, bh: number) => {
      const preferredWidth = panelWidth || 340;
      const preferredHeight = panelMaxHeight || 380;
      const dropdownW = Math.max(220, Math.min(preferredWidth, w - 16));
      let left = bx;
      if (left + dropdownW > w - 12) {
        left = Math.max(8, w - dropdownW - 12);
      }
      if (left < 8) left = 8;

      const estimatedH = Math.min(preferredHeight, (searchable ? 100 : 54) + Math.max(visibleOptions.length, 1) * 46);
      const spaceBelow = h - (by + bh) - 12;
      const spaceAbove = by - 12;

      let top: number;
      let maxHeight: number;

      if (spaceBelow >= estimatedH || spaceBelow >= spaceAbove) {
        top = by + bh + 4;
        maxHeight = Math.max(120, Math.min(preferredHeight, spaceBelow - 8));
      } else {
        const actualH = Math.min(estimatedH, Math.max(120, spaceAbove - 8));
        top = Math.max(8, by - actualH - 4);
        maxHeight = Math.max(120, spaceAbove - 8);
      }

      setAnchor({ x: Math.round(left), y: Math.round(top), width: dropdownW, maxHeight: Math.round(maxHeight) });
      setQuery('');
      setPreviewLabel('');
      const currentIdx = options.findIndex(o => o.value === value);
      setActiveIndex(currentIdx >= 0 ? currentIdx : -1);
      setOpen(true);
      if (searchable) {
        setTimeout(() => {
          try {
            inputRef.current?.focus?.();
          } catch (_) { }
        }, 50);
      }
    };

    if (Platform.OS === 'web') {
      const el = (buttonRef.current as any) || (event?.currentTarget as any);
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        calculate(rect.left, rect.top, rect.width, rect.height);
        return;
      }
    }

    if (buttonRef.current?.measureInWindow) {
      buttonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        calculate(x || 16, y || 60, width || 220, height || 40);
      });
      return;
    }

    const n = event?.nativeEvent || {};
    const cy = Number(n.clientY ?? n.pageY) || 60;
    const cx = Number(n.clientX ?? n.pageX) || 16;
    calculate(cx, cy, 220, 40);
  };

  const selectedOpt = options.find(o => o.value === value);
  const buttonDisplay = selectedOpt?.shortLabel || selectedOpt?.label || label;
  const chevronChar = chevron !== undefined ? chevron : '▼';

  return <>
    <TouchableOpacity
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${buttonDisplay}`}
      onPress={handleOpen}
      style={[s.select, style]}
    >
      <Text style={[s.selectText, !value && s.selectPlaceholder, textStyle, !value && placeholderTextStyle]} numberOfLines={1} ellipsizeMode="tail">
        {buttonDisplay}{chevronChar ? `  ${chevronChar}` : ''}
      </Text>
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={[s.overlay, Platform.OS === 'web' && s.webSelectOverlay]}><Pressable accessibilityRole="button" accessibilityLabel="Close dropdown" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => setOpen(false)} /><View style={[s.selectPanel, Platform.OS !== 'web' && panelWidth ? { maxWidth: panelWidth } : false, Platform.OS !== 'web' && panelMaxHeight ? { maxHeight: panelMaxHeight } : false, Platform.OS === 'web' && { position: 'absolute', left: anchor.x, top: anchor.y, width: anchor.width, maxWidth: anchor.width, maxHeight: anchor.maxHeight, borderWidth: 1, borderColor: '#cbd5e1', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' as any }]}>
        <Text style={s.panelTitle}>{label}</Text>
        {searchable && (
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={text => { setQuery(text); setActiveIndex(0); }}
            placeholder={label ? `Search ${label}...` : "Type to search..."}
            style={[s.search, { width: '100%', marginBottom: 8 }]}
            {...(Platform.OS === 'web' ? { onKeyDown: handleSearchKey, onKeyPress: handleSearchKey } as any : { onKeyPress: handleSearchKey })}
          />
        )}
        <ScrollView keyboardShouldPersistTaps="handled">{visibleOptions.map((option, index) => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value }} style={[s.option, value === option.value && s.selected, index === activeIndex && { backgroundColor: '#e0f2fe', borderLeftWidth: 4, borderLeftColor: '#2563eb' }]} onPress={() => chooseOption(option)}>
          <Text>{option.label}{value === option.value ? '  Selected' : ''}</Text>
        </TouchableOpacity>)}</ScrollView>

      </View></View>
    </Modal>
  </>;
}

const WHATSAPP_ICON_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGe0lEQVR4nNWbaYwVRRDHZ0EQUTQgahABQREBFZKNBkHRD0a5iYknglES8BaJRsFEifeF8cDIBlTUQEQRb6MIBKOiIIgiK3FF4xrihexK8ABx2Z8pqMc+Z7t7eubNvPf2/3Gmu67prq6uqgmCjAF0AEYC04FngVXAd8BWYAfQANQDtcAXwEvAPcA4oGvQEgEcA8wAPgH+pTBsAp4ETgMqgnIFsB8wHvgQaCQbfA/cBnQKygVAG2CyLuti4Q9gJnB4qZU/HdhA6fA7MAVoXWzFOwDzYi51+Wqrged0Gd8ATAIuA64BpgGzgeXAzzENsRboUyzlBwA1noJVq7JDxEfE5HM8cBWwRE8KHwNPyE7zYI9QF+jR5cI/wFNAZYp8uwK3Ar96GOJxoFVavPcBuBrY7WDcoEu4W5ARgPa6dSRucGEh0DZNxjdFMPw0zS/uIc9hHj7onVSMAExwMJLnj8lRmIpm8WUbG7EaXihoOwAjHJHcn8CoVDVKJmNPYKPDCDOTEu6m8boJYvXBQZkA6Ah85DDCRUmiu5WO4GNAUGYADtI4wybz0XGI3WIh9DcwNChTAJ2Bry2yr/C6TAHdNagwYWJQ5gB6A9st8o/zIbDYMvn5oIVAb6Um/CRhfFSY22iZeEgE01bA7cA36iR/Ax4MSgTgNYsRbnZNejHp0gHmGuaJMU8JSgBxesBflo/ZzjShlyXUXR3lPMQ3YMf8LBWNkEtSayZMMg2eYRk81uP42eYwwM5SJS40ZJaALYyV4YEVwLeGgRs9vv6VRGN61so65JPboWlr9sofdHJsh9E0d6mHAWqLnrVpkq/SItO0qMCnwSctrU7FB2OyVtYh41cGeZbmD5CsSxhrPImbPK0Jb2SpZISMDxjkEbnb5va/KfLzOsM9szSCFdmrapXxHItMp+ZCXxNGexK3XZrCGJ69qs6TynTET5SXZ1sEPtaT+N0eyt+XvZqRctYa5WJv5tV0dnt5bTFURGrqlXIoaVn83KJAi5Zh/BCT+HsOA5TF9Rl4xiDbMlu4WB2T+FCHARYHZQDNXYaxyvZidQIGtouU4MJs1Ioln/lDA/cbXqxNwOAIx5EoV+Pu2ajmLZ8UU8NYZ4sCqxMyGelwiJ8BB6SvmrdscwwyvS8vrjC82JKypXNYYryLFwHAywZ53szV+8KQr9g+IaPWwFsOI7wLHOxJq4u2ynRJIkuI1nqDLFXyYqBF0MoCy+dfOowgmdt+HtHbhry4ZPb/rrDx5GmlGe0wpuZqAMIgjMlJDaBMe0TU+eX+cZ0p4NL7iSk5K1Wq+cAJMWU50SLDiNyANYaXCwsxgNLt69HssE6uyvnRoiZXXWjUpOdATzmmWGh0yQ2oMgyoS6PoqY0Om/FrppiqkamrDB/uRYjcFuLsDHM35g8418LgvEINkNfgIMdgFnCuAuBQNVQYT+QPameppixPwwDK48CIaDEJGj3qFdJ/ZMKw8EBxLib0T8sIyud83V5pYK2H9zd1sf3SrGcJGG1hMjdNA+SV3ufH2Ot45/ebG9uEh20BTI0lOXpS2kZQnv31uEtiiEdceQbtXK226NPbNulSC7OmDGo2hpCY4Q7JQ3goLst3vAfNGy3zFwQRVttkmXhW2opbAqDBkpAFPtYYok7bcJcB14sz9WybMTn13ZE+DbvlBgUtAJLq1q41E6qSXhvrS1XZiQttrTdhi1eXOebs6aKgBUD7jW24xIdAH8vkgi5GxYAGPLZkzDxfItdaCPh3WJUAwJ2OL1/t4zj3QOp3BgI1QZlCEisR4bUUbnvG8Z7bDURmecztGBQZcippP5IN22L1MwJn+NYI1fISOj+qsXaj9uFlflTq7W5ORPS4NbYsmPPmuzS9tT9wJnCXBiiuP8FezaIxStpsNIVv6wHMQaLJvkkYrDEQq9Oyl28PQD7Wa8or8fbQbTla/yWM+lFD8AFwZNJltZts0KBpr1nAxZIMlYSnQQbJSRyn6bHpmkL3NbzIfm/c33L2QUpXFB87NcKs162WFLLShgSFAHg6IXPJ7L5t6cHJGls02Znsq4cMsNmT6S7dZzP0V9Y2ebe4MRE9+2nhR02e+gU3Hsr3i9hbn2u5a7jnVXSQHo8+d3tf7FBHOCr133NonjPfpGlySSd1LoBuhfYfymp5PaZBcj9ZPqSGb+Y00+6cWKD9vj0yY7SXVyddIcPkNxbtMpWj8nI1uARjR2UpQxj/Aft8xpZCVJSmAAAAAElFTkSuQmCC';

const DOCUMENT_SLOTS = [
  ['father_photo', 'Father Photo'], ['mother_photo', 'Mother Photo'],
  ['visitor1_photo', 'Visitor-1 Photo'], ['visitor2_photo', 'Visitor-2 Photo'],
  ['birth_certificate', 'Date Of Birth'], ['aadhaar', 'Aadhaar'], ['bank_passbook', 'Passbook'], ['obc_certificate', 'OBC'],
  ['ix_registration', 'MP Registration'], ['mp_admit', 'MP Admit'], ['mp_marksheet', 'MP Marksheet'],
  ['transfer_certificate', 'T.C.'], ['xi_registration', 'HS Registration'],
  ['hs_admit_3rd', 'HS Admit 3rd Semester'], ['hs_admit_4th', 'HS Admit 4th Semester'],
  ['xi_admission_slip', 'XI Admission Slip'], ['signature', 'Signature'],
  ['ph_certificate', 'P.H. Certificate'], ['xi_marksheet', 'XI Marksheet'],
  ['hs_marksheet', 'H.S Marksheet'], ['hs_certificate', 'H.S Certificate'], ['admission_slip', 'Admission Slip'], ['other', 'Others'],
  ['other_2', 'Others-2'], ['other_3', 'Others-3'],
] as const;

const columns: [string, string, number][] = [
  ['serial', 'S.L', 45], ['photo', 'Photo', 66], ['registration_no', 'Reg.', 95],
  ['student_name', 'Name', 185], ['class_name', 'Class', 65], ['monthly_fees', 'Fees', 85],
  ['mobile_number', 'Mobile', 125], ['whatsapp_number', 'WhatsApp', 125], ['room_name', 'Room No.', 105], ['is_active', 'Status', 90], ['action', 'Action', 195],
];

export default function StudentDirectory({
  students, loading, error, onEdit, onRefresh, onDeactivate, canDeactivate,
  initialStatus = 'all',
  initialSearch = '',
  initialYear = 'all',
}: {
  students: any[]; loading: boolean; error: string; onEdit: (student: any) => void; onRefresh: () => void; onDeactivate: (student: any) => void;
  canDeactivate?: boolean;
  initialStatus?: string;
  initialSearch?: string;
  initialYear?: string;
}) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  useEffect(() => {
    void getUser<any>().then(u => setIsSuperAdmin(u?.role === 'super_admin'));
  }, []);
  const allowDeactivate = canDeactivate !== undefined ? canDeactivate : isSuperAdmin;
  const currentColumns: [string, string, number][] = useMemo(() => {
    return columns.map(([key, title, width]) => {
      if (key === 'action') {
        return [key, title, allowDeactivate ? 195 : 155] as [string, string, number];
      }
      return [key, title, width] as [string, string, number];
    });
  }, [allowDeactivate]);
  const [year, setYear] = useState(initialYear || 'all');
  const [className, setClassName] = useState('all');
  const [gender, setGender] = useState('all');
  const [status, setStatus] = useState(initialStatus || 'all');
  const [search, setSearch] = useState(initialSearch || '');

  useEffect(() => {
    if (initialStatus) setStatus(initialStatus);
  }, [initialStatus]);
  useEffect(() => {
    if (initialSearch !== undefined) setSearch(initialSearch);
  }, [initialSearch]);
  useEffect(() => {
    if (initialYear) setYear(initialYear);
  }, [initialYear]);

  const [size, setSize] = useState('10');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'student_name', ascending: true });
  const [detail, setDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [documentStudent, setDocumentStudent] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [documentBusy, setDocumentBusy] = useState<string | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<Record<string, any>>({});

  const defaultSessions = useMemo(() => {
    const list: string[] = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 1; y >= 2018; y--) {
      list.push(`${y}-${y + 1}`);
      list.push(`${y}-${y}`);
    }
    return list;
  }, []);

  const sessions = useMemo(() => {
    const fromStudents = students.map(studentSession).filter(Boolean);
    return [...new Set([...fromStudents, ...defaultSessions])].sort().reverse();
  }, [students, defaultSessions]);
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
  const pageSize = size === 'all' ? Math.max(1, filtered.length) : Number(size);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  const openDetails = async (student: any) => {
    setDetailOpen(true); setDetail(null); setDetailError(''); setDetailLoading(true);
    try { const data = await api(`/api/students/${student.id}`); setDetail(data.student); }
    catch (error: any) { setDetailError(error.message || 'Unable to load student.'); }
    finally { setDetailLoading(false); }
  };
  const openDocuments = async (student: any) => {
    setDocumentStudent(student);
    setDocuments([]);
    setDocumentsError('');
    setPendingDocuments({});
    setDocumentsOpen(true);
    setDocumentsLoading(true);
    try {
      const data = await api('/api/documents/student/' + student.id);
      setDocuments(data.documents || []);
    } catch (error: any) {
      setDocumentsError(error.message || 'Unable to load documents.');
    } finally {
      setDocumentsLoading(false);
    }
  };

  const chooseDocument = async (type: string) => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (!picked.canceled) setPendingDocuments(current => ({ ...current, [type]: picked.assets[0] }));
  };

  const uploadStudentPhoto = async () => {
    if (!documentStudent) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    const file: any = picked.assets[0];
    setDocumentBusy('photo');
    try {
      const body = new FormData();
      const filename = `${documentStudent.registration_no || 'student'}.jpg`;
      if (Platform.OS === 'web' && file.file) body.append('photos', file.file, filename);
      else body.append('photos', { uri: file.uri, name: filename, type: file.mimeType || 'image/jpeg' } as any);
      await api('/api/student-transfer/photos', { method: 'POST', body });
      const refreshedStudent = await api(`/api/students/${documentStudent.id}`);
      setDocumentStudent(refreshedStudent.student || { ...documentStudent, photo_url: refreshedStudent.student?.photo_url });
      onRefresh();
      Alert.alert('Uploaded', 'Student photo uploaded successfully.');
    } catch (error: any) {
      Alert.alert('Upload failed', error.message || 'Unable to upload student photo.');
    } finally { setDocumentBusy(null); }
  };

  const getJpgUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return '';
    let url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `${API_BASE}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    if (/res\.cloudinary\.com/i.test(url)) {
      const [base, query] = url.split('?');
      const dotIdx = base.lastIndexOf('.');
      if (dotIdx > base.lastIndexOf('/')) {
        const jpgBase = base.slice(0, dotIdx) + '.jpg';
        return query ? `${jpgBase}?${query}` : jpgBase;
      }
      return query ? `${base}.jpg?${query}` : `${base}.jpg`;
    }
    return url;
  };

  const shareDocumentJpg = async (docTitle: string, rawUrl: string, safeName: string) => {
    const jpgUrl = getJpgUrl(rawUrl);
    if (!jpgUrl) return;

    setDocumentBusy('share-' + safeName);
    try {
      if (Platform.OS === 'web') {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) {
          try {
            const response = await fetch(jpgUrl, { cache: 'no-store' });
            if (response.ok && typeof File !== 'undefined') {
              const blob = await response.blob();
              const file = new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' });
              if (!nav.canShare || nav.canShare({ files: [file] })) {
                await nav.share({ title: docTitle, files: [file] });
                return;
              }
            }
          } catch (error: any) {
            if (error?.name === 'AbortError') return;
          }
        }

        // Web fallback if navigator.share is not available:
        // 1. Copy image to clipboard so pressing Ctrl+V in WhatsApp chat pastes the photo directly
        try {
          const img = new (window as any).Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(blob => {
                  if (blob && navigator.clipboard && (window as any).ClipboardItem) {
                    navigator.clipboard.write([
                      new (window as any).ClipboardItem({ 'image/png': blob })
                    ]).catch(() => {});
                  }
                }, 'image/png');
              }
            } catch {}
          };
          img.src = jpgUrl;
        } catch {}

        // 2. Download JPG photo directly
        try {
          const a = document.createElement('a');
          a.href = jpgUrl;
          a.download = `${safeName}.jpg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch {}

        // 3. Open WhatsApp Web to select recipient
        window.open('https://web.whatsapp.com', '_blank');
        return;
      }

      // Native mobile:
      if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable');
      const target = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}.jpg`;
      const result = await FileSystem.downloadAsync(jpgUrl, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'image/jpeg',
          dialogTitle: docTitle,
          UTI: 'public.jpeg',
        });
      } else {
        await Linking.openURL('https://web.whatsapp.com');
      }
    } catch (e: any) {
      Alert.alert('Share Error', e.message || 'Could not share document');
    } finally {
      setDocumentBusy(null);
    }
  };

  const handleStudentPhoto = async (mode: 'view' | 'download' | 'print') => {
    const photoUrl = documentStudent?.photo_url;
    if (!photoUrl) return;
    const url = /^https?:\/\//.test(photoUrl) ? photoUrl : API_BASE + (photoUrl.startsWith('/') ? '' : '/') + photoUrl;
    let browserWindow: any = null;
    try {
      setDocumentBusy('photo-' + mode);
      if (Platform.OS === 'web') {
        if (mode === 'download') {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Could not load the student photo');
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = window.document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `${documentStudent.registration_no || 'student'}-photo.jpg`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        } else {
          browserWindow = window.open('about:blank', '_blank');
          if (!browserWindow) throw new Error('Browser blocked the new window');
          const title = `${documentStudent?.student_name || 'student'}-photo`;
          browserWindow.document.open();
          browserWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page {
      margin: 8mm;
      size: auto;
      background: #ffffff !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      min-height: 100% !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    .img-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      min-height: 100vh;
      background: #ffffff !important;
      background-color: #ffffff !important;
      padding: 10px;
    }
    img {
      max-width: 96vw;
      max-height: 94vh;
      object-fit: contain;
      display: block;
      margin: auto;
      background: #ffffff !important;
      background-color: #ffffff !important;
    }
    @media print {
      html, body, .img-wrap {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        background-color: #ffffff !important;
        min-height: auto !important;
      }
      img {
        max-width: 100% !important;
        max-height: 98vh !important;
        page-break-inside: avoid;
        background: #ffffff !important;
        background-color: #ffffff !important;
      }
    }
  </style>
</head>
<body>
  <div class="img-wrap">
    <img src="${url}" alt="${title}" onload="onImgLoad()" />
  </div>
  <script>
    function onImgLoad() {
      ${mode === 'print' ? `setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch (e) {}
      }, 400);` : ''}
    }
  </script>
</body>
</html>`);
          browserWindow.document.close();
        }
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable');
        const target = FileSystem.cacheDirectory + Date.now() + '-student-photo.jpg';
        const result = await FileSystem.downloadAsync(url, target);
        if (mode === 'print') await Print.printAsync({ uri: result.uri });
        else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
        else Alert.alert('Saved', result.uri);
      }
    } catch (error: any) {
      if (browserWindow) browserWindow.close();
      Alert.alert('Student Photo', error.message || 'Photo action failed');
    } finally { setDocumentBusy(null); }
  };

  const uploadSelectedDocuments = async () => {
    if (!documentStudent) return;
    const selected = Object.entries(pendingDocuments);
    if (!selected.length) return Alert.alert('Select files', 'Choose one or more document files first.');
    setDocumentBusy('upload');
    try {
      for (const [type, file] of selected) {
        const existing = documents.find(item => item.document_type === type || (type === 'hs_admit_3rd' && item.document_type === 'hs_admit'));
        const body = new FormData();
        if ((file as any).file) body.append('file', (file as any).file);
        else body.append('file', { uri: (file as any).uri, name: (file as any).name || type, type: (file as any).mimeType || 'application/octet-stream' } as any);
        body.append('document_type', type);
        body.append('document_title', DOCUMENT_SLOTS.find(item => item[0] === type)?.[1] || (file as any).name || 'Document');
        await api(existing ? '/api/documents/' + existing.id + '/replace' : '/api/documents/student/' + documentStudent.id, { method: 'POST', body });
      }
      setPendingDocuments({});
      const refreshed = await api('/api/documents/student/' + documentStudent.id);
      setDocuments(refreshed.documents || []);
      Alert.alert('Uploaded', selected.length + ' document(s) uploaded successfully.');
    } catch (error: any) { Alert.alert('Upload failed', error.message); }
    finally { setDocumentBusy(null); }
  };

  const documentFor = (type: string) => documents.find(item => item.document_type === type || (type === 'hs_admit_3rd' && item.document_type === 'hs_admit'));
  const previewUrl = (doc: any) => doc?.file_url && !/\.pdf(?:[?#]|$)/i.test(doc.file_url) ? doc.file_url : '';

  const documentFileName = (doc: any) => {
    const title = String(doc.document_title || doc.document_type || 'document').replace(/[\\/:*?"<>|]/g, '_');
    const match = String(doc.file_url || '').match(/(\.[a-z0-9]{1,8})(?:[?#]|$)/i);
    return title + (match ? match[1] : '');
  };

  const handleDocument = async (doc: any, mode: 'view' | 'download' | 'print') => {
    let browserWindow: any = null;
    try {
      setDocumentBusy(mode + '-' + doc.id);
      if (Platform.OS === 'web' && mode !== 'download' && typeof window !== 'undefined') {
        browserWindow = window.open('about:blank', '_blank');
      }
      const token = await getToken();
      const endpoint = mode === 'download' ? 'download' : 'file';
      const url = API_BASE + '/api/documents/' + doc.id + '/' + endpoint;
      if (Platform.OS === 'web') {
        const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        if (!response.ok) throw new Error('Could not load the document');
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (mode === 'download') {
          const anchor = window.document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = documentFileName(doc);
          window.document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
          return;
        }
        if (!browserWindow) throw new Error('Browser blocked the new window');
        const isPdf = blob.type === 'application/pdf' || /\.pdf(?:[?#]|$)/i.test(doc.file_url || '');
        if (isPdf) {
          browserWindow.location.href = objectUrl;
          if (mode === 'print') {
            setTimeout(() => {
              try { browserWindow.focus(); browserWindow.print(); } catch { }
            }, 1000);
          }
        } else {
          // Render HTML page with pure white background to avoid browser dark viewer & black margins on print
          const title = documentFileName(doc);
          browserWindow.document.open();
          browserWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page {
      margin: 8mm;
      size: auto;
      background: #ffffff !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      min-height: 100% !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    .img-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      min-height: 100vh;
      background: #ffffff !important;
      background-color: #ffffff !important;
      padding: 10px;
    }
    img {
      max-width: 96vw;
      max-height: 94vh;
      object-fit: contain;
      display: block;
      margin: auto;
      background: #ffffff !important;
      background-color: #ffffff !important;
    }
    @media print {
      html, body, .img-wrap {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        background-color: #ffffff !important;
        min-height: auto !important;
      }
      img {
        max-width: 100% !important;
        max-height: 98vh !important;
        page-break-inside: avoid;
        background: #ffffff !important;
        background-color: #ffffff !important;
      }
    }
  </style>
</head>
<body>
  <div class="img-wrap">
    <img src="${objectUrl}" alt="${title}" onload="onImgLoad()" />
  </div>
  <script>
    function onImgLoad() {
      ${mode === 'print' ? `setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch (e) {}
      }, 400);` : ''}
    }
  </script>
</body>
</html>`);
          browserWindow.document.close();
        }
        setTimeout(() => URL.revokeObjectURL(objectUrl), 180000);
        return;
      }
      if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable');
      const target = FileSystem.cacheDirectory + Date.now() + '-' + documentFileName(doc);
      const result = await FileSystem.downloadAsync(url, target, { headers: { Authorization: 'Bearer ' + token } });
      if (result.status < 200 || result.status >= 300) throw new Error('Could not load the document');
      if (mode === 'print') {
        await Print.printAsync({ uri: result.uri });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        Alert.alert('Saved', result.uri);
      }
    } catch (error: any) {
      if (browserWindow) browserWindow.close();
      Alert.alert('Document', error.message || 'Document action failed');
    } finally {
      setDocumentBusy(null);
    }
  };

  return <View style={s.directory}>
    <View style={s.filters}>
      <Select label="Session" value={year} onChange={setYear} options={[{ value: 'all', label: 'All Sessions' }, ...sessions.map(session => ({ value: session, label: session }))]} />
      <Select label="Class" value={className} onChange={setClassName} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(c => ({ value: c, label: c }))]} />
      <Select label="Gender" value={gender} onChange={setGender} options={[{ value: 'all', label: 'All Genders' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
      <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All Statuses' }, { value: 'active', label: 'Active' }, { value: 'passout', label: 'Passout' }, { value: 'dropout', label: 'Dropout' }, { value: 'inactive', label: 'Dropout / Passout' }]} />
    </View>
    <View style={s.toolbar}>
      <View style={s.inline}><Text>Show</Text><Select label="Entries per page" value={size} onChange={setSize} options={['10', '25', '50', '100', 'all'].map(value => ({ value, label: value === 'all' ? 'All' : value }))} /><Text>Entries</Text></View>
      <View style={s.inline}><Text>Search:</Text><TextInput accessibilityLabel="Search students" value={search} onChangeText={setSearch} style={s.search} placeholder="Name, Reg, Mobile, Father..." /></View>
      <TouchableOpacity accessibilityRole="button" onPress={onRefresh} style={s.select}><Text>Refresh</Text></TouchableOpacity>
    </View>
    {loading ? <ActivityIndicator style={{ margin: 20 }} /> : error ? <Text style={s.error}>{error}</Text> : <>
      <ScrollView horizontal>
        <View>
          <View style={[s.row, s.tableHead]}>{currentColumns.map(([key, title, width]) => <TouchableOpacity key={key} disabled={['serial', 'photo', 'action'].includes(key)} accessibilityRole="button" style={[s.cell, { width }]} onPress={() => setSort({ key, ascending: sort.key === key ? !sort.ascending : true })}><Text style={s.columnTitle}>{title}{sort.key === key ? (sort.ascending ? ' -' : ' -') : ''}</Text></TouchableOpacity>)}</View>
          {rows.map((student, index) => <View key={student.id} style={[s.row, index % 2 === 0 && s.striped]}>
            {currentColumns.map(([key, , width]) => <View key={key} style={[s.cell, { width }]}>
              {key === 'serial' ? <Text style={s.numberText}>{start + index + 1}</Text> : key === 'photo' ? <Photo student={student} /> : key === 'action' ? <View style={s.inline}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${student.student_name}`} style={[s.action, s.edit]} onPress={() => onEdit(student)}><Text>Edit</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`View ${student.student_name}`} style={[s.action, s.view]} onPress={() => openDetails(student)}><Text>View</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Documents for ' + student.student_name} style={[s.action, s.documents]} onPress={() => openDocuments(student)}><Text style={s.documentIcon}>{String.fromCodePoint(0x1F4C4)}</Text></TouchableOpacity>
                {student.is_active && allowDeactivate && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Mark ${student.student_name} as dropout`} style={[s.action, s.remove]} onPress={() => onDeactivate(student)}><Text style={{ color: '#fff' }}>-</Text></TouchableOpacity>}
              </View> : key === 'is_active' ? (() => { const lbl = studentStatusLabel(student); const clr = lbl === 'Active' ? '#166534' : lbl === 'Passout' ? '#1d4ed8' : '#b91c1c'; return <Text style={{ color: clr, fontWeight: '700' }}>{lbl}</Text>; })()
                : <Text selectable style={[s.cellText, ['registration_no', 'monthly_fees', 'mobile_number', 'whatsapp_number', 'room_name'].includes(key) && s.numberText]}>{String(student[key] ?? '-')}</Text>}
            </View>)}
          </View>)}
        </View>
      </ScrollView>
      {!rows.length && <Text style={s.empty}>No students match these filters.</Text>}
      <View style={s.toolbar}><Text>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} entries</Text>
        <View style={s.inline}><TouchableOpacity accessibilityRole="button" disabled={currentPage === 1} onPress={() => setPage(currentPage - 1)} style={[s.select, currentPage === 1 && s.disabled]}><Text>Previous</Text></TouchableOpacity><Text>{currentPage} / {pages}</Text><TouchableOpacity accessibilityRole="button" disabled={currentPage === pages} onPress={() => setPage(currentPage + 1)} style={[s.select, currentPage === pages && s.disabled]}><Text>Next</Text></TouchableOpacity></View>
      </View>
    </>}
    <Modal visible={documentsOpen} transparent animationType="fade" onRequestClose={() => setDocumentsOpen(false)}>
      <View style={[s.overlay, s.documentOverlay]}><View style={s.documentPanel}>
        <View style={s.documentTopBar}><TouchableOpacity style={s.documentCloseButton} onPress={() => setDocumentsOpen(false)}><Text style={s.whiteText}>Close</Text></TouchableOpacity><Text style={s.lastUpdated}>Last Updated{documents[0]?.uploaded_at ? '\n' + String(documents[0].uploaded_at).slice(0, 16).replace('T', ' ') : ''}</Text></View>
        <Text style={s.registrationLine}>Reg. No. {documentStudent?.registration_no || '-'}</Text>
        {documentsLoading ? <ActivityIndicator style={{ margin: 30 }} /> : documentsError ? <Text style={s.error}>{documentsError}</Text> : <ScrollView contentContainerStyle={s.documentGrid}>
          <View style={s.documentTile}><Text style={s.tileTitle}>Photo</Text><View style={s.previewBox}>{documentStudent?.photo_url ? <Image source={{ uri: /^https?:/.test(documentStudent.photo_url) ? documentStudent.photo_url : API_BASE + documentStudent.photo_url }} resizeMode="contain" style={s.documentPreview} /> : <Text style={s.noPreview}>No photo</Text>}</View><TouchableOpacity disabled={documentBusy !== null} style={s.chooseButton} onPress={uploadStudentPhoto}><Text style={s.chooseText}>{documentBusy === 'photo' ? 'Uploading...' : 'Upload / Change Photo'}</Text></TouchableOpacity><View style={s.tileActions}><TouchableOpacity accessibilityLabel="View student photo" disabled={!documentStudent?.photo_url || documentBusy !== null} style={[s.iconButton, s.viewIcon, !documentStudent?.photo_url && s.disabled]} onPress={() => handleStudentPhoto('view')}><Text style={s.iconText}>{String.fromCodePoint(0x1F441)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Print student photo" disabled={!documentStudent?.photo_url || documentBusy !== null} style={[s.iconButton, s.printIcon, !documentStudent?.photo_url && s.disabled]} onPress={() => handleStudentPhoto('print')}><Text style={s.iconText}>{String.fromCodePoint(0x1F5A8)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Download student photo" disabled={!documentStudent?.photo_url || documentBusy !== null} style={[s.iconButton, s.downloadIcon, !documentStudent?.photo_url && s.disabled]} onPress={() => handleStudentPhoto('download')}><Text style={s.iconText}>{String.fromCodePoint(0x2B07)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Share student photo on WhatsApp" disabled={!documentStudent?.photo_url || documentBusy !== null} style={[s.iconButton, s.shareIcon, !documentStudent?.photo_url && s.disabled]} onPress={() => { if (!documentStudent?.photo_url) return; const regNo = documentStudent.registration_no || 'student'; shareDocumentJpg('Student Photo', documentStudent.photo_url, `${regNo}-photo`); }}><Image source={{ uri: WHATSAPP_ICON_BASE64 }} style={s.waIconImg} resizeMode="contain" /></TouchableOpacity></View></View>
          {DOCUMENT_SLOTS.map(([type, label]) => { const doc = documentFor(type), pending = pendingDocuments[type], preview = pending?.uri || previewUrl(doc), displayLabel = label.replace(' Photo', '').replace('Visitor-', 'Visitor_'); return <View key={type} style={s.documentTile}><Text numberOfLines={1} style={s.tileTitle}>{displayLabel}</Text><View style={s.previewBox}>{preview ? <Image source={{ uri: preview }} resizeMode="contain" style={s.documentPreview} /> : <Text style={s.noPreview}>{doc ? 'PDF / File' : 'No document'}</Text>}</View><TouchableOpacity disabled={documentBusy !== null} style={s.chooseButton} onPress={() => chooseDocument(type)}><Text numberOfLines={1} style={s.chooseText}>{pending ? pending.name : 'Choose File'}</Text></TouchableOpacity><View style={s.tileActions}><TouchableOpacity accessibilityLabel={'View ' + displayLabel} disabled={!doc || documentBusy !== null} style={[s.iconButton, s.viewIcon, !doc && s.disabled]} onPress={() => doc && handleDocument(doc, 'view')}><Text style={s.iconText}>{String.fromCodePoint(0x1F441)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel={'Print ' + displayLabel} disabled={!doc || documentBusy !== null} style={[s.iconButton, s.printIcon, !doc && s.disabled]} onPress={() => doc && handleDocument(doc, 'print')}><Text style={s.iconText}>{String.fromCodePoint(0x1F5A8)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel={'Download ' + displayLabel} disabled={!doc || documentBusy !== null} style={[s.iconButton, s.downloadIcon, !doc && s.disabled]} onPress={() => doc && handleDocument(doc, 'download')}><Text style={s.iconText}>{String.fromCodePoint(0x2B07)}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel={'Share ' + displayLabel + ' on WhatsApp'} disabled={!doc || documentBusy !== null} style={[s.iconButton, s.shareIcon, !doc && s.disabled]} onPress={() => { if (!doc) return; const regNo = documentStudent?.registration_no || 'student'; const docTitle = doc.document_title || displayLabel; const safeTitle = (doc.document_type || displayLabel).replace(/[\\/:*?"<>|]/g, '_'); const rawUrl = doc.file_url || `${API_BASE}/api/documents/${doc.id}/file`; shareDocumentJpg(docTitle, rawUrl, `${regNo}-${safeTitle}`); }}><Image source={{ uri: WHATSAPP_ICON_BASE64 }} style={s.waIconImg} resizeMode="contain" /></TouchableOpacity></View></View> })}
        </ScrollView>}
        <TouchableOpacity disabled={documentBusy !== null} onPress={uploadSelectedDocuments} style={[s.uploadAllButton, documentBusy !== null && s.disabled]}><Text style={s.whiteText}>{documentBusy === 'upload' ? 'Uploading...' : 'Upload Selected Documents'}</Text></TouchableOpacity>
        {documentBusy && documentBusy !== 'upload' && <Text style={s.busyText}>Preparing document...</Text>}
      </View></View>
    </Modal>
    <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}><View style={s.overlay}><View style={s.detailPanel}>
      <View style={s.modalHeader}><Text style={s.modalTitle}>Student Details</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close student details" onPress={() => setDetailOpen(false)}><Text style={s.close}>-</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={{ padding: 18 }}>{detailLoading ? <ActivityIndicator /> : detailError ? <Text style={s.error}>{detailError}</Text> : detail && <><FamilyPhotos student={detail} /><Text style={s.panelTitle}>{detail.student_name}</Text><RecordDetails record={detail} /></>}</ScrollView>
    </View></View></Modal>
  </View>;
}

function FamilyPhotos({ student }: { student: any }) {
  const getUrl = (path?: string) => {
    if (!path) return '';
    return /^https?:/.test(path) ? path : (API_BASE + (path.startsWith('/') ? '' : '/') + path);
  };
  const cards = [
    { label: 'Student', name: student.student_name, url: getUrl(student.photo_url) },
    { label: 'Father', name: student.father_name, url: getUrl(student.photos?.father_photo) },
    { label: 'Mother', name: student.mother_name, url: getUrl(student.photos?.mother_photo) },
    { label: (student.visitor1?.relation && String(student.visitor1.relation).trim()) ? String(student.visitor1.relation).trim() : 'Visitor 1', name: student.visitor1?.visitor_name || (student.photos?.visitor1_photo ? '-' : ''), url: getUrl(student.photos?.visitor1_photo) },
    { label: (student.visitor2?.relation && String(student.visitor2.relation).trim()) ? String(student.visitor2.relation).trim() : 'Visitor 2', name: student.visitor2?.visitor_name || (student.photos?.visitor2_photo ? '-' : ''), url: getUrl(student.photos?.visitor2_photo) },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      {cards.map((c, i) => (
        <View key={i} style={{ width: 110, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 8, alignItems: 'center', backgroundColor: '#f8fafc' }}>
          {c.url ? (
            <Image source={{ uri: c.url }} style={{ width: 80, height: 90, borderRadius: 6, resizeMode: 'cover' }} />
          ) : (
            <View style={{ width: 80, height: 90, borderRadius: 6, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#94a3b8', fontSize: 11 }}>No Photo</Text>
            </View>
          )}
          <Text style={{ fontWeight: '800', fontSize: 12, marginTop: 6, color: '#1e293b' }}>{c.label}</Text>
          <Text numberOfLines={2} style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginTop: 2 }}>{c.name || '-'}</Text>
        </View>
      ))}
    </View>
  );
}

function Photo({ student, large = false }: { student: any; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const path = student.photo_url;
  return path && !failed ? <Image accessibilityLabel={`${student.student_name} photo`} onError={() => setFailed(true)} source={{ uri: /^https?:\/\//.test(path) ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}` }} style={[s.photo, large && s.largePhoto]} />
    : <View style={[s.photo, s.avatar, large && s.largePhoto]}><Text>{String(student.student_name || '?').charAt(0)}</Text></View>;
}

function RecordDetails({ record }: { record: any }) {
  const getFieldLabel = (key: string) => {
    const custom: Record<string, string> = {
      mp_reg_no: 'MP Reg No',
      mp_roll_no: 'MP Roll No',
      mp_marks: 'MP Marks',
      mp_board: 'MP Board',
      mp_year: 'MP Passing Year',
      hs_reg_no: 'HS Reg No',
      hs_roll_no: 'HS Roll No',
      hs_marks: 'HS Marks',
      hs_board: 'HS Board',
      hs_year: 'HS Passing Year',
      school_reg_no: 'School / MP Reg No',
      council_reg_no: 'Council / HS Reg No',
      banglarshiksha_id: 'Banglarshiksha ID',
      kanyashree_id: 'Kanyashree ID',
      kanyashree_status: 'Kanyashree Status',
      aikyashree_id: 'Aikyashree ID',
      aadhaar_no: 'Aadhaar No',
      father_aadhaar_no: 'Father Aadhaar No',
      is_active: 'Status',
      mother_aadhaar_no: 'Mother Aadhaar No',
    };
    return custom[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };
  return <>{Object.entries(record).filter(([key, value]) => !['id', 'room_id', 'room_name', 'photo_url', 'created_at', 'updated_at', 'user_id', 'visitor1', 'visitor2'].includes(key) && value !== null && value !== '').map(([key, value]) => <View key={key} style={s.detailRow}><Text style={s.detailLabel}>{getFieldLabel(key)}</Text><Text selectable style={{ flex: 1 }}>{key === 'is_active' ? studentStatusLabel(record) : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</Text></View>)}
    {(record.room_number || record.room_name) && <View style={s.detailRow}><Text style={s.detailLabel}>Room Number</Text><Text selectable style={{ flex: 1 }}>{record.room_number || record.room_name}</Text></View>}
    {['visitor1', 'visitor2'].map((key, index) => record[key] && <View key={key}><Text style={s.panelTitle}>Visitor {index + 1}</Text><RecordDetails record={record[key]} /></View>)}
  </>;
}

const s = StyleSheet.create({
  directory: { backgroundColor: '#fff', padding: 12, borderWidth: 1, borderColor: '#ccd5df', borderRadius: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: '#add8e6', padding: 8, borderRadius: 4 },
  selectPlaceholder: { color: 'rgba(0,0,0,0.5)' }, select: { alignSelf: 'stretch', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42, justifyContent: 'center' },
  selectText: { color: '#000000', fontSize: 17, fontFamily: 'Constantia' }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 }, search: { borderWidth: 1, borderColor: '#aeb5bd', borderRadius: 3, width: 190, padding: 9, fontSize: 17, color: '#000000', fontFamily: 'Constantia' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#c3c7cc', minHeight: 48, alignItems: 'center' }, tableHead: { backgroundColor: '#cfe2ff', minHeight: 38 },
  cell: { paddingHorizontal: 7, paddingVertical: 6 }, cellText: { fontSize: 16, color: '#000000', fontFamily: 'Constantia' }, numberText: { fontFamily: 'Arial' }, columnTitle: { fontSize: 16, fontWeight: '900', color: '#000000', fontFamily: 'Constantia' }, striped: { backgroundColor: '#f1f1f1' },
  photo: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#94a3b8' }, avatar: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  action: { paddingHorizontal: 7, minHeight: 36, justifyContent: 'center', borderRadius: 4 }, edit: { backgroundColor: '#ffc107' }, view: { backgroundColor: '#22d3ee' }, documents: { backgroundColor: '#0ea5e9', minWidth: 36, alignItems: 'center' }, documentIcon: { color: '#fff', fontSize: 20, fontWeight: '900' }, remove: { backgroundColor: '#e11d48' },
  empty: { padding: 24, textAlign: 'center', color: '#64748b' }, disabled: { opacity: 0.4 }, error: { padding: 16, color: '#b91c1c' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 16 }, webSelectOverlay: { backgroundColor: 'transparent', alignItems: 'flex-start', justifyContent: 'flex-start', padding: 0 }, selectPanel: { backgroundColor: '#fff', padding: 16, borderRadius: 12, width: '100%', maxWidth: 340, maxHeight: '75%' },
  option: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#edf2f7' }, selected: { backgroundColor: '#dbeafe' }, panelTitle: { fontWeight: '800', fontSize: 17, marginVertical: 12 },
  detailPanel: { backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '90%', overflow: 'hidden' },
  documentOverlay: { backgroundColor: '#fff', padding: 8 },
  documentPanel: { backgroundColor: '#fff', borderRadius: 7, width: '100%', maxWidth: 1760, height: '100%', overflow: 'hidden' },
  documentContent: { padding: 18, gap: 10 },
  studentDocumentHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#eff6ff', borderRadius: 10, padding: 14 },
  largePhoto: { width: 76, height: 76, borderRadius: 38 },
  documentStudentName: { fontSize: 20, fontWeight: '800', color: '#172b4d' },
  documentMeta: { color: '#64748b', fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  documentCard: { borderWidth: 1, borderColor: '#dbe3eb', borderRadius: 10, padding: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  documentTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  docAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 6 },
  download: { backgroundColor: '#2563eb' },
  print: { backgroundColor: '#475569' },
  whiteText: { color: '#fff', fontWeight: '700' },
  busyText: { textAlign: 'center', color: '#1565c0', fontWeight: '700', padding: 8 },
  documentTopBar: { minHeight: 44, marginHorizontal: 14, marginTop: 12, backgroundColor: '#eef6fc', borderWidth: 1, borderColor: '#64748b', borderRadius: 5, padding: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, documentCloseButton: { backgroundColor: '#dc3545', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4 }, lastUpdated: { fontSize: 9, textAlign: 'right', color: '#475569' }, registrationLine: { paddingHorizontal: 16, paddingTop: 8, color: '#475569', fontSize: 16 }, documentGrid: { padding: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'space-around', alignItems: 'flex-start' }, documentTile: { width: 210, minHeight: 270, borderWidth: 1, borderColor: '#aeb7c1', borderRadius: 7, backgroundColor: '#f8fafc', overflow: 'hidden' }, tileTitle: { textAlign: 'center', fontSize: 17, paddingVertical: 4, color: '#111827', backgroundColor: '#fff' }, previewBox: { height: 172, marginHorizontal: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, documentPreview: { width: '100%', height: '100%' }, noPreview: { color: '#94a3b8', fontSize: 12 }, chooseButton: { height: 29, backgroundColor: '#60a5fa', justifyContent: 'center', paddingHorizontal: 6 }, chooseText: { fontSize: 11, color: '#0f172a' }, tileActions: { minHeight: 43, backgroundColor: '#d1d5db', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 4 }, iconButton: { minWidth: 36, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 }, viewIcon: { backgroundColor: '#0d6efd' }, printIcon: { backgroundColor: '#059669' }, downloadIcon: { backgroundColor: '#06b6d4' }, shareIcon: { backgroundColor: '#25D366' }, waIconImg: { width: 19, height: 19 }, iconText: { color: '#fff', fontSize: 19, fontWeight: '800', lineHeight: 21 }, uploadAllButton: { alignSelf: 'center', backgroundColor: '#0d6efd', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 6, marginBottom: 14 },
  modalHeader: { backgroundColor: '#11101e', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' }, close: { color: '#fff', fontSize: 28, paddingHorizontal: 8 }, detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }, detailLabel: { width: '42%', color: '#475569', fontWeight: '600' },
});
