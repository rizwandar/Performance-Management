const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { queryOne, queryAll, query, transaction } = require('../db/database');
const requireAuth    = require('../middleware/auth');
const requirePremium = require('../middleware/requiresPremium');
const { deriveKey, encryptField, decryptField, createVaultCheck, verifyVaultPassword } = require('../lib/vault');
const { checkVault } = require('../lib/vaultAuth');
const { TABLE_FIELDS, decryptRow, migrateRow } = require('../lib/vaultFields');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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
function extractToken(req) {
  const header = req.headers.authorization;
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
  return req.cookies?.token || headerToken;
}

// Once a user is marked deceased (by their executor, org staff, or the timer's
// direct-notify fallback path - see lib/deceased.js), their plan is locked from
// all edits, whether they're accessed directly or via org-portal view-as.
// users.is_deceased is the single source of truth (kept in sync with
// organization_customers.lifecycle_status for org-managed customers).
async function checkPlanLock(req, res, next) {
  if (req.method === 'GET') return next();
  const token = extractToken(req);
  if (!token) return next();
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch { return next(); }
  const effectiveId = decoded.viewAs ? decoded.viewAs.customerId : decoded.id;
  const locked = await queryOne(
    `SELECT id FROM users WHERE id = $1 AND is_deceased = true`,
    [effectiveId]
  );
  if (locked) return res.status(403).json({ error: 'This plan has been locked and can no longer be edited.' });
  next();
}
router.use(checkPlanLock);

// The vault is never visible in view-as mode, without exception (org portal
// spec, section 11). This is a single central check rather than trusting it to
// be remembered in every individual vault route handler below.
router.use('/digital-life/vault', (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.viewAs) return res.status(403).json({ error: 'The vault is not accessible in view-as mode.' });
  } catch { /* an invalid token is left for the route's own requireAuth to reject */ }
  next();
});

// ---------------------------------------------------------------------------
// Completion counts for all sections
// ---------------------------------------------------------------------------
router.get('/completion', requireAuth, async (req, res) => {
  const uid = req.user.id;

  const [
    userProfile, tcCount,
    ld, fi, fw, mw, ptn, pi, pm, dc, stm, lw, hi, cd, pet,
  ] = await Promise.all([
    queryOne('SELECT about_me, legacy_message, life_story, remembered_for, emergency_contact_name FROM users WHERE id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM trusted_contacts WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM legal_documents    WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM financial_items    WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM funeral_wishes     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM medical_wishes     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM people_to_notify   WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM property_items     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM personal_messages  WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM digital_credentials WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM songs_that_define_me WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM life_wishes        WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM household_info     WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM children_dependants WHERE user_id = $1', [uid]),
    queryOne('SELECT COUNT(*)::int as c FROM pets                WHERE user_id = $1', [uid]),
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
    medical_wishes:        mw.c,
    people_to_notify:      ptn.c,
    property_items:        pi.c,
    personal_messages:     pm.c,
    digital_credentials:   dc.c,
    key_contacts:          tcCount.c + (userProfile?.emergency_contact_name ? 1 : 0),
    songs_that_define_me:  stm.c,
    life_wishes:           lw.c,
    'household-info':      hi.c,
    'children-dependants': cd.c,
    'pet-care':             pet.c,
  });
});

// ---------------------------------------------------------------------------
// Section 1 — Legal Documents (vault-protected)
// ---------------------------------------------------------------------------
router.post('/legal-documents/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key  = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  if (!title) return res.status(400).json({ error: 'A title or description is required.' });
  const key = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key = deriveKey(vault_password, req.user.id);
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
  await query('DELETE FROM uploaded_documents WHERE user_id = $1 AND section_id = $2 AND item_id = $3',
    [req.user.id, 'legal_documents', item.id]);
  await query('DELETE FROM legal_documents WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 2 — Financial Affairs
// ---------------------------------------------------------------------------
router.post('/financial-affairs/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key  = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  if (!institution && !category) return res.status(400).json({ error: 'Please provide at least an institution or category.' });
  const key = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key = deriveKey(vault_password, req.user.id);
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
// Section 5 — Medical & Care Wishes
// ---------------------------------------------------------------------------
router.get('/medical-wishes', requireAuth, async (req, res) => {
  res.json(await queryOne('SELECT * FROM medical_wishes WHERE user_id = $1', [req.user.id]) || {});
});

router.put('/medical-wishes', requireAuth, async (req, res) => {
  const { organ_donation, organ_donation_details, advance_care_directive, directive_location,
          dnr_preference, gp_name, gp_phone, hospital_preference,
          current_medications, medical_conditions, notes } = req.body;
  const existing = await queryOne('SELECT id FROM medical_wishes WHERE user_id = $1', [req.user.id]);
  if (existing) {
    await query(`
      UPDATE medical_wishes SET organ_donation=$1, organ_donation_details=$2, advance_care_directive=$3,
      directive_location=$4, dnr_preference=$5, gp_name=$6, gp_phone=$7, hospital_preference=$8,
      current_medications=$9, medical_conditions=$10, notes=$11, updated_at=NOW() WHERE user_id=$12
    `, [organ_donation, organ_donation_details, advance_care_directive ? 1 : 0,
        directive_location, dnr_preference, gp_name, gp_phone, hospital_preference,
        current_medications, medical_conditions, notes, req.user.id]);
  } else {
    await query(`
      INSERT INTO medical_wishes (user_id, organ_donation, organ_donation_details, advance_care_directive,
      directive_location, dnr_preference, gp_name, gp_phone, hospital_preference,
      current_medications, medical_conditions, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [req.user.id, organ_donation, organ_donation_details, advance_care_directive ? 1 : 0,
        directive_location, dnr_preference, gp_name, gp_phone, hospital_preference,
        current_medications, medical_conditions, notes]);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key  = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const key = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key = deriveKey(vault_password, req.user.id);
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
  await query('DELETE FROM property_items WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 8 — Messages to Loved Ones
// ---------------------------------------------------------------------------
router.get('/messages', requireAuth, async (req, res) => {
  res.json(await queryAll('SELECT * FROM personal_messages WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]));
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
  await query('DELETE FROM personal_messages WHERE id = $1', [item.id]);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key  = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const key = deriveKey(vault_password, req.user.id);
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
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key = deriveKey(vault_password, req.user.id);
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
  await query('DELETE FROM household_info WHERE id = $1', [item.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 14 — Children & Dependants
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
// Section 15 — Pet Care (IDEA-18: split out of Children & Dependants)
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
  const vault = await queryOne('SELECT id, password_hint FROM digital_vault WHERE user_id = $1', [req.user.id]);
  res.json({ exists: !!vault, hint: vault?.password_hint || null });
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

  const vault = await queryOne('SELECT check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
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

    if (hintProvided) {
      await client.query('UPDATE digital_vault SET check_enc=$1, password_hint=$2 WHERE user_id=$3', [newCheck, newHint, req.user.id]);
    } else {
      await client.query('UPDATE digital_vault SET check_enc=$1 WHERE user_id=$2', [newCheck, req.user.id]);
    }
  });

  res.json({ success: true });
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

  // SEC-03: financial_items/property_items/household_info are now genuinely
  // vault-encrypted alongside legal_documents, so a vault reset must delete
  // them (and their file attachments) too - there's no way to recover their
  // encrypted content without the password being reset anyway, so leaving
  // them behind would just be unreadable ciphertext orphaned forever.
  const vaultProtectedTables = Object.keys(TABLE_FIELDS);
  const vaultFiles = await queryAll(
    `SELECT r2_key FROM uploaded_documents WHERE user_id = $1 AND section_id = ANY($2)`,
    [req.user.id, vaultProtectedTables]
  );

  await transaction(async (client) => {
    await client.query('DELETE FROM digital_credentials WHERE user_id = $1', [req.user.id]);
    await client.query('DELETE FROM digital_vault WHERE user_id = $1', [req.user.id]);
    await client.query(`DELETE FROM uploaded_documents WHERE user_id = $1 AND section_id = ANY($2)`, [req.user.id, vaultProtectedTables]);
    for (const table of vaultProtectedTables) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [req.user.id]);
    }
  });

  const { deleteFile } = require('../lib/r2');
  for (const f of vaultFiles) {
    deleteFile(f.r2_key).catch(() => {});
  }

  res.json({ success: true, message: 'Vault reset. You can now create a new vault password.' });
});

router.post('/digital-life/vault/verify', requireAuth, async (req, res) => {
  if (!await checkVault(req.body.vault_password, req.user.id, res, req)) return;
  res.json({ valid: true });
});

router.post('/digital-life/list', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  if (!await checkVault(vault_password, req.user.id, res, req)) return;
  const key = deriveKey(vault_password, req.user.id);

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
  if (!vault_password) return res.status(400).json({ error: 'vault_password is required.' });
  if (!service)        return res.status(400).json({ error: 'Service name is required.' });
  if (!username && !password) return res.status(400).json({ error: 'At least a username or password is required.' });

  const vault = await queryOne('SELECT check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key   = deriveKey(vault_password, req.user.id);
  const valid = verifyVaultPassword(vault.check_enc, key);
  if (!valid) return res.status(401).json({ error: 'Incorrect vault password.' });

  const result = await query(`
    INSERT INTO digital_credentials (user_id, service, service_url, username_enc, password_enc, notes_enc)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [req.user.id, service, service_url || null,
      encryptField(username, key), encryptField(password, key), encryptField(notes, key)]);
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/digital-life/:id', requireAuth, requirePremium, async (req, res) => {
  const { vault_password, service, service_url, username, password, notes } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'vault_password is required.' });

  const item = await queryOne('SELECT * FROM digital_credentials WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Credential not found.' });

  const vault = await queryOne('SELECT check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
  const key   = deriveKey(vault_password, req.user.id);
  const valid = verifyVaultPassword(vault.check_enc, key);
  if (!valid) return res.status(401).json({ error: 'Incorrect vault password.' });

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

module.exports = router;
