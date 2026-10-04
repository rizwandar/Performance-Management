const zlib = require('zlib');
const { queryAll } = require('../db/database');
const { uploadFile, listKeys, deleteFile } = require('./r2');
const { parseBackupKey, encryptBackup, KEY_GENERATION_HINT } = require('./backupCrypto');
const { isLocalDevelopment } = require('./jwtSecret');

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

/**
 * Resolves BACKUP_ENCRYPTION_KEY, failing closed off a developer's machine.
 *
 * Same rule as lib/jwtSecret.js, and for the same reason: anything we cannot
 * positively identify as local development is treated as deployed and must
 * supply its own key. isLocalDevelopment() is imported rather than re-derived
 * so there is one definition of "this is a developer's laptop" in the server.
 *
 * Returns a 32 byte Buffer, or null meaning "local dev with no key configured,
 * write the legacy plaintext format". A deployed environment never gets null:
 * it throws, which fails the whole backup run. That is deliberate. A plaintext
 * backup written under a privacy policy that promises encryption is worse than
 * no backup at all, because a missing backup is noticed and a quietly
 * unencrypted one is not.
 */
function resolveBackupKey() {
  const configured = process.env.BACKUP_ENCRYPTION_KEY;

  // A malformed key is a configuration error anywhere, local dev included.
  // Never fall through to plaintext on it: someone clearly intended to
  // configure encryption and got it slightly wrong, and silence would hide
  // that. parseBackupKey throws with the exact problem and the generator.
  if (configured && configured.trim()) {
    return parseBackupKey(configured);
  }

  if (!isLocalDevelopment()) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY is not set, so this backup was not written.\n' +
      '\n' +
      'This looks like a deployed environment. The nightly backup contains every\n' +
      'table in the database, including medical records and trusted contacts, and\n' +
      'the published privacy policy states that backups are encrypted. Writing a\n' +
      'plaintext copy to R2 instead would make that claim untrue, and anyone with\n' +
      'the R2 credential could read the entire database.\n' +
      '\n' +
      'Generate a key:\n' +
      `  ${KEY_GENERATION_HINT}\n` +
      '\n' +
      'Then set BACKUP_ENCRYPTION_KEY in Infisical for this environment (it syncs\n' +
      'to Render automatically, see CLAUDE.md, Secrets management). Use a different\n' +
      'key per environment, and keep it somewhere you cannot lose it: without the\n' +
      'key, every backup written with it is permanently unrecoverable.'
    );
  }

  console.warn(
    '[backup] BACKUP_ENCRYPTION_KEY is not set. Writing an UNENCRYPTED backup.\n' +
    '         This is allowed only because this looks like a local development\n' +
    '         machine. The file is named .json.gz rather than .json.gz.enc so it\n' +
    '         is obvious which it is. Any deployed environment refuses to write a\n' +
    `         backup at all without a key. Set one locally too:\n` +
    `           ${KEY_GENERATION_HINT}`
  );
  return null;
}

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
 * Dumps every table in the public schema to a single gzipped, encrypted JSON
 * file in R2, then prunes old backups beyond the retention count.
 *
 * Read it back with: node server/scripts/decrypt-backup.mjs <downloaded file>
 * There is no in-app restore path, so that script is the only thing that can
 * open one of these. Do not change the format without changing it too.
 */
async function runBackup() {
  // Resolved before the dump, not after. If the key is missing on a deployed
  // environment we want to fail before spending minutes reading every table.
  const encryptionKey = resolveBackupKey();

  const tables = await dumpAllTables();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = JSON.stringify({ timestamp, tables });

  // Compress, then encrypt. See the note on encryptBackup in lib/backupCrypto.js
  // for why that order is correct here and must not be swapped.
  const gzipped = zlib.gzipSync(Buffer.from(payload, 'utf8'));
  const encrypted = encryptionKey !== null;
  const buffer = encrypted ? encryptBackup(gzipped, encryptionKey) : gzipped;

  // Suffix reflects the actual contents, so a human downloading one of these
  // can tell at a glance what they are holding. The timestamp still comes
  // first, so the lexicographic sort pruneOldBackups relies on is unaffected
  // by the mixed suffixes during the transition.
  const key = `${BACKUP_PREFIX}backup-${timestamp}.json.gz${encrypted ? '.enc' : ''}`;

  await uploadFile({
    key,
    buffer,
    mimeType: encrypted ? 'application/octet-stream' : 'application/gzip',
  });

  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length])
  );

  console.log(
    `[backup] Wrote ${key} (${buffer.length} bytes, ${Object.keys(tables).length} tables, ` +
    `${encrypted ? 'encrypted' : 'UNENCRYPTED, local dev only'})`
  );

  const pruned = await pruneOldBackups();

  return { key, sizeBytes: buffer.length, encrypted, rowCounts, pruned };
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

module.exports = { runBackup, pruneOldBackups, listBackups, dumpAllTables, resolveBackupKey };
