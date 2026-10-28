const bcrypt = require('bcryptjs');
const pool = require('../src/db');

async function setMpins() {
  const hash = await bcrypt.hash('123456', 10);
  const result = await pool.query(
    "UPDATE users SET mpin_hash=$1 WHERE role='gateman' RETURNING login_id, role, full_name",
    [hash]
  );
  console.log('Successfully set mPIN to 123456 for all gatemen:');
  console.table(result.rows);
  pool.end();
}

setMpins().catch(err => {
  console.error(err);
  process.exit(1);
});
