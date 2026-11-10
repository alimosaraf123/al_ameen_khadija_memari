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

export interface ColumnDef {
  key: string;
  label: string;
  width: number;
  isStudent?: boolean;
  isDivider?: boolean;
  align?: 'flex-start' | 'center' | 'flex-end';
}

export const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'statement_row', label: '#', width: 45, align: 'center' },
  { key: 'date', label: 'Txn Date', width: 95, align: 'center' },
  { key: 'value_date', label: 'Value Date', width: 95, align: 'center' },
  { key: 'description', label: 'Description', width: 500, align: 'flex-start' },
  { key: 'ref_no', label: 'Ref No./Cheque No.', width: 240, align: 'center' },
  { key: 'branch_code', label: 'Branch', width: 75, align: 'center' },
  { key: 'debit', label: 'Debit', width: 85, align: 'center' },
  { key: 'credit', label: 'Credit', width: 95, align: 'center' },
  { key: 'balance', label: 'Balance', width: 95, align: 'center' },
  { key: 'reg_no', label: 'Reg. No.', width: 90, isStudent: true, isDivider: true, align: 'center' },
  { key: 'student_name', label: 'Student Name', width: 180, isStudent: true, align: 'flex-start' },
  { key: 'class_name', label: 'Class', width: 100, isStudent: true, align: 'center' },
  { key: 'receipt_no', label: 'Recpt. No.', width: 90, isStudent: true, align: 'center' },
  { key: 'amount', label: 'Amount', width: 100, isStudent: true, align: 'center' },
  { key: 'bill_date', label: 'Bill Date', width: 105, isStudent: true, align: 'center' },
  { key: 'note', label: 'Note', width: 220, isStudent: true, align: 'flex-start' },
];

export const parseDateToTimestamp = (dStr: any): number => {
  if (!dStr) return 0;
  const s = String(dStr).trim();
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])).getTime();
  }
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime();
  }
  const parsed = Date.parse(s);
  return isNaN(parsed) ? 0 : parsed;
};

export const getRowValue = (row: any, colKey: string, notesMap?: Record<string, string>, idx?: number) => {
  if (!row) return '';
  switch (colKey) {
    case 'statement_row':
      return row.statement_row ?? (idx !== undefined ? idx + 1 : '');
    case 'date':
      return row.date || '';
    case 'value_date':
      return row.value_date || row.date || '';
    case 'description':
      return row.description || '';
    case 'ref_no':
      return row.ref_no || '';
    case 'branch_code':
      return row.branch_code || '';
    case 'debit':
      return row.debit !== null && row.debit !== undefined && row.debit !== '' ? Number(row.debit) : '';
    case 'credit':
      return row.credit !== null && row.credit !== undefined && row.credit !== '' ? Number(row.credit) : '';
    case 'balance':
      return row.balance !== null && row.balance !== undefined && row.balance !== '' ? Number(row.balance) : '';
    case 'reg_no':
      return row.is_matched ? (row.reg_no || '') : '';
    case 'student_name':
      return row.is_matched ? (row.student_name || '') : '';
    case 'class_name':
      return row.is_matched ? (row.class_name || '') : '';
    case 'receipt_no':
      return row.is_matched ? (row.receipt_no || '') : '';
    case 'amount':
      return row.is_matched && row.amount !== null && row.amount !== undefined ? Number(row.amount) : '';
    case 'bill_date':
      return row.is_matched ? (row.bill_date || '') : '';
    case 'note': {
      const rowKey = String(row.statement_row ?? (row.ref_no ? row.ref_no : idx ?? ''));
      return (notesMap && notesMap[rowKey] !== undefined ? notesMap[rowKey] : (row.note || '')).trim();
    }
    default:
      return row[colKey] !== undefined && row[colKey] !== null ? row[colKey] : '';
  }
};

export const sortAndFilterRows = (
  rawRows: any[],
  tab: 'all' | 'matched' | 'unmatched_statement' | 'mismatch_bills',
  globalQuery: string,
  colFilters: Record<string, string>,
  sortCol: string | null,
  sortDir: 'asc' | 'desc',
  notesMap: Record<string, string>
) => {
  let rows = [...rawRows];

  // 1. Tab filter
  if (tab === 'matched') {
    rows = rows.filter((r) => r.is_matched);
  } else if (tab === 'unmatched_statement') {
    rows = rows.filter((r) => !r.is_matched);
  }

  // 2. Global search query
  if (globalQuery && globalQuery.trim()) {
    const q = globalQuery.toLowerCase().trim();
    rows = rows.filter((r, idx) => {
      return (
        String(r.reg_no || '').toLowerCase().includes(q) ||
        String(r.student_name || '').toLowerCase().includes(q) ||
        String(r.receipt_no || '').toLowerCase().includes(q) ||
        String(r.bill_date || '').toLowerCase().includes(q) ||
        String(r.class_name || '').toLowerCase().includes(q) ||
        String(r.description || '').toLowerCase().includes(q) ||
        String(r.ref_no || '').toLowerCase().includes(q) ||
        String(r.date || '').toLowerCase().includes(q) ||
        String(r.credit || '').toLowerCase().includes(q) ||
        String(r.debit || '').toLowerCase().includes(q) ||
        String(getRowValue(r, 'note', notesMap, idx)).toLowerCase().includes(q)
      );
    });
  }

  // 3. Column-specific filters
  for (const [colKey, filterVal] of Object.entries(colFilters)) {
    if (!filterVal || !filterVal.trim()) continue;
    const lowerFilter = filterVal.toLowerCase().trim();

    rows = rows.filter((r, idx) => {
      const rawVal = getRowValue(r, colKey, notesMap, idx);
      if (filterVal === '__has_note__') {
        return String(rawVal).trim().length > 0;
      }
      if (filterVal === '__no_note__') {
        return String(rawVal).trim().length === 0;
      }
      if (filterVal === '__blank__') {
        return String(rawVal).trim() === '' || rawVal === null || rawVal === undefined;
      }
      return String(rawVal).toLowerCase().includes(lowerFilter);
    });
  }

  // 4. Sorting
  if (sortCol) {
    const isDateCol = sortCol === 'date' || sortCol === 'value_date' || sortCol === 'bill_date';
    const isNumCol =
      sortCol === 'amount' ||
      sortCol === 'credit' ||
      sortCol === 'debit' ||
      sortCol === 'balance' ||
      sortCol === 'statement_row';

    rows.sort((a, b) => {
      const valA = getRowValue(a, sortCol, notesMap);
      const valB = getRowValue(b, sortCol, notesMap);

      let diff = 0;
      if (isDateCol) {
        diff = parseDateToTimestamp(valA) - parseDateToTimestamp(valB);
      } else if (isNumCol) {
        const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/[^0-9.-]+/g, '')) || 0;
        const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/[^0-9.-]+/g, '')) || 0;
        diff = numA - numB;
      } else {
        diff = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDir === 'asc' ? diff : -diff;
    });
  }

  return rows;
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

  // Master Daily Register State
  const [pageMode, setPageMode] = useState<'reconcile' | 'register'>('register');
  const [registerDates, setRegisterDates] = useState<any[]>([]);
  const [loadingRegister, setLoadingRegister] = useState<boolean>(false);
  const [expandedDates, setExpandedDates] = useState<Record<number, boolean>>({});
  const [selectedFilterDate, setSelectedFilterDate] = useState<string>('all');
  const [registerSearchQuery, setRegisterSearchQuery] = useState<string>('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteStatus, setNoteStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [savingSession, setSavingSession] = useState<boolean>(false);
  const [currentSavedId, setCurrentSavedId] = useState<number | null>(null);

  // Column-level filters and sorting for Tables
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeFilterMenuCol, setActiveFilterMenuCol] = useState<ColumnDef | null>(null);
  const [colSearchQuery, setColSearchQuery] = useState<string>('');

  const openColumnMenu = (col: ColumnDef) => {
    setActiveFilterMenuCol(col);
    setColSearchQuery(columnFilters[col.key] || '');
  };

  const handleSort = (colKey: string, direction: 'asc' | 'desc') => {
    if (sortColumn === colKey && sortDirection === direction) {
      setSortColumn(null);
    } else {
      setSortColumn(colKey);
      setSortDirection(direction);
    }
  };

  const handleApplyFilter = (colKey: string, value: string) => {
    setColumnFilters((prev) => {
      const updated = { ...prev };
      if (!value || !value.trim()) {
        delete updated[colKey];
      } else {
        updated[colKey] = value;
      }
      return updated;
    });
  };

  const handleClearColumnFilter = (colKey: string) => {
    setColumnFilters((prev) => {
      const updated = { ...prev };
      delete updated[colKey];
      return updated;
    });
    if (sortColumn === colKey) {
      setSortColumn(null);
    }
  };

  const handleClearAllFilters = () => {
    setColumnFilters({});
    setSortColumn(null);
    setSearchQuery('');
    setRegisterSearchQuery('');
  };

  // Filtered dates and search across all dates in Master Register
  const filteredRegisterDates = useMemo(() => {
    let list = registerDates;
    if (selectedFilterDate !== 'all') {
      list = list.filter(
        (d) =>
          String(d.id) === selectedFilterDate ||
          d.from_date === selectedFilterDate ||
          d.to_date === selectedFilterDate
      );
    }

    const hasColFilters = Object.keys(columnFilters).length > 0;
    const hasColSort = Boolean(sortColumn);
    const hasGlobalQ = Boolean(registerSearchQuery.trim());

    if (!hasColFilters && !hasColSort && !hasGlobalQ) return list;

    const q = registerSearchQuery.toLowerCase().trim();

    return list
      .map((d) => {
        const rows = sortAndFilterRows(
          d.statement_rows || [],
          'all',
          q,
          columnFilters,
          sortColumn,
          sortDirection,
          notes
        );
        return {
          ...d,
          statement_rows: rows,
        };
      })
      .filter((d) => d.statement_rows.length > 0 || (q && String(d.from_date).includes(q)));
  }, [registerDates, selectedFilterDate, registerSearchQuery, columnFilters, sortColumn, sortDirection, notes]);

  // Grand summary across all saved dates in register
  const grandSummary = useMemo(() => {
    let totalTxns = 0;
    let totalMatched = 0;
    let totalMatchedAmt = 0;
    let totalUnmatched = 0;
    registerDates.forEach((d) => {
      totalTxns += d.statement_rows?.length || 0;
      totalMatched += d.summary?.matched_count || 0;
      totalMatchedAmt += Number(d.summary?.matched_amount || 0);
      totalUnmatched += d.summary?.statement_unmatched_count || 0;
    });
    return {
      dateCount: registerDates.length,
      totalTxns,
      totalMatched,
      totalMatchedAmt,
      totalUnmatched,
    };
  }, [registerDates]);

  useEffect(() => {
    void loadMasterStatus();
    void loadRegister();
  }, []);

  const loadRegister = async () => {
    try {
      setLoadingRegister(true);
      const data = await api('/api/bank-matcher/register');
      if (data?.success && data.dates) {
        setRegisterDates(data.dates);
        // By default expand all loaded dates
        const exp: Record<number, boolean> = {};
        const notesObj: Record<string, string> = {};
        data.dates.forEach((d: any) => {
          exp[d.id] = true;
          if (d.notes_map) {
            Object.keys(d.notes_map).forEach((k) => {
              notesObj[`${d.id}_${k}`] = d.notes_map[k];
            });
          }
          if (Array.isArray(d.statement_rows)) {
            d.statement_rows.forEach((r: any, idx: number) => {
              const k = String(r.statement_row ?? (r.ref_no || idx));
              if (r.note && notesObj[`${d.id}_${k}`] === undefined) {
                notesObj[`${d.id}_${k}`] = r.note;
              }
            });
          }
        });
        setExpandedDates(exp);
        setNotes((prev) => ({ ...prev, ...notesObj }));
      }
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('unauthorized') || String(err?.message || '').includes('login')) {
        return;
      }
      console.warn('Could not load register:', err?.message || err);
    } finally {
      setLoadingRegister(false);
    }
  };

  // Real-time note auto-save for individual transactions in register
  const saveSingleNote = async (recordId: number, rowKey: string, noteText: string) => {
    if (!recordId) return;
    const noteMapKey = `${recordId}_${rowKey}`;
    try {
      setNoteStatus((prev) => ({ ...prev, [noteMapKey]: 'saving' }));
      const res = await api('/api/bank-matcher/save-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recordId,
          row_key: rowKey,
          note: noteText,
        }),
      });
      if (res?.success) {
        setNoteStatus((prev) => ({ ...prev, [noteMapKey]: 'saved' }));
        // Update local registerDates state
        setRegisterDates((prev) =>
          prev.map((d) => {
            if (d.id !== recordId) return d;
            const updatedRows = (d.statement_rows || []).map((r: any, idx: number) => {
              const k = String(r.statement_row ?? (r.ref_no || idx));
              if (k === String(rowKey)) {
                return { ...r, note: noteText };
              }
              return r;
            });
            const updatedMap = { ...(d.notes_map || {}), [rowKey]: noteText };
            return { ...d, statement_rows: updatedRows, notes_map: updatedMap };
          })
        );
        // Also update in result if loaded
        if (currentSavedId === recordId) {
          setResult((prev: any) => {
            if (!prev?.statement_rows) return prev;
            const updated = prev.statement_rows.map((r: any, idx: number) => {
              const k = String(r.statement_row ?? (r.ref_no || idx));
              if (k === String(rowKey)) {
                return { ...r, note: noteText };
              }
              return r;
            });
            return { ...prev, statement_rows: updated };
          });
        }
        setTimeout(() => {
          setNoteStatus((prev) => {
            const copy = { ...prev };
            delete copy[noteMapKey];
            return copy;
          });
        }, 2200);
      } else {
        setNoteStatus((prev) => ({ ...prev, [noteMapKey]: 'error' }));
      }
    } catch {
      setNoteStatus((prev) => ({ ...prev, [noteMapKey]: 'error' }));
    }
  };

  const handleDeleteDate = async (id: number, dateLabel: string) => {
    if (Platform.OS === 'web') {
      const ok = window.confirm(`Are you sure you want to delete all reconciliation records for date: ${dateLabel}?`);
      if (!ok) return;
    }
    try {
      const res = await api(`/api/bank-matcher/history/${id}`, { method: 'DELETE' });
      if (res?.success) {
        setRegisterDates((prev) => prev.filter((d) => d.id !== id));
        if (currentSavedId === id) {
          setCurrentSavedId(null);
          setResult(null);
        }
      }
    } catch (err: any) {
      Alert.alert('Delete Error', err.message || 'Failed to delete record.');
    }
  };

  const handleDownloadDateExcel = (token: string | null) => {
    if (!token) {
      Alert.alert('Download Error', 'No Excel file ready for download for this date.');
      return;
    }
    const url = `${getApiBase()}/api/bank-matcher/download/${token}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      void Linking.openURL(url);
    }
  };

  const handleDownloadConsolidatedExcel = async () => {
    try {
      const token = await getToken();
      const base = getApiBase();
      let url = `${base}/api/bank-matcher/export-consolidated`;
      if (selectedFilterDate !== 'all') {
        url += `?from_date=${selectedFilterDate}&to_date=${selectedFilterDate}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.success && data.download_token) {
        const downloadUrl = `${base}/api/bank-matcher/download/${data.download_token}`;
        if (Platform.OS === 'web') {
          window.open(downloadUrl, '_blank');
        } else {
          void Linking.openURL(downloadUrl);
        }
      } else {
        Alert.alert('Export Error', data?.message || 'Could not export consolidated register.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to export consolidated register.');
    }
  };

  const handleSaveSession = async () => {
    if (!result) return;
    try {
      setSavingSession(true);

      // Embed all current notes into statement_rows before saving
      const statementRowsWithNotes = (result.statement_rows || []).map((r: any, idx: number) => {
        const k = String(r.statement_row ?? (r.ref_no || idx));
        const n = notes[k] !== undefined ? notes[k] : (r.note || '');
        return { ...r, note: n };
      });

      const payload = {
        id: currentSavedId || undefined,
        statement_filename: statementFile?.name || 'SBI_Statement.xlsx',
        from_date: fromDate,
        to_date: toDate,
        summary: result.summary,
        statement_rows: statementRowsWithNotes,
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
        setResult((prev: any) => ({
          ...prev,
          statement_rows: statementRowsWithNotes,
        }));
        Alert.alert(
          'Saved Successfully',
          'Reconciled statement and all custom notes have been saved permanently to the database.\nYou can reopen this anytime from the Date-wise Saved Archive.'
        );
        void loadRegister();
      } else {
        Alert.alert('Save Failed', res?.message || 'Could not save session.');
      }
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save session.');
    } finally {
      setSavingSession(false);
    }
  };

  const loadMasterStatus = async () => {
    try {
      const data = await api('/api/bank-matcher/master');
      if (data?.success) {
        setMasterStatus(data);
      }
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('unauthorized') || String(err?.message || '').includes('login')) {
        return;
      }
      console.warn('Could not load master status:', err?.message || err);
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
          void loadRegister();
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

  // Distinct values for the currently active filter column menu
  const distinctValuesForActiveCol = useMemo(() => {
    if (!activeFilterMenuCol) return [];
    const counts: Record<string, number> = {};
    const colKey = activeFilterMenuCol.key;
    const isRegister = pageMode === 'register';

    const sourceRows = isRegister
      ? registerDates.flatMap((d) => d.statement_rows || [])
      : (result?.statement_rows || []);

    for (const r of sourceRows) {
      const raw = getRowValue(r, colKey, notes);
      const strVal = String(raw !== null && raw !== undefined ? raw : '').trim();
      const displayKey = strVal || '(Blank)';
      counts[displayKey] = (counts[displayKey] || 0) + 1;
    }

    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeFilterMenuCol, pageMode, registerDates, result?.statement_rows, notes]);

  // Filtered statement rows based on activeResultTab ('all' | 'matched' | 'unmatched_statement'), search, and column filters
  const filteredStatementRows = useMemo(() => {
    return sortAndFilterRows(
      allStatementRows,
      activeResultTab,
      searchQuery,
      columnFilters,
      sortColumn,
      sortDirection,
      notes
    );
  }, [allStatementRows, activeResultTab, searchQuery, columnFilters, sortColumn, sortDirection, notes]);

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

  const renderTableHeader = () => (
    <View style={styles.pHeadRow}>
      {TABLE_COLUMNS.map((col, cIdx) => {
        const isSorted = sortColumn === col.key;
        const filterVal = columnFilters[col.key];
        const hasFilter = Boolean(filterVal && filterVal.trim());
        const isLast = cIdx === TABLE_COLUMNS.length - 1;

        return (
          <TouchableOpacity
            key={`th_${col.key}`}
            activeOpacity={0.7}
            style={[
              styles.pTh,
              col.isDivider && styles.pThStudentDivider,
              col.isStudent && styles.pThStudent,
              { width: col.width },
              isLast && { borderRightWidth: 0 },
              hasFilter && (col.isStudent ? styles.pThFilteredStudent : styles.pThFiltered),
              isSorted && (col.isStudent ? styles.pThSortedStudent : styles.pThSorted),
            ]}
            onPress={() => openColumnMenu(col)}
          >
            <View
              style={[
                styles.thInnerRow,
                col.align === 'flex-start' ? { justifyContent: 'flex-start' } : { justifyContent: 'center' },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  col.isStudent ? styles.pThTextStudent : styles.pThText,
                  (hasFilter || isSorted) && styles.pThTextHighlighted,
                ]}
              >
                {col.label}
              </Text>
              <View style={[styles.thBadgeWrap, hasFilter && styles.thBadgeWrapActive]}>
                {isSorted ? (
                  <Text style={styles.sortIndicator}>{sortDirection === 'asc' ? '▲' : '▼'}</Text>
                ) : (
                  <Text style={[styles.filterIndicator, hasFilter && styles.filterIndicatorActive]}>
                    {hasFilter ? '▼' : '▾'}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderActiveFiltersBar = (totalCount: number, filteredCount: number) => {
    const hasColFilters = Object.keys(columnFilters).length > 0;
    const hasColSort = Boolean(sortColumn);
    if (!hasColFilters && !hasColSort) return null;

    return (
      <View style={styles.activeFiltersBar}>
        <View style={styles.activeFiltersLeft}>
          <Text style={styles.activeFiltersLabel}>⚡ Active Filters:</Text>
          {sortColumn && (
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>
                Sort: {TABLE_COLUMNS.find((c) => c.key === sortColumn)?.label} ({sortDirection === 'asc' ? 'Asc ↑' : 'Desc ↓'})
              </Text>
              <TouchableOpacity onPress={() => setSortColumn(null)} style={styles.filterChipRemoveBtn}>
                <Text style={styles.filterChipRemove}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {Object.entries(columnFilters).map(([k, v]) => {
            const col = TABLE_COLUMNS.find((c) => c.key === k);
            const labelText = v === '__has_note__' ? 'Has Note' : v === '__no_note__' ? 'No Note' : v === '__blank__' ? 'Blank' : v;
            return (
              <View key={`af_${k}`} style={styles.filterChip}>
                <Text style={styles.filterChipText}>
                  {col?.label || k}: <Text style={{ fontWeight: '700' }}>"{labelText}"</Text>
                </Text>
                <TouchableOpacity onPress={() => handleClearColumnFilter(k)} style={styles.filterChipRemoveBtn}>
                  <Text style={styles.filterChipRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity style={styles.clearAllFiltersBtn} onPress={handleClearAllFilters}>
            <Text style={styles.clearAllFiltersBtnText}>Clear All Filters</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.filteredCountText}>
          Showing {filteredCount} of {totalCount} rows
        </Text>
      </View>
    );
  };

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
        </View>

        {/* Mode Toggle Bar */}
        <View style={styles.modeToggleBar}>
          <TouchableOpacity
            style={[styles.modeToggleTab, pageMode === 'register' && styles.modeToggleTabActive]}
            onPress={() => {
              setPageMode('register');
              setExpandedDates({});
              void loadRegister();
            }}
          >
            <Text style={[styles.modeToggleTabText, pageMode === 'register' && styles.modeToggleTabTextActive]}>
              📖 Master Daily Register{registerDates.length ? ` (${registerDates.length} Days)` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeToggleTab, pageMode === 'reconcile' && styles.modeToggleTabActive]}
            onPress={() => setPageMode('reconcile')}
          >
            <Text style={[styles.modeToggleTabText, pageMode === 'reconcile' && styles.modeToggleTabTextActive]}>
              ⚡ Reconcile New Statement
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
      <View style={styles.registerContainer}>
        {/* Master Register Header Bar */}
        <View style={styles.registerHeaderCard}>
          <View style={styles.registerHeaderTop}>
            <View style={{ flex: 1, minWidth: 260 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.registerTitle}>📖 Master Daily Bank Register</Text>
                <View style={styles.liveCountBadge}>
                  <Text style={styles.liveCountBadgeText}>{registerDates.length} Days Recorded</Text>
                </View>
              </View>
              <Text style={styles.registerSubtitle}>
                Chronological master register of bank statements and matched student fee receipts.
              </Text>
            </View>

            {/* Right Quick Actions */}
            <View style={styles.registerTopActions}>
              <TouchableOpacity
                style={styles.exportAllBtn}
                onPress={() => void handleDownloadConsolidatedExcel()}
              >
                <Text style={styles.exportAllBtnText}>📥 Export Master Excel (All Dates / 1 Month)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.expandAllBtn}
                onPress={() => {
                  const anyExp = registerDates.some((d) => Boolean(expandedDates[d.id]));
                  const next: Record<number, boolean> = {};
                  registerDates.forEach((d) => {
                    next[d.id] = !anyExp;
                  });
                  setExpandedDates(next);
                }}
              >
                <Text style={styles.expandAllBtnText}>
                  {registerDates.some((d) => Boolean(expandedDates[d.id])) ? '▴ Collapse All' : '▾ Expand All'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.refreshRegBtn}
                onPress={() => void loadRegister()}
              >
                <Text style={styles.refreshRegBtnText}>🔄 Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Grand Summary Across All Dates */}
          <View style={styles.grandSummaryRow}>
            <View style={[styles.grandStatCard, { borderLeftColor: '#3b82f6' }]}>
              <Text style={styles.grandStatLabel}>RECORDED DATES</Text>
              <Text style={[styles.grandStatVal, { color: '#1d4ed8' }]}>{grandSummary.dateCount} Days</Text>
            </View>
            <View style={[styles.grandStatCard, { borderLeftColor: '#0284c7' }]}>
              <Text style={styles.grandStatLabel}>TOTAL STATEMENT TXNS</Text>
              <Text style={[styles.grandStatVal, { color: '#0369a1' }]}>{grandSummary.totalTxns}</Text>
            </View>
            <View style={[styles.grandStatCard, { borderLeftColor: '#22c55e' }]}>
              <Text style={styles.grandStatLabel}>TOTAL MATCHED</Text>
              <Text style={[styles.grandStatVal, { color: '#15803d' }]}>{grandSummary.totalMatched}</Text>
              <Text style={styles.grandStatSub}>₹{formatCurrency(grandSummary.totalMatchedAmt)}</Text>
            </View>
            <View style={[styles.grandStatCard, { borderLeftColor: '#f59e0b' }]}>
              <Text style={styles.grandStatLabel}>TOTAL STMT UNMATCHED</Text>
              <Text style={[styles.grandStatVal, { color: '#b45309' }]}>{grandSummary.totalUnmatched}</Text>
            </View>
          </View>

          {/* Filter Controls Row: Date Chips & Search Box */}
          <View style={styles.registerFilterRow}>
            {/* Date Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateChipsScroll}>
              <TouchableOpacity
                style={[styles.dateChip, selectedFilterDate === 'all' && styles.dateChipActive]}
                onPress={() => setSelectedFilterDate('all')}
              >
                <Text style={[styles.dateChipText, selectedFilterDate === 'all' && styles.dateChipTextActive]}>
                  All Dates ({registerDates.length})
                </Text>
              </TouchableOpacity>
              {registerDates.map((d) => {
                const isSelected = selectedFilterDate === String(d.id) || selectedFilterDate === d.from_date;
                const dateLabel = d.to_date && d.to_date !== d.from_date
                  ? `${formatDateDisplay(d.from_date)} → ${formatDateDisplay(d.to_date)}`
                  : formatDateDisplay(d.from_date);
                return (
                  <TouchableOpacity
                    key={`chip_${d.id}`}
                    style={[styles.dateChip, isSelected && styles.dateChipActive]}
                    onPress={() => {
                      const nextFilter = selectedFilterDate === String(d.id) ? 'all' : String(d.id);
                      setSelectedFilterDate(nextFilter);
                      if (nextFilter !== 'all') {
                        setExpandedDates((prev) => ({ ...prev, [d.id]: true }));
                      }
                    }}
                  >
                    <Text style={[styles.dateChipText, isSelected && styles.dateChipTextActive]}>
                      📅 {dateLabel} ({d.statement_rows?.length || 0})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Instant Search Bar */}
            <View style={styles.registerSearchBox}>
              <Text style={{ marginRight: 6 }}>🔍</Text>
              <TextInput
                style={styles.registerSearchInput}
                placeholder="Search across all dates (student, reg, ref, desc, note)..."
                placeholderTextColor="#94a3b8"
                value={registerSearchQuery}
                onChangeText={setRegisterSearchQuery}
              />
              {registerSearchQuery ? (
                <TouchableOpacity onPress={() => setRegisterSearchQuery('')}>
                  <Text style={{ color: '#94a3b8', padding: 4 }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {renderActiveFiltersBar(
          grandSummary.totalTxns,
          filteredRegisterDates.reduce((s, d) => s + (d.statement_rows?.length || 0), 0)
        )}

        {/* Date-wise Sections - Chronologically rendered one after another! */}
        {loadingRegister ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={{ marginTop: 12, color: '#64748b', fontWeight: '600' }}>
              Loading Master Daily Register...
            </Text>
          </View>
        ) : filteredRegisterDates.length === 0 ? (
          <View style={styles.emptyRegisterCard}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#64748b' }}>
              No reconciliation records found.
            </Text>
            <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
              Reconcile a bank statement in the 'Reconcile New Statement' tab to automatically record it here by date.
            </Text>
          </View>
        ) : (
          filteredRegisterDates.map((dateItem) => {
            const isExp = Boolean(expandedDates[dateItem.id]);
            const dateLabel = `${formatDateDisplay(dateItem.from_date)}${
              dateItem.to_date && dateItem.to_date !== dateItem.from_date ? ' to ' + formatDateDisplay(dateItem.to_date) : ''
            }`;
            return (
              <View key={`date_sec_${dateItem.id}`} style={styles.dateSectionContainer}>
                {/* Sticky Date Banner */}
                <View style={styles.dateSectionBanner}>
                  <View style={{ flex: 1, minWidth: 260 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Text style={styles.dateSectionTitle}>📅 {dateLabel}</Text>
                      <View style={styles.dateSectionBadgeTotal}>
                        <Text style={styles.dateSectionBadgeTotalText}>
                          {dateItem.statement_rows.length} Txns
                        </Text>
                      </View>
                      <View style={styles.dateSectionBadgeMatched}>
                        <Text style={styles.dateSectionBadgeMatchedText}>
                          ✅ {dateItem.summary?.matched_count || 0} Matched (₹{formatCurrency(dateItem.summary?.matched_amount || 0)})
                        </Text>
                      </View>
                      <View style={styles.dateSectionBadgeUnmatched}>
                        <Text style={styles.dateSectionBadgeUnmatchedText}>
                          ⚠️ {dateItem.summary?.statement_unmatched_count || 0} Stmt Unmatched
                        </Text>
                      </View>
                      {dateItem.summary?.bill_unmatched_count > 0 && (
                        <View style={styles.dateSectionBadgeBills}>
                          <Text style={styles.dateSectionBadgeBillsText}>
                            📑 {dateItem.summary?.bill_unmatched_count} Bill Unmatched
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.dateSectionMeta}>
                      📁 File: {dateItem.statement_filename || 'SBI'} • 👤 Reconciled by: {dateItem.created_by || 'Staff'} • 🕒 {formatDateDisplay(dateItem.created_at)}
                    </Text>
                  </View>

                  {/* Right Actions */}
                  <View style={styles.dateSectionActions}>
                    {dateItem.download_token ? (
                      <TouchableOpacity
                        style={styles.dateDownloadBtn}
                        onPress={() => handleDownloadDateExcel(dateItem.download_token)}
                      >
                        <Text style={styles.dateDownloadBtnText}>📥 Download Excel</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.dateToggleBtn}
                      onPress={() => {
                        setExpandedDates((prev) => ({
                          ...prev,
                          [dateItem.id]: !isExp,
                        }));
                      }}
                    >
                      <Text style={styles.dateToggleBtnText}>
                        {isExp ? '🔼 Collapse' : '🔽 Expand'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.dateDeleteBtn}
                      onPress={() => handleDeleteDate(dateItem.id, dateLabel)}
                    >
                      <Text style={styles.dateDeleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Table for this date */}
                {isExp ? (
                  <ScrollView horizontal style={styles.horizontalScroll}>
                    <View style={styles.previewTable}>
                      {/* Super Header */}
                      <View style={styles.superHeaderRow}>
                        <View style={[styles.superHeaderBank, { width: 1325 }]}>
                          <Text style={styles.superHeaderTextBank}>
                            🏦 ORIGINAL BANK STATEMENT (UNCHANGED COLUMNS)
                          </Text>
                        </View>
                        <View style={[styles.superHeaderStudent, { width: 885 }]}>
                          <Text style={styles.superHeaderTextStudent}>
                            🎓 MATCHED STUDENT DETAILS & NOTES (ADDED BESIDE BALANCE)
                          </Text>
                        </View>
                      </View>

                      {/* Column Headers */}
                      {renderTableHeader()}

                      {/* Rows */}
                      {dateItem.statement_rows.map((row: any, idx: number) => {
                        const rowKey = String(row.statement_row ?? (row.ref_no ? row.ref_no : idx));
                        const noteMapKey = `${dateItem.id}_${rowKey}`;
                        const rowNote = notes[noteMapKey] !== undefined ? notes[noteMapKey] : (row.note || '');
                        const status = noteStatus[noteMapKey];
                        return (
                          <View
                            key={`d_${dateItem.id}_r_${rowKey}_${idx}`}
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
                            <View
                              style={[
                                styles.pTd,
                                { width: 500, alignItems: 'flex-start' },
                                row.is_matched && styles.pTdMatchedHighlight,
                              ]}
                              {...(Platform.OS === 'web' ? ({ title: row.description || '' } as any) : {})}
                            >
                              <Text
                                style={[styles.pTdDesc, row.is_matched && styles.pTdMatchedDescText]}
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
                              <Text style={styles.pTdAmount}>
                                {row.debit ? `₹${formatCurrency(row.debit)}` : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, { width: 95 }]}>
                              <Text style={styles.pTdAmount}>
                                {row.credit ? `₹${formatCurrency(row.credit)}` : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, { width: 95 }]}>
                              <Text style={styles.pTdAmount}>
                                {row.balance !== null ? `₹${formatCurrency(row.balance)}` : '-'}
                              </Text>
                            </View>

                            {/* Matched Student Details */}
                            <View style={[styles.pTd, styles.pTdStudentDivider, { width: 90 }]}>
                              <Text style={row.is_matched ? styles.pTdTextBold : styles.pTdTextMuted}>
                                {row.is_matched ? row.reg_no : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, styles.pTdStudent, { width: 180, alignItems: 'flex-start' }]}>
                              <Text style={row.is_matched ? styles.pTdName : styles.pTdTextMuted} numberOfLines={1}>
                                {row.is_matched ? row.student_name : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, styles.pTdStudent, { width: 100 }]}>
                              <Text style={row.is_matched ? styles.pTdText : styles.pTdTextMuted}>
                                {row.is_matched ? row.class_name : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, styles.pTdStudent, { width: 90 }]}>
                              <Text style={row.is_matched ? styles.pTdText : styles.pTdTextMuted}>
                                {row.is_matched ? row.receipt_no : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, styles.pTdStudent, { width: 100 }]}>
                              <Text style={row.is_matched ? styles.pTdAmount : styles.pTdTextMuted}>
                                {row.is_matched ? `₹${formatCurrency(row.amount)}` : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, styles.pTdStudent, { width: 105 }]}>
                              <Text style={row.is_matched && row.bill_date ? styles.pTdTextBold : styles.pTdTextMuted}>
                                {row.is_matched && row.bill_date ? formatDateDisplay(row.bill_date) : '-'}
                              </Text>
                            </View>
                            <View style={[styles.pTd, styles.pTdStudent, { width: 220, borderRightWidth: 0, paddingVertical: 4, paddingHorizontal: 6 }]}>
                              <View style={styles.noteInputContainer}>
                                <TextInput
                                  style={styles.noteInput}
                                  placeholder="Add note..."
                                  placeholderTextColor="#94a3b8"
                                  value={rowNote}
                                  onChangeText={(val) => {
                                    setNotes((prev) => ({
                                      ...prev,
                                      [noteMapKey]: val,
                                    }));
                                  }}
                                  onBlur={() => {
                                    void saveSingleNote(dateItem.id, rowKey, notes[noteMapKey] !== undefined ? notes[noteMapKey] : (row.note || ''));
                                  }}
                                />
                                {status === 'saving' && (
                                  <Text style={styles.noteStatusSaving}>💾 saving...</Text>
                                )}
                                {status === 'saved' && (
                                  <Text style={styles.noteStatusSaved}>✓ saved</Text>
                                )}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : null}
              </View>
            );
          })
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

              {renderActiveFiltersBar(allStatementRows.length, filteredStatementRows.length)}

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
                      <View style={[styles.superHeaderStudent, { width: 885 }]}>
                        <Text style={styles.superHeaderTextStudent}>
                          🎓 MATCHED STUDENT DETAILS & NOTES (ADDED BESIDE BALANCE)
                        </Text>
                      </View>
                    </View>

                    {/* Column Headers */}
                    {renderTableHeader()}

                    {/* Data Rows */}
                    {filteredStatementRows.map((row: any, idx: number) => {
                      const rowKey = String(row.statement_row ?? (row.ref_no ? row.ref_no : idx));
                      const rowNote = notes[rowKey] !== undefined ? notes[rowKey] : (row.note || '');
                      const status = noteStatus[rowKey];
                      return (
                        <View
                          key={`stmt_row_${rowKey}_${idx}`}
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
                        <View style={[styles.pTd, styles.pTdStudent, { width: 105 }]}>
                          <Text style={row.is_matched && row.bill_date ? styles.pTdTextBold : styles.pTdTextMuted}>
                            {row.is_matched && row.bill_date ? formatDateDisplay(row.bill_date) : '-'}
                          </Text>
                        </View>
                        <View style={[styles.pTd, styles.pTdStudent, { width: 220, borderRightWidth: 0, paddingVertical: 4, paddingHorizontal: 6 }]}>
                          <View style={styles.noteInputContainer}>
                            <TextInput
                              style={styles.noteInput}
                              placeholder="Add note..."
                              placeholderTextColor="#94a3b8"
                              value={rowNote}
                              onChangeText={(val) => {
                                setNotes((prev) => ({
                                  ...prev,
                                  [rowKey]: val,
                                }));
                              }}
                              onBlur={() => {
                                if (currentSavedId) {
                                  void saveSingleNote(currentSavedId, rowKey, notes[rowKey] !== undefined ? notes[rowKey] : (row.note || ''));
                                }
                              }}
                            />
                            {status === 'saving' && (
                              <Text style={styles.noteStatusSaving}>💾 saving...</Text>
                            )}
                            {status === 'saved' && (
                              <Text style={styles.noteStatusSaved}>✓ saved</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
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
                      <View style={[styles.pTh, { width: 220, borderRightWidth: 0 }]}>
                        <Text style={styles.pThText}>Note</Text>
                      </View>
                    </View>

                    {filteredMismatchBills.map((row: any, idx: number) => {
                      const mismatchKey = row.reg_no
                        ? `bill_${row.reg_no}_${row.receipt_no || idx}`
                        : (row.statement_ref ? `bill_${row.statement_ref}` : `mismatch_${idx}`);
                      const mismatchNote = notes[mismatchKey] !== undefined ? notes[mismatchKey] : (row.note || '');
                      const mStatus = noteStatus[mismatchKey];
                      return (
                        <View
                          key={`mismatch_bill_${mismatchKey}_${idx}`}
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
                          <View style={[styles.pTd, { width: 220, borderRightWidth: 0, paddingVertical: 4, paddingHorizontal: 6 }]}>
                            <View style={styles.noteInputContainer}>
                              <TextInput
                                style={styles.noteInput}
                                placeholder="Add note..."
                                placeholderTextColor="#94a3b8"
                                value={mismatchNote}
                                onChangeText={(val) => {
                                  setNotes((prev) => ({
                                    ...prev,
                                    [mismatchKey]: val,
                                  }));
                                }}
                                onBlur={() => {
                                  if (currentSavedId) {
                                    void saveSingleNote(currentSavedId, mismatchKey, notes[mismatchKey] !== undefined ? notes[mismatchKey] : (row.note || ''));
                                  }
                                }}
                              />
                              {mStatus === 'saving' && (
                                <Text style={styles.noteStatusSaving}>💾 saving...</Text>
                              )}
                              {mStatus === 'saved' && (
                                <Text style={styles.noteStatusSaved}>✓ saved</Text>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
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

      {/* Excel-Style Column Filter & Sort Modal */}
      <Modal
        visible={Boolean(activeFilterMenuCol)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActiveFilterMenuCol(null)}
      >
        <View style={styles.filterModalOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={StyleSheet.absoluteFill}
            onPress={() => setActiveFilterMenuCol(null)}
          />
          <View style={styles.filterModalCard}>
            {/* Modal Header */}
            <View style={styles.filterModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16 }}>📊</Text>
                <Text style={styles.filterModalTitle}>
                  Filter & Sort: {activeFilterMenuCol?.label}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.filterModalCloseBtn}
                onPress={() => setActiveFilterMenuCol(null)}
              >
                <Text style={styles.filterModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Sort Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>SORTING</Text>
                <View style={styles.sortButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.sortBtn,
                      sortColumn === activeFilterMenuCol?.key && sortDirection === 'asc' && styles.sortBtnActive,
                    ]}
                    onPress={() => handleSort(activeFilterMenuCol!.key, 'asc')}
                  >
                    <Text
                      style={[
                        styles.sortBtnText,
                        sortColumn === activeFilterMenuCol?.key && sortDirection === 'asc' && styles.sortBtnTextActive,
                      ]}
                    >
                      ▲ Sort Ascending (A → Z / Low → High)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.sortBtn,
                      sortColumn === activeFilterMenuCol?.key && sortDirection === 'desc' && styles.sortBtnActive,
                    ]}
                    onPress={() => handleSort(activeFilterMenuCol!.key, 'desc')}
                  >
                    <Text
                      style={[
                        styles.sortBtnText,
                        sortColumn === activeFilterMenuCol?.key && sortDirection === 'desc' && styles.sortBtnTextActive,
                      ]}
                    >
                      ▼ Sort Descending (Z → A / High → Low)
                    </Text>
                  </TouchableOpacity>

                  {sortColumn === activeFilterMenuCol?.key && (
                    <TouchableOpacity
                      style={styles.clearSortBtn}
                      onPress={() => setSortColumn(null)}
                    >
                      <Text style={styles.clearSortBtnText}>⟲ Reset Sort</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Filter Input Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>FILTER BY TEXT / SEARCH</Text>
                <View style={styles.modalSearchBox}>
                  <Text style={{ marginRight: 6 }}>🔍</Text>
                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder={`Type to filter ${activeFilterMenuCol?.label}...`}
                    placeholderTextColor="#94a3b8"
                    value={colSearchQuery}
                    onChangeText={(text) => {
                      setColSearchQuery(text);
                      handleApplyFilter(activeFilterMenuCol!.key, text);
                    }}
                  />
                  {colSearchQuery ? (
                    <TouchableOpacity
                      onPress={() => {
                        setColSearchQuery('');
                        handleClearColumnFilter(activeFilterMenuCol!.key);
                      }}
                    >
                      <Text style={{ color: '#94a3b8', padding: 4 }}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Distinct Values / Quick Filter Presets */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>
                  QUICK VALUES ({distinctValuesForActiveCol.length})
                </Text>
                <View style={styles.distinctValuesWrap}>
                  <TouchableOpacity
                    style={[
                      styles.distinctChip,
                      !columnFilters[activeFilterMenuCol?.key || ''] && styles.distinctChipActive,
                    ]}
                    onPress={() => {
                      setColSearchQuery('');
                      handleClearColumnFilter(activeFilterMenuCol!.key);
                    }}
                  >
                    <Text
                      style={[
                        styles.distinctChipText,
                        !columnFilters[activeFilterMenuCol?.key || ''] && styles.distinctChipTextActive,
                      ]}
                    >
                      All ({distinctValuesForActiveCol.reduce((sum, item) => sum + item[1], 0)})
                    </Text>
                  </TouchableOpacity>

                  {activeFilterMenuCol?.key === 'note' && (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.distinctChip,
                          columnFilters[activeFilterMenuCol.key] === '__has_note__' && styles.distinctChipActive,
                        ]}
                        onPress={() => {
                          setColSearchQuery('Has Note');
                          handleApplyFilter(activeFilterMenuCol.key, '__has_note__');
                        }}
                      >
                        <Text
                          style={[
                            styles.distinctChipText,
                            columnFilters[activeFilterMenuCol.key] === '__has_note__' && styles.distinctChipTextActive,
                          ]}
                        >
                          📝 Has Custom Note
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.distinctChip,
                          columnFilters[activeFilterMenuCol.key] === '__no_note__' && styles.distinctChipActive,
                        ]}
                        onPress={() => {
                          setColSearchQuery('No Note');
                          handleApplyFilter(activeFilterMenuCol.key, '__no_note__');
                        }}
                      >
                        <Text
                          style={[
                            styles.distinctChipText,
                            columnFilters[activeFilterMenuCol.key] === '__no_note__' && styles.distinctChipTextActive,
                          ]}
                        >
                          ⬜ No Note / Blank
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {distinctValuesForActiveCol.slice(0, 35).map(([val, count]) => {
                    const currentFilter = columnFilters[activeFilterMenuCol?.key || ''];
                    const isSelected =
                      val === '(Blank)'
                        ? currentFilter === '__blank__'
                        : currentFilter?.toLowerCase() === val.toLowerCase();

                    return (
                      <TouchableOpacity
                        key={`val_${val}`}
                        style={[styles.distinctChip, isSelected && styles.distinctChipActive]}
                        onPress={() => {
                          const nextVal = val === '(Blank)' ? '__blank__' : val;
                          setColSearchQuery(val === '(Blank)' ? '' : val);
                          handleApplyFilter(activeFilterMenuCol!.key, nextVal);
                        }}
                      >
                        <Text
                          style={[
                            styles.distinctChipText,
                            isSelected && styles.distinctChipTextActive,
                          ]}
                        >
                          {val} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.filterModalFooter}>
              {columnFilters[activeFilterMenuCol?.key || ''] ? (
                <TouchableOpacity
                  style={styles.clearFilterModalBtn}
                  onPress={() => {
                    setColSearchQuery('');
                    handleClearColumnFilter(activeFilterMenuCol!.key);
                  }}
                >
                  <Text style={styles.clearFilterModalBtnText}>✕ Clear Filter</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}

              <TouchableOpacity
                style={styles.applyFilterModalBtn}
                onPress={() => setActiveFilterMenuCol(null)}
              >
                <Text style={styles.applyFilterModalBtnText}>Done</Text>
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
    cursor: 'pointer' as any,
  },
  thInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  thBadgeWrap: {
    marginLeft: 4,
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thBadgeWrapActive: {
    backgroundColor: '#fef08a',
    borderRadius: 4,
    paddingHorizontal: 2,
  },
  filterIndicator: {
    color: 'rgba(15, 23, 42, 0.65)',
    fontSize: 11,
    fontWeight: '800',
  },
  filterIndicatorActive: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '900',
  },
  sortIndicator: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '900',
  },
  pThFiltered: {
    backgroundColor: '#38bdf8',
  },
  pThFilteredStudent: {
    backgroundColor: '#86efac',
  },
  pThSorted: {
    backgroundColor: '#7dd3fc',
  },
  pThSortedStudent: {
    backgroundColor: '#bbf7d0',
  },
  pThTextHighlighted: {
    color: '#0f172a',
    fontWeight: '900',
  },
  activeFiltersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activeFiltersLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  activeFiltersLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  filterChipText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '600',
  },
  filterChipRemoveBtn: {
    marginLeft: 6,
    padding: 2,
  },
  filterChipRemove: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '800',
  },
  clearAllFiltersBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  clearAllFiltersBtnText: {
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '700',
  },
  filteredCountText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterModalTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  filterModalCloseBtn: {
    padding: 4,
  },
  filterModalCloseText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  modalSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  sortButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortBtn: {
    flex: 1,
    minWidth: 180,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  sortBtnActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  sortBtnTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },
  clearSortBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  clearSortBtnText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    outlineStyle: 'none' as any,
  },
  distinctValuesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxHeight: 160,
  },
  distinctChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  distinctChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  distinctChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  distinctChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  filterModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  clearFilterModalBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  clearFilterModalBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  applyFilterModalBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  applyFilterModalBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
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
  noteInputContainer: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  noteInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingLeft: 8,
    paddingRight: 60,
    paddingVertical: 4,
    fontSize: 11,
    color: '#0f172a',
    width: '100%',
    height: 30,
  },
  noteStatusSaving: {
    position: 'absolute',
    right: 6,
    fontSize: 9,
    fontWeight: '700',
    color: '#0284c7',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  noteStatusSaved: {
    position: 'absolute',
    right: 6,
    fontSize: 9,
    fontWeight: '700',
    color: '#15803d',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
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
  registerContainer: {
    marginTop: 8,
  },
  registerHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
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
  registerHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  registerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  liveCountBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveCountBadgeText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '700',
  },
  registerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 18,
  },
  registerTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exportAllBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exportAllBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  expandAllBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  expandAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  refreshRegBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshRegBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  grandSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  grandStatCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  grandStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  grandStatVal: {
    fontSize: 18,
    fontWeight: '900',
  },
  grandStatSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 2,
  },
  registerFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  dateChipsScroll: {
    flexGrow: 0,
    maxWidth: '100%',
  },
  dateChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  dateChipTextActive: {
    color: '#ffffff',
  },
  registerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 260,
    flex: 1,
    maxWidth: 420,
  },
  registerSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
    padding: 0,
    outlineStyle: 'none' as any,
  },
  emptyRegisterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateSectionContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  dateSectionBanner: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  dateSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  dateSectionBadgeTotal: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateSectionBadgeTotalText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  dateSectionBadgeMatched: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateSectionBadgeMatchedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  dateSectionBadgeUnmatched: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateSectionBadgeUnmatchedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  dateSectionBadgeBills: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateSectionBadgeBillsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6d28d9',
  },
  dateSectionMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  dateSectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateDownloadBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  dateDownloadBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  dateToggleBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  dateToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  dateDeleteBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  dateDeleteBtnText: {
    fontSize: 12,
  },
  pTdMatchedHighlight: {
    backgroundColor: '#fef08a',
  },
  pTdMatchedDescText: {
    color: '#713f12',
    fontWeight: '700',
  },
});

