require('dotenv').config();
const pool = require('../src/db');
const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('123456', 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE role = 'gateman'", [hash]);
  console.log('Updated all gateman passwords to 123456');
  await pool.end();
}
main().catch(console.error);
