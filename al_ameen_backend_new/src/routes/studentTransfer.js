
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { studentFields } = require('../utils/studentData');
const { parseWorkbook, makeWorkbook, photoRegistration, photoExtension } = require('../utils/studentTransfer');

function createTransferRouter(pool, photoDirectory = path.join(__dirname, '../../uploads/student-photos')) {
  const router = express.Router();
  router.use(auth, allow('super_admin', 'admin'));
  const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 } }).single('file');
  const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 2 } }).array('photos', 10);
  const upload = middleware => (req, res, next) => middleware(req, res, error => error
    ? res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'File is too large (Excel: 10 MB, each photo: 5 MB).' : 'Invalid upload: ' + error.message })
    : next());

  router.get('/excel', asyncHandler(async (req, res) => {
    const template = req.query.template === 'true';
    const students = template ? [] : (await pool.query('SELECT s.*, r.room_name FROM students s LEFT JOIN rooms r ON r.id=s.room_id ORDER BY s.registration_no')).rows;
    const workbook = await makeWorkbook(students);
    const rooms = await pool.query('SELECT room_name FROM rooms ORDER BY room_name');
    const sheet = workbook.addWorksheet('Rooms');
    sheet.columns = [{ header: 'room_number', key: 'room_name', width: 25 }];
    sheet.addRows(rooms.rows);
    const buffer = await workbook.xlsx.writeBuffer();
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="' + (template ? 'student-template.xlsx' : 'students.xlsx') + '"');
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
    }    const keys = parsed.rows.map(row => row.data.registration_no.toLowerCase());
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
    await fs.mkdir(photoDirectory, { recursive: true });
    const results = [], seen = new Set();
    for (const file of req.files) {
      let diskPath;
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
        const filename = randomUUID() + '.webp';
        diskPath = path.join(photoDirectory, filename);
        await fs.writeFile(diskPath, compressed, { flag: 'wx' });
        const photoUrl = '/uploads/student-photos/' + filename;
        const result = await pool.query('UPDATE students SET photo_url=$1, updated_at=NOW() WHERE id=$2 RETURNING id', [photoUrl, match.rows[0].id]);
        if (!result.rowCount) throw new Error('Student no longer exists');
        const oldUrl = String(match.rows[0].photo_url || '');
        if (oldUrl.startsWith('/uploads/student-photos/')) {
          const oldPath = path.resolve(photoDirectory, path.basename(oldUrl));
          if (oldPath !== diskPath && path.dirname(oldPath) === path.resolve(photoDirectory)) await fs.unlink(oldPath).catch(() => {});
        }
        results.push({ file: file.originalname, registration_no: registration, success: true, original_bytes: file.size, compressed_bytes: compressed.length });
      } catch (error) {
        if (diskPath) await fs.unlink(diskPath).catch(() => {});
        results.push({ file: file.originalname, success: false, message: error.message });
      }
    }
    res.json({ success: true, uploaded: results.filter(item => item.success).length, failed: results.filter(item => !item.success).length, results });
  }));
  return router;
}
module.exports = { createTransferRouter };
