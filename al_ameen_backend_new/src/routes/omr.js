const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');

const router = express.Router();

const SCANS_DIR = path.resolve('d:/memari_soft/omr_scans');
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
    const py = spawn('python', [scriptPath, configPath, imagesPath]);

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });

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
    const q = await pool.query(`
      SELECT id, admission_no, roll_no, name, class_name, section, full_address
      FROM students
      WHERE is_active = TRUE
      LIMIT 500
    `);
    res.json({ success: true, students: q.rows });
  } catch (e) {
    res.json({ success: true, students: [] });
  }
});

// 2. Info about the OMR Scans Folder
router.get('/folder-info', (req, res) => {
  try {
    if (!fs.existsSync(SCANS_DIR)) {
      fs.mkdirSync(SCANS_DIR, { recursive: true });
    }
    const files = fs.readdirSync(SCANS_DIR).filter(f => /\.(jpe?g|png)$/i.test(f));
    res.json({
      success: true,
      folder_path: SCANS_DIR,
      total_files: files.length,
      files: files
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Upload new OMR sheets from browser
router.post('/upload', (req, res) => {
  upload.array('sheets', 500)(req, res, (err) => {
    if (err) {
      console.error('Multer Upload Error:', err);
      return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
    }
    try {
      const uploadedCount = req.files ? req.files.length : 0;
      const allFiles = fs.readdirSync(SCANS_DIR).filter(f => /\.(jpe?g|png)$/i.test(f));
      res.json({
        success: true,
        message: `${uploadedCount} sheets uploaded successfully`,
        folder_path: SCANS_DIR,
        uploaded_count: uploadedCount,
        total_files: allFiles.length
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

// 4. Clear folder
router.post('/clear-folder', (req, res) => {
  try {
    const files = fs.readdirSync(SCANS_DIR);
    for (const file of files) {
      if (/\.(jpe?g|png)$/i.test(file)) {
        try { fs.unlinkSync(path.join(SCANS_DIR, file)); } catch (_) {}
      }
    }
    res.json({ success: true, message: 'Scan folder cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Evaluate OMR Sheets (Runs Python Engine)
router.post('/evaluate', async (req, res) => {
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

    try {
      const dbStudents = await pool.query(`
        SELECT id, registration_no, admission_no, roll_no, student_name, class_name, admitted_school_name, school_reg_no, council_reg_no
        FROM students
        WHERE is_active = TRUE
      `);
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
      console.log('Student DB fetch notice:', dbErr.message);
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
    if (result && result.success && Array.isArray(result.results) && result.results.length > 0) {
      try {
        await pool.query(`
          INSERT INTO omr_evaluation_records (
            exam_name, total_questions, marks_per_correct, negative_mark, full_marks, total_candidates, answer_key, results, scanned_files
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          exam_name || 'OMR Exam',
          Number(total_questions),
          Number(marks_per_correct),
          effectiveNegativeMark,
          Number(full_marks),
          result.results.length,
          JSON.stringify(finalKey),
          JSON.stringify(result.results),
          JSON.stringify(imagePaths.map(p => path.basename(p)))
        ]);
      } catch (saveErr) {
        console.log('Notice: Could not archive evaluation record:', saveErr.message);
      }
    }
    res.json(result);
  } catch (err) {
    console.error('OMR Evaluation Error:', err);
    res.status(500).json({ success: false, message: err.message });
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
        AND NOT EXISTS (
          SELECT 1 FROM terminal_marks tm 
          WHERE tm.exam_subject_id = tes.id 
            AND (tm.obtained_marks IS NOT NULL OR tm.written_marks IS NOT NULL OR tm.mcq_obtained IS NOT NULL)
        )
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
      SELECT tes.*, te.class_name, te.exam_name, s.subject_name
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

    // 2. Fetch all active students in this class (or all classes for cross-registration)
    const stRes = await client.query(`
      SELECT id, registration_no, admission_no, roll_no, student_name, class_name, admitted_school_name, school_reg_no, council_reg_no
      FROM students
      WHERE is_active = TRUE
    `);
    const allStudents = stRes.rows;

    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Build index maps
    const byMissionReg = new Map();
    const bySchoolReg = new Map();
    const byCouncilReg = new Map();
    const byName = new Map();

    for (const st of allStudents) {
      if (st.registration_no) byMissionReg.set(String(st.registration_no).trim(), st);
      if (st.school_reg_no) bySchoolReg.set(String(st.school_reg_no).trim(), st);
      if (st.council_reg_no) byCouncilReg.set(String(st.council_reg_no).trim(), st);
      if (st.admission_no) byMissionReg.set(String(st.admission_no).trim(), st);
      if (st.roll_no) byMissionReg.set(String(st.roll_no).trim(), st);
      
      const n = norm(st.student_name);
      if (n) {
        const isTargetClass = norm(st.class_name) === norm(assignment.class_name);
        if (!byName.has(n) || isTargetClass) {
          byName.set(n, st);
        }
      }
    }

    let syncedCount = 0;
    const syncedList = [];
    const unmappedList = [];

    for (const item of results) {
      const reg = String(item.registration_no || '').trim();
      const score = Math.max(0, Number(item.final_score) || 0);
      const name = String(item.student_name || '').trim();
      const school = String(item.school_name || '').trim();

      // Find matching student
      let matchedStudent = null;
      if (reg && byMissionReg.has(reg)) {
        matchedStudent = byMissionReg.get(reg);
      } else if (reg && bySchoolReg.has(reg)) {
        matchedStudent = bySchoolReg.get(reg);
      } else if (reg && byCouncilReg.has(reg)) {
        matchedStudent = byCouncilReg.get(reg);
      } else if (name && byName.has(norm(name))) {
        matchedStudent = byName.get(norm(name));
      }

      if (matchedStudent) {
        // Auto-save school_reg_no / admitted_school_name if not saved yet
        if (reg && reg.length >= 6 && (!matchedStudent.school_reg_no || !matchedStudent.admitted_school_name)) {
          await client.query(`
            UPDATE students
            SET school_reg_no = COALESCE(school_reg_no, $1),
                admitted_school_name = COALESCE(admitted_school_name, $2)
            WHERE id = $3
          `, [reg, school || null, matchedStudent.id]);
        }

        // Upsert into terminal_marks
        await client.query(`
          INSERT INTO terminal_marks(exam_subject_id, student_id, obtained_marks, mcq_obtained, entered_by)
          VALUES($1, $2, $3, $3, $4)
          ON CONFLICT(exam_subject_id, student_id)
          DO UPDATE SET
            mcq_obtained = EXCLUDED.mcq_obtained,
            obtained_marks = COALESCE(terminal_marks.written_marks, 0) + EXCLUDED.mcq_obtained + COALESCE(terminal_marks.oral_obtained, 0),
            remarks = CASE WHEN terminal_marks.remarks = 'Absent' THEN NULL ELSE terminal_marks.remarks END,
            entered_by = EXCLUDED.entered_by
        `, [assignment.id, matchedStudent.id, score, default_entered_by]);

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

    // Keep subject status as 'assigned' (meaning DRAFT!)
    await client.query(`
      UPDATE terminal_exam_subjects
      SET status = 'assigned', submitted_at = NULL
      WHERE id = $1
    `, [assignment.id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `${syncedCount} student marks pushed to ${assignment.exam_name} (${assignment.class_name} - ${assignment.subject_name}) as Draft!`,
      synced_count: syncedCount,
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
    res.json({ success: true, record: q.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
router.get('/scans-list', (req, res) => {
  try {
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
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
