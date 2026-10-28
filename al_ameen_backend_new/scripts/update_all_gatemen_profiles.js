require('dotenv').config();
const pool = require('../src/db');

async function main() {
  const users = (await pool.query("SELECT id, login_id, full_name, photo_url FROM users WHERE role = 'gateman'")).rows;
  console.log('Current users:', users);
  
  // Set photo_url for all gateman users and service_staff_profiles
  await pool.query("UPDATE users SET photo_url = '/uploads/staff/aparna_mondal.jpg' WHERE role = 'gateman' AND (photo_url IS NULL OR photo_url = '')");
  await pool.query("UPDATE service_staff_profiles SET photo_url = '/uploads/staff/aparna_mondal.jpg' WHERE staff_role = 'gateman' AND (photo_url IS NULL OR photo_url = '')");
  
  const staff = (await pool.query("SELECT * FROM service_staff_profiles WHERE staff_role = 'gateman'")).rows;
  console.log('Current staff:', staff);
  await pool.end();
}
main().catch(console.error);
