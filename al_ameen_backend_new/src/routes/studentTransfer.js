
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { uploadBuffer, deleteCloudinaryUrl } = require('../utils/cloudStorage');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { studentFields } = require('../utils/studentData');
const { parseWorkbook, makeWorkbook, makeCustomWorkbook, photoRegistration, photoExtension, FIELD_LABELS } = require('../utils/studentTransfer');

const uploadDir = path.join(__dirname, '../../uploads');

const BULK_DOC_CONFIG = {
  photo: {
    key: 'photo',
    label: 'Student Photo (Profile Photo)',
    docTypes: ['photo'],
    isPhoto: true,
  },
  birth_certificate: {
    key: 'birth_certificate',
    label: 'Birth Certificate (DOB)',
    docTypes: ['birth_certificate'],
  },
  mp_admit: {
    key: 'mp_admit',
    label: 'M.P. Admit',
    docTypes: ['mp_admit'],
  },
  mp_marksheet: {
    key: 'mp_marksheet',
    label: 'M.P. Marksheet',
    docTypes: ['mp_marksheet'],
  },
  aadhaar: {
    key: 'aadhaar',
    label: 'Aadhar',
    docTypes: ['aadhaar'],
  },
  bank_passbook: {
    key: 'bank_passbook',
    label: 'Passbook',
    docTypes: ['bank_passbook'],
  },
  obc_certificate: {
    key: 'obc_certificate',
    label: 'OBC / Caste Certificate',
    docTypes: ['obc_certificate'],
  },
  ph_certificate: {
    key: 'ph_certificate',
    label: 'P.H. Certificate',
    docTypes: ['ph_certificate'],
  },
  xi_registration: {
    key: 'xi_registration',
    label: 'X.I Registration',
    docTypes: ['xi_registration'],
  },
  hs_admit: {
    key: 'hs_admit',
    label: 'H.S. Admit',
    docTypes: ['hs_admit_3rd', 'hs_admit_4th', 'hs_admit'],
  },
  hs_marksheet: {
    key: 'hs_marksheet',
    label: 'H.S. Marksheet',
    docTypes: ['hs_marksheet', 'xi_marksheet'],
  },
  hs_certificate: {
    key: 'hs_certificate',
    label: 'H.S. Certificate',
    docTypes: ['hs_certificate'],
  },
  admission_slip: {
    key: 'admission_slip',
    label: 'Admission Slip',
    docTypes: ['admission_slip', 'xi_admission_slip'],
  },
  father_photo: {
    key: 'father_photo',
    label: 'Father Photo',
    docTypes: ['father_photo'],
  },
  mother_photo: {
    key: 'mother_photo',
    label: 'Mother Photo',
    docTypes: ['mother_photo'],
  },
  visitor_photo: {
    key: 'visitor_photo',
    label: 'Visitor Photo',
    docTypes: ['visitor1_photo', 'visitor2_photo'],
  },
  transfer_certificate: {
    key: 'transfer_certificate',
    label: 'Transfer Certificate (T.C.)',
    docTypes: ['transfer_certificate'],
  },
};

async function getFilteredStudents(pool, filters = {}) {
  const { session, class_name, stream, status } = filters;
  const where = [];
  const values = [];

  if (status === 'active') {
    where.push('s.is_active = TRUE');
  } else if (status === 'dropout' || status === 'inactive') {
    where.push('s.is_active = FALSE');
  }

  if (class_name && class_name !== 'all' && class_name !== 'All') {
    values.push(class_name);
    if (class_name === 'V' || class_name === '5') {
      where.push(`(s.class_name = $${values.length} OR s.class_name = '5' OR s.class_name = 'V')`);
    } else {
      where.push(`s.class_name = $${values.length}`);
    }
  }

  if (session && session !== 'all' && session !== 'All') {
    const s = String(session).trim();
    if (s.includes('-')) {
      const [from, to] = s.split('-');
      if (from === to) {
        // E.g. "2026-2026" - user means 2026 academic batch (includes both 2026-2026 and 2026-2027)
        values.push(from);
        where.push(`(s.session_from::text = $${values.length} OR s.session_to::text = $${values.length})`);
      } else {
        values.push(from, to);
        where.push(`(s.session_from::text = $${values.length - 1} AND s.session_to::text = $${values.length})`);
      }
    } else {
      values.push(s);
      where.push(`(s.session_from::text = $${values.length} OR s.session_to::text = $${values.length})`);
    }
  }

  if (stream && stream !== 'all' && stream !== 'All') {
    values.push(`%${stream}%`);
    where.push(`(s.stream ILIKE $${values.length} OR s.class_name ILIKE $${values.length})`);
  }

  const sql = `
    SELECT 
      s.*, 
      r.room_name,
      v1.visitor_name AS visi_1_name,
      v1.relation AS visi_1_relation,
      v1.mobile_number AS visi_1_mobile,
      v1.email AS visi_1_email,
      v1.village AS visi_1_village,
      v1.police_station AS visi_1_police_station,
      v1.pin_code AS visi_1_pin_code,
      v1.post_office AS visi_1_post_office,
      v1.block AS visi_1_block,
      v1.district AS visi_1_district,
      v1.state AS visi_1_state,
      v2.visitor_name AS visi_2_name,
      v2.relation AS visi_2_relation,
      v2.mobile_number AS visi_2_mobile,
      v2.email AS visi_2_email,
      v2.village AS visi_2_village,
      v2.police_station AS visi_2_police_station,
      v2.pin_code AS visi_2_pin_code,
      v2.post_office AS visi_2_post_office,
      v2.block AS visi_2_block,
      v2.district AS visi_2_district,
      v2.state AS visi_2_state
    FROM students s 
    LEFT JOIN rooms r ON r.id = s.room_id 
    LEFT JOIN student_visitors v1 ON v1.student_id = s.id AND v1.visitor_number = 1
    LEFT JOIN student_visitors v2 ON v2.student_id = s.id AND v2.visitor_number = 2
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY 
      NULLIF(regexp_replace(s.registration_no, '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
      s.registration_no,
      s.student_name
  `;

  const result = await pool.query(sql, values);
  return result.rows;
}

function createTransferRouter(pool) {
  const router = express.Router();
  router.use(auth, allow('super_admin', 'admin'));
  const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 } }).single('file');
  const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 2 } }).array('photos', 10);
  const upload = middleware => (req, res, next) => middleware(req, res, error => error
    ? res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'File is too large (Excel: 10 MB, each photo: 5 MB).' : 'Invalid upload: ' + error.message })
    : next());

  router.get('/filter-options', asyncHandler(async (req, res) => {
    const [sessionsRes, classesRes, streamsRes] = await Promise.all([
      pool.query(`
        SELECT DISTINCT session_from, session_to 
        FROM students 
        WHERE session_from IS NOT NULL 
        ORDER BY session_from DESC
      `),
      pool.query(`
        SELECT DISTINCT class_name 
        FROM students 
        WHERE class_name IS NOT NULL 
        ORDER BY class_name
      `),
      pool.query(`
        SELECT DISTINCT stream 
        FROM students 
        WHERE stream IS NOT NULL AND TRIM(stream) <> '' 
        ORDER BY stream
      `)
    ]);

    const currentYear = new Date().getFullYear();
    const sessionList = [String(currentYear)];

    for (const r of sessionsRes.rows) {
      if (r.session_from && r.session_to) {
        const val = `${r.session_from}-${r.session_to}`;
        if (!sessionList.includes(val)) sessionList.push(val);
      } else if (r.session_from && !sessionList.includes(r.session_from)) {
        sessionList.push(r.session_from);
      }
    }

    const defaults = [`${currentYear}-${currentYear + 1}`, `${currentYear}-${currentYear}`, `${currentYear - 1}-${currentYear}`];
    for (const d of defaults) {
      if (!sessionList.includes(d)) sessionList.push(d);
    }

    res.json({
      success: true,
      sessions: sessionList,
      classes: classesRes.rows.map(r => r.class_name).filter(c => !['xi-arts', 'xii-arts', '5'].includes(String(c).toLowerCase())),
      streams: streamsRes.rows.map(r => r.stream),
    });
  }));

  router.get('/bulk-document-types', asyncHandler(async (req, res) => {
    res.json({
      success: true,
      document_types: Object.values(BULK_DOC_CONFIG).map(d => ({
        key: d.key,
        label: d.label,
        isPhoto: !!d.isPhoto,
      }))
    });
  }));

  router.post('/documents-preview', asyncHandler(async (req, res) => {
    const { session, class_name, stream, status, document_type } = req.body || {};
    const docKey = document_type || 'birth_certificate';
    const docConfig = BULK_DOC_CONFIG[docKey] || BULK_DOC_CONFIG.birth_certificate;

    const students = await getFilteredStudents(pool, { session, class_name, stream, status });
    if (!students.length) {
      return res.json({
        success: true,
        document_type: docKey,
        document_label: docConfig.label,
        total_students: 0,
        uploaded_count: 0,
        missing_count: 0,
        students: [],
      });
    }

    const studentIds = students.map(s => s.id);
    let docs = [];
    if (docConfig.docTypes && docConfig.docTypes.length > 0) {
      const docRes = await pool.query(
        'SELECT id, student_id, document_type, document_title, file_url, uploaded_at FROM student_documents WHERE student_id = ANY($1::bigint[]) AND document_type = ANY($2::text[])',
        [studentIds, docConfig.docTypes]
      );
      docs = docRes.rows;
    }

    const docMap = new Map();
    for (const d of docs) {
      if (!docMap.has(d.student_id)) docMap.set(d.student_id, []);
      docMap.get(d.student_id).push(d);
    }

    let uploadedCount = 0;
    const resultStudents = students.map(s => {
      let fileUrl = null;
      let docId = null;
      let docTitle = null;

      if (docConfig.isPhoto) {
        fileUrl = s.photo_url || (docMap.get(s.id)?.[0]?.file_url || null);
        docId = docMap.get(s.id)?.[0]?.id || null;
        docTitle = 'Student Photo';
      } else {
        const studentDocs = docMap.get(s.id);
        if (studentDocs && studentDocs.length > 0) {
          fileUrl = studentDocs[0].file_url;
          docId = studentDocs[0].id;
          docTitle = studentDocs[0].document_title || docConfig.label;
        }
      }

      const hasDoc = Boolean(fileUrl);
      if (hasDoc) uploadedCount++;

      return {
        id: s.id,
        registration_no: s.registration_no,
        student_name: s.student_name,
        class_name: s.class_name,
        roll_no: s.roll_no,
        has_document: hasDoc,
        file_url: fileUrl,
        document_id: docId,
        document_title: docTitle,
      };
    });

    res.json({
      success: true,
      document_type: docKey,
      document_label: docConfig.label,
      total_students: students.length,
      uploaded_count: uploadedCount,
      missing_count: students.length - uploadedCount,
      students: resultStudents,
    });
  }));

  const handleDocumentsZip = async (req, res) => {
    const isPost = req.method === 'POST';
    const params = isPost ? (req.body || {}) : req.query;
    const { session, class_name, stream, status, document_type } = params;
    const docKey = document_type || 'birth_certificate';
    const docConfig = BULK_DOC_CONFIG[docKey] || BULK_DOC_CONFIG.birth_certificate;

    const students = await getFilteredStudents(pool, { session, class_name, stream, status });
    if (!students.length) {
      return res.status(404).json({ success: false, message: 'No matching students found for the selected filters.' });
    }

    const studentIds = students.map(s => s.id);
    let docs = [];
    if (docConfig.docTypes && docConfig.docTypes.length > 0) {
      const docRes = await pool.query(
        'SELECT id, student_id, document_type, document_title, file_url FROM student_documents WHERE student_id = ANY($1::bigint[]) AND document_type = ANY($2::text[])',
        [studentIds, docConfig.docTypes]
      );
      docs = docRes.rows;
    }

    const docMap = new Map();
    for (const d of docs) {
      if (!docMap.has(d.student_id)) docMap.set(d.student_id, []);
      docMap.get(d.student_id).push(d);
    }

    const itemsToDownload = [];
    const missingList = [];

    for (const s of students) {
      let fileUrl = null;
      if (docConfig.isPhoto) {
        fileUrl = s.photo_url || (docMap.get(s.id)?.[0]?.file_url || null);
      } else {
        fileUrl = docMap.get(s.id)?.[0]?.file_url || null;
      }

      if (fileUrl) {
        itemsToDownload.push({
          registration_no: s.registration_no,
          student_name: s.student_name,
          roll_no: s.roll_no,
          class_name: s.class_name,
          file_url: fileUrl,
        });
      } else {
        missingList.push(`${s.registration_no} - ${s.student_name} (Class: ${s.class_name || '-'}, Roll: ${s.roll_no || '-'})`);
      }
    }

    if (!itemsToDownload.length) {
      return res.status(404).json({
        success: false,
        message: `None of the ${students.length} students have uploaded ${docConfig.label}.`,
      });
    }

    const cName = class_name && class_name !== 'all' ? class_name.replace(/[^a-zA-Z0-9]/g, '_') : 'All_Classes';
    const sName = session && session !== 'all' ? session.replace(/[^a-zA-Z0-9]/g, '_') : 'All_Sessions';
    const dName = docConfig.label.replace(/[^a-zA-Z0-9]/g, '_');
    const zipFilename = `Students_${cName}_${dName}_${sName}.zip`;

    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    const downloadedNames = [];

    for (const item of itemsToDownload) {
      try {
        let buf = null;
        let ext = '.jpg';

        if (/^https?:\/\//i.test(item.file_url)) {
          const resp = await fetch(item.file_url, { signal: AbortSignal.timeout(20000) });
          if (resp.ok) {
            const ab = await resp.arrayBuffer();
            buf = Buffer.from(ab);
            const cType = resp.headers.get('content-type') || '';
            if (cType.includes('pdf') || item.file_url.toLowerCase().endsWith('.pdf')) ext = '.pdf';
            else if (cType.includes('webp') || item.file_url.toLowerCase().endsWith('.webp')) ext = '.webp';
            else if (cType.includes('png') || item.file_url.toLowerCase().endsWith('.png')) ext = '.png';
            else ext = '.jpg';
          }
        } else {
          const pPath = path.join(uploadDir, path.basename(item.file_url));
          if (fs.existsSync(pPath)) {
            buf = await fs.promises.readFile(pPath);
            ext = path.extname(pPath) || '.jpg';
          }
        }

        if (buf) {
          const safeName = (item.student_name || 'student').replace(/[^a-zA-Z0-9]/g, '_');
          const arcFileName = `${item.registration_no}_${safeName}_${dName}${ext}`;
          archive.append(buf, { name: arcFileName });
          downloadedNames.push(arcFileName);
        } else {
          missingList.push(`${item.registration_no} - ${item.student_name} (Failed to download from cloud)`);
        }
      } catch (e) {
        missingList.push(`${item.registration_no} - ${item.student_name} (Error: ${e.message})`);
      }
    }

    const report = [
      `AL-AMEEN MISSION ACADEMY MEMARI`,
      `====================================================`,
      `BULK DOCUMENT EXPORT REPORT`,
      `Document Type: ${docConfig.label}`,
      `Class: ${class_name || 'All'}`,
      `Session: ${session || 'All'}`,
      `Generated At: ${new Date().toLocaleString('en-IN')}`,
      `Total Students Checked: ${students.length}`,
      `Files Successfully Included: ${downloadedNames.length}`,
      `Missing / Not Uploaded: ${missingList.length}`,
      `====================================================`,
      ``,
      `MISSING / FAILED LIST (${missingList.length} students):`,
      `----------------------------------------------------`,
      ...(missingList.length ? missingList.map((m, i) => `${i + 1}. ${m}`) : ['None! All students have uploaded this document.']),
      ``,
    ].join('\r\n');

    archive.append(Buffer.from(report, 'utf-8'), { name: `00_SUMMARY_REPORT_${dName}.txt` });
    await archive.finalize();
  };

  router.post('/documents-zip', asyncHandler(handleDocumentsZip));
  router.get('/documents-zip', asyncHandler(handleDocumentsZip));

  router.post('/preview-count', asyncHandler(async (req, res) => {
    const students = await getFilteredStudents(pool, req.body || {});
    res.json({
      success: true,
      count: students.length,
      sample: students.slice(0, 5).map(s => ({
        registration_no: s.registration_no,
        student_name: s.student_name,
        class_name: s.class_name,
        roll_no: s.roll_no,
        session: `${s.session_from || ''}-${s.session_to || ''}`,
      }))
    });
  }));

  router.post('/excel-custom', asyncHandler(async (req, res) => {
    const b = req.body || {};
    const students = await getFilteredStudents(pool, b);
    if (!students.length) {
      return res.status(404).json({
        success: false,
        message: 'No students found matching your selected filters. Please check Session and Class.',
      });
    }
    const columns = Array.isArray(b.columns) && b.columns.length > 0 ? b.columns : [];
    const workbook = await makeCustomWorkbook(students, columns);
    const buffer = await workbook.xlsx.writeBuffer();

    const className = b.class_name && b.class_name !== 'all' ? b.class_name.replace(/[^a-zA-Z0-9]/g, '_') : 'all';
    const sessionName = b.session && b.session !== 'all' ? b.session.replace(/[^a-zA-Z0-9]/g, '_') : 'all';
    const filename = `students_${className}_${sessionName}.xlsx`;

    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  }));

  router.get('/excel', asyncHandler(async (req, res) => {
    const template = req.query.template === 'true';
    if (template) {
      const workbook = await makeWorkbook([]);
      const rooms = await pool.query('SELECT room_name FROM rooms ORDER BY room_name');
      const sheet = workbook.addWorksheet('Rooms');
      sheet.columns = [{ header: 'room_number', key: 'room_name', width: 25 }];
      sheet.addRows(rooms.rows);
      const buffer = await workbook.xlsx.writeBuffer();
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', 'attachment; filename="student-template.xlsx"');
      return res.send(Buffer.from(buffer));
    }

    const { class_name, session, stream, status, columns } = req.query;
    const isFiltered = class_name || session || stream || status || columns;

    if (isFiltered) {
      const colList = columns ? String(columns).split(',').map(c => c.trim()).filter(Boolean) : [];
      const students = await getFilteredStudents(pool, { class_name, session, stream, status });
      const workbook = await makeCustomWorkbook(students, colList);
      const buffer = await workbook.xlsx.writeBuffer();
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', 'attachment; filename="students-custom.xlsx"');
      return res.send(Buffer.from(buffer));
    }

    const students = (await pool.query('SELECT s.*, r.room_name FROM students s LEFT JOIN rooms r ON r.id=s.room_id ORDER BY s.registration_no')).rows;
    const workbook = await makeWorkbook(students);
    const rooms = await pool.query('SELECT room_name FROM rooms ORDER BY room_name');
    const sheet = workbook.addWorksheet('Rooms');
    sheet.columns = [{ header: 'room_number', key: 'room_name', width: 25 }];
    sheet.addRows(rooms.rows);
    const buffer = await workbook.xlsx.writeBuffer();
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="students.xlsx"');
    res.send(Buffer.from(buffer));
  }));

  router.post('/excel/:action', upload(excelUpload), asyncHandler(async (req, res) => {
    if (!['preview', 'import'].includes(req.params.action)) return res.status(404).json({ success: false, message: 'Unknown action' });
    if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ success: false, message: 'Choose an .xlsx Excel file' });
    let parsed;
    try { parsed = await parseWorkbook(req.file.buffer); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const textLimits = await pool.query("SELECT column_name, character_maximum_length FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='students' AND character_maximum_length IS NOT NULL");
    const maxLength = new Map(textLimits.rows.map(column => [column.column_name, Number(column.character_maximum_length)]));
    for (const row of parsed.rows) {
      for (const [field, value] of Object.entries(row.data)) {
        const limit = maxLength.get(field);
        if (limit && String(value).length > limit) parsed.errors.push({ row: row.row, message: `${field} is ${String(value).length} characters; maximum is ${limit}.` });
      }
    } const keys = parsed.rows.map(row => row.data.registration_no.toLowerCase());
    const existing = await pool.query('SELECT id, registration_no FROM students WHERE lower(registration_no) = ANY($1::text[])', [keys]);
    const map = new Map();
    for (const student of existing.rows) {
      const key = student.registration_no.toLowerCase();
      if (map.has(key)) parsed.errors.push({ message: 'Multiple existing students match registration ' + student.registration_no });
      map.set(key, student);
    }
    const rooms = await pool.query('SELECT id, room_name FROM rooms ORDER BY room_name');
    const roomByNumber = new Map(rooms.rows.map(room => [String(room.room_name).trim().toLowerCase(), String(room.id)]));
    const roomByLabel = new Map(rooms.rows.map(room => { const match = String(room.room_name).trim().match(/^room\s+(.+)$/i); return match ? [match[1].trim().toLowerCase(), String(room.id)] : null; }).filter(Boolean));
    const roomChoices = rooms.rows.map(room => room.room_name).join(', ');
    for (const row of parsed.rows) {
      const suppliedRoom = row.data.room_number;
      if (suppliedRoom === undefined || suppliedRoom === null || suppliedRoom === '') continue;
      const text = String(suppliedRoom).trim().toLowerCase();
      const matchedId = roomByNumber.get(text) || roomByLabel.get(text);
      if (matchedId) { row.data.room_id = Number(matchedId); delete row.data.room_number; }
      else parsed.errors.push({ row: row.row, message: 'Room number "' + suppliedRoom + '" was not found. Choose a room number from the Rooms sheet, or leave room_number blank. Available room numbers: ' + (roomChoices || 'none configured') });
    }
    const summary = { total: parsed.rows.length, created: parsed.rows.filter(row => !map.has(row.data.registration_no.toLowerCase())).length, updated: parsed.rows.filter(row => map.has(row.data.registration_no.toLowerCase())).length };
    if (req.params.action === 'preview') return res.json({ success: true, ...summary, errors: parsed.errors });
    if (parsed.errors.length) return res.status(400).json({ success: false, message: 'Fix the Excel errors before importing. No students were changed.', errors: parsed.errors });
    const client = await pool.connect();
    let rowNumber = null;
    try {
      await client.query('BEGIN');
      for (const row of parsed.rows) {
        rowNumber = row.row;
        const match = map.get(row.data.registration_no.toLowerCase());
        const fields = studentFields.filter(field => row.data[field] !== undefined && (!match || field !== 'registration_no'));
        const values = fields.map(field => row.data[field]);
        if (match) {
          const result = await client.query('UPDATE students SET ' + fields.map((field, index) => field + '=$' + (index + 1)).join(',') + ', updated_at=NOW() WHERE id=$' + (values.length + 1) + ' RETURNING id', [...values, match.id]);
          if (!result.rowCount) throw new Error('Student was removed during import');
        } else {
          await client.query('INSERT INTO students (' + fields.join(',') + ') VALUES (' + fields.map((_, index) => '$' + (index + 1)).join(',') + ')', values);
        }
      }
      await client.query('COMMIT');
      res.json({ success: true, ...summary, errors: [] });
    } catch (error) {
      await client.query('ROLLBACK');
      let reason = "Check this row's values and database requirements.";
      if (error.code === '22001') reason = `Value is too long${error.column ? ' for ' + error.column : ''}.`;
      else if (error.code === '23505') reason = 'Registration number already exists.';
      else if (error.code === '23503') reason = 'Room number or another linked record does not exist.';
      else if (error.code === '23502') reason = `Required field${error.column ? ' ' + error.column : ''} is missing.`;
      else if (error.code === '22P02') reason = `Invalid value format${error.column ? ' for ' + error.column : ''}.`;
      else if (error.code === '23514') reason = `Value is not allowed${error.constraint ? ' (' + error.constraint + ')' : ''}.`;
      console.error('Student Excel import failed at row ' + rowNumber + ':', error.code || '', error.message || error);
      res.status(400).json({ success: false, message: `Import failed at Excel row ${rowNumber}. ${reason} No students were changed.` });
    } finally { client.release(); }
  }));

  router.post('/photos', upload(photoUpload), asyncHandler(async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'Choose at least one photo' });
    const results = [], seen = new Set();
    for (const file of req.files) {
      let uploaded = null;
      try {
        const registration = photoRegistration(file.originalname);
        const key = registration.toLowerCase();
        if (seen.has(key)) throw new Error('Duplicate photo for this registration number');
        seen.add(key);
        photoExtension(file.buffer);
        const match = await pool.query('SELECT id,photo_url FROM students WHERE lower(registration_no)=lower($1)', [registration]);
        if (match.rows.length !== 1) throw new Error(match.rows.length ? 'Multiple students match this registration number' : 'Registration number not found');
        const compressed = await sharp(file.buffer, { failOn: 'error' })
          .rotate()
          .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78, effort: 4 })
          .toBuffer();
        uploaded = await uploadBuffer(compressed, {
          folder: 'al-ameen/student-photos',
          publicId: registration + '-' + Date.now(),
          resourceType: 'image',
          format: 'webp',
        });
        const result = await pool.query('UPDATE students SET photo_url=$1, updated_at=NOW() WHERE id=$2 RETURNING id', [uploaded.url, match.rows[0].id]);
        if (!result.rowCount) throw new Error('Student no longer exists');
        await deleteCloudinaryUrl(match.rows[0].photo_url).catch(() => { });
        results.push({ file: file.originalname, registration_no: registration, success: true, original_bytes: file.size, compressed_bytes: uploaded.bytes });
      } catch (error) {
        if (uploaded?.url) await deleteCloudinaryUrl(uploaded.url).catch(() => { });
        results.push({ file: file.originalname, success: false, message: error.message });
      }
    }
    res.json({ success: true, uploaded: results.filter(item => item.success).length, failed: results.filter(item => !item.success).length, results });
  }));

  return router;
}
module.exports = { createTransferRouter };
