import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE, api } from '../lib/api';
import { getToken } from '../lib/auth';
import * as Print from 'expo-print';
import AcademyHeader from '../components/AcademyHeader';
import ScrollNavigationButtons from '../components/ScrollNavigationButtons';
import { Select } from '../components/StudentDirectory';
import { STUDENT_CLASSES } from '../lib/studentClasses';

const SESSION_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i;
  return [`${y}-${y}`, `${y}-${y + 1}`];
}).flat();

const ACADEMY_LOGO_ASSET = require('../../assets/images/al-ameen-logo.jpg');
let cachedLogoDataUrl: string | null = null;

async function getLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  let resolved: string | undefined;
  try {
    if (typeof ACADEMY_LOGO_ASSET === 'string') {
      resolved = ACADEMY_LOGO_ASSET;
    } else if (ACADEMY_LOGO_ASSET && typeof ACADEMY_LOGO_ASSET === 'object') {
      resolved = (ACADEMY_LOGO_ASSET as any).uri || (ACADEMY_LOGO_ASSET as any).default;
    } else if (typeof (Image as any)?.resolveAssetSource === 'function') {
      resolved = (Image as any).resolveAssetSource(ACADEMY_LOGO_ASSET)?.uri;
    }
  } catch {
    resolved = undefined;
  }
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';
  const candidates = [
    origin ? `${origin}/al-ameen-logo.jpg` : '/al-ameen-logo.jpg',
    resolved
  ].filter(Boolean) as string[];

  if (Platform.OS === 'web' && typeof fetch !== 'undefined' && typeof FileReader !== 'undefined') {
    for (const url of candidates) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const ct = resp.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) continue;
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (dataUrl.startsWith('data:image/')) {
          cachedLogoDataUrl = dataUrl;
          return dataUrl;
        }
      } catch {
        // try next candidate
      }
    }
  }
  return candidates[0] || '/al-ameen-logo.jpg';
}

const normClass = (c: any) =>
  String(c || '')
    .trim()
    .toLowerCase()
    .replace(/^class\s*[-:]?\s*/i, '');

const getSessionKey = (exam: any): string => {
  const fromSession = String(exam?.session_name || '').match(/20\d{2}/);
  if (fromSession) return fromSession[0];
  const fromName = String(exam?.exam_name || '').match(/20\d{2}/);
  if (fromName) return fromName[0];
  const fromDate = String(exam?.created_at || exam?.published_at || '').match(/20\d{2}/);
  return fromDate ? fromDate[0] : '';
};

const getTermOrder = (name: any): number | null => {
  const s = String(name || '').toLowerCase();
  if (/(?:^|[^0-9])1\s*st(?![0-9])|\bfirst\b|\b(?:term|terminal|sem|semester|unit)\s*[-:#]?\s*1\b/.test(s)) return 1;
  if (/(?:^|[^0-9])2\s*nd(?![0-9])|\bsecond\b|\b(?:term|terminal|sem|semester|unit)\s*[-:#]?\s*2\b/.test(s)) return 2;
  if (/(?:^|[^0-9])3\s*rd(?![0-9])|\bthird\b|\b(?:annual|final)\b|\b(?:term|terminal|sem|semester|unit)\s*[-:#]?\s*3\b/.test(s)) return 3;
  if (/(?:^|[^0-9])4\s*th(?![0-9])|\bfourth\b|\b(?:term|terminal|sem|semester|unit)\s*[-:#]?\s*4\b/.test(s)) return 4;
  return null;
};

const fmtNum = (v: any): string => {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
};

export default function ClassResults() {
  const scrollRef = useRef<ScrollView>(null);
  const [terminal, setTerminal] = useState<any[]>([]);
  // Previous term exams of the same class & session to display below the rank box on marksheet
  const [terms, setTerms] = useState<any[]>([]);

  const [selected, setSelected] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [sessionFilter, setSessionFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [selectedResultId, setSelectedResultId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getLogoDataUrl().catch(() => {});
    api('/api/terminal-exams/published')
      .then(t => setTerminal(t.exams || []))
      .catch(e => Alert.alert('Error', e.message));
  }, []);

  const sessionOptions = useMemo(() => {
    const vals = Array.from(
      new Set([...SESSION_OPTIONS, ...terminal.map(item => String(item.session_name || '').trim()).filter(Boolean)])
    )
      .sort()
      .reverse();
    return [{ value: 'all', label: 'All Sessions' }, ...vals.map(value => ({ value, label: value }))];
  }, [terminal]);

  const allClasses = useMemo(() => {
    const extra = terminal
      .map(item => String(item.class_name || '').trim())
      .filter(c => c && !STUDENT_CLASSES.some(sc => normClass(sc) === normClass(c)));
    return [...STUDENT_CLASSES, ...Array.from(new Set(extra))];
  }, [terminal]);

  const classDropdownOptions = useMemo(
    () => [{ value: '', label: 'Select class' }, ...allClasses.map(c => ({ value: c, label: `Class ${c}` }))],
    [allClasses]
  );

  const matchingByDropdown = useMemo(
    () =>
      terminal.filter(item => {
        if (sessionFilter !== 'all' && String(item.session_name || '').trim() !== sessionFilter) return false;
        if (classFilter !== 'all' && normClass(item.class_name) !== normClass(classFilter)) return false;
        return true;
      }),
    [terminal, sessionFilter, classFilter]
  );

  const resultDropdownOptions = useMemo(
    () => [
      { value: '', label: 'Select result' },
      ...matchingByDropdown.map(item => ({
        value: String(item.id),
        label: `${String(item.exam_name || '').trim()} - Class ${item.class_name}`
      }))
    ],
    [matchingByDropdown]
  );

  const filteredTerminal = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matchingByDropdown.filter(item => {
      if (!q) return true;
      return (
        String(item.exam_name || '').toLowerCase().includes(q) ||
        String(item.class_name || '').toLowerCase().includes(q) ||
        String(item.session_name || '').toLowerCase().includes(q)
      );
    });
  }, [matchingByDropdown, searchQuery]);

  const openTerminal = async (id: number) => {
    try {
      const x = await api(`/api/terminal-exams/published/${id}`);
      const currentExam = x.exam;
      const currentOrder = getTermOrder(currentExam?.exam_name);
      const currentClass = normClass(currentExam?.class_name);
      const currentSession = getSessionKey(currentExam);
      const currentTime = new Date(currentExam?.created_at || currentExam?.published_at || 0).getTime();

      // For 1st term exams, leave the previous-term area blank.
      // For 2nd/3rd/subsequent terms, load only earlier published exams of the same class & session.
      let prevCandidates: any[] = [];
      if (currentOrder !== 1) {
        prevCandidates = terminal.filter(t => {
          if (Number(t.id) === Number(id)) return false;
          if (normClass(t.class_name) !== currentClass) return false;
          const tSession = getSessionKey(t);
          if (currentSession && tSession && tSession !== currentSession) return false;

          const tOrder = getTermOrder(t.exam_name);
          if (currentOrder !== null && tOrder !== null) {
            return tOrder < currentOrder;
          }
          const tTime = new Date(t.created_at || t.published_at || 0).getTime();
          return tTime < currentTime || (tTime === currentTime && Number(t.id) < Number(id));
        });

        prevCandidates.sort((a, b) => {
          const oa = getTermOrder(a.exam_name);
          const ob = getTermOrder(b.exam_name);
          if (oa !== null && ob !== null && oa !== ob) return oa - ob;
          const ta = new Date(a.created_at || a.published_at || 0).getTime();
          const tb = new Date(b.created_at || b.published_at || 0).getTime();
          return ta - tb || Number(a.id) - Number(b.id);
        });
      }

      const prevData = await Promise.all(prevCandidates.map(t => api(`/api/terminal-exams/published/${t.id}`)));
      const termRes = prevData.map(d => ({
        exam: d.exam,
        students: d.students || [],
        subjects: d.subjects || []
      }));

      setSelected({ ...x.exam, kind: 'terminal' });
      setStudents(x.students || []);
      setSubjects(x.subjects || []);
      setTerms(termRes);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const printResult = async () => {
    if (!selected) return;
    const heads =
      selected.kind === 'terminal'
        ? subjects.map(x => `<th>${x.subject_name}<br>F.M.-${Number(x.full_marks)}</th>`).join('')
        : '<th>Marks Obtained</th>';
    // Compute rank for each student based on total marks
    const rankMap: Record<string, number> = {};
    if (selected.kind === 'terminal') {
      const totals = students.map((s: any) => ({
        id: s.student_id || s.registration_no,
        total: subjects.reduce((a: number, sub: any) => a + (Number(s.marks?.[sub.id]) || 0), 0)
      }));
      totals.sort((a: any, b: any) => b.total - a.total);
      let rank = 1;
      for (let i = 0; i < totals.length; i++) {
        if (i > 0 && totals[i].total < totals[i - 1].total) rank = i + 1;
        rankMap[totals[i].id] = rank;
      }
    }
    const rows = students
      .map(
        (x: any, i: number) =>
          `<tr><td>${i + 1}</td><td>${x.registration_no}</td><td class="name">${x.student_name}</td>${selected.kind === 'terminal'
            ? subjects.map(y => `<td>${x.marks?.[y.id] ?? 'Absent'}</td>`).join('') + `<td><b>${rankMap[x.student_id || x.registration_no] ? `${rankMap[x.student_id || x.registration_no]} / ${students.length}` : '-'}</b></td>`
            : `<td>${x.obtained_marks === null ? 'Absent' : Number(x.obtained_marks)}</td>`
          }</tr>`
      )
      .join('');

    await Print.printAsync({
      html: `<style>@page{size:A4 landscape;margin:9mm}body{font-family:Arial}h2,h3{text-align:center;margin:4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #222;padding:5px;text-align:center}.name{text-align:left}</style><h2>Al-Ameen Mission Academy Memari</h2><h3>${selected.kind === 'weekly'
          ? `Class: ${selected.class_name} &nbsp; | &nbsp; Full Marks: ${Number(selected.full_marks)} &nbsp; | &nbsp; Date: ${String(
            selected.exam_date || ''
          ).slice(0, 10)} &nbsp; | &nbsp; Subject: ${selected.subject_name}`
          : `${selected.exam_name} | Class ${selected.class_name}`
        }</h3><table><tr><th>Sl</th><th>Reg.</th><th>Name</th>${heads}${selected.kind === 'terminal' ? '<th>Rank</th>' : ''}</tr>${rows}</table>`
    });
  };

  const printIndividualResult = async (st: any) => {
    if (selected?.kind !== 'terminal') return Alert.alert('Result', 'Open a published terminal result first.');
    const grade = (v: number, f: number) => {
      const p = f ? (v / f) * 100 : 0;
      return p >= 90 ? 'AA' : p >= 80 ? 'A+' : p >= 70 ? 'A' : p >= 60 ? 'B+' : p >= 50 ? 'B' : p >= 35 ? 'C' : 'D';
    };
    const total = subjects.reduce((a: any, sub: any) => a + (Number(st.marks?.[sub.id]) || 0), 0);
    const full = subjects.reduce((a: any, sub: any) => a + Number(sub.full_marks || 0), 0);
    const pct = full ? ((total / full) * 100).toFixed(2) : '0.00';
    const photo = st.photo_url ? (String(st.photo_url).startsWith('http') ? st.photo_url : API_BASE + st.photo_url) : '';
    const getWrittenFull = (sub: any) => {
      const sum = Number(sub.theory_marks || 0) + Number(sub.mcq_marks || 0);
      return sum > 0 ? sum : Math.max(0, Number(sub.full_marks || 0) - Number(sub.oral_marks || 0));
    };
    const rows = subjects
      .map((sub: any) => {
        const writtenFull = getWrittenFull(sub).toFixed(2);
        const isAbsentSub = st.marks?.[sub.id] === 'Absent';
        const rawWritten = st.written_marks?.[sub.id];
        const rawMcq = st.mcq_obtained?.[sub.id];
        const writtenObtained = isAbsentSub
          ? '—'
          : rawWritten == null && rawMcq == null
            ? '—'
            : fmtNum(Number(rawWritten || 0) + Number(rawMcq || 0));
        const oralObtained = isAbsentSub ? '—' : (st.oral_obtained?.[sub.id] ?? '—');
        return `<tr><td>${sub.subject_name}</td><td>${writtenFull}</td><td>${sub.oral_marks ?? 0}</td><td>${sub.full_marks}</td><td>${writtenObtained}</td><td>${oralObtained}</td><td>${st.marks?.[sub.id] ?? 'Absent'}</td><td>${isAbsentSub ? '—' : grade(Number(st.marks?.[sub.id] || 0), Number(sub.full_marks || 0))}</td></tr>`;
      })
      .join('');
    // Compute rank for this student
    const allTotals = students.map((s: any) => ({
      id: s.student_id || s.registration_no,
      total: subjects.reduce((a: number, sub: any) => a + (Number(s.marks?.[sub.id]) || 0), 0)
    }));
    allTotals.sort((a: any, b: any) => b.total - a.total);
    let studentRank = '-';
    let rk = 1;
    for (let i = 0; i < allTotals.length; i++) {
      if (i > 0 && allTotals[i].total < allTotals[i - 1].total) rk = i + 1;
      if (allTotals[i].id === (st.student_id || st.registration_no)) { studentRank = String(rk); break; }
    }
    const grandWritten = subjects.reduce((a: number, x: any) => a + getWrittenFull(x), 0);
    const grandOral = subjects.reduce((a: any, x: any) => a + Number(x.oral_marks || 0), 0);
    const overallGrade = grade(total, full);
    const resultStatus = subjects.some((sub: any) => st.marks?.[sub.id] === 'Absent') ? 'Incomplete' : 'Pass';

    const prevTermsHtml = terms
      .map((term: any) => {
        const tSubs: any[] = term.subjects || [];
        const tStudents: any[] = term.students || [];
        if (!tSubs.length) return '';

        const prevSt = tStudents.find(
          (s: any) =>
            (st.id && s.id && Number(s.id) === Number(st.id)) ||
            String(s.registration_no || '').trim().toLowerCase() === String(st.registration_no || '').trim().toLowerCase()
        );

        const calcTotal = (s: any) => tSubs.reduce((sum: number, sub: any) => sum + (Number(s?.marks?.[sub.id]) || 0), 0);
        const prevFull = tSubs.reduce((sum: number, sub: any) => sum + Number(sub.full_marks || 0), 0);

        const subHighest = tSubs.map((sub: any) => {
          let max: number | null = null;
          for (const s of tStudents) {
            const raw = s?.marks?.[sub.id];
            if (raw !== undefined && raw !== null && raw !== '' && raw !== 'Absent') {
              const n = Number(raw);
              if (!isNaN(n) && (max === null || n > max)) max = n;
            }
          }
          if (max === null && sub.highest_marks != null && Number(sub.highest_marks) > 0) {
            max = Number(sub.highest_marks);
          }
          return max !== null ? fmtNum(max) : '-';
        });

        const rankedTotals = tStudents.map((s: any) => ({
          key: s.id || s.registration_no,
          total: calcTotal(s)
        }));
        rankedTotals.sort((a: any, b: any) => b.total - a.total);
        const highestTotal = rankedTotals.length > 0 ? rankedTotals[0].total : null;
        const highestPct = highestTotal !== null && prevFull ? `${((highestTotal / prevFull) * 100).toFixed(2)}%` : '';

        let prevRank = '-';
        if (prevSt) {
          let r = 1;
          const targetKey = prevSt.id || prevSt.registration_no;
          for (let i = 0; i < rankedTotals.length; i++) {
            if (i > 0 && rankedTotals[i].total < rankedTotals[i - 1].total) r = i + 1;
            if (rankedTotals[i].key === targetKey) {
              prevRank = `${r}/${tStudents.length}`;
              break;
            }
          }
        }

        const prevObtained = prevSt ? calcTotal(prevSt) : null;
        const prevPct = prevObtained !== null && prevFull ? `${((prevObtained / prevFull) * 100).toFixed(2)}%` : '-';
        const termTitle = term.exam?.exam_name || 'Previous Term';

        return `<div class="prev-term"><div class="prev-term-title">${termTitle}</div><table class="prev-table"><tr><th class="prev-lbl"></th>${tSubs
          .map((sub: any) => `<th>${sub.subject_name}</th>`)
          .join('')}<th>Total</th><th>%</th><th>Rank</th></tr><tr><td class="prev-lbl">FM</td>${tSubs
            .map((sub: any) => `<td>${fmtNum(sub.full_marks)}</td>`)
            .join('')}<td><b>${fmtNum(prevFull)}</b></td><td></td><td rowspan="3" class="prev-rank">${prevRank}</td></tr><tr><td class="prev-lbl">HM</td>${subHighest
              .map((h: string) => `<td>${h}</td>`)
              .join('')}<td>${highestTotal !== null ? fmtNum(highestTotal) : '-'}</td><td>${highestPct}</td></tr><tr class="prev-mo"><td class="prev-lbl">MO</td>${tSubs
                .map((sub: any) => {
                  if (!prevSt) return '<td>-</td>';
                  const val = prevSt.marks?.[sub.id];
                  if (val === undefined || val === null || val === 'Absent') return '<td class="ab">Ab</td>';
                  return `<td><b>${fmtNum(val)}</b></td>`;
                })
                .join('')}<td><b>${prevObtained !== null ? fmtNum(prevObtained) : '-'}</b></td><td><b>${prevPct}</b></td></tr></table></div>`;
      })
      .join('');

    const hasPrevTerms = Boolean(prevTermsHtml);
    const mainCellPad = terms.length >= 2 ? '5px 6px' : '7px';
    const logoUrl = await getLogoDataUrl();
    const printDateTime = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const hPattern = (id: string) =>
      `<defs><pattern id="${id}" width="36" height="22" patternUnits="userSpaceOnUse"><rect width="36" height="22" fill="#e4f6ef"/><line x1="0" y1="1" x2="36" y2="1" stroke="#147a61" stroke-width="1.6"/><line x1="0" y1="3.4" x2="36" y2="3.4" stroke="#62bea4" stroke-width="0.6"/><line x1="0" y1="18.6" x2="36" y2="18.6" stroke="#62bea4" stroke-width="0.6"/><line x1="0" y1="21" x2="36" y2="21" stroke="#147a61" stroke-width="1.4"/><path d="M0,5.2 C9,5.2 9,16.8 18,16.8 C27,16.8 27,5.2 36,5.2" fill="none" stroke="#157f65" stroke-width="1.6"/><path d="M0,16.8 C9,16.8 9,5.2 18,5.2 C27,5.2 27,16.8 36,16.8" fill="none" stroke="#2da68a" stroke-width="1.6"/><path d="M0,11 C6,4.5 12,4.5 18,11 C24,17.5 30,17.5 36,11" fill="none" stroke="#116b55" stroke-width="1.15"/><path d="M0,11 C6,17.5 12,17.5 18,11 C24,4.5 30,4.5 36,11" fill="none" stroke="#47b99d" stroke-width="1.15"/><circle cx="9" cy="11" r="1.4" fill="#147a61"/><circle cx="27" cy="11" r="1.4" fill="#147a61"/></pattern></defs><rect width="100%" height="22" fill="url(#${id})"/>`;
    const vPattern = (id: string) =>
      `<defs><pattern id="${id}" width="22" height="36" patternUnits="userSpaceOnUse"><rect width="22" height="36" fill="#e4f6ef"/><line x1="1" y1="0" x2="1" y2="36" stroke="#147a61" stroke-width="1.6"/><line x1="3.4" y1="0" x2="3.4" y2="36" stroke="#62bea4" stroke-width="0.6"/><line x1="18.6" y1="0" x2="18.6" y2="36" stroke="#62bea4" stroke-width="0.6"/><line x1="21" y1="0" x2="21" y2="36" stroke="#147a61" stroke-width="1.4"/><path d="M5.2,0 C5.2,9 16.8,9 16.8,18 C16.8,27 5.2,27 5.2,36" fill="none" stroke="#157f65" stroke-width="1.6"/><path d="M16.8,0 C16.8,9 5.2,9 5.2,18 C5.2,27 16.8,27 16.8,36" fill="none" stroke="#2da68a" stroke-width="1.6"/><path d="M11,0 C4.5,6 4.5,12 11,18 C17.5,24 17.5,30 11,36" fill="none" stroke="#116b55" stroke-width="1.15"/><path d="M11,0 C17.5,6 17.5,12 11,18 C4.5,24 4.5,30 11,36" fill="none" stroke="#47b99d" stroke-width="1.15"/><circle cx="11" cy="9" r="1.4" fill="#147a61"/><circle cx="11" cy="27" r="1.4" fill="#147a61"/></pattern></defs><rect width="22" height="100%" fill="url(#${id})"/>`;
    const cornerSvg = (cls: string) =>
      `<svg class="gb-c ${cls}" width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><rect x="0.7" y="0.7" width="20.6" height="20.6" fill="#e4f6ef" stroke="#147a61" stroke-width="1.4"/><rect x="3.5" y="3.5" width="15" height="15" fill="none" stroke="#2da68a" stroke-width="0.9"/><polygon points="11,4.5 17.5,11 11,17.5 4.5,11" fill="#bfead9" stroke="#147a61" stroke-width="1.1"/><circle cx="11" cy="11" r="2.4" fill="#147a61"/></svg>`;
    const guillocheBorderHtml =
      `<svg class="gb-h gb-top" xmlns="http://www.w3.org/2000/svg">${hPattern('wHt')}</svg>` +
      `<svg class="gb-h gb-bot" xmlns="http://www.w3.org/2000/svg">${hPattern('wHb')}</svg>` +
      `<svg class="gb-v gb-left" xmlns="http://www.w3.org/2000/svg">${vPattern('wVl')}</svg>` +
      `<svg class="gb-v gb-right" xmlns="http://www.w3.org/2000/svg">${vPattern('wVr')}</svg>` +
      cornerSvg('gb-tl') +
      cornerSvg('gb-tr') +
      cornerSvg('gb-bl') +
      cornerSvg('gb-br');

    const html = `<style>@page{size:A4 portrait;margin:0}body{margin:0;font-family:Arial;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page-wrap{padding:10mm 11mm 5.5mm;min-height:294mm;box-sizing:border-box;display:flex;flex-direction:column}.sheet{position:relative;flex:1;padding:12.5mm 13.5mm 11mm;box-sizing:border-box;display:flex;flex-direction:column;background:#fff;overflow:hidden}.watermark{position:absolute;top:52%;left:50%;transform:translate(-50%,-50%);width:125mm;height:125mm;object-fit:contain;opacity:0.09;pointer-events:none;z-index:0}.sheet > *:not(.watermark):not(.gb-h):not(.gb-v):not(.gb-c){position:relative;z-index:1}.gb-h{position:absolute;left:22px;right:22px;width:calc(100% - 44px);height:22px;pointer-events:none;z-index:2;display:block}.gb-top{top:0}.gb-bot{bottom:0}.gb-v{position:absolute;top:22px;bottom:22px;width:22px;height:calc(100% - 44px);pointer-events:none;z-index:2;display:block}.gb-left{left:0}.gb-right{right:0}.gb-c{position:absolute;width:22px;height:22px;pointer-events:none;z-index:3;display:block}.gb-tl{top:0;left:0}.gb-tr{top:0;right:0}.gb-bl{bottom:0;left:0}.gb-br{bottom:0;right:0}header{display:flex;align-items:center;border-bottom:2px solid #147a61;padding-bottom:8px;gap:10px}.logo-img{width:22mm;height:22mm;object-fit:contain;flex-shrink:0}.school-info{flex:1;text-align:center}.photo-img{width:28mm;height:34mm;object-fit:cover;border:1px solid #555;flex-shrink:0}h1{font-size:20px;margin:4px 0}h2{text-align:center;margin:10px 0 6px;font-size:16px;letter-spacing:1px}.student{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:10px 0;font-size:14px}.student div:nth-child(even){text-align:right}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #222;padding:${mainCellPad};text-align:center}th:first-child,td:first-child{text-align:left}.summary{margin-top:10px;font-size:14px}.rank-box{display:inline-block;margin-top:10px;padding:7px 22px;border:2.5px solid #174f75;border-radius:6px;background:rgba(238,244,251,0.9);font-size:17px;font-weight:bold;color:#174f75;letter-spacing:1px}.prev-wrap{margin-top:12px}.prev-term{margin-top:9px}.prev-term:first-child{margin-top:0}.prev-term-title{font-size:12px;font-weight:bold;color:#174f75;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;text-align:left}.prev-table{border-collapse:collapse;width:100%;margin-top:0;font-size:11px}.prev-table th,.prev-table td{border:1px solid #333;padding:3.5px 4px;text-align:center}.prev-table th{background:rgba(238,244,251,0.88);color:#174f75;font-weight:bold}.prev-table th:first-child,.prev-table td:first-child{text-align:center;width:36px}.prev-table .prev-lbl{background:rgba(248,250,252,0.85);font-weight:bold}.prev-table tr.prev-mo td{background:rgba(220,242,212,0.85)}.prev-table .prev-rank{vertical-align:middle;text-align:center;font-weight:bold;font-size:12.5px;color:#174f75;background:rgba(248,250,252,0.85)}.prev-table .ab{color:#b91c1c;font-weight:bold}.sign{display:flex;justify-content:space-between;margin-top:auto;padding-top:${hasPrevTerms ? '28px' : '42px'}}.sign span{display:inline-block;min-width:150px;text-align:center;border-top:1.5px solid #222;padding-top:6px;font-weight:600}.print-time{text-align:right;font-size:10px;color:#475569;margin-top:4px;padding-right:2px}</style><div class="page-wrap"><section class="sheet">${guillocheBorderHtml}<img class="watermark" src="${logoUrl}" alt=""/><header><img class="logo-img" src="${logoUrl}" alt=""/><div class="school-info"><h1>Al-Ameen Mission Academy Memari</h1><div>Memari, Purba Bardhaman - 713146</div></div>${photo ? `<img class="photo-img" src="${photo}" onerror="this.style.display='none'"/>` : '<div style="width:28mm"></div>'
      }</header><h2>${String(selected.exam_name || 'TERMINAL EXAMINATION RESULT').trim()}</h2><div class="student"><div><b>Student Name:</b> ${st.student_name}</div><div><b>Registration:</b> ${st.registration_no}</div><div><b>Father's Name:</b> ${st.father_name || st.guardian_name || st.mother_name || '-'}</div><div><b>Class:</b> ${selected.class_name}</div></div><table><tr><th rowspan="2">Subject</th><th colspan="3">FULL MARKS</th><th colspan="3">MARKS OBTAINED</th><th rowspan="2">GRADE</th></tr><tr><th>Written</th><th>OR/PR</th><th>Total</th><th>Written</th><th>OR/PR</th><th>Total</th></tr>${rows}<tr><th>Grand Total</th><th>${grandWritten}</th><th>${grandOral}</th><th>${full}</th><th>-</th><th>-</th><th>${total}</th><th>${overallGrade}</th></tr></table><div class="summary">Percentage: <b>${pct}%</b> &nbsp;|&nbsp; Result: <b>${resultStatus}</b></div><div style="text-align:center"><div class="rank-box">🏆 Class Rank: ${studentRank === '-' ? '-' : `${studentRank} / ${students.length}`}</div></div>${hasPrevTerms ? `<div class="prev-wrap">${prevTermsHtml}</div>` : ''
      }<div class="sign"><span>Class Teacher</span><span>Guardian</span><span>Principal</span></div></section><div class="print-time">${printDateTime}</div></div>`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const w = window.open('', '_blank', 'width=900,height=900');
      if (!w) throw new Error('Allow pop-ups to print the result.');
      w.document.open();
      w.document.write('<!doctype html><html><head><title></title></head><body>' + html + '</body></html>');
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 1200);
    } else {
      await Print.printAsync({ html });
    }
  };

  const downloadExcel = async () => {
    if (selected?.kind !== 'terminal') return Alert.alert('Excel', 'Weekly-test Excel is available from Marks.');
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/api/terminal-exams/published/${selected.id}/excel`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error('Excel download failed');
      if (Platform.OS === 'web') {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `terminal-result-${selected.id}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert('Excel ready', 'Download is available in the web version.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <View style={s.headerContainer}>
        <AcademyHeader />
      </View>

      <ScrollView ref={scrollRef} style={s.pageScroll} contentContainerStyle={s.body} showsVerticalScrollIndicator persistentScrollbar>
        {!selected ? (
          <>
            <Text style={s.title}>Terminal Exam Result Print</Text>

            <View style={s.filterPanel}>
              <Text style={s.filterTitle}>Select Terminal Result by Class</Text>
              <View style={s.filterControls}>
                <View style={s.filterSelect}>
                  <Select
                    label="Result session"
                    value={sessionFilter}
                    onChange={value => {
                      setSessionFilter(value);
                      setSelectedResultId('');
                    }}
                    options={sessionOptions}
                  />
                </View>
                <View style={s.filterSelect}>
                  <Select
                    label="Select class"
                    value={classFilter === 'all' ? '' : classFilter}
                    onChange={value => {
                      setClassFilter(value || 'all');
                      setSelectedResultId('');
                    }}
                    options={classDropdownOptions}
                  />
                </View>
                <View style={s.filterSelect}>
                  <Select
                    label="Select result"
                    value={selectedResultId}
                    onChange={setSelectedResultId}
                    options={resultDropdownOptions}
                  />
                </View>
                <TouchableOpacity
                  disabled={!selectedResultId}
                  onPress={() => {
                    if (selectedResultId) openTerminal(Number(selectedResultId));
                  }}
                  style={[s.openResultBtn, !selectedResultId && { opacity: 0.5 }]}
                >
                  <Text style={s.openResultBtnText}>Open Result</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.listHeaderRow}>
              <Text style={[s.heading, { marginTop: 0, marginBottom: 0 }]}>
                Published Terminal Exams ({filteredTerminal.length})
              </Text>
              <TextInput
                placeholder="🔍 Search exams..."
                placeholderTextColor="#8492a6"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={s.searchInput}
              />
            </View>

            <View style={s.chipRow}>
              {['all', ...allClasses].map(c => {
                const active = classFilter === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => {
                      setClassFilter(c);
                      setSelectedResultId('');
                    }}
                    style={[s.filterChip, active && s.filterChipActive]}
                  >
                    <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                      {c === 'all' ? 'All Classes' : `Class ${c}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {filteredTerminal.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>No published terminal exams found.</Text>
              </View>
            ) : (
              filteredTerminal.map(t => (
                <TouchableOpacity key={'t' + t.id} style={s.card} onPress={() => openTerminal(t.id)}>
                  <Text style={s.bold}>
                    {String(t.exam_name || '').trim()} - Class {t.class_name}
                  </Text>
                  <Text style={[s.help, { marginBottom: 0 }]}>
                    {t.session_name ? `Session ${t.session_name} - ` : ''}
                    {t.subject_count} subjects - Published {String(t.published_at || '').slice(0, 10)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => { setSelected(null); setTerms([]); }} style={s.backBtn}>
              <Text style={s.link}>← Back to Published Exams</Text>
            </TouchableOpacity>

            <View style={s.titleRow}>
              <Text style={s.heading}>
                {selected.kind === 'weekly'
                  ? `Class: ${selected.class_name} | Full Marks: ${Number(selected.full_marks)} | Date: ${String(
                    selected.exam_date || ''
                  ).slice(0, 10)} | Subject: ${selected.subject_name}`
                  : `${selected.exam_name} | Class ${selected.class_name}`}
              </Text>

              {selected.kind === 'terminal' && (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TouchableOpacity onPress={downloadExcel} style={s.action}>
                    <Text style={s.actionText}>📊 Download Excel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={printResult} style={[s.action, { backgroundColor: '#059669' }]}>
                    <Text style={s.actionText}>🖨️ Print Complete Result</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {selected.kind === 'terminal' && (
              <Text style={s.help}>
                Use each student row's Print button to print individual student marksheet.
              </Text>
            )}

            {/* DEDICATED VERTICAL + HORIZONTAL SCROLL FOR TABLE */}
            <View style={s.blueBox}>
              <View style={s.tableCard}>
                {(() => {
                  const tableInner = (
                    <View style={{ minWidth: '100%' }}>
                      {selected.kind === 'terminal' ? (
                        <>
                          {/* Table Header Row */}
                          <View style={[s.row, s.headRow, Platform.OS === 'web' && (s.stickyHead as any)]}>
                            <Text style={[s.sl, s.th]}>Sl</Text>
                            <Text style={[s.reg, s.th]}>Reg.</Text>
                            <Text style={[s.name, s.th]}>Student Name</Text>
                            {subjects.map(x => (
                              <Text key={x.id} style={[s.mark, s.th]}>
                                {x.subject_name}{'\n'}F.M.-{Number(x.full_marks)}
                              </Text>
                            ))}
                            <Text style={[s.mark, s.th, { width: 96 }]}>Marksheet</Text>
                          </View>

                          {/* Table Student Rows */}
                          {students.map((x, i) => (
                            <View key={x.id} style={[s.row, i % 2 === 1 && s.rowAlt]}>
                              <Text style={s.sl}>{i + 1}</Text>
                              <Text style={s.reg}>{x.registration_no}</Text>
                              <Text style={s.name}>{x.student_name}</Text>
                              {subjects.map(y => (
                                <Text key={y.id} style={s.mark}>
                                  {x.marks?.[y.id] ?? 'Absent'}
                                </Text>
                              ))}
                              <TouchableOpacity
                                onPress={() => printIndividualResult(x)}
                                style={[s.markBtn, { width: 96 }]}
                              >
                                <Text style={s.markBtnText}>🖨️ Print</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </>
                      ) : (
                        <>
                          <View style={[s.row, s.headRow, Platform.OS === 'web' && (s.stickyHead as any)]}>
                            <Text style={[s.sl, s.th]}>Sl</Text>
                            <Text style={[s.reg, s.th]}>Reg.</Text>
                            <Text style={[s.name, s.th]}>Name</Text>
                            <Text style={[s.mark, s.th]}>Marks Obtained</Text>
                          </View>
                          {students.map((x, i) => (
                            <View key={x.registration_no} style={[s.row, i % 2 === 1 && s.rowAlt]}>
                              <Text style={s.sl}>{i + 1}</Text>
                              <Text style={s.reg}>{x.registration_no}</Text>
                              <Text style={s.name}>{x.student_name}</Text>
                              <Text style={s.mark}>
                                {x.obtained_marks === null ? 'Absent' : Number(x.obtained_marks)}
                              </Text>
                            </View>
                          ))}
                        </>
                      )}
                    </View>
                  );

                  if (Platform.OS === 'web') {
                    return <View style={s.tableScrollWeb as any}>{tableInner}</View>;
                  }
                  return (
                    <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator persistentScrollbar nestedScrollEnabled>
                      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 10 }}>
                        {tableInner}
                      </ScrollView>
                    </ScrollView>
                  );
                })()}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <ScrollNavigationButtons scrollRef={scrollRef} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f6fa' },
  headerContainer: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 15,
    paddingTop: 10
  },
  pageScroll: { flex: 1 },
  body: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    padding: 15,
    paddingBottom: 50
  },
  title: { fontSize: 26, fontWeight: '900', color: '#174a78', marginVertical: 15 },
  heading: { fontWeight: '900', fontSize: 20, marginBottom: 8, marginTop: 4, color: '#1e293b' },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8
  },
  help: { color: '#64748b', fontSize: 12.5, marginBottom: 12 },
  backBtn: { marginBottom: 6 },
  link: { color: '#1460a6', fontWeight: '800', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dce5ee'
  },
  bold: { fontWeight: '900', fontSize: 16, marginBottom: 6, color: '#1e293b' },
  action: {
    backgroundColor: '#1764a5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7
  },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    marginTop: 6
  },
  row: { flexDirection: 'row', backgroundColor: '#ffffff', alignItems: 'center' },
  rowAlt: { backgroundColor: '#f8fafc' },
  headRow: { backgroundColor: '#0f172a' },
  th: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 11.5,
    borderColor: '#334155',
    backgroundColor: '#0f172a'
  },
  sl: { width: 44, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', textAlign: 'center', fontSize: 12 },
  reg: { width: 82, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', textAlign: 'center', fontSize: 12, fontWeight: '700' },
  name: { width: 185, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  mark: { width: 94, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', textAlign: 'center', fontSize: 12 },
  tableScrollWeb: {
    maxHeight: '66vh',
    overflowY: 'scroll',
    overflowX: 'auto'
  } as any,
  stickyHead: {
    position: 'sticky',
    top: 0,
    zIndex: 5
  } as any,
  markBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#1764a5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#cbd5e1'
  },
  markBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 11.5 },
  blueBox: { width: '100%' },
  filterPanel: {
    backgroundColor: '#eaf3ff',
    borderWidth: 1,
    borderColor: '#bfd7f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16
  },
  filterTitle: { fontSize: 15, fontWeight: '900', color: '#173d68', marginBottom: 8 },
  filterControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  filterSelect: { flex: 1, minWidth: 210 },
  openResultBtn: { backgroundColor: '#167447', borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16, minWidth: 135, alignItems: 'center' },
  openResultBtnText: { color: '#ffffff', fontWeight: '900', fontSize: 13.5 },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12.5,
    color: '#1e293b',
    minWidth: 180
  },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  filterChip: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7
  },
  filterChipActive: { backgroundColor: '#1d5fa7', borderColor: '#1d5fa7' },
  filterChipText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  filterChipTextActive: { color: '#ffffff' },
  emptyBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dce5ee',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center'
  },
  emptyText: { color: '#64748b', fontSize: 13, fontWeight: '600' }
});
