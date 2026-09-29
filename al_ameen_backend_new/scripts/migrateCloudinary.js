require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const pool = require('../src/db');
const { uploadBuffer, deleteCloudinaryUrl } = require('../src/utils/cloudStorage');

const backendRoot = path.resolve(__dirname, '..');
const uploadRoot = path.join(backendRoot, 'uploads');

function localPath(fileUrl) {
  const value = String(fileUrl || '');
  if (!value.startsWith('/uploads/')) return null;
  const relative = decodeURIComponent(value.slice('/uploads/'.length)).replace(/\\/g, '/');
  const resolved = path.resolve(uploadRoot, relative);
  if (resolved !== uploadRoot && !resolved.startsWith(uploadRoot + path.sep)) throw new Error('Unsafe local upload path');
  return resolved;
}

async function imageBuffer(filePath, mode) {
  const pipeline = sharp(await fs.readFile(filePath), { failOn: 'error' }).rotate();
  if (mode === 'teacher') pipeline.resize(480, 480, { fit: 'cover', position: 'attention' });
  else if (mode === 'notice') pipeline.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
  else if (mode === 'document') pipeline.resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true });
  else pipeline.resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true });
  return pipeline.webp({ quality: mode === 'document' || mode === 'notice' ? 82 : 78, effort: 4 }).toBuffer();
}

async function migrateAsset(asset) {
  const filePath = localPath(asset.url);
  if (!filePath) return { skipped: true };
  await fs.access(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const isPdf = extension === '.pdf';
  const buffer = isPdf ? await fs.readFile(filePath) : await imageBuffer(filePath, asset.mode);
  const uploaded = await uploadBuffer(buffer, {
    folder: asset.folder,
    resourceType: isPdf ? 'raw' : 'image',
    extension: isPdf ? '.pdf' : '',
    format: isPdf ? undefined : 'webp',
    publicId: asset.prefix + '-' + asset.id + '-' + Date.now(),
  });
  try {
    const result = await pool.query(asset.updateSql, [uploaded.url, asset.id, asset.url]);
    if (!result.rowCount) throw new Error('Database record changed during migration');
    await fs.unlink(filePath);
    return { uploaded };
  } catch (error) {
    await deleteCloudinaryUrl(uploaded.url).catch(() => {});
    throw error;
  }
}

async function rows() {
  const assets = [];
  const documents = await pool.query("SELECT id,file_url FROM student_documents WHERE file_url LIKE '/uploads/%' ORDER BY id");
  for (const row of documents.rows) assets.push({
    id: row.id, url: row.file_url, mode: 'document', folder: 'al-ameen/student-documents',
    prefix: 'document', updateSql: 'UPDATE student_documents SET file_url=$1 WHERE id=$2 AND file_url=$3',
  });
  const students = await pool.query("SELECT id,photo_url FROM students WHERE photo_url LIKE '/uploads/%' ORDER BY id");
  for (const row of students.rows) assets.push({
    id: row.id, url: row.photo_url, mode: 'student', folder: 'al-ameen/student-photos',
    prefix: 'student', updateSql: 'UPDATE students SET photo_url=$1,updated_at=NOW() WHERE id=$2 AND photo_url=$3',
  });
  const teachers = await pool.query("SELECT id,photo_url FROM teachers WHERE photo_url LIKE '/uploads/%' ORDER BY id");
  for (const row of teachers.rows) assets.push({
    id: row.id, url: row.photo_url, mode: 'teacher', folder: 'al-ameen/teacher-photos',
    prefix: 'teacher', updateSql: 'UPDATE teachers SET photo_url=$1 WHERE id=$2 AND photo_url=$3',
  });
  const notices = await pool.query("SELECT id,attachment_url FROM notices WHERE attachment_url LIKE '/uploads/%' ORDER BY id");
  for (const row of notices.rows) assets.push({
    id: row.id, url: row.attachment_url, mode: 'notice', folder: 'al-ameen/notices',
    prefix: 'notice', updateSql: 'UPDATE notices SET attachment_url=$1 WHERE id=$2 AND attachment_url=$3',
  });
  return assets;
}

(async()=>{
  const assets = await rows();
  let migrated = 0, failed = 0;
  console.log('Found ' + assets.length + ' local assets.');
  for (let index = 0; index < assets.length; index++) {
    const asset = assets[index];
    try {
      await migrateAsset(asset);
      migrated++;
      console.log('[' + (index + 1) + '/' + assets.length + '] migrated ' + asset.mode + ' #' + asset.id);
    } catch (error) {
      failed++;
      console.error('[' + (index + 1) + '/' + assets.length + '] failed ' + asset.mode + ' #' + asset.id + ': ' + error.message);
    }
  }
  console.log('Migration complete. Migrated: ' + migrated + ', Failed: ' + failed);
  await pool.end();
  if (failed) process.exitCode = 1;
})().catch(async error => {
  console.error(error.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
