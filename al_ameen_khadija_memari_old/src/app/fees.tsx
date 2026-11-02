import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';

import AcademyHeader from '../components/AcademyHeader';
import DatePickerField from '../components/DatePickerField';
import { api } from '../lib/api';

const money = (value: any) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value: any) => String(value || '').slice(0, 10) || '-';
const SOURCE_FEES_REPORT = 'https://alameenmission.net/alameen/accounts/?action=fees_report';

const getTodayDate = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function Fees() {
  const [fromDate, setFromDate] = useState(getTodayDate());
  const [toDate, setToDate] = useState(getTodayDate());
  const session = 'last_3_sessions';
  const [searchFilter, setSearchFilter] = useState('');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Portal settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [portalUrl, setPortalUrl] = useState('https://alameenmission.net/alameen/accounts/?action=fees_report');
  const [portalUsername, setPortalUsername] = useState('mosaraf');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalCookie, setPortalCookie] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [portalStatus, setPortalStatus] = useState<any>(null);

  const checkPortalStatus = async () => {
    try {
      const res = await api('/api/guardians/admin/fees-portal-status');
      setPortalStatus(res);
      if (res?.username) setPortalUsername(res.username);
      if (res?.portal_url) setPortalUrl(res.portal_url);
    } catch {
      // ignore
    }
  };

  const load = async (customFrom = fromDate, customTo = toDate, customSession = session) => {
    if (customFrom && customTo && customFrom > customTo) {
      Alert.alert('Invalid date range', 'From Date cannot be after To Date.');
      return;
    }
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (customFrom) query.set('from_date', customFrom);
      if (customTo) query.set('to_date', customTo);
      if (customSession) query.set('session', customSession);
      query.set('branch', 'Memari');

      const data = await api('/api/guardians/admin/fees-report?' + query.toString(), {
        timeoutMs: 120000,
      });
      if (data?.need_login) {
        setReport(null);
        setSettingsOpen(true);
        Alert.alert('Login Required', data.message || 'Please connect your Al-Ameen Accounts credentials.');
        return;
      }
      setReport(data);
    } catch (error: any) {
      Alert.alert('Fees Collection', error.message || 'Unable to load fees report from Al-Ameen Accounts portal.');
    } finally {
      setLoading(false);
    }
  };

  const resetToToday = () => {
    const today = getTodayDate();
    setFromDate(today);
    setToDate(today);
    void load(today, today, 'last_3_sessions');
  };

  const savePortalSettings = async () => {
    try {
      setSavingSettings(true);
      const payload: any = {
        portal_url: portalUrl.trim(),
      };
      if (!portalUsername.trim() || !portalPassword.trim()) {
        Alert.alert('Required', 'Please enter Portal Username and Password.');
        return;
      }
      payload.username = portalUsername.trim();
      payload.password = portalPassword.trim();

      const res = await api('/api/guardians/admin/fees-portal-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      Alert.alert('Connected', res.message || 'Al-Ameen Accounts portal configured successfully.');
      setSettingsOpen(false);
      setPortalPassword('');
      setPortalCookie('');
      await checkPortalStatus();
      void load();
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Failed to authenticate with Al-Ameen Accounts.');
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    void checkPortalStatus();
    void load(fromDate, toDate, session);
  }, []);

  const allFees = useMemo(() => report?.fees || [], [report]);

  const filteredFees = useMemo(() => {
    if (!searchFilter.trim()) return allFees;
    const q = searchFilter.toLowerCase();
    return allFees.filter((item: any) =>
      String(item.bill_number || '').toLowerCase().includes(q) ||
      String(item.student_name || '').toLowerCase().includes(q) ||
      String(item.registration_no || '').toLowerCase().includes(q) ||
      String(item.class_name || '').toLowerCase().includes(q) ||
      String(item.raw_payment_mode || item.details || '').toLowerCase().includes(q)
    );
  }, [allFees, searchFilter]);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <AcademyHeader />

        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Al-Ameen Mission Fees Collection</Text>
            <Text style={styles.subTitle}>Branch: Memari (Live from Accounts Portal)</Text>
          </View>
          <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.settingsButton}>
            <Text style={styles.settingsButtonText}>⚙ Portal Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Card */}
        <View style={styles.filterCard}>
          <DatePickerField label="Date From" value={fromDate} onChange={setFromDate} />
          <DatePickerField label="Date To" value={toDate} onChange={setToDate} />

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              disabled={loading}
              onPress={() => void load()}
              style={[styles.loadButton, loading && styles.disabledBtn]}
            >
              <Text style={styles.white}>{loading ? 'Fetching...' : '🔍 Search Amount'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={resetToToday} style={styles.todayButton}>
              <Text style={styles.todayText}>↻ Today</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Portal Notice Banner if not logged in */}
        {report?.need_login && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertTitle}>⚠️ Al-Ameen Accounts Authentication Required</Text>
            <Text style={styles.alertText}>
              Please enter your portal login credentials to fetch live collected fees report.
            </Text>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.alertActionBtn}>
              <Text style={styles.white}>Connect Portal Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Summary Dashboard Cards */}
        {!!report && report.success && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Bill Amount</Text>
              <Text style={[styles.summaryValue, styles.primaryTotal]}>{money(report.total_amount)}</Text>
              <Text style={styles.summaryHint}>Across {report.bill_count || 0} Bills</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Cash Collection</Text>
              <Text style={[styles.summaryValue, styles.cash]}>{money(report.cash_amount)}</Text>
              <Text style={styles.summaryHint}>Direct Cash Receipts</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Online Collection</Text>
              <Text style={[styles.summaryValue, styles.online]}>{money(report.online_amount)}</Text>
              <Text style={styles.summaryHint}>EDC / Card / UPI / Netbanking</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Bills</Text>
              <Text style={styles.summaryValue}>{report.bill_count || 0}</Text>
              <Text style={styles.summaryHint}>Branch: Memari</Text>
            </View>
          </View>
        )}

        {/* Table Heading & Real-time Filter */}
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.heading}>Fee Payment Bills</Text>
            <Text style={styles.range}>
              Date: {fromDate === toDate ? (fromDate || 'Today') : `${fromDate} to ${toDate}`}
            </Text>
          </View>

          {allFees.length > 0 && (
            <TextInput
              style={styles.searchInput}
              placeholder="Filter bills (Bill No, Name, Reg No...)"
              value={searchFilter}
              onChangeText={setSearchFilter}
            />
          )}
        </View>

        {/* Bills Table */}
        {Platform.OS === 'web' ? (
          <ScrollView horizontal style={styles.tableScroll}>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHead]}>
                {[
                  '#',
                  'Bill No.',
                  'Date',
                  'Reg. No.',
                  'Student Name',
                  'Father Name',
                  'Class',
                  'Total Amount',
                  'Payment Mode',
                  'Branch',
                ].map((label, index) => (
                  <Text
                    key={label}
                    style={[
                      styles.cell,
                      styles.headText,
                      { width: [45, 95, 105, 110, 200, 180, 95, 130, 160, 140][index] },
                    ]}
                  >
                    {label}
                  </Text>
                ))}
              </View>

              {filteredFees.map((item: any, index: number) => {
                const isOnline = item.payment_mode === 'online';
                return (
                  <View
                    key={String(item.bill_number || item.id || index)}
                    style={[styles.tableRow, index % 2 ? styles.altRow : null]}
                  >
                    <Text style={[styles.cell, { width: 45 }]}>{index + 1}</Text>
                    <Text style={[styles.cell, styles.bold, { width: 95 }]}>{item.bill_number || '-'}</Text>
                    <Text style={[styles.cell, { width: 105 }]}>{dateText(item.transaction_date || item.raw_date)}</Text>
                    <Text style={[styles.cell, { width: 110 }]}>{item.registration_no || '-'}</Text>
                    <Text style={[styles.cell, styles.bold, { width: 200 }]}>{item.student_name || '-'}</Text>
                    <Text style={[styles.cell, { width: 180 }]}>{item.father_name || '-'}</Text>
                    <Text style={[styles.cell, { width: 95 }]}>{item.class_name || '-'}</Text>
                    <Text style={[styles.cell, styles.amountCell, { width: 130 }]}>{money(item.amount)}</Text>

                    {/* Payment Mode Badge */}
                    <View style={[styles.cell, { width: 160, justifyContent: 'center' }]}>
                      <View style={[styles.modeBadge, isOnline ? styles.onlineBadge : styles.cashBadge]}>
                        <Text style={[styles.modeBadgeText, isOnline ? styles.onlineBadgeText : styles.cashBadgeText]}>
                          {isOnline ? 'Online' : 'Cash'}
                        </Text>
                      </View>
                      {item.raw_payment_mode && item.raw_payment_mode.toLowerCase() !== 'cash' ? (
                        <Text style={styles.rawModeText} numberOfLines={1}>
                          {item.raw_payment_mode}
                        </Text>
                      ) : null}
                    </View>

                    <Text style={[styles.cell, { width: 140 }]}>{item.branch_name || 'Memari'}</Text>
                  </View>
                );
              })}

              {!filteredFees.length && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.empty}>
                    {loading ? 'Fetching fee records...' : 'No fee records found for the selected date range.'}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        ) : (
          filteredFees.map((item: any, idx: number) => {
            const isOnline = item.payment_mode === 'online';
            return (
              <View key={String(item.bill_number || item.id || idx)} style={styles.mobileCard}>
                <View style={styles.mobileTop}>
                  <Text style={styles.mobileName}>{item.student_name || '-'}</Text>
                  <Text style={styles.amount}>{money(item.amount)}</Text>
                </View>
                <Text style={styles.mobileMeta}>
                  Bill #{item.bill_number || '-'} · Reg: {item.registration_no || '-'} · Class: {item.class_name || '-'}
                </Text>
                <View style={styles.mobileBottom}>
                  <Text style={styles.mobileDate}>{dateText(item.transaction_date || item.raw_date)}</Text>
                  <View style={[styles.modeBadge, isOnline ? styles.onlineBadge : styles.cashBadge]}>
                    <Text style={[styles.modeBadgeText, isOnline ? styles.onlineBadgeText : styles.cashBadgeText]}>
                      {isOnline ? 'Online' : 'Cash'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Settings Modal */}
        <Modal visible={settingsOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Al-Ameen Accounts Portal Configuration</Text>
              <Text style={styles.modalSub}>
                Connect to Al-Ameen Mission Accounts to fetch live fees collection report for Memari branch.
              </Text>

              <Text style={styles.inputLabel}>Portal Site URL (Fees Report Link)</Text>
              <TextInput
                style={styles.input}
                value={portalUrl}
                onChangeText={setPortalUrl}
                placeholder="https://alameenmission.net/alameen/accounts/?action=fees_report"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Portal Username / E-mail Address</Text>
              <TextInput
                style={styles.input}
                value={portalUsername}
                onChangeText={setPortalUsername}
                placeholder="e.g. mosaraf"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Portal Password</Text>
              <TextInput
                style={styles.input}
                value={portalPassword}
                onChangeText={setPortalPassword}
                placeholder="Enter accounts portal password"
                secureTextEntry
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setSettingsOpen(false)}
                  style={styles.cancelBtn}
                  disabled={savingSettings}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={savePortalSettings}
                  style={styles.saveBtn}
                  disabled={savingSettings}
                >
                  <Text style={styles.white}>{savingSettings ? 'Connecting...' : 'Save & Connect'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 50 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 12, flexWrap: 'wrap' },
  backButton: { backgroundColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  backText: { color: '#0f172a', fontWeight: '800' },
  title: { fontSize: 23, fontWeight: '900', color: '#0f172a' },
  subTitle: { fontSize: 13, color: '#64748b', fontWeight: '700', marginTop: 2 },
  settingsButton: { backgroundColor: '#0284c7', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  settingsButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 16,
  },

  buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  loadButton: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9,
    minHeight: 44,
    justifyContent: 'center',
  },
  todayButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#94a3b8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 9,
    minHeight: 44,
    justifyContent: 'center',
  },
  todayText: { color: '#0f172a', fontWeight: '800' },
  disabledBtn: { opacity: 0.6 },
  white: { color: '#fff', fontWeight: '900' },

  alertBanner: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  alertTitle: { fontSize: 15, fontWeight: '900', color: '#92400e', marginBottom: 4 },
  alertText: { fontSize: 13, color: '#78350f', marginBottom: 10 },
  alertActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#d97706',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
  },

  summaryRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  summaryLabel: { color: '#475569', fontWeight: '800', fontSize: 13 },
  summaryValue: { color: '#0f172a', fontSize: 24, fontWeight: '900', marginTop: 6 },
  summaryHint: { color: '#94a3b8', fontSize: 11, fontWeight: '700', marginTop: 4 },
  primaryTotal: { color: '#1e40af' },
  online: { color: '#15803d' },
  cash: { color: '#b45309' },

  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  heading: { fontSize: 19, fontWeight: '900', color: '#0f172a' },
  range: { color: '#64748b', fontWeight: '700', fontSize: 12, marginTop: 2 },
  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 260,
    fontSize: 13,
  },

  tableScroll: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10 },
  table: { minWidth: 1200 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', minHeight: 40, alignItems: 'center' },
  tableHead: { backgroundColor: '#e2e8f0' },
  altRow: { backgroundColor: '#f8fafc' },
  cell: { paddingHorizontal: 8, paddingVertical: 6, borderRightWidth: 1, borderRightColor: '#f1f5f9', color: '#1e293b', fontSize: 12 },
  headText: { fontWeight: '900', color: '#0f172a' },
  bold: { fontWeight: '800' },
  amountCell: { fontWeight: '900', color: '#0f172a', textAlign: 'right' },

  modeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, alignSelf: 'flex-start' },
  onlineBadge: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  cashBadge: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde047' },
  modeBadgeText: { fontSize: 11, fontWeight: '900' },
  onlineBadgeText: { color: '#15803d' },
  cashBadgeText: { color: '#a16207' },
  rawModeText: { fontSize: 10, color: '#64748b', marginTop: 2 },

  emptyContainer: { padding: 30, alignItems: 'center', width: '100%' },
  empty: { color: '#64748b', fontWeight: '700' },

  mobileCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  mobileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mobileName: { fontWeight: '900', color: '#0f172a', fontSize: 15 },
  amount: { fontWeight: '900', color: '#1e40af', fontSize: 16 },
  mobileMeta: { color: '#475569', fontSize: 12, marginTop: 4 },
  mobileBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  mobileDate: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 6 },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9' },
  cancelText: { color: '#475569', fontWeight: '700' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0284c7' },
});
