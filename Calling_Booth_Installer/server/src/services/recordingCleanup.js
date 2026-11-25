const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { deleteCloudinaryUrl } = require('../utils/cloudStorage');

const RETENTION_DAYS = parseInt(process.env.RECORDING_RETENTION_DAYS || '90', 10);
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run once every 24 hours

async function cleanupExpiredCallRecordings() {
  try {
    const { rows } = await pool.query(
      `SELECT id, recording_url, created_at
       FROM call_logs
       WHERE recording_url IS NOT NULL
         AND recording_url <> ''
         AND created_at < NOW() - ($1::int * INTERVAL '1 day')
       ORDER BY created_at ASC
       LIMIT 200`,
      [RETENTION_DAYS]
    );

    let deletedCloud = 0;
    let deletedLocal = 0;
    const recordingsRoot = path.resolve(__dirname, '..', '..', 'recordings');

    for (const row of rows) {
      const url = String(row.recording_url || '');
      try {
        if (url.includes('res.cloudinary.com')) {
          const ok = await deleteCloudinaryUrl(url);
          if (ok) deletedCloud++;
        } else {
          const m = url.match(/\/api\/calls\/recordings\/(\d{4}-\d{2}-\d{2})\/([a-zA-Z0-9_.-]+)$/);
          if (m) {
            const localFile = path.resolve(recordingsRoot, m[1], m[2]);
            if (localFile.startsWith(recordingsRoot) && fs.existsSync(localFile)) {
              fs.unlinkSync(localFile);
              deletedLocal++;
            }
          }
        }
        await pool.query(`UPDATE call_logs SET recording_url = NULL WHERE id = $1`, [row.id]);
      } catch (err) {
        console.warn(`[Recording Cleanup] Failed for call_log #${row.id}:`, err.message);
      }
    }

    // Also prune local recordings/YYYY-MM-DD folders older than RETENTION_DAYS
    if (fs.existsSync(recordingsRoot)) {
      const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const entries = fs.readdirSync(recordingsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
        const folderDate = new Date(`${entry.name}T00:00:00Z`);
        if (!Number.isNaN(folderDate.getTime()) && folderDate < cutoffDate) {
          const dirPath = path.join(recordingsRoot, entry.name);
          fs.rmSync(dirPath, { recursive: true, force: true });
          deletedLocal++;
        }
      }
    }

    if (deletedCloud > 0 || deletedLocal > 0) {
      console.log(
        `[Recording Cleanup] Pruned recordings older than ${RETENTION_DAYS} days (Cloud: ${deletedCloud}, Local: ${deletedLocal}).`
      );
    }
  } catch (err) {
    console.warn('[Recording Cleanup] Notice:', err.message);
  }
}

function startRecordingCleanupScheduler() {
  setTimeout(() => {
    cleanupExpiredCallRecordings();
  }, 30 * 1000);
  setInterval(() => {
    cleanupExpiredCallRecordings();
  }, CLEANUP_INTERVAL_MS);
  console.log(`[Recording Cleanup] Auto-delete scheduled for recordings older than ${RETENTION_DAYS} days.`);
}

module.exports = {
  cleanupExpiredCallRecordings,
  startRecordingCleanupScheduler,
};
