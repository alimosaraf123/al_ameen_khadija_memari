require('dotenv').config();
const pool = require('../src/db');

async function main() {
  const newName = 'Gateman 4';
  
  // Update users table
  const uRes = await pool.query(
    "UPDATE users SET full_name = $1, photo_url = NULL WHERE login_id = 'gateman04' RETURNING id, login_id, full_name, photo_url",
    [newName]
  );
  console.log('Updated users:', uRes.rows);

  const userId = uRes.rows[0]?.id;
  if (userId) {
    // Update service_staff_profiles table
    const sRes = await pool.query(
      "UPDATE service_staff_profiles SET name = $1, photo_url = NULL WHERE user_id = $2 OR staff_id = 'GATE-004' RETURNING id, staff_id, name, photo_url",
      [newName, userId]
    );
    console.log('Updated service_staff_profiles:', sRes.rows);
  }

  await pool.end();
  console.log('Successfully updated gateman04 to:', newName);
}

main().catch(console.error);
