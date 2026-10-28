require('dotenv').config();
const fs = require('fs');
const pool = require('../src/db');
const { uploadBuffer } = require('../src/utils/cloudStorage');

async function main() {
  const photoPath = 'd:/memari_soft/al_ameen_backend_new/uploads/staff/aparna_mondal.jpg';
  const buffer = fs.readFileSync(photoPath);
  console.log('Uploading photo to Cloudinary...');
  const res = await uploadBuffer(buffer, {
    folder: 'staff',
    publicId: 'aparna_mondal',
    resourceType: 'image',
    contentType: 'image/jpeg',
  });
  console.log('Uploaded successfully! URL:', res.url);

  // Update in DB
  await pool.query("UPDATE users SET photo_url = $1 WHERE role = 'gateman'", [res.url]);
  await pool.query("UPDATE service_staff_profiles SET photo_url = $1 WHERE staff_role = 'gateman'", [res.url]);
  console.log('Updated users & service_staff_profiles with Cloudinary URL:', res.url);
  await pool.end();
}

main().catch(console.error);
