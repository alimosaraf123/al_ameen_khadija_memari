import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import DatePickerField from '../components/DatePickerField';
import { api, API_BASE } from '../lib/api';
import { getToken, getUser } from '../lib/auth';
import { isHostelFeesBlockedUser } from '../lib/routeAccess';

type CashBookEntry = {
  id: number;
  sl_no: number;
  entry_date: string; // YYYY-MM-DD
  entry_date_dmy: string; // DD-MM-YYYY
  fees_bill: string;
  dev_bill: string;
  bank_gateway: number;
  bank_cheque: number;
  bank_edc: number;
  bank_swipe_card: number;
  bank_rv_bill: string;
  bank_received_total: number;
  cash_fees: number;
  cash_other_source: number;
  cash_received_total: number;
  cash_pv_bill: string;
  cash_voucher_payment: number;
  cash_bank_deposit: number;
  cash_payment_total: number;
  opening_balance: number;
  opening_balance_override: number | null;
  cash_in_hand: number;
  machine_balance: number | null;
  balance_matched: boolean | null;
  remarks: string;
  portal_bill_count: number;
  portal_sessions: string;
  portal_synced_at: string | null;
};

type RowDraft = {
  entry_date: string;
  fees_bill: string;
  dev_bill: string;
  bank_gateway: string;
  bank_cheque: string;
  bank_edc: string;
  bank_swipe_card: string;
  bank_rv_bill: string;
  cash_fees: string;
  cash_other_source: string;
  cash_pv_bill: string;
  cash_voucher_payment: string;
  cash_bank_deposit: string;
  opening_balance_override: string;
  machine_balance: string;
  remarks: string;
  portal_bill_count: number;
  portal_sessions: string;
  portal_synced: boolean;
  dirty?: boolean;
};

type PortalBillPreview = {
  bill_number: string;
  registration_no: string;
  student_name: string;
  class_name: string;
  session: string;
  raw_payment_mode: string;
  cashbook_mode: string;
  development_fee: number;
  is_development_bill: boolean;
  amount: number;
};

type PaymentVoucherItem = {
  voucher_id?: string;
  date: string;
  particulars: string;
  vch_type: string;
  vch_no: string;
  debit: string | number;
  credit?: string | number;
  user_name?: string;
};

const todayYmd = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const ymdToDmy = (ymd: string) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ymd;
};

const dmyOrYmdToYmd = (val: string) => {
  const s = String(val || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
};

const num = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (n: number) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

const fmtInr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

const parseItemCount = (raw: string | number | null | undefined): number => {
  if (!raw) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  const parts = s.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return 0;

  let total = 0;
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!isNaN(a) && !isNaN(b) && b >= a) {
        total += (b - a + 1);
        continue;
      }
    }
    total += 1;
  }
  return total;
};

const blankDraft = (date = todayYmd()): RowDraft => ({
  entry_date: date,
  fees_bill: '',
  dev_bill: '',
  bank_gateway: '',
  bank_cheque: '',
  bank_edc: '',
  bank_swipe_card: '',
  bank_rv_bill: '',
  cash_fees: '',
  cash_other_source: '',
  cash_pv_bill: '',
  cash_voucher_payment: '',
  cash_bank_deposit: '',
  opening_balance_override: '',
  machine_balance: '',
  remarks: '',
  portal_bill_count: 0,
  portal_sessions: '',
  portal_synced: false,
  dirty: false
});

const entryToDraft = (e: CashBookEntry): RowDraft => ({
  entry_date: e.entry_date,
  fees_bill: e.fees_bill || '',
  dev_bill: e.dev_bill || '',
  bank_gateway: e.bank_gateway ? fmtNum(e.bank_gateway) : '',
  bank_cheque: e.bank_cheque ? fmtNum(e.bank_cheque) : '',
  bank_edc: e.bank_edc ? fmtNum(e.bank_edc) : '',
  bank_swipe_card: e.bank_swipe_card ? fmtNum(e.bank_swipe_card) : '',
  bank_rv_bill: e.bank_rv_bill || '',
  cash_fees: e.cash_fees ? fmtNum(e.cash_fees) : '',
  cash_other_source: e.cash_other_source ? fmtNum(e.cash_other_source) : '',
  cash_pv_bill: e.cash_pv_bill || '',
  cash_voucher_payment: e.cash_voucher_payment ? fmtNum(e.cash_voucher_payment) : '',
  cash_bank_deposit: e.cash_bank_deposit ? fmtNum(e.cash_bank_deposit) : '',
  opening_balance_override: e.opening_balance_override !== null ? fmtNum(e.opening_balance_override) : '',
  machine_balance: e.machine_balance !== null ? fmtNum(e.machine_balance) : '',
  remarks: e.remarks || '',
  portal_bill_count: e.portal_bill_count || 0,
  portal_sessions: e.portal_sessions || '',
  portal_synced: false,
  dirty: false
});

interface ConfirmSaveTarget {
  key: string;
  draft: RowDraft;
  overrideDate?: string;
  dateLabel: string;
  isNew: boolean;
}

// Column widths (consistent across 3-row grouped header and every data row)
const PLACEHOLDER_COLOR = 'rgba(0, 0, 0, 0.20)';
const W = {
  sl: 48,
  date: 108,
  feesBill: 128,
  devBill: 108,
  gateway: 96,
  cheque: 86,
  edc: 80,
  swipe: 94,
  rvBill: 128,
  cashFees: 92,
  othSource: 88,
  cashRecTot: 94,
  pvBill: 128,
  voucherPay: 104,
  bankDep: 96,
  cashPayTot: 94,
  opening: 106,
  cashInHand: 108,
  machineBal: 108,
  remarks: 132,
  action: 126
};

const BANK_WIDTH = W.gateway + W.cheque + W.edc + W.swipe + W.rvBill;
const CASH_REC_WIDTH = W.cashFees + W.othSource + W.cashRecTot;
const CASH_PAY_WIDTH = W.pvBill + W.voucherPay + W.bankDep + W.cashPayTot;
const CASH_WIDTH = CASH_REC_WIDTH + CASH_PAY_WIDTH;
const TOTAL_TABLE_WIDTH =
  W.sl +
  W.date +
  W.feesBill +
  W.devBill +
  BANK_WIDTH +
  CASH_WIDTH +
  W.opening +
  W.cashInHand +
  W.machineBal +
  W.remarks +
  W.action;

const TableScrollWrapper = ({ children, nativeID, isOver15 }: any) => {
  if (Platform.OS === 'web') {
    return (
      <View
        nativeID={nativeID}
        style={[
          s.tableScrollFrame,
          isOver15 && s.tableScrollMaxHeight
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar>
      <ScrollView
        style={isOver15 ? s.tableScrollMaxHeight : undefined}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        {children}
      </ScrollView>
    </ScrollView>
  );
};

export default function DailyCashBookScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [entries, setEntries] = useState<CashBookEntry[]>([]);
  const [nextOpeningBalance, setNextOpeningBalance] = useState<number>(0);
  const [lastFeesBill, setLastFeesBill] = useState<string>('');
  const [lastDevBill, setLastDevBill] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [showHostelFeesTab, setShowHostelFeesTab] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [selectedDate, setSelectedDate] = useState(() => todayYmd());
  const [newRow, setNewRow] = useState<RowDraft>(() => blankDraft());
  const [newDateText, setNewDateText] = useState<string>(() => ymdToDmy(todayYmd()));
  const [rowDrafts, setRowDrafts] = useState<Record<number, RowDraft>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmSaveTarget, setConfirmSaveTarget] = useState<ConfirmSaveTarget | null>(null);

  const onDateChange = (d: string) => {
    if (!d) return;
    setSelectedDate(d);
    setNewRow(prev => ({ ...prev, entry_date: d }));
    setNewDateText(ymdToDmy(d));
  };

  const [fetchingKey, setFetchingKey] = useState<string | null>(null); // 'new' or String(entry.id)
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Portal bill breakdown modal
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [billModalTitle, setBillModalTitle] = useState('');
  const [billModalBills, setBillModalBills] = useState<PortalBillPreview[]>([]);
  const [billModalMeta, setBillModalMeta] = useState<string>('');
  const [billModalLoading, setBillModalLoading] = useState(false);

  // Portal payment voucher breakdown modal
  const [pvModalVisible, setPvModalVisible] = useState(false);
  const [pvModalTitle, setPvModalTitle] = useState('');
  const [pvModalVouchers, setPvModalVouchers] = useState<PaymentVoucherItem[]>([]);
  const [pvModalMeta, setPvModalMeta] = useState<string>('');
  const [pvModalLoading, setPvModalLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'daily-cashbook-scrollbar-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          #dailyCashBookScroll {
            scrollbar-width: thin;
            scrollbar-color: #93c5fd #f1f5f9;
          }
          #dailyCashBookScroll::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          #dailyCashBookScroll::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 6px;
          }
          #dailyCashBookScroll::-webkit-scrollbar-thumb {
            background: #93c5fd;
            border-radius: 6px;
            border: 2px solid #f1f5f9;
          }
          #dailyCashBookScroll::-webkit-scrollbar-thumb:hover {
            background: #2563eb;
          }
        `;
        document.head.appendChild(style);
      }
    }
    void getUser<any>().then(u => {
      setShowHostelFeesTab(Boolean(u) && !isHostelFeesBlockedUser(u));
    });
    void loadLedger();
  }, []);

  const applyLedgerResponse = (data: any, resetNewRow = false) => {
    const list: CashBookEntry[] = Array.isArray(data.entries) ? data.entries : [];
    setEntries(list);
    setNextOpeningBalance(Number(data.next_opening_balance || 0));
    setLastFeesBill(data.last_fees_bill || '');
    setLastDevBill(data.last_dev_bill || '');

    const nextDrafts: Record<number, RowDraft> = {};
    list.forEach(e => {
      nextDrafts[e.id] = entryToDraft(e);
    });
    setRowDrafts(nextDrafts);

    if (resetNewRow) {
      setNewRow(blankDraft(selectedDate));
      setNewDateText(ymdToDmy(selectedDate));
    }
    setEditingId(null);
  };

  const loadLedger = async (f = fromDate, t = toDate, resetNew = true) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from_date', f);
      if (t) qs.set('to_date', t);
      const data = await api(`/api/daily-cashbook${qs.toString() ? `?${qs.toString()}` : ''}`);
      applyLedgerResponse(data, resetNew);
    } catch (e: any) {
      setError(e.message || 'Failed to load Daily Cash Book');
    } finally {
      setLoading(false);
    }
  };

  const fetchPortalForDate = async (targetYmd: string, targetKey: 'new' | number) => {
    const ymd = targetYmd || todayYmd();
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setError('সঠিক তারিখ দিন (DD-MM-YYYY)');
      return;
    }
    setFetchingKey(String(targetKey));
    setError('');
    setBanner('');
    try {
      const data = await api('/api/daily-cashbook/fetch-portal', {
        method: 'POST',
        body: JSON.stringify({ entry_date: ymd })
      });

      if (targetKey === 'new') {
        setNewRow(prev => ({
          ...prev,
          entry_date: ymd,
          fees_bill: data.fees_bill || '',
          dev_bill: data.dev_bill || '',
          bank_gateway: fmtNum(data.bank_gateway || 0),
          bank_cheque: fmtNum(data.bank_cheque || 0),
          bank_edc: fmtNum(data.bank_edc || 0),
          bank_swipe_card: fmtNum(data.bank_swipe_card || 0),
          bank_rv_bill: data.bank_rv_bill || '',
          cash_fees: fmtNum(data.cash_fees || 0),
          cash_pv_bill: data.cash_pv_bill || '',
          cash_voucher_payment: fmtNum(data.cash_voucher_payment || 0),
          portal_bill_count: data.bill_count || 0,
          portal_sessions: (data.queried_sessions || []).join(', '),
          portal_synced: true
        }));
      } else {
        setRowDrafts(prev => {
          const cur = prev[targetKey];
          if (!cur) return prev;
          return {
            ...prev,
            [targetKey]: {
              ...cur,
              fees_bill: data.fees_bill || '',
              dev_bill: data.dev_bill || '',
              bank_gateway: fmtNum(data.bank_gateway || 0),
              bank_cheque: fmtNum(data.bank_cheque || 0),
              bank_swipe_card: fmtNum(data.bank_swipe_card || 0),
              bank_rv_bill: data.bank_rv_bill || '',
              cash_fees: fmtNum(data.cash_fees || 0),
              cash_pv_bill: data.cash_pv_bill || '',
              cash_voucher_payment: fmtNum(data.cash_voucher_payment || 0),
              portal_bill_count: data.bill_count || 0,
              portal_sessions: (data.queried_sessions || []).join(', '),
              portal_synced: true,
              dirty: true
            }
          };
        });
        setEditingId(targetKey);
      }

      setBillModalTitle(`Portal Fees Bills — ${data.entry_date_dmy || ymdToDmy(ymd)}`);
      setBillModalBills(Array.isArray(data.bills) ? data.bills : []);
      setBillModalMeta(
        `Sessions: ${(data.queried_sessions || []).join(', ')}  |  Bills: ${data.bill_count || 0}  |  Fees Bill: ${data.fees_bill_range || '-'}  |  Dev. Bill: ${data.dev_bill_range || '-'}  |  Gateway: ${fmtInr(data.bank_gateway || 0)}  |  Cash: ${fmtInr(data.cash_fees || 0)}`
      );

      const pvDetails: PaymentVoucherItem[] = Array.isArray(data.payment_vouchers_details)
        ? data.payment_vouchers_details
        : [];
      setPvModalVouchers(pvDetails);
      setPvModalTitle(`Payment Vouchers — ${data.entry_date_dmy || ymdToDmy(ymd)}`);
      setPvModalMeta(
        `Date: ${data.entry_date_dmy || ymdToDmy(ymd)}  |  Total Vouchers: ${pvDetails.length}  |  P.V Range: ${data.cash_pv_bill_range || data.cash_pv_bill || '-'}  |  Total Payment: ${fmtInr(data.cash_voucher_payment || 0)}`
      );

      setBanner(
        `${data.entry_date_dmy || ymdToDmy(ymd)}: ${data.bill_count || 0}টি বিল ও ${pvDetails.length}টি পেমেন্ট ভাউচার পাওয়া গেছে — Fees: ${data.fees_bill_range || data.fees_bill || '-'} | P.V: ${data.cash_pv_bill_range || data.cash_pv_bill || '-'} (Payment: ${fmtInr(data.cash_voucher_payment || 0)})`
      );
    } catch (e: any) {
      setError(e.message || 'Portal fetch failed');
    } finally {
      setFetchingKey(null);
    }
  };

  const openFeesBillsForDate = async (ymd: string) => {
    const dmy = ymdToDmy(ymd);
    setBillModalTitle(`Portal Fees Bills — ${dmy}`);
    setBillModalMeta('');
    setBillModalLoading(true);
    setBillModalVisible(true);
    try {
      const data: any = await api('/api/daily-cashbook/fetch-portal', {
        method: 'POST',
        body: JSON.stringify({ entry_date: ymd })
      });
      if (data?.success) {
        const list: PortalBillPreview[] = Array.isArray(data.bills) ? data.bills : [];
        setBillModalBills(list);
        setBillModalMeta(
          `Sessions: ${(data.queried_sessions || []).join(', ')}  |  Bills: ${list.length}  |  Fees Bill: ${data.fees_bill_range || data.fees_bill || '-'}  |  Dev. Bill: ${data.dev_bill_range || data.dev_bill || '-'}  |  Gateway: ${fmtInr(data.bank_gateway || 0)}  |  Cash: ${fmtInr(data.cash_fees || 0)}`
        );
      } else {
        setBillModalBills([]);
        setBillModalMeta(data?.message || 'কোনো বিল পাওয়া যায়নি।');
      }
    } catch (e: any) {
      setBillModalBills([]);
      setBillModalMeta(e.message || 'বিল লোড করতে সমস্যা হয়েছে');
    } finally {
      setBillModalLoading(false);
    }
  };

  const openPaymentVouchersForDate = async (ymd: string) => {
    const dmy = ymdToDmy(ymd);
    setPvModalTitle(`Payment Vouchers — ${dmy}`);
    setPvModalMeta('');
    setPvModalLoading(true);
    setPvModalVisible(true);
    try {
      const data: any = await api(`/api/daily-cashbook/vouchers?date=${ymd}`);
      if (data?.success) {
        const list: PaymentVoucherItem[] = Array.isArray(data.payment_vouchers_details)
          ? data.payment_vouchers_details
          : [];
        setPvModalVouchers(list);
        setPvModalMeta(
          `Date: ${data.entry_date_dmy || dmy}  |  Total Vouchers: ${list.length}  |  P.V Range: ${data.pv_bill_range || data.pv_bill || '-'}  |  Total Payment: ${fmtInr(data.voucher_payment_total || 0)}`
        );
      } else {
        setPvModalVouchers([]);
        setPvModalMeta(data?.message || 'কোনো ভাউচার পাওয়া যায়নি।');
      }
    } catch (e: any) {
      setPvModalVouchers([]);
      setPvModalMeta(e.message || 'ভাউচার লোড করতে সমস্যা হয়েছে');
    } finally {
      setPvModalLoading(false);
    }
  };

  const fetchPortalForNewRow = () => {
    const ymd = selectedDate || newRow.entry_date || todayYmd();
    void fetchPortalForDate(ymd, 'new');
  };

  const fetchPortalForSavedRow = (entry: CashBookEntry) => {
    void fetchPortalForDate(entry.entry_date, entry.id);
  };

  const saveDraft = async (key: string, draft: RowDraft, overrideDate?: string) => {
    const ymd = overrideDate || draft.entry_date;
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setError('সঠিক তারিখ দিন (DD-MM-YYYY)');
      return;
    }
    setSavingKey(key);
    setError('');
    setBanner('');
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.set('from_date', fromDate);
      if (toDate) qs.set('to_date', toDate);
      const data = await api(`/api/daily-cashbook/save${qs.toString() ? `?${qs.toString()}` : ''}`, {
        method: 'POST',
        body: JSON.stringify({
          entry_date: ymd,
          fees_bill: draft.fees_bill,
          dev_bill: draft.dev_bill,
          bank_gateway: num(draft.bank_gateway),
          bank_cheque: num(draft.bank_cheque),
          bank_edc: num(draft.bank_edc),
          bank_swipe_card: num(draft.bank_swipe_card),
          bank_rv_bill: draft.bank_rv_bill,
          cash_fees: num(draft.cash_fees),
          cash_other_source: num(draft.cash_other_source),
          cash_pv_bill: draft.cash_pv_bill,
          cash_voucher_payment: num(draft.cash_voucher_payment),
          cash_bank_deposit: num(draft.cash_bank_deposit),
          opening_balance_override: draft.opening_balance_override.trim() === '' ? null : num(draft.opening_balance_override),
          machine_balance: draft.machine_balance.trim() === '' ? null : num(draft.machine_balance),
          remarks: draft.remarks,
          portal_bill_count: draft.portal_bill_count,
          portal_sessions: draft.portal_sessions,
          portal_synced: draft.portal_synced
        })
      });
      applyLedgerResponse(data, key === 'new');
      setEditingId(null);
      setBanner(data.message || `Saved ${ymdToDmy(ymd)}`);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSavingKey(null);
    }
  };

  const startEdit = (entry: CashBookEntry) => {
    if (editingId && editingId !== entry.id) {
      const prev = entries.find(e => e.id === editingId);
      if (prev) {
        setRowDrafts(p => ({ ...p, [editingId]: entryToDraft(prev) }));
      }
    }
    setEditingId(entry.id);
  };

  const cancelEdit = (entry: CashBookEntry) => {
    setRowDrafts(prev => ({
      ...prev,
      [entry.id]: entryToDraft(entry)
    }));
    setEditingId(null);
  };

  const requestSave = (key: string, draft: RowDraft, overrideDate?: string, dateLabel?: string) => {
    const ymd = overrideDate || draft.entry_date;
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setError('সঠিক তারিখ দিন (DD-MM-YYYY)');
      return;
    }
    const label = dateLabel || ymdToDmy(ymd);
    setConfirmSaveTarget({
      key,
      draft,
      overrideDate: ymd,
      dateLabel: label,
      isNew: key === 'new'
    });
  };

  const deleteEntry = (entry: CashBookEntry) => {
    const run = async () => {
      try {
        const data = await api(`/api/daily-cashbook/${entry.id}`, { method: 'DELETE' });
        applyLedgerResponse(data, false);
        setBanner(`Deleted ${entry.entry_date_dmy}`);
      } catch (e: any) {
        setError(e.message || 'Delete failed');
      }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Delete Daily Cash Book entry for ${entry.entry_date_dmy}?`)) void run();
    } else {
      Alert.alert('Delete Entry', `Delete entry for ${entry.entry_date_dmy}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void run() }
      ]);
    }
  };

  const updateSavedField = (id: number, field: keyof RowDraft, value: string) => {
    setRowDrafts(prev => {
      const cur = prev[id];
      if (!cur) return prev;
      return {
        ...prev,
        [id]: { ...cur, [field]: value, dirty: true }
      };
    });
  };

  // Live calculations for the "New" row
  const newRowCalc = useMemo(() => {
    const cashRecTotal = num(newRow.cash_fees) + num(newRow.cash_other_source);
    const cashPayTotal = num(newRow.cash_voucher_payment) + num(newRow.cash_bank_deposit);
    const opening = newRow.opening_balance_override.trim() !== '' ? num(newRow.opening_balance_override) : nextOpeningBalance;
    const cashInHand = opening + cashRecTotal - cashPayTotal;
    const hasMachine = newRow.machine_balance.trim() !== '';
    const matched = hasMachine ? Math.abs(num(newRow.machine_balance) - cashInHand) < 0.01 : null;
    return { cashRecTotal, cashPayTotal, opening, cashInHand, matched };
  }, [newRow, nextOpeningBalance]);

  const summaryKpis = useMemo(() => {
    const totalBank = entries.reduce((s, e) => s + e.bank_received_total, 0);
    const totalCashRec = entries.reduce((s, e) => s + e.cash_received_total, 0);
    const totalCashPay = entries.reduce((s, e) => s + e.cash_payment_total, 0);
    return { totalBank, totalCashRec, totalCashPay, latestCashInHand: nextOpeningBalance };
  }, [entries, nextOpeningBalance]);

  const downloadExcel = async () => {
    try {
      const token = await getToken();
      const qs = new URLSearchParams();
      if (fromDate) qs.set('from_date', fromDate);
      if (toDate) qs.set('to_date', toDate);
      const r = await fetch(`${API_BASE}/api/daily-cashbook/excel${qs.toString() ? `?${qs.toString()}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!r.ok) throw new Error('Excel download failed');
      if (Platform.OS === 'web') {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daily-cash-book${fromDate ? `-${fromDate}` : ''}.xlsx`;
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
    if (!entries.length) return Alert.alert('Print', 'No entries to print.');
    const rowsHtml = entries
      .map(e => {
        const cls = e.balance_matched === true ? 'match' : e.balance_matched === false ? 'mismatch' : '';
        return `<tr>
          <td>${e.sl_no}</td>
          <td>${e.entry_date_dmy}</td>
          <td>${e.fees_bill || ''}</td>
          <td>${e.dev_bill || ''}</td>
          <td class="r">${fmtNum(e.bank_gateway)}</td>
          <td class="r">${fmtNum(e.bank_cheque)}</td>
          <td class="r">${fmtNum(e.bank_edc)}</td>
          <td class="r">${fmtNum(e.bank_swipe_card)}</td>
          <td class="div-r">${e.bank_rv_bill || ''}</td>
          <td class="r">${fmtNum(e.cash_fees)}</td>
          <td class="r">${fmtNum(e.cash_other_source)}</td>
          <td class="r b div-r">${fmtNum(e.cash_received_total)}</td>
          <td>${e.cash_pv_bill || ''}</td>
          <td class="r">${fmtNum(e.cash_voucher_payment)}</td>
          <td class="r">${fmtNum(e.cash_bank_deposit)}</td>
          <td class="r b div-r">${fmtNum(e.cash_payment_total)}</td>
          <td class="r">${fmtNum(e.opening_balance)}</td>
          <td class="r b ${cls}">${fmtNum(e.cash_in_hand)}</td>
          <td class="r b ${cls}">${e.machine_balance === null ? '' : fmtNum(e.machine_balance)}</td>
          <td class="l">${e.remarks || ''}</td>
        </tr>`;
      })
      .join('');

    const html = `<style>
      @page{size:A4 landscape;margin:8mm}
      body{font-family:Arial,sans-serif;color:#111}
      h2{text-align:center;margin:0 0 8px;font-size:15px}
      table{border-collapse:collapse;width:100%;font-size:10px}
      th,td{border:1px solid #334155;padding:4px 5px;text-align:center}
      .blue{background:#dbeafe}.maroon{background:#7f1d1d;color:#fff}.green{background:#bbf7d0}.beige{background:#d6c7a1}.pink{background:#fecdd3}
      .r{text-align:right}.l{text-align:left}.b{font-weight:700}
      .div-r{border-right:2.5px solid #0f172a !important}
      .match{background:#86efac;color:#14532d}.mismatch{background:#fecaca;color:#991b1b}
    </style>
    <h2>Al-Ameen Mission Academy Memari — Daily Cash Book</h2>
    <table>
      <thead>
        <tr>
          <th rowspan="3" class="blue">S.L.</th>
          <th rowspan="3" class="blue">Date</th>
          <th rowspan="3" class="blue">Fees Bill</th>
          <th rowspan="3" class="blue">Dev. Bill</th>
          <th colspan="5" class="maroon div-r">Bank</th>
          <th colspan="3" class="beige div-r">Cash</th>
          <th colspan="4" class="pink div-r">Payment</th>
          <th rowspan="3" class="blue">Opening Balance</th>
          <th rowspan="3" class="blue">Cash In Hand</th>
          <th rowspan="3" class="blue">Machine Balance</th>
          <th rowspan="3" class="blue">Remarks</th>
        </tr>
        <tr>
          <th colspan="5" class="green div-r">Received</th>
          <th colspan="3" class="green div-r">Received</th>
          <th colspan="4" class="pink div-r">Payment</th>
        </tr>
        <tr>
          <th class="blue">Gateway</th><th class="blue">Cheque</th><th class="blue">E.D.C</th><th class="blue">Swipe Card</th><th class="blue div-r">R.V Bill</th>
          <th class="blue">Fees</th><th class="blue">Oth. Source</th><th class="blue div-r">Total</th>
          <th class="blue">P.V Bill</th><th class="blue">Voucher Payment</th><th class="blue">Bank Dep.</th><th class="blue div-r">Total</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const w = window.open('', '_blank', 'width=1200,height=800');
      if (!w) return Alert.alert('Print', 'Allow pop-ups to print.');
      w.document.open();
      w.document.write(`<!doctype html><html><head><title>Daily Cash Book</title></head><body>${html}</body></html>`);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 450);
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
          {showHostelFeesTab && (
            <TouchableOpacity style={s.tabBtn} onPress={() => router.push('/hostel-fees' as any)}>
              <Text style={s.tabBtnText}>🏠 Hostel Fees</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.tabBtn, s.tabBtnActive]} onPress={() => { }}>
            <Text style={[s.tabBtnText, s.tabBtnTextActive]}>📒 Daily Cash Book</Text>
          </TouchableOpacity>
        </View>

        {/* Hero / Toolbar */}
        <View style={s.heroCard}>
          <View style={s.heroLeft}>
            <Text style={s.title}>📒 Daily Cash Book (Bank & Cash Register)</Text>
            <Text style={s.subtitle}>
              alameenmission.net/alameen/accounts/?action=fees_report থেকে Last 2 Sessions চেক করে Fees Bill, Dev. Bill, Gateway (EDC), ও Cash Fees অটো-ফিল হয়।
            </Text>
          </View>
          <View style={s.heroActions}>
            <View style={s.datePickerInline}>
              <DatePickerField
                label=""
                value={selectedDate}
                onChange={onDateChange}
                style={s.datePickerControl}
              />
            </View>
            <TouchableOpacity
              disabled={fetchingKey === 'new'}
              onPress={fetchPortalForNewRow}
              style={[s.primaryBtn, fetchingKey === 'new' && { opacity: 0.7 }]}
            >
              {fetchingKey === 'new' ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={s.primaryBtnText}>🔄 Check Portal</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={downloadExcel} disabled={!entries.length} style={[s.secondaryBtn, !entries.length && { opacity: 0.5 }]}>
              <Text style={s.secondaryBtnText}>📊 Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={printReport} disabled={!entries.length} style={[s.secondaryBtn, { backgroundColor: '#059669' }, !entries.length && { opacity: 0.5 }]}>
              <Text style={s.secondaryBtnText}>🖨️ Print</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KPI Cards */}
        <View style={s.kpiRow}>
          <View style={[s.kpiCard, { borderLeftColor: '#7f1d1d' }]}>
            <Text style={s.kpiLabel}>TOTAL BANK RECEIVED</Text>
            <Text style={[s.kpiVal, { color: '#7f1d1d' }]}>{fmtInr(summaryKpis.totalBank)}</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: '#15803d' }]}>
            <Text style={s.kpiLabel}>TOTAL CASH RECEIVED</Text>
            <Text style={[s.kpiVal, { color: '#15803d' }]}>{fmtInr(summaryKpis.totalCashRec)}</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: '#be123c' }]}>
            <Text style={s.kpiLabel}>TOTAL CASH PAYMENT</Text>
            <Text style={[s.kpiVal, { color: '#be123c' }]}>{fmtInr(summaryKpis.totalCashPay)}</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: '#1d4ed8' }]}>
            <Text style={s.kpiLabel}>CURRENT CASH IN HAND</Text>
            <Text style={[s.kpiVal, { color: '#1d4ed8' }]}>{fmtInr(summaryKpis.latestCashInHand)}</Text>
          </View>
        </View>

        {/* Quick Hint */}
        <View style={s.hintBox}>
          <Text style={s.filterHint}>
            💡 প্রথম রো-তে Opening Balance প্রয়োজনে টাইপ করুন — পরের দিনগুলো অটো ক্যারি-ফরওয়ার্ড হবে।
          </Text>
        </View>

        {banner ? (
          <View style={s.successBanner}>
            <Text style={s.successText}>✅ {banner}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* Exact Screenshot-1 Multi-Row Grouped Ledger Table */}
        <View style={s.tableCard}>
          {loading ? (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color="#1d4ed8" />
              <Text style={s.muted}>Loading Daily Cash Book...</Text>
            </View>
          ) : (
            <TableScrollWrapper nativeID="dailyCashBookScroll" isOver15={entries.length > 15}>
              <View style={{ width: TOTAL_TABLE_WIDTH }}>
                {/* 3-Row Grouped Header matching Screenshot 1 */}
                <View style={[s.headerGroupWrap, s.stickyHeader]}>
                  {/* Left Fixed-Height Full-Span Columns */}
                  <View style={[s.hSpanCell, { width: W.sl }]}>
                    <Text style={s.hText}>S.L.</Text>
                  </View>
                  <View style={[s.hSpanCell, { width: W.date }]}>
                    <Text style={s.hText}>Date</Text>
                  </View>
                  <View style={[s.hSpanCell, { width: W.feesBill }]}>
                    <Text style={s.hText}>Fees Bill</Text>
                  </View>
                  <View style={[s.hSpanCell, { width: W.devBill }]}>
                    <Text style={s.hText}>Dev. Bill</Text>
                  </View>

                  {/* Bank Block (3 stacked rows) */}
                  <View style={[{ width: BANK_WIDTH }, s.sectionDividerRight]}>
                    <View style={[s.hTier1, { backgroundColor: '#7f1d1d', borderRightWidth: 0 }]}>
                      <Text style={[s.hText, { color: '#ffffff', fontSize: 13 }]}>Bank</Text>
                    </View>
                    <View style={[s.hTier2, { backgroundColor: '#bbf7d0', borderRightWidth: 0 }]}>
                      <Text style={[s.hText, { color: '#14532d' }]}>Received</Text>
                    </View>
                    <View style={s.hTier3Row}>
                      <View style={[s.hSubCell, { width: W.gateway }]}><Text style={s.hText}>Gateway</Text></View>
                      <View style={[s.hSubCell, { width: W.cheque }]}><Text style={s.hText}>Cheque</Text></View>
                      <View style={[s.hSubCell, { width: W.edc }]}><Text style={s.hText}>E.D.C</Text></View>
                      <View style={[s.hSubCell, { width: W.swipe }]}><Text style={s.hText}>Swipe Card</Text></View>
                      <View style={[s.hSubCell, { width: W.rvBill, borderRightWidth: 0 }]}><Text style={s.hText}>R.V Bill</Text></View>
                    </View>
                  </View>

                  {/* Cash Received Block (3 stacked rows) - Cash strictly over Received */}
                  <View style={[{ width: CASH_REC_WIDTH }, s.sectionDividerRight]}>
                    <View style={[s.hTier1, { backgroundColor: '#d6c7a1', borderRightWidth: 0 }]}>
                      <Text style={[s.hText, { color: '#1e293b', fontSize: 13, fontWeight: '800' }]}>Cash</Text>
                    </View>
                    <View style={[s.hTier2, { backgroundColor: '#bbf7d0', borderRightWidth: 0 }]}>
                      <Text style={[s.hText, { color: '#14532d', fontWeight: '800' }]}>Received</Text>
                    </View>
                    <View style={s.hTier3Row}>
                      <View style={[s.hSubCell, { width: W.cashFees }]}><Text style={s.hText}>Fees</Text></View>
                      <View style={[s.hSubCell, { width: W.othSource }]}><Text style={s.hText}>Oth. Source</Text></View>
                      <View style={[s.hSubCell, { width: W.cashRecTot, borderRightWidth: 0 }]}><Text style={s.hText}>Total</Text></View>
                    </View>
                  </View>

                  {/* Payment Block (3 stacked rows) */}
                  <View style={[{ width: CASH_PAY_WIDTH }, s.sectionDividerRight]}>
                    <View style={[s.hTier1, { backgroundColor: '#fecdd3', borderRightWidth: 0, borderBottomWidth: 0 }]} />
                    <View style={[s.hTier2, { backgroundColor: '#fecdd3', borderRightWidth: 0 }]}>
                      <Text style={[s.hText, { color: '#881337', fontSize: 13, fontWeight: '800' }]}>Payment</Text>
                    </View>
                    <View style={s.hTier3Row}>
                      <View style={[s.hSubCell, { width: W.pvBill }]}><Text style={s.hText}>P.V Bill</Text></View>
                      <View style={[s.hSubCell, { width: W.voucherPay }]}><Text style={s.hText}>Voucher Payment</Text></View>
                      <View style={[s.hSubCell, { width: W.bankDep }]}><Text style={s.hText}>Bank Dep.</Text></View>
                      <View style={[s.hSubCell, { width: W.cashPayTot, borderRightWidth: 0 }]}><Text style={s.hText}>Total</Text></View>
                    </View>
                  </View>

                  {/* Right Full-Span Columns */}
                  <View style={[s.hSpanCell, { width: W.opening }]}><Text style={s.hText}>Opening Balance</Text></View>
                  <View style={[s.hSpanCell, { width: W.cashInHand }]}><Text style={s.hText}>Cash In Hand</Text></View>
                  <View style={[s.hSpanCell, { width: W.machineBal }]}><Text style={s.hText}>Machine Balance</Text></View>
                  <View style={[s.hSpanCell, { width: W.remarks }]}><Text style={s.hText}>Remarks</Text></View>
                  <View style={[s.hSpanCell, { width: W.action }]}><Text style={s.hText}>Action</Text></View>
                </View>

                {/* TOP "New" ROW (matching Screenshot 1) */}
                <View style={[s.dataRow, s.newRowBg, s.stickyNewRow]}>
                  <View style={[s.cell, { width: W.sl }]}>
                    <Text style={s.newLabel}>New</Text>
                  </View>
                  <View style={[s.cell, { width: W.date }]}>
                    <View style={s.readonlyBox}>
                      <Text style={s.dateText}>{newDateText || ymdToDmy(selectedDate)}</Text>
                    </View>
                  </View>
                  <View style={[s.cell, { width: W.feesBill }]}>
                    <TextInput
                      style={s.inputMulti}
                      multiline
                      value={newRow.fees_bill}
                      placeholder="Bill Nos"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      onChangeText={v => setNewRow(p => ({ ...p, fees_bill: v }))}
                    />
                    {(billModalBills.length > 0 || Boolean(newRow.fees_bill)) && (
                      <TouchableOpacity
                        onPress={() => {
                          if (billModalBills.length > 0) {
                            setBillModalVisible(true);
                          } else {
                            void openFeesBillsForDate(selectedDate || newRow.entry_date);
                          }
                        }}
                        style={s.billMiniBtn}
                      >
                        <Text style={s.billMiniBtnText}>
                          👁️ View Details{(() => {
                            const c = billModalBills.length > 0 ? billModalBills.length : parseItemCount(newRow.fees_bill);
                            return c > 0 ? ` (${c})` : '';
                          })()}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.devBill }]}>
                    <TextInput
                      style={s.inputMulti}
                      multiline
                      value={newRow.dev_bill}
                      placeholder="Dev Nos"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      onChangeText={v => setNewRow(p => ({ ...p, dev_bill: v }))}
                    />
                  </View>

                  {/* Bank Received */}
                  <View style={[s.cell, { width: W.gateway }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.bank_gateway}
                      onChangeText={v => setNewRow(p => ({ ...p, bank_gateway: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.cheque }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.bank_cheque}
                      onChangeText={v => setNewRow(p => ({ ...p, bank_cheque: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.edc }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.bank_edc}
                      onChangeText={v => setNewRow(p => ({ ...p, bank_edc: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.swipe }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.bank_swipe_card}
                      onChangeText={v => setNewRow(p => ({ ...p, bank_swipe_card: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.rvBill }, s.sectionDividerRight]}>
                    <TextInput
                      style={s.inputMulti}
                      multiline
                      value={newRow.bank_rv_bill}
                      placeholder="R.V Nos"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      onChangeText={v => setNewRow(p => ({ ...p, bank_rv_bill: v }))}
                    />
                  </View>

                  {/* Cash Received */}
                  <View style={[s.cell, { width: W.cashFees }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.cash_fees}
                      onChangeText={v => setNewRow(p => ({ ...p, cash_fees: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.othSource }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.cash_other_source}
                      onChangeText={v => setNewRow(p => ({ ...p, cash_other_source: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.cashRecTot }, s.sectionDividerRight]}>
                    <View style={s.readonlyBox}>
                      <Text style={[s.readonlyNum, !num(newRowCalc.cashRecTotal) && s.faintText]}>
                        {fmtNum(newRowCalc.cashRecTotal)}
                      </Text>
                    </View>
                  </View>

                  {/* Cash Payment */}
                  <View style={[s.cell, { width: W.pvBill }]}>
                    <TextInput
                      style={s.inputMulti}
                      multiline
                      value={newRow.cash_pv_bill}
                      placeholder="P.V Nos"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      onChangeText={v => setNewRow(p => ({ ...p, cash_pv_bill: v }))}
                    />
                    {(pvModalVouchers.length > 0 || Boolean(newRow.cash_pv_bill)) && (
                      <TouchableOpacity
                        onPress={() => {
                          if (pvModalVouchers.length > 0) {
                            setPvModalVisible(true);
                          } else {
                            void openPaymentVouchersForDate(selectedDate || newRow.entry_date);
                          }
                        }}
                        style={s.vchMiniBtn}
                      >
                        <Text style={s.vchMiniBtnText}>
                          👁️ View Details{(() => {
                            const c = pvModalVouchers.length > 0 ? pvModalVouchers.length : parseItemCount(newRow.cash_pv_bill);
                            return c > 0 ? ` (${c})` : '';
                          })()}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[s.cell, { width: W.voucherPay }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.cash_voucher_payment}
                      onChangeText={v => setNewRow(p => ({ ...p, cash_voucher_payment: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.bankDep }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.cash_bank_deposit}
                      onChangeText={v => setNewRow(p => ({ ...p, cash_bank_deposit: v }))}
                    />
                  </View>
                  <View style={[s.cell, { width: W.cashPayTot }, s.sectionDividerRight]}>
                    <View style={s.readonlyBox}>
                      <Text style={[s.readonlyNum, !num(newRowCalc.cashPayTotal) && s.faintText]}>
                        {fmtNum(newRowCalc.cashPayTotal)}
                      </Text>
                    </View>
                  </View>

                  {/* Opening Balance (auto-carried forward; editable if override needed) */}
                  <View style={[s.cell, { width: W.opening }]}>
                    <TextInput
                      style={s.inputNum}
                      keyboardType="numeric"
                      placeholder={fmtNum(nextOpeningBalance)}
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.opening_balance_override}
                      onChangeText={v => setNewRow(p => ({ ...p, opening_balance_override: v }))}
                    />
                  </View>

                  {/* Cash In Hand */}
                  <View style={[s.cell, { width: W.cashInHand }]}>
                    <View
                      style={[
                        s.readonlyBox,
                        newRowCalc.matched === true && s.matchBg,
                        newRowCalc.matched === false && s.mismatchBg
                      ]}
                    >
                      <Text
                        style={[
                          s.readonlyNum,
                          !num(newRowCalc.cashInHand) && s.faintText,
                          newRowCalc.matched === true && s.matchText,
                          newRowCalc.matched === false && s.mismatchText
                        ]}
                      >
                        {fmtNum(newRowCalc.cashInHand)}
                      </Text>
                    </View>
                  </View>

                  {/* Machine Balance */}
                  <View style={[s.cell, { width: W.machineBal }]}>
                    <TextInput
                      style={[
                        s.inputNum,
                        newRowCalc.matched === true && s.matchBg,
                        newRowCalc.matched === false && s.mismatchBg,
                        newRowCalc.matched === true && s.matchText,
                        newRowCalc.matched === false && s.mismatchText
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.machine_balance}
                      onChangeText={v => setNewRow(p => ({ ...p, machine_balance: v }))}
                    />
                  </View>

                  {/* Remarks */}
                  <View style={[s.cell, { width: W.remarks }]}>
                    <TextInput
                      style={s.inputLeft}
                      placeholder="Remarks..."
                      placeholderTextColor={PLACEHOLDER_COLOR}
                      value={newRow.remarks}
                      onChangeText={v => setNewRow(p => ({ ...p, remarks: v }))}
                    />
                  </View>

                  {/* Actions: Fetch + Save */}
                  <View style={[s.cell, s.actionCell, { width: W.action }]}>
                    <TouchableOpacity
                      disabled={fetchingKey === 'new'}
                      onPress={fetchPortalForNewRow}
                      style={[s.miniBtn, { backgroundColor: '#0284c7' }]}
                    >
                      {fetchingKey === 'new' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={s.miniBtnText}>🔄</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={savingKey === 'new'}
                      onPress={() => {
                        const ymd = dmyOrYmdToYmd(newDateText) || newRow.entry_date;
                        requestSave('new', newRow, ymd, newDateText || ymdToDmy(ymd));
                      }}
                      style={[s.miniBtn, { backgroundColor: '#16a34a', paddingHorizontal: 10 }]}
                    >
                      {savingKey === 'new' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={s.miniBtnText}>💾 Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* SAVED ROWS (SL N down to 1, matching Screenshot 1) */}
                {entries.map((entry, idx) => {
                  const isEditing = editingId === entry.id;
                  const d = rowDrafts[entry.id] || entryToDraft(entry);
                  const cashRecTot = num(d.cash_fees) + num(d.cash_other_source);
                  const cashPayTot = num(d.cash_voucher_payment) + num(d.cash_bank_deposit);
                  const openBal = d.opening_balance_override.trim() !== '' ? num(d.opening_balance_override) : entry.opening_balance;
                  const cashInHand = openBal + cashRecTot - cashPayTot;
                  const hasMachine = d.machine_balance.trim() !== '';
                  const matched = hasMachine ? Math.abs(num(d.machine_balance) - cashInHand) < 0.01 : null;

                  return (
                    <View
                      key={entry.id}
                      style={[
                        s.dataRow,
                        idx % 2 === 1 && s.altRow,
                        isEditing && s.editingRow
                      ]}
                    >
                      <View style={[s.cell, { width: W.sl }]}>
                        <Text style={s.slText}>{entry.sl_no}</Text>
                      </View>
                      <View style={[s.cell, { width: W.date }]}>
                        <View style={s.readonlyBox}>
                          <Text style={s.dateText}>{entry.entry_date_dmy}</Text>
                        </View>
                      </View>
                      <View style={[s.cell, { width: W.feesBill }]}>
                        <TextInput
                          style={[s.inputMulti, !isEditing && s.inputReadonly]}
                          multiline
                          editable={isEditing}
                          value={d.fees_bill}
                          onChangeText={v => updateSavedField(entry.id, 'fees_bill', v)}
                        />
                        {Boolean(d.fees_bill || entry.portal_bill_count) && (
                          <TouchableOpacity
                            onPress={() => void openFeesBillsForDate(entry.entry_date)}
                            style={s.billMiniBtn}
                          >
                            <Text style={s.billMiniBtnText}>
                              👁️ View Details{(() => {
                                const c = entry.portal_bill_count > 0 ? entry.portal_bill_count : parseItemCount(d.fees_bill);
                                return c > 0 ? ` (${c})` : '';
                              })()}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={[s.cell, { width: W.devBill }]}>
                        <TextInput
                          style={[s.inputMulti, !isEditing && s.inputReadonly]}
                          multiline
                          editable={isEditing}
                          value={d.dev_bill}
                          onChangeText={v => updateSavedField(entry.id, 'dev_bill', v)}
                        />
                      </View>

                      {/* Bank Received */}
                      <View style={[s.cell, { width: W.gateway }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.bank_gateway}
                          onChangeText={v => updateSavedField(entry.id, 'bank_gateway', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.cheque }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.bank_cheque}
                          onChangeText={v => updateSavedField(entry.id, 'bank_cheque', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.edc }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.bank_edc}
                          onChangeText={v => updateSavedField(entry.id, 'bank_edc', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.swipe }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.bank_swipe_card}
                          onChangeText={v => updateSavedField(entry.id, 'bank_swipe_card', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.rvBill }, s.sectionDividerRight]}>
                        <TextInput
                          style={[s.inputMulti, !isEditing && s.inputReadonly]}
                          multiline
                          editable={isEditing}
                          value={d.bank_rv_bill}
                          onChangeText={v => updateSavedField(entry.id, 'bank_rv_bill', v)}
                        />
                      </View>

                      {/* Cash Received */}
                      <View style={[s.cell, { width: W.cashFees }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.cash_fees}
                          onChangeText={v => updateSavedField(entry.id, 'cash_fees', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.othSource }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.cash_other_source}
                          onChangeText={v => updateSavedField(entry.id, 'cash_other_source', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.cashRecTot }, s.sectionDividerRight]}>
                        <View style={s.readonlyBox}>
                          <Text style={s.readonlyNum}>{fmtNum(cashRecTot)}</Text>
                        </View>
                      </View>

                      {/* Cash Payment */}
                      <View style={[s.cell, { width: W.pvBill }]}>
                        <TextInput
                          style={[s.inputMulti, !isEditing && s.inputReadonly]}
                          multiline
                          editable={isEditing}
                          value={d.cash_pv_bill}
                          onChangeText={v => updateSavedField(entry.id, 'cash_pv_bill', v)}
                        />
                        {Boolean(d.cash_pv_bill || num(d.cash_voucher_payment)) && (
                          <TouchableOpacity
                            onPress={() => openPaymentVouchersForDate(entry.entry_date)}
                            style={s.vchMiniBtn}
                          >
                            <Text style={s.vchMiniBtnText}>
                              👁️ View Details{(() => {
                                const c = parseItemCount(d.cash_pv_bill);
                                return c > 0 ? ` (${c})` : '';
                              })()}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={[s.cell, { width: W.voucherPay }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.cash_voucher_payment}
                          onChangeText={v => updateSavedField(entry.id, 'cash_voucher_payment', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.bankDep }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.cash_bank_deposit}
                          onChangeText={v => updateSavedField(entry.id, 'cash_bank_deposit', v)}
                        />
                      </View>
                      <View style={[s.cell, { width: W.cashPayTot }, s.sectionDividerRight]}>
                        <View style={s.readonlyBox}>
                          <Text style={s.readonlyNum}>{fmtNum(cashPayTot)}</Text>
                        </View>
                      </View>

                      {/* Opening Balance */}
                      <View style={[s.cell, { width: W.opening }]}>
                        <TextInput
                          style={[s.inputNum, !isEditing && s.inputReadonly]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.opening_balance_override !== '' ? d.opening_balance_override : fmtNum(entry.opening_balance)}
                          onChangeText={v => updateSavedField(entry.id, 'opening_balance_override', v)}
                        />
                      </View>

                      {/* Cash In Hand */}
                      <View style={[s.cell, { width: W.cashInHand }]}>
                        <View
                          style={[
                            s.readonlyBox,
                            matched === true && s.matchBg,
                            matched === false && s.mismatchBg
                          ]}
                        >
                          <Text
                            style={[
                              s.readonlyNum,
                              matched === true && s.matchText,
                              matched === false && s.mismatchText
                            ]}
                          >
                            {fmtNum(cashInHand)}
                          </Text>
                        </View>
                      </View>

                      {/* Machine Balance */}
                      <View style={[s.cell, { width: W.machineBal }]}>
                        <TextInput
                          style={[
                            s.inputNum,
                            !isEditing && s.inputReadonly,
                            matched === true && s.matchBg,
                            matched === false && s.mismatchBg,
                            matched === true && s.matchText,
                            matched === false && s.mismatchText
                          ]}
                          keyboardType="numeric"
                          editable={isEditing}
                          value={d.machine_balance}
                          onChangeText={v => updateSavedField(entry.id, 'machine_balance', v)}
                        />
                      </View>

                      {/* Remarks */}
                      <View style={[s.cell, { width: W.remarks }]}>
                        <TextInput
                          style={[s.inputLeft, !isEditing && s.inputReadonly]}
                          editable={isEditing}
                          value={d.remarks}
                          onChangeText={v => updateSavedField(entry.id, 'remarks', v)}
                        />
                      </View>

                      {/* Actions */}
                      <View style={[s.cell, s.actionCell, { width: W.action }]}>
                        {isEditing ? (
                          <>
                            <TouchableOpacity
                              disabled={savingKey === String(entry.id)}
                              onPress={() => requestSave(String(entry.id), d, entry.entry_date, entry.entry_date_dmy)}
                              style={[s.miniBtn, { backgroundColor: '#16a34a', paddingHorizontal: 8 }]}
                              accessibilityLabel="Save changes"
                            >
                              {savingKey === String(entry.id) ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={s.miniBtnText}>💾</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => cancelEdit(entry)}
                              style={[s.miniBtn, { backgroundColor: '#64748b', paddingHorizontal: 8 }]}
                              accessibilityLabel="Cancel edit"
                            >
                              <Text style={s.miniBtnText}>✕</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity
                              disabled={fetchingKey === String(entry.id)}
                              onPress={() => void fetchPortalForSavedRow(entry)}
                              style={[s.miniBtn, { backgroundColor: '#0284c7' }]}
                              accessibilityLabel="Refresh from portal"
                            >
                              {fetchingKey === String(entry.id) ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={s.miniBtnText}>🔄</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => startEdit(entry)}
                              style={[s.miniBtn, { backgroundColor: '#f59e0b', paddingHorizontal: 8 }]}
                              accessibilityLabel="Edit entry"
                            >
                              <Text style={s.miniBtnText}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => deleteEntry(entry)}
                              style={[s.miniBtn, { backgroundColor: '#dc2626' }]}
                              accessibilityLabel="Delete entry"
                            >
                              <Text style={s.miniBtnText}>🗑️</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </TableScrollWrapper>
          )}
        </View>
      </ScrollView>

      {/* Portal Bills Breakdown Modal */}
      <Modal visible={billModalVisible} transparent animationType="fade" onRequestClose={() => setBillModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxWidth: 960 }]}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.modalTitle}>{billModalTitle || '📄 Portal Fees Bills'}</Text>
                {billModalMeta ? (
                  <Text style={[s.modalMeta, { backgroundColor: '#f5f3ff', color: '#6d28d9' }]}>
                    {billModalMeta}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setBillModalVisible(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {billModalLoading ? (
              <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#7c3aed" />
                <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13, fontWeight: '700' }}>
                  বিল লোড হচ্ছে...
                </Text>
              </View>
            ) : billModalBills.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '700' }}>
                  কোনো বিল পাওয়া যায়নি।
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                <View style={s.billHead}>
                  <Text style={[s.billTh, { width: 65 }]}>Bill No</Text>
                  <Text style={[s.billTh, { width: 65 }]}>Type</Text>
                  <Text style={[s.billTh, { width: 155 }]}>Payment Mode</Text>
                  <Text style={[s.billTh, { width: 75 }]}>Reg No</Text>
                  <Text style={[s.billTh, { flex: 1 }]}>Student Name</Text>
                  <Text style={[s.billTh, { width: 70 }]}>Class</Text>
                  <Text style={[s.billTh, { width: 80, textAlign: 'right' }]}>Dev Fee</Text>
                  <Text style={[s.billTh, { width: 90, textAlign: 'right' }]}>Amount</Text>
                </View>
                {billModalBills.map((b, i) => (
                  <View key={`${b.bill_number}-${i}`} style={[s.billRow, i % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                    <Text style={[s.billTd, { width: 65, fontWeight: '800' }]}>{b.bill_number}</Text>
                    <Text
                      style={[
                        s.billTd,
                        {
                          width: 65,
                          fontWeight: '700',
                          color: b.is_development_bill ? '#9333ea' : '#1d4ed8'
                        }
                      ]}
                    >
                      {b.is_development_bill ? 'Dev.' : 'Fees'}
                    </Text>
                    <Text style={[s.billTd, { width: 155 }]} numberOfLines={1}>{b.raw_payment_mode}</Text>
                    <Text style={[s.billTd, { width: 75 }]}>{b.registration_no}</Text>
                    <Text style={[s.billTd, { flex: 1 }]} numberOfLines={1}>{b.student_name}</Text>
                    <Text style={[s.billTd, { width: 70 }]}>{b.class_name}</Text>
                    <Text style={[s.billTd, { width: 80, textAlign: 'right' }]}>{b.development_fee > 0 ? fmtInr(b.development_fee) : '-'}</Text>
                    <Text style={[s.billTd, { width: 90, textAlign: 'right', fontWeight: '800', color: '#15803d' }]}>{fmtInr(b.amount)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={[s.pvModalFooter, { borderTopColor: '#ddd6fe' }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#5b21b6' }}>
                মোট বিল: {billModalBills.length} টি  |  মোট টাকা: {fmtInr(billModalBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0))}
              </Text>
              <TouchableOpacity onPress={() => setBillModalVisible(false)} style={[s.primaryBtn, { backgroundColor: '#7c3aed' }]}>
                <Text style={s.primaryBtnText}>বন্ধ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Vouchers Breakdown Modal */}
      <Modal visible={pvModalVisible} transparent animationType="fade" onRequestClose={() => setPvModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxWidth: 960 }]}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.modalTitle}>{pvModalTitle || '💳 Payment Vouchers'}</Text>
                {pvModalMeta ? <Text style={[s.modalMeta, { backgroundColor: '#fff1f2', color: '#9f1239' }]}>{pvModalMeta}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setPvModalVisible(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {pvModalLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#be123c" />
                <Text style={{ marginTop: 10, color: '#475569', fontWeight: '700' }}>পোর্টাল থেকে পেমেন্ট ভাউচার লোড হচ্ছে...</Text>
              </View>
            ) : pvModalVouchers.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '700' }}>কোনো Payment Voucher পাওয়া যায়নি।</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 440 }}>
                <View style={[s.billHead, { backgroundColor: '#881337' }]}>
                  <Text style={[s.billTh, { width: 45 }]}>#</Text>
                  <Text style={[s.billTh, { width: 90 }]}>Vch No</Text>
                  <Text style={[s.billTh, { width: 90 }]}>Date</Text>
                  <Text style={[s.billTh, { flex: 1 }]}>Particulars / Payee</Text>
                  <Text style={[s.billTh, { width: 75 }]}>Type</Text>
                  <Text style={[s.billTh, { width: 110, textAlign: 'right' }]}>Debit Amount</Text>
                  <Text style={[s.billTh, { width: 140 }]}>Created By</Text>
                </View>
                {pvModalVouchers.map((v, i) => {
                  const deb = typeof v.debit === 'number' ? v.debit : parseFloat(String(v.debit || '').replace(/,/g, '')) || 0;
                  return (
                    <View key={`${v.vch_no}-${i}`} style={[s.billRow, i % 2 === 1 && { backgroundColor: '#fff1f2' }]}>
                      <Text style={[s.billTd, { width: 45, color: '#64748b', fontSize: 11 }]}>{i + 1}</Text>
                      <Text style={[s.billTd, { width: 90, fontWeight: '800', color: '#9f1239' }]}>{v.vch_no}</Text>
                      <Text style={[s.billTd, { width: 90, fontSize: 11.5 }]}>{v.date}</Text>
                      <Text style={[s.billTd, { flex: 1, fontWeight: '600' }]} numberOfLines={2}>{v.particulars}</Text>
                      <Text style={[s.billTd, { width: 75, color: '#be123c', fontWeight: '700' }]}>{v.vch_type || 'Payment'}</Text>
                      <Text style={[s.billTd, { width: 110, textAlign: 'right', fontWeight: '800', color: '#be123c' }]}>{fmtInr(deb)}</Text>
                      <Text style={[s.billTd, { width: 140, fontSize: 11, color: '#475569' }]} numberOfLines={1}>{v.user_name || '-'}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View style={s.pvModalFooter}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#881337' }}>
                মোট ভাউচার: {pvModalVouchers.length} টি  |  মোট পেমেন্ট: {fmtInr(pvModalVouchers.reduce((sum, v) => sum + (typeof v.debit === 'number' ? v.debit : parseFloat(String(v.debit || '').replace(/,/g, '')) || 0), 0))}
              </Text>
              <TouchableOpacity onPress={() => setPvModalVisible(false)} style={[s.primaryBtn, { backgroundColor: '#be123c' }]}>
                <Text style={s.primaryBtnText}>বন্ধ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save Confirmation Warning Modal */}
      <Modal
        visible={Boolean(confirmSaveTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmSaveTarget(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxWidth: 500, padding: 22 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: confirmSaveTarget?.isNew ? '#ecfdf5' : '#fef3c7',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: confirmSaveTarget?.isNew ? '#a7f3d0' : '#fde68a'
                }}
              >
                <Text style={{ fontSize: 24 }}>{confirmSaveTarget?.isNew ? '💾' : '⚠️'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#0f172a' }}>
                  {confirmSaveTarget?.isNew ? 'নতুন Cash Book সেভ করবেন?' : 'Cash Book এন্ট্রি আপডেট সতর্কতা'}
                </Text>
                <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  তারিখ: <Text style={{ fontWeight: '700', color: '#1e293b' }}>{confirmSaveTarget?.dateLabel}</Text>
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: confirmSaveTarget?.isNew ? '#f8fafc' : '#fffbeb',
                borderColor: confirmSaveTarget?.isNew ? '#e2e8f0' : '#fef08a',
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
                marginBottom: 20
              }}
            >
              <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                {confirmSaveTarget?.isNew
                  ? `আপনি ${confirmSaveTarget?.dateLabel} তারিখের নতুন Daily Cash Book রেকর্ডটি সিস্টেমে সেভ করতে চলেছেন। সমস্ত তথ্য সঠিক আছে কিনা অনুগ্রহ করে একবার মিলিয়ে নিন।`
                  : `⚠️ আপনি ${confirmSaveTarget?.dateLabel} তারিখের পূর্ববর্তী সেভ করা Cash Book রেকর্ডটিতে পরিবর্তন সেভ করতে চলেছেন। ভুলবশত পরিবর্তন এড়াতে নিশ্চিত হয়ে সেভ করুন।`}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setConfirmSaveTarget(null)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 6,
                  backgroundColor: '#f1f5f9',
                  borderWidth: 1,
                  borderColor: '#cbd5e1'
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>✕ বাতিল (Cancel)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!confirmSaveTarget) return;
                  const target = confirmSaveTarget;
                  setConfirmSaveTarget(null);
                  void saveDraft(target.key, target.draft, target.overrideDate);
                }}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 9,
                  borderRadius: 6,
                  backgroundColor: confirmSaveTarget?.isNew ? '#16a34a' : '#2563eb'
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>
                  💾 হ্যাঁ, সেভ করুন
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollNavigationButtons scrollRef={scrollRef} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9', width: '100%', maxWidth: '100%' },
  body: { padding: 14, paddingBottom: 90, gap: 12, width: '100%', maxWidth: '100%' },

  tabsBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tabBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  tabBtnActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  tabBtnTextActive: { color: '#ffffff' },

  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  heroLeft: { flex: 1, minWidth: 260, gap: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12.5, color: '#475569' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  primaryBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  primaryBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  secondaryBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  secondaryBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    padding: 12
  },
  kpiLabel: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  kpiVal: { fontSize: 20, fontWeight: '900', marginTop: 4 },

  datePickerInline: {
    minWidth: 145,
    justifyContent: 'center'
  },
  datePickerControl: {
    marginBottom: 0,
    minWidth: 140,
    height: 38
  },
  hintBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 7,
    paddingHorizontal: 12
  },
  filterBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  filterBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  filterHint: { fontSize: 12, color: '#475569', flex: 1, minWidth: 220, alignSelf: 'center' },

  successBanner: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  successText: { color: '#166534', fontWeight: '700', fontSize: 13, flex: 1 },
  inlineLinkBtn: {
    backgroundColor: '#15803d',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  inlineLinkBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },

  errorBanner: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10
  },
  errorText: { color: '#991b1b', fontWeight: '700', fontSize: 13 },

  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    width: '100%',
    maxWidth: '100%'
  },
  tableScrollFrame: {
    backgroundColor: '#ffffff',
    width: '100%',
    ...(Platform.OS === 'web'
      ? ({
        overflow: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: '#93c5fd #f1f5f9',
      } as any)
      : {}),
  },
  tableScrollMaxHeight: {
    maxHeight: 880,
  },
  stickyHeader: {
    ...(Platform.OS === 'web'
      ? ({
        position: 'sticky',
        top: 0,
        zIndex: 20,
        backgroundColor: '#dbeafe',
      } as any)
      : {}),
  },
  stickyNewRow: {
    ...(Platform.OS === 'web'
      ? ({
        position: 'sticky',
        top: 84,
        zIndex: 19,
        backgroundColor: '#eff6ff',
      } as any)
      : {}),
  },
  centerBox: { padding: 40, alignItems: 'center', gap: 8 },
  muted: { color: '#64748b', fontSize: 13 },

  // 3-Row Grouped Header matching Screenshot 1
  headerGroupWrap: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#334155',
    backgroundColor: '#dbeafe'
  },
  hSpanCell: {
    height: 84,
    backgroundColor: '#dbeafe',
    borderRightWidth: 1,
    borderRightColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  hTier1: {
    height: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#64748b',
    borderRightWidth: 1,
    borderRightColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center'
  },
  hTier2: {
    height: 26,
    borderBottomWidth: 1,
    borderBottomColor: '#64748b',
    borderRightWidth: 1,
    borderRightColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center'
  },
  hTier2Split: { flexDirection: 'row', height: 26 },
  hTier2Part: {
    height: 26,
    borderBottomWidth: 1,
    borderBottomColor: '#64748b',
    borderRightWidth: 1,
    borderRightColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center'
  },
  hTier3Row: { flexDirection: 'row', height: 30 },
  hSubCell: {
    height: 30,
    backgroundColor: '#dbeafe',
    borderRightWidth: 1,
    borderRightColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3
  },
  hText: { fontSize: 11.5, fontWeight: '800', color: '#0f172a', textAlign: 'center' },

  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center'
  },
  newRowBg: { backgroundColor: '#eff6ff', borderBottomWidth: 2, borderBottomColor: '#1d4ed8' },
  altRow: { backgroundColor: '#f8fafc' },
  cell: {
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
    justifyContent: 'center'
  },
  sectionDividerRight: {
    borderRightWidth: 2.5,
    borderRightColor: '#1e293b'
  },
  newLabel: { textAlign: 'center', fontWeight: '900', fontSize: 12, color: '#1d4ed8' },
  slText: { textAlign: 'center', fontWeight: '800', fontSize: 12.5, color: '#0f172a' },
  dateText: { textAlign: 'center', fontWeight: '700', fontSize: 12, color: '#0f172a' },

  dateBtnBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dateBtnText: { fontSize: 11.5, fontWeight: '700', color: '#0f172a' },
  dateBtnIcon: { fontSize: 11 },
  inputCenter: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 5,
    fontSize: 12,
    textAlign: 'center',
    color: '#0f172a'
  },
  inputMulti: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 11.5,
    lineHeight: 15,
    minHeight: 34,
    maxHeight: 68,
    textAlign: 'center',
    fontWeight: '700',
    color: '#0f172a'
  },
  inputNum: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 12,
    textAlign: 'right',
    fontWeight: '600',
    color: '#0f172a'
  },
  inputLeft: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 12,
    textAlign: 'left',
    color: '#0f172a'
  },
  readonlyBox: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  readonlyNum: { fontSize: 12, fontWeight: '800', textAlign: 'right', color: '#0f172a' },
  faintText: { color: 'rgba(0, 0, 0, 0.20)', fontWeight: '600' },
  matchBg: { backgroundColor: '#86efac', borderColor: '#16a34a' },
  matchText: { color: '#14532d', fontWeight: '900' },
  mismatchBg: { backgroundColor: '#fecaca', borderColor: '#dc2626' },
  mismatchText: { color: '#991b1b', fontWeight: '900' },
  editingRow: { backgroundColor: '#fefce8' },
  inputReadonly: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    color: '#334155'
  },

  actionCell: { flexDirection: 'row', gap: 5, justifyContent: 'center', alignItems: 'center' },
  miniBtn: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  miniBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },

  // Portal Bills Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 960,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    gap: 10
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  modalCloseBtn: {
    backgroundColor: '#e2e8f0',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCloseText: { fontWeight: '800', color: '#334155', fontSize: 14 },
  modalMeta: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 9,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1e3a8a'
  },
  billHead: {
    flexDirection: 'row',
    backgroundColor: '#173f68',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8
  },
  billTh: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  billRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center'
  },
  billTd: { fontSize: 12, color: '#0f172a' },
  billMiniBtn: {
    marginTop: 4,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#c4b5fd',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 4,
    alignItems: 'center'
  },
  billMiniBtnText: {
    color: '#6d28d9',
    fontSize: 10,
    fontWeight: '800'
  },
  vchMiniBtn: {
    marginTop: 4,
    backgroundColor: '#ffe4e6',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 4,
    alignItems: 'center'
  },
  vchMiniBtnText: {
    color: '#9f1239',
    fontSize: 10,
    fontWeight: '800'
  },
  pvModalFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#fecdd3',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap'
  }
});
