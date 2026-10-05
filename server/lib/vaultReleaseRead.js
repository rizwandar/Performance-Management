/**
 * Reading the vault once a release code has opened the envelope
 * (docs/VAULT_RELEASE_ON_DEATH_SPEC.md, section 3.4).
 *
 * This is the only place in the product that decrypts vault-protected data
 * for somebody other than the owner, and it is deliberately the narrowest
 * possible shape: given a user id and an already-recovered vault key, hand
 * back every vault-protected section as plaintext, read-only, and write
 * nothing.
 *
 * Three properties this file exists to hold.
 *
 *   1. It never derives a key and never sees a release code. The caller has
 *      already opened the envelope (openSealedKey in lib/vaultRelease.js) and
 *      passes the key in. Nothing here can be used to obtain one.
 *
 *   2. It is read-only. The owner-facing list routes in routes/sections.js
 *      opportunistically re-encrypt rows that are still on pre-SEC-03 legacy
 *      plaintext (migrateRow) while they have a key in hand. This does not,
 *      on purpose: the account belongs to someone who has been declared
 *      dead, and a read by their Legacy Contact must not be the thing that
 *      rewrites their records. decryptRow already falls back to the legacy
 *      plaintext column, so such rows still display correctly.
 *
 *   3. The section list cannot drift. It is keyed off
 *      VAULT_PROTECTED_SECTIONS in lib/vaultSections.js, and the two are
 *      checked against each other at require time (see the assertion at the
 *      bottom). Adding a seventh vault-protected section without teaching
 *      this file how to read it is a startup failure rather than a silently
 *      incomplete handover, which is the failure mode that actually matters:
 *      nobody would discover it until a family opened the envelope and found
 *      a section missing.
 */

const { queryOne, queryAll } = require('../db/database');
const { decryptField } = require('./vault');
const { TABLE_FIELDS, decryptRow } = require('./vaultFields');
const { VAULT_PROTECTED_SECTIONS, isVaultProtectedSection } = require('./vaultSections');

/**
 * How each vault-protected section is read.
 *
 *   kind 'list'        many rows per user, field-encrypted via vaultFields.
 *   kind 'single'      at most one row per user, same encryption.
 *   kind 'credentials' digital_credentials, which predates vaultFields and
 *                      keeps its own column names and its own plain-text
 *                      service/service_url columns.
 *
 * `order` is applied in SQL only where the sort column is not encrypted.
 * Sorting by an _enc column would sort by ciphertext, which is to say
 * randomly; household_info is sorted after decryption instead, exactly as
 * routes/sections.js does for the owner's own view.
 */
const READERS = {
  legal_documents:     { kind: 'list',   table: 'legal_documents', order: 'created_at DESC' },
  financial_items:     { kind: 'list',   table: 'financial_items', order: 'created_at DESC' },
  property_items:      { kind: 'list',   table: 'property_items',  order: 'created_at DESC' },
  household_info:      { kind: 'list',   table: 'household_info',  sortDecrypted: ['category', 'title'] },
  donation_bank:       { kind: 'single', table: 'donation_bank' },
  digital_credentials: { kind: 'credentials' },
};

/**
 * Project a decrypted row down to the fields this section actually has.
 *
 * decryptRow() is handed a SELECT * row and returns it with the _enc columns
 * removed and the plain field names holding plaintext, but everything else
 * the table carries still attached: user_id, updated_at, and whatever else
 * has accumulated. A response going to a third party should carry the
 * section's own fields and nothing incidental, so this whitelists rather
 * than deletes.
 */
function project(table, decrypted) {
  const out = { id: decrypted.id };
  for (const field of TABLE_FIELDS[table]) out[field] = decrypted[field] ?? null;
  if (decrypted.created_at !== undefined) out.created_at = decrypted.created_at;
  return out;
}

async function readList({ table, order, sortDecrypted }, userId, key) {
  const rows = await queryAll(
    `SELECT * FROM ${table} WHERE user_id = $1${order ? ` ORDER BY ${order}` : ''}`,
    [userId]
  );
  const items = rows.map(row => project(table, decryptRow(table, row, key).decrypted));
  if (sortDecrypted) {
    items.sort((a, b) => {
      for (const field of sortDecrypted) {
        const cmp = String(a[field] || '').localeCompare(String(b[field] || ''));
        if (cmp) return cmp;
      }
      return 0;
    });
  }
  return items;
}

async function readSingle({ table }, userId, key) {
  const row = await queryOne(`SELECT * FROM ${table} WHERE user_id = $1`, [userId]);
  if (!row) return null;
  return project(table, decryptRow(table, row, key).decrypted);
}

async function readCredentials(_reader, userId, key) {
  const rows = await queryAll(
    `SELECT id, service, service_url, username_enc, password_enc, notes_enc, created_at
     FROM digital_credentials WHERE user_id = $1 ORDER BY service`,
    [userId]
  );
  return rows.map(row => ({
    id:          row.id,
    service:     row.service,
    service_url: row.service_url,
    username:    decryptField(row.username_enc, key),
    password:    decryptField(row.password_enc, key),
    notes:       decryptField(row.notes_enc, key),
    created_at:  row.created_at,
  }));
}

const BY_KIND = {
  list:        readList,
  single:      readSingle,
  credentials: readCredentials,
};

/**
 * Every vault-protected section for one user, decrypted with the given key.
 *
 * Returns { sections, data } where `sections` is the list of section ids that
 * actually hold something and `data` is keyed by section id. Empty sections
 * are reported in `data` as an empty array or null rather than omitted, so
 * the client can say "nothing was recorded here" instead of leaving a gap
 * that reads as a failure.
 */
async function readVaultSections(userId, key) {
  const data = {};
  const sections = [];

  for (const sectionId of Object.keys(READERS)) {
    const reader = READERS[sectionId];
    const value = await BY_KIND[reader.kind](reader, userId, key);
    data[sectionId] = value;
    const present = Array.isArray(value) ? value.length > 0 : !!value;
    if (present) sections.push(sectionId);
  }

  return { sections, data };
}

// Require-time completeness check, in both directions. A section that is
// vault-protected but unreadable here would be quietly dropped from a
// handover; a section readable here but not vault-protected would mean this
// module had become a second, unguarded path to data the rest of the codebase
// thinks is gated. Both are startup failures rather than runtime surprises.
for (const sectionId of VAULT_PROTECTED_SECTIONS) {
  if (!READERS[sectionId]) {
    throw new Error(
      `[vaultReleaseRead] '${sectionId}' is vault-protected but has no reader. ` +
      'Add one here, or a vault release would hand over an incomplete vault.'
    );
  }
}
for (const sectionId of Object.keys(READERS)) {
  if (!isVaultProtectedSection(sectionId)) {
    throw new Error(
      `[vaultReleaseRead] '${sectionId}' has a reader here but is not in ` +
      'VAULT_PROTECTED_SECTIONS. This module must only ever read vault-protected data.'
    );
  }
}

module.exports = { readVaultSections, VAULT_RELEASE_SECTIONS: Object.keys(READERS) };
