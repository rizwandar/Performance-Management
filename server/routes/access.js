const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

// ---------------------------------------------------------------------------
// GET /api/access/:token
// Public endpoint — no auth required.
// Validates the token, returns the owner's permitted section data read-only.
// ---------------------------------------------------------------------------
router.get('/:token', (req, res) => {
  const tokenRow = db.prepare(`
    SELECT tct.*, tc.user_id, tc.name AS contact_name, tc.id AS contact_id
    FROM trusted_contact_tokens tct
    JOIN trusted_contacts tc ON tc.id = tct.contact_id
    WHERE tct.token = ? AND tct.expires_at > datetime('now')
  `).get(req.params.token);

  if (!tokenRow) {
    return res.status(404).json({ error: 'This link is invalid or has expired. Please ask the account holder to generate a new link.' });
  }

  // Which sections is this contact allowed to see?
  const permissions = db.prepare(`
    SELECT section_id FROM trusted_contact_permissions WHERE contact_id = ?
  `).all(tokenRow.contact_id).map(p => p.section_id);

  // Owner's basic info (no passwords, no tokens)
  const owner = db.prepare(`
    SELECT name, date_of_birth, about_me, legacy_message FROM users WHERE id = ?
  `).get(tokenRow.user_id);

  const data = {};

  for (const sectionId of permissions) {
    switch (sectionId) {
      case 'legal_documents':
        data.legal_documents = db.prepare(
          'SELECT id, document_type, title, held_by, location, notes, created_at FROM legal_documents WHERE user_id = ?'
        ).all(tokenRow.user_id);
        break;

      case 'financial_items':
        data.financial_items = db.prepare(
          'SELECT id, category, institution, account_type, account_reference, contact_name, contact_phone, notes, created_at FROM financial_items WHERE user_id = ?'
        ).all(tokenRow.user_id);
        break;

      // Digital Life is intentionally excluded — vault is encrypted and the key never leaves the user's session
      case 'digital_life':
        data.digital_life_note = 'Digital credentials are encrypted and cannot be shared via access links.';
        break;

      case 'funeral_wishes':
        data.funeral_wishes = db.prepare(
          'SELECT burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan, pre_paid_details, music_preferences, readings, flowers_preference, donation_charity, special_requests, notes FROM funeral_wishes WHERE user_id = ?'
        ).get(tokenRow.user_id);
        break;

      case 'medical_wishes':
        data.medical_wishes = db.prepare(
          'SELECT organ_donation, organ_donation_details, advance_care_directive, directive_location, dnr_preference, gp_name, gp_phone, hospital_preference, current_medications, medical_conditions, notes FROM medical_wishes WHERE user_id = ?'
        ).get(tokenRow.user_id);
        break;

      case 'people_to_notify':
        data.people_to_notify = db.prepare(
          'SELECT id, name, relationship, email, phone, notified_by, notes FROM people_to_notify WHERE user_id = ?'
        ).all(tokenRow.user_id);
        break;

      case 'property_items':
        data.property_items = db.prepare(
          'SELECT id, category, title, description, location, intended_recipient, notes FROM property_items WHERE user_id = ?'
        ).all(tokenRow.user_id);
        break;

      case 'personal_messages':
        data.personal_messages = db.prepare(
          'SELECT id, recipient_name, relationship, message, notes FROM personal_messages WHERE user_id = ?'
        ).all(tokenRow.user_id);
        break;

      case 'songs_that_define_me':
        data.songs_that_define_me = db.prepare(
          'SELECT id, title, artist, album, why_meaningful FROM songs_that_define_me WHERE user_id = ?'
        ).all(tokenRow.user_id);
        break;

      case 'life_wishes':
        data.life_wishes = db.prepare(
          'SELECT id, title, description, category, status, notes FROM life_wishes WHERE user_id = ?'
        ).all(tokenRow.user_id);
        break;
    }
  }

  res.json({
    contact_name:     tokenRow.contact_name,
    expires_at:       tokenRow.expires_at,
    owner: {
      name:            owner.name,
      date_of_birth:   owner.date_of_birth,
      about_me:        owner.about_me,
      legacy_message:  owner.legacy_message,
    },
    visible_sections: permissions,
    data,
  });
});

module.exports = router;
