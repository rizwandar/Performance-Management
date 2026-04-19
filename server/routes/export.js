const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const auth    = require('../middleware/auth');
const { generatePdf } = require('../lib/generatePdf');
const { deriveKey, decryptField, verifyVaultPassword } = require('../lib/vault');
const { recordVaultAttempt } = require('../lib/vaultAttempts');

// ---------------------------------------------------------------------------
// Shared: assemble the base data payload for PDF generation
// ---------------------------------------------------------------------------
function buildBaseData(uid) {
  const user = db.prepare(`
    SELECT id, name, email, date_of_birth,
           life_story, about_me, remembered_for, legacy_message,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email
    FROM users WHERE id = ?
  `).get(uid);

  if (!user) return null;

  const settingsRows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

  return {
    user,
    settings,
    legalDocs:          db.prepare('SELECT * FROM legal_documents WHERE user_id = ? ORDER BY created_at').all(uid),
    financialItems:     db.prepare('SELECT * FROM financial_items WHERE user_id = ? ORDER BY created_at').all(uid),
    funeralWishes:      db.prepare('SELECT * FROM funeral_wishes WHERE user_id = ?').get(uid) || {},
    medicalWishes:      db.prepare('SELECT * FROM medical_wishes WHERE user_id = ?').get(uid) || {},
    peopleToNotify:     db.prepare('SELECT * FROM people_to_notify WHERE user_id = ? ORDER BY created_at').all(uid),
    propertyItems:      db.prepare('SELECT * FROM property_items WHERE user_id = ? ORDER BY created_at').all(uid),
    messages:           db.prepare('SELECT * FROM personal_messages WHERE user_id = ? ORDER BY created_at').all(uid),
    songsDefineMe:      db.prepare('SELECT * FROM songs_that_define_me WHERE user_id = ? ORDER BY added_at').all(uid),
    lifeWishes:         db.prepare('SELECT * FROM life_wishes WHERE user_id = ? ORDER BY created_at').all(uid),
    trustedContacts:    db.prepare('SELECT * FROM trusted_contacts WHERE user_id = ? ORDER BY sequence').all(uid),
    childrenDependants: db.prepare('SELECT * FROM children_dependants WHERE user_id = ? ORDER BY created_at').all(uid),
    householdInfo:      db.prepare('SELECT * FROM household_info WHERE user_id = ? ORDER BY created_at').all(uid),
  };
}

async function loadLogo(settings) {
  if (!settings.site_logo) return null;
  try {
    const { getFileBuffer } = require('../lib/r2');
    return await getFileBuffer(settings.site_logo);
  } catch {
    return null;
  }
}

function streamPdf(data, res) {
  const safeName = data.user.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="in-good-hands-${safeName}.pdf"`);
  try {
    generatePdf(data, res);
  } catch (err) {
    console.error('[export] PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: "We couldn't generate your document. Please try again." });
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/export  — standard export, vault sections shown as locked
// ---------------------------------------------------------------------------
router.get('/', auth, async (req, res) => {
  const data = buildBaseData(req.user.id);
  if (!data) return res.status(404).json({ error: 'User not found.' });

  data.logoBuffer = await loadLogo(data.settings);
  streamPdf(data, res);
});

// ---------------------------------------------------------------------------
// POST /api/export  — complete export including vault-protected sections
// Body: { vault_password }
// ---------------------------------------------------------------------------
router.post('/', auth, async (req, res) => {
  const uid = req.user.id;
  const { vault_password } = req.body;

  if (!vault_password) {
    return res.status(400).json({ error: 'vault_password is required.' });
  }

  // Verify vault password
  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(uid);
  if (!vault) {
    return res.status(403).json({ error: 'No vault found. Set up your vault in the Digital Life or Legal Documents section first.' });
  }

  const key = deriveKey(vault_password, uid);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    const { attempts, shouldLogout, vaultDeleted } = recordVaultAttempt(uid);
    const remaining = Math.max(0, 5 - attempts);
    if (vaultDeleted) {
      return res.status(410).json({
        error: 'Your vault has been deleted after 5 incorrect attempts. Your other plans and wishes are completely safe. You can create a new vault at any time.',
        vault_deleted: true,
      });
    } else if (shouldLogout) {
      return res.status(403).json({
        error: `Incorrect vault password. For your security, you have been signed out. Please sign in again. (${attempts} of 5 attempts used.)`,
        force_logout: true,
        attempts,
      });
    } else {
      return res.status(401).json({
        error: `Incorrect vault password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before you are signed out.`,
        attempts,
        remaining,
      });
    }
  }
  // Success: reset attempt counter
  db.prepare('UPDATE users SET vault_attempts = 0 WHERE id = ?').run(uid);

  // Vault verified — decrypt credentials
  const credRows = db.prepare(
    'SELECT id, service, service_url, username_enc, password_enc, notes_enc, created_at FROM digital_credentials WHERE user_id = ? ORDER BY service'
  ).all(uid);

  const credentials = credRows.map(row => ({
    service:     row.service,
    service_url: row.service_url,
    username:    decryptField(row.username_enc, key),
    password:    decryptField(row.password_enc, key),
    notes:       decryptField(row.notes_enc, key),
  }));

  const data = buildBaseData(uid);
  if (!data) return res.status(404).json({ error: 'User not found.' });

  data.logoBuffer = await loadLogo(data.settings);
  data.vaultData  = {
    legalDocs:   data.legalDocs,   // already loaded in buildBaseData
    credentials,
  };

  streamPdf(data, res);
});

module.exports = router;
