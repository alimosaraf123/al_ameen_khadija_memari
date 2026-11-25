const express = require('express');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { uploadBuffer, deleteCloudinaryUrl, cloudinaryAsset } = require('../utils/cloudStorage');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = String(file.mimetype || '').startsWith('image/');
    cb(allowed ? null : new Error('Only image files are allowed'), allowed);
  },
});

const TARGET_LABELS = {
  photo: 'Student Photo',
  father_photo: 'Father Photo',
  mother_photo: 'Mother Photo',
  visitor1_photo: 'Visitor 1 Photo',
  visitor2_photo: 'Visitor 2 Photo',
  birth_certificate: 'Date Of Birth Certificate',
  aadhaar: 'Aadhaar Card',
  bank_passbook: 'Bank Passbook',
  obc_certificate: 'OBC Certificate',
  ph_certificate: 'PH Certificate',
  ix_registration: 'MP Registration',
  mp_admit: 'MP Admit',
  mp_marksheet: 'MP Marksheet',
  transfer_certificate: 'T.C.',
  admission_slip: 'Admission Slip',
  xi_registration: 'HS Registration',
  hs_admit_3rd: '3rd Semester Admit',
  hs_admit_4th: '4th Semester Admit',
  hs_marksheet: 'HS Marksheet',
  hs_certificate: 'HS Certificate',
  signature: 'Signature',
};

const schemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS mobile_capture_sessions (
    id BIGSERIAL PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    target VARCHAR(64) NOT NULL,
    target_label VARCHAR(120) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    uploaded_url TEXT,
    created_by BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_mobile_capture_token ON mobile_capture_sessions(token);
`);

async function removeOldCloudFile(fileUrl) {
  if (!fileUrl || !cloudinaryAsset(fileUrl)) return;
  await deleteCloudinaryUrl(fileUrl).catch((err) =>
    console.warn('[MobileCapture] Old Cloudinary delete notice:', err.message)
  );
}

/**
 * Create a 15-minute mobile photo capture session (PC side)
 * POST /api/mobile-capture/session
 */
router.post(
  '/session',
  auth,
  allow('super_admin', 'admin', 'office'),
  asyncHandler(async (req, res) => {
    await schemaReady;
    const studentId = Number(req.body?.student_id);
    const target = String(req.body?.target || '').trim();
    if (!studentId || !target || !/^[a-z0-9_]+$/i.test(target)) {
      return res.status(400).json({ success: false, message: 'Valid student_id and target are required' });
    }

    const stuRes = await pool.query(
      `SELECT id, registration_no, student_name, class_name FROM students WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    if (!stuRes.rowCount) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const student = stuRes.rows[0];
    const targetLabel = String(req.body?.target_label || TARGET_LABELS[target] || target).trim();
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `INSERT INTO mobile_capture_sessions (token, student_id, target, target_label, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [token, student.id, target, targetLabel, req.user?.userId || null, expiresAt]
    );

    res.status(201).json({
      success: true,
      token,
      expires_at: expiresAt.toISOString(),
      target,
      target_label: targetLabel,
      lan_ip: Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address || null,
      student,
    });
  })
);

/**
 * Poll capture status from PC modal
 * GET /api/mobile-capture/session/:token/status
 */
router.get(
  '/session/:token/status',
  auth,
  allow('super_admin', 'admin', 'office'),
  asyncHandler(async (req, res) => {
    await schemaReady;
    const token = String(req.params.token || '').trim();
    const q = await pool.query(
      `SELECT status, uploaded_url, expires_at, completed_at
       FROM mobile_capture_sessions
       WHERE token = $1 LIMIT 1`,
      [token]
    );
    if (!q.rowCount) {
      return res.status(404).json({ success: false, message: 'Capture session not found' });
    }
    const row = q.rows[0];
    const expired = row.status === 'pending' && new Date(row.expires_at) < new Date();
    res.json({
      success: true,
      status: expired ? 'expired' : row.status,
      uploaded_url: row.uploaded_url || null,
      completed_at: row.completed_at || null,
    });
  })
);

/**
 * Public mobile page info (no login required, token-secured)
 * GET /api/mobile-capture/public/:token
 */
router.get(
  '/public/:token',
  asyncHandler(async (req, res) => {
    await schemaReady;
    const token = String(req.params.token || '').trim();
    const q = await pool.query(
      `SELECT m.token, m.student_id, m.target, m.target_label, m.status, m.uploaded_url, m.expires_at,
              s.registration_no, s.student_name, s.class_name
       FROM mobile_capture_sessions m
       JOIN students s ON s.id = m.student_id
       WHERE m.token = $1 LIMIT 1`,
      [token]
    );
    if (!q.rowCount) {
      return res.status(404).json({ success: false, message: 'Invalid or expired capture link.' });
    }
    const row = q.rows[0];
    const expired = row.status === 'pending' && new Date(row.expires_at) < new Date();
    res.json({
      success: true,
      status: expired ? 'expired' : row.status,
      target: row.target,
      target_label: row.target_label,
      student_name: row.student_name,
      registration_no: row.registration_no,
      class_name: row.class_name,
      uploaded_url: row.uploaded_url || null,
      expires_at: row.expires_at,
    });
  })
);

/**
 * Public mobile photo upload (after 1-click confirmation on mobile)
 * POST /api/mobile-capture/public/:token/upload
 */
router.post(
  '/public/:token/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    await schemaReady;
    const token = String(req.params.token || '').trim();
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please capture or select a photo first.' });
    }

    const q = await pool.query(
      `SELECT m.*, s.registration_no, s.photo_url AS current_student_photo
       FROM mobile_capture_sessions m
       JOIN students s ON s.id = m.student_id
       WHERE m.token = $1 LIMIT 1`,
      [token]
    );
    if (!q.rowCount) {
      return res.status(404).json({ success: false, message: 'Invalid capture link.' });
    }
    const session = q.rows[0];
    if (session.status === 'completed') {
      return res.status(409).json({ success: false, message: 'Photo has already been uploaded for this link.' });
    }
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ success: false, message: 'This capture link has expired. Please generate a new QR code.' });
    }

    const isStudentPhoto = session.target === 'photo';
    const compressed = await sharp(req.file.buffer, { failOn: 'error' })
      .rotate()
      .resize({
        width: isStudentPhoto ? 900 : 1800,
        height: isStudentPhoto ? 1100 : 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4 })
      .toBuffer();

    const uploaded = await uploadBuffer(compressed, {
      folder: isStudentPhoto ? 'al-ameen/student-photos' : 'al-ameen/student-documents',
      resourceType: 'image',
      format: 'webp',
    });

    try {
      if (isStudentPhoto) {
        await pool.query(
          `UPDATE students SET photo_url = $1, updated_at = NOW() WHERE id = $2`,
          [uploaded.url, session.student_id]
        );
        if (session.current_student_photo) {
          await removeOldCloudFile(session.current_student_photo);
        }
      } else {
        const existing = await pool.query(
          `SELECT id, file_url FROM student_documents WHERE student_id = $1 AND document_type = $2 ORDER BY uploaded_at DESC LIMIT 1`,
          [session.student_id, session.target]
        );
        if (existing.rowCount) {
          const oldUrl = existing.rows[0].file_url;
          await pool.query(
            `UPDATE student_documents
             SET file_url = $1, document_title = $2, uploaded_by = $3, uploaded_at = NOW()
             WHERE id = $4`,
            [uploaded.url, session.target_label, session.created_by, existing.rows[0].id]
          );
          if (oldUrl) await removeOldCloudFile(oldUrl);
        } else {
          await pool.query(
            `INSERT INTO student_documents
               (student_id, document_type, document_title, file_url, guardian_visible, guardian_download_allowed, uploaded_by)
             VALUES ($1, $2, $3, $4, TRUE, TRUE, $5)`,
            [session.student_id, session.target, session.target_label, uploaded.url, session.created_by]
          );
        }
      }

      await pool.query(
        `UPDATE mobile_capture_sessions
         SET status = 'completed', uploaded_url = $1, completed_at = NOW()
         WHERE id = $2`,
        [uploaded.url, session.id]
      );

      res.json({
        success: true,
        message: 'Photo uploaded successfully!',
        uploaded_url: uploaded.url,
      });
    } catch (err) {
      await removeOldCloudFile(uploaded.url);
      throw err;
    }
  })
);

module.exports = router;
