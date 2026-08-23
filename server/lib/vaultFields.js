// Field-level encryption for the vault-protected section tables (SEC-03).
// Single source of truth for which columns get encrypted per table, so the
// list can't drift out of sync between routes the way other vault checks
// did before being centralized (see vaultAuth.js, vaultSections.js).
const { encryptField, decryptField } = require('./vault');

const TABLE_FIELDS = {
  legal_documents: ['document_type', 'title', 'held_by', 'location', 'notes'],
  financial_items: ['category', 'institution', 'account_type', 'account_reference', 'contact_name', 'contact_phone', 'notes'],
  property_items:  ['category', 'title', 'description', 'location', 'intended_recipient', 'notes'],
  household_info:  ['category', 'title', 'provider', 'account_reference', 'contact', 'notes'],
  // IDEA-32: donation_bank never had pre-encryption plaintext data of its
  // own (it's a brand new table), but carries plain + _enc columns anyway so
  // the one-time medical_wishes migration in database.js (which cannot
  // encrypt anything at server-startup time, with no vault password
  // available) can write legacy plaintext, upgraded to _enc via this exact
  // machinery on the user's first authenticated read/write.
  donation_bank:   ['organ_donation', 'organ_donation_details'],
};

// Decrypt a row's vault-protected fields for the given table. A row written
// before this migration still has its data in the plain columns and NULL
// _enc columns - those fields fall back to the plaintext value so existing
// data keeps displaying correctly, and `legacyPlaintext` comes back true so
// the caller can opportunistically re-encrypt and clear it right here, using
// the key this exact request already derived. There is no way to migrate a
// row the user never revisits: the server never has their vault password
// except during a live request.
function decryptRow(table, row, key) {
  const fields = TABLE_FIELDS[table];
  const decrypted = { ...row };
  let legacyPlaintext = false;
  for (const field of fields) {
    const encVal = row[`${field}_enc`];
    if (encVal) {
      decrypted[field] = decryptField(encVal, key);
    } else if (row[field]) {
      legacyPlaintext = true;
    }
    delete decrypted[`${field}_enc`];
  }
  return { decrypted, legacyPlaintext };
}

// Build a { field_enc: value, ... } map encrypting each in-scope field from
// `data` with the given key, ready to spread into an INSERT/UPDATE.
function encryptFields(table, data, key) {
  const fields = TABLE_FIELDS[table];
  const out = {};
  for (const field of fields) {
    out[`${field}_enc`] = encryptField(data[field] ?? null, key);
  }
  return out;
}

// Persist newly-encrypted values for a row and null out its legacy plaintext
// columns in the same statement, so a migrated row never has both a
// readable plaintext value and a ciphertext sitting side by side.
async function migrateRow(query, table, rowId, data, key) {
  const fields = TABLE_FIELDS[table];
  const encMap = encryptFields(table, data, key);
  const setParts = [];
  const values = [];
  let i = 1;
  for (const field of fields) {
    setParts.push(`${field} = NULL`);
    setParts.push(`${field}_enc = $${i}`);
    values.push(encMap[`${field}_enc`]);
    i++;
  }
  values.push(rowId);
  await query(`UPDATE ${table} SET ${setParts.join(', ')} WHERE id = $${i}`, values);
}

module.exports = { TABLE_FIELDS, decryptRow, encryptFields, migrateRow };
