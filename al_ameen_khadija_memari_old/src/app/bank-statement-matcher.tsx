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
import { getToken } from '../lib/auth';

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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDateDisplay = (val: any) => {
  if (!val) return '-';
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}-${m}-${y}`;
  }
  const s = String(val).trim();
  if (!s) return '-';
  if (s.includes('GMT') || s.includes('India Standard Time') || /^[A-Za-z]{3}\s+[A-Za-z]{3}/.test(s)) {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const d = String(parsed.getDate()).padStart(2, '0');
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const y = parsed.getFullYear();
      return `${d}-${m}-${y}`;
    }
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }
  return s;
};

function NavTabLink({
  path,
  style,
  onPress,
  children,
}: {
  path: string;
  style: any;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  if (Platform.OS === 'web') {
    return (
      <a
        href={path}
        onClick={(e: any) => {
          if (e.metaKey || e.ctrlKey || e.button === 1) return;
          e.preventDefault();
          if (onPress) {
            onPress();
          } else {
            router.push(path as any);
          }
        }}
        style={{
          ...StyleSheet.flatten(style),
          display: 'flex',
          boxSizing: 'border-box',
          textDecorationLine: 'none',
          textDecoration: 'none',
          cursor: 'pointer',
        } as any}
      >
        {children}
      </a>
    );
  }
  return (
    <TouchableOpacity
      style={style}
      onPress={() => {
        if (onPress) {
          onPress();
        } else {
          router.push(path as any);
        }
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

export default function BankStatementMatcherScreen() {
  const scrollRef = useRef<any>(null);
  const statementInputRef = useRef<any>(null);
  const billInputRef = useRef<any>(null);
  const masterInputRef = useRef<any>(null);

  // File States
  const [statementFile, setStatementFile] = useState<any>(null);
  const [billFile, setBillFile] = useState<any>(null);
  const [billSource, setBillSource] = useState<'portal' | 'upload'>('portal');
  const [fromDate, setFromDate] = useState<string>(getTodayDate());
  const [toDate, setToDate] = useState<string>(getTodayDate());

  // Master State
  const [masterStatus, setMasterStatus] = useState<any>(null);
  const [masterModalOpen, setMasterModalOpen] = useState<boolean>(false);
  const [uploadingMaster, setUploadingMaster] = useState<boolean>(false);

  // Reconcile State
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'all' | 'matched' | 'unmatched_statement' | 'mismatch_bills'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Saved History & Notes State
  const [pageMode, setPageMode] = useState<'reconcile' | 'history'>('reconcile');
  const [historySearchDate, setHistorySearchDate] = useState<string>('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedHistory, setSavedHistory] = useState<any[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [savingSession, setSavingSession] = useState<boolean>(false);
  const [currentSavedId, setCurrentSavedId] = useState<number | null>(null);

  const filteredSavedHistory = useMemo(() => {
    if (!historySearchDate.trim()) return savedHistory;
    const q = historySearchDate.trim().toLowerCase();
    return savedHistory.filter((item: any) => {
      const title = String(item.batch_title || '').toLowerCase();
      const fDate = String(item.from_date || '').toLowerCase();
      const tDate = String(item.to_date || '').toLowerCase();
      const filename = String(item.statement_filename || '').toLowerCase();
      return title.includes(q) || fDate.includes(q) || tDate.includes(q) || filename.includes(q);
    });
  }, [savedHistory, historySearchDate]);

  useEffect(() => {
    void loadMasterStatus();
    void loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await api('/api/bank-matcher/history');
      if (data?.success) {
        setSavedHistory(data.history || []);
      }
    } catch (err: any) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSaveSession = async () => {
    if (!result) return;
    try {
      setSavingSession(true);
      const payload = {
        id: currentSavedId || undefined,
        statement_filename: statementFile?.name || 'SBI_Statement.xlsx',
        from_date: fromDate,
        to_date: toDate,
        summary: result.summary,
        statement_rows: result.statement_rows,
        matched_rows: result.matched_rows,
        mismatch_rows: result.mismatch_rows,
        notes_map: notes,
        download_token: downloadToken,
      };

      const res = await api('/api/bank-matcher/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res?.success) {
        if (res.id) setCurrentSavedId(res.id);
        Alert.alert('Saved Successfully', 'Reconciled statement and notes have been saved to database. You can review them anytime from Saved History.');
        void loadHistory();
      } else {
        Alert.alert('Save Failed', res?.message || 'Could not save session.');
      }
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save session.');
    } finally {
      setSavingSession(false);
    }
  };

  const handleOpenSavedRecord = async (id: number) => {
    try {
      setLoadingHistory(true);
      const res = await api(`/api/bank-matcher/history/${id}`);
      if (res?.success && res.record) {
        const rec = res.record;
        setResult({
          summary: rec.summary,
          statement_rows: rec.statement_rows,
          matched_rows: rec.matched_rows,
          mismatch_rows: rec.mismatch_rows,
        });
        setNotes(rec.notes_map || {});
        setCurrentSavedId(rec.id);
        if (rec.from_date) setFromDate(rec.from_date);
        if (rec.to_date) setToDate(rec.to_date);
        if (rec.download_token) setDownloadToken(rec.download_token);
        setHistoryModalOpen(false);
        Alert.alert('Record Loaded', `Loaded ${rec.batch_title || 'saved reconciliation'} with ${Object.keys(rec.notes_map || {}).length} saved notes.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load saved record.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteSavedRecord = async (id: number) => {
    try {
      const res = await api(`/api/bank-matcher/history/${id}`, { method: 'DELETE' });
      if (res?.success) {
        setSavedHistory((prev) => prev.filter((item) => item.id !== id));
        if (currentSavedId === id) {
          setCurrentSavedId(null);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete record.');
    }
  };

  const loadMasterStatus = async () => {
    try {
      const data = await api('/api/bank-matcher/master');
      if (data?.success) {
        setMasterStatus(data);
      }
    } catch (err: any) {
      console.error('Failed to load master status:', err);
    }
  };

  const handleStatementFileChange = (e: any) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setStatementFile(file);
    }
  };

  const handleBillFileChange = (e: any) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setBillFile(file);
    }
  };

  const handleMasterFileChange = async (e: any) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      try {
        setUploadingMaster(true);
        const token = await getToken();
        const base = getApiBase();
        const formData = new FormData();
        formData.append('master_file', file);

        const res = await fetch(`${base}/api/bank-matcher/master`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const data = await res.json();
        if (data?.success) {
          Alert.alert('Master Updated', data.message || 'Student Details Master updated successfully.');
          setMasterModalOpen(false);
          void loadMasterStatus();
        } else {
          Alert.alert('Upload Error', data?.message || 'Failed to update Master.');
        }
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to upload Master Excel.');
      } finally {
        setUploadingMaster(false);
        if (masterInputRef.current) masterInputRef.current.value = '';
      }
    }
  };

  const handleReconcile = async () => {
    if (!statementFile) {
      Alert.alert('Missing Statement', 'Please select or upload your SBI Bank Statement file (.xlsx or .pdf).');
      return;
    }

    if (billSource === 'upload' && !billFile) {
      Alert.alert('Missing Bill Report', 'Please select or upload your Bill Report Excel file.');
      return;
    }

    try {
      setReconciling(true);
      setResult(null);
      setDownloadToken(null);

      const token = await getToken();
      const base = getApiBase();
      const formData = new FormData();
      formData.append('statement_file', statementFile);

      if (billSource === 'upload' && billFile) {
        formData.append('bill_file', billFile);
      } else {
        formData.append('from_date', fromDate);
        formData.append('to_date', toDate);
        formData.append('target_date', fromDate);
      }

      const res = await fetch(`${base}/api/bank-matcher/reconcile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (data?.success) {
        setResult(data);
        setDownloadToken(data.download_token);
        if (data.saved_record_id) {
          setCurrentSavedId(data.saved_record_id);
          void loadHistory();
        } else {
          setCurrentSavedId(null);
        }
        setNotes({});
        if (data.summary.matched_count === 0) {
          Alert.alert(
            'Reconciliation Auto-Saved',
            'No transactions matched by reference and amount. Reconciled data is auto-saved in database.'
          );
        } else {
          Alert.alert(
            'Reconciliation Complete (Auto-Saved)',
            `Matched ${data.summary.matched_count} transactions (₹${formatCurrency(data.summary.matched_amount)}).\n\nResult has been automatically saved to database! You can review this date anytime from Saved Archive without uploading files.`
          );
        }
      } else {
        Alert.alert('Reconciliation Error', data?.message || 'Failed to reconcile bank statement.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error occurred while processing reconciliation.');
    } finally {
      setReconciling(false);
    }
  };

  const handleDownloadMatchedExcel = async () => {
    if (!downloadToken) {
      Alert.alert('Download Error', 'No reconciled file is ready to download. Please run reconciliation first.');
      return;
    }

    try {
      const base = getApiBase();
      const token = await getToken();
      const downloadUrl = `${base}/api/bank-matcher/download/${downloadToken}`;
      const dateLabel = fromDate && toDate && fromDate !== toDate ? `${fromDate}_to_${toDate}` : (fromDate || 'reconciled');
      const filename = `Matched_Bank_Statement_${dateLabel}.xlsx`;

      if (Platform.OS === 'web') {
        try {
          const res = await fetch(downloadUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.message || `Download failed (${res.status})`);
          }
          const blob = await res.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
        } catch {
          // Direct URL fallback
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
      } else {
        await Linking.openURL(downloadUrl);
      }
    } catch (err: any) {
      Alert.alert('Download Error', err.message || 'Unable to download file.');
    }
  };

  // All statement rows (Side-by-side view with Student Details beside Balance)
  const allStatementRows = useMemo(() => {
    return result?.statement_rows || [];
  }, [result?.statement_rows]);

  // Filtered statement rows based on activeResultTab ('all' | 'matched' | 'unmatched_statement') and search
  const filteredStatementRows = useMemo(() => {
    let rows = allStatementRows;
    if (activeResultTab === 'matched') {
      rows = rows.filter((r: any) => r.is_matched);
    } else if (activeResultTab === 'unmatched_statement') {
      rows = rows.filter((r: any) => !r.is_matched);
    }
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((r: any) => {
      return (
        String(r.reg_no || '').toLowerCase().includes(q) ||
        String(r.student_name || '').toLowerCase().includes(q) ||
        String(r.receipt_no || '').toLowerCase().includes(q) ||
        String(r.class_name || '').toLowerCase().includes(q) ||
        String(r.description || '').toLowerCase().includes(q) ||
        String(r.ref_no || '').toLowerCase().includes(q) ||
        String(r.date || '').toLowerCase().includes(q) ||
        String(r.credit || '').toLowerCase().includes(q) ||
        String(r.debit || '').toLowerCase().includes(q)
      );
    });
  }, [allStatementRows, activeResultTab, searchQuery]);

  // Filtered rows for mismatch bills (Sheet 2)
  const filteredMismatchBills = useMemo(() => {
    const rows = result?.mismatch_rows || [];
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((r: any) => {
      return (
        String(r.reg_no || '').toLowerCase().includes(q) ||
        String(r.student_name || '').toLowerCase().includes(q) ||
        String(r.reason || '').toLowerCase().includes(q) ||
        String(r.inst_no || '').toLowerCase().includes(q) ||
        String(r.statement_ref || '').toLowerCase().includes(q) ||
        String(r.description || '').toLowerCase().includes(q) ||
        String(r.particulars || '').toLowerCase().includes(q) ||
        String(r.source || '').toLowerCase().includes(q)
      );
    });
  }, [result?.mismatch_rows, searchQuery]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AcademyHeader
        subtitle="SBI Bank Statement + Accounts Portal Live Reconcile Engine"
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Navigation Tabs (Accounts Sub-Menus) */}
        <View style={styles.tabNav}>
          <NavTabLink
            path="/fees?tab=fees_collection"
            style={styles.tabBtn}
          >
            <Text style={styles.tabBtnText}>💳 Fees</Text>
          </NavTabLink>

          <NavTabLink
            path="/fees?tab=receipt_payment"
            style={styles.tabBtn}
          >
            <Text style={styles.tabBtnText}>📑 Receipt & Payment</Text>
          </NavTabLink>

          <NavTabLink
            path="/due-fees"
            style={styles.tabBtn}
          >
            <Text style={styles.tabBtnText}>⏳ Due Fees</Text>
          </NavTabLink>

          <NavTabLink
            path="/bank-statement-matcher"
            style={[styles.tabBtn, styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, styles.tabBtnTextActive]}>
              🏦 Bank Matcher
            </Text>
          </NavTabLink>

          <TouchableOpacity
            onPress={() => setMasterModalOpen(true)}
            style={[styles.tabBtn, styles.studentMasterTabBtn]}
          >
            <Text style={styles.studentMasterTabBtnText}>
              👥 Student Master ({masterStatus?.custom_master_count || 473})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              void loadHistory();
              setHistoryModalOpen(true);
            }}
            style={[styles.tabBtn, styles.historyTabBtn]}
          >
            <Text style={styles.historyTabBtnText}>
              📜 Saved History
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mode Toggle Bar */}
        <View style={styles.modeToggleBar}>
          <TouchableOpacity
            style={[styles.modeToggleTab, pageMode === 'reconcile' && styles.modeToggleTabActive]}
            onPress={() => setPageMode('reconcile')}
          >
            <Text style={[styles.modeToggleTabText, pageMode === 'reconcile' && styles.modeToggleTabTextActive]}>
              ⚡ Reconcile New Statement (নতুন ফাইল ম্যাচ)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeToggleTab, pageMode === 'history' && styles.modeToggleTabActive]}
            onPress={() => {
              setPageMode('history');
              void loadHistory();
            }}
          >
            <Text style={[styles.modeToggleTabText, pageMode === 'history' && styles.modeToggleTabTextActive]}>
              📅 Date-wise Saved Archive (সংরক্ষিত হিস্ট্রি)
              {savedHistory.length ? ` (${savedHistory.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {pageMode === 'reconcile' ? (
          <>
            {/* Input Cards Container */}
            <View style={styles.cardsRow}>
          {/* Card 1: Bank Statement (Daily Upload) */}
          <View style={styles.inputCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardBadge}>Step 1</Text>
              <Text style={styles.cardTitle}>SBI Bank Statement</Text>
            </View>
            <Text style={styles.cardHint}>
              Upload your daily SBI Statement (.xlsx, .xls, or .pdf). Reconciled file will be generated in Excel (.xlsx).
            </Text>

            <View style={styles.fileBox}>
              {Platform.OS === 'web' && (
                <input
                  ref={statementInputRef}
                  type="file"
                  accept=".xlsx, .xls, .pdf, application/pdf"
                  onChange={handleStatementFileChange}
                  style={{ display: 'none' }}
                />
              )}

              <TouchableOpacity
                style={styles.chooseFileBtn}
                onPress={() => statementInputRef.current?.click()}
              >
                <Text style={styles.chooseFileBtnText}>
                  {statementFile ? '🔄 Change Statement' : '📁 Browse Statement (.xlsx, .pdf)'}
                </Text>
              </TouchableOpacity>

              {statementFile ? (
                <View style={styles.fileSelectedBadge}>
                  <Text style={styles.fileSelectedIcon}>
                    {String(statementFile.name || '').toLowerCase().endsWith('.pdf') ? '📕' : '📄'}
                  </Text>
                  <Text style={styles.fileSelectedName} numberOfLines={1}>
                    {statementFile.name}
                  </Text>
                  <Text style={styles.fileSelectedSize}>
                    ({Math.round(statementFile.size / 1024)} KB)
                  </Text>
                </View>
              ) : (
                <Text style={styles.noFileText}>No file chosen</Text>
              )}
            </View>
          </View>

          {/* Card 2: Bill Report Source */}
          <View style={styles.inputCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardBadge}>Step 2</Text>
              <Text style={styles.cardTitle}>Bill Report Source</Text>
            </View>

            {/* Source Toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, billSource === 'portal' && styles.toggleBtnActive]}
                onPress={() => setBillSource('portal')}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    billSource === 'portal' && styles.toggleBtnTextActive,
                  ]}
                >
                  🌐 Live Accounts Portal
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, billSource === 'upload' && styles.toggleBtnActive]}
                onPress={() => setBillSource('upload')}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    billSource === 'upload' && styles.toggleBtnTextActive,
                  ]}
                >
                  📁 Upload Excel
                </Text>
              </TouchableOpacity>
            </View>

            {billSource === 'portal' ? (
              <View style={styles.portalParamsBox}>
                <View style={styles.datePickerRow}>
                  <View style={{ flex: 1 }}>
                    <DatePickerField
                      label="Voucher Date From"
                      value={fromDate}
                      onChange={setFromDate}
                    />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <DatePickerField
                      label="Voucher Date To"
                      value={toDate}
                      onChange={setToDate}
                    />
                  </View>
                </View>
                <View style={styles.portalInfoBox}>
                  <Text style={styles.portalInfoText}>
                    ⚡ Automatically fetches SBI Account (19665) bank book & live fee bills for Memari between the selected dates across last 2 sessions (2026 & 2025). Statement transactions and bills match seamlessly by Ref No. + Amount!
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.fileBox}>
                {Platform.OS === 'web' && (
                  <input
                    ref={billInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleBillFileChange}
                    style={{ display: 'none' }}
                  />
                )}

                <TouchableOpacity
                  style={styles.chooseFileBtn}
                  onPress={() => billInputRef.current?.click()}
                >
                  <Text style={styles.chooseFileBtnText}>
                    {billFile ? '🔄 Change Bill Report' : '📁 Browse Bill Report (.xlsx)'}
                  </Text>
                </TouchableOpacity>

                {billFile ? (
                  <View style={styles.fileSelectedBadge}>
                    <Text style={styles.fileSelectedIcon}>📑</Text>
                    <Text style={styles.fileSelectedName} numberOfLines={1}>
                      {billFile.name}
                    </Text>
                    <Text style={styles.fileSelectedSize}>
                      ({Math.round(billFile.size / 1024)} KB)
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noFileText}>No file chosen</Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Action Button: MATCH & RECONCILE */}
        <View style={styles.reconcileBtnContainer}>
          <TouchableOpacity
            style={[styles.reconcileBtn, reconciling && styles.reconcileBtnDisabled]}
            onPress={handleReconcile}
            disabled={reconciling}
          >
            {reconciling ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 10 }} />
                <Text style={styles.reconcileBtnText}>Reconciling Statement & Bills...</Text>
              </>
            ) : (
              <Text style={styles.reconcileBtnText}>
                🚀 MATCH & RECONCILE TRANSACTIONS
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </>
    ) : (
      <View style={styles.historyArchiveCard}>
        <View style={styles.historyArchiveHeader}>
          <View style={{ flex: 1, minWidth: 260 }}>
            <Text style={styles.historyArchiveTitle}>
              📅 Date-wise Reconciled Records Archive
            </Text>
            <Text style={styles.historyArchiveSubtitle}>
              পূর্বে ম্যাচ ও সেভ করা সব স্টেটমেন্টের রেকর্ড। যেকোনো তারিখের রেকর্ডে ক্লিক করলেই ব্যাংক স্টেটমেন্ট ফাইল আপলোড ছাড়াই পুরো ডাটা ও নোট সরাসরি দেখতে পাবেন।
            </Text>
          </View>

          <View style={styles.historySearchBox}>
            <Text style={{ marginRight: 6 }}>🔍</Text>
            <TextInput
              style={styles.historySearchInput}
              placeholder="Filter by date (e.g. 08-11-2026)..."
              placeholderTextColor="#94a3b8"
              value={historySearchDate}
              onChangeText={setHistorySearchDate}
            />
            {historySearchDate ? (
              <TouchableOpacity onPress={() => setHistorySearchDate('')}>
                <Text style={{ color: '#94a3b8', padding: 4 }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {loadingHistory ? (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={{ marginTop: 10, color: '#64748b' }}>Loading saved records...</Text>
          </View>
        ) : filteredSavedHistory.length === 0 ? (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: '#94a3b8', fontWeight: '700' }}>
              কোনো সংরক্ষিত রেকর্ড পাওয়া যায়নি।
            </Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              'Reconcile New Statement' ট্যাবে গিয়ে স্টেটমেন্ট ম্যাচ করলেই তা স্বয়ংক্রিয়ভাবে এখানে তারিখ অনুযায়ী সেভ হয়ে যাবে।
            </Text>
          </View>
        ) : (
          <View style={styles.historyGrid}>
            {filteredSavedHistory.map((item: any) => {
              const isSelected = currentSavedId === item.id;
              return (
                <View
                  key={`archive_hist_${item.id}`}
                  style={[styles.historyGridCard, isSelected && styles.historyGridCardSelected]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={styles.historyCardDateBadge}>
                        📅 {item.from_date || 'N/A'}{item.to_date && item.to_date !== item.from_date ? ` to ${item.to_date}` : ''}
                      </Text>
                      {isSelected && (
                        <Text style={styles.historyActiveBadge}>ACTIVE</Text>
                      )}
                    </View>
                    <Text style={styles.historyGridTitle} numberOfLines={1}>
                      {item.batch_title || 'Reconciliation Record'}
                    </Text>
                    <View style={styles.historyStatsRow}>
                      <Text style={styles.historyBadgeMatched}>
                        ✅ {item.summary?.matched_count || 0} Matched (₹{formatCurrency(item.summary?.matched_amount || 0)})
                      </Text>
                      <Text style={styles.historyBadgeUnmatched}>
                        ⚠️ {item.summary?.statement_unmatched_count || 0} Stmt Unmatched
                      </Text>
                      <Text style={styles.historyBadgeBills}>
                        📑 {item.summary?.bill_unmatched_count || 0} Bill Unmatched
                      </Text>
                    </View>
                    <Text style={styles.historyMeta}>
                      📁 {item.statement_filename || 'SBI'} • 👤 {item.created_by || 'Staff'} • 🕒 {formatDateDisplay(item.created_at)}
                    </Text>
                  </View>
                  <View style={styles.historyActions}>
                    <TouchableOpacity
                      style={[styles.historyViewBtn, isSelected && { backgroundColor: '#15803d' }]}
                      onPress={() => handleOpenSavedRecord(item.id)}
                    >
                      <Text style={styles.historyViewBtnText}>
                        {isSelected ? '✓ Loaded Below' : '👁 Open Record'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyDelBtn}
                      onPress={() => handleDeleteSavedRecord(item.id)}
                    >
                      <Text style={styles.historyDelBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    )}

    {/* Results Section */}
        {result ? (
          <View style={styles.resultsContainer}>
            {/* KPI Summary Cards */}
            <View style={styles.kpiRow}>
              <View style={[styles.kpiCard, { borderLeftColor: '#3b82f6' }]}>
                <Text style={styles.kpiLabel}>STATEMENT TXNS</Text>
                <Text style={[styles.kpiValue, { color: '#1d4ed8' }]}>
                  {result.summary.statement_count}
                </Text>
              </View>

              <View style={[styles.kpiCard, { borderLeftColor: '#8b5cf6' }]}>
                <Text style={styles.kpiLabel}>BILL ENTRIES</Text>
                <Text style={[styles.kpiValue, { color: '#6d28d9' }]}>
                  {result.summary.bill_count}
                </Text>
              </View>

              <View style={[styles.kpiCard, { borderLeftColor: '#22c55e' }]}>
                <Text style={styles.kpiLabel}>MATCHED (REF + AMT)</Text>
                <Text style={[styles.kpiValue, { color: '#15803d' }]}>
                  {result.summary.matched_count}
                </Text>
                <Text style={styles.kpiSub}>₹{formatCurrency(result.summary.matched_amount)}</Text>
              </View>

              <View style={[styles.kpiCard, { borderLeftColor: '#f59e0b' }]}>
                <Text style={styles.kpiLabel}>STATEMENT UNMATCHED</Text>
                <Text style={[styles.kpiValue, { color: '#b45309' }]}>
                  {result.summary.statement_unmatched_count}
                </Text>
              </View>

              <View style={[styles.kpiCard, { borderLeftColor: '#ef4444' }]}>
                <Text style={styles.kpiLabel}>BILLS UNMATCHED</Text>
                <Text style={[styles.kpiValue, { color: '#b91c1c' }]}>
                  {result.summary.bill_unmatched_count}
                </Text>
              </View>
            </View>

            {/* Download & Save Banner */}
            <View style={styles.downloadBanner}>
              <View style={styles.downloadBannerLeft}>
                <Text style={styles.downloadBannerTitle}>
                  🎉 Statement Reconciled Successfully!
                </Text>
                <Text style={styles.downloadBannerSubtitle}>
                  Original SBI Statement + 6 added student & notes columns. Add custom notes to any transaction and save to database for future reference.
                </Text>
              </View>

              <View style={styles.bannerActionRow}>
                <TouchableOpacity
                  style={[styles.saveRecordBtn, savingSession && styles.saveRecordBtnDisabled]}
                  onPress={handleSaveSession}
                  disabled={savingSession}
                >
                  <Text style={styles.saveRecordBtnText}>
                    {savingSession ? '💾 Saving...' : currentSavedId ? '💾 Update Saved Record' : '💾 Save Record & Notes'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.downloadExcelBtn}
                  onPress={handleDownloadMatchedExcel}
                >
                  <Text style={styles.downloadExcelBtnText}>
                    📥 Download Matched Excel (.xlsx)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Results Preview Card with Search & Tabs */}
            <View style={styles.previewCard}>
              <View style={styles.previewHeaderRow}>
                {/* Result Tabs */}
                <View style={styles.previewTabsRow}>
                  <TouchableOpacity
                    style={[
                      styles.previewTab,
                      activeResultTab === 'all' && styles.previewTabActive,
                    ]}
                    onPress={() => setActiveResultTab('all')}
                  >
                    <Text
                      style={[
                        styles.previewTabText,
                        activeResultTab === 'all' && styles.previewTabTextActive,
                      ]}
                    >
                      📄 All Transactions ({result.statement_rows?.length || result.summary.statement_count})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.previewTab,
                      activeResultTab === 'matched' && styles.previewTabActive,
                    ]}
                    onPress={() => setActiveResultTab('matched')}
                  >
                    <Text
                      style={[
                        styles.previewTabText,
                        activeResultTab === 'matched' && styles.previewTabTextActive,
                      ]}
                    >
                      ✅ Matched ({result.summary.matched_count})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.previewTab,
                      activeResultTab === 'unmatched_statement' && styles.previewTabActive,
                    ]}
                    onPress={() => setActiveResultTab('unmatched_statement')}
                  >
                    <Text
                      style={[
                        styles.previewTabText,
                        activeResultTab === 'unmatched_statement' && styles.previewTabTextActive,
                      ]}
                    >
                      ⚠️ Unmatched Statement ({result.summary.statement_unmatched_count})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.previewTab,
                      activeResultTab === 'mismatch_bills' && styles.previewTabActive,
                    ]}
                    onPress={() => setActiveResultTab('mismatch_bills')}
                  >
                    <Text
                      style={[
                        styles.previewTabText,
                        activeResultTab === 'mismatch_bills' && styles.previewTabTextActive,
                      ]}
                    >
                      📑 Unmatched Bills ({result.summary.bill_unmatched_count})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Instant Search Box */}
                <View style={styles.searchBox}>
                  <Text style={{ marginRight: 6 }}>🔍</Text>
                  <TextInput
                    style={styles.searchTextInput}
                    placeholder="Search Reg, Name, Ref, Amount, Reason..."
                    placeholderTextColor="#94a3b8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Text style={{ color: '#94a3b8', padding: 4 }}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Data Table */}
              <ScrollView horizontal style={styles.horizontalScroll}>
                {activeResultTab !== 'mismatch_bills' ? (
                  <View style={styles.previewTable}>
                    {/* Super Header: Categorizing Bank Statement vs Student Details */}
                    <View style={styles.superHeaderRow}>
                      <View style={[styles.superHeaderBank, { width: 1325 }]}>
                        <Text style={styles.superHeaderTextBank}>
                          🏦 ORIGINAL BANK STATEMENT (UNCHANGED COLUMNS)
                        </Text>
                      </View>
                      <View style={[styles.superHeaderStudent, { width: 740 }]}>
                        <Text style={styles.superHeaderTextStudent}>
                          🎓 MATCHED STUDENT DETAILS & NOTES (ADDED BESIDE BALANCE)
                        </Text>
                      </View>
                    </View>

                    {/* Column Headers */}
                    <View style={styles.pHeadRow}>
                      <View style={[styles.pTh, { width: 45 }]}>
                        <Text style={styles.pThText}>#</Text>
                      </View>
                      <View style={[styles.pTh, { width: 95 }]}>
                        <Text style={styles.pThText}>Txn Date</Text>
                      </View>
                      <View style={[styles.pTh, { width: 95 }]}>
                        <Text style={styles.pThText}>Value Date</Text>
                      </View>
                      <View style={[styles.pTh, { width: 500, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Description</Text>
                      </View>
                      <View style={[styles.pTh, { width: 240 }]}>
                        <Text style={styles.pThText}>Ref No./Cheque No.</Text>
                      </View>
                      <View style={[styles.pTh, { width: 75 }]}>
                        <Text style={styles.pThText}>Branch</Text>
                      </View>
                      <View style={[styles.pTh, { width: 85 }]}>
                        <Text style={styles.pThText}>Debit</Text>
                      </View>
                      <View style={[styles.pTh, { width: 95 }]}>
                        <Text style={styles.pThText}>Credit</Text>
                      </View>
                      <View style={[styles.pTh, { width: 95 }]}>
                        <Text style={styles.pThText}>Balance</Text>
                      </View>

                      {/* Student details headers (Order: Reg. No., Student Name, Class, Recpt. No., Amount, Note) */}
                      <View style={[styles.pTh, styles.pThStudentDivider, { width: 90 }]}>
                        <Text style={styles.pThTextStudent}>Reg. No.</Text>
                      </View>
                      <View style={[styles.pTh, styles.pThStudent, { width: 180, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThTextStudent}>Student Name</Text>
                      </View>
                      <View style={[styles.pTh, styles.pThStudent, { width: 100 }]}>
                        <Text style={styles.pThTextStudent}>Class</Text>
                      </View>
                      <View style={[styles.pTh, styles.pThStudent, { width: 90 }]}>
                        <Text style={styles.pThTextStudent}>Recpt. No.</Text>
                      </View>
                      <View style={[styles.pTh, styles.pThStudent, { width: 100 }]}>
                        <Text style={styles.pThTextStudent}>Amount</Text>
                      </View>
                      <View style={[styles.pTh, styles.pThStudent, { width: 180, borderRightWidth: 0 }]}>
                        <Text style={styles.pThTextStudent}>Note</Text>
                      </View>
                    </View>

                    {/* Data Rows */}
                    {filteredStatementRows.map((row: any, idx: number) => (
                      <View
                        key={`stmt_row_${idx}`}
                        style={[styles.pTr, idx % 2 === 0 ? styles.pTrEven : styles.pTrOdd]}
                      >
                        <View style={[styles.pTd, { width: 45 }]}>
                          <Text style={styles.pTdTextMuted}>{idx + 1}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 95 }]}>
                          <Text style={styles.pTdTextMuted}>{formatDateDisplay(row.date)}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 95 }]}>
                          <Text style={styles.pTdTextMuted}>{formatDateDisplay(row.value_date || row.date)}</Text>
                        </View>
                        {/* Highlight Description cell in Yellow if matched! */}
                        <View
                          style={[
                            styles.pTd,
                            { width: 500, alignItems: 'flex-start' },
                            row.is_matched && styles.pTdDescMatched,
                          ]}
                          {...(Platform.OS === 'web' ? ({ title: row.description || '' } as any) : {})}
                        >
                          <Text
                            style={[
                              styles.pTdDescText,
                              row.is_matched && styles.pTdDescTextMatched,
                            ]}
                            numberOfLines={1}
                            selectable
                          >
                            {row.description}
                          </Text>
                        </View>
                        <View
                          style={[styles.pTd, { width: 240 }]}
                          {...(Platform.OS === 'web' ? ({ title: row.ref_no || '' } as any) : {})}
                        >
                          <Text style={styles.pTdRef} numberOfLines={1} selectable>
                            {row.ref_no || '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, { width: 75 }]}>
                          <Text style={styles.pTdTextMuted}>{row.branch_code || '-'}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 85 }]}>
                          <Text style={styles.pTdTextMuted}>
                            {row.debit ? `₹${formatCurrency(row.debit)}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.pTd, { width: 95 }]}>
                          <Text
                            style={[
                              styles.pTdAmount,
                              { color: row.credit ? '#15803d' : '#64748b' },
                            ]}
                          >
                            {row.credit ? `₹${formatCurrency(row.credit)}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.pTd, { width: 95 }]}>
                          <Text style={styles.pTdTextMuted}>
                            {row.balance ? `₹${formatCurrency(row.balance)}` : ''}
                          </Text>
                        </View>

                        {/* Student Details (Beside Balance, with red divider) */}
                        <View style={[styles.pTd, styles.pTdStudentDivider, { width: 90 }]}>
                          <Text
                            style={row.is_matched ? styles.pTdTextBold : styles.pTdTextMuted}
                          >
                            {row.is_matched ? row.reg_no : '-'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.pTd,
                            styles.pTdStudent,
                            { width: 180, alignItems: 'flex-start' },
                          ]}
                        >
                          <Text
                            style={row.is_matched ? styles.pTdName : styles.pTdTextMuted}
                            numberOfLines={1}
                          >
                            {row.is_matched ? row.student_name : '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, styles.pTdStudent, { width: 100 }]}>
                          <Text
                            style={row.is_matched ? styles.pTdText : styles.pTdTextMuted}
                          >
                            {row.is_matched ? row.class_name : '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, styles.pTdStudent, { width: 90 }]}>
                          <Text
                            style={row.is_matched ? styles.pTdText : styles.pTdTextMuted}
                          >
                            {row.is_matched ? row.receipt_no : '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, styles.pTdStudent, { width: 100 }]}>
                          <Text
                            style={row.is_matched ? styles.pTdAmount : styles.pTdTextMuted}
                          >
                            {row.is_matched ? `₹${formatCurrency(row.amount)}` : '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, styles.pTdStudent, { width: 180, borderRightWidth: 0, paddingVertical: 4, paddingHorizontal: 6 }]}>
                          <TextInput
                            style={styles.noteInput}
                            placeholder="Add note..."
                            placeholderTextColor="#94a3b8"
                            value={notes[row.statement_row || idx] || ''}
                            onChangeText={(val) => {
                              setNotes((prev) => ({
                                ...prev,
                                [row.statement_row || idx]: val,
                              }));
                            }}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.previewTable}>
                    <View style={[styles.pHeadRow, { backgroundColor: '#fee2e2' }]}>
                      <View style={[styles.pTh, { width: 80 }]}>
                        <Text style={styles.pThText}>Source</Text>
                      </View>
                      <View style={[styles.pTh, { width: 180, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Reason</Text>
                      </View>
                      <View style={[styles.pTh, { width: 240 }]}>
                        <Text style={styles.pThText}>Statement Ref / Inst. No.</Text>
                      </View>
                      <View style={[styles.pTh, { width: 110 }]}>
                        <Text style={styles.pThText}>Amount</Text>
                      </View>
                      <View style={[styles.pTh, { width: 90 }]}>
                        <Text style={styles.pThText}>Reg. No.</Text>
                      </View>
                      <View style={[styles.pTh, { width: 90 }]}>
                        <Text style={styles.pThText}>Recpt. No.</Text>
                      </View>
                      <View style={[styles.pTh, { width: 180, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Student Name</Text>
                      </View>
                      <View style={[styles.pTh, { width: 100 }]}>
                        <Text style={styles.pThText}>Class</Text>
                      </View>
                      <View style={[styles.pTh, { width: 500, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Particulars / Description</Text>
                      </View>
                      <View style={[styles.pTh, { width: 180, borderRightWidth: 0 }]}>
                        <Text style={styles.pThText}>Note</Text>
                      </View>
                    </View>

                    {filteredMismatchBills.map((row: any, idx: number) => (
                      <View
                        key={`mismatch_bill_${idx}`}
                        style={[styles.pTr, idx % 2 === 0 ? styles.pTrEven : styles.pTrOdd]}
                      >
                        <View style={[styles.pTd, { width: 80 }]}>
                          <View style={styles.sourceBadge}>
                            <Text style={styles.sourceBadgeText}>{row.source}</Text>
                          </View>
                        </View>
                        <View style={[styles.pTd, { width: 180, alignItems: 'flex-start' }]}>
                          <Text style={styles.reasonText}>{row.reason}</Text>
                        </View>
                        <View
                          style={[styles.pTd, { width: 240 }]}
                          {...(Platform.OS === 'web' ? ({ title: row.statement_ref || row.inst_no || '' } as any) : {})}
                        >
                          <Text style={styles.pTdRef} numberOfLines={1} selectable>
                            {row.statement_ref || row.inst_no || '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, { width: 110 }]}>
                          <Text style={styles.pTdAmount}>
                            ₹{formatCurrency(row.credit || row.debit || row.bill_amount)}
                          </Text>
                        </View>
                        <View style={[styles.pTd, { width: 90 }]}>
                          <Text style={styles.pTdTextBold}>{row.reg_no || '-'}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 90 }]}>
                          <Text style={styles.pTdText}>{row.receipt_no || '-'}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 180, alignItems: 'flex-start' }]}>
                          <Text style={styles.pTdName}>{row.student_name || '-'}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 100 }]}>
                          <Text style={styles.pTdText}>{row.class_name || '-'}</Text>
                        </View>
                        <View
                          style={[styles.pTd, { width: 500, alignItems: 'flex-start' }]}
                          {...(Platform.OS === 'web' ? ({ title: row.particulars || row.description || '' } as any) : {})}
                        >
                          <Text style={styles.pTdDesc} numberOfLines={1} selectable>
                            {row.particulars || row.description || '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, { width: 180, borderRightWidth: 0, paddingVertical: 4, paddingHorizontal: 6 }]}>
                          <TextInput
                            style={styles.noteInput}
                            placeholder="Add note..."
                            placeholderTextColor="#94a3b8"
                            value={notes[`mismatch_${idx}`] || ''}
                            onChangeText={(val) => {
                              setNotes((prev) => ({
                                ...prev,
                                [`mismatch_${idx}`]: val,
                              }));
                            }}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Floating 1-Click Scroll Top and Bottom Buttons */}
      <ScrollNavigationButtons scrollRef={scrollRef} />

      {/* Upload Master Excel Modal */}
      <Modal visible={masterModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👥 Student Details Master</Text>
              <TouchableOpacity onPress={() => setMasterModalOpen(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Current Master Status */}
            <View style={styles.modalStatsRow}>
              <View style={styles.modalStatCard}>
                <Text style={styles.modalStatLabel}>Master Students</Text>
                <Text style={styles.modalStatVal}>
                  {masterStatus?.custom_master_count || 473}
                </Text>
              </View>
              <View style={styles.modalStatCard}>
                <Text style={styles.modalStatLabel}>Database Students</Text>
                <Text style={styles.modalStatVal}>
                  {masterStatus?.db_students_count || 747}
                </Text>
              </View>
            </View>

            <Text style={styles.modalNote}>
              Student master is saved permanently in software. Only upload/replace when student list changes. File must contain columns:{' '}
              <Text style={{ fontWeight: '700', color: '#0f172a' }}>reg.</Text>,{' '}
              <Text style={{ fontWeight: '700', color: '#0f172a' }}>name</Text>, and{' '}
              <Text style={{ fontWeight: '700', color: '#0f172a' }}>class</Text>.
            </Text>

            <View style={styles.modalUploadBox}>
              {Platform.OS === 'web' && (
                <input
                  ref={masterInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleMasterFileChange}
                  style={{ display: 'none' }}
                />
              )}

              <TouchableOpacity
                style={styles.modalChooseBtn}
                onPress={() => masterInputRef.current?.click()}
                disabled={uploadingMaster}
              >
                {uploadingMaster ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalChooseBtnText}>
                    📁 Select Master Excel File (.xlsx)
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCloseActionBtn}
                onPress={() => setMasterModalOpen(false)}
              >
                <Text style={styles.modalCloseActionBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Saved History Modal */}
      <Modal visible={historyModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 720, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📜 Saved Reconciliation Records</Text>
              <TouchableOpacity onPress={() => setHistoryModalOpen(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalNote}>
              Previously saved statements and notes are stored permanently in the database. You can review and download them anytime without uploading statement files again!
            </Text>

            {loadingHistory ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={{ marginTop: 10, color: '#64748b' }}>Loading saved records...</Text>
              </View>
            ) : savedHistory.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, color: '#94a3b8', fontWeight: '600' }}>
                  No saved reconciliation records yet.
                </Text>
                <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  After reconciling transactions, click "💾 Save Record & Notes" to save it here.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {savedHistory.map((item: any) => (
                  <View key={`hist_${item.id}`} style={styles.historyCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{item.batch_title || 'Reconciliation Record'}</Text>
                      <View style={styles.historyStatsRow}>
                        <Text style={styles.historyBadgeMatched}>
                          ✅ {item.summary?.matched_count || 0} Matched (₹{formatCurrency(item.summary?.matched_amount || 0)})
                        </Text>
                        <Text style={styles.historyBadgeUnmatched}>
                          ⚠️ {item.summary?.statement_unmatched_count || 0} Unmatched Stmt
                        </Text>
                        <Text style={styles.historyBadgeBills}>
                          📑 {item.summary?.bill_unmatched_count || 0} Unmatched Bills
                        </Text>
                      </View>
                      <Text style={styles.historyMeta}>
                        📁 File: {item.statement_filename || 'SBI'} • 👤 By: {item.created_by || 'Staff'} • 🕒 {formatDateDisplay(item.created_at)}
                      </Text>
                    </View>
                    <View style={styles.historyActions}>
                      <TouchableOpacity
                        style={styles.historyViewBtn}
                        onPress={() => handleOpenSavedRecord(item.id)}
                      >
                        <Text style={styles.historyViewBtnText}>👁 Open</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.historyDelBtn}
                        onPress={() => handleDeleteSavedRecord(item.id)}
                      >
                        <Text style={styles.historyDelBtnText}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCloseActionBtn}
                onPress={() => setHistoryModalOpen(false)}
              >
                <Text style={styles.modalCloseActionBtnText}>Close</Text>
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
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  tabNav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
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
  historyTabBtn: {
    backgroundColor: '#f1f5f9',
    borderColor: '#94a3b8',
    borderWidth: 1,
  },
  historyTabBtnText: {
    color: '#334155',
    fontWeight: '800',
    fontSize: 14,
  },
  modeToggleBar: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    gap: 4,
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
  },
  modeToggleTab: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  modeToggleTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  modeToggleTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  modeToggleTabTextActive: {
    color: '#0369a1',
    fontWeight: '900',
  },
  historyArchiveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  historyArchiveHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
  },
  historyArchiveTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  historyArchiveSubtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  historySearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 260,
  },
  historySearchInput: {
    fontSize: 12,
    color: '#0f172a',
    outlineStyle: 'none' as any,
    flex: 1,
  },
  historyGrid: {
    gap: 10,
  },
  historyGridCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyGridCardSelected: {
    borderColor: '#0284c7',
    borderWidth: 2,
    backgroundColor: '#f0f9ff',
  },
  historyCardDateBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284c7',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyActiveBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyGridTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  inputCard: {
    flex: 1,
    minWidth: 300,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardBadge: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardHint: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 12,
  },
  fileBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseFileBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    marginBottom: 8,
  },
  chooseFileBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  fileSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 6,
    maxWidth: '100%',
  },
  fileSelectedIcon: {
    fontSize: 14,
  },
  fileSelectedName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
    flexShrink: 1,
  },
  fileSelectedSize: {
    fontSize: 11,
    color: '#0284c7',
  },
  noFileText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  toggleBtnTextActive: {
    color: '#0284c7',
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  portalParamsBox: {
    gap: 10,
  },
  portalInfoBox: {
    backgroundColor: '#eff6ff',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    padding: 8,
    borderRadius: 4,
  },
  portalInfoText: {
    fontSize: 11,
    color: '#1e40af',
    lineHeight: 15,
  },
  masterStatusBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  masterStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  masterStatLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  masterStatVal: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
  },
  updateMasterBtn: {
    marginTop: 8,
    backgroundColor: '#e2e8f0',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  updateMasterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  reconcileBtnContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  reconcileBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
    minWidth: 260,
  },
  reconcileBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
  },
  reconcileBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  resultsContainer: {
    gap: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  kpiSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
    marginTop: 2,
  },
  downloadBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  downloadBannerLeft: {
    flex: 1,
    minWidth: 280,
  },
  downloadBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 4,
  },
  downloadBannerSubtitle: {
    fontSize: 12,
    color: '#15803d',
    lineHeight: 17,
  },
  downloadExcelBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#16a34a',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 3,
  },
  downloadExcelBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  bannerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  saveRecordBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  saveRecordBtnDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
  },
  saveRecordBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  previewCard: {
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
  previewHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  previewTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
  },
  previewTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  previewTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  previewTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  previewTabTextActive: {
    color: '#0f172a',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    width: 280,
    height: 38,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    height: 36,
    outlineStyle: 'none',
  } as any,
  horizontalScroll: {
    width: '100%',
  },
  previewTable: {
    alignSelf: 'flex-start',
  },
  superHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#cbd5e1',
    alignSelf: 'flex-start',
  },
  superHeaderBank: {
    backgroundColor: '#0284c7',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRightWidth: 3,
    borderRightColor: '#ef4444',
  },
  superHeaderTextBank: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  superHeaderStudent: {
    backgroundColor: '#16a34a',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  superHeaderTextStudent: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  pHeadRow: {
    flexDirection: 'row',
    backgroundColor: '#bae6fd',
    borderBottomWidth: 1.5,
    borderBottomColor: '#7dd3fc',
    alignSelf: 'flex-start',
  },
  pTh: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#93c5fd',
  },
  pThStudentDivider: {
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
    backgroundColor: '#dcfce7',
    borderRightColor: '#bbf7d0',
  },
  pThStudent: {
    backgroundColor: '#dcfce7',
    borderRightColor: '#bbf7d0',
  },
  pThText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  pThTextStudent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#14532d',
    textAlign: 'center',
  },
  pTr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignSelf: 'flex-start',
  },
  pTrEven: {
    backgroundColor: '#ffffff',
  },
  pTrOdd: {
    backgroundColor: '#f8fafc',
  },
  pTd: {
    paddingVertical: 9,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  pTdStudentDivider: {
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
    backgroundColor: '#f0fdf4',
  },
  pTdStudent: {
    backgroundColor: '#f0fdf4',
  },
  pTdDescMatched: {
    backgroundColor: '#fef08a',
  },
  pTdDescText: {
    fontSize: 11,
    color: '#334155',
    userSelect: 'text' as any,
  },
  pTdDescTextMatched: {
    fontWeight: '700',
    color: '#713f12',
  },
  pTdText: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    textAlign: 'center',
  },
  pTdTextMuted: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
  },
  pTdTextBold: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '800',
    textAlign: 'center',
  },
  pTdAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  pTdName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
  },
  pTdRef: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    userSelect: 'text' as any,
  },
  pTdDesc: {
    fontSize: 11,
    color: '#64748b',
    userSelect: 'text' as any,
  },
  okBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  okBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803d',
  },
  sourceBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  reasonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  noteInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    color: '#0f172a',
    width: '100%',
    height: 30,
  },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  historyStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  historyBadgeMatched: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyBadgeUnmatched: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyBadgeBills: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyMeta: {
    fontSize: 11,
    color: '#64748b',
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyViewBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  historyViewBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  historyDelBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  historyDelBtnText: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 460,
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
    fontSize: 16,
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
  studentMasterTabBtn: {
    backgroundColor: '#eef2ff',
    borderWidth: 1.5,
    borderColor: '#818cf8',
  },
  studentMasterTabBtnText: {
    color: '#4338ca',
    fontWeight: '800',
    fontSize: 14,
  },
  modalStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  modalStatCard: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  modalStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  modalStatVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1e293b',
  },
  modalUploadBox: {
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  modalChooseBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalChooseBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalCloseActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  modalCloseActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
});

