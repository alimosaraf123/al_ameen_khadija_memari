const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { uploadBuffer, deleteCloudinaryUrl } = require('../utils/cloudStorage');
const { enrichOmrResults, matchResultStudent, rosterForExam, identifyResult } = require('../utils/omrIdentity');
const { auth, allow } = require('../middleware/auth');

const router = express.Router();

// Keep the scan directory configurable so the same code works on Windows,
// Render/Linux, and other deployment environments. Render's filesystem is
// ephemeral, but it is sufficient for the upload -> evaluate workflow; the
// archived results are stored in PostgreSQL below.
const defaultScansDir = process.platform === 'win32'
  ? path.resolve(process.cwd(), '..', 'omr_scans')
  : path.join(process.cwd(), 'omr_scans');
const SCANS_DIR = process.env.OMR_SCANS_DIR || defaultScansDir;
if (!fs.existsSync(SCANS_DIR)) {
  fs.mkdirSync(SCANS_DIR, { recursive: true });
}

// Ensure omr_evaluation_records table exists for archiving past evaluations
pool.query(`
  CREATE TABLE IF NOT EXISTS omr_evaluation_records (
    id SERIAL PRIMARY KEY,
    exam_name VARCHAR(255) NOT NULL,
    total_questions INT DEFAULT 35,
    marks_per_correct NUMERIC(8,2) DEFAULT 1.0,
    negative_mark NUMERIC(8,2) DEFAULT 0.0,
    full_marks NUMERIC(8,2) DEFAULT 35.0,
    total_candidates INT DEFAULT 0,
    answer_key JSONB NOT NULL,
    results JSONB NOT NULL,
    scanned_files JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
`).catch(e => console.log('omr_evaluation_records table notice:', e.message));

const omrAssetsSchemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS omr_scan_assets (
    id SERIAL PRIMARY KEY,
    original_filename VARCHAR(255) NOT NULL,
    cloudinary_url TEXT NOT NULL,
    cloudinary_public_id TEXT,
    resource_type VARCHAR(30) DEFAULT 'image',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '15 days')
  );
  ALTER TABLE omr_scan_assets ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  CREATE INDEX IF NOT EXISTS idx_omr_scan_assets_expires_at ON omr_scan_assets(expires_at);
`).catch(e => console.log('omr_scan_assets table notice:', e.message));

// Older local databases may not yet have the optional school/council
// registration columns. Without them, one missing column makes the whole
// student-master query fail and the OMR engine falls back to Candidate #... .
const omrStudentSchemaReady = pool.query(`
  ALTER TABLE students ADD COLUMN IF NOT EXISTS admitted_school_name VARCHAR(200);
  ALTER TABLE students ADD COLUMN IF NOT EXISTS school_reg_no VARCHAR(100);
  ALTER TABLE students ADD COLUMN IF NOT EXISTS council_reg_no VARCHAR(100);
`).catch(e => console.log('omr student columns notice:', e.message));

const RETENTION_DAYS = Math.max(1, Number(process.env.OMR_SCAN_RETENTION_DAYS || 15));

async function cleanupExpiredOmrAssets() {
  await omrAssetsSchemaReady;
  const expired = await pool.query(`
    SELECT id, cloudinary_url
    FROM omr_scan_assets
    WHERE expires_at <= NOW()
    ORDER BY expires_at ASC
    LIMIT 100
  `);
  for (const asset of expired.rows) {
    try {
      await deleteCloudinaryUrl(asset.cloudinary_url);
      await pool.query('DELETE FROM omr_scan_assets WHERE id = $1', [asset.id]);
    } catch (err) {
      console.error('OMR Cloudinary cleanup failed:', asset.id, err.message);
    }
  }
}

// Also runs when the service receives traffic after sleeping on Render.
setTimeout(() => cleanupExpiredOmrAssets().catch(err => console.error('OMR cleanup notice:', err.message)), 5000).unref();
setInterval(() => cleanupExpiredOmrAssets().catch(err => console.error('OMR cleanup notice:', err.message)), 6 * 60 * 60 * 1000).unref();

// Multer storage for scanning uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SCANS_DIR);
  },
  filename: (req, file, cb) => {
    const cleanOrig = (file.originalname || 'sheet.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(cleanOrig) || '.jpg';
    const base = path.basename(cleanOrig, ext) || 'sheet';
    // If it's a generic camera snap or scanner output, append timestamp to prevent overwrites
    const isGeneric = /^(image|capture|photo|camera|blob|upload|scan|sheet)/i.test(base);
    const finalName = isGeneric 
      ? `${base}_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}` 
      : cleanOrig;
    cb(null, finalName);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per sheet
});

// Helper to run python omr_engine.py
function runOmrEngine(config, imagePaths) {
  return new Promise((resolve, reject) => {
    const tmpDir = path.join(__dirname, '../../tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const configPath = path.join(tmpDir, `omr_cfg_${Date.now()}.json`);
    const imagesPath = path.join(tmpDir, `omr_imgs_${Date.now()}.json`);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    fs.writeFileSync(imagesPath, JSON.stringify(imagePaths, null, 2), 'utf-8');

    const scriptPath = path.join(__dirname, '../../scripts/omr_engine.py');
    const pythonCommand = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    const py = spawn(pythonCommand, [scriptPath, configPath, imagesPath], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });

    // Without an error handler, a missing Python executable leaves the
    // request hanging forever on Render instead of returning a useful 500.
    py.on('error', (err) => {
      try { fs.unlinkSync(configPath); } catch (_) {}
      try { fs.unlinkSync(imagesPath); } catch (_) {}
      reject(new Error(`Unable to start OMR engine (${pythonCommand}): ${err.message}`));
    });

    py.on('close', (code) => {
      try { fs.unlinkSync(configPath); } catch (_) {}
      try { fs.unlinkSync(imagesPath); } catch (_) {}

      if (code !== 0) {
        return reject(new Error(`OMR Engine failed with code ${code}: ${stderr}`));
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse OMR output: ${err.message}. Output was: ${stdout}`));
      }
    });
  });
}

// 1. Get Student Master Data from Database
router.get('/students-master', async (req, res) => {
  try {
    await omrStudentSchemaReady;
    const q = await pool.query(`
      SELECT id, registration_no, student_name, admission_no, roll_no, class_name,
             admitted_school_name, school_reg_no, council_reg_no
      FROM students
      WHERE is_active = TRUE
      ORDER BY student_name
    `);
    res.json({ success: true, students: q.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Could not load OMR student records: ' + e.message });
  }
});

// 2. Info about the OMR Scans Folder
router.get('/folder-info', async (req, res) => {
  try {
    await omrAssetsSchemaReady;
    if (!fs.existsSync(SCANS_DIR)) {
      fs.mkdirSync(SCANS_DIR, { recursive: true });
    }
    const files = fs.readdirSync(SCANS_DIR).filter(f => /\.(jpe?g|png)$/i.test(f));
    const cloudCount = await pool.query('SELECT COUNT(*)::int AS count FROM omr_scan_assets WHERE is_active=TRUE AND expires_at > NOW()');
    res.json({
      success: true,
      folder_path: SCANS_DIR,
      total_files: Math.max(files.length, cloudCount.rows[0].count),
      files: files
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Upload new OMR sheets from browser
router.post('/upload', (req, res) => {
  upload.array('sheets', 500)(req, res, async (err) => {
    if (err) {
      console.error('Multer Upload Error:', err);
      return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
    }
    const uploadedAssets = [];
    try {
      await omrAssetsSchemaReady;
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No OMR sheets were uploaded.' });
      }

      for (const file of req.files) {
        const stored = await uploadBuffer(fs.readFileSync(file.path), {
          folder: 'al-ameen/omr-scans',
          format: 'original'
        });
        await pool.query(`
          INSERT INTO omr_scan_assets (original_filename, cloudinary_url, cloudinary_public_id, resource_type, expires_at)
          VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval)
        `, [file.originalname || file.filename, stored.url, stored.publicId, stored.resourceType, RETENTION_DAYS]);
        uploadedAssets.push(stored.url);
        try { fs.unlinkSync(file.path); } catch (_) {}
      }

      const uploadedCount = req.files ? req.files.length : 0;
      const allFiles = fs.readdirSync(SCANS_DIR).filter(f => /\.(jpe?g|png)$/i.test(f));
      const cloudFiles = await pool.query('SELECT COUNT(*)::int AS count FROM omr_scan_assets WHERE is_active=TRUE AND expires_at > NOW()');
      res.json({
        success: true,
        message: `${uploadedCount} sheets uploaded successfully`,
        folder_path: SCANS_DIR,
        uploaded_count: uploadedCount,
        total_files: Math.max(allFiles.length, cloudFiles.rows[0].count),
        storage: 'cloudinary',
        retention_days: RETENTION_DAYS
      });
    } catch (e) {
      for (const url of uploadedAssets) {
        await deleteCloudinaryUrl(url).catch(() => {});
      }
      for (const file of req.files || []) {
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

// 4. Clear folder
router.post('/clear-folder', async (req, res) => {
  try {
    await omrAssetsSchemaReady;
    const files = fs.readdirSync(SCANS_DIR);
    for (const file of files) {
      if (/\.(jpe?g|png)$/i.test(file)) {
        try { fs.unlinkSync(path.join(SCANS_DIR, file)); } catch (_) {}
      }
    }
    // Keep earlier uploads for 15 days when starting another school/exam.
    await pool.query('UPDATE omr_scan_assets SET is_active=FALSE WHERE is_active=TRUE');
    res.json({ success: true, message: 'Workspace cleared; Cloudinary scans remain until expiry' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Evaluate OMR Sheets (Runs Python Engine)
router.post('/evaluate', async (req, res) => {
  const temporaryCloudFiles = [];
  const originalNames = new Map();
  const scanAssetIds = new Map();
  let temporaryCloudDir;
  try {
    const {
      exam_name = 'Class X Biology Annual Test',
      total_questions = 35,
      marks_per_correct = 1.0,
      negative_mark = 0.25,
      full_marks = 35.0,
      answer_key = {},
      custom_students = {},
      uploaded_images = [],
      use_demo_samples = false
    } = req.body || {};

    await omrAssetsSchemaReady;
    await omrStudentSchemaReady;
    let imagePaths = uploaded_images;

    // Check SCANS_DIR first
    if (!imagePaths || imagePaths.length === 0) {
      if (fs.existsSync(SCANS_DIR)) {
        const found = fs.readdirSync(SCANS_DIR)
          .filter(f => /\.(jpe?g|png)$/i.test(f))
          .map(f => path.join(SCANS_DIR, f));
        if (found.length > 0) {
          imagePaths = found;
        }
      }
    }

    // Uploaded scans are stored in Cloudinary, so materialize them only for
    // the Python evaluation process and remove these temporary files after it
    // finishes. This keeps Render disk usage low.
    if (!imagePaths || imagePaths.length === 0) {
      const assets = await pool.query(`
        SELECT id, original_filename, cloudinary_url
        FROM omr_scan_assets
        WHERE is_active=TRUE AND expires_at > NOW()
        ORDER BY uploaded_at ASC
      `);
      const tempRoot = path.join(__dirname, '../../tmp');
      fs.mkdirSync(tempRoot, { recursive: true });
      temporaryCloudDir = fs.mkdtempSync(path.join(tempRoot, 'omr-eval-'));
      for (const asset of assets.rows) {
        const response = await fetch(asset.cloudinary_url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`Could not download OMR scan from Cloudinary (${response.status})`);
        const filename = path.basename(asset.original_filename || 'sheet.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
        const target = path.join(temporaryCloudDir, `${asset.id}_${filename}`);
        originalNames.set(path.basename(target), asset.original_filename || filename);
        scanAssetIds.set(path.basename(target), asset.id);
        temporaryCloudFiles.push(target);
        fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
        imagePaths = [...(imagePaths || []), target];
      }
    }

    // Only fallback to sample images if explicitly requested for demo
    if (!imagePaths || imagePaths.length === 0) {
      if (use_demo_samples) {
        const samplesDir = path.join(__dirname, '../../uploads/omr_samples');
        imagePaths = [
          path.join(samplesDir, 'sample_1_49787.jpg'),
          path.join(samplesDir, 'sample_2_2262117692.jpg'),
          path.join(samplesDir, 'sample_3_2262118804.jpg')
        ];
      } else {
        return res.status(400).json({
          success: false,
          message: 'No scanned OMR sheets found in folder to evaluate. Please click "Upload Files" to upload your sheets first.'
        });
      }
    }

    // Default sample answer key if empty
    let finalKey = answer_key;
    if (!finalKey || Object.keys(finalKey).length === 0) {
      finalKey = {
        "1": "C", "2": "D", "3": "B", "4": "C", "5": "B",
        "6": "B", "7": "C", "8": "B", "9": "C", "10": "B",
        "11": "B", "12": "C", "13": "B", "14": "C", "15": "D",
        "16": "A", "17": "D", "18": "A", "19": "D", "20": "B",
        "21": "B", "22": "C", "23": "D", "24": "A", "25": "B",
        "26": "C", "27": "D", "28": "C", "29": "C", "30": "B",
        "31": "D", "32": "D", "33": "C", "34": "C", "35": "C"
      };
    }

    let studentsMaster = {
      ...(custom_students || {})
    };
    let studentRows = [];

    try {
      const dbStudents = await pool.query(`
        SELECT id, registration_no, admission_no, roll_no, student_name, class_name, admitted_school_name, school_reg_no, council_reg_no
        FROM students
        WHERE is_active = TRUE
      `);
      studentRows = dbStudents.rows;
      for (const row of dbStudents.rows) {
        const rawSchool = (row.admitted_school_name || '').trim();
        const cleanSchool = rawSchool.toUpperCase().includes('MEMARI') ? '' : rawSchool;
        const info = {
          name: row.student_name,
          class: row.class_name || 'XI-Sc.',
          school: cleanSchool,
          mission_reg: row.registration_no,
          student_id: row.id
        };
        if (row.registration_no) studentsMaster[String(row.registration_no).trim()] = info;
        if (row.school_reg_no) studentsMaster[String(row.school_reg_no).trim()] = info;
        if (row.council_reg_no) studentsMaster[String(row.council_reg_no).trim()] = info;
        if (row.admission_no) studentsMaster[String(row.admission_no).trim()] = info;
        if (row.roll_no) studentsMaster[String(row.roll_no).trim()] = info;
      }
    } catch (dbErr) {
      throw new Error('Could not load student records for OMR matching: ' + dbErr.message);
    }

    const effectiveNegativeMark = req.body.negative_mark !== undefined && req.body.negative_mark !== null && req.body.negative_mark !== ''
      ? Math.max(0, Number(req.body.negative_mark))
      : 0.0;

    const config = {
      exam_name,
      total_questions: Number(total_questions),
      marks_per_correct: Number(marks_per_correct),
      negative_mark: effectiveNegativeMark,
      full_marks: Number(full_marks),
      answer_key: finalKey,
      students_master: studentsMaster
    };

    const result = await runOmrEngine(config, imagePaths);
    if (result?.success && Array.isArray(result.results)) {
      result.results = await enrichOmrResults(result.results, imagePaths, studentRows, {
        examName: exam_name, className: req.body.class_name || '',
      });
      result.results = result.results.map(row => ({ ...row,
        scan_asset_id: scanAssetIds.get(row.file) || null,
        file: originalNames.get(row.file) || row.file }));
    }
    if (result && result.success && Array.isArray(result.results) && result.results.length > 0) {
      try {
        const saved = await pool.query(`
          INSERT INTO omr_evaluation_records (
            exam_name, total_questions, marks_per_correct, negative_mark, full_marks, total_candidates, answer_key, results, scanned_files
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
        `, [
          exam_name || 'OMR Exam',
          Number(total_questions),
          Number(marks_per_correct),
          effectiveNegativeMark,
          Number(full_marks),
          result.results.length,
          JSON.stringify(finalKey),
          JSON.stringify(result.results),
          JSON.stringify(imagePaths.map(p => originalNames.get(path.basename(p)) || path.basename(p)))
        ]);
        result.record_id = saved.rows[0].id;
      } catch (saveErr) {
        console.log('Notice: Could not archive evaluation record:', saveErr.message);
      }
    }
    res.json(result);
  } catch (err) {
    console.error('OMR Evaluation Error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    for (const tempFile of temporaryCloudFiles) {
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
    if (temporaryCloudDir) {
      try { fs.rmdirSync(temporaryCloudDir); } catch (_) {}
    }
  }
});

// 6. Get Available Terminal Exams and Subjects for Syncing
router.get('/terminal-targets', async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT te.id AS terminal_exam_id, te.exam_name, te.class_name, te.session_name, te.status AS exam_status,
             tes.id AS exam_subject_id, s.subject_name, tes.full_marks, tes.theory_marks, tes.mcq_marks, tes.oral_marks, tes.status AS subject_status,
             t.name AS teacher_name
      FROM terminal_exams te
      JOIN terminal_exam_subjects tes ON tes.terminal_exam_id = te.id
      JOIN subjects s ON s.id = tes.subject_id
      LEFT JOIN teachers t ON t.id = tes.teacher_id
      WHERE te.status NOT IN ('published', 'ready', 'completed')
        AND tes.status NOT IN ('submitted', 'approved', 'published')
        -- Existing draft marks are protected by insert-only sync below;
        -- keep the subject available to import the remaining candidates.
      ORDER BY te.id DESC, s.subject_name ASC
    `);
    res.json({ success: true, targets: q.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Push OMR Marks into Terminal Exam (Saved as Draft)
router.post('/sync-terminal', async (req, res) => {
  const client = await pool.connect();
  try {
    await omrStudentSchemaReady;
    const {
      exam_subject_id,
      results = [], // Array of { registration_no, student_name, final_score, school_name }
      default_entered_by = 1
    } = req.body || {};

    if (!exam_subject_id) {
      return res.status(400).json({ success: false, message: 'exam_subject_id is required' });
    }

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, message: 'No student results to sync' });
    }

    await client.query('BEGIN');

    // 1. Get Subject Assignment info
    const subRes = await client.query(`
      SELECT tes.*, te.class_name, te.exam_name, te.status AS exam_status, s.subject_name
      FROM terminal_exam_subjects tes
      JOIN terminal_exams te ON te.id = tes.terminal_exam_id
      JOIN subjects s ON s.id = tes.subject_id
      WHERE tes.id = $1
      FOR UPDATE OF tes
    `, [exam_subject_id]);

    const assignment = subRes.rows[0];
    if (!assignment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Target Terminal Exam Subject not found' });
    }
    if (['published', 'ready', 'completed'].includes(assignment.exam_status) ||
        ['submitted', 'approved', 'published'].includes(assignment.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This terminal subject is locked. Reopen it as a draft before importing OMR marks.' });
    }

    // 2. Fetch all active students in this class (or all classes for cross-registration)
    const stRes = await client.query(`
      SELECT id, registration_no, admission_no, roll_no, student_name, class_name, admitted_school_name, school_reg_no, council_reg_no
      FROM students
      WHERE is_active = TRUE
    `);
    const allStudents = stRes.rows;

    let syncedCount = 0;
    let existingCount = 0;
    const syncedList = [];
    const unmappedList = [];

    for (const item of results) {
      const reg = String(item.registration_no || '').trim();
      const score = Math.max(0, Number(item.final_score) || 0);
      const name = String(item.student_name || '').trim();
      const school = String(item.school_name || '').trim();

      // OCR-enriched results carry the actual Mission ID. Use that same
      // identity for syncing, restricted to the selected terminal class.
      const matchedStudent = matchResultStudent(item, allStudents, assignment.class_name);

      if (matchedStudent) {
        // Add new candidates only. Never overwrite an existing grade when
        // more sheets for the same subject arrive in a subsequent batch.
        const inserted = await client.query(`
          INSERT INTO terminal_marks(exam_subject_id, student_id, obtained_marks, mcq_obtained, entered_by)
          VALUES($1, $2, $3, $3, $4)
          ON CONFLICT(exam_subject_id, student_id) DO NOTHING
          RETURNING student_id
        `, [assignment.id, matchedStudent.id, score, default_entered_by]);
        if (!inserted.rowCount) {
          existingCount++;
          continue;
        }

        // Auto-save school_reg_no / admitted_school_name if not saved yet
        if (reg && reg.length >= 6 && (!matchedStudent.school_reg_no || !matchedStudent.admitted_school_name)) {
          await client.query(`
            UPDATE students
            SET school_reg_no = COALESCE(NULLIF(school_reg_no, ''), $1),
                admitted_school_name = COALESCE(NULLIF(admitted_school_name, ''), $2)
            WHERE id = $3
          `, [reg, school || null, matchedStudent.id]);
        }

        syncedCount++;
        syncedList.push({
          student_id: matchedStudent.id,
          student_name: matchedStudent.student_name,
          mission_reg_no: matchedStudent.registration_no,
          omr_reg_no: reg,
          score: score
        });
      } else {
        unmappedList.push({
          omr_reg_no: reg,
          student_name: name,
          school_name: school,
          score: score
        });
      }
    }

    if (syncedCount === 0) {
      await client.query('ROLLBACK');
      return res.status(existingCount ? 409 : 422).json({ success: false,
        message: existingCount ? `${existingCount} candidates already have marks. Review existing marks in Terminal Exams.` :
          'No candidates matched the selected terminal class. Check the Mission IDs and target class.',
        synced_count: 0, existing_count: existingCount, unmapped_count: unmappedList.length, unmapped: unmappedList });
    }

    // Keep subject status as 'assigned' (meaning DRAFT!)
    await client.query(`
      UPDATE terminal_exam_subjects
      SET status = 'assigned', submitted_at = NULL
      WHERE id = $1
    `, [assignment.id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `${syncedCount} student marks pushed to ${assignment.exam_name} (${assignment.class_name} - ${assignment.subject_name}) as Draft!${existingCount ? ` ${existingCount} existing marks were skipped.` : ''}`,
      synced_count: syncedCount,
      existing_count: existingCount,
      unmapped_count: unmappedList.length,
      synced: syncedList,
      unmapped: unmappedList,
      target_exam: {
        exam_id: assignment.terminal_exam_id,
        exam_name: assignment.exam_name,
        class_name: assignment.class_name,
        subject_name: assignment.subject_name,
        exam_subject_id: assignment.id,
        status: 'assigned (Draft)'
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sync Terminal Error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// 8. Get All Saved Answer Keys
router.get('/answer-keys', async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT id, name, exam_name, total_questions, marks_per_correct, negative_mark, full_marks, answer_key, updated_at
      FROM omr_answer_keys
      ORDER BY updated_at DESC
    `);
    res.json({ success: true, keys: q.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Save or Update Answer Key Preset
router.post('/answer-keys', async (req, res) => {
  try {
    const {
      id,
      name,
      exam_name,
      total_questions = 35,
      marks_per_correct = 1.0,
      negative_mark = 0.0,
      full_marks = 35.0,
      answer_key = {}
    } = req.body || {};

    const rawName = name || exam_name || 'Active Exam Key';
    const trimmedName = rawName.trim();

    let row;
    if (id) {
      const q = await pool.query(`
        UPDATE omr_answer_keys
        SET name = COALESCE(NULLIF($1, ''), name),
            exam_name = COALESCE(NULLIF($2, ''), exam_name),
            total_questions = $3,
            marks_per_correct = $4,
            negative_mark = $5,
            full_marks = $6,
            answer_key = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `, [trimmedName, exam_name || trimmedName, total_questions, marks_per_correct, negative_mark, full_marks, JSON.stringify(answer_key), id]);
      if (q.rows.length > 0) {
        row = q.rows[0];
      }
    }

    if (!row) {
      const existing = await pool.query('SELECT id FROM omr_answer_keys WHERE name = $1', [trimmedName]);
      if (existing.rows.length > 0) {
        const q = await pool.query(`
          UPDATE omr_answer_keys
          SET exam_name = $1, total_questions = $2, marks_per_correct = $3, negative_mark = $4, full_marks = $5, answer_key = $6, updated_at = NOW()
          WHERE name = $7
          RETURNING *
        `, [exam_name || trimmedName, total_questions, marks_per_correct, negative_mark, full_marks, JSON.stringify(answer_key), trimmedName]);
        row = q.rows[0];
      } else {
        const q = await pool.query(`
          INSERT INTO omr_answer_keys(name, exam_name, total_questions, marks_per_correct, negative_mark, full_marks, answer_key)
          VALUES($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [trimmedName, exam_name || trimmedName, total_questions, marks_per_correct, negative_mark, full_marks, JSON.stringify(answer_key)]);
        row = q.rows[0];
      }
    }

    res.json({ success: true, message: `Answer key "${row.name}" saved successfully`, key: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 10. Delete Answer Key Preset
router.delete('/answer-keys/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM omr_answer_keys WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Answer key preset deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 11. Get List of Past Evaluated Exam Records
router.get('/records', async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT id, exam_name, total_questions, marks_per_correct, negative_mark, full_marks, total_candidates, created_at,
             jsonb_array_length(COALESCE(scanned_files, '[]'::jsonb)) AS file_count
      FROM omr_evaluation_records
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, records: q.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 12. Get Specific Past Evaluation Record (Full results & answer key)
router.get('/records/:id', async (req, res) => {
  try {
    const q = await pool.query('SELECT * FROM omr_evaluation_records WHERE id = $1', [req.params.id]);
    if (q.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    const record = q.rows[0];
    if (Array.isArray(record.results) && record.results.some(row => row.scanned_name)) {
      await omrStudentSchemaReady;
      const students = await pool.query(`SELECT id, registration_no, student_name, class_name,
        admission_no, admitted_school_name, school_reg_no, council_reg_no FROM students WHERE is_active=TRUE`);
      record.results = await enrichOmrResults(record.results, [], students.rows, { examName: record.exam_name });
    }
    res.json({ success: true, record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Resolve through the archived candidate, never a client-supplied filename or URL.
router.get('/records/:id/scan', auth, allow('super_admin', 'admin', 'teacher'), async (req, res) => {
  try {
    await omrAssetsSchemaReady;
    const record = (await pool.query('SELECT * FROM omr_evaluation_records WHERE id=$1', [req.params.id])).rows[0];
    const candidate = record?.results?.find(row => String(row.registration_no) === String(req.query.registration_no));
    if (!candidate) return res.status(404).json({ success: false, message: 'OMR candidate not found.' });
    // Older archives predate asset IDs. Only consider scans uploaded before that evaluation.
    const assets = candidate.scan_asset_id
      ? await pool.query('SELECT cloudinary_url, expires_at FROM omr_scan_assets WHERE id=$1 AND expires_at>NOW()', [candidate.scan_asset_id])
      : await pool.query(`SELECT cloudinary_url, expires_at FROM omr_scan_assets
          WHERE original_filename=$1 AND uploaded_at <= $2 AND expires_at>NOW()
          ORDER BY uploaded_at DESC LIMIT 1`, [candidate.file, record.created_at]);
    if (!assets.rows.length) return res.status(410).json({ success: false,
      message: 'This OMR scan is unavailable or its 15-day retention has expired. The result is still saved.' });
    res.json({ success: true, url: assets.rows[0].cloudinary_url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Explicit identity confirmation for handwriting the automatic readers cannot
// resolve. Copy identity from the real roster; preserve every score/answer.
router.patch('/records/:id/identity', auth, allow('super_admin', 'admin', 'teacher'), async (req, res) => {
  const client = await pool.connect();
  try {
    await omrStudentSchemaReady;
    const reg = String(req.body?.registration_no || '').trim();
    const studentId = String(req.body?.student_id || '');
    if (!reg || !/^\d+$/.test(studentId) || !/^\d+$/.test(String(req.params.id))) {
      return res.status(400).json({ success: false, message: 'Choose a Mission student for this OMR candidate.' });
    }
    await client.query('BEGIN');
    const record = (await client.query('SELECT * FROM omr_evaluation_records WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!record) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Evaluation record not found. Run Evaluation again.' });
    }
    const index = record.results.findIndex(result => String(result.registration_no).trim() === reg);
    const students = await client.query(`SELECT id,registration_no,student_name,class_name,admitted_school_name
      FROM students WHERE is_active=TRUE AND id=$1`, [studentId]);
    const student = rosterForExam(students.rows, { examName: record.exam_name })[0];
    if (index < 0 || !student) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Choose an active student from the exam class.' });
    }
    record.results[index] = identifyResult(record.results[index], student, 'manual');
    record.results[index].identity_verified_by = req.user.userId;
    await client.query('UPDATE omr_evaluation_records SET results=$1::jsonb WHERE id=$2', [JSON.stringify(record.results), record.id]);
    await client.query('COMMIT');
    res.json({ success: true, result: record.results[index] });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: error.message });
  } finally { client.release(); }
});

// 13. Delete a Past Evaluation Record
router.delete('/records/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM omr_evaluation_records WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 14. Get list of currently uploaded scans in folder
router.get('/scans-list', async (req, res) => {
  try {
    await omrAssetsSchemaReady;
    if (!fs.existsSync(SCANS_DIR)) {
      return res.json({ success: true, files: [] });
    }
    const files = fs.readdirSync(SCANS_DIR)
      .filter(f => /\.(jpe?g|png)$/i.test(f))
      .map(f => {
        try {
          const stats = fs.statSync(path.join(SCANS_DIR, f));
          return {
            name: f,
            size: stats.size,
            modified: stats.mtime
          };
        } catch (_) {
          return { name: f, size: 0, modified: null };
        }
      });
    const cloud = await pool.query(`
      SELECT id, original_filename AS name, NULL::bigint AS size, uploaded_at AS modified
      FROM omr_scan_assets
      WHERE expires_at > NOW()
      ORDER BY uploaded_at DESC
    `);
    res.json({ success: true, files: cloud.rows.length ? cloud.rows : files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
