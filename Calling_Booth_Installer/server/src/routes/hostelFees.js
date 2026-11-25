const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getPortalCredentials } = require('../utils/alAmeenAccounts');

const router = express.Router();

const ADMISSION_BASE_URL = 'https://alameenmission.net/alameen/admission/';
const ADMISSION_LOGIN_URL = 'https://alameenmission.net/alameen/admission/index.php';
const STUDENT_REPORT_URL = 'https://alameenmission.net/alameen/admission/?action=student_report';
const MEMARI_SCHOOL_ID = '94';
const TARGET_CLASS_IDS = ['6', '7', '8', '9', '10', '11', '12', '16', '27', '28', '29', '30', '32', '33'];

const CLASS_ORDER = [
  'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI-Sc.', 'XII-Sc.',
  'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'
];

function classSortRank(c) {
  const idx = CLASS_ORDER.indexOf(String(c || '').trim());
  return idx === -1 ? 999 : idx;
}

let ready;
function schema() {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS admission_hostel_fees (
        id SERIAL PRIMARY KEY,
        registration_no VARCHAR(60) NOT NULL,
        student_name VARCHAR(200) NOT NULL,
        class_name VARCHAR(60) NOT NULL,
        session_year VARCHAR(30) NOT NULL,
        sex VARCHAR(30),
        fee_category VARCHAR(80),
        admission_type VARCHAR(80),
        hostel_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
        local_student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (registration_no, session_year)
      );
      CREATE TABLE IF NOT EXISTS admission_hostel_fees_meta (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_synced_at TIMESTAMPTZ,
        last_synced_by INTEGER REFERENCES users(id),
        last_synced_by_name VARCHAR(200),
        target_year VARCHAR(20) DEFAULT '2026',
        total_portal_rows INTEGER DEFAULT 0,
        matched_local_students INTEGER DEFAULT 0,
        updated_student_fees INTEGER DEFAULT 0
      );
    `).catch(e => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

function cleanHtmlText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8377;/gi, '₹')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getTdByClass(tr, cls) {
  const m = tr.match(new RegExp(`<td[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, 'i'));
  return m ? cleanHtmlText(m[1]) : '';
}

async function loginToAdmissionPortal(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '').trim();
  if (!user || !pass) {
    throw new Error('Al-Ameen portal credentials are not configured.');
  }
  const body = new URLSearchParams({
    action: 'log_in_submit',
    email: user,
    password: pass
  });
  const res = await fetch(ADMISSION_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': ADMISSION_BASE_URL + '?action=log_in'
    },
    body: body.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(25000)
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/PHPSESSID=([^;,\s]+)/);
  const text = await res.text();
  if (/Invalid email or password|wrongemail/i.test(text) && !match) {
    throw new Error('Invalid Al-Ameen Admission Portal username or password.');
  }
  if (!match) {
    throw new Error('Could not establish session cookie with Al-Ameen Admission Portal.');
  }
  return match[1];
}

async function fetchPortalHostelFees(targetYear = '2026') {
  const creds = await getPortalCredentials();
  const sid = await loginToAdmissionPortal(creds.username, creds.password);

  const pageRes = await fetch(STUDENT_REPORT_URL, {
    headers: {
      Cookie: 'PHPSESSID=' + sid,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    signal: AbortSignal.timeout(25000)
  });
  const pageHtml = await pageRes.text();
  if (!/STUDENT REPORT/i.test(pageHtml)) {
    throw new Error('Failed to load Student Report page from Al-Ameen Admission Portal.');
  }

  const yrNum = parseInt(String(targetYear).replace(/\D/g, '').slice(0, 4), 10) || new Date().getFullYear();
  const validSessions = new Set([`${yrNum}-${yrNum}`, `${yrNum}-${yrNum + 1}`]);
  const targetClassSet = new Set(TARGET_CLASS_IDS);

  const sessIds = [];
  const sessionByClassId = new Map();
  const parts = pageHtml.split(/(?=<div[^>]*data-cls=["']\d+["'])/i);
  for (const part of parts) {
    const cm = part.match(/^<div[^>]*data-cls=["'](\d+)["']/i);
    if (!cm || !targetClassSet.has(cm[1])) continue;
    for (const lm of part.matchAll(/<label[^>]*>[\s\S]*?<\/label>/gi)) {
      const chunk = lm[0];
      if (!/name=["']sessids\[\]["']/i.test(chunk)) continue;
      const yr = chunk.match(/data-yr=["']([^"']+)["']/i)?.[1] || '';
      const val = chunk.match(/value=["']([^"']+)["']/i)?.[1] || '';
      if (val && validSessions.has(yr)) {
        sessIds.push(val);
        sessionByClassId.set(cm[1], yr);
      }
    }
  }

  if (!sessIds.length) {
    throw new Error(`No session checkboxes found on portal for ${yrNum}-${yrNum} / ${yrNum}-${yrNum + 1}.`);
  }

  const form = new URLSearchParams();
  form.append('type', 'student_report');
  form.append('sr_export', '');
  form.append('sr_cols', '');
  form.append('school_id', MEMARI_SCHOOL_ID);
  form.append('registration_no', '');
  form.append('student_name', '');
  for (const c of TARGET_CLASS_IDS) form.append('classids[]', c);
  for (const v of sessIds) form.append('sessids[]', v);
  form.append('search', 'Search');

  const postRes = await fetch(STUDENT_REPORT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: 'PHPSESSID=' + sid,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: STUDENT_REPORT_URL
    },
    body: form.toString(),
    signal: AbortSignal.timeout(45000)
  });

  const resultHtml = await postRes.text();
  const tbody =
    resultHtml.match(/<table[^>]*id=["']student_report["'][\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ||
    resultHtml;

  const dedup = new Map();
  for (const m of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tr = m[1];
    if (!/class=["'][^"']*current_hostel_charge/i.test(tr) || /<th/i.test(tr)) continue;
    const reg = getTdByClass(tr, 'registration_no');
    const name = getTdByClass(tr, 'student_name');
    const cls = getTdByClass(tr, 'class_id');
    if (!reg || !name) continue;
    const sex = getTdByClass(tr, 'sex');
    const feeCat = getTdByClass(tr, 'current_fee_category');
    const admType = getTdByClass(tr, 'admission_type');
    const rawFees = getTdByClass(tr, 'current_hostel_charge');
    const hostelFees = Number(String(rawFees).replace(/[^0-9.]/g, '')) || 0;
    const isRomanVToIX = ['V', 'VI', 'VII', 'VIII', 'IX'].includes(cls);
    const sessionLabel = isRomanVToIX ? `${yrNum}-${yrNum}` : `${yrNum}-${yrNum + 1}`;

    dedup.set(reg.toLowerCase(), {
      registration_no: reg,
      student_name: name,
      class_name: cls || 'Other',
      session_year: sessionLabel,
      sex: sex || null,
      fee_category: feeCat || null,
      admission_type: admType || null,
      hostel_fees: hostelFees
    });
  }

  return {
    targetYear: String(yrNum),
    rows: Array.from(dedup.values())
  };
}

async function loadSavedHostelFees() {
  await schema();
  const [rowsRes, metaRes] = await Promise.all([
    pool.query(`
      SELECT h.*,
             st.id AS matched_student_id,
             st.student_name AS local_student_name,
             st.class_name AS local_class_name,
             st.monthly_fees AS local_monthly_fees,
             st.is_active AS local_is_active,
             st.mobile_number,
             st.whatsapp_number
      FROM admission_hostel_fees h
      LEFT JOIN students st ON st.id = h.local_student_id
        OR (h.local_student_id IS NULL AND LOWER(TRIM(st.registration_no)) = LOWER(TRIM(h.registration_no)))
      ORDER BY h.class_name ASC, h.student_name ASC
    `),
    pool.query('SELECT * FROM admission_hostel_fees_meta WHERE id = 1')
  ]);

  const records = rowsRes.rows
    .map(r => ({
      id: r.id,
      registration_no: r.registration_no,
      student_name: r.student_name,
      class_name: r.class_name,
      session_year: r.session_year,
      sex: r.sex,
      fee_category: r.fee_category,
      admission_type: r.admission_type,
      hostel_fees: Number(r.hostel_fees || 0),
      local_student_id: r.matched_student_id ? Number(r.matched_student_id) : null,
      local_class_name: r.local_class_name || null,
      local_monthly_fees: r.local_monthly_fees != null ? Number(r.local_monthly_fees) : null,
      local_is_active: Boolean(r.local_is_active),
      mobile_number: r.mobile_number || null,
      synced_at: r.synced_at
    }))
    .sort((a, b) => classSortRank(a.class_name) - classSortRank(b.class_name) || a.student_name.localeCompare(b.student_name));

  const summaryMap = new Map();
  for (const r of records) {
    const key = r.class_name;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        class_name: key,
        portal_count: 0,
        portal_total: 0,
        local_count: 0,
        local_total: 0
      });
    }
    const item = summaryMap.get(key);
    item.portal_count += 1;
    item.portal_total += r.hostel_fees;
    if (r.local_student_id && r.local_is_active) {
      item.local_count += 1;
      item.local_total += r.hostel_fees;
    }
  }
  const classSummary = Array.from(summaryMap.values()).sort(
    (a, b) => classSortRank(a.class_name) - classSortRank(b.class_name)
  );

  return {
    records,
    classSummary,
    meta: metaRes.rows[0] || null
  };
}

const HOSTEL_FEES_BLOCKED_USERS = new Set([
  'office_noorsaba',
  'noorsaba',
  'office_masema',
  'masema',
  'office_masuma',
  'masuma',
  'nasmin'
]);
const HOSTEL_FEES_BLOCKED_USER_IDS = new Set(['27', '381', '382']);

function isHostelFeesBlockedUser(user) {
  if (!user || user.role === 'super_admin') return false;
  const uid = String(user.userId || user.id || '').trim();
  const cleanLogin = String(user.loginId || user.login_id || '').toLowerCase().trim();
  if (HOSTEL_FEES_BLOCKED_USER_IDS.has(uid) || HOSTEL_FEES_BLOCKED_USERS.has(cleanLogin)) {
    return true;
  }
  const norm = cleanLogin.replace(/[^a-z0-9]/g, '');
  return (
    norm.includes('noorsaba') ||
    norm.includes('masema') ||
    norm.includes('masuma') ||
    norm.includes('nasmin')
  );
}

router.use(auth, allow('super_admin', 'admin', 'office'), (req, res, next) => {
  if (isHostelFeesBlockedUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Hostel Fees is disabled for this account.'
    });
  }
  next();
});

// GET /api/hostel-fees — NEVER calls external portal; reads purely from our PostgreSQL cache
router.get('/', asyncHandler(async (req, res) => {
  const data = await loadSavedHostelFees();
  res.json({ success: true, ...data });
}));

// POST /api/hostel-fees/refresh — ONLY triggered manually when user clicks Refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const t0 = Date.now();
  await schema();
  const targetYear = String(req.body?.target_year || new Date().getFullYear()).replace(/\D/g, '').slice(0, 4) || '2026';
  const fetched = await fetchPortalHostelFees(targetYear);
  const tFetch = Date.now();

  const client = await pool.connect();
  const feeChanges = [];
  let matchedLocal = 0;
  let updatedLocalFees = 0;

  try {
    await client.query('BEGIN');

    const localStudentsRes = await client.query(
      'SELECT id, registration_no, student_name, class_name, monthly_fees, is_active FROM students'
    );
    const localByReg = new Map(
      localStudentsRes.rows.map(s => [String(s.registration_no || '').trim().toLowerCase(), s])
    );

    const regs = [];
    const names = [];
    const classes = [];
    const sessions = [];
    const sexes = [];
    const feeCats = [];
    const admTypes = [];
    const fees = [];
    const localIds = [];

    const updateIds = [];
    const updateFees = [];

    for (const row of fetched.rows) {
      const local = localByReg.get(row.registration_no.toLowerCase()) || null;
      if (local && local.is_active) {
        matchedLocal += 1;
        const oldFee = Number(local.monthly_fees || 0);
        const newFee = Number(row.hostel_fees || 0);
        if (newFee > 0 && oldFee !== newFee) {
          updateIds.push(Number(local.id));
          updateFees.push(newFee);
          updatedLocalFees += 1;
          feeChanges.push({
            registration_no: row.registration_no,
            student_name: local.student_name || row.student_name,
            class_name: local.class_name || row.class_name,
            old_fee: oldFee,
            new_fee: newFee
          });
        }
      }
      regs.push(row.registration_no);
      names.push(row.student_name);
      classes.push(row.class_name);
      sessions.push(row.session_year);
      sexes.push(row.sex);
      feeCats.push(row.fee_category);
      admTypes.push(row.admission_type);
      fees.push(row.hostel_fees);
      localIds.push(local ? Number(local.id) : null);
    }

    // Bulk update students.monthly_fees in a single roundtrip
    if (updateIds.length > 0) {
      await client.query(
        `UPDATE students AS s
         SET monthly_fees = u.new_fee, updated_at = NOW()
         FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::numeric[]) AS new_fee) AS u
         WHERE s.id = u.id`,
        [updateIds, updateFees]
      );
    }

    // Replace saved rows in a SINGLE bulk UNNEST insert (takes ~100ms instead of 460 roundtrips!)
    await client.query('DELETE FROM admission_hostel_fees');
    if (regs.length > 0) {
      await client.query(
        `INSERT INTO admission_hostel_fees (
           registration_no, student_name, class_name, session_year,
           sex, fee_category, admission_type, hostel_fees, local_student_id, synced_at
         )
         SELECT *, NOW()
         FROM unnest(
           $1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[],
           $5::varchar[], $6::varchar[], $7::varchar[], $8::numeric[], $9::bigint[]
         )
         ON CONFLICT (registration_no, session_year) DO UPDATE SET
           student_name = EXCLUDED.student_name,
           class_name = EXCLUDED.class_name,
           sex = EXCLUDED.sex,
           fee_category = EXCLUDED.fee_category,
           admission_type = EXCLUDED.admission_type,
           hostel_fees = EXCLUDED.hostel_fees,
           local_student_id = EXCLUDED.local_student_id,
           synced_at = NOW()`,
        [regs, names, classes, sessions, sexes, feeCats, admTypes, fees, localIds]
      );
    }

    const userRow = (await client.query('SELECT full_name FROM users WHERE id = $1', [req.user.userId])).rows[0];
    const syncedByName = userRow?.full_name || req.user.role || 'Admin';

    await client.query(
      `INSERT INTO admission_hostel_fees_meta (
         id, last_synced_at, last_synced_by, last_synced_by_name,
         target_year, total_portal_rows, matched_local_students, updated_student_fees
       ) VALUES (1, NOW(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         last_synced_at = NOW(),
         last_synced_by = EXCLUDED.last_synced_by,
         last_synced_by_name = EXCLUDED.last_synced_by_name,
         target_year = EXCLUDED.target_year,
         total_portal_rows = EXCLUDED.total_portal_rows,
         matched_local_students = EXCLUDED.matched_local_students,
         updated_student_fees = EXCLUDED.updated_student_fees`,
      [req.user.userId, syncedByName, fetched.targetYear, fetched.rows.length, matchedLocal, updatedLocalFees]
    );

    await client.query('COMMIT');
    console.log(`[HostelFees] Synced ${fetched.rows.length} rows (portal: ${tFetch - t0}ms, db: ${Date.now() - tFetch}ms, updated local fees: ${updatedLocalFees})`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const data = await loadSavedHostelFees();
  res.json({
    success: true,
    ...data,
    feeChanges
  });
}));

// GET /api/hostel-fees/excel — exports saved DB records class-wise
router.get('/excel', asyncHandler(async (req, res) => {
  const { records, meta } = await loadSavedHostelFees();
  const scope = String(req.query.scope || 'local').toLowerCase();
  const classFilter = String(req.query.class_name || 'all').trim();
  const genderFilter = String(req.query.gender || 'all').toLowerCase();
  const search = String(req.query.search || '').trim().toLowerCase();

  const filtered = records.filter(r => {
    if (scope === 'local' && !(r.local_student_id && r.local_is_active)) return false;
    if (classFilter !== 'all' && r.class_name !== classFilter) return false;
    if (genderFilter !== 'all' && String(r.sex || '').toLowerCase() !== genderFilter) return false;
    if (search) {
      const hay = `${r.registration_no} ${r.student_name} ${r.class_name} ${r.fee_category || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hostel Fees', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const title = ws.addRow(['AL-AMEEN MISSION ACADEMY MEMARI — CLASS-WISE HOSTEL FEES']);
  title.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF173F68' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(1, 1, 1, 8);
  ws.getRow(1).height = 24;

  const syncedStr = meta?.last_synced_at ? new Date(meta.last_synced_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not synced';
  const sub = ws.addRow([`Class: ${classFilter === 'all' ? 'All Classes' : classFilter}  |  Total Students: ${filtered.length}  |  Total Hostel Fees: ₹${filtered.reduce((s, x) => s + x.hostel_fees, 0).toLocaleString('en-IN')}  |  Last Refreshed: ${syncedStr}`]);
  sub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(2, 1, 2, 8);
  ws.getRow(2).height = 18;

  const hRow = ws.addRow(['Sl', 'Reg. No.', 'Student Name', 'Class', 'Session', 'Fee Category', 'Admission Type', 'Hostel Fees (₹)']);
  hRow.height = 24;
  hRow.eachCell(c => {
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173F68' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  let grandTotal = 0;
  filtered.forEach((r, i) => {
    grandTotal += r.hostel_fees;
    const row = ws.addRow([
      i + 1,
      r.registration_no,
      r.student_name,
      r.class_name,
      r.session_year,
      r.fee_category || '-',
      r.admission_type || '-',
      r.hostel_fees
    ]);
    row.eachCell((c, col) => {
      c.font = { name: 'Calibri', size: 10, bold: col === 8 };
      c.alignment = { horizontal: col === 3 ? 'left' : 'center', vertical: 'middle' };
      c.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  });

  const totRow = ws.addRow(['', '', 'Grand Total', `${filtered.length} Students`, '', '', '', grandTotal]);
  totRow.eachCell(c => {
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF166534' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  ws.columns = [
    { width: 6 }, { width: 13 }, { width: 28 }, { width: 11 },
    { width: 13 }, { width: 15 }, { width: 16 }, { width: 16 }
  ];

  const out = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="hostel-fees-${classFilter.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx"`);
  res.send(Buffer.from(out));
}));

module.exports = router;
