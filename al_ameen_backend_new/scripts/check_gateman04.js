require('dotenv').config();
const pool = require('../src/db');

async function main() {
  const att = await pool.query("SELECT a.*, t.name, t.staff_id FROM staff_attendance a JOIN teachers t ON t.id = a.teacher_id WHERE a.attendance_date = CURRENT_DATE");
  console.log('TODAY ATTENDANCE:', att.rows);
  await pool.end();
}

main().catch(console.error);
