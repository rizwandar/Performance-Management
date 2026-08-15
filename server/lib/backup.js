const zlib = require('zlib');
const { queryAll } = require('../db/database');
const { uploadFile, listKeys, deleteFile } = require('./r2');

// dev/staging/production currently share one R2 bucket (SEC finding, tracked
// for a full fix via separate buckets per environment). Until that lands,
// namespace backups per environment so retention counts can't mix across
// them - without this, one environment's backup run can prune another
// environment's real backups out of its own retention window. Same env
// signal used for Sentry tagging (see instrument.js): NODE_ENV is unreliable
// since Render sets it to 'production' on every service, staging included.
const ENVIRONMENT = process.env.RENDER_SERVICE_NAME || process.env.NODE_ENV || 'development';
const BACKUP_PREFIX = `backups/${ENVIRONMENT}/`;
const RETENTION_COUNT = 14; // keep the last 14 daily backups, per environment

async function getTableNames() {
  const rows = await queryAll(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map(r => r.table_name);
}

async function dumpAllTables() {
  const tables = await getTableNames();
  const dump = {};
  for (const table of tables) {
    dump[table] = await queryAll(`SELECT * FROM "${table}"`);
  }
  return dump;
}

/**
 * Dumps every table in the public schema to a single gzipped JSON file
 * in R2, then prunes old backups beyond the retention count.
 */
async function runBackup() {
  const tables = await dumpAllTables();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = JSON.stringify({ timestamp, tables });
  const buffer = zlib.gzipSync(Buffer.from(payload, 'utf8'));
  const key = `${BACKUP_PREFIX}backup-${timestamp}.json.gz`;

  await uploadFile({ key, buffer, mimeType: 'application/gzip' });

  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length])
  );

  console.log(`[backup] Wrote ${key} (${buffer.length} bytes, ${Object.keys(tables).length} tables)`);

  const pruned = await pruneOldBackups();

  return { key, sizeBytes: buffer.length, rowCounts, pruned };
}

/**
 * Keeps only the most recent RETENTION_COUNT backups, deleting the rest.
 * Backup keys are named with a sortable ISO-based timestamp, so a
 * reverse lexicographic sort puts the newest first.
 */
async function pruneOldBackups() {
  const keys = await listKeys(BACKUP_PREFIX);
  const sorted = [...keys].sort().reverse();
  const toDelete = sorted.slice(RETENTION_COUNT);
  for (const key of toDelete) {
    await deleteFile(key);
    console.log(`[backup] Pruned old backup ${key}`);
  }
  return toDelete;
}

async function listBackups() {
  const keys = await listKeys(BACKUP_PREFIX);
  return [...keys].sort().reverse();
}

module.exports = { runBackup, pruneOldBackups, listBackups, dumpAllTables };
