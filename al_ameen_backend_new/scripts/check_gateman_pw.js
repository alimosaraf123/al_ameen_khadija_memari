require('dotenv').config();
const pool = require('../src/db');
const bcrypt = require('bcryptjs');

async function main() {
  const users = (await pool.query("SELECT id, login_id, role, password_hash FROM users WHERE role = 'gateman' OR login_id LIKE 'gate%'")).rows;
  console.log('Gatemen found:', users.map(u => ({ id: u.id, login_id: u.login_id })));
  
  const pwList = ['123456', '12345678', 'gateman', 'gateman123', 'admin', 'password', '786786'];
  for (const u of users) {
    let matched = null;
    for (const p of pwList) {
      if (await bcrypt.compare(p, u.password_hash)) {
        matched = p;
        break;
      }
    }
    console.log(`User ${u.login_id}: password = ${matched || 'UNKNOWN'}`);
  }
  await pool.end();
}
main().catch(console.error);
