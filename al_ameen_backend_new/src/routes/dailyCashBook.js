const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getFeesReportData, getHostelFeeReceiptVouchers, getCashBookPaymentData } = require('../utils/alAmeenAccounts');

const router = express.Router();

let ready;
function schema() {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS daily_cash_book_entries (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL UNIQUE,
        fees_bill TEXT DEFAULT '',
        dev_bill TEXT DEFAULT '',
        bank_gateway NUMERIC(14,2) NOT NULL DEFAULT 0,
        bank_cheque NUMERIC(14,2) NOT NULL DEFAULT 0,
        bank_edc NUMERIC(14,2) NOT NULL DEFAULT 0,
        bank_swipe_card NUMERIC(14,2) NOT NULL DEFAULT 0,
        bank_rv_bill TEXT DEFAULT '',
        cash_fees NUMERIC(14,2) NOT NULL DEFAULT 0,
        cash_other_source NUMERIC(14,2) NOT NULL DEFAULT 0,
        cash_pv_bill TEXT DEFAULT '',
        cash_voucher_payment NUMERIC(14,2) NOT NULL DEFAULT 0,
        cash_bank_deposit NUMERIC(14,2) NOT NULL DEFAULT 0,
        opening_balance_override NUMERIC(14,2),
        machine_balance NUMERIC(14,2),
        remarks TEXT DEFAULT '',
        portal_bill_count INTEGER NOT NULL DEFAULT 0,
        portal_sessions VARCHAR(100) DEFAULT '',
        portal_synced_at TIMESTAMPTZ,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_daily_cash_book_date ON daily_cash_book_entries (entry_date DESC);
      ALTER TABLE daily_cash_book_entries ALTER COLUMN fees_bill TYPE TEXT;
      ALTER TABLE daily_cash_book_entries ALTER COLUMN dev_bill TYPE TEXT;
      ALTER TABLE daily_cash_book_entries ALTER COLUMN bank_rv_bill TYPE TEXT;
      ALTER TABLE daily_cash_book_entries ALTER COLUMN cash_pv_bill TYPE TEXT;
      ALTER TABLE daily_cash_book_entries ADD COLUMN IF NOT EXISTS bank_payment NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE daily_cash_book_entries ADD COLUMN IF NOT EXISTS cash_payment NUMERIC(14,2) NOT NULL DEFAULT 0;
      UPDATE daily_cash_book_entries SET bank_payment = cash_voucher_payment WHERE (bank_payment IS NULL OR bank_payment = 0) AND cash_voucher_payment > 0;
    `).catch(err => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

function toNum(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Number(n.toFixed(2)) : fallback;
}

function toNullableNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function formatYmd(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
}

function formatDmy(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(ymd || '');
}

function todayIstYmd() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

async function computeLedger({ fromDate = '', toDate = '' } = {}) {
  await schema();
  const res = await pool.query(`
    SELECT e.*,
           TO_CHAR(e.entry_date, 'YYYY-MM-DD') AS entry_date_str,
           u1.full_name AS created_by_name,
           u2.full_name AS updated_by_name
    FROM daily_cash_book_entries e
    LEFT JOIN users u1 ON u1.id = e.created_by
    LEFT JOIN users u2 ON u2.id = e.updated_by
    ORDER BY e.entry_date ASC, e.id ASC
  `);

  let runningCash = 0;
  let lastFeesBill = '';
  let lastDevBill = '';
  const computed = [];

  res.rows.forEach((r, idx) => {
    const hasOverride = r.opening_balance_override !== null && r.opening_balance_override !== undefined;
    const openingBalance = hasOverride ? Number(r.opening_balance_override) : runningCash;

    const bankGateway = Number(r.bank_gateway || 0);
    const bankCheque = Number(r.bank_cheque || 0);
    const bankEdc = Number(r.bank_edc || 0);
    const bankSwipeCard = Number(r.bank_swipe_card || 0);
    const bankReceivedTotal = Number((bankGateway + bankCheque + bankEdc + bankSwipeCard).toFixed(2));

    const cashFees = Number(r.cash_fees || 0);
    const cashOtherSource = Number(r.cash_other_source || 0);
    const cashReceivedTotal = Number((cashFees + cashOtherSource).toFixed(2));

    const bankPayment = Number(r.bank_payment !== undefined && r.bank_payment !== null ? r.bank_payment : (r.cash_voucher_payment || 0));
    const cashPayment = Number(r.cash_payment || 0);
    const cashBankDeposit = Number(r.cash_bank_deposit || 0);
    const paymentTotal = Number((bankPayment + cashPayment + cashBankDeposit).toFixed(2));
    const cashPaymentTotal = Number((cashPayment + cashBankDeposit).toFixed(2));

    const cashInHand = Number((openingBalance + cashReceivedTotal - cashPaymentTotal).toFixed(2));
    runningCash = cashInHand;

    if (String(r.fees_bill || '').trim()) lastFeesBill = String(r.fees_bill).trim();
    if (String(r.dev_bill || '').trim()) lastDevBill = String(r.dev_bill).trim();

    const machineBalance =
      r.machine_balance !== null && r.machine_balance !== undefined
        ? Number(r.machine_balance)
        : null;
    const balanceMatched =
      machineBalance !== null ? Math.abs(machineBalance - cashInHand) < 0.01 : null;

    computed.push({
      id: r.id,
      sl_no: idx + 1,
      entry_date: r.entry_date_str,
      entry_date_dmy: formatDmy(r.entry_date_str),
      fees_bill: r.fees_bill || '',
      dev_bill: r.dev_bill || '',
      bank_gateway: bankGateway,
      bank_cheque: bankCheque,
      bank_edc: bankEdc,
      bank_swipe_card: bankSwipeCard,
      bank_rv_bill: r.bank_rv_bill || '',
      bank_received_total: bankReceivedTotal,
      cash_fees: cashFees,
      cash_other_source: cashOtherSource,
      cash_received_total: cashReceivedTotal,
      cash_pv_bill: r.cash_pv_bill || '',
      bank_payment: bankPayment,
      cash_payment: cashPayment,
      cash_voucher_payment: bankPayment,
      cash_bank_deposit: cashBankDeposit,
      payment_total: paymentTotal,
      cash_payment_total: cashPaymentTotal,
      opening_balance: Number(openingBalance.toFixed(2)),
      opening_balance_override: hasOverride ? Number(r.opening_balance_override) : null,
      cash_in_hand: cashInHand,
      machine_balance: machineBalance,
      balance_matched: balanceMatched,
      remarks: r.remarks || '',
      portal_bill_count: Number(r.portal_bill_count || 0),
      portal_sessions: r.portal_sessions || '',
      portal_synced_at: r.portal_synced_at,
      created_by_name: r.created_by_name || null,
      updated_by_name: r.updated_by_name || null,
      updated_at: r.updated_at
    });
  });

  const fFrom = formatYmd(fromDate);
  const fTo = formatYmd(toDate);
  const filtered = computed.filter(row => {
    if (fFrom && row.entry_date < fFrom) return false;
    if (fTo && row.entry_date > fTo) return false;
    return true;
  });

  // Display newest-first right below the "New" row (SL N down to 1)
  const entries = [...filtered].reverse();

  const totals = filtered.reduce(
    (acc, r) => {
      acc.bank_gateway += r.bank_gateway;
      acc.bank_cheque += r.bank_cheque;
      acc.bank_edc += r.bank_edc;
      acc.bank_swipe_card += r.bank_swipe_card;
      acc.bank_received_total += r.bank_received_total;
      acc.cash_fees += r.cash_fees;
      acc.cash_other_source += r.cash_other_source;
      acc.cash_received_total += r.cash_received_total;
      acc.bank_payment = Number(((acc.bank_payment || 0) + (r.bank_payment || 0)).toFixed(2));
      acc.cash_payment = Number(((acc.cash_payment || 0) + (r.cash_payment || 0)).toFixed(2));
      acc.cash_voucher_payment = acc.bank_payment;
      acc.cash_bank_deposit = Number(((acc.cash_bank_deposit || 0) + (r.cash_bank_deposit || 0)).toFixed(2));
      acc.payment_total = Number(((acc.payment_total || 0) + (r.payment_total || 0)).toFixed(2));
      acc.cash_payment_total = Number(((acc.cash_payment_total || 0) + (r.cash_payment_total || 0)).toFixed(2));
      return acc;
    },
    {
      bank_gateway: 0,
      bank_cheque: 0,
      bank_edc: 0,
      bank_swipe_card: 0,
      bank_received_total: 0,
      cash_fees: 0,
      cash_other_source: 0,
      cash_received_total: 0,
      bank_payment: 0,
      cash_payment: 0,
      cash_voucher_payment: 0,
      cash_bank_deposit: 0,
      payment_total: 0,
      cash_payment_total: 0
    }
  );

  return {
    entries,
    total_entries: entries.length,
    next_opening_balance: Number(runningCash.toFixed(2)),
    last_fees_bill: lastFeesBill,
    last_dev_bill: lastDevBill,
    totals
  };
}

function sortedUniqueBillNumbers(bills) {
  const seen = new Set();
  const list = [];
  for (const b of bills) {
    const raw = String(b.bill_number || '').trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    list.push(raw);
  }
  list.sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10);
    const nb = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
  return list;
}

router.use(auth, allow('super_admin', 'admin', 'office'));

// GET /api/daily-cashbook — returns saved entries with chronological running balances
router.get('/', asyncHandler(async (req, res) => {
  const ledger = await computeLedger({
    fromDate: req.query.from_date || '',
    toDate: req.query.to_date || ''
  });
  res.json({ success: true, ...ledger });
}));

// POST /api/daily-cashbook/fetch-portal — fetches last 2 sessions from fees_report for a specific date
router.post('/fetch-portal', asyncHandler(async (req, res) => {
  await schema();
  const entryDate = formatYmd(req.body?.entry_date || req.body?.date) || todayIstYmd();

  const report = await getFeesReportData({
    fromDate: entryDate,
    toDate: entryDate,
    session: 'last_2_sessions',
    branch: 'Memari',
    forceRefresh: true
  });

  if (!report || !report.success) {
    return res.status(report?.need_login ? 401 : 502).json({
      success: false,
      need_login: Boolean(report?.need_login),
      message: report?.message || 'Could not fetch fees report from Al-Ameen Accounts portal.'
    });
  }

  // Strictly match bills of the requested entry_date (in case portal returns extra dates)
  const bills = (report.fees || []).filter(b => !b.transaction_date || b.transaction_date === entryDate);

  const regularBills = bills.filter(b => !b.is_development_bill);
  const devBills = bills.filter(b => b.is_development_bill);

  const feesBillList = sortedUniqueBillNumbers(regularBills);
  const devBillList = sortedUniqueBillNumbers(devBills);

  const feesBill = feesBillList.join(', ');
  const feesBillRange =
    feesBillList.length > 1
      ? `${feesBillList[0]}-${feesBillList[feesBillList.length - 1]}`
      : (feesBillList[0] || '');
  const devBill = devBillList.join(', ');
  const devBillRange =
    devBillList.length > 1
      ? `${devBillList[0]}-${devBillList[devBillList.length - 1]}`
      : (devBillList[0] || '');

  let bankGateway = 0;
  let bankCheque = 0;
  let bankSwipeCard = 0;
  let cashFees = 0;

  for (const b of bills) {
    const amt = Number(b.amount || 0);
    const mode = b.cashbook_mode || (b.payment_mode === 'cash' ? 'cash' : 'gateway');
    if (mode === 'cash') {
      cashFees += amt;
    } else if (mode === 'cheque') {
      bankCheque += amt;
    } else if (mode === 'swipe_card') {
      bankSwipeCard += amt;
    } else {
      // EDC + payment_gateway + online -> Gateway (as explicitly requested)
      bankGateway += amt;
    }
  }

  // Fetch Vouchers for R.V Bill (Receipt) and P.V Bill (Payment) from action=vouchers
  let rvBill = '';
  let rvBillList = [];
  let rvBillRange = '';
  let voucherReceiptCount = 0;
  let pvBill = '';
  let pvBillList = [];
  let pvBillRange = '';
  let voucherPaymentCount = 0;
  let voucherPaymentTotal = 0;
  let vchData = null;

  try {
    vchData = await getHostelFeeReceiptVouchers({ dateStr: entryDate });
    if (vchData?.success) {
      rvBillList = vchData.vouchers || [];
      rvBill = vchData.rv_bill || '';
      rvBillRange = vchData.rv_bill_range || '';
      voucherReceiptCount = vchData.total_receipts || 0;

      pvBillList = vchData.payment_vouchers || [];
      pvBill = vchData.pv_bill || '';
      pvBillRange = vchData.pv_bill_range || '';
      voucherPaymentCount = vchData.total_payments || 0;
      voucherPaymentTotal = Number(vchData.voucher_payment_total || 0);
    }
  } catch (err) {
    console.error(`[DailyCashBook] Voucher sync error for ${entryDate}:`, err.message);
  }

  // Fetch Cash Book Payments from action=cash_book
  let cashPaymentTotal = 0;
  let cashBookPayments = [];
  try {
    const cashBookRes = await getCashBookPaymentData({ dateStr: entryDate });
    if (cashBookRes?.success) {
      cashPaymentTotal = Number(cashBookRes.cash_payment_total || 0);
      cashBookPayments = cashBookRes.payments || [];
    }
  } catch (err) {
    console.error(`[DailyCashBook] Cash book payment sync error for ${entryDate}:`, err.message);
  }

  // Bank Payment = Voucher Payment Total - Cash Payment (voucher total minus cash payment)
  const netBankPayment = Math.max(0, Number((voucherPaymentTotal - cashPaymentTotal).toFixed(2)));

  res.json({
    success: true,
    entry_date: entryDate,
    entry_date_dmy: formatDmy(entryDate),
    queried_sessions: report.queried_sessions || [],
    bill_count: bills.length,
    regular_bill_count: regularBills.length,
    dev_bill_count: devBills.length,
    fees_bill: feesBill,
    fees_bill_list: feesBillList,
    fees_bill_range: feesBillRange,
    dev_bill: devBill,
    dev_bill_list: devBillList,
    dev_bill_range: devBillRange,
    bank_gateway: Number(bankGateway.toFixed(2)),
    bank_cheque: Number(bankCheque.toFixed(2)),
    bank_edc: 0,
    bank_swipe_card: Number(bankSwipeCard.toFixed(2)),
    bank_rv_bill: rvBill,
    bank_rv_bill_list: rvBillList,
    bank_rv_bill_range: rvBillRange,
    voucher_receipt_count: voucherReceiptCount,
    cash_fees: Number(cashFees.toFixed(2)),
    cash_pv_bill: pvBill,
    cash_pv_bill_list: pvBillList,
    cash_pv_bill_range: pvBillRange,
    voucher_payment_count: voucherPaymentCount,
    voucher_payment_total: Number(voucherPaymentTotal.toFixed(2)),
    cancelled_payments_count: vchData?.cancelled_payments_count || 0,
    cancelled_receipts_count: vchData?.cancelled_receipts_count || 0,
    bank_payment: netBankPayment,
    cash_payment: Number(cashPaymentTotal.toFixed(2)),
    cash_payment_count: cashBookPayments.length,
    cash_voucher_payment: netBankPayment,
    payment_vouchers_details: (vchData && vchData.raw_payments) || [],
    receipt_vouchers_details: (vchData && vchData.raw_vouchers) || [],
    cash_book_payments_details: cashBookPayments,
    total_amount: Number((bankGateway + bankCheque + bankSwipeCard + cashFees).toFixed(2)),
    bills: bills.map(b => ({
      bill_number: b.bill_number,
      registration_no: b.registration_no,
      student_name: b.student_name,
      class_name: b.class_name,
      session: b.session || '',
      raw_payment_mode: b.raw_payment_mode || b.details || '',
      cashbook_mode: b.cashbook_mode || (b.payment_mode === 'cash' ? 'cash' : 'gateway'),
      development_fee: Number(b.development_fee || 0),
      is_development_bill: Boolean(b.is_development_bill),
      amount: Number(b.amount || 0)
    }))
  });
}));

// GET /api/daily-cashbook/cash-payments?date=YYYY-MM-DD — fetch cash payments directly from action=cash_book
router.get('/cash-payments', asyncHandler(async (req, res) => {
  const dateStr = formatYmd(req.query.date || req.query.entry_date || '');
  if (!dateStr) {
    return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) is required.' });
  }

  try {
    const cashBookRes = await getCashBookPaymentData({ dateStr });
    if (!cashBookRes?.success) {
      return res.status(502).json({ success: false, message: 'Failed to fetch cash book payments from portal.' });
    }

    res.json({
      success: true,
      entry_date: dateStr,
      entry_date_dmy: formatDmy(dateStr),
      financial_year: cashBookRes.financial_year,
      total_count: cashBookRes.total_count || 0,
      cash_payment_total: cashBookRes.cash_payment_total || 0,
      payments: cashBookRes.payments || []
    });
  } catch (err) {
    console.error(`[DailyCashBook] Error fetching cash payments for ${dateStr}:`, err);
    res.status(500).json({ success: false, message: err.message || 'Error fetching cash payments.' });
  }
}));

// GET /api/daily-cashbook/vouchers?date=YYYY-MM-DD — fetch voucher details (payment & receipt) for a specific date
router.get('/vouchers', asyncHandler(async (req, res) => {
  const dateStr = formatYmd(req.query.date || req.query.entry_date || '');
  if (!dateStr) {
    return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) is required.' });
  }

  try {
    const vchData = await getHostelFeeReceiptVouchers({ dateStr });
    if (!vchData?.success) {
      return res.status(502).json({ success: false, message: 'Failed to fetch vouchers from portal.' });
    }

    res.json({
      success: true,
      entry_date: dateStr,
      entry_date_dmy: formatDmy(dateStr),
      financial_year: vchData.financial_year,
      total_receipts: vchData.total_receipts || 0,
      rv_bill: vchData.rv_bill || '',
      rv_bill_range: vchData.rv_bill_range || '',
      receipt_vouchers: vchData.vouchers || [],
      receipt_vouchers_details: vchData.raw_vouchers || [],
      total_payments: vchData.total_payments || 0,
      cancelled_payments_count: vchData.cancelled_payments_count || 0,
      cancelled_receipts_count: vchData.cancelled_receipts_count || 0,
      pv_bill: vchData.pv_bill || '',
      pv_bill_range: vchData.pv_bill_range || '',
      payment_vouchers: vchData.payment_vouchers || [],
      voucher_payment_total: Number(vchData.voucher_payment_total || 0),
      payment_vouchers_details: vchData.raw_payments || []
    });
  } catch (err) {
    console.error(`[DailyCashBook] Error fetching vouchers for ${dateStr}:`, err);
    res.status(500).json({ success: false, message: err.message || 'Error fetching vouchers.' });
  }
}));

// POST /api/daily-cashbook/save — create or update an entry by entry_date (or id)
router.post('/save', asyncHandler(async (req, res) => {
  await schema();
  const body = req.body || {};
  const entryDate = formatYmd(body.entry_date);
  if (!entryDate) {
    return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) is required.' });
  }

  const feesBill = String(body.fees_bill ?? '').trim();
  const devBill = String(body.dev_bill ?? '').trim();
  const bankGateway = toNum(body.bank_gateway, 0);
  const bankCheque = toNum(body.bank_cheque, 0);
  const bankEdc = toNum(body.bank_edc, 0);
  const bankSwipeCard = toNum(body.bank_swipe_card, 0);
  const bankRvBill = String(body.bank_rv_bill ?? '').trim();
  const cashFees = toNum(body.cash_fees, 0);
  const cashOtherSource = toNum(body.cash_other_source, 0);
  const cashPvBill = String(body.cash_pv_bill ?? '').trim();
  const bankPayment = toNum(body.bank_payment !== undefined && body.bank_payment !== null ? body.bank_payment : body.cash_voucher_payment, 0);
  const cashPayment = toNum(body.cash_payment, 0);
  const cashVoucherPayment = bankPayment;
  const cashBankDeposit = toNum(body.cash_bank_deposit, 0);
  const openingOverride = toNullableNum(body.opening_balance_override);
  const machineBalance = toNullableNum(body.machine_balance);
  const remarks = String(body.remarks ?? '').trim();
  const portalBillCount = Math.max(0, parseInt(body.portal_bill_count || 0, 10) || 0);
  const portalSessions = String(body.portal_sessions ?? '').trim().slice(0, 100);
  const markSynced = Boolean(body.portal_synced);

  await pool.query(
    `INSERT INTO daily_cash_book_entries (
       entry_date, fees_bill, dev_bill,
       bank_gateway, bank_cheque, bank_edc, bank_swipe_card, bank_rv_bill,
       cash_fees, cash_other_source, cash_pv_bill,
       bank_payment, cash_payment, cash_voucher_payment, cash_bank_deposit,
       opening_balance_override, machine_balance, remarks,
       portal_bill_count, portal_sessions, portal_synced_at,
       created_by, updated_by, updated_at
     ) VALUES (
       $1::date, $2, $3,
       $4, $5, $6, $7, $8,
       $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17, $18,
       $19, $20, CASE WHEN $21::boolean THEN NOW() ELSE NULL END,
       $22, $22, NOW()
     )
     ON CONFLICT (entry_date) DO UPDATE SET
       fees_bill = EXCLUDED.fees_bill,
       dev_bill = EXCLUDED.dev_bill,
       bank_gateway = EXCLUDED.bank_gateway,
       bank_cheque = EXCLUDED.bank_cheque,
       bank_edc = EXCLUDED.bank_edc,
       bank_swipe_card = EXCLUDED.bank_swipe_card,
       bank_rv_bill = EXCLUDED.bank_rv_bill,
       cash_fees = EXCLUDED.cash_fees,
       cash_other_source = EXCLUDED.cash_other_source,
       cash_pv_bill = EXCLUDED.cash_pv_bill,
       bank_payment = EXCLUDED.bank_payment,
       cash_payment = EXCLUDED.cash_payment,
       cash_voucher_payment = EXCLUDED.cash_voucher_payment,
       cash_bank_deposit = EXCLUDED.cash_bank_deposit,
       opening_balance_override = EXCLUDED.opening_balance_override,
       machine_balance = EXCLUDED.machine_balance,
       remarks = EXCLUDED.remarks,
       portal_bill_count = CASE WHEN $21::boolean THEN EXCLUDED.portal_bill_count ELSE daily_cash_book_entries.portal_bill_count END,
       portal_sessions = CASE WHEN $21::boolean THEN EXCLUDED.portal_sessions ELSE daily_cash_book_entries.portal_sessions END,
       portal_synced_at = CASE WHEN $21::boolean THEN NOW() ELSE daily_cash_book_entries.portal_synced_at END,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [
      entryDate, feesBill, devBill,
      bankGateway, bankCheque, bankEdc, bankSwipeCard, bankRvBill,
      cashFees, cashOtherSource, cashPvBill,
      bankPayment, cashPayment, cashVoucherPayment, cashBankDeposit,
      openingOverride, machineBalance, remarks,
      portalBillCount, portalSessions, markSynced,
      req.user.userId
    ]
  );

  const ledger = await computeLedger({
    fromDate: req.query.from_date || '',
    toDate: req.query.to_date || ''
  });
  res.json({ success: true, message: `Saved Daily Cash Book for ${formatDmy(entryDate)}`, ...ledger });
}));

// DELETE /api/daily-cashbook/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  await schema();
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid entry ID' });
  await pool.query('DELETE FROM daily_cash_book_entries WHERE id = $1', [id]);
  const ledger = await computeLedger();
  res.json({ success: true, message: 'Entry deleted', ...ledger });
}));

// GET /api/daily-cashbook/excel — export formatted Excel matching the Daily Cash Book sheet
router.get('/excel', asyncHandler(async (req, res) => {
  const ledger = await computeLedger({
    fromDate: req.query.from_date || '',
    toDate: req.query.to_date || ''
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daily Cash Book', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // Title Row
  const titleRow = ws.addRow(['AL-AMEEN MISSION ACADEMY MEMARI — DAILY CASH BOOK']);
  titleRow.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF173F68' } };
  titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(1, 1, 1, 20);
  ws.getRow(1).height = 24;

  // 3-Row Grouped Header matching Screenshot 1
  // Row 2: Top group headers (Cash strictly over Received cols 10..12; Payment cols 13..16)
  ws.addRow([
    'S.L.', 'Date', 'Fees Bill', 'Dev. Bill',
    'Bank', '', '', '', '',
    'Cash', '', '',
    'Payment', '', '', '',
    'Opening Balance', 'Cash In Hand', 'Machine Balance', 'Remarks'
  ]);
  // Row 3: Mid group headers
  ws.addRow([
    '', '', '', '',
    'Received', '', '', '', '',
    'Received', '', '',
    'Payment', '', '', '',
    '', '', '', ''
  ]);
  // Row 4: Sub-column headers
  ws.addRow([
    '', '', '', '',
    'Gateway', 'Cheque', 'E.D.C', 'Swipe Card', 'R.V Bill',
    'Fees', 'Oth. Source', 'Total',
    'P.V Bill', 'Bank Payment', 'Cash Payment', 'Bank Dep.', 'Total',
    '', '', '', ''
  ]);

  // Merge grouped headers
  ws.mergeCells('A2:A4');
  ws.mergeCells('B2:B4');
  ws.mergeCells('C2:C4');
  ws.mergeCells('D2:D4');
  ws.mergeCells('E2:I2'); // Bank (cols 5..9)
  ws.mergeCells('E3:I3'); // Bank Received
  ws.mergeCells('J2:L2'); // Cash (cols 10..12 strictly over Received)
  ws.mergeCells('J3:L3'); // Cash Received
  ws.mergeCells('M2:Q2'); // Payment top (cols 13..17)
  ws.mergeCells('M3:Q3'); // Payment mid
  ws.mergeCells('R2:R4');
  ws.mergeCells('S2:S4');
  ws.mergeCells('T2:T4');
  ws.mergeCells('U2:U4');

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF475569' } },
    left: { style: 'thin', color: { argb: 'FF475569' } },
    bottom: { style: 'thin', color: { argb: 'FF475569' } },
    right: { style: 'thin', color: { argb: 'FF475569' } }
  };

  for (let r = 2; r <= 4; r++) {
    ws.getRow(r).height = 22;
    for (let c = 1; c <= 21; c++) {
      const cell = ws.getCell(r, c);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    }
  }
  // Color accents matching Screenshot 1
  for (let c = 5; c <= 9; c++) {
    ws.getCell(2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } };
    ws.getCell(2, c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBF7D0' } };
  }
  for (let c = 10; c <= 12; c++) {
    ws.getCell(2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6C7A1' } };
    ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBF7D0' } };
  }
  for (let c = 13; c <= 17; c++) {
    ws.getCell(2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECDD3' } };
    ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECDD3' } };
    ws.getCell(2, c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF881337' } };
    ws.getCell(3, c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF881337' } };
  }

  for (const e of ledger.entries) {
    const row = ws.addRow([
      e.sl_no,
      e.entry_date_dmy,
      e.fees_bill,
      e.dev_bill,
      e.bank_gateway,
      e.bank_cheque,
      e.bank_edc,
      e.bank_swipe_card,
      e.bank_rv_bill,
      e.cash_fees,
      e.cash_other_source,
      e.cash_received_total,
      e.cash_pv_bill,
      e.bank_payment,
      e.cash_payment,
      e.cash_bank_deposit,
      e.payment_total,
      e.opening_balance,
      e.cash_in_hand,
      e.machine_balance === null ? '' : e.machine_balance,
      e.remarks
    ]);
    row.eachCell((cell, col) => {
      cell.border = thinBorder;
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = {
        horizontal: col === 21 ? 'left' : col >= 5 && col <= 20 && col !== 9 && col !== 13 ? 'right' : 'center',
        vertical: 'middle',
        wrapText: col === 3 || col === 4 || col === 9 || col === 13 || col === 21
      };
      if (col >= 5 && col <= 20 && col !== 9 && col !== 13 && typeof cell.value === 'number') {
        cell.numFmt = '#,##0';
      }
      if ((col === 19 || col === 20) && e.balance_matched === true) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF86EFAC' } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF14532D' } };
      } else if ((col === 19 || col === 20) && e.balance_matched === false) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF991B1B' } };
      }
    });
  }

  const widths = [7, 13, 22, 18, 12, 11, 10, 12, 22, 12, 12, 12, 18, 15, 15, 13, 12, 15, 15, 15, 22];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Add thick section dividing line after Bank (col 9), Cash Received (col 12), and Payment (col 17)
  const lastRow = ws.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    for (const c of [9, 12, 17]) {
      const cell = ws.getCell(r, c);
      cell.border = {
        ...cell.border,
        right: { style: 'medium', color: { argb: 'FF0F172A' } }
      };
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="daily-cash-book.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

module.exports = router;
