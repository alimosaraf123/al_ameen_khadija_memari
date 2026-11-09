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

export default function BankStatementMatcherScreen() {
  const scrollRef = useRef<any>(null);
  const statementInputRef = useRef<any>(null);
  const billInputRef = useRef<any>(null);
  const masterInputRef = useRef<any>(null);

  // File States
  const [statementFile, setStatementFile] = useState<any>(null);
  const [billFile, setBillFile] = useState<any>(null);
  const [billSource, setBillSource] = useState<'portal' | 'upload'>('portal');
  const [targetDate, setTargetDate] = useState<string>(getTodayDate());

  // Master State
  const [masterStatus, setMasterStatus] = useState<any>(null);
  const [masterModalOpen, setMasterModalOpen] = useState<boolean>(false);
  const [uploadingMaster, setUploadingMaster] = useState<boolean>(false);

  // Reconcile State
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'matched' | 'mismatch'>('matched');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    void loadMasterStatus();
  }, []);

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
      Alert.alert('Missing Statement', 'Please select or upload your SBI Bank Statement file (.xlsx).');
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
        formData.append('target_date', targetDate);
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
        if (data.summary.matched_count === 0) {
          Alert.alert(
            'No Matches Found',
            'No transactions matched by reference and amount. Please check the MISMATCH DETAILS tab.'
          );
        } else {
          Alert.alert(
            'Reconciliation Complete',
            `Matched ${data.summary.matched_count} transactions (₹${formatCurrency(data.summary.matched_amount)}).`
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
      const downloadUrl = `${base}/api/bank-matcher/download/${downloadToken}`;

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `Matched_Bank_Statement_${targetDate || 'reconciled'}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        await Linking.openURL(downloadUrl);
      }
    } catch (err: any) {
      Alert.alert('Download Error', err.message || 'Unable to download file.');
    }
  };

  // Filtered rows for matched table
  const filteredMatchedRows = useMemo(() => {
    const rows = result?.matched_rows || [];
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((r: any) => {
      return (
        String(r.reg_no || '').toLowerCase().includes(q) ||
        String(r.student_name || '').toLowerCase().includes(q) ||
        String(r.receipt_no || '').toLowerCase().includes(q) ||
        String(r.class_name || '').toLowerCase().includes(q) ||
        String(r.reference || '').toLowerCase().includes(q) ||
        String(r.description || '').toLowerCase().includes(q)
      );
    });
  }, [result?.matched_rows, searchQuery]);

  // Filtered rows for mismatch table
  const filteredMismatchRows = useMemo(() => {
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
        String(r.source || '').toLowerCase().includes(q)
      );
    });
  }, [result?.mismatch_rows, searchQuery]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AcademyHeader
        subtitle={
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            SBI Bank Statement + Accounts Portal Live Reconcile Engine
          </Text>
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
            onPress={() => router.push('/due-fees' as any)}
            style={styles.tabBtn}
          >
            <Text style={styles.tabBtnText}>⏳ Due Fees</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabBtn, styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, styles.tabBtnTextActive]}>
              🏦 Bank Matcher
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input Cards Container */}
        <View style={styles.cardsRow}>
          {/* Card 1: Bank Statement (Daily Upload) */}
          <View style={styles.inputCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardBadge}>Step 1</Text>
              <Text style={styles.cardTitle}>SBI Bank Statement</Text>
            </View>
            <Text style={styles.cardHint}>
              Upload your daily SBI Statement (.xlsx). Original cells & formatting remain completely unchanged.
            </Text>

            <View style={styles.fileBox}>
              {Platform.OS === 'web' && (
                <input
                  ref={statementInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleStatementFileChange}
                  style={{ display: 'none' }}
                />
              )}

              <TouchableOpacity
                style={styles.chooseFileBtn}
                onPress={() => statementInputRef.current?.click()}
              >
                <Text style={styles.chooseFileBtnText}>
                  {statementFile ? '🔄 Change Statement' : '📁 Browse Statement (.xlsx)'}
                </Text>
              </TouchableOpacity>

              {statementFile ? (
                <View style={styles.fileSelectedBadge}>
                  <Text style={styles.fileSelectedIcon}>📄</Text>
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
                <DatePickerField
                  label="Statement / Voucher Date"
                  value={targetDate}
                  onChange={setTargetDate}
                />
                <View style={styles.portalInfoBox}>
                  <Text style={styles.portalInfoText}>
                    ⚡ Automatically fetches SBI Account (19665) bank book & live fee bills for Memari across last 2 sessions (2026 & 2025).
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

          {/* Card 3: Student Details Master */}
          <View style={styles.inputCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardBadge}>Step 3</Text>
              <Text style={styles.cardTitle}>Student Master</Text>
            </View>
            <Text style={styles.cardHint}>
              Saved automatically in software. Only re-upload when student details change.
            </Text>

            <View style={styles.masterStatusBox}>
              <View style={styles.masterStatRow}>
                <Text style={styles.masterStatLabel}>Master Students:</Text>
                <Text style={styles.masterStatVal}>
                  {masterStatus?.custom_master_count || 473}
                </Text>
              </View>
              <View style={styles.masterStatRow}>
                <Text style={styles.masterStatLabel}>Database Students:</Text>
                <Text style={styles.masterStatVal}>
                  {masterStatus?.db_students_count || 247}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.updateMasterBtn}
                onPress={() => setMasterModalOpen(true)}
              >
                <Text style={styles.updateMasterBtnText}>
                  📤 Upload / Replace Master Excel
                </Text>
              </TouchableOpacity>
            </View>
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

            {/* Download Matched Excel Banner */}
            <View style={styles.downloadBanner}>
              <View style={styles.downloadBannerLeft}>
                <Text style={styles.downloadBannerTitle}>
                  🎉 Statement Reconciled Successfully!
                </Text>
                <Text style={styles.downloadBannerSubtitle}>
                  Sheet 1 preserves original SBI Statement + 6 added columns (Reg. No., Recpt. No., Amount, Class, Name, Check). Sheet 2 contains full MISMATCH DETAILS + Summary Box.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.downloadExcelBtn}
                onPress={handleDownloadMatchedExcel}
              >
                <Text style={styles.downloadExcelBtnText}>
                  📥 Download Matched Excel (.xlsx)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Results Preview Card with Search & Tabs */}
            <View style={styles.previewCard}>
              <View style={styles.previewHeaderRow}>
                {/* Result Tabs */}
                <View style={styles.previewTabsRow}>
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
                      activeResultTab === 'mismatch' && styles.previewTabActive,
                    ]}
                    onPress={() => setActiveResultTab('mismatch')}
                  >
                    <Text
                      style={[
                        styles.previewTabText,
                        activeResultTab === 'mismatch' && styles.previewTabTextActive,
                      ]}
                    >
                      ⚠️ Mismatches & Unmatched ({result.mismatch_rows?.length || 0})
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
                {activeResultTab === 'matched' ? (
                  <View style={styles.previewTable}>
                    <View style={styles.pHeadRow}>
                      <View style={[styles.pTh, { width: 60 }]}>
                        <Text style={styles.pThText}>Sl No</Text>
                      </View>
                      <View style={[styles.pTh, { width: 90 }]}>
                        <Text style={styles.pThText}>Reg. No.</Text>
                      </View>
                      <View style={[styles.pTh, { width: 90 }]}>
                        <Text style={styles.pThText}>Recpt. No.</Text>
                      </View>
                      <View style={[styles.pTh, { width: 110 }]}>
                        <Text style={styles.pThText}>Amount</Text>
                      </View>
                      <View style={[styles.pTh, { width: 100 }]}>
                        <Text style={styles.pThText}>Class</Text>
                      </View>
                      <View style={[styles.pTh, { width: 200, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Student Name</Text>
                      </View>
                      <View style={[styles.pTh, { width: 80 }]}>
                        <Text style={styles.pThText}>Check</Text>
                      </View>
                      <View style={[styles.pTh, { width: 160 }]}>
                        <Text style={styles.pThText}>UPI / Ref No.</Text>
                      </View>
                      <View style={[styles.pTh, { width: 300, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Statement Description</Text>
                      </View>
                    </View>

                    {filteredMatchedRows.map((row: any, idx: number) => (
                      <View
                        key={`matched_${idx}`}
                        style={[styles.pTr, idx % 2 === 0 ? styles.pTrEven : styles.pTrOdd]}
                      >
                        <View style={[styles.pTd, { width: 60 }]}>
                          <Text style={styles.pTdTextMuted}>{idx + 1}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 90 }]}>
                          <Text style={styles.pTdTextBold}>{row.reg_no}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 90 }]}>
                          <Text style={styles.pTdText}>{row.receipt_no}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 110 }]}>
                          <Text style={styles.pTdAmount}>₹{formatCurrency(row.amount)}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 100 }]}>
                          <Text style={styles.pTdText}>{row.class_name}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 200, alignItems: 'flex-start' }]}>
                          <Text style={styles.pTdName}>{row.student_name}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 80 }]}>
                          <View style={styles.okBadge}>
                            <Text style={styles.okBadgeText}>OK</Text>
                          </View>
                        </View>
                        <View style={[styles.pTd, { width: 160 }]}>
                          <Text style={styles.pTdRef}>{row.reference}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 300, alignItems: 'flex-start' }]}>
                          <Text style={styles.pTdDesc} numberOfLines={1}>
                            {row.description}
                          </Text>
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
                      <View style={[styles.pTh, { width: 160, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Reason</Text>
                      </View>
                      <View style={[styles.pTh, { width: 140 }]}>
                        <Text style={styles.pThText}>Statement Ref</Text>
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
                      <View style={[styles.pTh, { width: 280, alignItems: 'flex-start' }]}>
                        <Text style={styles.pThText}>Particulars / Description</Text>
                      </View>
                    </View>

                    {filteredMismatchRows.map((row: any, idx: number) => (
                      <View
                        key={`mismatch_${idx}`}
                        style={[styles.pTr, idx % 2 === 0 ? styles.pTrEven : styles.pTrOdd]}
                      >
                        <View style={[styles.pTd, { width: 80 }]}>
                          <View style={styles.sourceBadge}>
                            <Text style={styles.sourceBadgeText}>{row.source}</Text>
                          </View>
                        </View>
                        <View style={[styles.pTd, { width: 160, alignItems: 'flex-start' }]}>
                          <Text style={styles.reasonText}>{row.reason}</Text>
                        </View>
                        <View style={[styles.pTd, { width: 140 }]}>
                          <Text style={styles.pTdRef}>{row.statement_ref || row.inst_no || '-'}</Text>
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
                        <View style={[styles.pTd, { width: 280, alignItems: 'flex-start' }]}>
                          <Text style={styles.pTdDesc} numberOfLines={1}>
                            {row.particulars || row.description || '-'}
                          </Text>
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
              <Text style={styles.modalTitle}>📤 Update Student Details Master</Text>
              <TouchableOpacity onPress={() => setMasterModalOpen(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalNote}>
              Upload your Registration Master Excel (.xlsx). The file must contain columns named{' '}
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
    minWidth: 1050,
  },
  pHeadRow: {
    flexDirection: 'row',
    backgroundColor: '#bae6fd',
    borderBottomWidth: 1.5,
    borderBottomColor: '#7dd3fc',
  },
  pTh: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#93c5fd',
  },
  pThText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  pTr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
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
  },
  pTdDesc: {
    fontSize: 11,
    color: '#64748b',
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
