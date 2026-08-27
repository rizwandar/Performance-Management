const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, query, transaction } = require('../db/database');
const requireAuth    = require('../middleware/auth');
const requirePremium = require('../middleware/requiresPremium');
const { deriveKey, encryptField, decryptField, createVaultCheck, verifyVaultPassword } = require('../lib/vault');
const { checkVault } = require('../lib/vaultAuth');
const { TABLE_FIELDS, decryptRow, migrateRow } = require('../lib/vaultFields');
const { destroyVaultData } = require('../lib/vaultDestroy');
const { uploadFile, deleteFile, getDownloadUrl } = require('../lib/r2');
const { matchesExtension } = require('../lib/fileSignature');
const { blockViewAs } = require('../lib/viewAsGuard');
const checkPlanLock = require('../middleware/planLock');

// Both checks below decode the session token directly (rather than relying on
// req.user/req.isViewAs) since requireAuth is applied per-route, not globally,
// so it hasn't run yet at this point.
//
// SEC-18 (2026-08-15): both previously read only req.headers.authorization.
// Since SEC-09, the web client's session - including the view-as session
// minted by POST /api/org-portal/customers/:id/view-as, which is delivered
// exclusively via the httpOnly cookie, never returned in a response body for
// the client to put in a header - has had no readable token to send as an
// Authorization header at all. A header-only check silently no-ops for every
// web request, meaning both protections below did not actually apply to any
// browser-based session (view-as included) despite the "without exception"
// comment on the vault check. Found via a security review of a separate,
// related feature (see project_vault_recovery_security_questions_2026_08
// memory). Fixed to use the same cookie-first precedence middleware/auth.js's
// requireAuth already uses: cookie first, Bearer header as the mobile-only
// fallback.
//
// REV-01 (2026-08-26 review): extractToken() now lives in lib/viewAsGuard.js
// so users.js and export.js (which had regressed to the header-only bug this
// exact comment describes) share this same implementation instead of each
// keeping their own copy that can drift out of sync again.
//
// REV-19 (2026-08-26 review): the deceased-plan lock that used to be defined
// inline here now lives in middleware/planLock.js, since documents.js,
// trustedContacts.js and users.js need the exact same check and had none.
router.use(checkPlanLock);

// The vault is never visible in view-as mode, without exception (org portal
// spec, section 11). This is a single central check rather than trusting it to
// be remembered in every individual vault route handler below.
router.use('/digital-life/vault', blockViewAs('The vault is not accessible in view-as mode.'));

// ---------------------------------------------------------------------------
// Completion counts for all sections
// ---------------------------------------------------------------------------
router.get('/completion', requireAuth, async (req, res) => {
  const uid = req.user.id;

  const [
    userProfile, tcCount,
    ld, fi, fw, ptn, pi, pm, dc, stm, lw, hi, cd, pet, ins, ub, lm, doc, mr, db,
  ] = await Promise.all([
    queryOne('SELECT about_me, legacy_message, life_story, remembered_for, emergency_contact_name FROM users WHERE id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM trusted_contacts WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM legal_documents    WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM financial_items    WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM funeral_wishes     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM people_to_notify   WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM property_items     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM personal_messages  WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM digital_credentials WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM songs_that_define_me WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM life_wishes        WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM household_info     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM children_dependants WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM pets                WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM insurance_items     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM unfinished_business WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM last_moments        WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM doctors             WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM medical_records     WHERE user_id = $1', [uid]),
    // Existence-only, same as every other single-row section here - a
    // completion count never needs to decrypt donation_bank's vault-protected
    // fields, just know whether a row was ever saved.
    queryOne('SELECT COUNT(*)::int as c FROM donation_bank       WHERE user_id = $1', [uid]),
  ]);

  const howToBeRememberedStarted = [
    userProfile?.about_me, userProfile?.legacy_message,
    userProfile?.life_story, userProfile?.remembered_for,
  ].some(v => v && v.trim().length > 0) ? 1 : 0;

  res.json({
    how_to_be_remembered:  howToBeRememberedStarted,
    legal_documents:       ld.c,
    financial_items:       fi.c,
    funeral_wishes:        fw.c,
    people_to_notify:      ptn.c,
    property_items:        pi.c,
    personal_messages:     pm.c,
    digital_credentials:   dc.c,
    emergency_contact:     userProfile?.emergency_contact_name ? 1 : 0,
    trusted_contacts:      tcCount.c,
    songs_that_define_me:  stm.c,
    life_wishes:           lw.c,
    'household-info':      hi.c,
    'children-dependants': cd.c,
    'pet-care':             pet.c,
    insurance_items:       ins.c,
    unfinished_business:   ub.c,
    last_moments:          lm.c,
    doctors:               doc.c,
    medical_records:       mr.c,
    donation_bank:         db.c,
  });
});

// REV-17 (2026-08-26 review): the four list sections below that accept file
// attachments (legal_documents, financial_items, property_items,
// household_info - see FileAttachments.jsx's sectionId values) used to leave
// those attachments behind when the item itself was deleted. Legal Documents
// removed the uploaded_documents rows but never the R2 objects they pointed
// at, which permanently orphaned the underlying files (wills, PoA scans):
// once the row holding the r2_key is gone, nothing can find that object again,
// not even full account deletion, which enumerates the same table. The other
// three never touched uploaded_documents at all, leaving orphan rows too.
//
// R2 deletion is best effort, the same way destroyVaultData() and the voice
// clip deletes below treat it: a storage hiccup must not fail the user's
// delete. The rows go regardless, so the worst case is the pre-existing
// orphaned-object behavior rather than an item the user cannot remove.
async function deleteItemAttachments(userId, sectionId, itemId) {
  const docs = await queryAll(
    'SELECT r2_key FROM uploaded_documents WHERE user_id = $1 AND section_id = $2 AND item_id = $3',
    [userId, sectionId, itemId]
  );
  for (const doc of docs) {
    await deleteFile(doc.r2_key).catch(() => {});
  }
  await query(
    'DELETE FROM uploaded_documents WHERE user_id = $1 AND section_id = $2 AND item_id = $3',
    [userId, sectionId, itemId]
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Legal Documents (vault-protected)
// ---------------------------------------------------------------------------
router.post('/legal-documents/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  // REV-07 (2026-08-26 review): checkVault() now returns the vault key it
  // already derived internally on success, instead of a plain `true` - reuse
  // it here rather than calling deriveKey() a second time with the same
  // password/userId, which paid scryptSync's deliberate ~50-100ms cost twice.
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const rows = await queryAll('SELECT * FROM legal_documents WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  const items = [];
  for (const row of rows) {
    const { decrypted, legacyPlaintext } = decryptRow('legal_documents', row, key);
    items.push(decrypted);
    if (legacyPlaintext) await migrateRow(query, 'legal_documents', row.id, decrypted, key);
  }
  res.json(items);
});

router.post('/legal-documents', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, document_type, title, held_by, location, notes } = req.body;
  // REV-07: reuse the key checkVault() already derived, instead of deriving it again.
  // Vault-password verification (and its attempt/lockout tracking) still runs
  // before the title validation below, same order as before this fix.
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  if (!title) return res.status(400).json({ error: 'A title or description is required.' });
  const result = await query(`
    INSERT INTO legal_documents (user_id, document_type_enc, title_enc, held_by_enc, location_enc, notes_enc)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [
    req.user.id,
    encryptField(document_type, key),
    encryptField(title, key),
    encryptField(held_by, key),
    encryptField(location, key),
    encryptField(notes, key),
  ]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/legal-documents/:id', requireAuth, requirePremium, async (req, res) => {
  const row = await queryOne('SELECT * FROM legal_documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Item not found.' });
  const { vault_password, document_type, title, held_by, location, notes } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const { decrypted } = decryptRow('legal_documents', row, key);
  await migrateRow(query, 'legal_documents', row.id, {
    document_type: document_type ?? decrypted.document_type,
    title:         title ?? decrypted.title,
    held_by:       held_by ?? decrypted.held_by,
    location:      location ?? decrypted.location,
    notes:         notes ?? decrypted.notes,
  }, key);
  res.json({ success: true });
});

router.delete('/legal-documents/:id', requireAuth, requirePremium, async (req, res) => {
  const item = await queryOne('SELECT * FROM legal_documents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (!await checkVault(req.body?.vault_password, req.user.id, res, req)) return;
  await deleteItemAttachments(req.user.id, 'legal_documents', item.id);
  await query('DELETE FROM legal_documents WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 2 — Financial Affairs
// ---------------------------------------------------------------------------
router.post('/financial-affairs/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const rows = await queryAll('SELECT * FROM financial_items WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  const items = [];
  for (const row of rows) {
    const { decrypted, legacyPlaintext } = decryptRow('financial_items', row, key);
    items.push(decrypted);
    if (legacyPlaintext) await migrateRow(query, 'financial_items', row.id, decrypted, key);
  }
  res.json(items);
});

router.post('/financial-affairs', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, category, institution, account_type, account_reference, contact_name, contact_phone, notes } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  if (!institution && !category) return res.status(400).json({ error: 'Please provide at least an institution or category.' });
  const result = await query(`
    INSERT INTO financial_items (user_id, category_enc, institution_enc, account_type_enc, account_reference_enc, contact_name_enc, contact_phone_enc, notes_enc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, [
    req.user.id,
    encryptField(category, key),
    encryptField(institution, key),
    encryptField(account_type, key),
    encryptField(account_reference, key),
    encryptField(contact_name, key),
    encryptField(contact_phone, key),
    encryptField(notes, key),
  ]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/financial-affairs/:id', requireAuth, requirePremium, async (req, res) => {
  const row = await queryOne('SELECT * FROM financial_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Item not found.' });
  const { vault_password, category, institution, account_type, account_reference, contact_name, contact_phone, notes } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const { decrypted } = decryptRow('financial_items', row, key);
  await migrateRow(query, 'financial_items', row.id, {
    category:          category ?? decrypted.category,
    institution:       institution ?? decrypted.institution,
    account_type:      account_type ?? decrypted.account_type,
    account_reference: account_reference ?? decrypted.account_reference,
    contact_name:      contact_name ?? decrypted.contact_name,
    contact_phone:     contact_phone ?? decrypted.contact_phone,
    notes:             notes ?? decrypted.notes,
  }, key);
  res.json({ success: true });
});

router.delete('/financial-affairs/:id', requireAuth, requirePremium, async (req, res) => {
  const item = await queryOne('SELECT * FROM financial_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (!await checkVault(req.body?.vault_password, req.user.id, res, req)) return;
  await deleteItemAttachments(req.user.id, 'financial_items', item.id);
  await query('DELETE FROM financial_items WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 4 — Funeral & End-of-Life Wishes
// ---------------------------------------------------------------------------
router.get('/funeral-wishes', requireAuth, async (req, res) => {
  res.json(await queryOne('SELECT * FROM funeral_wishes WHERE user_id = $1', [req.user.id]) || {});
});

router.put('/funeral-wishes', requireAuth, async (req, res) => {
  const { burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan,
          pre_paid_details, readings, flowers_preference,
          donation_charity, special_requests, notes } = req.body;
  const existing = await queryOne('SELECT id FROM funeral_wishes WHERE user_id = $1', [req.user.id]);
  if (existing) {
    await query(`
      UPDATE funeral_wishes SET burial_preference=$1, ceremony_type=$2, ceremony_location=$3,
      funeral_home=$4, pre_paid_plan=$5, pre_paid_details=$6, readings=$7,
      flowers_preference=$8, donation_charity=$9, special_requests=$10, notes=$11, updated_at=NOW()
      WHERE user_id=$12
    `, [burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan ? 1 : 0,
        pre_paid_details, readings, flowers_preference,
        donation_charity, special_requests, notes, req.user.id]);
  } else {
    await query(`
      INSERT INTO funeral_wishes (user_id, burial_preference, ceremony_type, ceremony_location,
      funeral_home, pre_paid_plan, pre_paid_details, readings,
      flowers_preference, donation_charity, special_requests, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [req.user.id, burial_preference, ceremony_type, ceremony_location, funeral_home,
        pre_paid_plan ? 1 : 0, pre_paid_details, readings,
        flowers_preference, donation_charity, special_requests, notes]);
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 5a — Doctors (IDEA-32: split out of Medical & Care Wishes)
// Single record per user, open to all users - same protection level (none)
// the old medical_wishes had for these particular fields.
// ---------------------------------------------------------------------------
router.get('/doctors', requireAuth, async (req, res) => {
  res.json(await queryOne('SELECT * FROM doctors WHERE user_id = $1', [req.user.id]) || {});
});

router.put('/doctors', requireAuth, async (req, res) => {
  const { gp_name, gp_phone, hospital_preference } = req.body;
  const existing = await queryOne('SELECT id FROM doctors WHERE user_id = $1', [req.user.id]);
  if (existing) {
    await query(`
      UPDATE doctors SET gp_name=$1, gp_phone=$2, hospital_preference=$3, updated_at=NOW() WHERE user_id=$4
    `, [gp_name, gp_phone, hospital_preference, req.user.id]);
  } else {
    await query(`
      INSERT INTO doctors (user_id, gp_name, gp_phone, hospital_preference)
      VALUES ($1, $2, $3, $4)
    `, [req.user.id, gp_name, gp_phone, hospital_preference]);
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 5b — Medical Records (IDEA-32: split out of Medical & Care Wishes)
// Advance care directive, DNR preference, medications, conditions, notes.
// Single record per user, open to all users, same as Doctors above.
// ---------------------------------------------------------------------------
router.get('/medical-records', requireAuth, async (req, res) => {
  res.json(await queryOne('SELECT * FROM medical_records WHERE user_id = $1', [req.user.id]) || {});
});

router.put('/medical-records', requireAuth, async (req, res) => {
  const { advance_care_directive, directive_location, dnr_preference,
          current_medications, medical_conditions, notes } = req.body;
  const existing = await queryOne('SELECT id FROM medical_records WHERE user_id = $1', [req.user.id]);
  if (existing) {
    await query(`
      UPDATE medical_records SET advance_care_directive=$1, directive_location=$2, dnr_preference=$3,
      current_medications=$4, medical_conditions=$5, notes=$6, updated_at=NOW() WHERE user_id=$7
    `, [advance_care_directive ? 1 : 0, directive_location, dnr_preference,
        current_medications, medical_conditions, notes, req.user.id]);
  } else {
    await query(`
      INSERT INTO medical_records
        (user_id, advance_care_directive, directive_location, dnr_preference, current_medications, medical_conditions, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [req.user.id, advance_care_directive ? 1 : 0, directive_location, dnr_preference,
        current_medications, medical_conditions, notes]);
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 5c — Donation Bank (IDEA-32: split out of Medical & Care Wishes)
// Organ/body/blood donation preferences. Unlike Doctors and Medical Records,
// this is NEW to the shared vault (same vault/password as Legal Documents,
// Digital Life, Financial Affairs, Property & Possessions, Practical
// Household Information below) - donation preferences are more sensitive
// than the rest of old Medical, per an explicit product decision. Single
// record per user, but vault-gated and field-encrypted like the other four
// vault sections, not a list like them.
// ---------------------------------------------------------------------------
router.post('/donation-bank/view', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const row = await queryOne('SELECT * FROM donation_bank WHERE user_id = $1', [req.user.id]);
  if (!row) return res.json({});
  const { decrypted, legacyPlaintext } = decryptRow('donation_bank', row, key);
  if (legacyPlaintext) await migrateRow(query, 'donation_bank', row.id, decrypted, key);
  res.json(decrypted);
});

router.put('/donation-bank', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, organ_donation, organ_donation_details } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const existing = await queryOne('SELECT * FROM donation_bank WHERE user_id = $1', [req.user.id]);
  if (existing) {
    const { decrypted } = decryptRow('donation_bank', existing, key);
    await migrateRow(query, 'donation_bank', existing.id, {
      organ_donation:         organ_donation ?? decrypted.organ_donation,
      organ_donation_details: organ_donation_details ?? decrypted.organ_donation_details,
    }, key);
  } else {
    await query(`
      INSERT INTO donation_bank (user_id, organ_donation_enc, organ_donation_details_enc)
      VALUES ($1, $2, $3)
    `, [req.user.id, encryptField(organ_donation, key), encryptField(organ_donation_details, key)]);
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 6 — People to Notify
// ---------------------------------------------------------------------------
router.get('/people-to-notify', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM people_to_notify WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]));
});

router.post('/people-to-notify', requireAuth, async (req, res) => {
  const { name, relationship, email, phone, notified_by, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const result = await query(`
    INSERT INTO people_to_notify (user_id, name, relationship, email, phone, notified_by, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [req.user.id, name, relationship || null, email || null, phone || null, notified_by || null, notes || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/people-to-notify/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM people_to_notify WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { name, relationship, email, phone, notified_by, notes } = req.body;
  await query(`
    UPDATE people_to_notify SET name=$1, relationship=$2, email=$3, phone=$4, notified_by=$5, notes=$6 WHERE id=$7
  `, [name ?? item.name, relationship ?? item.relationship, email ?? item.email,
      phone ?? item.phone, notified_by ?? item.notified_by, notes ?? item.notes, item.id]);
  res.json({ success: true });
});

router.delete('/people-to-notify/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM people_to_notify WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  await query('DELETE FROM people_to_notify WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 7 — Property & Possessions
// ---------------------------------------------------------------------------
router.post('/property-possessions/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const rows = await queryAll('SELECT * FROM property_items WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  const items = [];
  for (const row of rows) {
    const { decrypted, legacyPlaintext } = decryptRow('property_items', row, key);
    items.push(decrypted);
    if (legacyPlaintext) await migrateRow(query, 'property_items', row.id, decrypted, key);
  }
  res.json(items);
});

router.post('/property-possessions', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, category, title, description, location, intended_recipient, notes } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const result = await query(`
    INSERT INTO property_items (user_id, category_enc, title_enc, description_enc, location_enc, intended_recipient_enc, notes_enc)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [
    req.user.id,
    encryptField(category, key),
    encryptField(title, key),
    encryptField(description, key),
    encryptField(location, key),
    encryptField(intended_recipient, key),
    encryptField(notes, key),
  ]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/property-possessions/:id', requireAuth, requirePremium, async (req, res) => {
  const row = await queryOne('SELECT * FROM property_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Item not found.' });
  const { vault_password, category, title, description, location, intended_recipient, notes } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const { decrypted } = decryptRow('property_items', row, key);
  await migrateRow(query, 'property_items', row.id, {
    category:            category ?? decrypted.category,
    title:               title ?? decrypted.title,
    description:         description ?? decrypted.description,
    location:            location ?? decrypted.location,
    intended_recipient:  intended_recipient ?? decrypted.intended_recipient,
    notes:               notes ?? decrypted.notes,
  }, key);
  res.json({ success: true });
});

router.delete('/property-possessions/:id', requireAuth, requirePremium, async (req, res) => {
  const item = await queryOne('SELECT * FROM property_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (!await checkVault(req.body?.vault_password, req.user.id, res, req)) return;
  await deleteItemAttachments(req.user.id, 'property_items', item.id);
  await query('DELETE FROM property_items WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 8 — Messages to Loved Ones
// ---------------------------------------------------------------------------
router.get('/messages', requireAuth, async (req, res) => {
  const rows = await queryAll('SELECT * FROM personal_messages WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json(await Promise.all(rows.map(withAudioClips)));
});

router.post('/messages', requireAuth, async (req, res) => {
  const { recipient_name, relationship, message, notes } = req.body;
  if (!recipient_name) return res.status(400).json({ error: 'A recipient name is required.' });
  const result = await query(`
    INSERT INTO personal_messages (user_id, recipient_name, relationship, message, notes)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [req.user.id, recipient_name, relationship || null, message || null, notes || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/messages/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM personal_messages WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Message not found.' });
  const { recipient_name, relationship, message, notes } = req.body;
  await query(`
    UPDATE personal_messages SET recipient_name=$1, relationship=$2, message=$3, notes=$4, updated_at=NOW() WHERE id=$5
  `, [recipient_name ?? item.recipient_name, relationship ?? item.relationship,
      message ?? item.message, notes ?? item.notes, item.id]);
  res.json({ success: true });
});

router.delete('/messages/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM personal_messages WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Message not found.' });
  const clips = await queryAll('SELECT r2_key FROM personal_message_audio_clips WHERE message_id = $1', [item.id]);
  await Promise.all(clips.map(c => deleteFile(c.r2_key).catch(() => {})));
  // Legacy safety net: normally null post-migration (see database.js init),
  // but harmless to also check here in case this ever runs before init.
  if (item.audio_r2_key) await deleteFile(item.audio_r2_key).catch(() => {});
  await query('DELETE FROM personal_messages WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// IDEA-01/IDEA-34: up to 3 optional recorded voice clips alongside (not
// instead of) the typed/dictated text. Open to all users, same as the rest of
// this section - not premium-gated (unlike the vault-adjacent sections
// above). Clips live in personal_message_audio_clips, one row per clip; the
// legacy audio_r2_key etc. columns on personal_messages (IDEA-01's original
// one-clip-per-row design) are no longer written to - see database.js.
const AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']);
const AUDIO_EXTENSIONS = new Set(['webm', 'ogg', 'mp4', 'm4a', 'mp3', 'wav']);
const MAX_AUDIO_DURATION_SECONDS = 300; // 5 minutes - a soft guardrail on storage cost, not enforced against determined tampering
const MAX_AUDIO_CLIPS_PER_MESSAGE = 3;

// MediaRecorder in the browser reports mimeType with a codec parameter
// (e.g. "audio/webm;codecs=opus"), which would never exact-match the plain
// "audio/webm" entries above - strip it before comparing or storing.
function baseMimeType(mimeType) {
  return (mimeType || '').split(';')[0].trim().toLowerCase();
}

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  // Both the declared MIME type AND the extension must be on the allow-list
  // (not either/or - a mismatched pair like a .mp3 name with an
  // application/octet-stream or text/html Content-Type must still be
  // rejected here). This is only the first of two checks - see the
  // matchesExtension() byte-signature verification in the route handler
  // below, same SEC-11 pattern documents.js/admin.js/organizations.js/
  // orgPortal.js already use: a client can freely lie about both of these
  // fields, so neither alone (nor their disjunction) is trustworthy.
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!AUDIO_MIME_TYPES.has(baseMimeType(file.mimetype)) || !AUDIO_EXTENSIONS.has(ext)) {
      return cb(new Error('That recording format is not supported.'));
    }
    cb(null, true);
  },
});

// A signed R2 URL never gets stored - only ever generated fresh per request,
// same pattern as documents.js's download route. Still used by Your Last
// Moments below (single clip, IDEA-30), which IDEA-34 did not change.
async function withAudioUrl(row) {
  if (!row.audio_r2_key) return row;
  const { audio_r2_key, ...rest } = row;
  return { ...rest, audio_url: await getDownloadUrl(audio_r2_key) };
}

// Signed R2 URLs never get stored - only ever generated fresh per request,
// same pattern as documents.js's download route. Returns the message with an
// audio_clips array (0-3 entries) instead of a single audio_url.
async function withAudioClips(row) {
  const clips = await queryAll(
    'SELECT id, r2_key, duration_seconds FROM personal_message_audio_clips WHERE message_id = $1 ORDER BY created_at',
    [row.id]
  );
  const { audio_r2_key, audio_mime_type, audio_size_bytes, audio_duration_seconds, ...rest } = row;
  return {
    ...rest,
    audio_clips: await Promise.all(clips.map(async c => ({
      id: c.id,
      audio_url: await getDownloadUrl(c.r2_key),
      duration_seconds: c.duration_seconds,
    }))),
  };
}

router.post('/messages/:id/audio', requireAuth, (req, res, next) => {
  audioUpload.single('audio')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const item = await queryOne('SELECT id FROM personal_messages WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!item) return res.status(404).json({ error: 'Message not found.' });
    if (!req.file) return res.status(400).json({ error: 'No recording provided.' });

    const existingCount = await queryOne(
      'SELECT COUNT(*)::int AS c FROM personal_message_audio_clips WHERE message_id = $1', [item.id]
    );
    if (existingCount.c >= MAX_AUDIO_CLIPS_PER_MESSAGE) {
      return res.status(400).json({ error: 'This message already has the maximum of 3 voice recordings. Delete one first to add another.' });
    }

    const mimeType = baseMimeType(req.file.mimetype) || 'audio/webm';
    const ext = (req.file.originalname.split('.').pop() || 'webm').replace(/[^a-zA-Z0-9]/g, '');
    // fileFilter only checked what the client claimed (mimetype + extension,
    // both attacker-controlled) - this confirms the bytes we're about to
    // store, and later serve back with this same mimeType as the R2 object's
    // Content-Type, actually match (SEC-11 pattern, same as documents.js).
    if (!matchesExtension(req.file.buffer, ext)) {
      return res.status(400).json({ error: "That recording's content doesn't match its format. Please try recording again." });
    }
    const key = `${req.user.id}/messages/${item.id}/${uuidv4()}.${ext}`;
    await uploadFile({ key, buffer: req.file.buffer, mimeType });

    const duration = Math.min(parseInt(req.body.duration_seconds, 10) || 0, MAX_AUDIO_DURATION_SECONDS) || null;

    let clipId;
    try {
      clipId = await transaction(async (client) => {
        // Re-check the count inside the transaction, with a row lock on the
        // parent message, to close the race between the early check above
        // and this insert - two concurrent uploads for the same message
        // could otherwise both pass the first check and both land, pushing
        // the message past 3 clips.
        await client.query('SELECT id FROM personal_messages WHERE id = $1 FOR UPDATE', [item.id]);
        const recount = await client.query(
          'SELECT COUNT(*)::int AS c FROM personal_message_audio_clips WHERE message_id = $1', [item.id]
        );
        if (recount.rows[0].c >= MAX_AUDIO_CLIPS_PER_MESSAGE) {
          throw Object.assign(new Error('MAX_CLIPS'), { code: 'MAX_CLIPS' });
        }
        const insertRes = await client.query(`
          INSERT INTO personal_message_audio_clips (message_id, r2_key, mime_type, size_bytes, duration_seconds)
          VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [item.id, key, mimeType, req.file.size, duration]);
        return insertRes.rows[0].id;
      });
    } catch (err) {
      if (err.code === 'MAX_CLIPS') {
        await deleteFile(key).catch(() => {});
        return res.status(400).json({ error: 'This message already has the maximum of 3 voice recordings. Delete one first to add another.' });
      }
      throw err;
    }

    await query('UPDATE personal_messages SET updated_at = NOW() WHERE id = $1', [item.id]);

    res.status(201).json({ id: clipId, audio_url: await getDownloadUrl(key), duration_seconds: duration });
  } catch (err) {
    console.error('Voice message upload error:', err);
    res.status(500).json({ error: "We couldn't save your recording. Please try again." });
  }
});

router.delete('/messages/:id/audio/:clipId', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT id FROM personal_messages WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Message not found.' });
  const clip = await queryOne(
    'SELECT * FROM personal_message_audio_clips WHERE id = $1 AND message_id = $2', [req.params.clipId, item.id]
  );
  if (!clip) return res.status(404).json({ error: 'Voice recording not found.' });
  await deleteFile(clip.r2_key).catch(() => {});
  await query('DELETE FROM personal_message_audio_clips WHERE id = $1', [clip.id]);
  await query('UPDATE personal_messages SET updated_at = NOW() WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 11 — Songs That Define Me
// ---------------------------------------------------------------------------
router.get('/songs-that-define-me', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM songs_that_define_me WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]));
});

router.post('/songs-that-define-me', requireAuth, async (req, res) => {
  const { deezer_id, title, artist, album, why_meaningful } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'Title and artist are required.' });
  const count = await queryOne('SELECT COUNT(*)::int as c FROM songs_that_define_me WHERE user_id = $1', [req.user.id]);
  if (count.c >= 50) return res.status(400).json({ error: 'You can add up to 50 songs.' });
  const result = await query(`
    INSERT INTO songs_that_define_me (user_id, deezer_id, title, artist, album, why_meaningful)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [req.user.id, deezer_id || null, title, artist, album || null, why_meaningful || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/songs-that-define-me/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM songs_that_define_me WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Song not found.' });
  const { why_meaningful } = req.body;
  await query('UPDATE songs_that_define_me SET why_meaningful = $1 WHERE id = $2', [why_meaningful ?? item.why_meaningful, item.id]);
  res.json({ success: true });
});

router.delete('/songs-that-define-me/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM songs_that_define_me WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Song not found.' });
  await query('DELETE FROM songs_that_define_me WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 12 — Life's Wishes
// ---------------------------------------------------------------------------
router.get('/lifes-wishes', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM life_wishes WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]));
});

router.post('/lifes-wishes', requireAuth, async (req, res) => {
  const { title, description, category, status, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const result = await query(`
    INSERT INTO life_wishes (user_id, title, description, category, status, notes)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [req.user.id, title, description || null, category || null, status || 'dream', notes || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/lifes-wishes/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM life_wishes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Wish not found.' });
  const { title, description, category, status, notes } = req.body;
  await query(`
    UPDATE life_wishes SET title=$1, description=$2, category=$3, status=$4, notes=$5 WHERE id=$6
  `, [title ?? item.title, description ?? item.description, category ?? item.category,
      status ?? item.status, notes ?? item.notes, item.id]);
  res.json({ success: true });
});

router.delete('/lifes-wishes/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM life_wishes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Wish not found.' });
  await query('DELETE FROM life_wishes WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 13 — Practical Household Information
// ---------------------------------------------------------------------------
router.post('/household-info/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  // No longer sorted by category/title at the DB level - now that those
  // fields are ciphertext, that would sort by encrypted bytes instead of the
  // real values. Sort after decrypting instead.
  const rows = await queryAll('SELECT * FROM household_info WHERE user_id = $1', [req.user.id]);
  const items = [];
  for (const row of rows) {
    const { decrypted, legacyPlaintext } = decryptRow('household_info', row, key);
    items.push(decrypted);
    if (legacyPlaintext) await migrateRow(query, 'household_info', row.id, decrypted, key);
  }
  items.sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.title || '').localeCompare(b.title || ''));
  res.json(items);
});

router.post('/household-info', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, category, title, provider, account_reference, contact, notes } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const result = await query(`
    INSERT INTO household_info (user_id, category_enc, title_enc, provider_enc, account_reference_enc, contact_enc, notes_enc)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [
    req.user.id,
    encryptField(category, key),
    encryptField(title, key),
    encryptField(provider, key),
    encryptField(account_reference, key),
    encryptField(contact, key),
    encryptField(notes, key),
  ]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/household-info/:id', requireAuth, requirePremium, async (req, res) => {
  const row = await queryOne('SELECT * FROM household_info WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Item not found.' });
  const { vault_password, category, title, provider, account_reference, contact, notes } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;
  const { decrypted } = decryptRow('household_info', row, key);
  await migrateRow(query, 'household_info', row.id, {
    category:          category ?? decrypted.category,
    title:             title ?? decrypted.title,
    provider:          provider ?? decrypted.provider,
    account_reference: account_reference ?? decrypted.account_reference,
    contact:           contact ?? decrypted.contact,
    notes:             notes ?? decrypted.notes,
  }, key);
  res.json({ success: true });
});

router.delete('/household-info/:id', requireAuth, requirePremium, async (req, res) => {
  const item = await queryOne('SELECT id FROM household_info WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (!await checkVault(req.body?.vault_password, req.user.id, res, req)) return;
  await deleteItemAttachments(req.user.id, 'household_info', item.id);
  await query('DELETE FROM household_info WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 14 — Your Loved Ones
// ---------------------------------------------------------------------------
router.get('/children-dependants', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM children_dependants WHERE user_id = $1 ORDER BY type, name', [req.user.id]));
});

router.post('/children-dependants', requireAuth, async (req, res) => {
  const { name, type, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, alternate_contact, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const result = await query(`
    INSERT INTO children_dependants
      (user_id, name, type, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, alternate_contact, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
  `, [req.user.id, name, type || null, date_of_birth || null, special_needs || null,
      preferred_guardian || null, guardian_contact || null,
      alternate_guardian || null, alternate_contact || null, notes || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/children-dependants/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM children_dependants WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { name, type, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, alternate_contact, notes } = req.body;
  await query(`
    UPDATE children_dependants
    SET name=$1, type=$2, date_of_birth=$3, special_needs=$4, preferred_guardian=$5,
        guardian_contact=$6, alternate_guardian=$7, alternate_contact=$8, notes=$9
    WHERE id=$10
  `, [name ?? item.name, type ?? item.type, date_of_birth ?? item.date_of_birth,
      special_needs ?? item.special_needs, preferred_guardian ?? item.preferred_guardian,
      guardian_contact ?? item.guardian_contact, alternate_guardian ?? item.alternate_guardian,
      alternate_contact ?? item.alternate_contact, notes ?? item.notes, item.id]);
  res.json({ success: true });
});

router.delete('/children-dependants/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT id FROM children_dependants WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  await query('DELETE FROM children_dependants WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 15 — Pet Care (IDEA-18: split out of Your Loved Ones)
// ---------------------------------------------------------------------------
router.get('/pets', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM pets WHERE user_id = $1 ORDER BY name', [req.user.id]));
});

router.post('/pets', requireAuth, async (req, res) => {
  const { name, age, special_needs, preferred_caretaker, caretaker_contact, alternate_caretaker, alternate_contact, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const result = await query(`
    INSERT INTO pets
      (user_id, name, age, special_needs, preferred_caretaker, caretaker_contact, alternate_caretaker, alternate_contact, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
  `, [req.user.id, name, age || null, special_needs || null,
      preferred_caretaker || null, caretaker_contact || null,
      alternate_caretaker || null, alternate_contact || null, notes || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/pets/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM pets WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { name, age, special_needs, preferred_caretaker, caretaker_contact, alternate_caretaker, alternate_contact, notes } = req.body;
  await query(`
    UPDATE pets
    SET name=$1, age=$2, special_needs=$3, preferred_caretaker=$4,
        caretaker_contact=$5, alternate_caretaker=$6, alternate_contact=$7, notes=$8
    WHERE id=$9
  `, [name ?? item.name, age ?? item.age, special_needs ?? item.special_needs,
      preferred_caretaker ?? item.preferred_caretaker, caretaker_contact ?? item.caretaker_contact,
      alternate_caretaker ?? item.alternate_caretaker, alternate_contact ?? item.alternate_contact,
      notes ?? item.notes, item.id]);
  res.json({ success: true });
});

router.delete('/pets/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT id FROM pets WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  await query('DELETE FROM pets WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 3 — Digital Life (encrypted vault)
// ---------------------------------------------------------------------------
router.get('/digital-life/vault', requireAuth, async (req, res) => {
  const vault = await queryOne(
    'SELECT id, password_hint, recovery_enabled, destroy_after_attempts, logout_after_attempts, lockout_after_attempts FROM digital_vault WHERE user_id = $1',
    [req.user.id]
  );
  // This reflects mutable, per-user security state (recovery_enabled,
  // destroy_after_attempts, logout/lockout thresholds) - a stale cached copy
  // could show outdated settings on the Profile/vault-lock screens after a
  // user changes them.
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({
    exists: !!vault,
    hint: vault?.password_hint || null,
    recovery_enabled: vault?.recovery_enabled || false,
    destroy_after_attempts: vault?.destroy_after_attempts ?? null,
    logout_after_attempts: vault?.logout_after_attempts ?? null,
    lockout_after_attempts: vault?.lockout_after_attempts ?? null,
  });
});

router.post('/digital-life/vault', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, password_hint } = req.body;
  if (!vault_password || vault_password.length < 8) {
    return res.status(400).json({ error: 'Vault password must be at least 8 characters.' });
  }
  const hint = (password_hint || '').trim().slice(0, 200) || null;
  if (hint && hint.toLowerCase().includes(vault_password.toLowerCase())) {
    return res.status(400).json({ error: "Your hint shouldn't contain your actual vault password." });
  }
  const existing = await queryOne('SELECT id FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (existing) {
    return res.status(409).json({ error: 'Vault already set up. Use the change password flow.' });
  }
  const key      = deriveKey(vault_password, req.user.id);
  const checkEnc = createVaultCheck(key);
  await query('INSERT INTO digital_vault (user_id, check_enc, password_hint) VALUES ($1, $2, $3)', [req.user.id, checkEnc, hint]);
  res.status(201).json({ success: true });
});

router.put('/digital-life/vault', requireAuth, async (req, res) => {
  const { old_password, new_password, password_hint } = req.body;
  if (!old_password) return res.status(400).json({ error: 'old_password is required.' });
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (old_password === new_password) return res.status(400).json({ error: 'New password must be different from the current one.' });

  const vault = await queryOne('SELECT id, check_enc, recovery_enabled FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  // password_hint is optional here: undefined leaves the existing hint
  // untouched (most password changes aren't also updating the hint), an
  // empty string clears it, anything else replaces it.
  const hintProvided = password_hint !== undefined;
  const newHint = hintProvided ? ((password_hint || '').trim().slice(0, 200) || null) : undefined;
  if (newHint && newHint.toLowerCase().includes(new_password.toLowerCase())) {
    return res.status(400).json({ error: "Your hint shouldn't contain your actual vault password." });
  }

  const oldKey = deriveKey(old_password, req.user.id);
  if (!verifyVaultPassword(vault.check_enc, oldKey)) {
    return res.status(401).json({ error: 'Current vault password is incorrect.' });
  }

  const newKey   = deriveKey(new_password, req.user.id);
  const newCheck = createVaultCheck(newKey);

  await transaction(async (client) => {
    const rows = (await client.query(
      'SELECT id, username_enc, password_enc, notes_enc FROM digital_credentials WHERE user_id = $1',
      [req.user.id]
    )).rows;

    for (const row of rows) {
      await client.query(`
        UPDATE digital_credentials
        SET username_enc=$1, password_enc=$2, notes_enc=$3, updated_at=NOW()
        WHERE id=$4
      `, [
        encryptField(decryptField(row.username_enc, oldKey), newKey),
        encryptField(decryptField(row.password_enc, oldKey), newKey),
        encryptField(decryptField(row.notes_enc,    oldKey), newKey),
        row.id,
      ]);
    }

    // SEC-03: the other 4 vault-protected tables also need re-encrypting
    // under the new key. Rows still on legacy plaintext (never migrated
    // because the owner hadn't read/written them since SEC-03 shipped) get
    // upgraded to encrypted here too, using this same transaction - a vault
    // password change is exactly the kind of full-vault-touch moment that
    // makes that migration free to do alongside the real work.
    const clientQuery = (sql, params) => client.query(sql, params);
    for (const table of Object.keys(TABLE_FIELDS)) {
      const tableRows = (await client.query(`SELECT * FROM ${table} WHERE user_id = $1`, [req.user.id])).rows;
      for (const row of tableRows) {
        const { decrypted } = decryptRow(table, row, oldKey);
        await migrateRow(clientQuery, table, row.id, decrypted, newKey);
      }
    }

    // A password change invalidates the security-question recovery escrow
    // (it was encrypted under the old key) - re-escrowing would mean asking
    // for recovery answers on every routine password change, so instead we
    // turn recovery off explicitly and ask the client to tell the user,
    // rather than silently leaving stale, non-functional shares behind.
    // Still respects the existing hint-update behavior (IDEA-15).
    if (hintProvided) {
      await client.query(
        'UPDATE digital_vault SET check_enc=$1, password_hint=$2, recovery_enabled=false WHERE user_id=$3',
        [newCheck, newHint, req.user.id]
      );
    } else {
      await client.query(
        'UPDATE digital_vault SET check_enc=$1, recovery_enabled=false WHERE user_id=$2',
        [newCheck, req.user.id]
      );
    }
    if (vault.recovery_enabled) {
      await client.query('DELETE FROM vault_recovery_questions WHERE digital_vault_id = $1', [vault.id]);
      await client.query('DELETE FROM vault_recovery_shares WHERE digital_vault_id = $1', [vault.id]);
    }
  });

  res.json({ success: true, recovery_disabled: !!vault.recovery_enabled });
});

router.delete('/digital-life/vault', requireAuth, async (req, res) => {
  const { account_password } = req.body;
  if (!account_password) return res.status(400).json({ error: 'account_password is required to confirm vault reset.' });

  const bcrypt = require('bcryptjs');
  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Account not found. Please log out and log in again.' });
  if (!bcrypt.compareSync(account_password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect account password. Please enter the password you use to log in to In Good Hands.' });
  }

  await destroyVaultData(req.user.id, { reason: 'vault_destroyed_manual', req });

  res.json({ success: true, message: 'Vault reset. You can now create a new vault password.' });
});

router.post('/digital-life/vault/verify', requireAuth, async (req, res) => {
  if (!await checkVault(req.body.vault_password, req.user.id, res, req)) return;
  res.json({ valid: true });
});

router.post('/digital-life/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;

  const rows = await queryAll(
    'SELECT id, service, service_url, username_enc, password_enc, notes_enc, created_at FROM digital_credentials WHERE user_id = $1 ORDER BY service',
    [req.user.id]
  );

  res.json(rows.map(row => ({
    id:          row.id,
    service:     row.service,
    service_url: row.service_url,
    username:    decryptField(row.username_enc, key),
    password:    decryptField(row.password_enc, key),
    notes:       decryptField(row.notes_enc, key),
    created_at:  row.created_at,
  })));
});

router.post('/digital-life', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, service, service_url, username, password, notes } = req.body;
  if (!service)        return res.status(400).json({ error: 'Service name is required.' });
  if (!username && !password) return res.status(400).json({ error: 'At least a username or password is required.' });

  // REV-09: was verifying the vault password inline with deriveKey()/
  // verifyVaultPassword() directly instead of going through checkVault(),
  // so wrong guesses here never fed the shared attempt-counter/lockout
  // tracking. Now matches every other vault-protected route in this file.
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;

  const result = await query(`
    INSERT INTO digital_credentials (user_id, service, service_url, username_enc, password_enc, notes_enc)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [req.user.id, service, service_url || null,
      encryptField(username, key), encryptField(password, key), encryptField(notes, key)]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/digital-life/:id', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, service, service_url, username, password, notes } = req.body;

  const item = await queryOne('SELECT * FROM digital_credentials WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Credential not found.' });

  // REV-09: was verifying the vault password inline instead of going through
  // checkVault(), which also meant `vault.check_enc` was dereferenced with no
  // null check if the user somehow had no vault row. checkVault() covers both.
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;

  await query(`
    UPDATE digital_credentials
    SET service=$1, service_url=$2, username_enc=$3, password_enc=$4, notes_enc=$5, updated_at=NOW()
    WHERE id=$6
  `, [
    service     ?? item.service,
    service_url !== undefined ? (service_url || null) : item.service_url,
    username    !== undefined ? encryptField(username, key) : item.username_enc,
    password    !== undefined ? encryptField(password, key) : item.password_enc,
    notes       !== undefined ? encryptField(notes, key)    : item.notes_enc,
    item.id,
  ]);
  res.json({ success: true });
});

router.delete('/digital-life/:id', requireAuth, requirePremium, async (req, res) => {
  if (!await checkVault(req.body.vault_password, req.user.id, res, req)) return;
  const item = await queryOne('SELECT id FROM digital_credentials WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Credential not found.' });
  await query('DELETE FROM digital_credentials WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 16 — Insurance (IDEA-29)
// Flat list of policy entries, NOT vault-protected - same non-encrypted,
// no-requirePremium pattern as pets/children-dependants/people-to-notify
// above, not the shared-vault pattern used by legal-documents/financial-
// affairs/property-possessions/household-info below.
// ---------------------------------------------------------------------------
router.get('/insurance', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM insurance_items WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]));
});

router.post('/insurance', requireAuth, async (req, res) => {
  const { policy_type, provider, policy_number, contact, beneficiary, notes } = req.body;
  if (!policy_type && !provider) {
    return res.status(400).json({ error: 'Please provide at least a policy type or provider.' });
  }
  const result = await query(`
    INSERT INTO insurance_items (user_id, policy_type, provider, policy_number, contact, beneficiary, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [req.user.id, policy_type || null, provider || null, policy_number || null,
      contact || null, beneficiary || null, notes || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/insurance/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM insurance_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { policy_type, provider, policy_number, contact, beneficiary, notes } = req.body;
  await query(`
    UPDATE insurance_items
    SET policy_type=$1, provider=$2, policy_number=$3, contact=$4, beneficiary=$5, notes=$6, updated_at=NOW()
    WHERE id=$7
  `, [policy_type ?? item.policy_type, provider ?? item.provider, policy_number ?? item.policy_number,
      contact ?? item.contact, beneficiary ?? item.beneficiary, notes ?? item.notes, item.id]);
  res.json({ success: true });
});

router.delete('/insurance/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT id FROM insurance_items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  await query('DELETE FROM insurance_items WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 17 — Unfinished Business (IDEA-19)
// One entry per person or topic - reconciliation, apologies, and other loose
// ends - deliberately separate from My Bucket List (aspirational future
// goals) and Messages to Loved Ones (final words per recipient). Flat list,
// NOT vault-protected, same no-requirePremium pattern as pets/insurance/
// children-dependants above.
// ---------------------------------------------------------------------------
router.get('/unfinished-business', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM unfinished_business WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]));
});

router.post('/unfinished-business', requireAuth, async (req, res) => {
  const { name, description, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const result = await query(`
    INSERT INTO unfinished_business (user_id, name, description, notes)
    VALUES ($1, $2, $3, $4) RETURNING id
  `, [req.user.id, name, description || null, notes || null]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/unfinished-business/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT * FROM unfinished_business WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { name, description, notes } = req.body;
  await query(`
    UPDATE unfinished_business
    SET name=$1, description=$2, notes=$3, updated_at=NOW()
    WHERE id=$4
  `, [name ?? item.name, description ?? item.description, notes ?? item.notes, item.id]);
  res.json({ success: true });
});

router.delete('/unfinished-business/:id', requireAuth, async (req, res) => {
  const item = await queryOne('SELECT id FROM unfinished_business WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  await query('DELETE FROM unfinished_business WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 18 — Your Last Moments (IDEA-30)
// A distinct section from Messages to Loved Ones (personal_messages): one
// weightier, single recording/letter per user rather than a list of messages
// to different recipients. Single row per user, same soft-singleton pattern
// (checked-then-insert-or-update, no UNIQUE constraint) as funeral_wishes/
// medical_wishes above. NOT vault-protected, but IS premium-gated (unlike
// Messages to Loved Ones/How I'd Like to Be Remembered/Songs/Bucket List,
// its dashboard groupmates) - this was an assumption made without an explicit
// product decision, flagged for confirmation; see IDEA-30 memory notes.
// requirePremium sits on the mutating routes only, same GET-is-always-
// readable / write-is-gated pattern as legal-documents/financial-affairs
// above. The optional voice recording reuses IDEA-01's exact audio pipeline
// (multer -> fileSignature byte-check -> R2), not a new one.
// ---------------------------------------------------------------------------
router.get('/last-moments', requireAuth, async (req, res) => {
  const row = await queryOne('SELECT * FROM last_moments WHERE user_id = $1', [req.user.id]);
  res.json(await withAudioUrl(row || {}));
});

router.put('/last-moments', requireAuth, requirePremium, async (req, res) => {
  const { message, notes } = req.body;
  const existing = await queryOne('SELECT id FROM last_moments WHERE user_id = $1', [req.user.id]);
  if (existing) {
    await query(`
      UPDATE last_moments SET message=$1, notes=$2, updated_at=NOW() WHERE user_id=$3
    `, [message ?? null, notes ?? null, req.user.id]);
  } else {
    await query(`
      INSERT INTO last_moments (user_id, message, notes) VALUES ($1, $2, $3)
    `, [req.user.id, message || null, notes || null]);
  }
  res.json({ success: true });
});

router.post('/last-moments/audio', requireAuth, requirePremium, (req, res, next) => {
  audioUpload.single('audio')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No recording provided.' });

    // A recording can arrive before any row exists yet (the text side may
    // still be blank) - create the row on demand, same as an empty PUT would.
    let item = await queryOne('SELECT * FROM last_moments WHERE user_id = $1', [req.user.id]);
    if (!item) {
      const result = await query('INSERT INTO last_moments (user_id) VALUES ($1) RETURNING *', [req.user.id]);
      item = result.rows[0];
    }

    const mimeType = baseMimeType(req.file.mimetype) || 'audio/webm';
    const ext = (req.file.originalname.split('.').pop() || 'webm').replace(/[^a-zA-Z0-9]/g, '');
    // Same SEC-11 byte-signature check as the Messages to Loved Ones upload
    // above - fileFilter only checked the client's claims.
    if (!matchesExtension(req.file.buffer, ext)) {
      return res.status(400).json({ error: "That recording's content doesn't match its format. Please try recording again." });
    }
    const key = `${req.user.id}/last-moments/${uuidv4()}.${ext}`;
    await uploadFile({ key, buffer: req.file.buffer, mimeType });

    const previousKey = item.audio_r2_key;
    const duration = Math.min(parseInt(req.body.duration_seconds, 10) || 0, MAX_AUDIO_DURATION_SECONDS) || null;

    await query(`
      UPDATE last_moments
      SET audio_r2_key = $1, audio_mime_type = $2, audio_size_bytes = $3, audio_duration_seconds = $4, updated_at = NOW()
      WHERE id = $5
    `, [key, mimeType, req.file.size, duration, item.id]);

    if (previousKey) await deleteFile(previousKey).catch(() => {});

    res.json({ audio_url: await getDownloadUrl(key), audio_duration_seconds: duration });
  } catch (err) {
    console.error('Last moments recording upload error:', err);
    res.status(500).json({ error: "We couldn't save your recording. Please try again." });
  }
});

router.delete('/last-moments/audio', requireAuth, requirePremium, async (req, res) => {
  const item = await queryOne('SELECT * FROM last_moments WHERE user_id = $1', [req.user.id]);
  if (!item || !item.audio_r2_key) return res.json({ success: true });
  await deleteFile(item.audio_r2_key).catch(() => {});
  await query(`
    UPDATE last_moments
    SET audio_r2_key = NULL, audio_mime_type = NULL, audio_size_bytes = NULL, audio_duration_seconds = NULL, updated_at = NOW()
    WHERE id = $1
  `, [item.id]);
  res.json({ success: true });
});

module.exports = router;
