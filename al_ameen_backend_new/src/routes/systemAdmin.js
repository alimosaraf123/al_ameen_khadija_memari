const express = require('express'), bcrypt = require('bcryptjs'), pool = require('../db'); const { auth, allow } = require('../middleware/auth'); const { auditReady: ready } = require('../middleware/governance'); const asyncHandler = require('../utils/asyncHandler'); const router = express.Router();
router.get('/admins', auth, allow('super_admin'), asyncHandler(async (req, res) => { await ready; const q = await pool.query(`SELECT u.id,u.login_id,u.full_name,u.is_active,u.created_at,COALESCE(json_agg(p.module_key) FILTER(WHERE p.module_key IS NOT NULL),'[]') permissions FROM users u LEFT JOIN user_module_permissions p ON p.user_id=u.id WHERE u.role='admin' GROUP BY u.id ORDER BY u.full_name`); res.json({ success: true, admins: q.rows }) }));
router.post('/admins', auth, allow('super_admin'), asyncHandler(async (req, res) => { const b = req.body || {}; if (!b.login_id || !b.full_name || String(b.password || '').length < 6 || b.password !== b.confirm_password) return res.status(400).json({ success: false, message: 'Name, user ID, minimum 6 character password and matching confirmation are required' }); const q = await pool.query(`INSERT INTO users(login_id,password_hash,full_name,role) VALUES($1,$2,$3,'admin') RETURNING id,login_id,full_name,role,is_active`, [String(b.login_id).trim().toLowerCase(), await bcrypt.hash(String(b.password), 12), String(b.full_name).trim()]); res.status(201).json({ success: true, admin: q.rows[0] }) }));
router.patch('/admins/:id', auth, allow('super_admin'), asyncHandler(async (req, res) => { const b = req.body || {}; if (b.password && (String(b.password).length < 6 || b.password !== b.confirm_password)) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters and confirmation must match' }); const hash = b.password ? await bcrypt.hash(String(b.password), 12) : null, q = await pool.query(`UPDATE users SET full_name=COALESCE($1,full_name),is_active=COALESCE($2,is_active),password_hash=COALESCE($3,password_hash),password_change_required=CASE WHEN $3 IS NULL THEN password_change_required ELSE TRUE END,updated_at=NOW() WHERE id=$4 AND role='admin' RETURNING id,login_id,full_name,is_active`, [b.full_name || null, b.is_active, hash, req.params.id]); if (!q.rowCount) return res.status(404).json({ success: false, message: 'Admin not found' }); res.json({ success: true, admin: q.rows[0] }) }));
router.put('/admins/:id/permissions', auth, allow('super_admin'), asyncHandler(async (req, res) => { const keys = [...new Set((req.body?.permissions || []).map(String))], c = await pool.connect(); try { await c.query('BEGIN'); if (!(await c.query("SELECT 1 FROM users WHERE id=$1 AND role='admin'", [req.params.id])).rowCount) throw new Error('Admin not found'); await c.query('DELETE FROM user_module_permissions WHERE user_id=$1', [req.params.id]); for (const k of keys) await c.query('INSERT INTO user_module_permissions(user_id,module_key) VALUES($1,$2)', [req.params.id, k]); await c.query('COMMIT'); res.json({ success: true, permissions: keys }) } catch (e) { await c.query('ROLLBACK'); res.status(400).json({ success: false, message: e.message }) } finally { c.release() } }));
router.get('/settings', auth, allow('super_admin'), asyncHandler(async (req, res) => { const q = await pool.query('SELECT setting_key,setting_value,updated_at FROM app_settings ORDER BY setting_key'); res.json({ success: true, settings: q.rows }) }));
router.put('/settings/:key', auth, allow('super_admin'), asyncHandler(async (req, res) => { const q = await pool.query(`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW() RETURNING *`, [req.params.key, String(req.body?.value || '')]); res.json({ success: true, setting: q.rows[0] }) }));
function formatAuditItem(row, index) {
  const p = String(row.path || '').toLowerCase();
  const m = String(row.method || 'POST').toUpperCase();
  const userName = row.full_name || row.login_id || 'System';
  let actionType = 'System Action';
  let icon = '⚙️';
  let desc = `${m} ${row.path} by ${userName}`;

  if (p.includes('/routines/review-notes')) {
    actionType = 'Routine Review';
    icon = '📝';
    desc = `Routine Review Note ${m === 'POST' ? 'Submitted' : m === 'PATCH' ? 'Resolved' : 'Updated'} by ${userName}`;
  } else if (p.includes('/routines')) {
    actionType = 'Routine Manager';
    icon = '📅';
    const grp = row.details?.group || row.details?.group_name || '';
    const dt = row.details?.date || row.details?.routine_date || '';
    desc = `Routine ${grp ? `[${grp}] ` : ''}${dt ? `(${dt}) ` : ''}Saved by ${userName}`.trim();
  } else if (p.includes('/teachers/attendance')) {
    actionType = 'Staff Attendance';
    icon = '📋';
    desc = `Staff Attendance Marked by ${userName}`;
  } else if (p.includes('/attendance')) {
    actionType = 'Student Attendance';
    icon = '📋';
    desc = `Student Attendance Submitted by ${userName}`;
  } else if (p.includes('/gate-passes')) {
    actionType = 'Gate Pass';
    icon = '🎫';
    const sid = row.details?.student_id ? `for Student #${row.details.student_id}` : '';
    desc = `Gate Pass ${m === 'DELETE' ? 'Cancelled' : 'Issued'} ${sid} by ${userName}`.trim();
  } else if (p.includes('/service-panels/dining') || p.includes('/dining')) {
    actionType = 'Dining Stock In';
    icon = '🍲';
    const dt = row.details?.date || row.details?.stock_date || '';
    desc = `Dining Stock In ${dt ? `(${dt}) ` : ''}Submitted by ${userName}`.trim();
  } else if (p.includes('/service-panels/library') || p.includes('/library')) {
    actionType = 'Library Activity';
    icon = '📚';
    desc = `Library Book Activity Updated by ${userName}`;
  } else if (p.includes('/rooms')) {
    actionType = 'Hostel Room';
    icon = '🏢';
    const sid = row.details?.student_id ? `for Student #${row.details.student_id}` : '';
    desc = `Hostel Room Assigned ${sid} by ${userName}`.trim();
  } else if (p.includes('/terminal-exams') || p.includes('/marks')) {
    actionType = 'Exam & Marks';
    icon = '🎓';
    desc = `Exam Marks / Records Submitted by ${userName}`;
  } else if (p.includes('/deposit-fund')) {
    actionType = 'Deposit Fund';
    icon = '💰';
    desc = `Deposit Fund Transaction Recorded by ${userName}`;
  } else if (p.includes('/dues') || p.includes('/fees')) {
    actionType = 'Student Fees / Dues';
    icon = '💳';
    desc = `Fees / Dues Record Updated by ${userName}`;
  } else if (p.includes('/bank-matcher')) {
    actionType = 'Bank Statement';
    icon = '🏦';
    desc = `Bank Statement Reconciled by ${userName}`;
  } else if (p.includes('/visits')) {
    actionType = 'Guardian Visit';
    icon = '👥';
    desc = `Guardian Visit Permission Recorded by ${userName}`;
  } else if (p.includes('/notices')) {
    actionType = 'Notice Board';
    icon = '📢';
    desc = `Notice Published / Updated by ${userName}`;
  } else if (p.includes('/system-admin/admins') && p.includes('/permissions')) {
    actionType = 'Admin Permissions';
    icon = '🔑';
    desc = `Admin Permissions Updated by ${userName}`;
  } else if (p.includes('/system-admin/admins')) {
    actionType = 'Admin Management';
    icon = '👤';
    const target = row.details?.full_name || row.details?.login_id ? `(${row.details.full_name || row.details.login_id})` : '';
    desc = `Admin User ${m === 'POST' ? 'Created' : 'Updated'} ${target} by ${userName}`.trim();
  } else if (p.includes('/change-password') || p.includes('/password-reset') || p.includes('/set-mpin')) {
    actionType = 'Security / MPIN';
    icon = '🔒';
    desc = `Security / Password Updated by ${userName}`;
  } else if (p.includes('/teachers')) {
    actionType = 'Staff Management';
    icon = '👨‍🏫';
    desc = `Staff Profile / Record Updated by ${userName}`;
  } else if (p.includes('/students')) {
    actionType = 'Student Management';
    icon = '🎒';
    desc = `Student Profile Updated by ${userName}`;
  }

  const d = new Date(row.created_at);
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mins = pad(d.getMinutes());
  const timestamp = `${day}/${month}/${year} ${pad(hours)}:${mins} ${ampm}`;

  return {
    sl: index + 1,
    token: `#${row.id}`,
    initiator_badge: `#${row.user_id || '0000'}`,
    initiator_name: userName,
    action_type: actionType,
    icon,
    audit_description: desc,
    timestamp,
    raw_time: row.created_at
  };
}

router.get('/audit', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await ready;
  const vals = [], where = [];
  if (req.query.user_id) {
    vals.push(req.query.user_id);
    where.push(`a.user_id=$${vals.length}`);
  }
  const q = await pool.query(`SELECT a.*,u.login_id,u.full_name FROM admin_audit_logs a LEFT JOIN users u ON u.id=a.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.created_at DESC LIMIT 100`, vals);
  const formatted = q.rows.map(formatAuditItem);
  res.json({ success: true, logs: q.rows, formattedLogs: formatted });
}));

router.get('/action-history-audit', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await ready;
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || 10, 10)));
  const q = await pool.query(`SELECT a.id, a.user_id, COALESCE(u.full_name, u.login_id, 'System') as full_name, u.login_id, a.method, a.path, a.status_code, a.details, a.created_at FROM admin_audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT $1`, [limit]);
  const formatted = q.rows.map(formatAuditItem);
  res.json({ success: true, activities: formatted, count: formatted.length });
}));
router.get('/office-activity', auth, allow('super_admin', 'admin'), asyncHandler(async (req, res) => { await ready; const date = String(req.query.date || new Date().toISOString().slice(0, 10)); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: 'Valid date is required' }); const q = await pool.query(`SELECT a.*,u.login_id,u.full_name FROM office_activity_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.created_at::date=$1 ORDER BY a.created_at DESC LIMIT 1000`, [date]); res.json({ success: true, date, logs: q.rows }) }));
router.get('/guardian-activity', auth, allow('super_admin'), asyncHandler(async (req, res) => { const q = await pool.query(`SELECT gls.id,u.login_id,u.full_name,gls.device_id,gls.is_active,gls.last_login_at,gls.logged_out_at,gls.expires_at,COUNT(DISTINCT sg.student_id)::int AS student_count,COALESCE(json_agg(DISTINCT jsonb_build_object('student_name',st.student_name,'registration_no',st.registration_no,'class_name',st.class_name)) FILTER(WHERE st.id IS NOT NULL),'[]'::json) AS students FROM guardian_login_sessions gls JOIN users u ON u.id=gls.user_id LEFT JOIN guardian_profiles gp ON gp.user_id=u.id LEFT JOIN student_guardians sg ON sg.guardian_id=gp.id LEFT JOIN students st ON st.id=sg.student_id WHERE u.role='guardian' GROUP BY gls.id,u.login_id,u.full_name,gls.device_id,gls.is_active,gls.last_login_at,gls.logged_out_at,gls.expires_at ORDER BY gls.last_login_at DESC LIMIT 1000`); res.json({ success: true, guardian_activity: q.rows }) }));
router.get('/backup', auth, allow('super_admin'), asyncHandler(async (req, res) => { const names = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(x => x.tablename), data = { version: 1, created_at: new Date().toISOString(), tables: {} }; for (const name of names) data.tables[name] = (await pool.query(`SELECT * FROM "${name.replace(/"/g, '')}"`)).rows; res.setHeader('Content-Disposition', `attachment; filename="al-ameen-backup-${new Date().toISOString().slice(0, 10)}.json"`); res.json(data) }));
router.post('/restore', auth, allow('super_admin'), asyncHandler(async (req, res) => { if (req.body?.confirmation !== 'RESTORE_DATABASE') return res.status(400).json({ success: false, message: 'Type RESTORE_DATABASE to confirm' }); if (!req.body?.backup?.tables) return res.status(400).json({ success: false, message: 'Invalid backup' }); res.status(501).json({ success: false, message: 'Restore requires maintenance mode. Backup validated; no data changed.' }) }));
router.get('/dashboard-overview', auth, allow('super_admin', 'admin', 'teacher', 'staff', 'office'), asyncHandler(async (req, res) => {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const studentRows = (await pool.query(`
    SELECT 
      COALESCE(class_name,'Other') as class_name,
      COUNT(*) FILTER (WHERE gender ILIKE 'male')::int as male,
      COUNT(*) FILTER (WHERE gender ILIKE 'female')::int as female,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE is_orphan = true)::int as orphan,
      COUNT(*) FILTER (WHERE is_handicapped = true)::int as d_able,
      COUNT(*) FILTER (WHERE caste_name ILIKE '%general%')::int as general,
      COUNT(*) FILTER (WHERE caste_name ILIKE '%obc%')::int as obc
    FROM students
    WHERE is_active = true
    GROUP BY class_name
    ORDER BY 
      CASE class_name
        WHEN 'V' THEN 1
        WHEN 'VI' THEN 2
        WHEN 'VII' THEN 3
        WHEN 'VIII' THEN 4
        WHEN 'IX' THEN 5
        WHEN 'X' THEN 6
        WHEN 'XI' THEN 7
        WHEN 'XI-Sc.' THEN 7
        WHEN 'XII' THEN 8
        WHEN 'XII-Sc.' THEN 8
        ELSE 9
      END
  `)).rows;

  const exitRows = (await pool.query(`
    SELECT 
      COALESCE(class_name,'Other') as class_name,
      COUNT(*) FILTER (WHERE tc_issued_at IS NOT NULL)::int as pass_out,
      COUNT(*) FILTER (WHERE tc_issued_at IS NULL)::int as drop_out
    FROM students s
    LEFT JOIN student_exit_records e ON e.student_id = s.id
    WHERE s.is_active = false
    GROUP BY class_name
  `)).rows;

  const exitMap = {};
  exitRows.forEach(r => { exitMap[r.class_name] = r; });
  const demographics = studentRows.map(r => ({
    ...r,
    pass_out: exitMap[r.class_name]?.pass_out || 0,
    drop_out: exitMap[r.class_name]?.drop_out || 0
  }));

  const staffRows = (await pool.query(`
    WITH target_date AS (
      SELECT COALESCE(
        (SELECT MAX(attendance_date) FROM staff_attendance WHERE attendance_date = $1),
        (SELECT MAX(attendance_date) FROM staff_attendance)
      ) as d
    ),
    classified_staff AS (
      SELECT 
        t.id,
        t.gender,
        CASE 
          WHEN (
            LOWER(TRIM(COALESCE(t.profile_details->>'residential_type',''))) = 'guest'
            OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_role',''))) ILIKE '%guest%'
            OR LOWER(TRIM(COALESCE(t.profile_details->>'type_of_staff',''))) ILIKE '%guest%'
            OR LOWER(TRIM(COALESCE(t.designation,''))) ILIKE '%guest%'
          ) THEN 'Guest Teacher'
          WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('teacher','teachers') THEN 'Teaching Staff'
          WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%management%' THEN 'Management Staff'
          WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%account%' THEN 'Account Staff'
          WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%office%' THEN 'Office Staff'
          WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%kitchen%' OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%cook%' THEN 'Cook & Helper'
          WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%security%' THEN 'Security'
          WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('nonteaching','non-teaching') THEN 'Non Teaching Staff'
          ELSE 'Other Staff'
        END as role
      FROM teachers t
      WHERE t.is_active = true
    )
    SELECT 
      cs.role,
      COUNT(*) FILTER (WHERE cs.gender ILIKE 'male' OR cs.gender IS NULL)::int as male,
      COUNT(*) FILTER (WHERE cs.gender ILIKE 'female')::int as female,
      COUNT(*)::int as total,
      COUNT(a.teacher_id) FILTER (WHERE a.status = 'Present')::int as present,
      COUNT(a.teacher_id) FILTER (WHERE a.status = 'Absent')::int as absent,
      COUNT(a.teacher_id) FILTER (WHERE a.status IN ('Leave', 'Late'))::int as leave,
      (SELECT to_char(d, 'DD/MM/YYYY') FROM target_date) as att_date
    FROM classified_staff cs
    LEFT JOIN staff_attendance a ON a.teacher_id = cs.id AND a.attendance_date = (SELECT d FROM target_date)
    GROUP BY cs.role
    ORDER BY 
      CASE cs.role
        WHEN 'Teaching Staff' THEN 1
        WHEN 'Cook & Helper' THEN 2
        WHEN 'Other Staff' THEN 3
        WHEN 'Office Staff' THEN 4
        WHEN 'Management Staff' THEN 5
        WHEN 'Security' THEN 6
        WHEN 'Guest Teacher' THEN 7
        ELSE 8
      END
  `, [todayStr])).rows;

  const gatePassRows = (await pool.query(`
    WITH class_list AS (
      SELECT unnest(ARRAY['V','VI','VII','VIII','IX','X','XI-Sc.','XII-Sc.']) AS class_name
    ),
    gate_counts AS (
      SELECT 
        s.class_name,
        COUNT(*) FILTER (WHERE gp.created_at::date = $1 OR gp.departure_at::date = $1)::int as issued,
        COUNT(*) FILTER (WHERE gp.status = 'pending' AND gp.returned_at IS NULL)::int as active,
        COUNT(*) FILTER (WHERE gp.status = 'pending' AND gp.returned_at IS NULL AND gp.expected_return_at < NOW())::int as expired
      FROM student_gate_passes gp
      JOIN students s ON s.id = gp.student_id
      GROUP BY s.class_name
    )
    SELECT 
      c.class_name,
      COALESCE(g.issued, 0) as issued,
      COALESCE(g.active, 0) as active,
      COALESCE(g.expired, 0) as expired
    FROM class_list c
    LEFT JOIN gate_counts g ON (g.class_name = c.class_name OR (c.class_name = 'XI-Sc.' AND g.class_name IN ('XI','XI-Sc.')) OR (c.class_name = 'XII-Sc.' AND g.class_name IN ('XII','XII-Sc.')))
    ORDER BY 
      CASE c.class_name
        WHEN 'V' THEN 1
        WHEN 'VI' THEN 2
        WHEN 'VII' THEN 3
        WHEN 'VIII' THEN 4
        WHEN 'IX' THEN 5
        WHEN 'X' THEN 6
        WHEN 'XI-Sc.' THEN 7
        WHEN 'XII-Sc.' THEN 8
      END
  `, [todayStr])).rows;

  const attendanceRows = (await pool.query(`
    WITH target_date AS (
      SELECT COALESCE(
        (SELECT MAX(attendance_date) FROM staff_attendance WHERE attendance_date = $1),
        (SELECT MAX(attendance_date) FROM staff_attendance)
      ) as d
    )
    SELECT 
      CASE 
        WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('teacher','teachers') THEN 'Teaching'
        WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%management%' THEN 'Management'
        WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%account%' THEN 'Account'
        WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%office%' THEN 'Office'
        WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%kitchen%' OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%cook%' THEN 'Cook & Helper'
        WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) ILIKE '%security%' THEN 'Security'
        ELSE 'Other'
      END as role,
      COUNT(a.teacher_id)::int as total,
      COUNT(*) FILTER (WHERE a.status = 'Present')::int as present,
      COUNT(*) FILTER (WHERE a.status = 'Absent')::int as absent,
      COUNT(*) FILTER (WHERE a.status IN ('Leave', 'Late'))::int as leave,
      (SELECT to_char(d, 'DD/MM/YYYY') FROM target_date) as att_date
    FROM teachers t
    JOIN staff_attendance a ON a.teacher_id = t.id AND a.attendance_date = (SELECT d FROM target_date)
    WHERE t.is_active = true
    GROUP BY 1
    ORDER BY total DESC
  `, [todayStr])).rows;

  const missingStudentDocs = (await pool.query(`
    SELECT id, registration_no, student_name, class_name,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN (photo_url IS NULL OR photo_url = '') 
                  AND NOT EXISTS (SELECT 1 FROM student_documents sd WHERE sd.student_id = students.id AND sd.document_type = 'photo') 
             THEN 'Photo' ELSE NULL END,
        CASE WHEN (aadhaar_no IS NULL OR aadhaar_no = '' OR aadhaar_no = '0') 
                  AND NOT EXISTS (SELECT 1 FROM student_documents sd WHERE sd.student_id = students.id AND sd.document_type = 'aadhaar') 
             THEN 'Aadhaar' ELSE NULL END,
        CASE WHEN (bank_account_no IS NULL OR bank_account_no = '' OR bank_account_no = '0') 
                  AND NOT EXISTS (SELECT 1 FROM student_documents sd WHERE sd.student_id = students.id AND sd.document_type = 'bank_passbook') 
             THEN 'Passbook' ELSE NULL END
      ], NULL) as missing
    FROM students
    WHERE is_active = true AND (
      ((photo_url IS NULL OR photo_url = '') AND NOT EXISTS (SELECT 1 FROM student_documents sd WHERE sd.student_id = students.id AND sd.document_type = 'photo'))
      OR ((aadhaar_no IS NULL OR aadhaar_no = '' OR aadhaar_no = '0') AND NOT EXISTS (SELECT 1 FROM student_documents sd WHERE sd.student_id = students.id AND sd.document_type = 'aadhaar'))
      OR ((bank_account_no IS NULL OR bank_account_no = '' OR bank_account_no = '0') AND NOT EXISTS (SELECT 1 FROM student_documents sd WHERE sd.student_id = students.id AND sd.document_type = 'bank_passbook'))
    )
    ORDER BY registration_no
    LIMIT 10
  `)).rows;

  const missingStaffDocs = (await pool.query(`
    WITH staff_docs AS (
      SELECT 
        t.id,
        t.staff_id,
        t.name,
        t.designation,
        (CASE 
          WHEN (t.photo_url IS NOT NULL AND t.photo_url != '') 
               OR EXISTS (SELECT 1 FROM teacher_documents td WHERE td.teacher_id = t.id AND td.document_type IN ('photo', 'identity_proof'))
          THEN true ELSE false 
        END) AS has_photo,
        (CASE 
          WHEN (t.profile_details->>'aadhaar_no' IS NOT NULL AND t.profile_details->>'aadhaar_no' NOT IN ('', '0'))
               OR EXISTS (SELECT 1 FROM teacher_documents td WHERE td.teacher_id = t.id AND td.document_type = 'aadhaar')
          THEN true ELSE false 
        END) AS has_aadhaar,
        (CASE 
          WHEN (t.profile_details->>'voter_no' IS NOT NULL AND t.profile_details->>'voter_no' NOT IN ('', '0'))
               OR EXISTS (SELECT 1 FROM teacher_documents td WHERE td.teacher_id = t.id AND td.document_type = 'voter_id')
          THEN true ELSE false 
        END) AS has_voter,
        (CASE 
          WHEN (t.profile_details->>'account_no' IS NOT NULL AND t.profile_details->>'account_no' NOT IN ('', '0'))
               OR EXISTS (SELECT 1 FROM teacher_documents td WHERE td.teacher_id = t.id AND td.document_type IN ('bank_passbook', 'passbook'))
          THEN true ELSE false 
        END) AS has_bank,
        (CASE 
          WHEN (t.profile_details->>'pan_no' IS NOT NULL AND t.profile_details->>'pan_no' NOT IN ('', '0'))
               OR EXISTS (SELECT 1 FROM teacher_documents td WHERE td.teacher_id = t.id AND td.document_type = 'pan_card')
          THEN true ELSE false 
        END) AS has_pan
      FROM teachers t
      WHERE t.is_active = true
    )
    SELECT 
      id, staff_id, name, designation,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN NOT has_photo THEN 'Photo' ELSE NULL END,
        CASE WHEN NOT has_aadhaar THEN 'Aadhaar' ELSE NULL END,
        CASE WHEN NOT has_voter THEN 'Voter ID' ELSE NULL END,
        CASE WHEN NOT has_bank THEN 'Passbook' ELSE NULL END,
        CASE WHEN NOT has_pan THEN 'PAN Card' ELSE NULL END
      ], NULL) as missing
    FROM staff_docs
    WHERE NOT (has_photo AND has_aadhaar AND has_voter AND has_bank AND has_pan)
    ORDER BY id
    LIMIT 10
  `)).rows;

  const recentAuditRows = (await pool.query(`
    SELECT a.id, a.user_id, COALESCE(u.full_name, u.login_id, 'System') as full_name, u.login_id,
           a.method, a.path, a.status_code, a.details, a.created_at
    FROM admin_audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT 10
  `)).rows;
  const actionHistoryAudit = recentAuditRows.map(formatAuditItem);

  res.json({
    success: true,
    today: todayStr,
    attendanceDate: attendanceRows[0]?.att_date || todayStr,
    studentDemographics: demographics,
    staffDistribution: staffRows,
    gatePassSummary: gatePassRows,
    staffAttendance: attendanceRows,
    missingStudentDocs,
    missingStaffDocs,
    actionHistoryAudit
  });
}));

module.exports = router;
