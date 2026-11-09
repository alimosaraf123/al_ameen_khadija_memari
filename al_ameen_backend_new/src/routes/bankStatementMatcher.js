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
      message: "Registration Master-e 'reg.' বা 'registration' কলাম পাওয়া যায়নি।",
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
    message: `সফলভাবে ${values.length} জন ছাত্রীর মাস্টার ডাটা সেভ করা হয়েছে।`,
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

      // Automatically save to database for Date-wise history records
      let savedRecordId = null;
      try {
        const username = req.user?.username || req.user?.name || req.user?.user_id || 'Staff';
        const title = `Reconciliation: ${fromDate || 'N/A'}${toDate && toDate !== fromDate ? ' to ' + toDate : ''} (${result.summary?.matched_count || 0} Matched)`;
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
    // Update existing record
    await pool.query(
      `UPDATE bank_reconciliation_records 
       SET summary = $1, statement_rows = $2, matched_rows = $3, mismatch_rows = $4, notes_map = $5,
           excel_buffer = COALESCE($6, excel_buffer), updated_at = NOW()
       WHERE id = $7`,
      [
        summary ? JSON.stringify(summary) : null,
        JSON.stringify(statement_rows || []),
        JSON.stringify(matched_rows || []),
        JSON.stringify(mismatch_rows || []),
        JSON.stringify(notes_map || {}),
        excelBuffer,
        id,
      ]
    );
    return res.json({ success: true, message: 'Record and notes updated successfully.', id });
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
      JSON.stringify(statement_rows || []),
      JSON.stringify(matched_rows || []),
      JSON.stringify(mismatch_rows || []),
      JSON.stringify(notes_map || {}),
      excelBuffer,
      username,
    ]
  );

  res.json({ success: true, message: 'Record and notes saved successfully.', id: insertRes.rows[0].id });
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

module.exports = router;
