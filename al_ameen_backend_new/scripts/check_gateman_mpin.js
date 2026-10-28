const pool = require('../src/db');

async function check() {
  const res = await pool.query("SELECT login_id, role, full_name, (mpin_hash IS NOT NULL) AS has_mpin FROM users WHERE role='gateman' ORDER BY login_id");
  console.table(res.rows);
  pool.end();
}

check().catch(console.error);
