const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { queryOne, queryAll, query } = require('../db/database');
const auth    = require('../middleware/auth');
const requirePremium = require('../middleware/requiresPremium');
const { generatePdf } = require('../lib/generatePdf');
const { deriveKey, decryptField, verifyVaultPassword } = require('../lib/vault');
const { recordVaultAttempt } = require('../lib/vaultAttempts');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Bulk PDF export is a much wider data-egress action than the section-by-section
// browsing view-as mode is meant to grant, so it's blocked entirely during a
// view-as session (same self-contained decode pattern used for the vault block
// in sections.js, since requireAuth's view-as handling only runs per-route).
router.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.viewAs) return res.status(403).json({ error: 'Export is not available in view-as mode.' });
  } catch { /* an invalid token is left for the route's own requireAuth to reject */ }
  next();
});

async function buildBaseData(uid) {
  const user = await queryOne(`
    SELECT id, name, email, date_of_birth,
           life_story, about_me, remembered_for, legacy_message,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email
    FROM users WHERE id = $1
  `, [uid]);
  if (!user) return null;

  const settingsRows = await queryAll('SELECT key, value FROM app_settings');
  const settings     = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

  const [
    legalDocs, financialItems, funeralWishes, medicalWishes,
    peopleToNotify, propertyItems, messages, songsDefineMe,
    lifeWishes, trustedContacts, childrenDependants, householdInfo,
  ] = await Promise.all([
    queryAll('SELECT * FROM legal_documents   WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM financial_items   WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryOne('SELECT * FROM funeral_wishes    WHERE user_id = $1', [uid]),
    queryOne('SELECT * FROM medical_wishes    WHERE user_id = $1', [uid]),
    queryAll('SELECT * FROM people_to_notify  WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM property_items    WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM personal_messages WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM songs_that_define_me WHERE user_id = $1 ORDER BY added_at', [uid]),
    queryAll('SELECT * FROM life_wishes       WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM trusted_contacts  WHERE user_id = $1 ORDER BY sequence', [uid]),
    queryAll('SELECT * FROM children_dependants WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM household_info    WHERE user_id = $1 ORDER BY created_at', [uid]),
  ]);

  return {
    user, settings,
    legalDocs, financialItems,
    funeralWishes:  funeralWishes  || {},
    medicalWishes:  medicalWishes  || {},
    peopleToNotify, propertyItems, messages, songsDefineMe,
    lifeWishes, trustedContacts, childrenDependants, householdInfo,
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

router.get('/', auth, async (req, res) => {
  const data = await buildBaseData(req.user.id);
  if (!data) return res.status(404).json({ error: 'User not found.' });
  data.logoBuffer = await loadLogo(data.settings);
  streamPdf(data, res);
});

router.post('/', auth, requirePremium, async (req, res) => {
  const uid = req.user.id;
  const { vault_password } = req.body;

  if (!vault_password) {
    return res.status(400).json({ error: 'vault_password is required.' });
  }

  const vault = await queryOne('SELECT check_enc FROM digital_vault WHERE user_id = $1', [uid]);
  if (!vault) {
    return res.status(403).json({ error: 'No vault found. Set up your vault in the Digital Life or Legal Documents section first.' });
  }

  const key = deriveKey(vault_password, uid);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    const { attempts, shouldLogout, vaultDeleted } = await recordVaultAttempt(uid);
    const remaining = Math.max(0, 5 - attempts);
    if (vaultDeleted) {
      return res.status(410).json({
        error: 'Your vault has been deleted after 5 incorrect attempts. Your other plans and wishes are completely safe. You can create a new vault at any time.',
        vault_deleted: true,
      });
    } else if (shouldLogout) {
      return res.status(403).json({
        error: `Incorrect vault password. For your security, you have been signed out. Please sign in again. (${attempts} of 5 attempts used.)`,
        force_logout: true, attempts,
      });
    } else {
      return res.status(401).json({
        error: `Incorrect vault password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before you are signed out.`,
        attempts, remaining,
      });
    }
  }
  await query('UPDATE users SET vault_attempts = 0 WHERE id = $1', [uid]);

  const credRows = await queryAll(
    'SELECT id, service, service_url, username_enc, password_enc, notes_enc, created_at FROM digital_credentials WHERE user_id = $1 ORDER BY service',
    [uid]
  );

  const credentials = credRows.map(row => ({
    service:     row.service,
    service_url: row.service_url,
    username:    decryptField(row.username_enc, key),
    password:    decryptField(row.password_enc, key),
    notes:       decryptField(row.notes_enc, key),
  }));

  const data = await buildBaseData(uid);
  if (!data) return res.status(404).json({ error: 'User not found.' });

  data.logoBuffer = await loadLogo(data.settings);
  data.vaultData  = { legalDocs: data.legalDocs, credentials };

  streamPdf(data, res);
});

module.exports = router;
