const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'routes', 'servicePanels.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add schema for gate_duty_logs and staff_attendance columns if not present
const schemaAdditions = `
CREATE TABLE IF NOT EXISTS gate_duty_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  staff_id VARCHAR(100),
  staff_name VARCHAR(150),
  duty_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'on_duty',
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gate_duty_logs_date ON gate_duty_logs(duty_date, user_id);
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS punch_in TIMESTAMPTZ;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS punch_out TIMESTAMPTZ;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS remark TEXT;
`;

if (!code.includes('CREATE TABLE IF NOT EXISTS gate_duty_logs')) {
  code = code.replace(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;' + schemaAdditions
  );
}

// 2. Add Gate Duty Routes
const gateDutyRoutes = `
// ==========================================
// GATE DUTY & STAFF ATTENDANCE INTEGRATION
// ==========================================

router.get('/gate-duty/status', auth, allow('gateman','super_admin','admin'), asyncHandler(async(req,res)=>{
  await schemaReady;
  const userId = req.user.userId;
  const todayDuty = (await pool.query(
    "SELECT * FROM gate_duty_logs WHERE user_id = $1 AND duty_date = CURRENT_DATE ORDER BY start_time DESC LIMIT 1",
    [userId]
  )).rows[0] || null;

  const staff = (await pool.query(
    "SELECT p.* FROM service_staff_profiles p WHERE p.user_id = $1 LIMIT 1",
    [userId]
  )).rows[0];

  let attendanceStatus = null;
  if (staff) {
    const t = (await pool.query(
      "SELECT id FROM teachers WHERE staff_id = $1 OR user_id = $2 LIMIT 1",
      [staff.staff_id, userId]
    )).rows[0];
    if (t) {
      const att = (await pool.query(
        "SELECT status, punch_in, punch_out FROM staff_attendance WHERE teacher_id = $1 AND attendance_date = CURRENT_DATE",
        [t.id]
      )).rows[0];
      if (att) attendanceStatus = att.status;
    }
  }

  res.json({
    success: true,
    on_duty: !!(todayDuty && todayDuty.status === 'on_duty' && !todayDuty.end_time),
    duty: todayDuty,
    attendance: attendanceStatus,
    start_time: todayDuty?.start_time || null
  });
}));

router.post('/gate-duty/start', auth, allow('gateman','super_admin','admin'), asyncHandler(async(req,res)=>{
  await schemaReady;
  const userId = req.user.userId;

  // 1. Get staff info
  let staff = (await pool.query(
    "SELECT p.*, u.full_name, u.login_id FROM service_staff_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1",
    [userId]
  )).rows[0];

  if (!staff) {
    const u = (await pool.query("SELECT * FROM users WHERE id = $1", [userId])).rows[0];
    staff = { user_id: userId, staff_id: u?.login_id, name: u?.full_name || 'Gateman' };
  }

  // 2. Find or create in teachers table so it connects to staff_attendance
  let teacher = (await pool.query(
    "SELECT id FROM teachers WHERE staff_id = $1 OR user_id = $2 LIMIT 1",
    [staff.staff_id, userId]
  )).rows[0];

  if (!teacher) {
    teacher = (await pool.query(
      "INSERT INTO teachers(staff_id, name, designation, is_active, user_id, profile_details) VALUES($1, $2, 'Security Guard', TRUE, $3, $4::jsonb) RETURNING id",
      [staff.staff_id, staff.name, userId, JSON.stringify({ staff_type: 'Security Guard', staff_category: 'Nonteaching' })]
    )).rows[0];
  }

  // 3. Mark in staff_attendance as 'Present'
  if (teacher?.id) {
    await pool.query(\`
      INSERT INTO staff_attendance(teacher_id, attendance_date, status, marked_by, punch_in, remark, updated_at)
      VALUES($1, CURRENT_DATE, 'Present', $2, NOW(), 'Gate Duty Start', NOW())
      ON CONFLICT(teacher_id, attendance_date)
      DO UPDATE SET status = 'Present', punch_in = COALESCE(staff_attendance.punch_in, NOW()), remark = 'Gate Duty Start', updated_at = NOW()
    \`, [teacher.id, userId]);
  }

  // 4. Record in gate_duty_logs
  let duty = (await pool.query(
    "SELECT * FROM gate_duty_logs WHERE user_id = $1 AND duty_date = CURRENT_DATE AND status = 'on_duty' ORDER BY start_time DESC LIMIT 1",
    [userId]
  )).rows[0];

  if (!duty) {
    duty = (await pool.query(
      "INSERT INTO gate_duty_logs(user_id, staff_id, staff_name, duty_date, start_time, status) VALUES($1, $2, $3, CURRENT_DATE, NOW(), 'on_duty') RETURNING *",
      [userId, staff.staff_id, staff.name]
    )).rows[0];
  }

  res.json({
    success: true,
    message: 'Gate duty started! Attendance marked as Present.',
    duty,
    attendance: 'Present',
    start_time: duty.start_time
  });
}));

router.post('/gate-duty/end', auth, allow('gateman','super_admin','admin'), asyncHandler(async(req,res)=>{
  await schemaReady;
  const userId = req.user.userId;

  const duty = (await pool.query(
    "UPDATE gate_duty_logs SET end_time = NOW(), status = 'completed' WHERE user_id = $1 AND duty_date = CURRENT_DATE AND status = 'on_duty' RETURNING *",
    [userId]
  )).rows[0];

  const staff = (await pool.query(
    "SELECT p.* FROM service_staff_profiles p WHERE p.user_id = $1 LIMIT 1",
    [userId]
  )).rows[0];

  if (staff) {
    const t = (await pool.query(
      "SELECT id FROM teachers WHERE staff_id = $1 OR user_id = $2 LIMIT 1",
      [staff.staff_id, userId]
    )).rows[0];
    if (t) {
      await pool.query(
        "UPDATE staff_attendance SET punch_out = NOW(), updated_at = NOW() WHERE teacher_id = $1 AND attendance_date = CURRENT_DATE",
        [t.id]
      );
    }
  }

  res.json({
    success: true,
    message: 'Gate duty ended successfully.',
    duty
  });
}));
`;

if (!code.includes("router.post('/gate-duty/start'")) {
  code += "\n" + gateDutyRoutes;
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched servicePanels.js with gate duty routes');
