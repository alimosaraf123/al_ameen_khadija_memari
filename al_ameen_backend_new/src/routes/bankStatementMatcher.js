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

// Initialize database table for master
const readyTable = pool.query(`
  CREATE TABLE IF NOT EXISTS bank_matcher_master (
    registration_no VARCHAR(50) PRIMARY KEY,
    student_name VARCHAR(150),
    class_name VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
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

    try {
      const result = await reconcileStatement({
        statementBuffer: statementFile.buffer,
        statementFilename: statementFile.originalname || '',
        billBuffer: billFile ? billFile.buffer : null,
        targetDate,
      });

      // Generate download token and cache buffer
      const token = crypto.randomBytes(16).toString('hex');
      downloadCache.set(token, {
        buffer: result.output_buffer,
        createdAt: Date.now(),
        filename: `Matched_Bank_Statement_${targetDate || 'reconciled'}.xlsx`,
      });

      res.json({
        success: true,
        summary: result.summary,
        statement_rows: result.statement_rows || [],
        matched_rows: result.matched_rows.slice(0, 200),
        mismatch_rows: result.mismatch_rows.slice(0, 500),
        download_token: token,
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
