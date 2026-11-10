const express = require('express');
const ExcelJS = require('exceljs');
const multer=require('multer');const sharp=require('sharp');const path=require('path');const {uploadBuffer,deleteCloudinaryUrl}=require('../utils/cloudStorage');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();
router.use('/attendance', require('./staffAttendance'));
async function teacherCanAccess(req,id){if(['admin','super_admin'].includes(req.user.role))return true;const r=await pool.query('SELECT 1 FROM teachers WHERE id=$1 AND user_id=$2',[id,req.user.userId]);return !!r.rowCount;}

const teacherDetailsSchemaReady = pool.query([
  "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS profile_details JSONB NOT NULL DEFAULT '{}'::jsonb",
  "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS education_details JSONB NOT NULL DEFAULT '[]'::jsonb",
  "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS profile_edit_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS residential_type VARCHAR(50)"
].join(';'));

function firstNameLogin(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

router.get('/me', auth, allow('teacher'), asyncHandler(async(req,res)=>{await teacherDetailsSchemaReady;const result=await pool.query(`SELECT t.*,u.full_name,u.login_id FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.user_id=$1 LIMIT 1`,[req.user.userId]);if(!result.rowCount)return res.status(404).json({success:false,message:'Teacher profile not found'});res.json({success:true,teacher:result.rows[0],profile_edit_count:result.rows[0].profile_edit_count||0,profile_edits_remaining:Math.max(0,2-(result.rows[0].profile_edit_count||0))});}));
const MISSION_LOCATION = {
  latitude: 23.186813165763375,
  longitude: 88.11163491185468,
  maxDistanceMeters: 200,
};
const LOCATION_ERROR_MSG = 'please contact- 7479020091 for submit attednance';

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function ensureStaffAvailability(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_attendance (
      teacher_id INTEGER REFERENCES teachers(id),
      attendance_date DATE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Leave')),
      marked_by INTEGER REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(teacher_id,attendance_date)
    );
    ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION;
    ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS punch_in TIMESTAMPTZ;
    ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS punch_out TIMESTAMPTZ;
  `);
}

router.get('/me/availability',auth,allow('teacher'),asyncHandler(async(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  await ensureStaffAvailability();
  const r=await pool.query(`SELECT COALESCE(a.status,'Present') status, a.punch_in, a.punch_out, a.distance_meters FROM teachers t LEFT JOIN staff_attendance a ON a.teacher_id=t.id AND a.attendance_date=$1 WHERE t.user_id=$2 LIMIT 1`,[date,req.user.userId]);
  res.json({success:true,status:r.rows[0]?.status||'Present',date,punch_in:r.rows[0]?.punch_in,punch_out:r.rows[0]?.punch_out,distance:r.rows[0]?.distance_meters});
}));

router.post('/me/availability',auth,allow('teacher'),asyncHandler(async(req,res)=>{
  const date=String(req.body?.date||new Date().toISOString().slice(0,10));
  const status=String(req.body?.status||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['Present','Absent'].includes(status)){
    return res.status(400).json({message:'Choose Present or Absent.'});
  }

  const lat = Number(req.body?.latitude);
  const lng = Number(req.body?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(403).json({ success: false, message: LOCATION_ERROR_MSG });
  }

  const distance = getDistanceMeters(lat, lng, MISSION_LOCATION.latitude, MISSION_LOCATION.longitude);
  if (!Number.isFinite(distance) || distance > MISSION_LOCATION.maxDistanceMeters) {
    return res.status(403).json({
      success: false,
      message: LOCATION_ERROR_MSG,
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
    });
  }

  await ensureStaffAvailability();
  const t=await pool.query('SELECT id FROM teachers WHERE user_id=$1 LIMIT 1',[req.user.userId]);
  if(!t.rowCount)return res.status(404).json({message:'Teacher profile not found'});

  await pool.query(`
    INSERT INTO staff_attendance(
      teacher_id, attendance_date, status, marked_by, latitude, longitude, distance_meters, punch_in, punch_out, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      CASE WHEN $3 = 'Present' THEN NOW() ELSE NULL END,
      CASE WHEN $3 = 'Absent' THEN NOW() ELSE NULL END,
      NOW()
    )
    ON CONFLICT(teacher_id, attendance_date) DO UPDATE SET
      status = EXCLUDED.status,
      marked_by = EXCLUDED.marked_by,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      distance_meters = EXCLUDED.distance_meters,
      punch_in = CASE WHEN EXCLUDED.status = 'Present' AND staff_attendance.punch_in IS NULL THEN NOW() ELSE staff_attendance.punch_in END,
      punch_out = CASE WHEN EXCLUDED.status = 'Absent' THEN NOW() ELSE staff_attendance.punch_out END,
      updated_at = NOW()
  `, [t.rows[0].id, date, status, req.user.userId, lat, lng, Math.round(distance)]);

  res.json({ success: true, status, date, distance: Math.round(distance) });
}));
router.get('/availability',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const date=String(req.query.date||new Date().toISOString().slice(0,10));await ensureStaffAvailability();const r=await pool.query(`SELECT t.id,t.name,COALESCE(a.status,'Present') status FROM teachers t LEFT JOIN staff_attendance a ON a.teacher_id=t.id AND a.attendance_date=$1 WHERE t.is_active=TRUE ORDER BY t.name,t.id`,[date]);res.json({success:true,date,staff:r.rows});}));
router.patch('/me', auth, allow('teacher'), asyncHandler(async(req,res)=>{
  await teacherDetailsSchemaReady;
  const b=req.body||{};
  const allowed=['staff_id','name','designation','qualification','mobile','whatsapp','email','address','gender','date_of_birth','joining_date','subject','profile_details','education_details','residential_type'];
  const set=[],values=[];
  for(const f of allowed){
    if(b[f]===undefined)continue;
    const value=['profile_details','education_details'].includes(f)
      ? JSON.stringify(f==='education_details'?(Array.isArray(b[f])?b[f]:[]):(b[f]&&typeof b[f]==='object'?b[f]:{}))
      : (String(b[f]||'').trim()||null);
    values.push(value);set.push(`${f}=$${values.length}${['profile_details','education_details'].includes(f)?'::jsonb':''}`);
  }
  if(!set.length)return res.status(400).json({success:false,message:'No profile changes supplied'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(`UPDATE teachers SET ${set.join(',')},profile_edit_count=profile_edit_count+1 WHERE user_id=$${values.length+1} AND profile_edit_count<2 RETURNING *`,[...values,req.user.userId]);
    if(!result.rowCount){await client.query('ROLLBACK');return res.status(403).json({success:false,message:'Profile edit limit reached. You can update your profile only twice.'});}
    await client.query('UPDATE users SET full_name=$1 WHERE id=$2',[result.rows[0].name,req.user.userId]);
    await client.query('COMMIT');
    res.json({success:true,teacher:result.rows[0],profile_edit_count:result.rows[0].profile_edit_count,profile_edits_remaining:Math.max(0,2-result.rows[0].profile_edit_count)});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

router.get('/export', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  await teacherDetailsSchemaReady;
  const result = await pool.query(`
    SELECT t.*, COALESCE(t.residential_type, t.profile_details->>'residential_type', '') AS residential_type,
      u.login_id, u.full_name, u.role AS user_role, u.is_active AS user_active
    FROM teachers t
    LEFT JOIN users u ON u.id=t.user_id
    ORDER BY CASE WHEN t.staff_id ~ '^\\d+$' THEN 0 ELSE 1 END,
      NULLIF(regexp_replace(COALESCE(t.staff_id,''), '\\D', '', 'g'), '')::int ASC NULLS LAST,
      t.name, t.id
  `);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Staff List', {
    pageSetup: { orientation: 'landscape', paperSize: 9 }
  });

  sheet.columns = [
    { header: 'SL', key: 'sl', width: 6 },
    { header: 'Staff ID', key: 'staff_id', width: 14 },
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Designation', key: 'designation', width: 18 },
    { header: 'Staff Role', key: 'staff_role', width: 18 },
    { header: 'Staff Type', key: 'staff_type', width: 16 },
    { header: 'Residential Type', key: 'residential_type', width: 18 },
    { header: 'Subject', key: 'subject', width: 22 },
    { header: 'Qualification', key: 'qualification', width: 20 },
    { header: 'Mobile', key: 'mobile', width: 15 },
    { header: 'WhatsApp', key: 'whatsapp', width: 15 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'DOB', key: 'date_of_birth', width: 13 },
    { header: 'Joining Date', key: 'joining_date', width: 13 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Salary', key: 'salary', width: 12 },
    { header: 'Present Address', key: 'present_address', width: 35 },
    { header: 'Permanent Address', key: 'permanent_address', width: 35 },
    { header: 'Bank Name', key: 'bank_name', width: 18 },
    { header: 'Account No', key: 'account_no', width: 20 },
    { header: 'IFSC Code', key: 'ifsc_code', width: 14 },
    { header: 'Aadhaar No', key: 'aadhaar_no', width: 16 },
    { header: 'PAN No', key: 'pan_no', width: 14 },
    { header: 'Voter No', key: 'voter_no', width: 14 },
    { header: 'Login ID', key: 'login_id', width: 15 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' }
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  result.rows.forEach((t, index) => {
    const d = t.profile_details || {};
    const presentAddr = [d.present_village, d.present_post_office, d.present_police_station, d.present_district, d.present_state, d.present_pin_code].filter(Boolean).join(', ') || t.address || '';
    const permAddr = [d.permanent_village, d.permanent_post_office, d.permanent_police_station, d.permanent_district, d.permanent_state, d.permanent_pin_code].filter(Boolean).join(', ') || '';

    const row = sheet.addRow({
      sl: index + 1,
      staff_id: t.staff_id || '',
      name: t.name || '',
      designation: t.designation || '',
      staff_role: d.staff_role || '',
      staff_type: d.staff_type || '',
      residential_type: t.residential_type || d.residential_type || '',
      subject: t.subject || '',
      qualification: t.qualification || '',
      mobile: t.mobile || '',
      whatsapp: t.whatsapp || '',
      email: t.email || '',
      gender: t.gender || '',
      date_of_birth: t.date_of_birth ? String(t.date_of_birth).slice(0, 10) : '',
      joining_date: t.joining_date ? String(t.joining_date).slice(0, 10) : '',
      status: t.is_active ? 'Active' : 'Inactive',
      salary: d.salary || '',
      present_address: presentAddr,
      permanent_address: permAddr,
      bank_name: d.bank_name || '',
      account_no: d.account_no || '',
      ifsc_code: d.ifsc_code || '',
      aadhaar_no: d.aadhaar_no || '',
      pan_no: d.pan_no || '',
      voter_no: d.voter_no || '',
      login_id: t.login_id || ''
    });

    row.height = 22;
    row.eachCell((cell, colNum) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: [1, 2, 10, 11, 13, 14, 15, 16, 22, 23, 24].includes(colNum) ? 'center' : 'left'
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (index % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Staff_List_${new Date().toISOString().slice(0,10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}));

router.get('/gateman-sheet', auth, allow('super_admin', 'admin', 'office'), asyncHandler(async (req, res) => {
  await teacherDetailsSchemaReady;

  const staffRes = await pool.query(`
    SELECT t.id, t.staff_id, t.name, t.designation, t.is_active,
           COALESCE(t.profile_details->>'staff_type', '') as staff_type,
           COALESCE(t.profile_details->>'type_of_staff', '') as type_of_staff
    FROM teachers t
    WHERE t.is_active = TRUE
  `);

  const allStaff = staffRes.rows;

  const parseId = (sid) => {
    const clean = String(sid || '').replace(/\D/g, '');
    const num = parseInt(clean, 10);
    return isNaN(num) ? 999999 : num;
  };

  const isSecurity = (s) => {
    const des = String(s.designation || '').toLowerCase();
    const st = String(s.staff_type || '').toLowerCase();
    const sid = String(s.staff_id || '').toUpperCase();
    const name = String(s.name || '').toLowerCase();
    return des.includes('security') || des.includes('gate') || st.includes('security') || sid.startsWith('GATE') ||
           name.includes('aparna mondal') || name.includes('akbar ali') || name.includes('abbas mirz') || name.includes('abbas mirj');
  };

  const isOtherStaff = (s) => {
    if (isSecurity(s)) return false;
    if (String(s.staff_id || '').trim() === '1268') return false; // Mosaraf Ali is in Teachers group per paper sheet
    if (String(s.staff_id || '').trim() === '786') return false;  // Sk Hasibul Alam (In-charge) excluded
    const des = String(s.designation || '').toLowerCase();
    return des.includes('non');
  };

  const isTeacher = (s) => {
    if (String(s.staff_id || '').trim() === '786') return false;  // Sk Hasibul Alam (In-charge) excluded
    return !isSecurity(s) && !isOtherStaff(s);
  };

  // Group 1: Others Staff (sorted by employee ID ascending)
  const othersStaff = allStaff.filter(isOtherStaff).sort((a, b) => parseId(a.staff_id) - parseId(b.staff_id));

  // Group 2: Gatemen (Security Guards: Aparna Mondal, Akbar Ali, Abbas Mirja)
  const gatemenOrder = ['aparna', 'akbar', 'abbas'];
  const securityStaff = allStaff.filter(isSecurity).sort((a, b) => {
    const aIdx = gatemenOrder.findIndex(k => a.name.toLowerCase().includes(k));
    const bIdx = gatemenOrder.findIndex(k => b.name.toLowerCase().includes(k));
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return parseId(a.staff_id) - parseId(b.staff_id);
  });

  // Group 3: Teachers (sorted by employee ID ascending)
  const teachers = allStaff.filter(isTeacher).sort((a, b) => parseId(a.staff_id) - parseId(b.staff_id));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Gateman sheet', {
    pageSetup: { orientation: 'landscape', paperSize: 9 }
  });

  // Setup column widths
  sheet.columns = [
    { key: 'sl', width: 6 },
    { key: 'id', width: 12 },
    { key: 'name', width: 28 },
    { key: 'd1_in', width: 8.5 }, { key: 'd1_out', width: 8.5 },
    { key: 'd2_in', width: 8.5 }, { key: 'd2_out', width: 8.5 },
    { key: 'd3_in', width: 8.5 }, { key: 'd3_out', width: 8.5 },
    { key: 'd4_in', width: 8.5 }, { key: 'd4_out', width: 8.5 },
    { key: 'd5_in', width: 8.5 }, { key: 'd5_out', width: 8.5 },
    { key: 'd6_in', width: 8.5 }, { key: 'd6_out', width: 8.5 },
    { key: 'd7_in', width: 8.5 }, { key: 'd7_out', width: 8.5 },
  ];

  // Header Row 1
  sheet.mergeCells('A1:A2');
  sheet.getCell('A1').value = 'Sl';
  sheet.mergeCells('B1:B2');
  sheet.getCell('B1').value = 'ID';
  sheet.mergeCells('C1:C2');
  sheet.getCell('C1').value = 'Name';

  const dayColPairs = [
    ['D1:E1', 'D', 'E'],
    ['F1:G1', 'F', 'G'],
    ['H1:I1', 'H', 'I'],
    ['J1:K1', 'J', 'K'],
    ['L1:M1', 'L', 'M'],
    ['N1:O1', 'N', 'O'],
    ['P1:Q1', 'P', 'Q'],
  ];

  dayColPairs.forEach(([range]) => {
    sheet.mergeCells(range);
    sheet.getCell(range.split(':')[0]).value = 'Date';
  });

  // Header Row 2: In / Out
  dayColPairs.forEach(([, inCol, outCol]) => {
    sheet.getCell(`${inCol}2`).value = 'In';
    sheet.getCell(`${outCol}2`).value = 'Out';
  });

  // Style Header Rows 1 and 2
  [1, 2].forEach(rNum => {
    const row = sheet.getRow(rNum);
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, size: 10, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEBF1DE' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } }
      };
    });
  });

  let curRow = 3;

  function addStaffRow(slVal, idVal, nameVal, isZebra) {
    const row = sheet.getRow(curRow);
    row.height = 21;
    row.getCell(1).value = slVal !== '' && slVal !== undefined ? slVal : null;
    row.getCell(2).value = idVal ? (String(idVal).match(/^\d+$/) ? Number(idVal) : String(idVal)) : null;
    row.getCell(3).value = nameVal || null;

    for (let c = 1; c <= 17; c++) {
      const cell = row.getCell(c);
      cell.font = { size: 10, name: 'Calibri' };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 3 ? 'left' : 'center'
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB2B2B2' } },
        bottom: { style: 'thin', color: { argb: 'FFB2B2B2' } },
        left: { style: 'thin', color: { argb: 'FFB2B2B2' } },
        right: { style: 'thin', color: { argb: 'FFB2B2B2' } }
      };
      if (isZebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F8EE' }
        };
      }
    }
    curRow++;
  }

  // 1. Others Staff (Non-teaching)
  othersStaff.forEach((s, idx) => {
    addStaffRow(idx + 1, s.staff_id, s.name, idx % 2 === 0);
  });

  // 2. Gatemen (Security Guards) right below others staff with blank Sl and blank ID
  securityStaff.forEach((s, idx) => {
    addStaffRow('', '', s.name, (othersStaff.length + idx) % 2 === 0);
  });

  // Empty separator row
  addStaffRow('', '', '', false);

  // 3. Teachers (Sl resets to 1)
  teachers.forEach((s, idx) => {
    addStaffRow(idx + 1, s.staff_id, s.name, idx % 2 === 0);
  });

  sheet.autoFilter = 'A2:Q2';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Gateman_Sheet.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}));

router.get('/', auth, allow('super_admin','admin'), asyncHandler(async (req,res)=>{
  await teacherDetailsSchemaReady;
  const result = await pool.query(`
    SELECT t.*, COALESCE(t.residential_type, t.profile_details->>'residential_type', '') AS residential_type, u.login_id, u.full_name, u.role AS user_role, u.is_active AS user_active,
      COALESCE((
        SELECT json_agg(DISTINCT subject_name)
        FROM (
          SELECT trim(s.subject_name) AS subject_name
          FROM terminal_exam_subjects tes
          JOIN subjects s ON s.id=tes.subject_id
          WHERE tes.teacher_id=t.id
          UNION
          SELECT trim(value) AS subject_name
          FROM regexp_split_to_table(COALESCE(t.subject,''), '[,;/]+') value
          WHERE trim(value)<>''
        ) assigned
      ), '[]'::json) AS assigned_subjects
    FROM teachers t
    LEFT JOIN users u ON u.id=t.user_id
    ORDER BY t.name
  `);
  res.json({success:true, teachers:result.rows});
}));

router.post('/', auth, allow('super_admin','admin'), asyncHandler(async (req,res)=>{
  await teacherDetailsSchemaReady;
  const body = req.body || {};
  const staffId = String(body.staff_id || '').trim();
  const name = String(body.name || '').trim();
  if (!staffId || !name) return res.status(400).json({success:false,message:'Staff ID and name are required'});

  const requestedLogin = String(body.login_id || '').trim().toLowerCase();
  const baseLogin = requestedLogin || firstNameLogin(name);
  if (!baseLogin) return res.status(400).json({success:false,message:'A valid User ID could not be created from the name'});

  let loginId = baseLogin;
  const existingLogin = await pool.query('SELECT id FROM users WHERE login_id=$1', [loginId]);
  if (existingLogin.rowCount) {
    if (requestedLogin) return res.status(409).json({success:false,message:'This User ID is already in use'});
    loginId = `${baseLogin}${staffId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
    const suffixedLogin = await pool.query('SELECT id FROM users WHERE login_id=$1', [loginId]);
    if (suffixedLogin.rowCount) return res.status(409).json({success:false,message:'A unique User ID could not be created. Enter one manually.'});
  }

  if(body.password&&body.password!==body.confirm_password)return res.status(400).json({success:false,message:'Password confirmation does not match'});
  const initialPassword = String(body.password || staffId);
  const hash = await bcrypt.hash(initialPassword, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(`
      INSERT INTO users(login_id,password_hash,full_name,role)
      VALUES($1,$2,$3,'teacher') RETURNING id
    `, [loginId, hash, name]);
    const residentialType = String(body.residential_type || body.profile_details?.residential_type || '').trim() || null;
    const profileDetails = {
      ...(body.profile_details || {}),
      residential_type: residentialType || ''
    };
    const cleanDate = (val) => {
      const s = String(val || '').trim();
      if (!s || s.startsWith('0000') || s === 'Invalid Date') return null;
      const d = new Date(s);
      if (isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > 2100) return null;
      return s;
    };
    const dob = cleanDate(body.date_of_birth);
    const joiningDate = cleanDate(body.joining_date);

    const teacher = await client.query(`
      INSERT INTO teachers(
        user_id,staff_id,name,designation,subject,mobile,whatsapp,gender,email,address,
        date_of_birth,joining_date,qualification,photo_url,profile_details,education_details,residential_type
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      user.rows[0].id, staffId, name, body.designation || null, body.subject || null,
      body.mobile || null, body.whatsapp || null, body.gender || null, body.email || null,
      body.address || null, dob, joiningDate,
      body.qualification || null, body.photo_url || null,
      JSON.stringify(profileDetails), JSON.stringify(Array.isArray(body.education_details) ? body.education_details : []),
      residentialType
    ]);
    await client.query('COMMIT');
    res.status(201).json({
      success:true,
      teacher:{...teacher.rows[0], login_id:loginId},
      credentials:{login_id:loginId, initial_password:initialPassword},
    });
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));


router.put('/:id', auth, allow('super_admin','admin'), asyncHandler(async (req,res) => {
  await teacherDetailsSchemaReady;
  const body=req.body||{};
  if(body.password&&body.password!==body.confirm_password)return res.status(400).json({success:false,message:'Password confirmation does not match'});
  const current=await pool.query('SELECT t.*,u.login_id,u.id AS login_user_id,u.is_active AS user_active FROM teachers t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=$1',[req.params.id]);
  if(!current.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
  const old=current.rows[0];
  const staffId=String(body.staff_id??old.staff_id).trim();
  const name=String(body.name??old.name).trim();
  if(!staffId||!name)return res.status(400).json({success:false,message:'Staff ID and name are required'});
  const active=body.is_active===undefined ? (old.user_active!==false && old.is_active!==false) : body.is_active!==false;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const residentialType = body.residential_type !== undefined
      ? (String(body.residential_type || '').trim() || null)
      : (body.profile_details?.residential_type !== undefined
          ? (String(body.profile_details.residential_type || '').trim() || null)
          : (old.residential_type || old.profile_details?.residential_type || null));
    const profileDetails = {
      ...(old.profile_details || {}),
      ...(body.profile_details || {}),
      residential_type: residentialType || ''
    };
    const cleanDate = (val, fallback) => {
      let raw = val;
      if (raw === undefined) raw = fallback;
      const s = String(raw || '').trim();
      if (!s || s.startsWith('0000') || s === 'Invalid Date') return null;
      const d = new Date(s);
      if (isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > 2100) return null;
      return s;
    };
    const dob = cleanDate(body.date_of_birth, old.date_of_birth);
    const joiningDate = cleanDate(body.joining_date, old.joining_date);

    const teacher=await client.query(
      'UPDATE teachers SET staff_id=$1,name=$2,designation=$3,subject=$4,mobile=$5,whatsapp=$6,gender=$7,email=$8,address=$9,date_of_birth=$10,joining_date=$11,qualification=$12,profile_details=$13,education_details=$14,is_active=$15,residential_type=$16 WHERE id=$17 RETURNING *',
      [staffId,name,body.designation??old.designation,body.subject??old.subject,body.mobile??old.mobile,
       body.whatsapp??old.whatsapp,body.gender??old.gender,body.email??old.email,body.address??old.address,
       dob,joiningDate,body.qualification??old.qualification,
       JSON.stringify(profileDetails),
       JSON.stringify(Array.isArray(body.education_details)?body.education_details:(old.education_details||[])),
       active,residentialType,req.params.id]
    );
    if(old.login_user_id){
      const loginId=String(body.login_id??old.login_id).trim().toLowerCase();
      await client.query('UPDATE users SET full_name=$1,login_id=$2,is_active=$3 WHERE id=$4',[name,loginId,active,old.login_user_id]);
      if(body.password)await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(String(body.password),12),old.login_user_id]);
    }
    await client.query('COMMIT');
    res.json({success:true,teacher:teacher.rows[0]});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

router.patch('/:id/profile-edit-reset', auth, allow('super_admin','admin'), asyncHandler(async (req,res) => {
  await teacherDetailsSchemaReady;
  const result = await pool.query('UPDATE teachers SET profile_edit_count=0 WHERE id=$1 RETURNING id,profile_edit_count', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({success:false,message:'Teacher not found'});
  res.json({success:true,teacher_id:result.rows[0].id,profile_edit_count:0,profile_edits_remaining:2});
}));

router.patch('/:id/password-reset', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{const temporaryPassword='Temp@'+Math.floor(100000+Math.random()*900000);const t=(await pool.query('SELECT user_id,login_id FROM teachers JOIN users ON users.id=teachers.user_id WHERE teachers.id=$1',[req.params.id])).rows[0];if(!t)return res.status(404).json({success:false,message:'Teacher not found'});await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(temporaryPassword,12),t.user_id]);res.json({success:true,login_id:t.login_id,temporary_password:temporaryPassword});}));

router.patch('/:id/status', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{
 const active=req.body?.is_active!==false,client=await pool.connect();
 try{await client.query('BEGIN');const result=await client.query('UPDATE teachers SET is_active=$1 WHERE id=$2 RETURNING *',[active,req.params.id]);if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Teacher not found'});}if(result.rows[0].user_id)await client.query('UPDATE users SET is_active=$1 WHERE id=$2',[active,result.rows[0].user_id]);if(!active)await client.query('UPDATE teacher_room_assignments SET is_active=FALSE WHERE teacher_id=$1',[req.params.id]);await client.query('COMMIT');res.json({success:true,teacher:result.rows[0]});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));


const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}}).single('photo');
router.post('/:id/photo',auth,allow('super_admin','admin','teacher'),(req,res,next)=>photoUpload(req,res,error=>error?res.status(400).json({success:false,message:'Photo must be under 8 MB'}):next()),asyncHandler(async(req,res)=>{
  if(req.user.role==='teacher'&&!await teacherCanAccess(req,req.params.id))return res.status(403).json({success:false,message:'Teachers cannot upload their own documents or photo'});
 if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({success:false,message:'Choose an image file'});
 const current=await pool.query('SELECT photo_url FROM teachers WHERE id=$1',[req.params.id]);
 if(!current.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 const compressed=await sharp(req.file.buffer).rotate().resize(480,480,{fit:'cover',position:'attention'}).webp({quality:78,effort:4}).toBuffer();
 const uploaded=await uploadBuffer(compressed,{folder:'al-ameen/teacher-photos',publicId:'teacher-'+req.params.id+'-'+Date.now(),resourceType:'image',format:'webp'});
 try{
  const result=await pool.query('UPDATE teachers SET photo_url=$1 WHERE id=$2 RETURNING *',[uploaded.url,req.params.id]);
  await deleteCloudinaryUrl(current.rows[0].photo_url).catch(()=>{});
  res.json({success:true,teacher:result.rows[0]});
 }catch(error){await deleteCloudinaryUrl(uploaded.url).catch(()=>{});throw error;}
}));

const documentUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024},fileFilter:(req,file,cb)=>{const allowed=file.mimetype.startsWith('image/')||file.mimetype==='application/pdf';cb(allowed?null:new Error('Only image and PDF files are allowed'),allowed);}}).single('file');
const acceptDocument=(req,res,next)=>documentUpload(req,res,error=>error?res.status(400).json({success:false,message:error.message||'Document must be under 10 MB'}):next());

router.get('/:id/documents',auth,allow('super_admin','admin','teacher'),asyncHandler(async(req,res)=>{
  if(req.user.role==='teacher'&&!await teacherCanAccess(req,req.params.id))return res.status(403).json({success:false,message:'You can only view your own documents'});
 const teacher=await pool.query('SELECT id FROM teachers WHERE id=$1',[req.params.id]);
 if(!teacher.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 const result=await pool.query('SELECT * FROM teacher_documents WHERE teacher_id=$1 ORDER BY uploaded_at DESC',[req.params.id]);
 res.json({success:true,documents:result.rows});
}));

router.post('/:id/documents',auth,allow('super_admin','admin','teacher'),acceptDocument,asyncHandler(async(req,res)=>{
  if(req.user.role==='teacher')return res.status(403).json({success:false,message:'Teachers cannot upload their own documents'});
 if(!req.file)return res.status(400).json({success:false,message:'Choose an image or PDF file'});
 const teacher=await pool.query('SELECT id FROM teachers WHERE id=$1',[req.params.id]);
 if(!teacher.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 let uploaded;
 if(req.file.mimetype.startsWith('image/')){
  const compressed=await sharp(req.file.buffer,{failOn:'error'}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();
  uploaded=await uploadBuffer(compressed,{folder:'al-ameen/teacher-documents',resourceType:'image',format:'webp'});
 }else uploaded=await uploadBuffer(req.file.buffer,{folder:'al-ameen/teacher-documents',resourceType:'raw',extension:path.extname(req.file.originalname)||'.pdf'});
 try{
  const documentType=String(req.body.document_type||'other').trim()||'other';
  const existing=await pool.query('SELECT id,file_url FROM teacher_documents WHERE teacher_id=$1 AND document_type=$2 ORDER BY uploaded_at DESC LIMIT 1',[req.params.id,documentType]);
  const result=existing.rowCount
   ? await pool.query('UPDATE teacher_documents SET document_title=$1,file_url=$2,uploaded_by=$3,uploaded_at=NOW() WHERE id=$4 RETURNING *',[req.body.document_title||req.file.originalname,uploaded.url,req.user.userId,existing.rows[0].id])
   : await pool.query('INSERT INTO teacher_documents(teacher_id,document_type,document_title,file_url,uploaded_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.params.id,documentType,req.body.document_title||req.file.originalname,uploaded.url,req.user.userId]);
  if(existing.rowCount)await deleteCloudinaryUrl(existing.rows[0].file_url).catch(()=>{});
  res.status(201).json({success:true,document:result.rows[0]});
 }catch(error){await deleteCloudinaryUrl(uploaded.url).catch(()=>{});throw error;}
}));

router.delete('/documents/:documentId',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const result=await pool.query('DELETE FROM teacher_documents WHERE id=$1 RETURNING *',[req.params.documentId]);
 if(!result.rowCount)return res.status(404).json({success:false,message:'Document not found'});
 await deleteCloudinaryUrl(result.rows[0].file_url).catch(()=>{});
 res.json({success:true,message:'Document deleted'});
}));
router.patch('/:id/subjects', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{
 const subjects=Array.isArray(req.body?.subjects)?req.body.subjects.map(v=>String(v).trim()).filter(Boolean):[];
 const result=await pool.query('UPDATE teachers SET subject=$1 WHERE id=$2 RETURNING id,name,subject',[subjects.join(', '),req.params.id]);
 if(!result.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 res.json({success:true,teacher:result.rows[0],assigned_subjects:subjects});
}));
module.exports = router;
