/**
 * Backup file encryption, AES-256-GCM.
 *
 * Nightly backups (see backup.js) dump every table in the database to one
 * file in R2. That file contains everything: users, medical records, doctors,
 * trusted contacts, every non-vault section. Gzip is not protection, so
 * anyone holding the R2 credential could previously read the whole database.
 * The published privacy policy says these backups are encrypted, and this is
 * what makes that true.
 *
 * Conventions deliberately match lib/vault.js: aes-256-gcm, a 12 byte IV, and
 * a version marker so the scheme can change later without ambiguity. What is
 * NOT shared is key derivation. The vault derives a key per user, with scrypt,
 * from a password the server never stores. A backup key is the opposite kind
 * of secret: one deployment secret, held by the platform, used unattended by
 * a cron job at 8am with no human present to type anything. So the key here is
 * supplied directly as 32 bytes of hex (BACKUP_ENCRYPTION_KEY) and used as-is.
 *
 * File layout, all binary, in this order:
 *
 *   magic        8 bytes   "IGHBKP01"
 *   iv          12 bytes   random per backup
 *   tag         16 bytes   GCM authentication tag
 *   ciphertext  rest       AES-256-GCM over the gzipped JSON dump
 *
 * The magic is also passed as additional authenticated data, so the version
 * marker itself is covered by the tag and cannot be rewritten to point a
 * future reader at a weaker scheme.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12; // 96 bits, recommended for GCM, same as vault.js
const TAG_BYTES = 16;

// Fixed-width format prefix. This does the job vault.js's SALT_PREFIX does: if
// the algorithm, IV size or key handling ever changes, a v2 writer emits
// IGHBKP02 and the decrypt tool can still read every v1 file already sitting
// in R2 instead of guessing at what it is holding.
const MAGIC_V1 = Buffer.from('IGHBKP01', 'ascii');
const HEADER_BYTES = MAGIC_V1.length + IV_BYTES + TAG_BYTES;

// gzip's own magic bytes. Backups written before this shipped are bare gzip,
// and 14 of them are still in R2 under retention. A reader that cannot tell
// those apart from a corrupt file would report "wrong key" for a file that was
// simply never encrypted, which is the single most misleading thing it could
// say during a restore.
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

// Error codes, so callers can tell the three failure modes apart and print
// something useful rather than relaying a crypto library message.
const ERR_LEGACY_PLAINTEXT = 'ERR_BACKUP_LEGACY_PLAINTEXT';
const ERR_UNRECOGNIZED = 'ERR_BACKUP_UNRECOGNIZED';
const ERR_TRUNCATED = 'ERR_BACKUP_TRUNCATED';
const ERR_AUTH_FAILED = 'ERR_BACKUP_AUTH_FAILED';
const ERR_BAD_KEY_FORMAT = 'ERR_BACKUP_BAD_KEY_FORMAT';

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * How to generate a key. Printed in error messages and documented in
 * server/.env.example, kept here so the two cannot drift.
 */
const KEY_GENERATION_HINT =
  'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';

/**
 * Validates and decodes a hex-encoded key into a 32 byte Buffer.
 *
 * Strict on purpose. A key that is short, long, or not hex is a configuration
 * mistake, and the only safe moment to catch it is before anything has been
 * written. A near-miss key that silently got padded or truncated would produce
 * backups nothing can ever read.
 */
function parseBackupKey(hex, varName = 'BACKUP_ENCRYPTION_KEY') {
  const trimmed = String(hex == null ? '' : hex).trim();
  if (!trimmed) {
    throw fail(ERR_BAD_KEY_FORMAT, `${varName} is empty.`);
  }
  if (!/^[0-9a-fA-F]+$/.test(trimmed) || trimmed.length !== KEY_BYTES * 2) {
    throw fail(
      ERR_BAD_KEY_FORMAT,
      `${varName} must be exactly ${KEY_BYTES} bytes, hex encoded (${KEY_BYTES * 2} hex characters). ` +
      `Got ${trimmed.length} character(s). Generate one with:\n  ${KEY_GENERATION_HINT}`
    );
  }
  return Buffer.from(trimmed, 'hex');
}

/** True if the buffer starts with this module's version marker. */
function looksEncrypted(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= MAGIC_V1.length &&
    buffer.subarray(0, MAGIC_V1.length).equals(MAGIC_V1)
  );
}

/** True if the buffer is a bare gzip stream, i.e. a pre-encryption backup. */
function looksGzip(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= GZIP_MAGIC.length &&
    buffer.subarray(0, GZIP_MAGIC.length).equals(GZIP_MAGIC)
  );
}

/**
 * Encrypts an already-gzipped payload.
 *
 * Order matters, and it is compress first, then encrypt. Ciphertext is
 * indistinguishable from random, so encrypting first would make the dump
 * incompressible and we would be uploading the full JSON size every night.
 * The usual objection to compress-then-encrypt is a compression oracle
 * (CRIME/BREACH), which needs an attacker who can inject chosen plaintext
 * into the same payload as a secret and watch the compressed length change
 * across repeated requests. Nothing like that exists here: this is one
 * unattended nightly dump of the whole database, with no attacker-controlled
 * request, no repetition and no observable length channel. Leaving this noted
 * so a future reviewer does not "fix" the order and triple the backup size.
 */
function encryptBackup(gzippedBuffer, key) {
  if (!Buffer.isBuffer(gzippedBuffer)) {
    throw new TypeError('encryptBackup expects a Buffer');
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new TypeError(`encryptBackup expects a ${KEY_BYTES} byte key Buffer`);
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(MAGIC_V1);
  const ciphertext = Buffer.concat([cipher.update(gzippedBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_V1, iv, tag, ciphertext]);
}

/**
 * Reverses encryptBackup and returns the gzipped payload.
 *
 * Throws with a `code` from the ERR_* set above. GCM verification happens in
 * final(), so a wrong key or a flipped byte raises rather than returning
 * plausible-looking garbage.
 */
function decryptBackup(fileBuffer, key) {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new TypeError('decryptBackup expects a Buffer');
  }
  if (looksGzip(fileBuffer)) {
    throw fail(
      ERR_LEGACY_PLAINTEXT,
      'This file is a bare gzip stream, not an encrypted backup. It was written ' +
      'before backup encryption shipped, so there is nothing to decrypt: gunzip it directly.'
    );
  }
  if (!looksEncrypted(fileBuffer)) {
    throw fail(
      ERR_UNRECOGNIZED,
      'Unrecognized file: it carries neither the encrypted-backup marker ' +
      `(${MAGIC_V1.toString('ascii')}) nor gzip's. Check that the download completed ` +
      'and that this is actually a backup file.'
    );
  }
  if (fileBuffer.length <= HEADER_BYTES) {
    throw fail(
      ERR_TRUNCATED,
      `Truncated file: ${fileBuffer.length} bytes, but the header alone is ${HEADER_BYTES} ` +
      'bytes and at least one byte of ciphertext must follow. The download is incomplete.'
    );
  }

  const iv = fileBuffer.subarray(MAGIC_V1.length, MAGIC_V1.length + IV_BYTES);
  const tag = fileBuffer.subarray(MAGIC_V1.length + IV_BYTES, HEADER_BYTES);
  const ciphertext = fileBuffer.subarray(HEADER_BYTES);

  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new TypeError(`decryptBackup expects a ${KEY_BYTES} byte key Buffer`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(MAGIC_V1);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM cannot tell us which it was, so say both rather than guess.
    throw fail(
      ERR_AUTH_FAILED,
      'Authentication failed. Either BACKUP_ENCRYPTION_KEY is not the key this ' +
      'backup was written with, or the file has been altered or corrupted in transit. ' +
      'Confirm you are using the key from the same environment that produced the file ' +
      '(keys are per environment in Infisical) and re-download it.'
    );
  }
}

module.exports = {
  parseBackupKey,
  encryptBackup,
  decryptBackup,
  looksEncrypted,
  looksGzip,
  KEY_BYTES,
  KEY_GENERATION_HINT,
  MAGIC_V1,
  ERR_LEGACY_PLAINTEXT,
  ERR_UNRECOGNIZED,
  ERR_TRUNCATED,
  ERR_AUTH_FAILED,
  ERR_BAD_KEY_FORMAT,
};
