require('dotenv').config();
const pool = require('../src/db');

async function main() {
  const date = '2026-10-28';
  
  // Query staff attendance for 2026-10-28
  const res = await pool.query(`
    SELECT t.id, t.staff_id, t.name, t.designation, a.status, a.punch_in, a.remark
    FROM teachers t
    LEFT JOIN staff_attendance a ON a.teacher_id = t.id AND a.attendance_date = $1
    WHERE t.staff_id IN ('786786', 'GATE-002', 'GATE-003', 'GATE-004')
    ORDER BY t.staff_id
  `, [date]);

  console.log(`Staff Attendance for Gatemen on ${date}:`);
  console.table(res.rows);

  // Check gate_duty_logs
  const dutyLogs = await pool.query(`
    SELECT * FROM gate_duty_logs WHERE duty_date = $1 ORDER BY start_time DESC
  `, [date]);
  console.log('Gate Duty Logs:');
  console.table(dutyLogs.rows);

  await pool.end();
}

main().catch(console.error);
