require('dotenv').config();
const pool = require('../src/db');

async function testDutyStartFor(loginId, password) {
  const loginRes = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: loginId, password }),
  }).then(r => r.json());

  console.log(`\nTesting for ${loginId} (${loginRes.user?.full_name}):`);
  
  const startRes = await fetch('http://localhost:3000/api/service-panels/gate-duty/start', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + loginRes.token },
  }).then(r => r.json());

  console.log('Result:', startRes.message, 'Attendance Status:', startRes.attendance);
}

async function main() {
  await testDutyStartFor('gateman03', '123456');

  // Query updated attendance
  const res = await pool.query(`
    SELECT t.staff_id, t.name, t.designation, a.status, a.punch_in, a.remark
    FROM teachers t
    LEFT JOIN staff_attendance a ON a.teacher_id = t.id AND a.attendance_date = CURRENT_DATE
    WHERE t.staff_id IN ('786786', 'GATE-002', 'GATE-003', 'GATE-004')
    ORDER BY t.staff_id
  `);

  console.log('\nUpdated Staff Attendance in Database:');
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
