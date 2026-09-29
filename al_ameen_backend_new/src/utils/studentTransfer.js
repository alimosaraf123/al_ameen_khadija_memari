
const ExcelJS = require('exceljs');
const path = require('path');
const { studentFields, numericFields, booleanFields, prepareBody } = require('./studentData');
const MAX_ROWS = 2000;
const dateFields = new Set(['date_of_birth', 'admission_date']);

function dateText(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function cellValue(cell) {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return dateText(value);
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) throw new Error('Replace formulas with plain values');
    if (value.richText) return value.richText.map(part => part.text).join('');
    if (typeof value.text === 'string') return value.text;
    throw new Error('Unsupported cell value');
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value) && Number.isInteger(value)) throw new Error('Long IDs must be stored as Text in Excel');
  return value;
}
function cleanValue(field, value) {
  const text = String(value).trim();
  if (dateFields.has(field)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(field + ': use YYYY-MM-DD');
    const date = new Date(text + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(field + ': invalid date');
    return text;
  }
  if (booleanFields.has(field)) {
    if (['true', 'yes', '1'].includes(text.toLowerCase())) return true;
    if (['false', 'no', '0'].includes(text.toLowerCase())) return false;
    throw new Error(field + ': use Yes/No or True/False');
  }
  if (field === 'room_id') return text;
  if (numericFields.has(field)) {
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0) throw new Error(field + ': invalid number');
    return number;
  }
  if (field === 'student_type' && !['hostel', 'day_scholar'].includes(text)) throw new Error('student_type: use hostel or day_scholar');
  if (field === 'registration_no' && text.length > 100) throw new Error('Registration number is too long');
  if (field === 'student_name' && text.length > 150) throw new Error('Student name is too long');
  if (field === 'class_name') {
    const key = text.toLowerCase().replace(/[\s.\-]+/g, '');
    if (key === 'xisc') return 'XI-Sc.';
    if (key === 'xiisc') return 'XII-Sc.';
  }
  return text;
}
async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw new Error('Unable to read Excel file. Upload a valid .xlsx workbook.'); }
  const sheet = workbook.getWorksheet('Students') || workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found');
  if (sheet.rowCount > MAX_ROWS + 1) throw new Error('Upload a maximum of ' + MAX_ROWS + ' students at a time');
  const headers = [];
  const seenHeaders = new Set();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = String(cellValue(cell)).trim().toLowerCase().replace(/\s+/g, '_');
    if (!studentFields.includes(header)) throw new Error('Unknown column: ' + header + '. Use the downloaded template.');
    if (seenHeaders.has(header)) throw new Error('Duplicate column: ' + header);
    seenHeaders.add(header); headers.push({ field: header, col });
  });
  for (const field of ['registration_no', 'student_name']) if (!seenHeaders.has(field)) throw new Error('Missing column: ' + field);
  const rows = [], errors = [], seenRegistrations = new Set();
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    if (!row.hasValues) continue;
    const data = {};
    try {
      for (const { field, col } of headers) {
        const value = cellValue(row.getCell(col));
        // Blank cells preserve existing data rather than erasing it.
        if (String(value).trim() !== '') data[field] = cleanValue(field, value);
      }
      if (!Object.keys(data).length) continue;
      if (!data.registration_no || !data.student_name) throw new Error('registration_no and student_name are required');
      const key = data.registration_no.toLowerCase();
      if (seenRegistrations.has(key)) throw new Error('Duplicate registration number in this workbook');
      seenRegistrations.add(key);
      rows.push({ row: n, data: prepareBody(data) });
    } catch (error) { errors.push({ row: n, message: error.message }); }
  }
  if (!rows.length && !errors.length) throw new Error('The Students sheet has no student rows');
  return { rows, errors };
}
async function makeWorkbook(students = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Al-Ameen Mission Academy Memari';
  const sheet = workbook.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = studentFields.map(key => ({ header: key, key, width: Math.max(18, key.length + 2), style: { numFmt: '@' } }));
  for (const student of students) {
    const row = {};
    for (const field of studentFields) {
      const value = student[field];
      row[field] = value == null ? '' : value instanceof Date ? dateText(value) : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
    }
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: studentFields.length } };
  const help = workbook.addWorksheet('Instructions');
  help.columns = [{ header: 'Student Excel Import', key: 'text', width: 110 }];
  [
    'Fill the Students sheet. Do not change its column names.',
    'registration_no and student_name are required. Maximum 2000 student rows per upload.',
    'Existing registration numbers update the supplied non-blank fields. Blank cells preserve existing values.',
    'New registration numbers create students. They are Active unless is_active is No.',
    'Keep registration numbers, phone numbers, Aadhaar and bank account numbers formatted as Text to preserve leading zeroes.',
    'Dates: YYYY-MM-DD. Boolean fields: Yes/No. student_type: hostel or day_scholar.',
    'room_id must be an existing room ID. The Rooms sheet lists available room IDs.',
    'Photo upload is separate: name each photo with its registration number, e.g. 75276.jpg.',
    'This workbook contains student records; visitor records, marks, dues and attendance are managed separately.',
  ].forEach(text => help.addRow({ text }));
  return workbook;
}
function photoRegistration(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) throw new Error('Use JPG, PNG or WebP photos');
  const registration = path.basename(filename, path.extname(filename)).trim();
  if (!registration || registration.length > 100 || /[\\/\x00-\x1f]/.test(registration)) throw new Error('Invalid registration number in file name');
  return registration;
}
function photoExtension(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return '.png';
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return '.jpg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  throw new Error('File content is not a supported photo');
}
module.exports = { parseWorkbook, makeWorkbook, photoRegistration, photoExtension, cleanValue };
