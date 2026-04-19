const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const requireAuth = require('../middleware/auth');
const { deriveKey, encryptField, decryptField, createVaultCheck, verifyVaultPassword } = require('../lib/vault');
const { recordVaultAttempt } = require('../lib/vaultAttempts');

// ---------------------------------------------------------------------------
// Helper — get completion counts for all sections for a user
// Used by dashboard to show progress
// ---------------------------------------------------------------------------
router.get('/completion', requireAuth, (req, res) => {
  const uid = req.user.id;

  // how_to_be_remembered: data lives on the users row, not a separate table
  const userProfile = db.prepare(
    'SELECT about_me, legacy_message, life_story, remembered_for, emergency_contact_name FROM users WHERE id = ?'
  ).get(uid);
  const howToBeRememberedStarted = [
    userProfile?.about_me, userProfile?.legacy_message,
    userProfile?.life_story, userProfile?.remembered_for,
  ].some(v => v && v.trim().length > 0) ? 1 : 0;

  // key_contacts: trusted contacts + emergency contact
  const trustedContactCount = db.prepare('SELECT COUNT(*) as c FROM trusted_contacts WHERE user_id = ?').get(uid).c;
  const keyContactsCount    = trustedContactCount + (userProfile?.emergency_contact_name ? 1 : 0);

  const counts = {
    how_to_be_remembered:   howToBeRememberedStarted,
    legal_documents:        db.prepare('SELECT COUNT(*) as c FROM legal_documents WHERE user_id = ?').get(uid).c,
    financial_items:        db.prepare('SELECT COUNT(*) as c FROM financial_items WHERE user_id = ?').get(uid).c,
    funeral_wishes:         db.prepare('SELECT COUNT(*) as c FROM funeral_wishes WHERE user_id = ?').get(uid).c,
    medical_wishes:         db.prepare('SELECT COUNT(*) as c FROM medical_wishes WHERE user_id = ?').get(uid).c,
    people_to_notify:       db.prepare('SELECT COUNT(*) as c FROM people_to_notify WHERE user_id = ?').get(uid).c,
    property_items:         db.prepare('SELECT COUNT(*) as c FROM property_items WHERE user_id = ?').get(uid).c,
    personal_messages:      db.prepare('SELECT COUNT(*) as c FROM personal_messages WHERE user_id = ?').get(uid).c,
    digital_credentials:    db.prepare('SELECT COUNT(*) as c FROM digital_credentials WHERE user_id = ?').get(uid).c,
    key_contacts:           keyContactsCount,
    songs_that_define_me:   db.prepare('SELECT COUNT(*) as c FROM songs_that_define_me WHERE user_id = ?').get(uid).c,
    life_wishes:            db.prepare('SELECT COUNT(*) as c FROM life_wishes WHERE user_id = ?').get(uid).c,
    'household-info':       db.prepare('SELECT COUNT(*) as c FROM household_info WHERE user_id = ?').get(uid).c,
    'children-dependants':  db.prepare('SELECT COUNT(*) as c FROM children_dependants WHERE user_id = ?').get(uid).c,
  };
  res.json(counts);
});

// ---------------------------------------------------------------------------
// Vault helper — verifies vault_password against stored check_enc.
// On failure: tracks attempt, sends email alert, and returns appropriate
// error (401 = wrong pw, 403 = force logout at attempt 3+, 410 = vault deleted at 5).
// Returns true if valid; writes error response and returns false if not.
// ---------------------------------------------------------------------------
function checkVault(vault_password, userId, res, req) {
  if (!vault_password) {
    res.status(400).json({ error: 'vault_password is required.' });
    return false;
  }
  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(userId);
  if (!vault) {
    res.status(403).json({ error: 'No vault found. Please set up your vault password first.' });
    return false;
  }
  const key = deriveKey(vault_password, userId);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    _sendVaultFailResponse(userId, res, req);
    return false;
  }
  // Success: reset attempt counter
  db.prepare('UPDATE users SET vault_attempts = 0 WHERE id = ?').run(userId);
  return true;
}

function _sendVaultFailResponse(userId, res, req) {
  const { attempts, shouldLogout, vaultDeleted } = recordVaultAttempt(userId, req);
  const remaining = Math.max(0, 5 - attempts);
  if (vaultDeleted) {
    res.status(410).json({
      error: 'Your vault has been deleted after 5 incorrect attempts. Your other plans and wishes are completely safe. You can create a new vault at any time.',
      vault_deleted: true,
    });
  } else if (shouldLogout) {
    res.status(403).json({
      error: `Incorrect vault password. For your security, you have been signed out. Please sign in again. (${attempts} of 5 attempts used.)`,
      force_logout: true,
      attempts,
    });
  } else {
    res.status(401).json({
      error: `Incorrect vault password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining. After 3 incorrect attempts you will be signed out. After 5, your vault data will be permanently deleted.`,
      attempts,
      remaining,
    });
  }
}

// ---------------------------------------------------------------------------
// Section 1 — Legal Documents  (vault-protected)
// ---------------------------------------------------------------------------

// List — vault password required (POST so password stays in body, not URL)
router.post('/legal-documents/list', requireAuth, (req, res) => {
  if (!checkVault(req.body.vault_password, req.user.id, res, req)) return;
  const items = db.prepare('SELECT * FROM legal_documents WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

// Unprotected GET kept for internal use (PDF export, admin panel)
router.get('/legal-documents', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM legal_documents WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/legal-documents', requireAuth, (req, res) => {
  const { vault_password, document_type, title, held_by, location, notes } = req.body;
  if (!checkVault(vault_password, req.user.id, res, req)) return;
  if (!title) return res.status(400).json({ error: 'A title or description is required.' });
  const result = db.prepare(`
    INSERT INTO legal_documents (user_id, document_type, title, held_by, location, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, document_type || null, title, held_by || null, location || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/legal-documents/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM legal_documents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { vault_password, document_type, title, held_by, location, notes } = req.body;
  if (!checkVault(vault_password, req.user.id, res, req)) return;
  db.prepare(`
    UPDATE legal_documents SET document_type=?, title=?, held_by=?, location=?, notes=? WHERE id=?
  `).run(document_type ?? item.document_type, title ?? item.title, held_by ?? item.held_by,
         location ?? item.location, notes ?? item.notes, item.id);
  res.json({ success: true });
});

router.delete('/legal-documents/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM legal_documents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  // Also delete associated uploaded documents
  db.prepare('DELETE FROM uploaded_documents WHERE user_id = ? AND section_id = ? AND item_id = ?')
    .run(req.user.id, 'legal_documents', item.id);
  db.prepare('DELETE FROM legal_documents WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 2 — Financial Affairs
// ---------------------------------------------------------------------------
router.get('/financial-affairs', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM financial_items WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/financial-affairs', requireAuth, (req, res) => {
  const { category, institution, account_type, account_reference, contact_name, contact_phone, notes } = req.body;
  if (!institution && !category) return res.status(400).json({ error: 'Please provide at least an institution or category.' });
  const result = db.prepare(`
    INSERT INTO financial_items (user_id, category, institution, account_type, account_reference, contact_name, contact_phone, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, category || null, institution || null, account_type || null,
         account_reference || null, contact_name || null, contact_phone || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/financial-affairs/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM financial_items WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { category, institution, account_type, account_reference, contact_name, contact_phone, notes } = req.body;
  db.prepare(`
    UPDATE financial_items SET category=?, institution=?, account_type=?, account_reference=?,
    contact_name=?, contact_phone=?, notes=? WHERE id=?
  `).run(category ?? item.category, institution ?? item.institution, account_type ?? item.account_type,
         account_reference ?? item.account_reference, contact_name ?? item.contact_name,
         contact_phone ?? item.contact_phone, notes ?? item.notes, item.id);
  res.json({ success: true });
});

router.delete('/financial-affairs/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM financial_items WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  db.prepare('DELETE FROM financial_items WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 4 — Funeral & End-of-Life Wishes (single record per user)
// ---------------------------------------------------------------------------
router.get('/funeral-wishes', requireAuth, (req, res) => {
  const record = db.prepare('SELECT * FROM funeral_wishes WHERE user_id = ?').get(req.user.id);
  res.json(record || {});
});

router.put('/funeral-wishes', requireAuth, (req, res) => {
  const { burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan,
          pre_paid_details, music_preferences, readings, flowers_preference,
          donation_charity, special_requests, notes } = req.body;
  const existing = db.prepare('SELECT id FROM funeral_wishes WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare(`
      UPDATE funeral_wishes SET burial_preference=?, ceremony_type=?, ceremony_location=?,
      funeral_home=?, pre_paid_plan=?, pre_paid_details=?, music_preferences=?, readings=?,
      flowers_preference=?, donation_charity=?, special_requests=?, notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE user_id=?
    `).run(burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan ? 1 : 0,
           pre_paid_details, music_preferences, readings, flowers_preference,
           donation_charity, special_requests, notes, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO funeral_wishes (user_id, burial_preference, ceremony_type, ceremony_location,
      funeral_home, pre_paid_plan, pre_paid_details, music_preferences, readings,
      flowers_preference, donation_charity, special_requests, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, burial_preference, ceremony_type, ceremony_location, funeral_home,
           pre_paid_plan ? 1 : 0, pre_paid_details, music_preferences, readings,
           flowers_preference, donation_charity, special_requests, notes);
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 5 — Medical & Care Wishes (single record per user)
// ---------------------------------------------------------------------------
router.get('/medical-wishes', requireAuth, (req, res) => {
  const record = db.prepare('SELECT * FROM medical_wishes WHERE user_id = ?').get(req.user.id);
  res.json(record || {});
});

router.put('/medical-wishes', requireAuth, (req, res) => {
  const { organ_donation, organ_donation_details, advance_care_directive, directive_location,
          dnr_preference, gp_name, gp_phone, hospital_preference,
          current_medications, medical_conditions, notes } = req.body;
  const existing = db.prepare('SELECT id FROM medical_wishes WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare(`
      UPDATE medical_wishes SET organ_donation=?, organ_donation_details=?, advance_care_directive=?,
      directive_location=?, dnr_preference=?, gp_name=?, gp_phone=?, hospital_preference=?,
      current_medications=?, medical_conditions=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?
    `).run(organ_donation, organ_donation_details, advance_care_directive ? 1 : 0,
           directive_location, dnr_preference, gp_name, gp_phone, hospital_preference,
           current_medications, medical_conditions, notes, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO medical_wishes (user_id, organ_donation, organ_donation_details, advance_care_directive,
      directive_location, dnr_preference, gp_name, gp_phone, hospital_preference,
      current_medications, medical_conditions, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, organ_donation, organ_donation_details, advance_care_directive ? 1 : 0,
           directive_location, dnr_preference, gp_name, gp_phone, hospital_preference,
           current_medications, medical_conditions, notes);
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 6 — People to Notify
// ---------------------------------------------------------------------------
router.get('/people-to-notify', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM people_to_notify WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/people-to-notify', requireAuth, (req, res) => {
  const { name, relationship, email, phone, notified_by, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const result = db.prepare(`
    INSERT INTO people_to_notify (user_id, name, relationship, email, phone, notified_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name, relationship || null, email || null, phone || null, notified_by || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/people-to-notify/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM people_to_notify WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { name, relationship, email, phone, notified_by, notes } = req.body;
  db.prepare(`
    UPDATE people_to_notify SET name=?, relationship=?, email=?, phone=?, notified_by=?, notes=? WHERE id=?
  `).run(name ?? item.name, relationship ?? item.relationship, email ?? item.email,
         phone ?? item.phone, notified_by ?? item.notified_by, notes ?? item.notes, item.id);
  res.json({ success: true });
});

router.delete('/people-to-notify/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM people_to_notify WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  db.prepare('DELETE FROM people_to_notify WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 7 — Property & Possessions
// ---------------------------------------------------------------------------
router.get('/property-possessions', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM property_items WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/property-possessions', requireAuth, (req, res) => {
  const { category, title, description, location, intended_recipient, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const result = db.prepare(`
    INSERT INTO property_items (user_id, category, title, description, location, intended_recipient, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, category || null, title, description || null, location || null, intended_recipient || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/property-possessions/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM property_items WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { category, title, description, location, intended_recipient, notes } = req.body;
  db.prepare(`
    UPDATE property_items SET category=?, title=?, description=?, location=?, intended_recipient=?, notes=? WHERE id=?
  `).run(category ?? item.category, title ?? item.title, description ?? item.description,
         location ?? item.location, intended_recipient ?? item.intended_recipient, notes ?? item.notes, item.id);
  res.json({ success: true });
});

router.delete('/property-possessions/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM property_items WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  db.prepare('DELETE FROM property_items WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 8 — Messages to Loved Ones
// ---------------------------------------------------------------------------
router.get('/messages', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM personal_messages WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/messages', requireAuth, (req, res) => {
  const { recipient_name, relationship, message, notes } = req.body;
  if (!recipient_name) return res.status(400).json({ error: 'A recipient name is required.' });
  const result = db.prepare(`
    INSERT INTO personal_messages (user_id, recipient_name, relationship, message, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, recipient_name, relationship || null, message || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/messages/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM personal_messages WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Message not found.' });
  const { recipient_name, relationship, message, notes } = req.body;
  db.prepare(`
    UPDATE personal_messages SET recipient_name=?, relationship=?, message=?, notes=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(recipient_name ?? item.recipient_name, relationship ?? item.relationship,
         message ?? item.message, notes ?? item.notes, item.id);
  res.json({ success: true });
});

router.delete('/messages/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM personal_messages WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Message not found.' });
  db.prepare('DELETE FROM personal_messages WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 11 — Songs That Define Me
// ---------------------------------------------------------------------------
router.get('/songs-that-define-me', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM songs_that_define_me WHERE user_id = ? ORDER BY added_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/songs-that-define-me', requireAuth, (req, res) => {
  const { deezer_id, title, artist, album, why_meaningful } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'Title and artist are required.' });
  const count = db.prepare('SELECT COUNT(*) as c FROM songs_that_define_me WHERE user_id = ?').get(req.user.id).c;
  if (count >= 50) return res.status(400).json({ error: 'You can add up to 50 songs.' });
  const result = db.prepare(`
    INSERT INTO songs_that_define_me (user_id, deezer_id, title, artist, album, why_meaningful)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, deezer_id || null, title, artist, album || null, why_meaningful || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/songs-that-define-me/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM songs_that_define_me WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Song not found.' });
  const { why_meaningful } = req.body;
  db.prepare('UPDATE songs_that_define_me SET why_meaningful = ? WHERE id = ?').run(why_meaningful ?? item.why_meaningful, item.id);
  res.json({ success: true });
});

router.delete('/songs-that-define-me/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM songs_that_define_me WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Song not found.' });
  db.prepare('DELETE FROM songs_that_define_me WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 12 — Life's Wishes
// ---------------------------------------------------------------------------
router.get('/lifes-wishes', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM life_wishes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

router.post('/lifes-wishes', requireAuth, (req, res) => {
  const { title, description, category, status, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const result = db.prepare(`
    INSERT INTO life_wishes (user_id, title, description, category, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, description || null, category || null, status || 'dream', notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/lifes-wishes/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM life_wishes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Wish not found.' });
  const { title, description, category, status, notes } = req.body;
  db.prepare(`
    UPDATE life_wishes SET title=?, description=?, category=?, status=?, notes=? WHERE id=?
  `).run(title ?? item.title, description ?? item.description, category ?? item.category,
         status ?? item.status, notes ?? item.notes, item.id);
  res.json({ success: true });
});

router.delete('/lifes-wishes/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM life_wishes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Wish not found.' });
  db.prepare('DELETE FROM life_wishes WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 13 — Practical Household Information
// ---------------------------------------------------------------------------
router.get('/household-info', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM household_info WHERE user_id = ? ORDER BY category, title').all(req.user.id);
  res.json(items);
});

router.post('/household-info', requireAuth, (req, res) => {
  const { category, title, provider, account_reference, contact, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  const result = db.prepare(`
    INSERT INTO household_info (user_id, category, title, provider, account_reference, contact, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, category || null, title, provider || null, account_reference || null, contact || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/household-info/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM household_info WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { category, title, provider, account_reference, contact, notes } = req.body;
  db.prepare(`
    UPDATE household_info SET category=?, title=?, provider=?, account_reference=?, contact=?, notes=? WHERE id=?
  `).run(
    category          ?? item.category,
    title             ?? item.title,
    provider          ?? item.provider,
    account_reference ?? item.account_reference,
    contact           ?? item.contact,
    notes             ?? item.notes,
    item.id
  );
  res.json({ success: true });
});

router.delete('/household-info/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT id FROM household_info WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  db.prepare('DELETE FROM household_info WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 14 — Children & Dependants
// ---------------------------------------------------------------------------
router.get('/children-dependants', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM children_dependants WHERE user_id = ? ORDER BY type, name').all(req.user.id);
  res.json(items);
});

router.post('/children-dependants', requireAuth, (req, res) => {
  const { name, type, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, alternate_contact, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const result = db.prepare(`
    INSERT INTO children_dependants
      (user_id, name, type, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, alternate_contact, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, name, type || null, date_of_birth || null, special_needs || null,
    preferred_guardian || null, guardian_contact || null,
    alternate_guardian || null, alternate_contact || null, notes || null
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/children-dependants/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM children_dependants WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const { name, type, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, alternate_contact, notes } = req.body;
  db.prepare(`
    UPDATE children_dependants
    SET name=?, type=?, date_of_birth=?, special_needs=?, preferred_guardian=?,
        guardian_contact=?, alternate_guardian=?, alternate_contact=?, notes=?
    WHERE id=?
  `).run(
    name               ?? item.name,
    type               ?? item.type,
    date_of_birth      ?? item.date_of_birth,
    special_needs      ?? item.special_needs,
    preferred_guardian ?? item.preferred_guardian,
    guardian_contact   ?? item.guardian_contact,
    alternate_guardian ?? item.alternate_guardian,
    alternate_contact  ?? item.alternate_contact,
    notes              ?? item.notes,
    item.id
  );
  res.json({ success: true });
});

router.delete('/children-dependants/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT id FROM children_dependants WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  db.prepare('DELETE FROM children_dependants WHERE id = ?').run(item.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Section 3 — Digital Life (encrypted vault)
// ---------------------------------------------------------------------------

// Check whether vault has been set up for this user
router.get('/digital-life/vault', requireAuth, (req, res) => {
  const vault = db.prepare('SELECT id FROM digital_vault WHERE user_id = ?').get(req.user.id);
  res.json({ exists: !!vault });
});

// Set up vault — creates the check entry (first time only)
router.post('/digital-life/vault', requireAuth, (req, res) => {
  const { vault_password } = req.body;
  if (!vault_password || vault_password.length < 8) {
    return res.status(400).json({ error: 'Vault password must be at least 8 characters.' });
  }
  const existing = db.prepare('SELECT id FROM digital_vault WHERE user_id = ?').get(req.user.id);
  if (existing) {
    return res.status(409).json({ error: 'Vault already set up. Use the change password flow.' });
  }
  const key      = deriveKey(vault_password, req.user.id);
  const checkEnc = createVaultCheck(key);
  db.prepare('INSERT INTO digital_vault (user_id, check_enc) VALUES (?, ?)').run(req.user.id, checkEnc);
  res.status(201).json({ success: true });
});

// Change vault password — decrypts every credential with old key, re-encrypts with new key
router.put('/digital-life/vault', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password) return res.status(400).json({ error: 'old_password is required.' });
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (old_password === new_password) return res.status(400).json({ error: 'New password must be different from the current one.' });

  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(req.user.id);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const oldKey = deriveKey(old_password, req.user.id);
  if (!verifyVaultPassword(vault.check_enc, oldKey)) {
    return res.status(401).json({ error: 'Current vault password is incorrect.' });
  }

  const newKey    = deriveKey(new_password, req.user.id);
  const newCheck  = createVaultCheck(newKey);

  const reencrypt = db.transaction(() => {
    // Re-encrypt all credentials
    const rows = db.prepare(
      'SELECT id, username_enc, password_enc, notes_enc FROM digital_credentials WHERE user_id = ?'
    ).all(req.user.id);

    for (const row of rows) {
      db.prepare(`
        UPDATE digital_credentials
        SET username_enc=?, password_enc=?, notes_enc=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        encryptField(decryptField(row.username_enc, oldKey), newKey),
        encryptField(decryptField(row.password_enc, oldKey), newKey),
        encryptField(decryptField(row.notes_enc,    oldKey), newKey),
        row.id,
      );
    }

    // Update the vault check
    db.prepare('UPDATE digital_vault SET check_enc=? WHERE user_id=?').run(newCheck, req.user.id);
  });

  reencrypt();
  res.json({ success: true });
});

// Reset vault — destroys all encrypted credentials and the vault itself.
// Requires the user's account password (not vault password) as proof of identity.
router.delete('/digital-life/vault', requireAuth, (req, res) => {
  const { account_password } = req.body;
  if (!account_password) return res.status(400).json({ error: 'account_password is required to confirm vault reset.' });

  const bcrypt = require('bcryptjs');
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found. Please log out and log in again.' });
  if (!bcrypt.compareSync(account_password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect account password. Please enter the password you use to log in to In Good Hands.' });
  }

  // Collect legal document R2 keys for cleanup after DB transaction
  const legalDocFiles = db.prepare(
    'SELECT r2_key FROM uploaded_documents WHERE user_id = ? AND section_id = ?'
  ).all(req.user.id, 'legal_documents');

  db.transaction(() => {
    db.prepare('DELETE FROM digital_credentials WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM digital_vault WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM uploaded_documents WHERE user_id = ? AND section_id = ?').run(req.user.id, 'legal_documents');
    db.prepare('DELETE FROM legal_documents WHERE user_id = ?').run(req.user.id);
  })();

  // Best-effort R2 cleanup for legal document files (non-blocking)
  const { deleteFile } = require('../lib/r2');
  for (const f of legalDocFiles) {
    deleteFile(f.r2_key).catch(() => {});
  }

  res.json({ success: true, message: 'Vault reset. You can now create a new vault password.' });
});

// Verify vault password (used by client to unlock the UI — returns bool, no data)
router.post('/digital-life/vault/verify', requireAuth, (req, res) => {
  const { vault_password } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'vault_password is required.' });
  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(req.user.id);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });
  const key   = deriveKey(vault_password, req.user.id);
  const valid = verifyVaultPassword(vault.check_enc, key);
  if (!valid) { _sendVaultFailResponse(req.user.id, res, req); return; }
  db.prepare('UPDATE users SET vault_attempts = 0 WHERE id = ?').run(req.user.id);
  res.json({ valid: true });
});

// List credentials (requires vault_password to decrypt)
router.post('/digital-life/list', requireAuth, (req, res) => {
  const { vault_password } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'vault_password is required.' });

  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(req.user.id);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key   = deriveKey(vault_password, req.user.id);
  const valid = verifyVaultPassword(vault.check_enc, key);
  if (!valid) { _sendVaultFailResponse(req.user.id, res, req); return; }
  db.prepare('UPDATE users SET vault_attempts = 0 WHERE id = ?').run(req.user.id);

  const rows = db.prepare(
    'SELECT id, service, service_url, username_enc, password_enc, notes_enc, created_at FROM digital_credentials WHERE user_id = ? ORDER BY service'
  ).all(req.user.id);

  const decrypted = rows.map(row => ({
    id:          row.id,
    service:     row.service,
    service_url: row.service_url,
    username:    decryptField(row.username_enc, key),
    password:    decryptField(row.password_enc, key),
    notes:       decryptField(row.notes_enc, key),
    created_at:  row.created_at,
  }));

  res.json(decrypted);
});

// Add a credential
router.post('/digital-life', requireAuth, (req, res) => {
  const { vault_password, service, service_url, username, password, notes } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'vault_password is required.' });
  if (!service)        return res.status(400).json({ error: 'Service name is required.' });
  if (!username && !password) return res.status(400).json({ error: 'At least a username or password is required.' });

  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(req.user.id);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key   = deriveKey(vault_password, req.user.id);
  const valid = verifyVaultPassword(vault.check_enc, key);
  if (!valid) return res.status(401).json({ error: 'Incorrect vault password.' });

  const result = db.prepare(`
    INSERT INTO digital_credentials (user_id, service, service_url, username_enc, password_enc, notes_enc)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    service,
    service_url || null,
    encryptField(username, key),
    encryptField(password, key),
    encryptField(notes, key),
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

// Update a credential
router.put('/digital-life/:id', requireAuth, (req, res) => {
  const { vault_password, service, service_url, username, password, notes } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'vault_password is required.' });

  const item = db.prepare('SELECT * FROM digital_credentials WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Credential not found.' });

  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(req.user.id);
  const key   = deriveKey(vault_password, req.user.id);
  const valid = verifyVaultPassword(vault.check_enc, key);
  if (!valid) return res.status(401).json({ error: 'Incorrect vault password.' });

  db.prepare(`
    UPDATE digital_credentials
    SET service=?, service_url=?, username_enc=?, password_enc=?, notes_enc=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    service     ?? item.service,
    service_url !== undefined ? (service_url || null) : item.service_url,
    username    !== undefined ? encryptField(username, key) : item.username_enc,
    password    !== undefined ? encryptField(password, key) : item.password_enc,
    notes       !== undefined ? encryptField(notes, key)    : item.notes_enc,
    item.id,
  );
  res.json({ success: true });
});

// Delete a credential — vault password required to maintain security boundary
router.delete('/digital-life/:id', requireAuth, (req, res) => {
  if (!checkVault(req.body.vault_password, req.user.id, res, req)) return;
  const item = db.prepare('SELECT id FROM digital_credentials WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Credential not found.' });
  db.prepare('DELETE FROM digital_credentials WHERE id = ?').run(item.id);
  res.json({ success: true });
});

module.exports = router;
