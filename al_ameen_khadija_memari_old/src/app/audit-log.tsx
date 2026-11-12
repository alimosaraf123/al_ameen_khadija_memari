import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { api } from '../lib/api';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const formatKolkataTimestamp = (rawVal: any, fallback?: string): string => {
  if (rawVal) {
    try {
      const d = new Date(rawVal);
      if (!isNaN(d.getTime())) {
        const formatter = new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        const parts = formatter.formatToParts(d);
        const getPart = (t: string) => parts.find((p) => p.type === t)?.value || '';
        const day = getPart('day');
        const month = getPart('month');
        const year = getPart('year');
        const hour = getPart('hour');
        const minute = getPart('minute');
        const dayPeriod = (getPart('dayPeriod') || '').toUpperCase();
        if (day && month && year && hour && minute) {
          return `${day}/${month}/${year} ${hour}:${minute} ${dayPeriod}`.trim();
        }
        return formatter.format(d);
      }
    } catch {}
  }
  return fallback || String(rawVal || '-');
};

const formatDate = (v: any) => {
  if (!v) return '-';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const parts = formatter.formatToParts(d);
    const getPart = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const sec = getPart('second');
    const dayPeriod = (getPart('dayPeriod') || '').toUpperCase();
    if (day && month && year && hour && minute) {
      return `${day}/${month}/${year} ${hour}:${minute}:${sec} ${dayPeriod}`.trim();
    }
    return formatter.format(d);
  } catch {
    return String(v).replace('T', ' ').slice(0, 19);
  }
};

type AuditTab = 'action_history' | 'office' | 'guardian';

export default function AuditLog() {
  const [activeTab, setActiveTab] = useState<AuditTab>('action_history');
  const [loading, setLoading] = useState(true);

  // Action History Audit (Main Audit Log from Dashboard)
  const [activities, setActivities] = useState<any[]>([]);
  const [totalActivities, setTotalActivities] = useState<number>(0);
  const [actionSearch, setActionSearch] = useState('');
  const [limit, setLimit] = useState<number>(100);

  // Office & Guardian Activity
  const [officeLogs, setOfficeLogs] = useState<any[]>([]);
  const [guardianLogs, setGuardianLogs] = useState<any[]>([]);
  const [date, setDate] = useState(today());
  const [guardianSearch, setGuardianSearch] = useState('');

  const loadActionHistory = async () => {
    try {
      const q = `/api/system-admin/action-history-audit?limit=${limit}${actionSearch.trim() ? `&search=${encodeURIComponent(actionSearch.trim())}` : ''}`;
      const res = await api(q);
      if (res?.activities) {
        setActivities(res.activities);
        setTotalActivities(res.total || res.activities.length);
      }
    } catch (e: any) {
      console.warn('Action history load error', e?.message);
    }
  };

  const loadOfficeLogs = async () => {
    try {
      const res = await api(`/api/system-admin/office-activity?date=${encodeURIComponent(date)}`);
      setOfficeLogs(res.logs || []);
    } catch (e: any) {
      console.warn('Office logs load error', e?.message);
    }
  };

  const loadGuardianLogs = async () => {
    try {
      const res = await api('/api/system-admin/guardian-activity');
      setGuardianLogs(res.guardian_activity || []);
    } catch (e: any) {
      console.warn('Guardian logs load error', e?.message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.allSettled([loadActionHistory(), loadOfficeLogs(), loadGuardianLogs()]);
    } catch (e: any) {
      Alert.alert('Audit', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [limit, date]);

  // Filtered guardian logs
  const filteredGuardians = useMemo(() => {
    if (!guardianSearch.trim()) return guardianLogs;
    const q = guardianSearch.trim().toLowerCase();
    return guardianLogs.filter((g) => {
      const name = String(g.full_name || '').toLowerCase();
      const login = String(g.login_id || '').toLowerCase();
      const students = (g.students || []).map((s: any) => `${s.student_name} ${s.registration_no} ${s.class_name}`.toLowerCase()).join(' ');
      return name.includes(q) || login.includes(q) || students.includes(q);
    });
  }, [guardianLogs, guardianSearch]);

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />

        {/* Top Header */}
        <View style={s.top}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/superadmin')}>
            <Text style={s.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.pageTitle}>System & Activity Audit Log</Text>
            <Text style={s.pageSubTitle}>Complete action audit history, user logins, staff & guardian activity</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={loadAll}>
            <Text style={s.refreshBtnText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tabItem, activeTab === 'action_history' && s.tabItemActive]}
            onPress={() => setActiveTab('action_history')}
          >
            <Text style={[s.tabItemText, activeTab === 'action_history' && s.tabItemTextActive]}>
              🕒 Action History Audit {totalActivities > 0 ? `(${totalActivities})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'office' && s.tabItemActive]}
            onPress={() => setActiveTab('office')}
          >
            <Text style={[s.tabItemText, activeTab === 'office' && s.tabItemTextActive]}>
              👨‍💼 Office Staff Activity {officeLogs.length > 0 ? `(${officeLogs.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'guardian' && s.tabItemActive]}
            onPress={() => setActiveTab('guardian')}
          >
            <Text style={[s.tabItemText, activeTab === 'guardian' && s.tabItemTextActive]}>
              👨‍👩‍👧 Guardian Login & Usage {guardianLogs.length > 0 ? `(${guardianLogs.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Loading Indicator */}
        {loading && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#0284c7" />
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 1: ACTION HISTORY AUDIT (Full Dashboard Audit Table)        */}
        {/* ============================================================== */}
        {activeTab === 'action_history' && (
          <View style={s.panelCard}>
            <View style={s.controlBar}>
              <View style={s.searchBox}>
                <Text style={s.searchIcon}>🔍</Text>
                <TextInput
                  value={actionSearch}
                  onChangeText={setActionSearch}
                  onSubmitEditing={() => void loadActionHistory()}
                  placeholder="Search initiator, action type, description, IP..."
                  style={s.searchInput}
                  returnKeyType="search"
                />
                {actionSearch.trim().length > 0 && (
                  <TouchableOpacity onPress={() => { setActionSearch(''); setTimeout(loadActionHistory, 50); }}>
                    <Text style={{ color: '#94a3b8', fontWeight: '800', paddingHorizontal: 6 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity style={s.filterBtn} onPress={() => void loadActionHistory()}>
                <Text style={s.filterBtnText}>Filter</Text>
              </TouchableOpacity>

              <View style={s.limitSelector}>
                <Text style={s.limitLabel}>Show:</Text>
                {[50, 100, 200].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[s.limitBtn, limit === num && s.limitBtnActive]}
                    onPress={() => setLimit(num)}
                  >
                    <Text style={[s.limitBtnText, limit === num && s.limitBtnTextActive]}>{num}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.countBadgeRow}>
              <Text style={s.countBadgeText}>
                Showing {activities.length} of {totalActivities || activities.length} recorded system actions
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={s.tableContainer}>
                <View style={[s.tRow, s.tHeadRow]}>
                  <Text style={[s.tHeadCell, { width: 55 }]}>S.L.</Text>
                  <Text style={[s.tHeadCell, { width: 95 }]}>TOKEN</Text>
                  <Text style={[s.tHeadCell, s.tLeftCell, { width: 175 }]}>INITIATOR</Text>
                  <Text style={[s.tHeadCell, s.tLeftCell, { width: 165 }]}>ACTION TYPE</Text>
                  <Text style={[s.tHeadCell, s.tLeftCell, { minWidth: 340, flex: 1 }]}>AUDIT DESCRIPTION</Text>
                  <Text style={[s.tHeadCell, { width: 165 }]}>TIMESTAMP</Text>
                  <Text style={[s.tHeadCell, { width: 135 }]}>IP ADDRESS</Text>
                  <Text style={[s.tHeadCell, s.tLeftCell, { width: 195 }]}>LOCATION</Text>
                </View>

                {activities.length === 0 ? (
                  <View style={s.emptyRow}>
                    <Text style={s.emptyText}>No activity records match your query.</Text>
                  </View>
                ) : (
                  activities.map((row: any, i: number) => (
                    <View key={String(row.token || row.id || i)} style={[s.tRow, i % 2 === 1 && s.tRowZebra]}>
                      <Text style={[s.tCell, { width: 55 }]}>{row.sl || i + 1}</Text>
                      <Text style={[s.tCell, s.tokenCell, { width: 95 }]}>{row.token}</Text>
                      <View style={[s.tCellBox, { width: 175, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                        <View style={s.initiatorBadge}>
                          <Text style={s.initiatorBadgeText}>{row.initiator_badge}</Text>
                        </View>
                        <Text style={s.initiatorName} numberOfLines={1}>
                          {row.initiator_name}
                        </Text>
                      </View>
                      <View style={[s.tCellBox, { width: 165, flexDirection: 'row', alignItems: 'center' }]}>
                        <View style={s.actionTypePill}>
                          <Text style={s.actionTypePillText}>
                            {row.icon ? `${row.icon} ` : ''}{row.action_type}
                          </Text>
                        </View>
                      </View>
                      <View style={[s.tCellBox, { minWidth: 340, flex: 1, paddingVertical: 6 }]}>
                        <Text style={s.auditDescriptionText}>
                          {row.audit_description}
                        </Text>
                      </View>
                      <Text style={[s.tCell, s.timestampCell, { width: 165 }]}>
                        {formatKolkataTimestamp(row.raw_time, row.timestamp)}
                      </Text>
                      <Text style={[s.tCell, s.ipCell, { width: 135 }]} numberOfLines={1}>
                        {row.ip_address || '127.0.0.1'}
                      </Text>
                      <View style={[s.tCellBox, { width: 195, flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                        <Text style={{ fontSize: 12 }}>📍</Text>
                        <Text style={s.locationText} numberOfLines={1}>
                          {row.location || 'Memari Campus'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 2: OFFICE STAFF ACTIVITY                                   */}
        {/* ============================================================== */}
        {activeTab === 'office' && (
          <View style={s.panelCard}>
            <View style={s.controlBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.dateLabel}>Date:</Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  style={s.dateInput}
                />
              </View>
              <TouchableOpacity style={s.filterBtn} onPress={loadOfficeLogs}>
                <Text style={s.filterBtnText}>Load Date</Text>
              </TouchableOpacity>
              <Text style={{ marginLeft: 'auto', color: '#64748b', fontSize: 13, fontWeight: '700' }}>
                {officeLogs.length} activity records
              </Text>
            </View>

            {officeLogs.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No Office Staff activity found for {date}.</Text>
              </View>
            ) : (
              officeLogs.map((x: any) => (
                <View key={x.id} style={s.activityCard}>
                  <View style={s.activityCardHeader}>
                    <Text style={s.activityCardUser}>{x.full_name || x.login_id || 'Office Staff'}</Text>
                    <View style={s.methodPill}>
                      <Text style={s.methodPillText}>{x.method} • {x.status_code}</Text>
                    </View>
                  </View>
                  <Text style={s.activityCardPath}>{x.path}</Text>
                  <Text style={s.activityCardFields}>
                    Accessed: {Array.isArray(x.details?.fields) && x.details.fields.length ? x.details.fields.join(', ') : 'Page access'}
                  </Text>
                  <Text style={s.activityCardMeta}>
                    {formatDate(x.created_at)} • 🌐 IP: {x.ip_address || '127.0.0.1'} • 📍 {x.location || 'Memari Campus'}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 3: GUARDIAN LOGIN & USAGE                                  */}
        {/* ============================================================== */}
        {activeTab === 'guardian' && (
          <View style={s.panelCard}>
            <View style={s.controlBar}>
              <View style={[s.searchBox, { maxWidth: 400 }]}>
                <Text style={s.searchIcon}>🔍</Text>
                <TextInput
                  value={guardianSearch}
                  onChangeText={setGuardianSearch}
                  placeholder="Filter student name, reg no, guardian ID..."
                  style={s.searchInput}
                />
              </View>
              <Text style={{ marginLeft: 'auto', color: '#64748b', fontSize: 13, fontWeight: '700' }}>
                Showing {filteredGuardians.length} of {guardianLogs.length} sessions
              </Text>
            </View>

            {filteredGuardians.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No guardian sessions match your search.</Text>
              </View>
            ) : (
              filteredGuardians.map((x: any) => (
                <View key={x.id} style={s.guardianCard}>
                  <View style={s.activityCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.guardianCardTitle}>{x.full_name || x.login_id || 'Guardian'}</Text>
                      <Text style={s.guardianLoginId}>({x.login_id})</Text>
                    </View>
                    <View style={[s.statusPill, x.is_active ? s.statusPillActive : s.statusPillLoggedOut]}>
                      <Text style={[s.statusPillText, x.is_active ? s.statusTextActive : s.statusTextLoggedOut]}>
                        {x.is_active ? '● Active Login' : '○ Logged Out'}
                      </Text>
                    </View>
                  </View>

                  {(x.students || []).map((st: any, idx: number) => (
                    <Text key={String(st.registration_no || idx)} style={s.studentBadge}>
                      🎒 Student: <Text style={{ fontWeight: '800' }}>{st.student_name || '-'}</Text> | Reg: {st.registration_no || '-'} | Class: {st.class_name || '-'}
                    </Text>
                  ))}

                  <View style={s.guardianMetaRow}>
                    <Text style={s.metaSmall}>📱 Device: {String(x.device_id || '-').slice(0, 24)}</Text>
                    <Text style={s.metaSmall}>👨‍👧 Total Students: {x.student_count || 1}</Text>
                    <Text style={s.metaSmall}>🕒 Last login: {formatDate(x.last_login_at)}</Text>
                    {x.logged_out_at && (
                      <Text style={[s.metaSmall, { color: '#dc2626' }]}>🚪 Logout: {formatDate(x.logged_out_at)}</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f0f4f9' },
  body: { padding: 14, maxWidth: 1400, width: '100%', alignSelf: 'center', gap: 12 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    flexWrap: 'wrap',
    gap: 8,
  },
  pageTitle: { fontSize: 20, fontWeight: '900', color: '#1e3a5f' },
  pageSubTitle: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '600' },
  backBtn: { backgroundColor: '#e2ecf8', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  backBtnText: { color: '#1e3a5f', fontWeight: '800', fontSize: 13 },
  refreshBtn: { backgroundColor: '#0284c7', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  refreshBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    flexWrap: 'wrap',
    gap: 6,
  },
  tabItem: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  tabItemActive: {
    backgroundColor: '#0284c7',
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  tabItemTextActive: {
    color: '#ffffff',
  },

  // Panel & Table
  panelCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    flex: 1,
    minWidth: 260,
    height: 38,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', paddingVertical: 0 },
  filterBtn: { backgroundColor: '#0f766e', paddingVertical: 9, paddingHorizontal: 16, borderRadius: 6 },
  filterBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  limitSelector: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  limitLabel: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  limitBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 5, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  limitBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  limitBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  limitBtnTextActive: { color: '#ffffff', fontWeight: '900' },
  countBadgeRow: { marginBottom: 8 },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: '#64748b' },

  tableContainer: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    overflow: 'hidden',
    minWidth: 1200,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    alignItems: 'stretch',
    minHeight: 40,
  },
  tRowZebra: { backgroundColor: '#f8fafc' },
  tHeadRow: { backgroundColor: '#f1f5f9', borderBottomColor: '#cbd5e1', minHeight: 38 },
  tHeadCell: {
    fontWeight: '800',
    fontSize: 11,
    color: '#475569',
    paddingHorizontal: 8,
    paddingVertical: 10,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  tLeftCell: { textAlign: 'left' },
  tCell: {
    fontSize: 12,
    color: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  tCellBox: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
    justifyContent: 'center',
  },
  tokenCell: { color: '#0284c7', fontWeight: '800', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  initiatorBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  initiatorBadgeText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  initiatorName: { fontSize: 12, fontWeight: '700', color: '#1e293b', flexShrink: 1 },
  actionTypePill: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionTypePillText: { fontSize: 11, fontWeight: '800', color: '#1e3a5f' },
  auditDescriptionText: { fontSize: 12, color: '#1e293b', fontWeight: '600' },
  timestampCell: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  ipCell: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  locationText: { fontSize: 11, color: '#334155', fontWeight: '700', flexShrink: 1 },
  emptyRow: { padding: 30, alignItems: 'center' },
  emptyCard: { padding: 30, alignItems: 'center' },
  emptyText: { color: '#64748b', fontStyle: 'italic', fontSize: 13 },

  // Office & Guardian Cards
  dateLabel: { fontSize: 13, fontWeight: '800', color: '#1e3a5f' },
  dateInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 140,
    fontSize: 13,
  },
  activityCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  activityCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  activityCardUser: { fontWeight: '900', color: '#1e3a5f', fontSize: 14 },
  methodPill: { backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  methodPillText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  activityCardPath: { fontSize: 12, color: '#0369a1', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, marginBottom: 2 },
  activityCardFields: { fontSize: 12, color: '#475569', marginBottom: 4 },
  activityCardMeta: { fontSize: 11, color: '#64748b', fontWeight: '700' },

  guardianCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  guardianCardTitle: { fontWeight: '900', color: '#1e3a5f', fontSize: 14 },
  guardianLoginId: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  statusPillActive: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  statusPillLoggedOut: { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  statusTextActive: { color: '#166534' },
  statusTextLoggedOut: { color: '#991b1b' },
  studentBadge: {
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginVertical: 4,
    fontSize: 12,
  },
  guardianMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  metaSmall: { fontSize: 11, color: '#64748b', fontWeight: '700' },
});
