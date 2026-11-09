const ExcelJS = require('exceljs');
const pool = require('../db');
const { getReceiptPaymentReportData, getFeesReportData, MEMARI_BRANCH_ID } = require('./alAmeenAccounts');

// Normalize numeric/reference strings: strip .0, remove non-digits, trim leading zeros
function norm(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (/^\d+\.0+$/.test(s)) s = s.split('.')[0];
  let digits = s.replace(/\D/g, '');
  digits = digits.replace(/^0+/, '');
  return digits || (digits === '' ? '' : '0');
}

function textValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim();
  return String(v).trim();
}

function money(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v.result !== undefined) v = v.result;
  const s = String(v).replace(/,/g, '').replace(/₹/g, '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// Extract transaction keys from SBI bank statement description
function statementKeys(description) {
  const text = textValue(description);
  // Search for explicit UPI reference: UPI/CR/<ref> or UPI/DR/<ref>
  const upiMatches = [...text.matchAll(/UPI\s*\/\s*(?:CR|DR)\s*\/\s*([0-9]+)/gi)]
    .map(m => norm(m[1]))
    .filter(Boolean);
  if (upiMatches.length > 0) {
    return [...new Set(upiMatches)];
  }
  // Fallback to standalone 6+ digits
  const fallbackMatches = [...text.matchAll(/(?<![A-Za-z0-9])([0-9]{6,})(?![A-Za-z0-9])/g)]
    .map(m => norm(m[1]))
    .filter(Boolean);
  return [...new Set(fallbackMatches)];
}

// Extract reference from Bill report Inst. No. or reference cell
function billReference(value) {
  let text = textValue(value);
  if (/^\d+\.0+$/.test(text)) text = text.split('.')[0];

  const upiMatch = text.match(/UPI\s*\/\s*(?:CR|DR)\s*\/\s*([0-9]{12})(?![0-9])/i);
  if (upiMatch) return norm(upiMatch[1]);

  // Combined ref + date, e.g. "631113191925 07/11/2026" or "631113191925 Date-07/11/2026"
  const explicit = text.match(/(?:UTR|RRN|REF(?:ERENCE)?|UPI)?\s*[:#-]?\s*([0-9]{12})\s*(?:[/|,;\s-]+|\s+(?:dt\.?|date)\s*[:.-]?\s*)([0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{4}|[0-9]{8})/i);
  const compact = text.match(/^([0-9]{12})([0-9]{8})$/);
  const candidate = explicit || compact;
  if (candidate) {
    return norm(candidate[1]);
  }

  const labelled = text.match(/(?:UTR|RRN|REF(?:ERENCE)?|UPI)\s*[:#-]?\s*([0-9]+)/i);
  if (labelled) return norm(labelled[1]);

  if (/^[0-9]+$/.test(text)) return norm(text);

  return '';
}

// Extract Reg. No. and Recpt. No. from Particulars text
function extractRegAndReceipt(text) {
  const t = String(text || '');
  const regMatch = t.match(/Reg\.?\s*No\.?\s*[:\-]?\s*([0-9]+)/i);
  const recMatch = t.match(/Recpt\.?\s*No\.?\s*[:\-]?\s*([0-9]+)/i);
  return {
    reg: regMatch ? regMatch[1].trim() : '',
    receipt: recMatch ? recMatch[1].trim() : '',
  };
}

// Find header row in SBI bank statement
function findStatementHeaderRow(ws) {
  let headerRow = null;
  const maxR = Math.min(ws.rowCount || 100, 100);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      vals.push(textValue(cell.value).toLowerCase());
    });
    if (vals.some(v => v.includes('description')) && vals.some(v => v.includes('balance'))) {
      headerRow = r;
      break;
    }
  }
  return headerRow;
}

// Load Student Details Master from DB (or fallback to students table)
async function getStudentMasterMap() {
  const master = new Map();

  // 1. Load from students table (base master)
  try {
    const dbStudents = await pool.query(
      `SELECT registration_no, student_name, class_name FROM students WHERE is_active = true`
    );
    for (const s of dbStudents.rows) {
      const regKey = norm(s.registration_no);
      if (regKey) {
        master.set(regKey, {
          reg: String(s.registration_no).trim(),
          name: String(s.student_name || '').trim(),
          class: String(s.class_name || '').trim(),
        });
      }
    }
  } catch (err) {
    console.error('Error fetching students for matcher master:', err.message);
  }

  // 2. Overlay with dedicated bank_matcher_master table (if uploaded by user)
  try {
    const customMaster = await pool.query(`SELECT registration_no, student_name, class_name FROM bank_matcher_master`);
    for (const s of customMaster.rows) {
      const regKey = norm(s.registration_no);
      if (regKey) {
        master.set(regKey, {
          reg: String(s.registration_no).trim(),
          name: String(s.student_name || '').trim(),
          class: String(s.class_name || '').trim(),
        });
      }
    }
  } catch (err) {
    // table might not exist yet
  }

  return master;
}

// Parse uploaded Bill Report Excel (.xlsx or .xls)
async function parseUploadedBillExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];

  // Find header row
  let headerRow = null;
  let instCol = null;
  let partCol = null;
  let debitCol = null;
  let creditCol = null;

  for (let r = 1; r <= Math.min(ws.rowCount || 50, 50); r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const val = textValue(cell.value).toLowerCase();
      if (val.includes('inst') && val.includes('no')) instCol = colNumber;
      if (val.includes('particular')) partCol = colNumber;
      if (val.includes('debit')) debitCol = colNumber;
      if (val.includes('credit')) creditCol = colNumber;
    });
    if (instCol && partCol) {
      headerRow = r;
      break;
    }
  }

  if (!headerRow || !instCol || !partCol) {
    throw new Error("Bill Report-e 'Inst. No.' ebong 'Particulars' column paoa jayni.");
  }

  const records = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawInst = textValue(row.getCell(instCol).value);
    if (!rawInst) continue;

    let key = billReference(rawInst);
    if (!key) {
      key = 'INVALID:' + rawInst;
    }

    let amount = money(row.getCell(debitCol || instCol).value);
    if (amount === null || amount === 0) {
      amount = money(row.getCell(creditCol || instCol).value);
    }

    // Collect continuation lines in particulars
    const textParts = [textValue(row.getCell(partCol).value)];
    let nextR = r + 1;
    while (nextR <= ws.rowCount && !textValue(ws.getRow(nextR).getCell(instCol).value)) {
      textParts.push(textValue(ws.getRow(nextR).getCell(partCol).value));
      nextR++;
    }
    const fullPart = textParts.join(' ').trim();
    const { reg, receipt } = extractRegAndReceipt(fullPart);

    records.push({
      key,
      reg,
      receipt,
      amount: amount || 0,
      particulars: fullPart,
      source_row: r,
      raw_reference: rawInst,
    });
  }

  return records;
}

// Fetch live bills from Al-Ameen Accounts Portal (fees_report & bank_book)
async function fetchLiveBillsFromPortal(targetDate = '') {
  const today = new Date().toISOString().slice(0, 10);
  const qDate = targetDate || today;
  const records = [];
  const seenKeys = new Set();

  // 1. Fetch Bank Book for SBI (Account 19665)
  try {
    const rpData = await getReceiptPaymentReportData({ fromDate: qDate, toDate: qDate });
    const sbiRow = (rpData.rows || []).find(r => r.account_name && r.account_name.includes('19665'));
    if (sbiRow && sbiRow.transactions) {
      sbiRow.transactions.forEach((tx, idx) => {
        const rawRef = textValue(tx.narration || '');
        let key = billReference(rawRef);
        if (!key && rawRef) key = 'INVALID:' + rawRef;
        if (!key) return;

        const amount = Number(tx.receipt || tx.payment || 0);
        const { reg, receipt } = extractRegAndReceipt(tx.particulars || '');

        const dedupeKey = `${key}_${reg}_${receipt}_${amount}`;
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          records.push({
            key,
            reg,
            receipt: receipt || textValue(tx.vch_no || ''),
            amount,
            particulars: tx.particulars || '',
            source_row: idx + 1,
            raw_reference: rawRef,
          });
        }
      });
    }
  } catch (err) {
    console.error('Error fetching live bank book bills:', err.message);
  }

  // 2. Fetch Fees Report for last 2 sessions as supplement/fallback
  try {
    const feesData = await getFeesReportData({
      fromDate: qDate,
      toDate: qDate,
      session: 'last_3_sessions',
      branch: 'Memari',
    });

    if (feesData && feesData.fees) {
      feesData.fees.forEach((b, idx) => {
        const rawRef = textValue(b.details || b.raw_payment_mode || '');
        let key = billReference(rawRef);
        if (!key && rawRef && !rawRef.toLowerCase().includes('cash')) key = 'INVALID:' + rawRef;
        if (!key) return;

        const amount = Number(b.amount || 0);
        const reg = textValue(b.registration_no || '');
        const receipt = textValue(b.bill_number || '');

        const dedupeKey = `${key}_${reg}_${receipt}_${amount}`;
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          records.push({
            key,
            reg,
            receipt,
            amount,
            particulars: `Fees received from student against Reg. No. ${reg} / Recpt. No. ${receipt}`,
            source_row: idx + 1,
            raw_reference: rawRef,
          });
        }
      });
    }
  } catch (err) {
    console.error('Error fetching live fees report bills:', err.message);
  }

  return records;
}

// Reconcile function: Matches Statement Buffer against Bills & Student Master
async function reconcileStatement({
  statementBuffer,
  billBuffer = null,
  targetDate = '',
  customMaster = null,
}) {
  // 1. Load Student Master
  let master = customMaster;
  if (!master || !(master instanceof Map)) {
    master = await getStudentMasterMap();
  }

  // 2. Load Bills (from uploaded Excel or live portal fetch)
  let bills = [];
  if (billBuffer && billBuffer.byteLength > 0) {
    bills = await parseUploadedBillExcel(billBuffer);
  } else {
    bills = await fetchLiveBillsFromPortal(targetDate);
  }

  if (!bills || bills.length === 0) {
    throw new Error('No bill records found for reconciliation. Please check portal connection or upload a Bill Report Excel.');
  }

  // 3. Load Statement Workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(statementBuffer);
  const ws = workbook.worksheets[0];

  const headerRow = findStatementHeaderRow(ws);
  if (!headerRow) {
    throw new Error("Bank Statement-er header row paoa jayni. Please ensure Description and Balance columns exist.");
  }

  // Find column indexes in statement
  let descCol = null;
  let balCol = null;
  let debitCol = null;
  let creditCol = null;
  let dateCol = null;
  let valueDateCol = null;
  let refNoCol = null;
  let branchCodeCol = null;

  const hRow = ws.getRow(headerRow);
  hRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const val = textValue(cell.value).toLowerCase();
    if (val.includes('value date')) valueDateCol = colNumber;
    else if (val.includes('date') || val.includes('txn date')) dateCol = colNumber;
    if (val.includes('description')) descCol = colNumber;
    if (val.includes('ref no') || val.includes('cheque')) refNoCol = colNumber;
    if (val.includes('branch code') || val.includes('branch co')) branchCodeCol = colNumber;
    if (val.includes('balance')) balCol = colNumber;
    if (val.includes('debit')) debitCol = colNumber;
    if (val.includes('credit')) creditCol = colNumber;
  });

  if (!descCol || !balCol) {
    throw new Error('Description or Balance column not found in Bank Statement.');
  }

  // Prepare Output Columns next to Balance
  const OUTPUT_HEADERS = ['Reg. No.', 'Recpt. No.', 'Amount', 'Class', 'Student Name', 'Check'];
  const OUTPUT_WIDTHS = [12, 14, 14, 16, 26, 12];
  const outputCol = balCol + 1;

  // Set Header row styles for output columns
  const balCell = ws.getCell(headerRow, balCol);
  for (let offset = 0; offset < OUTPUT_HEADERS.length; offset++) {
    const cell = ws.getCell(headerRow, outputCol + offset);
    cell.value = OUTPUT_HEADERS[offset];
    if (balCell.font) cell.font = Object.assign({}, balCell.font);
    if (balCell.fill) cell.fill = Object.assign({}, balCell.fill);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getColumn(outputCol + offset).width = OUTPUT_WIDTHS[offset];
  }

  // Index Bills by key
  const byKey = new Map();
  bills.forEach((record, idx) => {
    if (!byKey.has(record.key)) byKey.set(record.key, []);
    byKey.get(record.key).push(idx);
  });

  // Extract Bank Statement rows
  const bankRows = [];
  const bankByKey = new Map();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const desc = textValue(row.getCell(descCol).value);
    const debit = money(row.getCell(debitCol || 0).value);
    const credit = money(row.getCell(creditCol || 0).value);
    const dateRaw = row.getCell(dateCol || 1).value;
    const valueDateRaw = valueDateCol ? row.getCell(valueDateCol).value : null;
    const refNo = refNoCol ? textValue(row.getCell(refNoCol).value) : '';
    const branchCode = branchCodeCol ? textValue(row.getCell(branchCodeCol).value) : '';
    const balance = balCol ? money(row.getCell(balCol).value) : null;

    if (!desc || (debit === null && credit === null)) continue;

    const keys = statementKeys(desc);
    const entry = {
      row: r,
      description: desc,
      keys,
      debit,
      credit,
      date: textValue(dateRaw),
      value_date: textValue(valueDateRaw),
      ref_no: refNo,
      branch_code: branchCode,
      balance,
    };
    bankRows.push(entry);

    for (const key of keys) {
      if (!bankByKey.has(key)) bankByKey.set(key, []);
      bankByKey.get(key).push(r);
    }
  }

  // Matching Loop
  const issues = [];
  const billStatus = new Map();
  const reportedBills = new Set();
  const allStatementRowsForPreview = [];
  const matchedRowsForPreview = [];
  const mismatchRowsForPreview = [];

  let matchedCount = 0;
  let matchedAmountTotal = 0;
  let bankUnmatchedCount = 0;

  function addDetail(source, reason, entry = null, billIndex = null) {
    const b = billIndex !== null ? bills[billIndex] : {};
    const e = entry || {};
    const student = master.get(norm(b.reg)) || {};

    const issueRow = [
      source,
      e.row || '',
      b.source_row || '',
      e.date || '',
      e.description || '',
      (e.keys || []).join(', '),
      e.debit !== null && e.debit !== undefined ? e.debit : '',
      e.credit !== null && e.credit !== undefined ? e.credit : '',
      b.raw_reference || b.key || '',
      b.reg || '',
      b.receipt || '',
      b.amount !== undefined && b.amount !== null ? b.amount : '',
      student.class || '',
      student.name || '',
      reason,
      b.particulars || '',
    ];

    issues.push(issueRow);
    mismatchRowsForPreview.push({
      source,
      statement_row: e.row || '',
      bill_row: b.source_row || '',
      date: e.date || '',
      description: e.description || '',
      statement_ref: (e.keys || []).join(', '),
      debit: e.debit || 0,
      credit: e.credit || 0,
      inst_no: b.raw_reference || b.key || '',
      reg_no: b.reg || '',
      receipt_no: b.receipt || '',
      bill_amount: b.amount || 0,
      class_name: student.class || '',
      student_name: student.name || '',
      reason,
      particulars: b.particulars || '',
    });
  }

  for (const entry of bankRows) {
    const candidateIndices = [];
    for (const key of entry.keys) {
      const idxs = byKey.get(key) || [];
      candidateIndices.push(...idxs);
    }
    const uniqueCandidates = [...new Set(candidateIndices)];

    let status = '';
    let billIdx = null;

    if (uniqueCandidates.length === 0) {
      status = 'BILL NOT FOUND';
    } else if (uniqueCandidates.length !== 1) {
      status = 'DUPLICATE / AMBIGUOUS BILL REF';
    } else {
      billIdx = uniqueCandidates[0];
      const record = bills[billIdx];

      const bankKeyOccurrences = bankByKey.get(record.key) || [];
      if (bankKeyOccurrences.length !== 1) {
        status = 'DUPLICATE STATEMENT REF';
        billIdx = null;
      } else {
        const bankAmounts = [entry.debit, entry.credit].filter(v => v !== null && v !== 0);
        const billAmt = record.amount;

        if (billAmt === null || billAmt === undefined || bankAmounts.length === 0) {
          status = 'AMOUNT MISSING';
        } else if (!bankAmounts.some(v => Math.abs(v - billAmt) <= 0.01)) {
          status = 'AMOUNT MISMATCH';
        } else {
          status = 'OK';
          matchedCount++;
          matchedAmountTotal += billAmt;

          const student = master.get(norm(record.reg)) || {};
          const studentName = student.name || '';
          const studentClass = student.class || '';

          // 1. Highlight Description cell in Yellow in the Excel sheet
          ws.getCell(entry.row, descCol).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' }
          };

          // 2. Populate the 6 columns in original statement worksheet
          ws.getCell(entry.row, outputCol + 0).value = record.reg || '';
          ws.getCell(entry.row, outputCol + 1).value = record.receipt || '';
          ws.getCell(entry.row, outputCol + 2).value = billAmt;
          ws.getCell(entry.row, outputCol + 3).value = studentClass;
          ws.getCell(entry.row, outputCol + 4).value = studentName;
          ws.getCell(entry.row, outputCol + 5).value = 'OK';

          matchedRowsForPreview.push({
            statement_row: entry.row,
            date: entry.date,
            description: entry.description,
            credit: entry.credit,
            debit: entry.debit,
            reg_no: record.reg,
            receipt_no: record.receipt,
            amount: billAmt,
            class_name: studentClass,
            student_name: studentName,
            check: 'OK',
            reference: record.key,
          });
        }
        billStatus.set(billIdx, status);
      }
    }

    const isMatched = status === 'OK';
    const rec = isMatched && billIdx !== null ? bills[billIdx] : null;
    const std = rec ? (master.get(norm(rec.reg)) || {}) : {};

    if (!isMatched) {
      bankUnmatchedCount++;
      addDetail(billIdx !== null ? 'BANK + BILL' : 'BANK', status, entry, billIdx);
      if (billIdx !== null) reportedBills.add(billIdx);

      // Unmatched rows stay completely blank on the Statement's right side
      for (let offset = 0; offset < OUTPUT_HEADERS.length; offset++) {
        ws.getCell(entry.row, outputCol + offset).value = null;
      }
    }

    allStatementRowsForPreview.push({
      statement_row: entry.row,
      date: entry.date,
      value_date: entry.value_date,
      description: entry.description,
      ref_no: entry.ref_no,
      branch_code: entry.branch_code,
      debit: entry.debit,
      credit: entry.credit,
      balance: entry.balance,
      is_matched: isMatched,
      reg_no: isMatched && rec ? rec.reg : '',
      receipt_no: isMatched && rec ? rec.receipt : '',
      amount: isMatched && rec ? rec.amount : null,
      class_name: isMatched ? (std.class || '') : '',
      student_name: isMatched ? (std.name || '') : '',
      check: isMatched ? 'OK' : '',
      status: status,
    });
  }

  // Report Unmatched Bills
  bills.forEach((record, idx) => {
    if (billStatus.get(idx) === 'OK' || reportedBills.has(idx)) return;

    let reason = 'NOT IN STATEMENT';
    if (record.key.startsWith('INVALID:')) {
      reason = 'INVALID / UNRECOGNIZED BILL REF';
    } else if ((byKey.get(record.key) || []).length > 1) {
      reason = 'DUPLICATE BILL REF';
    } else if ((bankByKey.get(record.key) || []).length > 1) {
      reason = 'DUPLICATE STATEMENT REF';
    }

    addDetail('BILL', reason, null, idx);
  });

  const unmatchedBillsCount = bills.filter((_, idx) => billStatus.get(idx) !== 'OK').length;

  // 4. Create Sheet 2: MISMATCH DETAILS
  // Remove existing mismatch sheet if present
  const existingMismatchSheet = workbook.getWorksheet('MISMATCH DETAILS');
  if (existingMismatchSheet) {
    workbook.removeWorksheet(existingMismatchSheet.id);
  }

  const uw = workbook.addWorksheet('MISMATCH DETAILS');
  const mismatchHeaders = [
    'Source', 'Statement Row', 'Bill Row', 'Txn Date', 'Description',
    'Statement Ref', 'Debit', 'Credit', 'Inst. No.', 'Reg. No.',
    'Recpt. No.', 'Bill Amount', 'Class', 'Student Name', 'Reason', 'Particulars'
  ];
  uw.addRow(mismatchHeaders);

  // Style Header Row
  const mHeadRow = uw.getRow(1);
  mHeadRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  mHeadRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245B78' } };
  mHeadRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Set Column Widths
  const colWidths = [12, 14, 12, 14, 50, 20, 14, 14, 20, 12, 12, 14, 16, 26, 32, 50];
  colWidths.forEach((w, i) => {
    uw.getColumn(i + 1).width = w;
  });

  // Add Mismatch Rows
  issues.forEach((r) => {
    uw.addRow(r);
  });

  // Summary box on columns R and S (18 and 19)
  const summaryBox = [
    ['SUMMARY', ''],
    ['Statement transactions', bankRows.length],
    ['Bill Report entries', bills.length],
    ['Matched (ref + amount)', matchedCount],
    ['Statement not fully matched', bankUnmatchedCount],
    ['Bills not fully matched', unmatchedBillsCount],
  ];

  summaryBox.forEach((item, idx) => {
    uw.getCell(idx + 1, 18).value = item[0];
    uw.getCell(idx + 1, 19).value = item[1];
    if (idx === 0) {
      uw.getCell(idx + 1, 18).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      uw.getCell(idx + 1, 18).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
    } else {
      uw.getCell(idx + 1, 18).font = { bold: true };
    }
  });

  // Auto-filter
  uw.autoFilter = `A1:P${Math.max(1, issues.length + 1)}`;
  uw.views = [{ state: 'frozen', ySplit: 1 }];

  // 5. Generate Output Buffer
  const outputBuffer = await workbook.xlsx.writeBuffer();

  return {
    success: true,
    summary: {
      statement_count: bankRows.length,
      bill_count: bills.length,
      matched_count: matchedCount,
      matched_amount: Number(matchedAmountTotal.toFixed(2)),
      statement_unmatched_count: bankUnmatchedCount,
      bill_unmatched_count: unmatchedBillsCount,
    },
    statement_rows: allStatementRowsForPreview,
    matched_rows: matchedRowsForPreview,
    mismatch_rows: mismatchRowsForPreview,
    output_buffer: outputBuffer,
  };
}

module.exports = {
  norm,
  money,
  statementKeys,
  billReference,
  extractRegAndReceipt,
  getStudentMasterMap,
  parseUploadedBillExcel,
  fetchLiveBillsFromPortal,
  reconcileStatement,
};

