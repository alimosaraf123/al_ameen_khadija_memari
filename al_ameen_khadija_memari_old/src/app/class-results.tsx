import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE, api } from '../lib/api';
import { getToken } from '../lib/auth';
import * as Print from 'expo-print';
import AcademyHeader from '../components/AcademyHeader';

export default function ClassResults() {
  const [terminal, setTerminal] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    api('/api/terminal-exams/published')
      .then(t => setTerminal(t.exams || []))
      .catch(e => Alert.alert('Error', e.message));
  }, []);

  const openTerminal = async (id: number) => {
    try {
      const x = await api(`/api/terminal-exams/published/${id}`);
      setSelected({ ...x.exam, kind: 'terminal' });
      setStudents(x.students || []);
      setSubjects(x.subjects || []);
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
          `<tr><td>${i + 1}</td><td>${x.registration_no}</td><td class="name">${x.student_name}</td>${
            selected.kind === 'terminal'
              ? subjects.map(y => `<td>${x.marks?.[y.id] ?? 'Absent'}</td>`).join('') + `<td><b>${rankMap[x.student_id || x.registration_no] ?? '-'}</b></td>`
              : `<td>${x.obtained_marks === null ? 'Absent' : Number(x.obtained_marks)}</td>`
          }</tr>`
      )
      .join('');

    await Print.printAsync({
      html: `<style>@page{size:A4 landscape;margin:9mm}body{font-family:Arial}h2,h3{text-align:center;margin:4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #222;padding:5px;text-align:center}.name{text-align:left}</style><h2>Al-Ameen Mission Academy Memari</h2><h3>${
        selected.kind === 'weekly'
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
    const rows = subjects
      .map(
        (sub: any) =>
          `<tr><td>${sub.subject_name}</td><td>${
            sub.theory_marks ?? Number(sub.full_marks || 0) - Number(sub.oral_marks || 0)
          }</td><td>${sub.oral_marks ?? 0}</td><td>${sub.full_marks}</td><td>${
            st.written_marks?.[sub.id] ?? '—'
          }</td><td>${st.oral_obtained?.[sub.id] ?? '—'}</td><td>${st.marks?.[sub.id] ?? 'Absent'}</td><td>${
            st.marks?.[sub.id] === 'Absent' ? '—' : grade(Number(st.marks?.[sub.id] || 0), Number(sub.full_marks || 0))
          }</td></tr>`
      )
      .join('');
    const html = `<style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial;color:#111}.sheet{border:2px solid #174f75;padding:12mm;min-height:240mm}header{display:flex;align-items:center;border-bottom:2px solid #174f75;padding-bottom:8px}header img{width:28mm;height:34mm;object-fit:cover;border:1px solid #555;margin-left:auto}h1,h2{text-align:center;margin:6px}h1{font-size:22px}.student{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:14px 0;font-size:14px}table{border-collapse:collapse;width:100%;margin-top:15px}th,td{border:1px solid #222;padding:8px;text-align:center}th:first-child,td:first-child{text-align:left}.summary{margin-top:14px;font-weight:bold}.sign{display:flex;justify-content:space-between;margin-top:90px}</style><section class="sheet"><header><div style="flex:1"><h1>Al-Ameen Mission Academy Memari</h1><div style="text-align:center">Memari, Purba Bardhaman - 713146</div></div>${
      photo ? `<img src="${photo}" onerror="this.style.display='none'"/>` : ''
    }</header><h2>TERMINAL EXAMINATION RESULT</h2><div class="student"><div><b>Student Name:</b> ${
      st.student_name
    }</div><div><b>Registration:</b> ${st.registration_no}</div><div><b>Father's Name:</b> ${
      st.father_name || st.guardian_name || st.mother_name || '-'
    }</div><div><b>Class:</b> ${selected.class_name}</div></div><table><tr><th rowspan="2">Subject</th><th colspan="3">FULL MARKS</th><th colspan="3">MARKS OBTAINED</th><th rowspan="2">GRADE</th></tr><tr><th>Written</th><th>Oral</th><th>Total</th><th>Written</th><th>Oral</th><th>Total</th></tr>${rows}<tr><th>Grand Total</th><th>${subjects.reduce(
      (a: any, x: any) =>
        a + Number(x.theory_marks || Number(x.full_marks || 0) - Number(x.oral_marks || 0)),
      0
    )}</th><th>${subjects.reduce((a: any, x: any) => a + Number(x.oral_marks || 0), 0)}</th><th>${full}</th><th>-</th><th>-</th><th>${total}</th><th>${grade(
      total,
      full
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
    )}</th></tr></table><div class="summary">Percentage: ${pct}% &nbsp; | &nbsp; Rank: ${studentRank} &nbsp; | &nbsp; Result: ${
      subjects.some((sub: any) => st.marks?.[sub.id] === 'Absent') ? 'Incomplete' : 'Pass'
    }</div><div class="sign"><span>Class Teacher</span><span>Guardian</span><span>Principal</span></div></section>`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const w = window.open('', '_blank', 'width=900,height=900');
      if (!w) throw new Error('Allow pop-ups to print the result.');
      w.document.open();
      w.document.write('<!doctype html><html><head><title>Terminal Result</title></head><body>' + html + '</body></html>');
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

      <ScrollView style={s.pageScroll} contentContainerStyle={s.body}>
        {!selected ? (
          <>
            <Text style={s.title}>Terminal Exam Result Print</Text>
            <Text style={s.heading}>Published Terminal Exams</Text>
            {terminal.map(t => (
              <TouchableOpacity key={'t' + t.id} style={s.card} onPress={() => openTerminal(t.id)}>
                <Text style={s.bold}>
                  {t.exam_name} - Class {t.class_name}
                </Text>
                <Text style={s.help}>
                  {t.subject_count} subjects - Published {String(t.published_at).slice(0, 10)}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => setSelected(null)} style={s.backBtn}>
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

            {/* DEDICATED HORIZONTAL SCROLL FOR TABLE */}
            <View style={s.tableCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 10 }}>
                <View>
                  {selected.kind === 'terminal' ? (
                    <>
                      {/* Table Header Row */}
                      <View style={[s.row, s.headRow]}>
                        <Text style={[s.sl, s.th]}>Sl</Text>
                        <Text style={[s.reg, s.th]}>Reg.</Text>
                        <Text style={[s.name, s.th]}>Student Name</Text>
                        {subjects.map(x => (
                          <Text key={x.id} style={[s.mark, s.th]}>
                            {x.subject_name}{'\n'}F.M.-{Number(x.full_marks)}
                          </Text>
                        ))}
                        <Text style={[s.mark, s.th, { width: 90 }]}>Marksheet</Text>
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
                            style={[s.markBtn, { width: 90 }]}
                          >
                            <Text style={s.markBtnText}>🖨️ Print</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  ) : (
                    <>
                      <View style={[s.row, s.headRow]}>
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
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>
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
  sl: { width: 45, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', textAlign: 'center', fontSize: 12 },
  reg: { width: 95, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', textAlign: 'center', fontSize: 12, fontWeight: '700' },
  name: { width: 190, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  mark: { width: 110, padding: 8, borderWidth: 0.5, borderColor: '#cbd5e1', textAlign: 'center', fontSize: 12 },
  markBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#1764a5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#cbd5e1'
  },
  markBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 11.5 }
});
