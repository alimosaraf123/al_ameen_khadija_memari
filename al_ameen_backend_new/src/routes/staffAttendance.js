const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();
let ready;
function schema() {
  if (!ready) ready = pool.query(`
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS residential_type VARCHAR(50);
    CREATE TABLE IF NOT EXISTS staff_attendance (
      teacher_id INTEGER REFERENCES teachers(id), attendance_date DATE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Leave')),
      marked_by INTEGER REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(teacher_id,attendance_date)
    )
  `).catch(error => { ready = null; throw error; });
  return ready;
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
router.use(auth, allow('super_admin','admin'));

router.get('/', asyncHandler(async(req,res) => {
  if (!validDate(req.query.date)) return res.status(400).json({message:'Enter a valid date (YYYY-MM-DD).'});
  await schema();
  const result = await pool.query(`SELECT t.id,t.staff_id,t.name,t.photo_url,
    COALESCE(NULLIF(t.profile_details->>'staff_type',''), NULLIF(t.designation,''), 'Staff') AS designation,
    a.status
    FROM teachers t
    LEFT JOIN staff_attendance a ON a.teacher_id=t.id AND a.attendance_date=$1
    WHERE t.is_active=TRUE
      AND LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type', ''))) <> 'guest'
      AND (
        LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type', ''))) IN ('residential', 'non-residential', 'non residential')
        OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_role', ''))) NOT LIKE '%guest%'
      )
    ORDER BY CASE WHEN t.staff_id ~ '^\\d+$' THEN 0 ELSE 1 END,
      NULLIF(regexp_replace(COALESCE(t.staff_id,''), '\\D', '', 'g'), '')::int ASC NULLS LAST,
      t.name,t.id`, [req.query.date]);
  res.json({success:true,staff:result.rows});
}));

router.post('/', asyncHandler(async(req,res) => {
  const {date, entries, teacher_id, status} = req.body || {};
  await schema();

  // Support single-cell instant save: { date, teacher_id, status }
  if (teacher_id && date && status !== undefined) {
    if (!validDate(date)) return res.status(400).json({message:'Enter a valid date (YYYY-MM-DD).'});
    if (!status) {
      await pool.query('DELETE FROM staff_attendance WHERE teacher_id=$1 AND attendance_date=$2', [teacher_id, date]);
      return res.json({success:true, message:'Attendance cleared.'});
    }
    if (!['Present','Absent','Late','Leave'].includes(status)) {
      return res.status(400).json({message:'Invalid status.'});
    }
    await pool.query(`
      INSERT INTO staff_attendance(teacher_id,attendance_date,status,marked_by,updated_at)
      VALUES($1,$2,$3,$4,NOW())
      ON CONFLICT(teacher_id,attendance_date)
      DO UPDATE SET status=EXCLUDED.status,marked_by=EXCLUDED.marked_by,updated_at=NOW()
    `, [teacher_id, date, status, req.user ? req.user.userId : null]);
    return res.json({success:true, message:'Attendance updated.'});
  }

  // Batch save: { date, entries: [{ id, status }] }
  if (!validDate(date) || !Array.isArray(entries) || !entries.length) {
    return res.status(400).json({message:'Choose a valid date and entries.'});
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      if (!entry || !entry.id) continue;
      if (!entry.status) {
        await client.query('DELETE FROM staff_attendance WHERE teacher_id=$1 AND attendance_date=$2', [entry.id, date]);
      } else if (['Present','Absent','Late','Leave'].includes(entry.status)) {
        await client.query(`
          INSERT INTO staff_attendance(teacher_id,attendance_date,status,marked_by,updated_at)
          VALUES($1,$2,$3,$4,NOW())
          ON CONFLICT(teacher_id,attendance_date)
          DO UPDATE SET status=EXCLUDED.status,marked_by=EXCLUDED.marked_by,updated_at=NOW()
        `, [entry.id, date, entry.status, req.user ? req.user.userId : null]);
      }
    }
    await client.query('COMMIT');
    res.json({success:true,message:'Attendance saved.'});
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/monthly', asyncHandler(async(req,res) => {
  const month = req.query.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validDate(month+'-01')) return res.status(400).json({message:'Enter a valid month (YYYY-MM).'});
  await schema();
  const result = await pool.query(`SELECT t.id,t.staff_id,t.name,t.photo_url,
    COALESCE(NULLIF(t.profile_details->>'staff_type',''), NULLIF(t.designation,''), 'Staff') AS designation,
    COUNT(*) FILTER(WHERE a.status='Present')::int AS present,
    COUNT(*) FILTER(WHERE a.status='Absent')::int AS absent,
    COUNT(*) FILTER(WHERE a.status='Late')::int AS late,
    COUNT(*) FILTER(WHERE a.status='Leave')::int AS leave,
    COUNT(a.teacher_id)::int AS recorded
    FROM teachers t LEFT JOIN staff_attendance a ON a.teacher_id=t.id
    AND a.attendance_date >= $1::date AND a.attendance_date < $1::date + INTERVAL '1 month'
    WHERE t.is_active=TRUE
      AND LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type', ''))) <> 'guest'
      AND (
        LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type', ''))) IN ('residential', 'non-residential', 'non residential')
        OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_role', ''))) NOT LIKE '%guest%'
      )
    GROUP BY t.id,t.staff_id,t.name,t.photo_url,t.designation,t.profile_details
    ORDER BY CASE WHEN t.staff_id ~ '^\\d+$' THEN 0 ELSE 1 END,
      NULLIF(regexp_replace(COALESCE(t.staff_id,''), '\\D', '', 'g'), '')::int ASC NULLS LAST,
      t.name,t.id`, [month+'-01']);
  res.json({success:true,staff:result.rows});
}));

router.get('/summary', asyncHandler(async(req,res) => {
  if (!validDate(req.query.date)) return res.status(400).json({message:'Enter a valid date (YYYY-MM-DD).'});
  await schema();
  const result = await pool.query(`SELECT CASE WHEN LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type','')))='guest'
      AND LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('teacher','teachers') THEN 'Guest Teacher'
      ELSE CASE WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('other','others') THEN 'Others'
        ELSE COALESCE(NULLIF(TRIM(t.profile_details->>'staff_type'),''),'Other') END END AS staff,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE COALESCE(a.status,'Present')='Present')::int AS present,
    COUNT(*) FILTER (WHERE a.status='Absent')::int AS absent,
    COUNT(*) FILTER (WHERE a.status='Leave')::int AS leave
    FROM teachers t LEFT JOIN staff_attendance a ON a.teacher_id=t.id AND a.attendance_date=$1
    WHERE t.is_active=TRUE
      AND LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type',''))) <> 'guest'
      AND (
        LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type', ''))) IN ('residential', 'non-residential', 'non residential')
        OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_role', ''))) NOT LIKE '%guest%'
      )
      AND LOWER(TRIM(COALESCE(t.profile_details->>'salary',''))) <> 'guest'
      AND LOWER(TRIM(COALESCE(t.profile_details->>'type_of_staff',''))) <> 'guest'
      AND LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) <> 'guest'
    GROUP BY 1 ORDER BY 1`, [req.query.date]);
  res.json({success:true,summary:result.rows});
}));

router.get('/monthly-grid', asyncHandler(async(req,res) => {
  const month = req.query.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validDate(month+'-01')) return res.status(400).json({message:'Enter a valid month (YYYY-MM).'});
  await schema();
  const days = await pool.query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS date, trim(to_char(d,'Dy')) AS day, extract(day from d)::int AS number
    FROM generate_series($1::date, $1::date + INTERVAL '1 month - 1 day', INTERVAL '1 day') d`, [month+'-01']);
  const staff = await pool.query(`SELECT t.id,t.staff_id,t.name,t.photo_url,
    COALESCE(NULLIF(t.profile_details->>'staff_type',''), NULLIF(t.designation,''), 'Staff') AS designation,
    COALESCE(json_object_agg(to_char(a.attendance_date,'YYYY-MM-DD'),a.status) FILTER(WHERE a.attendance_date IS NOT NULL),'{}'::json) AS attendance
    FROM teachers t
    LEFT JOIN staff_attendance a ON a.teacher_id=t.id AND a.attendance_date >= $1::date AND a.attendance_date < $1::date + INTERVAL '1 month'
    WHERE t.is_active=TRUE
      AND LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type', ''))) <> 'guest'
      AND (
        LOWER(TRIM(COALESCE(t.residential_type, t.profile_details->>'residential_type', ''))) IN ('residential', 'non-residential', 'non residential')
        OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_role', ''))) NOT LIKE '%guest%'
      )
    GROUP BY t.id,t.staff_id,t.name,t.photo_url,t.designation,t.profile_details
    ORDER BY CASE WHEN t.staff_id ~ '^\\d+$' THEN 0 ELSE 1 END,
      NULLIF(regexp_replace(COALESCE(t.staff_id,''), '\\D', '', 'g'), '')::int ASC NULLS LAST,
      t.name,t.id`, [month+'-01']);
  res.json({success:true,days:days.rows,staff:staff.rows});
}));

module.exports = router;
