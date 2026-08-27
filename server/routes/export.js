const express = require('express');
const router  = express.Router();
const { queryOne, queryAll } = require('../db/database');
const auth    = require('../middleware/auth');
const requirePremium = require('../middleware/requiresPremium');
const { generatePdf } = require('../lib/generatePdf');
const { decryptField } = require('../lib/vault');
const { checkVault } = require('../lib/vaultAuth');
const { decryptRow } = require('../lib/vaultFields');
const { blockViewAs } = require('../lib/viewAsGuard');

// Bulk PDF export is a much wider data-egress action than the section-by-section
// browsing view-as mode is meant to grant, so it's blocked entirely during a
// view-as session.
//
// REV-01 (2026-08-26 review): this used to decode the token from
// req.headers.authorization only, which never applied to a web view-as
// session (delivered exclusively via an httpOnly cookie since SEC-09) - see
// lib/viewAsGuard.js for the full explanation.
router.use(blockViewAs('Export is not available in view-as mode.'));

// Non-vault-protected data only - safe to load and render regardless of
// whether the vault password has been verified. Vault-protected sections
// (legal documents, financial affairs, property, household info, digital
// credentials) are loaded separately by loadVaultData(), only ever called
// after a successful vault-password check, so they can't reach the standard
// export even by accident (see SEC-02).
async function buildBaseData(uid) {
  const user = await queryOne(`
    SELECT id, name, email, date_of_birth,
           life_story, about_me, remembered_for, legacy_message,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email,
           emergency_contact_relationship, emergency_contact_notes,
           marital_status, spouse_name, spouse_phone, spouse_email
    FROM users WHERE id = $1
  `, [uid]);
  if (!user) return null;

  const settingsRows = await queryAll('SELECT key, value FROM app_settings');
  const settings     = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

  const [
    funeralWishes, doctors, medicalRecords, peopleToNotify, messages,
    songsDefineMe, lifeWishes, trustedContacts, childrenDependants, pets, insuranceItems,
    unfinishedBusiness, lastMoments,
  ] = await Promise.all([
    queryOne('SELECT * FROM funeral_wishes    WHERE user_id = $1', [uid]),
    queryOne('SELECT * FROM doctors           WHERE user_id = $1', [uid]),
    queryOne('SELECT * FROM medical_records   WHERE user_id = $1', [uid]),
    queryAll('SELECT * FROM people_to_notify  WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM personal_messages WHERE user_id = $1 ORDER BY created_at', [uid]), // audio_clip_count attached below (IDEA-34)
    queryAll('SELECT * FROM songs_that_define_me WHERE user_id = $1 ORDER BY added_at', [uid]),
    queryAll('SELECT * FROM life_wishes       WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM trusted_contacts  WHERE user_id = $1 ORDER BY sequence', [uid]),
    queryAll('SELECT * FROM children_dependants WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM pets              WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM insurance_items   WHERE user_id = $1 ORDER BY created_at', [uid]),
    // IDEA-19: same non-vault, always-included pattern as personal_messages above.
    queryAll('SELECT * FROM unfinished_business WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryOne('SELECT * FROM last_moments      WHERE user_id = $1', [uid]),
  ]);

  // IDEA-34: a PDF can't embed playable audio (see generatePdf.js), so it only
  // needs each message's clip count, not the clips or their R2 keys/URLs.
  if (messages.length) {
    const counts = await queryAll(
      'SELECT message_id, COUNT(*)::int AS c FROM personal_message_audio_clips WHERE message_id = ANY($1::int[]) GROUP BY message_id',
      [messages.map(m => m.id)]
    );
    const countByMessage = Object.fromEntries(counts.map(r => [r.message_id, r.c]));
    messages.forEach(m => { m.audio_clip_count = countByMessage[m.id] || 0; });
  }

  return {
    user, settings,
    funeralWishes:  funeralWishes  || {},
    doctors:        doctors        || {},
    medicalRecords: medicalRecords || {},
    peopleToNotify, messages, songsDefineMe,
    lifeWishes, trustedContacts, childrenDependants, pets, insuranceItems,
    unfinishedBusiness,
    lastMoments: lastMoments || {},
  };
}

// Vault-protected data only. Caller must have already verified the vault
// password before calling this - it does not check anything itself.
async function loadVaultData(uid, key) {
  const [legalDocRows, financialItemRows, propertyItemRows, householdInfoRows, credRows, donationBankRow] = await Promise.all([
    queryAll('SELECT * FROM legal_documents WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM financial_items WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM property_items  WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll('SELECT * FROM household_info  WHERE user_id = $1 ORDER BY created_at', [uid]),
    queryAll(
      'SELECT id, service, service_url, username_enc, password_enc, notes_enc, created_at FROM digital_credentials WHERE user_id = $1 ORDER BY service',
      [uid]
    ),
    // IDEA-32: Donation Bank, single row per user like funeral_wishes/
    // medical_wishes, but vault-protected and field-encrypted like the four
    // list-shaped tables above - decrypted here the same way, just without a
    // .map() since there's at most one row.
    queryOne('SELECT * FROM donation_bank WHERE user_id = $1', [uid]),
  ]);

  // REV-06 (2026-08-26 review): these four lists used to be returned as raw
  // SELECT * rows - still ciphertext per SEC-03, since a migrated row's plain
  // columns stay NULL - instead of being run through decryptRow() the way
  // credentials/donationBank already are below. A complete vault export's PDF
  // silently rendered no usable content for legal documents, financial
  // affairs, property, or household info. Same decryptRow() call already used
  // for donationBank, just applied to every row in these four lists too.
  const legalDocs      = legalDocRows.map(row => decryptRow('legal_documents', row, key).decrypted);
  const financialItems = financialItemRows.map(row => decryptRow('financial_items', row, key).decrypted);
  const propertyItems  = propertyItemRows.map(row => decryptRow('property_items', row, key).decrypted);
  const householdInfo  = householdInfoRows.map(row => decryptRow('household_info', row, key).decrypted);

  const credentials = credRows.map(row => ({
    service:     row.service,
    service_url: row.service_url,
    username:    decryptField(row.username_enc, key),
    password:    decryptField(row.password_enc, key),
    notes:       decryptField(row.notes_enc, key),
  }));

  const donationBank = donationBankRow ? decryptRow('donation_bank', donationBankRow, key).decrypted : {};

  return { legalDocs, financialItems, propertyItems, householdInfo, credentials, donationBank };
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
  // Never let a browser, proxy, or CDN cache a generated export - both
  // versions can contain sensitive personal data.
  res.setHeader('Cache-Control', 'no-store, private');
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

  // REV-18/REV-33 (2026-08-26 review): this used to verify the vault password
  // inline with a direct deriveKey()/verifyVaultPassword() call instead of the
  // shared checkVault() helper every other vault-protected route uses. That
  // drifted copy hardcoded "5 attempts" instead of reading the vault's actual
  // configured logout_after_attempts/destroy_after_attempts thresholds, called
  // recordVaultAttempt() without req so failed-attempt audit rows here logged
  // null IP/user-agent, and never handled a vaultDestroyed result at all.
  // checkVault() covers all of that and matches the pattern used by every
  // other vault-protected route (sections.js, documents.js), so the client
  // doesn't need to special-case this route's responses.
  const key = await checkVault(vault_password, uid, res, req);
  if (!key) return;

  const [data, vaultData] = await Promise.all([
    buildBaseData(uid),
    loadVaultData(uid, key),
  ]);
  if (!data) return res.status(404).json({ error: 'User not found.' });

  data.logoBuffer = await loadLogo(data.settings);
  data.vaultData  = vaultData;

  streamPdf(data, res);
});

module.exports = router;
