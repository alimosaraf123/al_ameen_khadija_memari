const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const {
  norm,
  reconcileStatement,
  getStudentMasterMap,
} = require('../utils/statementMatcher');

const router = express.Router();

// Memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
});

// In-memory cache for generated Excel files (TTL 1 hour)
const downloadCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [token, item] of downloadCache.entries()) {
    if (now - item.createdAt > 60 * 60 * 1000) {
      downloadCache.delete(token);
    }
  }
}, 10 * 60 * 1000);

// Initialize database tables
const readyTable = pool.query(`
  CREATE TABLE IF NOT EXISTS bank_matcher_master (
    registration_no VARCHAR(50) PRIMARY KEY,
    student_name VARCHAR(150),
    class_name VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS bank_reconciliation_records (
    id SERIAL PRIMARY KEY,
    batch_title VARCHAR(255),
    statement_filename VARCHAR(255),
    from_date VARCHAR(20),
    to_date VARCHAR(20),
    summary JSONB,
    statement_rows JSONB,
    matched_rows JSONB,
    mismatch_rows JSONB,
    notes_map JSONB,
    excel_buffer BYTEA,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100)
  );
`);

// GET /api/bank-matcher/master - Check current master status
router.get('/master', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  const customRes = await pool.query(`SELECT COUNT(*) FROM bank_matcher_master`);
  const dbStudentsRes = await pool.query(`SELECT COUNT(*) FROM students WHERE is_active = true`);

  const sampleRes = await pool.query(`
    SELECT registration_no, student_name, class_name, updated_at 
    FROM bank_matcher_master 
    ORDER BY updated_at DESC LIMIT 10
  `);

  res.json({
    success: true,
    custom_master_count: Number(customRes.rows[0].count),
    db_students_count: Number(dbStudentsRes.rows[0].count),
    sample_students: sampleRes.rows,
  });
}));

// POST /api/bank-matcher/master - Upload & Save Student Master Excel
router.post('/master', auth, allow('super_admin', 'admin', 'office'), upload.single('master_file'), asyncHandler(async (req, res) => {
  await readyTable;
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, message: 'Please upload an Excel file.' });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const ws = workbook.worksheets[0];

  // Find header row with reg, name, class
  let headerRow = null;
  let regCol = null;
  let nameCol = null;
  let classCol = null;

  for (let r = 1; r <= Math.min(ws.rowCount || 30, 30); r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const v = String(cell.value || '').trim().toLowerCase();
      if (v === 'reg.' || v === 'reg' || v.includes('registration')) regCol = colNumber;
      if (v === 'name' || v.includes('student name')) nameCol = colNumber;
      if (v === 'class' || v.includes('class name')) classCol = colNumber;
    });
    if (regCol) {
      headerRow = r;
      break;
    }
  }

  if (!regCol) {
    return res.status(400).json({
      success: false,
      message: "Registration Master: 'reg.' or 'registration' column not found.",
    });
  }

  const studentMap = new Map();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawReg = row.getCell(regCol).value;
    const cleanReg = norm(rawReg);
    if (!cleanReg) continue;

    const sName = nameCol ? String(row.getCell(nameCol).value || '').trim() : '';
    const sClass = classCol ? String(row.getCell(classCol).value || '').trim() : '';
    studentMap.set(cleanReg, { reg: cleanReg, name: sName, cls: sClass });
  }

  const values = [];
  const params = [];
  let pIdx = 1;

  for (const { reg, name, cls } of studentMap.values()) {
    params.push(reg, name, cls);
    values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`);
  }

  if (values.length > 0) {
    await pool.query(
      `INSERT INTO bank_matcher_master (registration_no, student_name, class_name, updated_at)
       VALUES ${values.join(',')}
       ON CONFLICT (registration_no) DO UPDATE 
       SET student_name = EXCLUDED.student_name, class_name = EXCLUDED.class_name, updated_at = NOW()`,
      params
    );
  }

  res.json({
    success: true,
    message: `Successfully saved ${values.length} students into Registration Master.`,
    count: values.length,
  });
}));

// POST /api/bank-matcher/reconcile - Process Statement Matching
router.post(
  '/reconcile',
  auth,
  allow('super_admin', 'admin', 'office'),
  upload.fields([
    { name: 'statement_file', maxCount: 1 },
    { name: 'bill_file', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    await readyTable;

    const statementFile = req.files && req.files.statement_file ? req.files.statement_file[0] : null;
    const billFile = req.files && req.files.bill_file ? req.files.bill_file[0] : null;

    if (!statementFile) {
      return res.status(400).json({
        success: false,
        message: 'Please select an SBI Bank Statement file (.xlsx, .xls, or .pdf).',
      });
    }

    const targetDate = String(req.body.target_date || '').trim();
    const fromDate = String(req.body.from_date || req.body.target_date || '').trim();
    const toDate = String(req.body.to_date || req.body.from_date || req.body.target_date || '').trim();

    try {
      const result = await reconcileStatement({
        statementBuffer: statementFile.buffer,
        statementFilename: statementFile.originalname || '',
        billBuffer: billFile ? billFile.buffer : null,
        targetDate: fromDate,
        fromDate,
        toDate,
      });

      // Generate download token and cache buffer
      const token = crypto.randomBytes(16).toString('hex');
      const dateLabel = fromDate && toDate && fromDate !== toDate ? `${fromDate}_to_${toDate}` : (fromDate || 'reconciled');
      downloadCache.set(token, {
        buffer: result.output_buffer,
        createdAt: Date.now(),
        filename: `Matched_Bank_Statement_${dateLabel}.xlsx`,
      });

      // Automatically save or update database for this date in the Master Daily Register
      let savedRecordId = null;
      try {
        const username = req.user?.username || req.user?.name || req.user?.user_id || 'Staff';
        const title = `Reconciliation: ${fromDate || 'N/A'}${toDate && toDate !== fromDate ? ' to ' + toDate : ''} (${result.summary?.matched_count || 0} Matched)`;
        
        // Check if a record already exists for this date range so we don't create duplicate cards
        const existingRes = await pool.query(
          `SELECT id, notes_map FROM bank_reconciliation_records WHERE from_date = $1 AND to_date = $2 ORDER BY id DESC LIMIT 1`,
          [fromDate || '', toDate || '']
        );

        if (existingRes.rows.length > 0) {
          savedRecordId = existingRes.rows[0].id;
          const mergedNotes = Object.assign({}, existingRes.rows[0].notes_map || {});
          
          // Attach previously saved notes so existing user notes are never lost!
          const rowsWithPreservedNotes = (result.statement_rows || []).map((r, i) => {
            const k = r.statement_row ? String(r.statement_row) : (r.ref_no ? String(r.ref_no) : String(i));
            return {
              ...r,
              note: mergedNotes[k] ?? mergedNotes[String(r.statement_row)] ?? r.note ?? '',
            };
          });

          await pool.query(
            `UPDATE bank_reconciliation_records
             SET batch_title = $1, statement_filename = $2, summary = $3, statement_rows = $4,
                 matched_rows = $5, mismatch_rows = $6, notes_map = $7, excel_buffer = $8,
                 updated_at = NOW()
             WHERE id = $9`,
            [
              title,
              statementFile.originalname || 'SBI_Statement.xlsx',
              JSON.stringify(result.summary || {}),
              JSON.stringify(rowsWithPreservedNotes),
              JSON.stringify(result.matched_rows || []),
              JSON.stringify(result.mismatch_rows || []),
              JSON.stringify(mergedNotes),
              result.output_buffer,
              savedRecordId,
            ]
          );
        } else {
          const insertRes = await pool.query(
            `INSERT INTO bank_reconciliation_records 
             (batch_title, statement_filename, from_date, to_date, summary, statement_rows, matched_rows, mismatch_rows, notes_map, excel_buffer, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
              title,
              statementFile.originalname || 'SBI_Statement.xlsx',
              fromDate || '',
              toDate || '',
              JSON.stringify(result.summary || {}),
              JSON.stringify(result.statement_rows || []),
              JSON.stringify(result.matched_rows || []),
              JSON.stringify(result.mismatch_rows || []),
              JSON.stringify({}),
              result.output_buffer,
              username,
            ]
          );
          savedRecordId = insertRes.rows[0]?.id || null;
        }
      } catch (saveErr) {
        console.error('Auto-save to history failed (non-fatal):', saveErr);
      }

      res.json({
        success: true,
        summary: result.summary,
        statement_rows: result.statement_rows || [],
        matched_rows: result.matched_rows.slice(0, 200),
        mismatch_rows: result.mismatch_rows.slice(0, 500),
        download_token: token,
        saved_record_id: savedRecordId,
        auto_saved: !!savedRecordId,
      });
    } catch (err) {
      console.error('Reconciliation error:', err);
      res.status(400).json({
        success: false,
        message: err.message || 'Error occurred during bank statement reconciliation.',
      });
    }
  })
);

// POST /api/bank-matcher/save-session - Save or update reconciled session with notes
router.post('/save-session', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  const {
    id,
    statement_filename,
    from_date,
    to_date,
    summary,
    statement_rows,
    matched_rows,
    mismatch_rows,
    notes_map,
    download_token,
  } = req.body;

  const username = req.user?.username || req.user?.name || req.user?.user_id || 'Staff';
  const title = `Reconciliation: ${from_date || 'N/A'}${to_date && to_date !== from_date ? ' to ' + to_date : ''} (${summary?.matched_count || 0} Matched)`;

  let excelBuffer = null;
  if (download_token && downloadCache.has(download_token)) {
    excelBuffer = downloadCache.get(download_token)?.buffer || null;
  }

  if (id) {
    let rowsToSave = statement_rows || [];
    if (Array.isArray(rowsToSave) && notes_map) {
      rowsToSave = rowsToSave.map((r, i) => {
        const k = r.statement_row ? String(r.statement_row) : (r.ref_no ? String(r.ref_no) : String(i));
        return {
          ...r,
          note: notes_map[k] ?? notes_map[String(r.statement_row)] ?? r.note ?? '',
        };
      });
    }

    // Update existing record
    await pool.query(
      `UPDATE bank_reconciliation_records 
       SET summary = $1, statement_rows = $2, matched_rows = $3, mismatch_rows = $4, notes_map = $5,
           excel_buffer = COALESCE($6, excel_buffer), updated_at = NOW()
       WHERE id = $7`,
      [
        summary ? JSON.stringify(summary) : null,
        JSON.stringify(rowsToSave),
        JSON.stringify(matched_rows || []),
        JSON.stringify(mismatch_rows || []),
        JSON.stringify(notes_map || {}),
        excelBuffer,
        id,
      ]
    );
    return res.json({ success: true, message: 'Record and notes updated successfully.', id });
  }

  let initialRows = statement_rows || [];
  if (Array.isArray(initialRows) && notes_map) {
    initialRows = initialRows.map((r, i) => {
      const k = r.statement_row ? String(r.statement_row) : (r.ref_no ? String(r.ref_no) : String(i));
      return {
        ...r,
        note: notes_map[k] ?? notes_map[String(r.statement_row)] ?? r.note ?? '',
      };
    });
  }

  // Check if existing record exists by statement filename OR exact dates to prevent duplicate records
  const checkExisting = await pool.query(
    `SELECT id, notes_map FROM bank_reconciliation_records 
     WHERE (statement_filename = $1 AND statement_filename != '') 
        OR (from_date = $2 AND to_date = $3) 
     ORDER BY id DESC LIMIT 1`,
    [statement_filename || '', from_date || '', to_date || '']
  );

  if (checkExisting.rows.length > 0) {
    const existingId = checkExisting.rows[0].id;
    const mergedNotes = Object.assign({}, checkExisting.rows[0].notes_map || {}, notes_map || {});

    await pool.query(
      `UPDATE bank_reconciliation_records
       SET batch_title = $1, statement_filename = $2, from_date = $3, to_date = $4, summary = $5, statement_rows = $6,
           matched_rows = $7, mismatch_rows = $8, notes_map = $9,
           excel_buffer = COALESCE($10, excel_buffer), updated_at = NOW()
       WHERE id = $11`,
      [
        title,
        statement_filename || '',
        from_date || '',
        to_date || '',
        summary ? JSON.stringify(summary) : null,
        JSON.stringify(initialRows),
        JSON.stringify(matched_rows || []),
        JSON.stringify(mismatch_rows || []),
        JSON.stringify(mergedNotes),
        excelBuffer,
        existingId,
      ]
    );
    return res.json({ success: true, message: 'Existing date record updated successfully.', id: existingId });
  }

  const insertRes = await pool.query(
    `INSERT INTO bank_reconciliation_records 
     (batch_title, statement_filename, from_date, to_date, summary, statement_rows, matched_rows, mismatch_rows, notes_map, excel_buffer, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      title,
      statement_filename || '',
      from_date || '',
      to_date || '',
      summary ? JSON.stringify(summary) : null,
      JSON.stringify(initialRows),
      JSON.stringify(matched_rows || []),
      JSON.stringify(mismatch_rows || []),
      JSON.stringify(notes_map || {}),
      excelBuffer,
      username,
    ]
  );

  res.json({ success: true, message: 'Record and notes saved successfully.', id: insertRes.rows[0].id });
}));

// POST /api/bank-matcher/save-note - Fast real-time save for individual transaction note
router.post('/save-note', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  const { id, row_key, note } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, message: 'Record ID is required to save note.' });
  }
  if (!row_key && row_key !== 0) {
    return res.status(400).json({ success: false, message: 'Row key is required.' });
  }

  const keyStr = String(row_key);
  const noteStr = String(note || '');

  const result = await pool.query(
    `UPDATE bank_reconciliation_records
     SET notes_map = COALESCE(notes_map, '{}'::jsonb) || jsonb_build_object($1::text, $2::text),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, notes_map`,
    [keyStr, noteStr, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Saved reconciliation record not found.' });
  }

  res.json({
    success: true,
    message: 'Note saved successfully.',
    row_key: keyStr,
    note: noteStr,
    notes_map: result.rows[0].notes_map,
  });
}));

// GET /api/bank-matcher/register - Get all date-wise statements & transactions for the unified Master Daily Register
router.get('/register', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  const { date, from_date, to_date, q } = req.query;
  let query = `
    SELECT id, batch_title, statement_filename, from_date, to_date, summary, statement_rows, mismatch_rows, notes_map, excel_buffer, created_at, updated_at, created_by
    FROM bank_reconciliation_records
  `;
  const params = [];
  if (date) {
    params.push(date);
    query += ` WHERE from_date = $1 OR to_date = $1 `;
  } else if (from_date && to_date) {
    params.push(from_date, to_date);
    query += ` WHERE from_date >= $1 AND to_date <= $2 `;
  } else if (q) {
    params.push(`%${q}%`);
    query += ` WHERE from_date ILIKE $1 OR to_date ILIKE $1 OR batch_title ILIKE $1 `;
  }
  query += ` ORDER BY from_date DESC, id DESC LIMIT 500`;

  const dbRes = await pool.query(query, params);

  const dates = dbRes.rows.map(record => {
    let token = null;
    if (record.excel_buffer) {
      token = crypto.randomBytes(16).toString('hex');
      const dateLabel = record.from_date && record.to_date && record.from_date !== record.to_date
        ? `${record.from_date}_to_${record.to_date}`
        : (record.from_date || 'reconciled');
      downloadCache.set(token, {
        buffer: record.excel_buffer,
        createdAt: Date.now(),
        filename: `Matched_Bank_Statement_${dateLabel}.xlsx`,
      });
    }

    const nMap = record.notes_map || {};
    const rows = Array.isArray(record.statement_rows) ? record.statement_rows.map((r, i) => {
      const k = r.statement_row ? String(r.statement_row) : (r.ref_no ? String(r.ref_no) : String(i));
      return {
        ...r,
        note: nMap[k] ?? nMap[String(r.statement_row)] ?? r.note ?? '',
      };
    }) : [];

    return {
      id: record.id,
      from_date: record.from_date,
      to_date: record.to_date,
      batch_title: record.batch_title,
      statement_filename: record.statement_filename,
      summary: record.summary,
      notes_map: nMap,
      statement_rows: rows,
      mismatch_rows: Array.isArray(record.mismatch_rows) ? record.mismatch_rows : [],
      created_at: record.created_at,
      updated_at: record.updated_at,
      created_by: record.created_by,
      download_token: token,
    };
  });

  res.json({ success: true, dates });
}));

// GET /api/bank-matcher/history - List saved reconciliation records
router.get('/history', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  const { date, q } = req.query;
  let query = `
    SELECT id, batch_title, statement_filename, from_date, to_date, summary, created_at, updated_at, created_by
    FROM bank_reconciliation_records
  `;
  const params = [];
  if (date) {
    params.push(date);
    query += ` WHERE from_date = $1 OR to_date = $1 OR batch_title ILIKE '%' || $1 || '%' `;
  } else if (q) {
    params.push(`%${q}%`);
    query += ` WHERE batch_title ILIKE $1 OR statement_filename ILIKE $1 OR from_date ILIKE $1 OR to_date ILIKE $1 `;
  }
  query += ` ORDER BY created_at DESC LIMIT 60`;

  const historyRes = await pool.query(query, params);
  res.json({ success: true, history: historyRes.rows });
}));

// GET /api/bank-matcher/history/:id - Load full saved record with notes & re-enable download
router.get('/history/:id', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  const itemRes = await pool.query(
    `SELECT * FROM bank_reconciliation_records WHERE id = $1`,
    [req.params.id]
  );
  if (itemRes.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Saved record not found.' });
  }

  const record = itemRes.rows[0];
  let token = null;
  if (record.excel_buffer) {
    token = crypto.randomBytes(16).toString('hex');
    const dateLabel = record.from_date && record.to_date && record.from_date !== record.to_date
      ? `${record.from_date}_to_${record.to_date}`
      : (record.from_date || 'reconciled');
    downloadCache.set(token, {
      buffer: record.excel_buffer,
      createdAt: Date.now(),
      filename: `Matched_Bank_Statement_${dateLabel}.xlsx`,
    });
  }

  // Ensure each row in statement_rows has its note property attached
  record.notes_map = record.notes_map || {};
  if (Array.isArray(record.statement_rows)) {
    const nMap = record.notes_map;
    record.statement_rows = record.statement_rows.map((r, i) => {
      const k = r.statement_row ? String(r.statement_row) : (r.ref_no ? String(r.ref_no) : String(i));
      return {
        ...r,
        note: nMap[k] ?? nMap[String(r.statement_row)] ?? r.note ?? '',
      };
    });
  }

  // Remove raw buffer from JSON payload
  delete record.excel_buffer;
  record.download_token = token;

  res.json({ success: true, record });
}));

// DELETE /api/bank-matcher/history/:id - Delete saved record
router.delete('/history/:id', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  await pool.query(`DELETE FROM bank_reconciliation_records WHERE id = $1`, [req.params.id]);
  res.json({ success: true, message: 'Record deleted successfully.' });
}));

// GET /api/bank-matcher/download/:token - Download Matched Excel
router.get('/download/:token', asyncHandler(async (req, res) => {
  const token = req.params.token;
  const item = downloadCache.get(token);
  if (!item || !item.buffer) {
    return res.status(404).send('Download link expired or not found. Please run reconcile again.');
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${item.filename}"`);
  res.send(item.buffer);
}));

// GET /api/bank-matcher/export-consolidated - Export consolidated multi-date / monthly Excel
router.get('/export-consolidated', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await readyTable;
  const { from_date, to_date } = req.query;

  let query = `SELECT * FROM bank_reconciliation_records`;
  const params = [];
  if (from_date && to_date) {
    query += ` WHERE (from_date >= $1 AND to_date <= $2) OR (from_date BETWEEN $1 AND $2)`;
    params.push(from_date, to_date);
  }
  query += ` ORDER BY from_date ASC, id ASC`;

  const recordsRes = await pool.query(query, params);
  const records = recordsRes.rows;

  if (records.length === 0) {
    return res.status(404).json({ success: false, message: 'No saved records found for the selected period.' });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Al-Ameen Mission Academy Memari';
  wb.created = new Date();

  // Sheet 1: Master Register
  const ws = wb.addWorksheet('MASTER REGISTER');

  // Title Row
  ws.mergeCells('A1:P1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `AL-AMEEN MISSION ACADEMY MEMARI - CONSOLIDATED BANK STATEMENT REGISTER (${from_date || 'ALL DATES'} TO ${to_date || 'ALL DATES'})`;
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Header Row
  const headers = [
    '#', 'Txn Date', 'Value Date', 'Description', 'Ref No./Cheque No.',
    'Branch', 'Debit', 'Credit', 'Balance', 'Reg. No.', 'Student Name', 'Class', 'Recpt. No.', 'Amount', 'Bill Date', 'Note'
  ];
  ws.addRow(headers);
  const hRow = ws.getRow(2);
  hRow.height = 24;
  hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (let c = 1; c <= 16; c++) {
    const cell = hRow.getCell(c);
    if (c <= 9) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
    }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
  }

  let sl = 1;
  for (const rec of records) {
    const rows = Array.isArray(rec.statement_rows) ? rec.statement_rows : [];
    const nMap = rec.notes_map || {};

    for (const r of rows) {
      const k = r.statement_row ? String(r.statement_row) : (r.ref_no ? String(r.ref_no) : String(sl));
      const rowNote = nMap[k] ?? nMap[String(r.statement_row)] ?? r.note ?? '';

      const rowValues = [
        sl++,
        r.date || rec.from_date || '',
        r.value_date || r.date || '',
        r.description || '',
        r.ref_no || '',
        r.branch_code || '',
        r.debit ? Number(r.debit) : '',
        r.credit ? Number(r.credit) : '',
        r.balance !== null && r.balance !== undefined ? Number(r.balance) : '',
        r.is_matched ? (r.reg_no || '') : '',
        r.is_matched ? (r.student_name || '') : '',
        r.is_matched ? (r.class_name || '') : '',
        r.is_matched ? (r.receipt_no || '') : '',
        r.is_matched && r.amount ? Number(r.amount) : '',
        r.is_matched ? (r.bill_date || '') : '',
        rowNote,
      ];

      const excelRow = ws.addRow(rowValues);
      excelRow.height = 20;

      if (r.is_matched) {
        excelRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFE0' } };
      }

      for (let c = 1; c <= 16; c++) {
        excelRow.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      }
    }
  }

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 14 },
    { width: 45 },
    { width: 28 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 24 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 30 },
  ];

  // Sheet 2: Summary Breakdown by Date
  const sw = wb.addWorksheet('DATE-WISE SUMMARY');
  sw.addRow(['Date', 'Statement File', 'Total Txns', 'Matched Count', 'Matched Amount (₹)', 'Unmatched Txns', 'Unmatched Bills', 'Reconciled By']);
  const sHead = sw.getRow(1);
  sHead.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  sHead.alignment = { vertical: 'middle', horizontal: 'center' };
  sw.getRow(1).height = 24;

  let grandTxns = 0;
  let grandMatched = 0;
  let grandMatchedAmt = 0;
  let grandUnmatched = 0;

  for (const rec of records) {
    const s = rec.summary || {};
    const txnCount = (rec.statement_rows || []).length;
    const mCount = s.matched_count || 0;
    const mAmt = Number(s.matched_amount || 0);
    const uCount = s.statement_unmatched_count || 0;
    const bCount = s.bill_unmatched_count || 0;

    grandTxns += txnCount;
    grandMatched += mCount;
    grandMatchedAmt += mAmt;
    grandUnmatched += uCount;

    sw.addRow([
      rec.from_date || '-',
      rec.statement_filename || 'SBI',
      txnCount,
      mCount,
      mAmt,
      uCount,
      bCount,
      rec.created_by || 'Staff',
    ]);
  }

  const totalRow = sw.addRow(['TOTAL', `${records.length} Dates`, grandTxns, grandMatched, grandMatchedAmt, grandUnmatched, '-', '-']);
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  sw.columns = [
    { width: 16 }, { width: 28 }, { width: 12 }, { width: 14 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 18 }
  ];

  const buffer = await wb.xlsx.writeBuffer();
  const token = crypto.randomBytes(16).toString('hex');
  const fileLabel = from_date && to_date ? `${from_date}_to_${to_date}` : 'All_Dates';
  downloadCache.set(token, {
    buffer,
    createdAt: Date.now(),
    filename: `Consolidated_Bank_Register_${fileLabel}.xlsx`,
  });

  res.json({ success: true, download_token: token, filename: `Consolidated_Bank_Register_${fileLabel}.xlsx` });
}));

module.exports = router;
