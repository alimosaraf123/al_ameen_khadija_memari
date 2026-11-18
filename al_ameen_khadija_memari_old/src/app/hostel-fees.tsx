import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Print from 'expo-print';
import AcademyHeader from '../components/AcademyHeader';
import ScrollNavigationButtons from '../components/ScrollNavigationButtons';
import { api, API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';

type HostelFeeRecord = {
  id: number;
  registration_no: string;
  student_name: string;
  class_name: string;
  session_year: string;
  sex: string | null;
  fee_category: string | null;
  admission_type: string | null;
  hostel_fees: number;
  local_student_id: number | null;
  local_class_name: string | null;
  local_monthly_fees: number | null;
  local_is_active: boolean;
  mobile_number: string | null;
  synced_at: string | null;
};

type ClassSummary = {
  class_name: string;
  portal_count: number;
  portal_total: number;
  local_count: number;
  local_total: number;
};

type SyncMeta = {
  last_synced_at: string | null;
  last_synced_by_name: string | null;
  target_year: string | null;
  total_portal_rows: number;
  matched_local_students: number;
  updated_student_fees: number;
};

type FeeChange = {
  registration_no: string;
  student_name: string;
  class_name: string;
  old_fee: number;
  new_fee: number;
};

const formatInr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

const formatIst = (iso?: string | null) => {
  if (!iso) return 'Not refreshed yet';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return String(iso).slice(0, 16).replace('T', ' ');
  }
};

export default function HostelFeesScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [records, setRecords] = useState<HostelFeeRecord[]>([]);
  const [classSummary, setClassSummary] = useState<ClassSummary[]>([]);
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncBanner, setLastSyncBanner] = useState<string>('');
  const [feeChanges, setFeeChanges] = useState<FeeChange[]>([]);

  const [scope, setScope] = useState<'all' | 'local'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [search, setSearch] = useState('');

  // Load ONLY from our own saved PostgreSQL database — NEVER auto-hits external portal
  const loadSaved = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/hostel-fees');
      setRecords(Array.isArray(data.records) ? data.records : []);
      setClassSummary(Array.isArray(data.classSummary) ? data.classSummary : []);
      setMeta(data.meta || null);
    } catch (e: any) {
      setError(e.message || 'Failed to load saved hostel fees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSaved();
  }, []);

  // Manual refresh ONLY when the user explicitly clicks "Refresh from Portal"
  const refreshFromPortal = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError('');
    setLastSyncBanner('');
    setFeeChanges([]);
    try {
      const data = await api('/api/hostel-fees/refresh', {
        method: 'POST',
        body: JSON.stringify({ target_year: '2026' })
      });
      setRecords(Array.isArray(data.records) ? data.records : []);
      setClassSummary(Array.isArray(data.classSummary) ? data.classSummary : []);
      setMeta(data.meta || null);
      const changes: FeeChange[] = Array.isArray(data.feeChanges) ? data.feeChanges : [];
      setFeeChanges(changes);
      const portalCnt = data.meta?.total_portal_rows ?? (data.records?.length || 0);
      const matchedCnt = data.meta?.matched_local_students ?? 0;
      const updatedCnt = data.meta?.updated_student_fees ?? changes.length;
      setLastSyncBanner(
        `Refreshed ${portalCnt} portal records • Matched ${matchedCnt} active students • Updated Monthly Fees in Student Directory for ${updatedCnt} student(s).`
      );
    } catch (e: any) {
      setError(e.message || 'Failed to refresh from Al-Ameen Admission Portal');
      Alert.alert('Refresh Error', e.message || 'Failed to refresh from portal');
    } finally {
      setRefreshing(false);
    }
  };

  const visibleSummary = useMemo(() => {
    return classSummary.filter(c => (scope === 'local' ? c.local_count > 0 : c.portal_count > 0));
  }, [classSummary, scope]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => {
      if (scope === 'local' && !(r.local_student_id && r.local_is_active)) return false;
      if (classFilter !== 'all' && r.class_name !== classFilter) return false;
      if (genderFilter !== 'all' && String(r.sex || '').toLowerCase() !== genderFilter) return false;
      if (q) {
        const hay = `${r.registration_no} ${r.student_name} ${r.class_name} ${r.fee_category || ''} ${r.admission_type || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, scope, classFilter, genderFilter, search]);

  const totals = useMemo(() => {
    const count = filteredRecords.length;
    const sum = filteredRecords.reduce((acc, r) => acc + Number(r.hostel_fees || 0), 0);
    const avg = count ? sum / count : 0;
    const clsCount = new Set(filteredRecords.map(r => r.class_name)).size;
    return { count, sum, avg, clsCount };
  }, [filteredRecords]);

  const downloadExcel = async () => {
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        scope,
        class_name: classFilter,
        gender: genderFilter,
        search: search.trim()
      });
      const r = await fetch(`${API_BASE}/api/hostel-fees/excel?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!r.ok) throw new Error('Excel download failed');
      if (Platform.OS === 'web') {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hostel-fees-${classFilter === 'all' ? 'all-classes' : classFilter}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert('Excel', 'Excel download is available on the web version.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Excel download failed');
    }
  };

  const printReport = async () => {
    if (!filteredRecords.length) return Alert.alert('Print', 'No records to print.');
    const rowsHtml = filteredRecords
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${r.registration_no}</td><td class="left">${r.student_name}</td><td>${r.class_name}</td><td>${r.session_year}</td><td>${r.fee_category || '-'}</td><td>${r.admission_type || '-'}</td><td class="right"><b>${formatInr(r.hostel_fees)}</b></td></tr>`
      )
      .join('');
    const html = `<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;color:#111}h2,h4{text-align:center;margin:4px}table{border-collapse:collapse;width:100%;margin-top:10px;font-size:12px}th,td{border:1px solid #333;padding:5px 7px;text-align:center}th{background:#173f68;color:#fff}.left{text-align:left}.right{text-align:right}.tot td{background:#dcfce7;font-weight:bold;color:#166534}</style><h2>Al-Ameen Mission Academy Memari — Hostel Fees Report</h2><h4>Class: ${classFilter === 'all' ? 'All Classes' : classFilter} &nbsp;|&nbsp; Students: ${totals.count} &nbsp;|&nbsp; Total Hostel Fees: ${formatInr(totals.sum)} &nbsp;|&nbsp; Last Refreshed: ${formatIst(meta?.last_synced_at)}</h4><table><tr><th>Sl</th><th>Reg. No.</th><th>Student Name</th><th>Class</th><th>Session</th><th>Fee Category</th><th>Admission Type</th><th>Hostel Fees</th></tr>${rowsHtml}<tr class="tot"><td colspan="7" class="right">Grand Total (${totals.count} Students)</td><td class="right">${formatInr(totals.sum)}</td></tr></table>`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const w = window.open('', '_blank', 'width=1050,height=800');
      if (!w) return Alert.alert('Print', 'Allow pop-ups to print.');
      w.document.open();
      w.document.write(`<!doctype html><html><head><title>Hostel Fees Report</title></head><body>${html}</body></html>`);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 500);
    } else {
      await Print.printAsync({ html });
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView ref={scrollRef} style={s.page} contentContainerStyle={s.body} showsVerticalScrollIndicator persistentScrollbar>
        <AcademyHeader />

        {/* Accounts Sub-Navigation Strip */}
        <View style={s.tabsBar}>
          <TouchableOpacity style={s.tabBtn} onPress={() => router.push('/fees?tab=fees_collection' as any)}>
            <Text style={s.tabBtnText}>💳 Fees</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.tabBtn} onPress={() => router.push('/fees?tab=receipt_payment' as any)}>
            <Text style={s.tabBtnText}>📑 Receipt & Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.tabBtn} onPress={() => router.push('/due-fees' as any)}>
            <Text style={s.tabBtnText}>⏳ Due Fees</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.tabBtn} onPress={() => router.push('/bank-statement-matcher' as any)}>
            <Text style={s.tabBtnText}>🏦 Bank Matcher</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, s.tabBtnActive]} onPress={() => {}}>
            <Text style={[s.tabBtnText, s.tabBtnTextActive]}>🏠 Hostel Fees</Text>
          </TouchableOpacity>
        </View>

        {/* Title & Manual Refresh Controls */}
        <View style={s.heroCard}>
          <View style={s.heroLeft}>
            <Text style={s.title}>🏠 Hostel Fees (Class-wise)</Text>
            <Text style={s.subtitle}>
              Admission Portal থেকে শুধু Hostel Fees সংরক্ষিত থাকে — আপনি Refresh না করা পর্যন্ত অটো-রিফ্রেশ হবে না।
            </Text>
            <View style={s.metaRow}>
              <Text style={s.metaBadge}>🕒 Last Refreshed: {formatIst(meta?.last_synced_at)}</Text>
              {meta?.last_synced_by_name ? (
                <Text style={s.metaBadge}>👤 By: {meta.last_synced_by_name}</Text>
              ) : null}
              {meta?.total_portal_rows ? (
                <Text style={s.metaBadge}>
                  📊 Portal: {meta.total_portal_rows} | Our Active: {meta.matched_local_students}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={s.heroActions}>
            <TouchableOpacity
              disabled={refreshing}
              onPress={refreshFromPortal}
              style={[s.refreshBtn, refreshing && { opacity: 0.7 }]}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={s.refreshBtnText}>🔄 Refresh from Portal</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!filteredRecords.length}
              onPress={downloadExcel}
              style={[s.secondaryBtn, !filteredRecords.length && { opacity: 0.5 }]}
            >
              <Text style={s.secondaryBtnText}>📊 Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!filteredRecords.length}
              onPress={printReport}
              style={[s.secondaryBtn, { backgroundColor: '#059669' }, !filteredRecords.length && { opacity: 0.5 }]}
            >
              <Text style={s.secondaryBtnText}>🖨️ Print</Text>
            </TouchableOpacity>
          </View>
        </View>

        {lastSyncBanner ? (
          <View style={s.successBanner}>
            <Text style={s.successText}>✅ {lastSyncBanner}</Text>
            {feeChanges.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <Text style={s.changesHead}>Updated Student Monthly Fees ({feeChanges.length}):</Text>
                {feeChanges.slice(0, 10).map(ch => (
                  <Text key={ch.registration_no} style={s.changeLine}>
                    • {ch.registration_no} — {ch.student_name} ({ch.class_name}): {formatInr(ch.old_fee)} → {formatInr(ch.new_fee)}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {error ? (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* KPI Cards */}
        <View style={s.kpiRow}>
          <View style={[s.kpiCard, { borderLeftColor: '#1d4ed8' }]}>
            <Text style={s.kpiLabel}>STUDENTS</Text>
            <Text style={[s.kpiVal, { color: '#1d4ed8' }]}>{totals.count}</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: '#15803d' }]}>
            <Text style={s.kpiLabel}>TOTAL HOSTEL FEES / MONTH</Text>
            <Text style={[s.kpiVal, { color: '#15803d' }]}>{formatInr(totals.sum)}</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: '#7c3aed' }]}>
            <Text style={s.kpiLabel}>AVERAGE FEE</Text>
            <Text style={[s.kpiVal, { color: '#7c3aed' }]}>{formatInr(totals.avg)}</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: '#0369a1' }]}>
            <Text style={s.kpiLabel}>CLASSES SHOWN</Text>
            <Text style={[s.kpiVal, { color: '#0369a1' }]}>{totals.clsCount}</Text>
          </View>
        </View>

        {/* Class-wise Summary Grid */}
        {visibleSummary.length > 0 && (
          <View style={s.summarySection}>
            <Text style={s.sectionTitle}>Class-wise Hostel Fees Summary (Click any class to filter)</Text>
            <View style={s.classGrid}>
              {visibleSummary.map(c => {
                const cnt = scope === 'local' ? c.local_count : c.portal_count;
                const tot = scope === 'local' ? c.local_total : c.portal_total;
                const active = classFilter === c.class_name;
                return (
                  <TouchableOpacity
                    key={c.class_name}
                    style={[s.classCard, active && s.classCardActive]}
                    onPress={() => setClassFilter(active ? 'all' : c.class_name)}
                  >
                    <Text style={[s.classCardName, active && { color: '#ffffff' }]}>Class {c.class_name}</Text>
                    <Text style={[s.classCardCount, active && { color: '#dbeafe' }]}>{cnt} students</Text>
                    <Text style={[s.classCardFee, active && { color: '#ffffff' }]}>{formatInr(tot)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Filter Controls */}
        <View style={s.filterCard}>
          <View style={s.filterTopRow}>
            <View style={s.toggleGroup}>
              <TouchableOpacity
                style={[s.toggleBtn, scope === 'all' && s.toggleBtnActive]}
                onPress={() => {
                  setScope('all');
                  setClassFilter('all');
                }}
              >
                <Text style={[s.toggleBtnText, scope === 'all' && s.toggleBtnTextActive]}>
                  All Portal ({records.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, scope === 'local' && s.toggleBtnActive]}
                onPress={() => {
                  setScope('local');
                  setClassFilter('all');
                }}
              >
                <Text style={[s.toggleBtnText, scope === 'local' && s.toggleBtnTextActive]}>
                  Our Students ({records.filter(r => r.local_student_id && r.local_is_active).length})
                </Text>
              </TouchableOpacity>
            </View>

            <View style={s.toggleGroup}>
              {(['all', 'female', 'male'] as const).map(g => (
                <TouchableOpacity
                  key={g}
                  style={[s.toggleBtn, genderFilter === g && s.toggleBtnActive]}
                  onPress={() => setGenderFilter(g)}
                >
                  <Text style={[s.toggleBtnText, genderFilter === g && s.toggleBtnTextActive]}>
                    {g === 'all' ? 'All Gender' : g === 'female' ? 'Female' : 'Male'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={s.searchInput}
              placeholder="🔍 Search Name, Reg No, Fee Category..."
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <View style={s.pillRow}>
            <TouchableOpacity
              style={[s.pill, classFilter === 'all' && s.pillActive]}
              onPress={() => setClassFilter('all')}
            >
              <Text style={[s.pillText, classFilter === 'all' && s.pillTextActive]}>All Classes</Text>
            </TouchableOpacity>
            {visibleSummary.map(c => (
              <TouchableOpacity
                key={c.class_name}
                style={[s.pill, classFilter === c.class_name && s.pillActive]}
                onPress={() => setClassFilter(c.class_name)}
              >
                <Text style={[s.pillText, classFilter === c.class_name && s.pillTextActive]}>
                  Class {c.class_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Student Hostel Fees Table */}
        {loading ? (
          <ActivityIndicator size="large" color="#1d4ed8" style={{ marginVertical: 40 }} />
        ) : records.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>এখনো কোনো Hostel Fees সিঙ্ক করা হয়নি</Text>
            <Text style={s.emptySub}>
              উপরের &quot;🔄 Refresh from Portal&quot; বাটনে ক্লিক করলে alameenmission.net থেকে ক্লাস-ওয়াইজ Hostel Fees চলে আসবে এবং ডাটাবেসে সেভ থাকবে।
            </Text>
          </View>
        ) : filteredRecords.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>এই ফিল্টারে কোনো স্টুডেন্ট পাওয়া যায়নি।</Text>
          </View>
        ) : (
          <View style={s.tableCard}>
            {(() => {
              const inner = (
                <View style={{ minWidth: 880, flex: 1 }}>
                  <View style={[s.row, s.headRow, Platform.OS === 'web' && (s.stickyHead as any)]}>
                    <Text style={[s.th, s.cSl]}>Sl</Text>
                    <Text style={[s.th, s.cReg]}>Reg. No.</Text>
                    <Text style={[s.th, s.cName, { textAlign: 'left' }]}>Student Name</Text>
                    <Text style={[s.th, s.cCls]}>Class</Text>
                    <Text style={[s.th, s.cSess]}>Session</Text>
                    <Text style={[s.th, s.cCat]}>Fee Category</Text>
                    <Text style={[s.th, s.cAdm]}>Admission Type</Text>
                    <Text style={[s.th, s.cFee]}>Hostel Fees</Text>
                  </View>
                  {filteredRecords.map((r, i) => (
                    <View key={`${r.registration_no}-${r.session_year}`} style={[s.row, i % 2 === 1 && s.rowAlt]}>
                      <Text style={[s.td, s.cSl]}>{i + 1}</Text>
                      <Text style={[s.td, s.cReg, { fontWeight: '800', color: '#1d4ed8' }]}>{r.registration_no}</Text>
                      <Text style={[s.td, s.cName, { textAlign: 'left', fontWeight: '700', color: '#0f172a' }]}>
                        {r.student_name}
                      </Text>
                      <Text style={[s.td, s.cCls, { fontWeight: '700' }]}>{r.class_name}</Text>
                      <Text style={[s.td, s.cSess]}>{r.session_year}</Text>
                      <Text style={[s.td, s.cCat]}>{r.fee_category || '-'}</Text>
                      <Text style={[s.td, s.cAdm]}>{r.admission_type || '-'}</Text>
                      <Text style={[s.td, s.cFee, s.feeText]}>{formatInr(r.hostel_fees)}</Text>
                    </View>
                  ))}
                  <View style={[s.row, s.totalRow]}>
                    <Text style={[s.td, { flex: 1, textAlign: 'right', fontWeight: '900', color: '#166534' }]}>
                      Grand Total ({totals.count} Students)
                    </Text>
                    <Text style={[s.td, s.cFee, { fontWeight: '900', fontSize: 14, color: '#166534' }]}>
                      {formatInr(totals.sum)}
                    </Text>
                  </View>
                </View>
              );

              if (Platform.OS === 'web') {
                return <View style={s.tableScrollWeb as any}>{inner}</View>;
              }
              return (
                <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator persistentScrollbar nestedScrollEnabled>
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    {inner}
                  </ScrollView>
                </ScrollView>
              );
            })()}
          </View>
        )}
      </ScrollView>
      <ScrollNavigationButtons scrollRef={scrollRef} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  body: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: 14, paddingBottom: 60 },
  tabsBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 12 },
  tabBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  tabBtnActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  tabBtnText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  tabBtnTextActive: { color: '#ffffff' },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbe4ef',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  heroLeft: { flex: 1, minWidth: 260 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  subtitle: { fontSize: 12.5, color: '#475569', marginTop: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  metaBadge: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1e3a8a',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  refreshBtn: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 9,
    minWidth: 180,
    alignItems: 'center'
  },
  refreshBtnText: { color: '#ffffff', fontWeight: '900', fontSize: 13.5 },
  secondaryBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 9
  },
  secondaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  successBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12
  },
  successText: { color: '#166534', fontWeight: '800', fontSize: 13 },
  changesHead: { color: '#15803d', fontWeight: '800', fontSize: 12, marginBottom: 3 },
  changeLine: { color: '#166534', fontSize: 12 },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12
  },
  errorText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4
  },
  kpiLabel: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  kpiVal: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  summarySection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#1e293b', marginBottom: 10 },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classCard: {
    minWidth: 132,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    padding: 10
  },
  classCardActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  classCardName: { fontSize: 13.5, fontWeight: '900', color: '#0f172a' },
  classCardCount: { fontSize: 11.5, fontWeight: '700', color: '#64748b', marginTop: 2 },
  classCardFee: { fontSize: 14.5, fontWeight: '900', color: '#15803d', marginTop: 4 },
  filterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  filterTopRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 },
  toggleGroup: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3, gap: 4 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  toggleBtnActive: { backgroundColor: '#1d4ed8' },
  toggleBtnText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  toggleBtnTextActive: { color: '#ffffff' },
  searchInput: {
    flex: 1,
    minWidth: 210,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0f172a'
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7
  },
  pillActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  pillText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  pillTextActive: { color: '#ffffff' },
  emptyBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 36,
    alignItems: 'center'
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#1e293b', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 520 },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden'
  },
  tableScrollWeb: { maxHeight: '64vh', overflowY: 'scroll', overflowX: 'auto' } as any,
  stickyHead: { position: 'sticky', top: 0, zIndex: 5 } as any,
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#ffffff' },
  rowAlt: { backgroundColor: '#f8fafc' },
  headRow: { backgroundColor: '#0f172a' },
  totalRow: { backgroundColor: '#dcfce7', borderTopWidth: 2, borderTopColor: '#16a34a' },
  th: { color: '#ffffff', fontWeight: '800', fontSize: 12, paddingVertical: 10, paddingHorizontal: 8, textAlign: 'center' },
  td: { color: '#334155', fontSize: 12.5, paddingVertical: 8, paddingHorizontal: 8, textAlign: 'center' },
  cSl: { width: 48 },
  cReg: { width: 92 },
  cName: { flex: 1, minWidth: 200 },
  cCls: { width: 85 },
  cSess: { width: 98 },
  cCat: { width: 110 },
  cAdm: { width: 125 },
  cFee: { width: 120 },
  feeText: { fontWeight: '900', fontSize: 13.5, color: '#15803d' }
});
