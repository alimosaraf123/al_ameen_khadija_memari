import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { router, useLocalSearchParams } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import DatePickerField from '../components/DatePickerField';
import { api, getApiBase } from '../lib/api';
import { getToken, getUser } from '../lib/auth';

const money = (value: any) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtNumber = (val: any) => {
  if (val === undefined || val === null || val === '') return '-';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatTitleCase = (str: string) => {
  if (!str) return '';
  const s = String(str).trim();
  return s
    .split(/\s+/)
    .map((w) => {
      if (/^sbi$/i.test(w)) return 'SBI';
      if (/^axis$/i.test(w)) return 'Axis';
      if (/^cash$/i.test(w)) return 'Cash';
      if (/^total$/i.test(w)) return 'Total';
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
};

const dateText = (value: any) => String(value || '').slice(0, 10) || '-';

const getTodayDate = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

type TabMode = 'receipt_payment' | 'fees_collection';

export default function Fees() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab: TabMode = tab === 'fees_collection' || tab === 'fees' ? 'fees_collection' : 'receipt_payment';
  const [activeTab, setActiveTab] = useState<TabMode>(initialTab);
  const [fromDate, setFromDate] = useState(getTodayDate());
  const [toDate, setToDate] = useState(getTodayDate());
  const session = 'last_3_sessions';
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // --- Receipt & Payment State ---
  const [rpLoading, setRpLoading] = useState(false);
  const [rpData, setRpData] = useState<any>(null);
  const [rpSelectedAccount, setRpSelectedAccount] = useState<string | null>(null);
  const [rpTxnFilter, setRpTxnFilter] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);

  // --- Column Filters & Sorting for Detailed Transactions ---
  const [filterModalCol, setFilterModalCol] = useState<string | null>(null);
  const [colSortField, setColSortField] = useState<'account_name' | 'date' | 'particulars' | 'narration' | 'vch_type' | 'vch_no' | 'receipt' | 'payment' | null>(null);
  const [colSortOrder, setColSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [filterParticulars, setFilterParticulars] = useState<string>('');
  const [filterNarration, setFilterNarration] = useState<string>('');
  const [filterVchType, setFilterVchType] = useState<string>('all');
  const [filterVchNo, setFilterVchNo] = useState<string>('');
  const [filterReceipt, setFilterReceipt] = useState<string>('all');
  const [filterReceiptCustom, setFilterReceiptCustom] = useState<string>('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterPaymentCustom, setFilterPaymentCustom] = useState<string>('');
  const [tableZoom, setTableZoom] = useState<number>(100);
  const [txnsBoxHeight, setTxnsBoxHeight] = useState<'normal' | 'large' | 'full'>('large');
  const [statementCollapsed, setStatementCollapsed] = useState(false);
  const [statementTypeFilter, setStatementTypeFilter] = useState<'all' | 'receipt' | 'payment'>('all');

  // Statement Click Handlers for filtering Detailed Transactions
  const handleAccountClick = (row?: any) => {
    if (!row) {
      setRpSelectedAccount(null);
      setFilterAccount('all');
    } else {
      const next = rpSelectedAccount === row.account_id ? null : row.account_id;
      setRpSelectedAccount(next);
      setFilterAccount(next ? row.account_name : 'all');
    }
  };

  const handleReceiptClick = (row?: any) => {
    setStatementTypeFilter('receipt');
    if (row) {
      setRpSelectedAccount(row.account_id);
      setFilterAccount(row.account_name);
    }
  };

  const handlePaymentClick = (row?: any) => {
    setStatementTypeFilter('payment');
    if (row) {
      setRpSelectedAccount(row.account_id);
      setFilterAccount(row.account_name);
    }
  };

  const handleClosingBalanceClick = (row?: any) => {
    setStatementTypeFilter('all');
    if (row) {
      setRpSelectedAccount(row.account_id);
      setFilterAccount(row.account_name);
    }
  };

  // --- Fees Collection State ---
  const [searchFilter, setSearchFilter] = useState('');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // --- Portal Settings Modal State ---
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

  // 1. Fetch Receipt & Payment Summary from Cash Book & Bank Books
  const loadReceiptPayment = async (customFrom = fromDate, customTo = toDate) => {
    if (customFrom && customTo && customFrom > customTo) {
      Alert.alert('Invalid date range', 'From Date cannot be after To Date.');
      return;
    }
    try {
      setRpLoading(true);
      const query = new URLSearchParams();
      if (customFrom) query.set('from_date', customFrom);
      if (customTo) query.set('to_date', customTo);

      const data = await api('/api/guardians/admin/receipt-payment-report?' + query.toString(), {
        timeoutMs: 120000,
      });

      if (data?.need_login) {
        setRpData(null);
        if (isSuperAdmin) setSettingsOpen(true);
        Alert.alert('Login Required', data.message || 'Please connect your Al-Ameen Accounts credentials.');
        return;
      }
      setRpData(data);
    } catch (error: any) {
      Alert.alert('Receipt & Payment', error.message || 'Unable to load statement from Accounts portal.');
    } finally {
      setRpLoading(false);
    }
  };

  // 2. Fetch Fees Collection Report
  const loadFeesCollection = async (customFrom = fromDate, customTo = toDate, customSession = session) => {
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
        if (isSuperAdmin) setSettingsOpen(true);
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

  const handleSearch = () => {
    if (activeTab === 'receipt_payment') {
      void loadReceiptPayment(fromDate, toDate);
    } else {
      void loadFeesCollection(fromDate, toDate, session);
    }
  };

  const resetToToday = () => {
    const today = getTodayDate();
    setFromDate(today);
    setToDate(today);
    if (activeTab === 'receipt_payment') {
      void loadReceiptPayment(today, today);
    } else {
      void loadFeesCollection(today, today, 'last_3_sessions');
    }
  };

  // Export Receipt & Payment Excel (.xlsx)
  const exportReceiptPaymentExcel = async () => {
    try {
      setExportingExcel(true);
      const token = await getToken();
      const base = getApiBase();
      const exportUrl = `${base}/api/guardians/admin/receipt-payment-export?from_date=${fromDate}&to_date=${toDate}`;

      if (Platform.OS === 'web') {
        const response = await fetch(exportUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) throw new Error('Failed to generate Excel file from server.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt_payment_${fromDate}_to_${toDate}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        await Linking.openURL(exportUrl);
      }
    } catch (err: any) {
      Alert.alert('Excel Export Error', err.message || 'Failed to download Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    } else {
      Alert.alert('Print', 'Printing is supported on desktop browsers.');
    }
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
      if (activeTab === 'receipt_payment') {
        void loadReceiptPayment();
      } else {
        void loadFeesCollection();
      }
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Failed to authenticate with Al-Ameen Accounts.');
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    void getUser<any>().then((u) => {
      const role = String(u?.role || '').toLowerCase();
      const isSuper = role === 'super_admin' || role === 'superadmin';
      setIsSuperAdmin(isSuper);
      if (isSuper) {
        void checkPortalStatus();
      }
    });
  }, []);

  useEffect(() => {
    if (tab === 'fees_collection' || tab === 'fees') {
      setActiveTab('fees_collection');
      void loadFeesCollection(fromDate, toDate, session);
    } else {
      setActiveTab('receipt_payment');
      void loadReceiptPayment(fromDate, toDate);
    }
  }, [tab]);

  // Base raw transactions across all accounts from rpData
  const baseTransactions = useMemo(() => {
    if (!rpData?.rows) return [];
    const list: any[] = [];
    for (const r of rpData.rows) {
      if (r.transactions && r.transactions.length) {
        list.push(...r.transactions.map((t: any) => ({
          ...t,
          account_name: r.account_name,
          account_id: r.account_id,
        })));
      }
    }
    return list;
  }, [rpData]);

  // Unique options for filter dropdowns
  const uniqueAccounts = useMemo(() => {
    const s = new Set<string>();
    baseTransactions.forEach((t) => { if (t.account_name) s.add(t.account_name); });
    return Array.from(s);
  }, [baseTransactions]);

  const uniqueDates = useMemo(() => {
    const map = new Map<string, number>();
    baseTransactions.forEach((t) => {
      if (t.date) map.set(t.date, (map.get(t.date) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [baseTransactions]);

  const uniqueVchTypes = useMemo(() => {
    const s = new Set<string>();
    baseTransactions.forEach((t) => { if (t.vch_type) s.add(t.vch_type); });
    return Array.from(s);
  }, [baseTransactions]);

  const uniqueLedgers = useMemo(() => {
    const map = new Map<string, number>();
    baseTransactions.forEach((t) => {
      if (t.particulars) map.set(t.particulars, (map.get(t.particulars) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [baseTransactions]);

  // Filtered detailed transactions for Receipt & Payment
  const activeAccountTransactions = useMemo(() => {
    let list = [...baseTransactions];

    // Account filtering (via top statement selection or dropdown)
    if (rpSelectedAccount) {
      list = list.filter((t: any) => t.account_id === rpSelectedAccount || t.account_name === rpSelectedAccount);
    } else if (filterAccount && filterAccount !== 'all') {
      list = list.filter((t: any) => t.account_name === filterAccount);
    }

    // Date filter
    if (filterDate && filterDate !== 'all') {
      list = list.filter((t: any) => t.date === filterDate);
    }

    // Particulars / Ledger filter
    if (filterParticulars.trim()) {
      const q = filterParticulars.toLowerCase();
      list = list.filter((t: any) => String(t.particulars || '').toLowerCase().includes(q));
    }

    // Narration filter
    if (filterNarration.trim()) {
      const q = filterNarration.toLowerCase();
      list = list.filter((t: any) => String(t.narration || '').toLowerCase().includes(q));
    }

    // Voucher Type filter
    if (filterVchType && filterVchType !== 'all') {
      list = list.filter((t: any) => String(t.vch_type || '').toLowerCase() === filterVchType.toLowerCase());
    }

    // Voucher Number filter
    if (filterVchNo.trim()) {
      const q = filterVchNo.toLowerCase();
      list = list.filter((t: any) => String(t.vch_no || '').toLowerCase().includes(q));
    }

    // Receipt (Debit) filter
    if (filterReceipt === 'has_receipt') {
      list = list.filter((t: any) => Number(t.receipt || 0) > 0);
    } else if (filterReceipt === 'no_receipt') {
      list = list.filter((t: any) => Number(t.receipt || 0) === 0);
    } else if (filterReceipt === 'gt_1000') {
      list = list.filter((t: any) => Number(t.receipt || 0) >= 1000);
    } else if (filterReceipt === 'gt_5000') {
      list = list.filter((t: any) => Number(t.receipt || 0) >= 5000);
    } else if (filterReceipt === 'gt_10000') {
      list = list.filter((t: any) => Number(t.receipt || 0) >= 10000);
    } else if (filterReceipt === 'custom' && filterReceiptCustom.trim()) {
      const q = filterReceiptCustom.trim();
      list = list.filter((t: any) => String(t.receipt || '').includes(q));
    }

    // Payment (Credit) filter
    if (filterPayment === 'has_payment') {
      list = list.filter((t: any) => Number(t.payment || 0) > 0);
    } else if (filterPayment === 'no_payment') {
      list = list.filter((t: any) => Number(t.payment || 0) === 0);
    } else if (filterPayment === 'gt_1000') {
      list = list.filter((t: any) => Number(t.payment || 0) >= 1000);
    } else if (filterPayment === 'gt_5000') {
      list = list.filter((t: any) => Number(t.payment || 0) >= 5000);
    } else if (filterPayment === 'gt_10000') {
      list = list.filter((t: any) => Number(t.payment || 0) >= 10000);
    } else if (filterPayment === 'custom' && filterPaymentCustom.trim()) {
      const q = filterPaymentCustom.trim();
      list = list.filter((t: any) => String(t.payment || '').includes(q));
    }

    // Statement Type Mode Filter (Clicked from Statement Table: Receipt / Payment / Closing Balance)
    if (statementTypeFilter === 'receipt') {
      list = list.filter((t: any) => Number(t.receipt || 0) > 0 || String(t.vch_type || '').toLowerCase() === 'receipt');
    } else if (statementTypeFilter === 'payment') {
      list = list.filter((t: any) => Number(t.payment || 0) > 0 || String(t.vch_type || '').toLowerCase() === 'payment');
    }

    // General search filter
    if (rpTxnFilter.trim()) {
      const q = rpTxnFilter.toLowerCase();
      list = list.filter((t: any) =>
        String(t.particulars || '').toLowerCase().includes(q) ||
        String(t.narration || '').toLowerCase().includes(q) ||
        String(t.vch_no || '').toLowerCase().includes(q) ||
        String(t.vch_type || '').toLowerCase().includes(q) ||
        String(t.account_name || '').toLowerCase().includes(q)
      );
    }

    // Sorting
    if (colSortField) {
      list.sort((a: any, b: any) => {
        let cmp = 0;
        if (colSortField === 'vch_no') {
          const numA = parseInt(String(a.vch_no).replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(String(b.vch_no).replace(/\D/g, ''), 10) || 0;
          cmp = numA - numB;
          if (cmp === 0) cmp = String(a.vch_no || '').localeCompare(String(b.vch_no || ''));
        } else if (colSortField === 'receipt') {
          cmp = Number(a.receipt || 0) - Number(b.receipt || 0);
        } else if (colSortField === 'payment') {
          cmp = Number(a.payment || 0) - Number(b.payment || 0);
        } else if (colSortField === 'date') {
          cmp = String(a.date || '').localeCompare(String(b.date || ''));
        } else {
          const valA = String(a[colSortField] || '');
          const valB = String(b[colSortField] || '');
          cmp = valA.localeCompare(valB);
        }
        return colSortOrder === 'desc' ? -cmp : cmp;
      });
    }

    return list;
  }, [
    baseTransactions,
    rpSelectedAccount,
    filterAccount,
    filterDate,
    filterParticulars,
    filterNarration,
    filterVchType,
    filterVchNo,
    filterReceipt,
    filterReceiptCustom,
    filterPayment,
    filterPaymentCustom,
    statementTypeFilter,
    rpTxnFilter,
    colSortField,
    colSortOrder,
  ]);

  const isAnyFilterActive = useMemo(() => {
    return (
      (filterAccount && filterAccount !== 'all') ||
      (filterDate && filterDate !== 'all') ||
      filterParticulars.trim() !== '' ||
      filterNarration.trim() !== '' ||
      (filterVchType && filterVchType !== 'all') ||
      filterVchNo.trim() !== '' ||
      (filterReceipt && filterReceipt !== 'all') ||
      filterReceiptCustom.trim() !== '' ||
      (filterPayment && filterPayment !== 'all') ||
      filterPaymentCustom.trim() !== '' ||
      statementTypeFilter !== 'all' ||
      colSortField !== null ||
      Boolean(rpSelectedAccount) ||
      rpTxnFilter.trim() !== ''
    );
  }, [
    filterAccount,
    filterDate,
    filterParticulars,
    filterNarration,
    filterVchType,
    filterVchNo,
    filterReceipt,
    filterReceiptCustom,
    filterPayment,
    filterPaymentCustom,
    statementTypeFilter,
    colSortField,
    rpSelectedAccount,
    rpTxnFilter,
  ]);

  const handleClearAllFilters = () => {
    setFilterAccount('all');
    setFilterDate('all');
    setFilterParticulars('');
    setFilterNarration('');
    setFilterVchType('all');
    setFilterVchNo('');
    setFilterReceipt('all');
    setFilterReceiptCustom('');
    setFilterPayment('all');
    setFilterPaymentCustom('');
    setStatementTypeFilter('all');
    setColSortField(null);
    setColSortOrder('asc');
    setRpSelectedAccount(null);
    setRpTxnFilter('');
  };

  // Fees Collection filtered rows
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

        {/* Top Header Bar */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Al-Ameen Mission Accounts</Text>
            <Text style={styles.subTitle}>Branch: Memari (Live Cash Book & Bank Books Integration)</Text>
          </View>
          {isSuperAdmin && (
            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.settingsButton}>
              <Text style={styles.settingsButtonText}>⚙ Portal Settings</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Primary Sub-Menu Tabs */}
        <View style={styles.tabNav}>
          <TouchableOpacity
            onPress={() => {
              setActiveTab('fees_collection');
              if (!report && !loading) void loadFeesCollection(fromDate, toDate, session);
            }}
            style={[styles.tabBtn, activeTab === 'fees_collection' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === 'fees_collection' && styles.tabBtnTextActive]}>
              💳 Fees
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setActiveTab('receipt_payment');
              if (!rpData && !rpLoading) void loadReceiptPayment(fromDate, toDate);
            }}
            style={[styles.tabBtn, activeTab === 'receipt_payment' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === 'receipt_payment' && styles.tabBtnTextActive]}>
              📑 Receipt & Payment
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Filter & Search Actions */}
        <View style={styles.filterCard}>
          <DatePickerField label="Date From" value={fromDate} onChange={setFromDate} />
          <DatePickerField label="Date To" value={toDate} onChange={setToDate} />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              disabled={rpLoading || loading}
              onPress={handleSearch}
              style={[styles.loadButton, (rpLoading || loading) && styles.disabledBtn]}
            >
              <Text style={styles.white}>
                {rpLoading || loading ? 'Fetching Live Data...' : '🔍 Search Statement'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={resetToToday} style={styles.todayButton}>
              <Text style={styles.todayText}>↻ Today</Text>
            </TouchableOpacity>

            {activeTab === 'receipt_payment' && (
              <>
                <TouchableOpacity
                  onPress={exportReceiptPaymentExcel}
                  disabled={exportingExcel || !rpData}
                  style={[styles.exportBtn, (!rpData || exportingExcel) && styles.disabledBtn]}
                >
                  <Text style={styles.exportBtnText}>
                    {exportingExcel ? 'Exporting...' : '📥 Export to Excel (.xlsx)'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePrint}
                  disabled={!rpData}
                  style={[styles.printBtn, !rpData && styles.disabledBtn]}
                >
                  <Text style={styles.printBtnText}>🖨 Print</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Portal Notice Banner if credentials missing */}
        {((activeTab === 'receipt_payment' && rpData?.need_login) ||
          (activeTab === 'fees_collection' && report?.need_login)) && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertTitle}>⚠️ Al-Ameen Accounts Authentication Required</Text>
            <Text style={styles.alertText}>
              {isSuperAdmin
                ? 'Please enter your portal login credentials to fetch live data from the Accounts portal.'
                : 'Portal authentication is required. Please contact Super Admin to configure portal credentials.'}
            </Text>
            {isSuperAdmin && (
              <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.alertActionBtn}>
                <Text style={styles.white}>Connect Portal Now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB 1: RECEIPT & PAYMENT STATEMENT (MATCHING SCREENSHOT 5) */}
        {/* ========================================================= */}
        {activeTab === 'receipt_payment' && (
          <View style={styles.tabContentContainer}>
            {/* Quick KPI Summary Cards */}
            {rpData?.total && (
              <View style={styles.rpCardsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.rpCard, statementTypeFilter === 'all' && styles.rpCardActiveAll]}
                  onPress={() => handleClosingBalanceClick(null)}
                >
                  <Text style={styles.rpCardLabel}>Opening Balance</Text>
                  <Text style={[styles.rpCardValue, { color: '#0f172a' }]}>{money(rpData.total.opening_balance)}</Text>
                  <Text style={styles.rpCardHint}>Cash & Bank Opening</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.rpCard, statementTypeFilter === 'receipt' && styles.rpCardActiveReceipt]}
                  onPress={() => handleReceiptClick(null)}
                >
                  <Text style={styles.rpCardLabel}>Total Receipt (Click: Receipts Only)</Text>
                  <Text style={[styles.rpCardValue, { color: '#16a34a' }]}>+ {money(rpData.total.receipt)}</Text>
                  <Text style={styles.rpCardHint}>Debit Total · Click to view Receipts</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.rpCard, statementTypeFilter === 'payment' && styles.rpCardActivePayment]}
                  onPress={() => handlePaymentClick(null)}
                >
                  <Text style={styles.rpCardLabel}>Total Payment (Click: Payments Only)</Text>
                  <Text style={[styles.rpCardValue, { color: '#dc2626' }]}>- {money(rpData.total.payment)}</Text>
                  <Text style={styles.rpCardHint}>Credit Total · Click to view Payments</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.rpCard, statementTypeFilter === 'all' && styles.rpCardActiveAll]}
                  onPress={() => handleClosingBalanceClick(null)}
                >
                  <Text style={styles.rpCardLabel}>Closing Balance (Click: Show All)</Text>
                  <Text style={[styles.rpCardValue, { color: '#1d4ed8' }]}>{money(rpData.total.closing_balance)}</Text>
                  <Text style={styles.rpCardHint}>Net Balance · Show All Combined</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STATEMENT TABLE STYLED EXACTLY LIKE EXCEL SCREENSHOT 5 */}
            <View style={styles.excelSheetContainer}>
              <View style={styles.excelSheetHeader}>
                <View>
                  <Text style={styles.excelSheetTitle}>Receipt & Payment Statement</Text>
                  <Text style={styles.excelSheetSub}>
                    Financial Year: {rpData?.financial_year || '2026-2027'} · Period: {fromDate} {fromDate !== toDate ? `to ${toDate}` : ''}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {/* Interactive Zoom System Controls */}
                  <View style={styles.zoomControlWrap}>
                    <Text style={styles.zoomLabel}>Zoom:</Text>
                    <TouchableOpacity
                      style={styles.zoomBtn}
                      onPress={() => setTableZoom((z) => Math.max(60, z - 10))}
                    >
                      <Text style={styles.zoomBtnText}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.zoomResetBtn}
                      onPress={() => setTableZoom(100)}
                    >
                      <Text style={styles.zoomResetText}>{tableZoom}%</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.zoomBtn}
                      onPress={() => setTableZoom((z) => Math.min(150, z + 10))}
                    >
                      <Text style={styles.zoomBtnText}>＋</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Collapse Statement Table Button */}
                  <TouchableOpacity
                    style={styles.collapseStatementBtn}
                    onPress={() => setStatementCollapsed(!statementCollapsed)}
                  >
                    <Text style={styles.collapseStatementText}>
                      {statementCollapsed ? '▼ Show Statement Table' : '▲ Collapse Table'}
                    </Text>
                  </TouchableOpacity>

                  {rpData && (
                    <View style={styles.excelBadgeWrap}>
                      <Text style={styles.excelBadgeText}>✓ Live Accounts Verified</Text>
                    </View>
                  )}
                </View>
              </View>

              {!statementCollapsed && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  style={styles.tableScrollView}
                  contentContainerStyle={styles.tableScrollContent}
                >
                <View style={[styles.excelTable, Platform.OS === 'web' && ({ zoom: tableZoom / 100 } as any)]}>
                  {/* Excel Column Headers: Soft Sky Blue (#cfe2ff), bold 15px, 100% full-width flex cells */}
                  <View style={styles.excelHeaderRow}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[styles.excelThCell, styles.excelColAccount]}
                      onPress={() => handleAccountClick(null)}
                    >
                      <Text style={styles.excelThText}>Cash</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[styles.excelThCell, styles.excelColNum]}
                      onPress={() => handleClosingBalanceClick(null)}
                    >
                      <Text style={styles.excelThText}>Opening Balance</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[
                        styles.excelThCell,
                        styles.excelColNum,
                        statementTypeFilter === 'receipt' && styles.excelThActiveReceipt,
                      ]}
                      onPress={() => handleReceiptClick(null)}
                    >
                      <Text style={[styles.excelThText, statementTypeFilter === 'receipt' && styles.excelThTextActiveReceipt]}>
                        Receipt {statementTypeFilter === 'receipt' ? '●' : ''}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[
                        styles.excelThCell,
                        styles.excelColNum,
                        statementTypeFilter === 'payment' && styles.excelThActivePayment,
                      ]}
                      onPress={() => handlePaymentClick(null)}
                    >
                      <Text style={[styles.excelThText, statementTypeFilter === 'payment' && styles.excelThTextActivePayment]}>
                        Payment {statementTypeFilter === 'payment' ? '●' : ''}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[
                        styles.excelThCell,
                        styles.excelColNum,
                        { borderRightWidth: 0 },
                        statementTypeFilter === 'all' && styles.excelThActiveAll,
                      ]}
                      onPress={() => handleClosingBalanceClick(null)}
                    >
                      <Text style={[styles.excelThText, statementTypeFilter === 'all' && styles.excelThTextActiveAll]}>
                        Closing Balance
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Account Rows: Alternating White & Pink (#f2ceef) */}
                  {(rpData?.rows || []).map((row: any, idx: number) => {
                    const isSelected = rpSelectedAccount === row.account_id;
                    const hasTxns = (row.transaction_count || 0) > 0;
                    const isPinkRow = idx % 2 === 1;
                    return (
                      <View
                        key={row.account_id || idx}
                        style={[
                          styles.excelDataRow,
                          isPinkRow ? styles.excelRowPink : styles.excelRowWhite,
                          isSelected && styles.excelRowSelected,
                        ]}
                      >
                        {/* Account Name */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleAccountClick(row)}
                          style={[styles.excelTdCell, styles.excelColAccount, isPinkRow ? styles.excelAccountCellPink : styles.excelAccountCellWhite]}
                        >
                          <Text style={styles.excelAccountText}>
                            {formatTitleCase(row.account_name)}
                          </Text>
                          {hasTxns && (
                            <Text style={styles.excelTxnCountBadge}>
                              {row.transaction_count} txn{row.transaction_count > 1 ? 's' : ''}
                            </Text>
                          )}
                        </TouchableOpacity>

                        {/* Opening Balance */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleAccountClick(row)}
                          style={[styles.excelTdCell, styles.excelColNum, isPinkRow && styles.excelTdPink]}
                        >
                          <Text style={[styles.excelNumText, { textAlign: 'right' }]}>
                            {row.opening_balance ? fmtNumber(row.opening_balance) : '-'}
                          </Text>
                        </TouchableOpacity>

                        {/* Receipt */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleReceiptClick(row)}
                          style={[
                            styles.excelTdCell,
                            styles.excelColNum,
                            isPinkRow && styles.excelTdPink,
                            statementTypeFilter === 'receipt' && isSelected && styles.excelCellSelectedReceipt,
                          ]}
                        >
                          <Text style={[styles.excelNumText, row.receipt > 0 && styles.excelGreenNum, statementTypeFilter === 'receipt' && isSelected && styles.bold, { textAlign: 'right' }]}>
                            {row.receipt ? fmtNumber(row.receipt) : '-'}
                          </Text>
                        </TouchableOpacity>

                        {/* Payment */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handlePaymentClick(row)}
                          style={[
                            styles.excelTdCell,
                            styles.excelColNum,
                            isPinkRow && styles.excelTdPink,
                            statementTypeFilter === 'payment' && isSelected && styles.excelCellSelectedPayment,
                          ]}
                        >
                          <Text style={[styles.excelNumText, row.payment > 0 && styles.excelRedNum, statementTypeFilter === 'payment' && isSelected && styles.bold, { textAlign: 'right' }]}>
                            {row.payment ? fmtNumber(row.payment) : '-'}
                          </Text>
                        </TouchableOpacity>

                        {/* Closing Balance */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleClosingBalanceClick(row)}
                          style={[styles.excelTdCell, styles.excelColNum, isPinkRow && styles.excelTdPink, { borderRightWidth: 0 }]}
                        >
                          <Text style={[styles.excelNumText, styles.excelBoldNum, { textAlign: 'right' }]}>
                            {row.closing_balance ? fmtNumber(row.closing_balance) : '-'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {/* Total Row: Row 6 is odd index 5 => Pink (#f2ceef) */}
                  {rpData?.total && (
                    <View style={styles.excelTotalRow}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleClosingBalanceClick(null)}
                        style={[styles.excelTdCell, styles.excelColAccount, styles.excelTotalBg]}
                      >
                        <Text style={styles.excelTotalLabel}>Total</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleClosingBalanceClick(null)}
                        style={[styles.excelTdCell, styles.excelColNum, styles.excelTotalBg]}
                      >
                        <Text style={[styles.excelTotalVal, { textAlign: 'right' }]}>
                          {fmtNumber(rpData.total.opening_balance)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleReceiptClick(null)}
                        style={[
                          styles.excelTdCell,
                          styles.excelColNum,
                          styles.excelTotalBg,
                          statementTypeFilter === 'receipt' && styles.excelCellSelectedReceipt,
                        ]}
                      >
                        <Text style={[styles.excelTotalVal, styles.excelGreenNum, statementTypeFilter === 'receipt' && styles.bold, { textAlign: 'right' }]}>
                          {fmtNumber(rpData.total.receipt)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handlePaymentClick(null)}
                        style={[
                          styles.excelTdCell,
                          styles.excelColNum,
                          styles.excelTotalBg,
                          statementTypeFilter === 'payment' && styles.excelCellSelectedPayment,
                        ]}
                      >
                        <Text style={[styles.excelTotalVal, styles.excelRedNum, statementTypeFilter === 'payment' && styles.bold, { textAlign: 'right' }]}>
                          {fmtNumber(rpData.total.payment)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleClosingBalanceClick(null)}
                        style={[styles.excelTdCell, styles.excelColNum, styles.excelTotalBg, { borderRightWidth: 0 }]}
                      >
                        <Text style={[styles.excelTotalVal, styles.excelBoldNum, { textAlign: 'right' }]}>
                          {fmtNumber(rpData.total.closing_balance)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {!rpData && !rpLoading && (
                    <View style={styles.excelEmptyWrap}>
                      <Text style={styles.excelEmptyText}>
                        Select date and click "Search Statement" to load data from Al-Ameen Accounts.
                      </Text>
                    </View>
                  )}

                  {rpLoading && (
                    <View style={styles.excelEmptyWrap}>
                      <Text style={styles.excelEmptyText}>
                        ⏳ Connecting to Cash Book and Bank Books... Please wait.
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
              )}
            </View>

            {/* DETAILED TRANSACTIONS SECTION (FROM SCREENSHOT 2 & 4) */}
            {rpData && (
              <View style={styles.txnsContainer}>
                <View style={styles.txnsHeaderRow}>
                  <View>
                    <Text style={styles.txnsTitle}>
                      {rpSelectedAccount
                        ? `Detailed Transactions for ${rpData.rows.find((r: any) => r.account_id === rpSelectedAccount)?.account_name || 'Selected Account'}`
                        : 'Detailed Transactions (All Accounts Combined)'}
                      {statementTypeFilter === 'payment'
                        ? ' · 💳 Payments Only'
                        : statementTypeFilter === 'receipt'
                        ? ' · 💰 Receipts Only'
                        : ''}
                    </Text>
                    <Text style={styles.txnsSub}>
                      {activeAccountTransactions.length} transaction(s) displayed
                      {rpSelectedAccount ? ' (Filtered by account)' : ''}
                      {statementTypeFilter === 'payment' ? ' (Showing Payments Only)' : statementTypeFilter === 'receipt' ? ' (Showing Receipts Only)' : ' (Showing All Receipts & Payments)'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* View Height / Box Size Controller */}
                    <View style={styles.viewModeToggleWrap}>
                      <Text style={styles.viewModeLabel}>Box Height:</Text>
                      <TouchableOpacity
                        style={[styles.viewModeBtn, txnsBoxHeight === 'large' && styles.viewModeBtnActive]}
                        onPress={() => setTxnsBoxHeight('large')}
                      >
                        <Text style={[styles.viewModeBtnText, txnsBoxHeight === 'large' && styles.viewModeBtnTextActive]}>
                          Large (বড়)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.viewModeBtn, txnsBoxHeight === 'full' && styles.viewModeBtnActive]}
                        onPress={() => setTxnsBoxHeight('full')}
                      >
                        <Text style={[styles.viewModeBtnText, txnsBoxHeight === 'full' && styles.viewModeBtnTextActive]}>
                          ⛶ Full (সব দেখুন)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.viewModeBtn, txnsBoxHeight === 'normal' && styles.viewModeBtnActive]}
                        onPress={() => setTxnsBoxHeight('normal')}
                      >
                        <Text style={[styles.viewModeBtnText, txnsBoxHeight === 'normal' && styles.viewModeBtnTextActive]}>
                          Compact
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TextInput
                      style={styles.txnsSearchInput}
                      placeholder="Quick search across all columns..."
                      value={rpTxnFilter}
                      onChangeText={setRpTxnFilter}
                    />
                    {isAnyFilterActive && (
                      <TouchableOpacity style={styles.clearAllBtn} onPress={handleClearAllFilters}>
                        <Text style={styles.clearAllBtnText}>✕ Reset All Filters</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Active Filter Badges Toolbar */}
                {isAnyFilterActive && (
                  <View style={styles.activeFiltersRow}>
                    <Text style={styles.activeFiltersLabel}>Active Filters:</Text>
                    {statementTypeFilter !== 'all' && (
                      <View style={[styles.filterChip, statementTypeFilter === 'payment' ? { backgroundColor: '#fee2e2', borderColor: '#fca5a5' } : { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
                        <Text style={[styles.filterChipText, statementTypeFilter === 'payment' ? { color: '#b91c1c', fontWeight: '900' } : { color: '#15803d', fontWeight: '900' }]}>
                          Type: {statementTypeFilter === 'payment' ? '💳 Payments Only' : '💰 Receipts Only'}
                        </Text>
                        <TouchableOpacity onPress={() => setStatementTypeFilter('all')}>
                          <Text style={styles.filterChipClose}>✕ Show All</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterAccount !== 'all' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>Account: {filterAccount}</Text>
                        <TouchableOpacity onPress={() => { setFilterAccount('all'); setRpSelectedAccount(null); }}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterDate !== 'all' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>Date: {filterDate}</Text>
                        <TouchableOpacity onPress={() => setFilterDate('all')}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterParticulars !== '' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>Ledger: "{filterParticulars}"</Text>
                        <TouchableOpacity onPress={() => setFilterParticulars('')}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterNarration !== '' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>Narration: "{filterNarration}"</Text>
                        <TouchableOpacity onPress={() => setFilterNarration('')}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterVchType !== 'all' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>Vch Type: {filterVchType}</Text>
                        <TouchableOpacity onPress={() => setFilterVchType('all')}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterVchNo !== '' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>Vch No: {filterVchNo}</Text>
                        <TouchableOpacity onPress={() => setFilterVchNo('')}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterReceipt !== 'all' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>
                          Receipt: {filterReceipt === 'custom' ? filterReceiptCustom : filterReceipt.replace('has_receipt', 'Receipts Only').replace('gt_', '> ')}
                        </Text>
                        <TouchableOpacity onPress={() => { setFilterReceipt('all'); setFilterReceiptCustom(''); }}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {filterPayment !== 'all' && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>
                          Payment: {filterPayment === 'custom' ? filterPaymentCustom : filterPayment.replace('has_payment', 'Payments Only').replace('gt_', '> ')}
                        </Text>
                        <TouchableOpacity onPress={() => { setFilterPayment('all'); setFilterPaymentCustom(''); }}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {colSortField !== null && (
                      <View style={styles.filterChip}>
                        <Text style={styles.filterChipText}>
                          Sort: {colSortField === 'account_name' ? 'Account' : colSortField} ({colSortOrder.toUpperCase()})
                        </Text>
                        <TouchableOpacity onPress={() => setColSortField(null)}>
                          <Text style={styles.filterChipClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  style={styles.tableScrollView}
                  contentContainerStyle={styles.tableScrollContent}
                >
                  <View style={[styles.txnsTable, Platform.OS === 'web' && ({ zoom: tableZoom / 100 } as any)]}>
                    <ScrollView
                      style={[
                        styles.txnsTableVerticalScroll,
                        txnsBoxHeight === 'large' && styles.txnsScrollLarge,
                        txnsBoxHeight === 'full' && styles.txnsScrollFull,
                      ]}
                      contentContainerStyle={styles.txnsTableVerticalScrollContent}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                      stickyHeaderIndices={[0]}
                    >
                      {/* Header Row with Excel AutoFilter Carets ▼ */}
                      <View style={styles.txnsHeadRow}>
                      <View style={[styles.txnsThCell, styles.colTxnNum]}>
                        <Text style={styles.txnsThText}>#</Text>
                      </View>

                      {/* Account Column Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnAccount,
                          (filterAccount !== 'all' || colSortField === 'account_name' || rpSelectedAccount) && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('account')}
                      >
                        <Text style={styles.txnsThText}>Account</Text>
                        <View style={[styles.filterCaret, (filterAccount !== 'all' || colSortField === 'account_name' || rpSelectedAccount) && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterAccount !== 'all' || colSortField === 'account_name' || rpSelectedAccount) && styles.filterCaretTextActive]}>
                            {colSortField === 'account_name' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Date Column Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnDate,
                          (filterDate !== 'all' || colSortField === 'date') && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('date')}
                      >
                        <Text style={styles.txnsThText}>Date</Text>
                        <View style={[styles.filterCaret, (filterDate !== 'all' || colSortField === 'date') && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterDate !== 'all' || colSortField === 'date') && styles.filterCaretTextActive]}>
                            {colSortField === 'date' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Particulars / Ledger Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnParticulars,
                          (filterParticulars !== '' || colSortField === 'particulars') && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('particulars')}
                      >
                        <Text style={styles.txnsThText}>Particulars / Ledger</Text>
                        <View style={[styles.filterCaret, (filterParticulars !== '' || colSortField === 'particulars') && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterParticulars !== '' || colSortField === 'particulars') && styles.filterCaretTextActive]}>
                            {colSortField === 'particulars' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Narration Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnNarration,
                          (filterNarration !== '' || colSortField === 'narration') && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('narration')}
                      >
                        <Text style={styles.txnsThText}>Narration</Text>
                        <View style={[styles.filterCaret, (filterNarration !== '' || colSortField === 'narration') && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterNarration !== '' || colSortField === 'narration') && styles.filterCaretTextActive]}>
                            {colSortField === 'narration' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Voucher Type Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnVchType,
                          (filterVchType !== 'all' || colSortField === 'vch_type') && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('vch_type')}
                      >
                        <Text style={styles.txnsThText}>Vch Type</Text>
                        <View style={[styles.filterCaret, (filterVchType !== 'all' || colSortField === 'vch_type') && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterVchType !== 'all' || colSortField === 'vch_type') && styles.filterCaretTextActive]}>
                            {colSortField === 'vch_type' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Voucher No Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnVchNo,
                          (filterVchNo !== '' || colSortField === 'vch_no') && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('vch_no')}
                      >
                        <Text style={styles.txnsThText}>Vch No</Text>
                        <View style={[styles.filterCaret, (filterVchNo !== '' || colSortField === 'vch_no') && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterVchNo !== '' || colSortField === 'vch_no') && styles.filterCaretTextActive]}>
                            {colSortField === 'vch_no' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Receipt (Debit) Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnAmount,
                          (filterReceipt !== 'all' || colSortField === 'receipt') && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('receipt')}
                      >
                        <Text style={styles.txnsThText}>Receipt (Debit)</Text>
                        <View style={[styles.filterCaret, (filterReceipt !== 'all' || colSortField === 'receipt') && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterReceipt !== 'all' || colSortField === 'receipt') && styles.filterCaretTextActive]}>
                            {colSortField === 'receipt' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Payment (Credit) Dropdown */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.txnsThBtn,
                          styles.colTxnAmount,
                          { borderRightWidth: 0 },
                          (filterPayment !== 'all' || colSortField === 'payment') && styles.thActiveFilter,
                        ]}
                        onPress={() => setFilterModalCol('payment')}
                      >
                        <Text style={styles.txnsThText}>Payment (Credit)</Text>
                        <View style={[styles.filterCaret, (filterPayment !== 'all' || colSortField === 'payment') && styles.filterCaretActive]}>
                          <Text style={[styles.filterCaretText, (filterPayment !== 'all' || colSortField === 'payment') && styles.filterCaretTextActive]}>
                            {colSortField === 'payment' ? (colSortOrder === 'asc' ? '▲' : '▼') : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    {activeAccountTransactions.map((t: any, index: number) => {
                      const isReceipt = Number(t.receipt || 0) > 0;
                      const isPayment = Number(t.payment || 0) > 0;
                      return (
                        <View
                          key={`${t.vch_no}_${index}`}
                          style={[styles.txnsDataRow, index % 2 === 1 && styles.txnsDataRowAlt]}
                        >
                          <View style={[styles.txnsTdCell, styles.colTxnNum, { alignItems: 'center' }]}>
                            <Text style={styles.txnsTdText}>{index + 1}</Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnAccount]}>
                            <Text style={[styles.txnsTdText, styles.bold]}>{t.account_name}</Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnDate]}>
                            <Text style={styles.txnsTdText}>{t.date}</Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnParticulars]}>
                            <Text style={styles.txnsTdText} numberOfLines={2}>
                              {t.particulars || '-'}
                            </Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnNarration]}>
                            <Text style={styles.txnsTdText} numberOfLines={2}>
                              {t.narration || '-'}
                            </Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnVchType]}>
                            <Text style={styles.txnsTdText}>{t.vch_type || '-'}</Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnVchNo]}>
                            <Text style={[styles.txnsTdText, styles.bold]}>{t.vch_no || '-'}</Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnAmount]}>
                            <Text
                              style={[
                                styles.txnsTdText,
                                { textAlign: 'right' },
                                isReceipt && { color: '#16a34a', fontWeight: '800' },
                              ]}
                            >
                              {isReceipt ? fmtNumber(t.receipt) : '-'}
                            </Text>
                          </View>
                          <View style={[styles.txnsTdCell, styles.colTxnAmount, { borderRightWidth: 0 }]}>
                            <Text
                              style={[
                                styles.txnsTdText,
                                { textAlign: 'right' },
                                isPayment && { color: '#dc2626', fontWeight: '800' },
                              ]}
                            >
                              {isPayment ? fmtNumber(t.payment) : '-'}
                            </Text>
                          </View>
                        </View>
                      );
                    })}

                    {activeAccountTransactions.length === 0 && (
                      <View style={styles.txnsEmptyWrap}>
                        <Text style={styles.txnsEmptyText}>
                          No transactions found for the selected account in this date range.
                        </Text>
                      </View>
                    )}
                    </ScrollView>
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB 2: FEES COLLECTION REPORT (STUDENTS COLLECTION)       */}
        {/* ========================================================= */}
        {activeTab === 'fees_collection' && (
          <View style={styles.tabContentContainer}>
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

            {/* Table Heading & Filter */}
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
          </View>
        )}

        {/* Portal Configuration Modal - Super Admin Only */}
        {isSuperAdmin && (
          <Modal visible={settingsOpen} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>Al-Ameen Accounts Portal Configuration</Text>
                <Text style={styles.modalSub}>
                  Connect to Al-Ameen Mission Accounts to fetch live Cash Book, Bank Books, and Fees reports for Memari branch.
                </Text>

                <Text style={styles.inputLabel}>Portal Site URL</Text>
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
        )}

        {/* Column Filter & Sort Modal Dialog (Excel AutoFilter ▼) */}
        {!!filterModalCol && (
          <Modal visible={!!filterModalCol} transparent animationType="fade">
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setFilterModalCol(null)}
              style={styles.filterModalOverlay}
            >
              <TouchableOpacity
                activeOpacity={1}
                style={styles.filterModalCard}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.filterModalHeader}>
                  <Text style={styles.filterModalTitle}>
                    Filter & Sort:{' '}
                    {filterModalCol === 'account'
                      ? 'Account'
                      : filterModalCol === 'date'
                      ? 'Date'
                      : filterModalCol === 'particulars'
                      ? 'Particulars / Ledger'
                      : filterModalCol === 'narration'
                      ? 'Narration'
                      : filterModalCol === 'vch_type'
                      ? 'Voucher Type'
                      : filterModalCol === 'vch_no'
                      ? 'Voucher No'
                      : filterModalCol === 'receipt'
                      ? 'Receipt (Debit)'
                      : 'Payment (Credit)'}
                  </Text>
                  <TouchableOpacity onPress={() => setFilterModalCol(null)} style={styles.filterModalClose}>
                    <Text style={styles.filterModalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Sort Actions */}
                <View style={styles.sortSection}>
                  <Text style={styles.sortSectionTitle}>SORTING</Text>
                  <View style={styles.sortBtnsRow}>
                    <TouchableOpacity
                      style={[
                        styles.sortBtn,
                        colSortField === (filterModalCol === 'account' ? 'account_name' : filterModalCol) &&
                          colSortOrder === 'asc' &&
                          styles.sortBtnActive,
                      ]}
                      onPress={() => {
                        setColSortField((filterModalCol === 'account' ? 'account_name' : filterModalCol) as any);
                        setColSortOrder('asc');
                      }}
                    >
                      <Text
                        style={[
                          styles.sortBtnText,
                          colSortField === (filterModalCol === 'account' ? 'account_name' : filterModalCol) &&
                            colSortOrder === 'asc' &&
                            styles.sortBtnTextActive,
                        ]}
                      >
                        {filterModalCol === 'date'
                          ? '↑ Oldest First'
                          : filterModalCol === 'vch_no' || filterModalCol === 'receipt' || filterModalCol === 'payment'
                          ? '↑ Smallest to Largest'
                          : '↑ Sort A → Z'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.sortBtn,
                        colSortField === (filterModalCol === 'account' ? 'account_name' : filterModalCol) &&
                          colSortOrder === 'desc' &&
                          styles.sortBtnActive,
                      ]}
                      onPress={() => {
                        setColSortField((filterModalCol === 'account' ? 'account_name' : filterModalCol) as any);
                        setColSortOrder('desc');
                      }}
                    >
                      <Text
                        style={[
                          styles.sortBtnText,
                          colSortField === (filterModalCol === 'account' ? 'account_name' : filterModalCol) &&
                            colSortOrder === 'desc' &&
                            styles.sortBtnTextActive,
                        ]}
                      >
                        {filterModalCol === 'date'
                          ? '↓ Newest First'
                          : filterModalCol === 'vch_no' || filterModalCol === 'receipt' || filterModalCol === 'payment'
                          ? '↓ Largest to Smallest'
                          : '↓ Sort Z → A'}
                      </Text>
                    </TouchableOpacity>

                    {colSortField === (filterModalCol === 'account' ? 'account_name' : filterModalCol) && (
                      <TouchableOpacity
                        style={styles.sortClearBtn}
                        onPress={() => setColSortField(null)}
                      >
                        <Text style={styles.sortClearBtnText}>Clear Sort</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Filter Section */}
                <View style={styles.filterBody}>
                  <Text style={styles.sortSectionTitle}>FILTER VALUES</Text>

                  {/* Account Filter */}
                  {filterModalCol === 'account' && (
                    <ScrollView style={{ maxHeight: 220 }}>
                      <TouchableOpacity
                        style={[
                          styles.filterOptionItem,
                          !rpSelectedAccount && filterAccount === 'all' && styles.filterOptionSelected,
                        ]}
                        onPress={() => {
                          setFilterAccount('all');
                          setRpSelectedAccount(null);
                        }}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            !rpSelectedAccount && filterAccount === 'all' && styles.filterOptionTextBold,
                          ]}
                        >
                          {!rpSelectedAccount && filterAccount === 'all' ? '✓ ' : '○ '}All Accounts ({baseTransactions.length})
                        </Text>
                      </TouchableOpacity>

                      {uniqueAccounts.map((accName) => {
                        const isSelected =
                          filterAccount === accName ||
                          (rpSelectedAccount &&
                            rpData?.rows.find((r: any) => r.account_id === rpSelectedAccount)?.account_name === accName);
                        const count = baseTransactions.filter((t) => t.account_name === accName).length;
                        return (
                          <TouchableOpacity
                            key={accName}
                            style={[styles.filterOptionItem, isSelected && styles.filterOptionSelected]}
                            onPress={() => {
                              setFilterAccount(accName);
                              const matchingRow = rpData?.rows.find((r: any) => r.account_name === accName);
                              if (matchingRow) setRpSelectedAccount(matchingRow.account_id);
                            }}
                          >
                            <Text style={[styles.filterOptionText, isSelected && styles.filterOptionTextBold]}>
                              {isSelected ? '✓ ' : '○ '}
                              {formatTitleCase(accName)} ({count})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Date Filter */}
                  {filterModalCol === 'date' && (
                    <ScrollView style={{ maxHeight: 220 }}>
                      <TouchableOpacity
                        style={[styles.filterOptionItem, filterDate === 'all' && styles.filterOptionSelected]}
                        onPress={() => setFilterDate('all')}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            filterDate === 'all' && styles.filterOptionTextBold,
                          ]}
                        >
                          {filterDate === 'all' ? '✓ ' : '○ '}All Dates ({baseTransactions.length})
                        </Text>
                      </TouchableOpacity>
                      {uniqueDates.map(([dt, cnt]) => {
                        const isSelected = filterDate === dt;
                        return (
                          <TouchableOpacity
                            key={dt}
                            style={[styles.filterOptionItem, isSelected && styles.filterOptionSelected]}
                            onPress={() => setFilterDate(dt)}
                          >
                            <Text style={[styles.filterOptionText, isSelected && styles.filterOptionTextBold]}>
                              {isSelected ? '✓ ' : '○ '}
                              {dt} ({cnt} txns)
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Particulars / Ledger Filter */}
                  {filterModalCol === 'particulars' && (
                    <View>
                      <TextInput
                        style={styles.filterSearchInput}
                        placeholder="Search ledger keyword..."
                        value={filterParticulars}
                        onChangeText={setFilterParticulars}
                      />
                      <ScrollView style={{ maxHeight: 180, marginTop: 8 }}>
                        <TouchableOpacity
                          style={[styles.filterOptionItem, !filterParticulars && styles.filterOptionSelected]}
                          onPress={() => setFilterParticulars('')}
                        >
                          <Text
                            style={[
                              styles.filterOptionText,
                              !filterParticulars && styles.filterOptionTextBold,
                            ]}
                          >
                            {!filterParticulars ? '✓ ' : '○ '}All Ledgers
                          </Text>
                        </TouchableOpacity>
                        {uniqueLedgers.slice(0, 30).map(([led, cnt]) => (
                          <TouchableOpacity
                            key={led}
                            style={[
                              styles.filterOptionItem,
                              filterParticulars.toLowerCase() === led.toLowerCase() && styles.filterOptionSelected,
                            ]}
                            onPress={() => setFilterParticulars(led)}
                          >
                            <Text
                              style={[
                                styles.filterOptionText,
                                filterParticulars.toLowerCase() === led.toLowerCase() && styles.filterOptionTextBold,
                              ]}
                              numberOfLines={1}
                            >
                              {filterParticulars.toLowerCase() === led.toLowerCase() ? '✓ ' : '○ '}
                              {led} ({cnt})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Narration Filter */}
                  {filterModalCol === 'narration' && (
                    <View>
                      <TextInput
                        style={styles.filterSearchInput}
                        placeholder="Search keywords in narration..."
                        value={filterNarration}
                        onChangeText={setFilterNarration}
                      />
                      {filterNarration ? (
                        <TouchableOpacity
                          style={{ marginTop: 8 }}
                          onPress={() => setFilterNarration('')}
                        >
                          <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 12 }}>
                            Clear narration filter
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}

                  {/* Voucher Type Filter */}
                  {filterModalCol === 'vch_type' && (
                    <ScrollView style={{ maxHeight: 200 }}>
                      <TouchableOpacity
                        style={[styles.filterOptionItem, filterVchType === 'all' && styles.filterOptionSelected]}
                        onPress={() => setFilterVchType('all')}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            filterVchType === 'all' && styles.filterOptionTextBold,
                          ]}
                        >
                          {filterVchType === 'all' ? '✓ ' : '○ '}All Voucher Types
                        </Text>
                      </TouchableOpacity>
                      {uniqueVchTypes.map((vt) => {
                        const isSelected = filterVchType.toLowerCase() === vt.toLowerCase();
                        const cnt = baseTransactions.filter(
                          (t) => String(t.vch_type || '').toLowerCase() === vt.toLowerCase()
                        ).length;
                        return (
                          <TouchableOpacity
                            key={vt}
                            style={[styles.filterOptionItem, isSelected && styles.filterOptionSelected]}
                            onPress={() => setFilterVchType(vt)}
                          >
                            <Text style={[styles.filterOptionText, isSelected && styles.filterOptionTextBold]}>
                              {isSelected ? '✓ ' : '○ '}
                              {vt} ({cnt})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Voucher No Filter */}
                  {filterModalCol === 'vch_no' && (
                    <View>
                      <TextInput
                        style={styles.filterSearchInput}
                        placeholder="Enter voucher number..."
                        value={filterVchNo}
                        onChangeText={setFilterVchNo}
                        keyboardType="numeric"
                      />
                      {filterVchNo ? (
                        <TouchableOpacity
                          style={{ marginTop: 8 }}
                          onPress={() => setFilterVchNo('')}
                        >
                          <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 12 }}>
                            Clear voucher number filter
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}

                  {/* Receipt (Debit) Filter */}
                  {filterModalCol === 'receipt' && (
                    <View style={{ gap: 6 }}>
                      {[
                        { key: 'all', label: 'All Transactions' },
                        { key: 'has_receipt', label: 'Receipts Only (> ₹0)' },
                        { key: 'no_receipt', label: 'Payments Only (₹0 Receipt)' },
                        { key: 'gt_1000', label: 'Above ₹1,000' },
                        { key: 'gt_5000', label: 'Above ₹5,000' },
                        { key: 'gt_10000', label: 'Above ₹10,000' },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.filterOptionItem,
                            filterReceipt === opt.key && styles.filterOptionSelected,
                          ]}
                          onPress={() => setFilterReceipt(opt.key)}
                        >
                          <Text
                            style={[
                              styles.filterOptionText,
                              filterReceipt === opt.key && styles.filterOptionTextBold,
                            ]}
                          >
                            {filterReceipt === opt.key ? '✓ ' : '○ '}{opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <View style={{ marginTop: 8 }}>
                        <TextInput
                          style={styles.filterSearchInput}
                          placeholder="Or enter specific receipt amount..."
                          value={filterReceiptCustom}
                          onChangeText={(v) => {
                            setFilterReceiptCustom(v);
                            if (v.trim()) setFilterReceipt('custom');
                          }}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  )}

                  {/* Payment (Credit) Filter */}
                  {filterModalCol === 'payment' && (
                    <View style={{ gap: 6 }}>
                      {[
                        { key: 'all', label: 'All Transactions' },
                        { key: 'has_payment', label: 'Payments Only (> ₹0)' },
                        { key: 'no_payment', label: 'Receipts Only (₹0 Payment)' },
                        { key: 'gt_1000', label: 'Above ₹1,000' },
                        { key: 'gt_5000', label: 'Above ₹5,000' },
                        { key: 'gt_10000', label: 'Above ₹10,000' },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.filterOptionItem,
                            filterPayment === opt.key && styles.filterOptionSelected,
                          ]}
                          onPress={() => setFilterPayment(opt.key)}
                        >
                          <Text
                            style={[
                              styles.filterOptionText,
                              filterPayment === opt.key && styles.filterOptionTextBold,
                            ]}
                          >
                            {filterPayment === opt.key ? '✓ ' : '○ '}{opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <View style={{ marginTop: 8 }}>
                        <TextInput
                          style={styles.filterSearchInput}
                          placeholder="Or enter specific payment amount..."
                          value={filterPaymentCustom}
                          onChangeText={(v) => {
                            setFilterPaymentCustom(v);
                            if (v.trim()) setFilterPayment('custom');
                          }}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  )}
                </View>

                {/* Modal Actions */}
                <View style={styles.filterModalFooter}>
                  <TouchableOpacity
                    style={styles.filterResetColBtn}
                    onPress={() => {
                      if (filterModalCol === 'account') {
                        setFilterAccount('all');
                        setRpSelectedAccount(null);
                      }
                      if (filterModalCol === 'date') setFilterDate('all');
                      if (filterModalCol === 'particulars') setFilterParticulars('');
                      if (filterModalCol === 'narration') setFilterNarration('');
                      if (filterModalCol === 'vch_type') setFilterVchType('all');
                      if (filterModalCol === 'vch_no') setFilterVchNo('');
                      if (filterModalCol === 'receipt') {
                        setFilterReceipt('all');
                        setFilterReceiptCustom('');
                      }
                      if (filterModalCol === 'payment') {
                        setFilterPayment('all');
                        setFilterPaymentCustom('');
                      }
                      if (colSortField === (filterModalCol === 'account' ? 'account_name' : filterModalCol)) {
                        setColSortField(null);
                      }
                    }}
                  >
                    <Text style={styles.filterResetColText}>Reset This Column</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.filterDoneBtn}
                    onPress={() => setFilterModalCol(null)}
                  >
                    <Text style={styles.filterDoneBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 12, flexWrap: 'wrap' },
  backButton: { backgroundColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  backText: { color: '#0f172a', fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  subTitle: { fontSize: 13, color: '#64748b', fontWeight: '700', marginTop: 2 },
  settingsButton: { backgroundColor: '#0284c7', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  settingsButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Primary Tab Bar
  tabNav: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 4,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  tabBtnActive: {
    backgroundColor: '#0d6efd',
  },
  tabBtnText: {
    color: '#334155',
    fontWeight: '800',
    fontSize: 14,
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },

  tabContentContainer: {
    gap: 16,
  },

  // Filter Card
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
    backgroundColor: '#0d6efd',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  todayButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#94a3b8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  todayText: { color: '#0f172a', fontWeight: '800' },
  exportBtn: {
    backgroundColor: '#198754', // Excel green
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  exportBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  printBtn: {
    backgroundColor: '#475569',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  printBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  disabledBtn: { opacity: 0.6 },
  white: { color: '#fff', fontWeight: '900' },

  // Receipt & Payment Cards
  rpCardsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  rpCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  rpCardLabel: { color: '#64748b', fontWeight: '800', fontSize: 12 },
  rpCardValue: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  rpCardHint: { color: '#94a3b8', fontSize: 11, fontWeight: '700', marginTop: 2 },

  // EXCEL TABLE STYLING MATCHING SCREENSHOT 5
  excelSheetContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#90a4ae',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  excelSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    flexWrap: 'wrap',
    gap: 8,
  },
  excelSheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  excelSheetSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 2,
  },
  excelBadgeWrap: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  excelBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  collapseStatementBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  collapseStatementText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1d4ed8',
  },

  tableScrollView: {
    width: '100%',
  },
  tableScrollContent: {
    minWidth: '100%',
    flexGrow: 1,
  },
  zoomControlWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 3,
    gap: 4,
  },
  zoomLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    paddingHorizontal: 6,
  },
  zoomBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  zoomResetBtn: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomResetText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1e293b',
  },

  excelTable: {
    width: '100%',
    minWidth: 850,
    borderWidth: 1,
    borderColor: '#000000', // Excel crisp border
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  excelHeaderRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#cfe2ff', // Soft sky blue distinct header color
    borderBottomWidth: 1.5,
    borderBottomColor: '#000000',
  },
  excelThCell: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#000000',
    justifyContent: 'center',
    backgroundColor: '#cfe2ff',
  },
  excelThActiveReceipt: {
    backgroundColor: '#bbf7d0',
    borderBottomWidth: 3,
    borderBottomColor: '#16a34a',
  },
  excelThTextActiveReceipt: {
    color: '#15803d',
    fontWeight: '900',
  },
  excelThActivePayment: {
    backgroundColor: '#fecaca',
    borderBottomWidth: 3,
    borderBottomColor: '#dc2626',
  },
  excelThTextActivePayment: {
    color: '#b91c1c',
    fontWeight: '900',
  },
  excelThActiveAll: {
    backgroundColor: '#bfdbfe',
  },
  excelThTextActiveAll: {
    color: '#1e40af',
  },
  excelCellSelectedReceipt: {
    backgroundColor: '#dcfce7',
    borderWidth: 1.5,
    borderColor: '#16a34a',
  },
  excelCellSelectedPayment: {
    backgroundColor: '#fee2e2',
    borderWidth: 1.5,
    borderColor: '#dc2626',
  },
  rpCardActiveReceipt: {
    borderColor: '#16a34a',
    borderWidth: 2,
    backgroundColor: '#f0fdf4',
  },
  rpCardActivePayment: {
    borderColor: '#dc2626',
    borderWidth: 2,
    backgroundColor: '#fef2f2',
  },
  rpCardActiveAll: {
    borderColor: '#2563eb',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  excelThText: {
    fontWeight: '900',
    color: '#082f49', // Strong distinct header text
    fontSize: 15, // Larger font size ("boro kore din")
    textAlign: 'center',
  },
  excelTh: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontWeight: '900',
    color: '#082f49', // Strong distinct header text
    fontSize: 15, // Larger font size ("boro kore din")
    borderRightWidth: 1,
    borderRightColor: '#000000',
    textAlign: 'center',
    backgroundColor: '#cfe2ff',
  },
  excelDataRow: {
    flexDirection: 'row',
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  excelRowWhite: {
    backgroundColor: '#ffffff',
  },
  excelRowPink: {
    backgroundColor: '#f2ceef', // Exact pink from user screenshot #2
  },
  excelRowSelected: {
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  excelTdCell: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: '#000000',
    justifyContent: 'center',
  },
  excelTd: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#000000',
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  excelTdPink: {
    backgroundColor: '#f2ceef',
  },
  excelTotalBg: {
    backgroundColor: '#f2ceef',
  },
  excelNumText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'right',
    width: '100%',
    fontVariant: ['tabular-nums'],
  },
  excelColAccount: {
    flex: 1.4,
    minWidth: 180,
  },
  excelColNum: {
    flex: 1,
    minWidth: 150,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  excelAccountCellWhite: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  excelAccountCellPink: {
    backgroundColor: '#f2ceef',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  excelAccountText: {
    fontWeight: '800',
    color: '#000000',
    fontSize: 15,
  },
  excelTxnCountBadge: {
    fontSize: 11,
    color: '#0369a1',
    backgroundColor: '#bae6fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
  },
  excelGreenNum: {
    color: '#15803d',
    fontWeight: '800',
  },
  excelRedNum: {
    color: '#b91c1c',
    fontWeight: '800',
  },
  excelBoldNum: {
    fontWeight: '900',
  },

  // Total row matching screenshot 2 (Row 6 is odd index 5 => Pink #f2ceef)
  excelTotalRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#f2ceef',
    borderTopWidth: 2,
    borderTopColor: '#000000',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  excelTotalLabel: {
    fontWeight: '900',
    color: '#000000',
    backgroundColor: '#f2ceef',
    fontSize: 18,
    paddingVertical: 12,
  },
  excelTotalVal: {
    fontWeight: '900',
    color: '#000000',
    backgroundColor: '#f2ceef',
    fontSize: 18,
    paddingVertical: 12,
    textAlign: 'right',
    width: '100%',
    fontVariant: ['tabular-nums'],
  },

  excelEmptyWrap: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  excelEmptyText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 13,
  },

  // DETAILED TRANSACTIONS SECTION
  txnsContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    marginTop: 6,
  },
  txnsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  txnsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  txnsSub: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  txnsSearchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 260,
    fontSize: 12,
  },
  clearAllBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  clearAllBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  activeFiltersLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#475569',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
  },
  filterChipClose: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '900',
  },
  txnsTable: {
    width: '100%',
    minWidth: 920,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  txnsTableVerticalScroll: {
    maxHeight: 540,
    width: '100%',
    ...(Platform.OS === 'web' ? {
      overflowY: 'auto' as any,
    } : {}),
  },
  txnsScrollLarge: {
    maxHeight: 820,
    ...(Platform.OS === 'web' ? {
      maxHeight: '80vh' as any,
      overflowY: 'auto' as any,
    } : {}),
  },
  txnsScrollFull: {
    maxHeight: undefined,
    ...(Platform.OS === 'web' ? {
      maxHeight: 'none' as any,
      overflowY: 'visible' as any,
    } : {}),
  },
  txnsTableVerticalScrollContent: {
    width: '100%',
  },
  viewModeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 3,
    gap: 4,
  },
  viewModeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    paddingHorizontal: 6,
  },
  viewModeBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  viewModeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  viewModeBtnTextActive: {
    color: '#ffffff',
  },
  txnsHeadRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#e2e8f0',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    alignItems: 'stretch',
    ...(Platform.OS === 'web' ? {
      position: 'sticky' as any,
      top: 0,
      zIndex: 10,
    } : {}),
  },
  txnsThCell: {
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  txnsTh: {
    paddingHorizontal: 6,
    paddingVertical: 7,
    fontWeight: '900',
    color: '#1e293b',
    fontSize: 12,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
    justifyContent: 'center',
  },
  txnsThBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
    backgroundColor: '#e2e8f0',
  },
  thActiveFilter: {
    backgroundColor: '#dbeafe',
  },
  txnsThText: {
    fontWeight: '900',
    color: '#1e293b',
    fontSize: 12,
    flexShrink: 1,
  },
  filterCaret: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  filterCaretActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  filterCaretText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#334155',
  },
  filterCaretTextActive: {
    color: '#ffffff',
  },
  txnsDataRow: {
    flexDirection: 'row',
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  txnsDataRowAlt: {
    backgroundColor: '#fdf4fb', // Soft lavender/pink tint matching theme
  },
  txnsTdCell: {
    paddingHorizontal: 6,
    paddingVertical: 5.5,
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
    justifyContent: 'center',
  },
  txnsTdText: {
    fontSize: 12,
    color: '#334155',
  },
  txnsTd: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 12,
    color: '#334155',
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  colTxnNum: {
    width: 36,
    alignItems: 'center',
  },
  colTxnAccount: {
    width: 95,
  },
  colTxnDate: {
    width: 88,
  },
  colTxnParticulars: {
    flex: 1.4,
    minWidth: 160,
  },
  colTxnNarration: {
    flex: 2,
    minWidth: 180,
  },
  colTxnVchType: {
    width: 88,
  },
  colTxnVchNo: {
    width: 88,
  },
  colTxnAmount: {
    width: 120,
  },
  txnsEmptyWrap: {
    padding: 20,
    alignItems: 'center',
  },
  txnsEmptyText: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 12,
  },

  // Column Filter Modal Dialog
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  filterModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  filterModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  filterModalClose: {
    padding: 6,
  },
  filterModalCloseText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '900',
  },
  sortSection: {
    marginBottom: 14,
  },
  sortSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sortBtnsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  sortBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  sortBtnTextActive: {
    color: '#ffffff',
  },
  sortClearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  sortClearBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
  },
  filterBody: {
    marginBottom: 14,
  },
  filterOptionItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterOptionSelected: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },
  filterOptionText: {
    fontSize: 13,
    color: '#334155',
  },
  filterOptionTextBold: {
    fontWeight: '800',
    color: '#1d4ed8',
  },
  filterSearchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    backgroundColor: '#f8fafc',
  },
  filterModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 12,
  },
  filterResetColBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  filterResetColText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 12,
  },
  filterDoneBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  filterDoneBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  // Alert Banner
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

  // Tab 2: Fees Collection Styles
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
