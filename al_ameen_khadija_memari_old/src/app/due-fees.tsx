import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import AcademyHeader from '../components/AcademyHeader';
import ScrollNavigationButtons from '../components/ScrollNavigationButtons';
import DatePickerField from '../components/DatePickerField';
import { api, getApiBase } from '../lib/api';
import { getToken, getUser } from '../lib/auth';

const getTodayDate = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatCurrency = (val: any) => {
  const n = Number(val || 0);
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const CLASS_OPTIONS = [
  { label: 'All Classes', value: 'all' },
  { label: 'Class V', value: '6' },
  { label: 'Class VI', value: '7' },
  { label: 'Class VII', value: '8' },
  { label: 'Class VIII', value: '9' },
  { label: 'Class IX', value: '10' },
  { label: 'Class X', value: '11' },
  { label: 'Class XI-Sc.', value: '12' },
  { label: 'Class XI-Arts', value: '13' },
  { label: 'Class XII-Sc.', value: '16' },
  { label: 'Class XII-Arts', value: '15' },
];

const SESSION_OPTIONS = [
  { label: 'Last 2 Sessions (2026 & 2025)', value: 'last_2_sessions' },
  { label: 'Session 2026-2027 (2026)', value: '2026' },
  { label: 'Session 2025-2026 (2025)', value: '2025' },
];

export default function DueFeesScreen() {
  const scrollRef = useRef<any>(null);
  const [toDate, setToDate] = useState<string>(getTodayDate());
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<string>('last_2_sessions');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [dueData, setDueData] = useState<any>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);

  // Portal Credentials Modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [portalUsername, setPortalUsername] = useState('mosaraf');
  const [portalPassword, setPortalPassword] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    void getUser<any>().then((u) => {
      if (u?.role === 'super_admin') setIsSuperAdmin(true);
    });
    void loadDueList();
  }, []);

  const loadDueList = async (targetToDate = toDate, targetClass = selectedClass, targetSession = selectedSession) => {
    try {
      setLoading(true);
      const q = new URLSearchParams();
      if (targetToDate) q.set('to_date', targetToDate);
      if (targetClass) q.set('class_id', targetClass);
      if (targetSession) q.set('session_year', targetSession);

      const res = await api('/api/guardians/admin/due-list?' + q.toString(), {
        timeoutMs: 90000,
      });

      if (res?.need_login) {
        setDueData(null);
        if (isSuperAdmin) setSettingsOpen(true);
        Alert.alert('Login Required', res.message || 'Please connect your Al-Ameen Accounts credentials.');
        return;
      }

      setDueData(res);
    } catch (err: any) {
      console.error('Failed to load dues:', err);
      Alert.alert('Due List', err.message || 'Unable to fetch due fees from Accounts portal.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!portalUsername.trim() || !portalPassword.trim()) {
      Alert.alert('Validation Error', 'Please enter both username and password.');
      return;
    }
    try {
      setSavingSettings(true);
      const res = await api('/api/guardians/admin/alameen-accounts/login', {
        method: 'POST',
        body: JSON.stringify({
          username: portalUsername.trim(),
          password: portalPassword.trim(),
        }),
      });
      if (res?.success) {
        Alert.alert('Success', 'Credentials verified and saved successfully.');
        setSettingsOpen(false);
        setPortalPassword('');
        void loadDueList();
      } else {
        Alert.alert('Login Failed', res?.message || 'Could not log in to Accounts portal.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to connect to Accounts portal.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      const token = await getToken();
      const base = getApiBase();
      const exportUrl = `${base}/api/guardians/admin/due-list-export?to_date=${toDate}&class_id=${selectedClass}&session_year=${selectedSession}`;

      if (Platform.OS === 'web') {
        const response = await fetch(exportUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) throw new Error('Failed to download Excel file');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `due_fees_list_${toDate || 'report'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        await Linking.openURL(exportUrl);
      }
    } catch (err: any) {
      Alert.alert('Excel Export Error', err.message || 'Failed to export Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  // WhatsApp Message Action
  const handleSendWhatsApp = (item: any) => {
    const rawNumber = String(item.whatsapp || item.phone || '').trim();
    const cleanNum = rawNumber.replace(/[^0-9]/g, '');
    if (!cleanNum || cleanNum.length < 10) {
      Alert.alert('Invalid Number', `No valid WhatsApp number found for ${item.student_name}.`);
      return;
    }
    const intlNumber = cleanNum.length === 10 ? `91${cleanNum}` : cleanNum;
    const msg = item.whatsapp_message || `Dear, ${item.student_name}, Reg.No.${item.registration_no}, class-${item.class_name}, Pay Your total dues Rs.${item.total_due} , if already paid please ignore it. From-Al Ameen Mission Academy,Memari`;
    const url = `https://wa.me/${intlNumber}?text=${encodeURIComponent(msg)}`;

    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Unable to open WhatsApp.');
      });
    }
  };

  // Direct Phone Call Action
  const handlePhoneCall = (item: any) => {
    const rawNumber = String(item.phone || item.whatsapp || '').trim();
    const cleanNum = rawNumber.replace(/[^0-9]/g, '');
    if (!cleanNum || cleanNum.length < 10) {
      Alert.alert('Invalid Number', `No phone number found for ${item.student_name}.`);
      return;
    }
    const url = `tel:${cleanNum}`;
    if (Platform.OS === 'web') {
      window.location.href = url;
    } else {
      Linking.openURL(url).catch(() => {
        Alert.alert('Call Error', 'Unable to initiate phone call.');
      });
    }
  };

  // WhatsApp Voice Call Action
  const handleWhatsAppCall = (item: any) => {
    const rawNumber = String(item.whatsapp || item.phone || '').trim();
    const cleanNum = rawNumber.replace(/[^0-9]/g, '');
    if (!cleanNum || cleanNum.length < 10) {
      Alert.alert('Invalid Number', `No WhatsApp number found for ${item.student_name}.`);
      return;
    }
    const intlNumber = cleanNum.length === 10 ? `91${cleanNum}` : cleanNum;
    const url = `https://wa.me/${intlNumber}`;

    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Unable to open WhatsApp.');
      });
    }
  };

  // Filtered rows by search input
  const filteredRows = useMemo(() => {
    const rows = dueData?.rows || [];
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((r: any) => {
      const reg = String(r.registration_no || '').toLowerCase();
      const name = String(r.student_name || '').toLowerCase();
      const cls = String(r.class_name || '').toLowerCase();
      const fName = String(r.father_name || '').toLowerCase();
      const phone = String(r.phone || '').toLowerCase();
      const month = String(r.due_month || '').toLowerCase();
      return reg.includes(q) || name.includes(q) || cls.includes(q) || fName.includes(q) || phone.includes(q) || month.includes(q);
    });
  }, [dueData?.rows, searchQuery]);

  // Dynamic filtered totals
  const totals = useMemo(() => {
    const count = filteredRows.length;
    const admDue = filteredRows.reduce((sum: number, r: any) => sum + (Number(r.admission_due) || 0), 0);
    const mDue = filteredRows.reduce((sum: number, r: any) => sum + (Number(r.monthly_due) || 0), 0);
    const totDue = filteredRows.reduce((sum: number, r: any) => sum + (Number(r.total_due) || 0), 0);
    return { count, admDue, mDue, totDue };
  }, [filteredRows]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AcademyHeader
        subtitle={
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={1}>
            Al-Ameen Mission Academy Memari • Accounts Portal Live Sync
          </Text>
        }
        extraActions={
          isSuperAdmin ? (
            <TouchableOpacity
              onPress={() => setSettingsOpen(true)}
              style={styles.settingsHeaderBtn}
            >
              <Text style={styles.settingsHeaderBtnText}>⚙️ Portal Login</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Navigation Tabs (Accounts Sub-Menus) */}
        <View style={styles.tabNav}>
          <TouchableOpacity
            onPress={() => router.push('/fees?tab=fees_collection' as any)}
            style={styles.tabBtn}
          >
            <Text style={styles.tabBtnText}>💳 Fees</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/fees?tab=receipt_payment' as any)}
            style={styles.tabBtn}
          >
            <Text style={styles.tabBtnText}>📑 Receipt & Payment</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, styles.tabBtnTextActive]}>
              ⏳ Due Fees
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/bank-statement-matcher' as any)}
            style={styles.tabBtn}
          >
            <Text style={styles.tabBtnText}>🏦 Bank Matcher</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Controls Bar */}
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            {/* Date To */}
            <View style={styles.filterItem}>
              <DatePickerField
                label="Date To (Current Date)"
                value={toDate}
                onChange={setToDate}
              />
            </View>

            {/* Class Filter */}
            <View style={styles.filterItem}>
              <Text style={styles.filterLabel}>Class / Course</Text>
              <View style={styles.selectWrapper}>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  style={{
                    width: '100%',
                    height: 42,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: 14,
                    color: '#1e293b',
                    outlineStyle: 'none',
                    fontWeight: 600,
                  }}
                >
                  {CLASS_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </View>
            </View>

            {/* Session Filter */}
            <View style={styles.filterItem}>
              <Text style={styles.filterLabel}>Session</Text>
              <View style={styles.selectWrapper}>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  style={{
                    width: '100%',
                    height: 42,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: 14,
                    color: '#1e293b',
                    outlineStyle: 'none',
                    fontWeight: 600,
                  }}
                >
                  {SESSION_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </View>
            </View>
          </View>

          {/* Action Buttons & Search */}
          <View style={styles.searchAndActionsRow}>
            <View style={styles.searchInputContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by Name, Reg No, Mobile, Month..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchIcon}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.searchBtn}
                onPress={() => loadDueList(toDate, selectedClass, selectedSession)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.searchBtnText}>🔄 Fetch Live Dues</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exportBtn}
                onPress={handleExportExcel}
                disabled={exportingExcel || loading}
              >
                {exportingExcel ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.exportBtnText}>📥 Export Excel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Summary Metric KPI Cards */}
        <View style={styles.kpiContainer}>
          <View style={[styles.kpiCard, { borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.kpiLabel}>STUDENTS WITH DUE</Text>
            <Text style={[styles.kpiValue, { color: '#1d4ed8' }]}>{totals.count}</Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.kpiLabel}>ADMISSION DUE</Text>
            <Text style={[styles.kpiValue, { color: '#b45309' }]}>
              ₹{formatCurrency(totals.admDue)}
            </Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: '#8b5cf6' }]}>
            <Text style={styles.kpiLabel}>MONTHLY DUE</Text>
            <Text style={[styles.kpiValue, { color: '#6d28d9' }]}>
              ₹{formatCurrency(totals.mDue)}
            </Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: '#ef4444' }]}>
            <Text style={styles.kpiLabel}>TOTAL DUE</Text>
            <Text style={[styles.kpiValue, { color: '#b91c1c' }]}>
              ₹{formatCurrency(totals.totDue)}
            </Text>
          </View>
        </View>

        {/* Table Content Card */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderInfo}>
            <Text style={styles.tableTitle}>
              📋 Student Fees Due List ({filteredRows.length} Records)
            </Text>
            <Text style={styles.tableSubtitle}>
              Branch: <Text style={{ fontWeight: '700', color: '#0f172a' }}>Memari</Text> • XI-XII filtered to local active students only
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0284c7" />
              <Text style={styles.loadingText}>Fetching live due list from Al-Ameen Accounts portal...</Text>
            </View>
          ) : filteredRows.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTitle}>No Dues Found</Text>
              <Text style={styles.emptySubtitle}>
                No pending fee records match the selected class, session, and date criteria.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal style={styles.horizontalScroll}>
              <View style={styles.table}>
                {/* Table Header Row (Matching Screenshot 4) */}
                <View style={styles.tableHeadRow}>
                  <View style={[styles.thCell, { width: 60 }]}>
                    <Text style={styles.thText}>Sl No</Text>
                  </View>
                  <View style={[styles.thCell, { width: 90 }]}>
                    <Text style={styles.thText}>Reg No</Text>
                  </View>
                  <View style={[styles.thCell, { width: 220, alignItems: 'flex-start' }]}>
                    <Text style={styles.thText}>Name</Text>
                  </View>
                  <View style={[styles.thCell, { width: 120 }]}>
                    <Text style={styles.thText}>Admissin Due</Text>
                  </View>
                  <View style={[styles.thCell, { width: 120 }]}>
                    <Text style={styles.thText}>Monthly Due</Text>
                  </View>
                  <View style={[styles.thCell, { width: 110 }]}>
                    <Text style={styles.thText}>Due Month</Text>
                  </View>
                  <View style={[styles.thCell, { width: 120 }]}>
                    <Text style={styles.thText}>Total Due</Text>
                  </View>
                  <View style={[styles.thCell, { width: 95 }]}>
                    <Text style={styles.thText}>Whatsapp</Text>
                  </View>
                  <View style={[styles.thCell, { width: 95 }]}>
                    <Text style={styles.thText}>Phone call</Text>
                  </View>
                  <View style={[styles.thCell, { width: 105 }]}>
                    <Text style={styles.thText}>Whatsapp call</Text>
                  </View>
                </View>

                {/* Table Body Rows */}
                {filteredRows.map((row: any, index: number) => {
                  const isEven = index % 2 === 0;
                  return (
                    <View
                      key={`${row.registration_no}_${row.session_year}_${index}`}
                      style={[styles.tableRow, isEven ? styles.tableRowEven : styles.tableRowOdd]}
                    >
                      {/* Sl No */}
                      <View style={[styles.tdCell, { width: 60 }]}>
                        <Text style={styles.tdTextMuted}>{index + 1}</Text>
                      </View>

                      {/* Reg No */}
                      <View style={[styles.tdCell, { width: 90 }]}>
                        <Text style={styles.tdTextBold}>{row.registration_no}</Text>
                        <Text style={styles.tdSubtext}>{row.class_name}</Text>
                      </View>

                      {/* Name */}
                      <View style={[styles.tdCell, { width: 220, alignItems: 'flex-start' }]}>
                        <Text style={styles.tdStudentName}>{row.student_name}</Text>
                        {row.father_name ? (
                          <Text style={styles.tdFatherName}>F: {row.father_name}</Text>
                        ) : null}
                      </View>

                      {/* Admission Due */}
                      <View style={[styles.tdCell, { width: 120 }]}>
                        <Text style={[styles.tdText, Number(row.admission_due) > 0 && styles.tdDueAdm]}>
                          {formatCurrency(row.admission_due)}
                        </Text>
                      </View>

                      {/* Monthly Due */}
                      <View style={[styles.tdCell, { width: 120 }]}>
                        <Text style={[styles.tdText, Number(row.monthly_due) > 0 && styles.tdDueMonthly]}>
                          {formatCurrency(row.monthly_due)}
                        </Text>
                      </View>

                      {/* Due Month */}
                      <View style={[styles.tdCell, { width: 110 }]}>
                        <View style={styles.monthBadge}>
                          <Text style={styles.monthBadgeText}>
                            {row.due_month || 'Current'}
                          </Text>
                        </View>
                      </View>

                      {/* Total Due */}
                      <View style={[styles.tdCell, { width: 120 }]}>
                        <Text style={styles.tdTotalDue}>
                          {formatCurrency(row.total_due)}
                        </Text>
                      </View>

                      {/* Whatsapp Message Button */}
                      <View style={[styles.tdCell, { width: 95 }]}>
                        <TouchableOpacity
                          style={styles.actionLogoBtn}
                          onPress={() => handleSendWhatsApp(row)}
                          accessibilityLabel="Send WhatsApp Due Notice"
                        >
                          <View style={styles.waLogoCircle}>
                            <Text style={styles.waLogoEmoji}>💬</Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Phone call Button */}
                      <View style={[styles.tdCell, { width: 95 }]}>
                        <TouchableOpacity
                          style={styles.actionLogoBtn}
                          onPress={() => handlePhoneCall(row)}
                          accessibilityLabel="Call Guardian / Student"
                        >
                          <View style={styles.phoneLogoCircle}>
                            <Text style={styles.phoneLogoEmoji}>📞</Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Whatsapp call Button */}
                      <View style={[styles.tdCell, { width: 105 }]}>
                        <TouchableOpacity
                          style={styles.actionLogoBtn}
                          onPress={() => handleWhatsAppCall(row)}
                          accessibilityLabel="WhatsApp Voice Call"
                        >
                          <View style={styles.waCallLogoCircle}>
                            <Text style={styles.waCallLogoEmoji}>📱</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}

                {/* Table Footer Total Row */}
                <View style={styles.tableFootRow}>
                  <View style={[styles.tdCell, { width: 60 }]}>
                    <Text style={styles.thText}></Text>
                  </View>
                  <View style={[styles.tdCell, { width: 90 }]}>
                    <Text style={styles.thText}></Text>
                  </View>
                  <View style={[styles.tdCell, { width: 220, alignItems: 'flex-start' }]}>
                    <Text style={[styles.thText, { fontWeight: '800', color: '#0f172a' }]}>
                      GRAND TOTAL ({totals.count} Students)
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: 120 }]}>
                    <Text style={[styles.tdTotalDue, { color: '#b45309' }]}>
                      {formatCurrency(totals.admDue)}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: 120 }]}>
                    <Text style={[styles.tdTotalDue, { color: '#6d28d9' }]}>
                      {formatCurrency(totals.mDue)}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: 110 }]}>
                    <Text style={styles.thText}></Text>
                  </View>
                  <View style={[styles.tdCell, { width: 120 }]}>
                    <Text style={[styles.tdTotalDue, { color: '#b91c1c', fontSize: 15 }]}>
                      {formatCurrency(totals.totDue)}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: 95 }]} />
                  <View style={[styles.tdCell, { width: 95 }]} />
                  <View style={[styles.tdCell, { width: 105 }]} />
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* Floating 1-Click Scroll Top and Bottom Buttons */}
      <ScrollNavigationButtons scrollRef={scrollRef} />

      {/* Al-Ameen Accounts Portal Credentials Modal */}
      <Modal visible={settingsOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚙️ Accounts Portal Connection</Text>
              <TouchableOpacity onPress={() => setSettingsOpen(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalNote}>
              Configure your credentials for{' '}
              <Text style={{ fontWeight: '700' }}>alameenmission.net/alameen/accounts/</Text> to allow automated live fetching of dues.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Portal Email / Username</Text>
              <TextInput
                style={styles.textInput}
                value={portalUsername}
                onChangeText={setPortalUsername}
                placeholder="e.g. mosaraf"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Portal Password</Text>
              <TextInput
                style={styles.textInput}
                value={portalPassword}
                onChangeText={setPortalPassword}
                placeholder="Enter portal password"
                secureTextEntry
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSettingsOpen(false)}
                disabled={savingSettings}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveCredentials}
                disabled={savingSettings}
              >
                {savingSettings ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveBtnText}>Connect & Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  settingsHeaderBtn: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  settingsHeaderBtnText: {
    color: '#0369a1',
    fontWeight: '700',
    fontSize: 12,
  },
  tabNav: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  tabBtnActive: {
    backgroundColor: '#0284c7',
  },
  tabBtnText: {
    color: '#334155',
    fontWeight: '800',
    fontSize: 14,
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  filterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 14,
  },
  filterItem: {
    flex: 1,
    minWidth: 200,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  selectWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  searchAndActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchInputContainer: {
    flex: 1,
    minWidth: 280,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    height: 42,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    height: 40,
    outlineStyle: 'none',
  } as any,
  clearSearchIcon: {
    fontSize: 14,
    color: '#94a3b8',
    padding: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  exportBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  tableHeaderInfo: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  tableSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  horizontalScroll: {
    width: '100%',
  },
  table: {
    minWidth: 1150,
  },
  // Table Header (Light blue background matching screenshot 4)
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: '#bae6fd', // light sky blue matching #bbf2f6
    borderBottomWidth: 1.5,
    borderBottomColor: '#7dd3fc',
  },
  thCell: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#93c5fd',
  },
  thText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableRowEven: {
    backgroundColor: '#ffffff',
  },
  tableRowOdd: {
    backgroundColor: '#f8fafc',
  },
  tdCell: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  tdText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
    textAlign: 'center',
  },
  tdTextMuted: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
  },
  tdTextBold: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
    textAlign: 'center',
  },
  tdSubtext: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  tdStudentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
  },
  tdFatherName: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  tdDueAdm: {
    color: '#b45309',
    fontWeight: '700',
  },
  tdDueMonthly: {
    color: '#6d28d9',
    fontWeight: '700',
  },
  tdTotalDue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  monthBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  monthBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    textTransform: 'capitalize',
  },
  tableFootRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderTopWidth: 2,
    borderTopColor: '#cbd5e1',
  },
  // Logos / Action Buttons
  actionLogoBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waLogoCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
  },
  waLogoEmoji: {
    fontSize: 17,
  },
  phoneLogoCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0369a1',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
  },
  phoneLogoEmoji: {
    fontSize: 16,
  },
  waCallLogoCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
  },
  waCallLogoEmoji: {
    fontSize: 16,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  closeBtn: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '800',
    padding: 4,
  },
  modalNote: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    height: 42,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0284c7',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
