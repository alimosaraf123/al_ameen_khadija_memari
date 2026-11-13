import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getApiBase, imageUrl } from '../lib/api';

type BoardData = any;
const POLL_MS = 30_000;

const timeText = () => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date());

export default function DisplayBoard() {
  const [data, setData] = useState<BoardData>(null), [error, setError] = useState(''), [clock, setClock] = useState(timeText());
  const [noticeIndex, setNoticeIndex] = useState(0), [resultPage, setResultPage] = useState(0);
  const load = async () => {
    try {
      const response = await fetch(`${getApiBase()}/api/display-board/public`);
      const next = await response.json();
      if (!response.ok) throw new Error(next.message || 'Display board could not load.');
      setData(next); setError('');
    } catch (e: any) { setError(e.message || 'Display board could not load.'); }
  };
  useEffect(() => { void load(); const id = setInterval(() => void load(), POLL_MS); return () => clearInterval(id); }, []);
  useEffect(() => { const id = setInterval(() => setClock(timeText()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { setNoticeIndex(0); setResultPage(0); }, [data?.mode, data?.result?.exam?.id]);
  useEffect(() => { if (data?.mode !== 'notice') return; const id = setInterval(() => setNoticeIndex(old => ((data.notices || []).length ? (old + 1) % data.notices.length : 0)), 12_000); return () => clearInterval(id); }, [data?.mode, data?.notices?.length]);
  useEffect(() => { if (data?.mode !== 'result') return; const pages = Math.max(1, Math.ceil((data?.result?.students?.length || 0) / 12)); const id = setInterval(() => setResultPage(old => (old + 1) % pages), 15_000); return () => clearInterval(id); }, [data?.mode, data?.result?.students?.length]);
  const enterFullscreen = () => { if (Platform.OS === 'web' && typeof document !== 'undefined') void document.documentElement.requestFullscreen?.(); };
  const content = useMemo(() => {
    if (!data) return <ActivityIndicator size="large" color="#fff" />;
    if (data.mode === 'routine') return <Routine data={data.routine?.grid_data} date={data.date} group={data.config?.routine_group} />;
    if (data.mode === 'notice') return <Notice notice={(data.notices || [])[noticeIndex]} count={(data.notices || []).length} index={noticeIndex} />;
    if (data.mode === 'weekly_exam') return <WeeklyExam items={data.weekly_exam_items || []} />;
    if (data.mode === 'result') return <Result result={data.result} page={resultPage} />;
    return <Text style={s.empty}>Display mode is not selected.</Text>;
  }, [data, noticeIndex, resultPage]);
  return <View style={s.page}>
    <View style={s.top}><View><Text style={s.school}>AL-AMEEN MISSION ACADEMY MEMARI</Text><Text style={s.subtitle}>PROJECTOR DISPLAY BOARD</Text></View><Text style={s.clock}>{clock}</Text><TouchableOpacity onPress={enterFullscreen} style={s.full}><Text style={s.fullText}>FULL SCREEN</Text></TouchableOpacity></View>
    <View style={s.content}>{error ? <><Text style={s.error}>{error}</Text><TouchableOpacity onPress={() => void load()} style={s.retry}><Text style={s.retryText}>RETRY</Text></TouchableOpacity></> : content}</View>
    <Text style={s.footer}>Updates automatically • Display Control: /display-control</Text>
  </View>;
}

function Routine({ data, date, group }: any) {
  if (!data) return <Text style={s.empty}>আজকের routine পাওয়া যায়নি।</Text>;
  const academic = group !== 'coaching', columns = academic ? data.periods || [] : data.rooms || [], rows = academic ? data.classes || [] : data.times || [];
  return <View style={{ flex: 1 }}><Text style={s.modeTitle}>{academic ? 'TODAY’S CLASS ROUTINE' : 'TODAY’S COACHING ROUTINE'} • {String(date || '').split('-').reverse().join('-')}</Text><ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}><View style={s.table}><View style={s.tableRow}><Text style={[s.cell, s.head, s.first]}>{academic ? 'CLASS / PERIOD' : 'TIME / ROOM'}</Text>{columns.map((col: any, i: number) => <Text key={i} style={[s.cell, s.head]}>{academic ? `${col[0]}\n${col[1]}` : col}</Text>)}</View>{rows.map((row: string, r: number) => <View key={row} style={s.tableRow}><Text style={[s.cell, s.first, s.rowHead]}>{row}</Text>{columns.map((col: any, c: number) => { const tiffin = academic && String(col[0]).toLowerCase() === 'tiffin', cell = data.cells?.[academic ? `${row}|${c}` : `${row}|${col}`] || {}; return <View key={c} style={[s.cell, r % 2 && s.alt, tiffin && s.tiffin]}>{tiffin ? <Text style={s.tiffinText}>TIFFIN</Text> : <><Text style={s.subject}>{cell.subject || '—'}</Text><Text style={s.teacher}>{cell.teacher_name || ''}</Text></>}</View>; })}</View>)}</View></ScrollView></View>;
}

function Notice({ notice, count, index }: any) {
  if (!notice) return <Text style={s.empty}>কোনো active notice নেই।</Text>;
  return <View style={s.notice}><Text style={s.modeTitle}>IMPORTANT NOTICE</Text><Text style={s.noticeTitle}>{notice.title}</Text><Text style={s.noticeBody}>{notice.notice_text || 'Please follow this notice carefully.'}</Text>{notice.attachment_url && !String(notice.attachment_url).startsWith('terminal://') && !String(notice.attachment_url).startsWith('result://') && <Image source={{ uri: imageUrl(notice.attachment_url) }} resizeMode="contain" style={s.noticeImage} />}<Text style={s.slide}>NOTICE {index + 1} / {count}</Text></View>;
}

function WeeklyExam({ items }: any) {
  return <View style={{ flex: 1 }}><Text style={s.modeTitle}>WEEKLY TEST • CLASS-WISE EXAM & SYLLABUS</Text><ScrollView contentContainerStyle={s.examGrid}>{items.length ? items.map((item: any, i: number) => <View key={i} style={s.examCard}><Text style={s.examClass}>CLASS {item.class_name}</Text><Text style={s.examSubject}>{item.subject}</Text><Text style={s.examTime}>সময়: {item.time}</Text><Text style={s.examSyllabus}>Syllabus: {item.syllabus}</Text></View>) : <Text style={s.empty}>কোনো weekly test schedule দেওয়া হয়নি।</Text>}</ScrollView></View>;
}

function Result({ result, page }: any) {
  if (!result) return <Text style={s.empty}>Result নির্বাচন করা হয়নি বা এটি আর published নেই।</Text>;
  const pageSize = 12, students = result.students || [], start = page * pageSize, part = students.slice(start, start + pageSize), pages = Math.max(1, Math.ceil(students.length / pageSize));
  return <View style={{ flex: 1 }}><Text style={s.modeTitle}>{result.exam.exam_name} • CLASS {result.exam.class_name} COMPLETE RESULT</Text><ScrollView horizontal><View style={s.resultTable}><View style={s.tableRow}><Text style={[s.resultCell, s.resultHead, { width: 55 }]}>SL</Text><Text style={[s.resultCell, s.resultHead, { width: 130 }]}>REG.</Text><Text style={[s.resultCell, s.resultHead, { width: 260 }]}>STUDENT NAME</Text>{(result.subjects || []).map((sub: any) => <Text key={sub.id} style={[s.resultCell, s.resultHead]}>{sub.subject_name}{'\n'}F.M. {sub.full_marks}</Text>)}</View>{part.map((student: any, i: number) => <View key={student.registration_no || i} style={s.tableRow}><Text style={[s.resultCell, { width: 55 }]}>{start + i + 1}</Text><Text style={[s.resultCell, { width: 130 }]}>{student.registration_no}</Text><Text style={[s.resultCell, { width: 260, textAlign: 'left' }]}>{student.student_name}</Text>{(result.subjects || []).map((sub: any) => <Text key={sub.id} style={s.resultCell}>{student.marks?.[sub.id] ?? 'Absent'}</Text>)}</View>)}</View></ScrollView><Text style={s.pageText}>RESULT PAGE {page + 1} / {pages}</Text></View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#071a33', padding: 18 }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 2, borderColor: '#d7ad3b', paddingBottom: 12, gap: 12 }, school: { color: '#fff', fontSize: 27, fontWeight: '900' }, subtitle: { color: '#f9d56d', fontSize: 14, fontWeight: '800', letterSpacing: 2 }, clock: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'right' }, full: { backgroundColor: '#f9d56d', padding: 10, borderRadius: 6 }, fullText: { color: '#14233a', fontWeight: '900' }, content: { flex: 1, paddingTop: 16 }, footer: { color: '#9fb4cc', textAlign: 'center', paddingTop: 10 }, modeTitle: { color: '#f9d56d', fontSize: 25, fontWeight: '900', textAlign: 'center', marginBottom: 14 }, empty: { color: '#fff', fontSize: 25, textAlign: 'center', marginTop: 80 }, error: { color: '#fecaca', fontSize: 20, textAlign: 'center', marginTop: 80 }, retry: { alignSelf: 'center', backgroundColor: '#f9d56d', padding: 12, borderRadius: 6, marginTop: 16 }, retryText: { fontWeight: '900' }, table: { borderWidth: 1, borderColor: '#7186a0', alignSelf: 'flex-start', backgroundColor: '#fff' }, tableRow: { flexDirection: 'row' }, cell: { width: 172, minHeight: 78, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#9eb0c5', justifyContent: 'center', alignItems: 'center', padding: 6, color: '#0b2340', fontSize: 16 }, first: { width: 145 }, head: { backgroundColor: '#bfd8ee', color: '#102a45', fontWeight: '900', textAlign: 'center' }, rowHead: { backgroundColor: '#dbeaf7', fontWeight: '900', fontSize: 19 }, alt: { backgroundColor: '#f0f7fc' }, tiffin: { backgroundColor: '#ffefae' }, tiffinText: { color: '#8a5d00', fontWeight: '900' }, subject: { color: '#0b2340', fontWeight: '900', textAlign: 'center', fontSize: 16 }, teacher: { color: '#174f75', fontWeight: '700', textAlign: 'center', marginTop: 4 }, notice: { flex: 1, alignItems: 'center', paddingHorizontal: '8%' }, noticeTitle: { color: '#fff', fontSize: 40, fontWeight: '900', textAlign: 'center', marginTop: 18 }, noticeBody: { color: '#e4edf7', fontSize: 27, lineHeight: 40, textAlign: 'center', marginTop: 24 }, noticeImage: { width: '80%', height: 350, marginTop: 18 }, slide: { color: '#f9d56d', fontWeight: '800', marginTop: 15, fontSize: 16 }, examGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'center', padding: 8 }, examCard: { width: 360, minHeight: 225, backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 9, borderLeftColor: '#f9d56d', padding: 20 }, examClass: { color: '#174f75', fontSize: 23, fontWeight: '900' }, examSubject: { color: '#102a45', fontSize: 29, fontWeight: '900', marginTop: 12 }, examTime: { color: '#b45309', fontSize: 21, fontWeight: '900', marginTop: 12 }, examSyllabus: { color: '#243b53', fontSize: 18, lineHeight: 26, marginTop: 13 }, resultTable: { borderWidth: 1, borderColor: '#8ba0b5', backgroundColor: '#fff' }, resultCell: { width: 125, minHeight: 47, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#aebdcb', color: '#112b45', fontSize: 15, textAlign: 'center', padding: 7, textAlignVertical: 'center' }, resultHead: { backgroundColor: '#bfd8ee', fontWeight: '900', color: '#102a45' }, pageText: { color: '#f9d56d', fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 12 },
});
