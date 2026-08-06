const express = require('express');
const router  = express.Router();
const { queryOne, queryAll } = require('../db/database');
const { markUserDeceased } = require('../lib/deceased');

// An executor's access ignores individually-granted permissions and always sees
// every section except the vault (digital_life), which is never shareable via
// any access link, executor or otherwise. This mirrors VALID_SECTIONS in
// routes/trustedContacts.js, which never allows 'digital_life' to be granted
// as a regular permission either.
const EXECUTOR_SECTIONS = [
  'legal_documents', 'financial_items', 'funeral_wishes', 'medical_wishes',
  'people_to_notify', 'property_items', 'personal_messages', 'songs_that_define_me',
  'life_wishes',
];

async function loadTokenRow(token) {
  // expires_at IS NULL means "never expires" - currently only ever set that way
  // for an executor's link (see lib/inactivityTimer.js's generateAccessLink).
  return queryOne(`
    SELECT tct.*, tc.user_id, tc.name AS contact_name, tc.id AS contact_id, tc.is_executor
    FROM trusted_contact_tokens tct
    JOIN trusted_contacts tc ON tc.id = tct.contact_id
    WHERE tct.token = $1 AND (tct.expires_at IS NULL OR tct.expires_at > NOW())
  `, [token]);
}

router.get('/:token', async (req, res) => {
  const tokenRow = await loadTokenRow(req.params.token);

  if (!tokenRow) {
    return res.status(404).json({ error: 'This link is invalid or has expired. Please ask the account holder to generate a new link.' });
  }

  const permissions = tokenRow.is_executor
    ? EXECUTOR_SECTIONS
    : (await queryAll(
        'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
        [tokenRow.contact_id]
      )).map(p => p.section_id);

  const owner = await queryOne(
    'SELECT name, date_of_birth, about_me, legacy_message, country_code, is_deceased FROM users WHERE id = $1',
    [tokenRow.user_id]
  );

  const data = {};

  for (const sectionId of permissions) {
    switch (sectionId) {
      case 'legal_documents':
        data.legal_documents = await queryAll(
          'SELECT id, document_type, title, held_by, location, notes, created_at FROM legal_documents WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'financial_items':
        data.financial_items = await queryAll(
          'SELECT id, category, institution, account_type, account_reference, contact_name, contact_phone, notes, created_at FROM financial_items WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'digital_life':
        data.digital_life_note = 'Digital credentials are encrypted and cannot be shared via access links.';
        break;
      case 'funeral_wishes':
        data.funeral_wishes = await queryOne(
          'SELECT burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan, pre_paid_details, readings, flowers_preference, donation_charity, special_requests, notes FROM funeral_wishes WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'medical_wishes':
        data.medical_wishes = await queryOne(
          'SELECT organ_donation, organ_donation_details, advance_care_directive, directive_location, dnr_preference, gp_name, gp_phone, hospital_preference, current_medications, medical_conditions, notes FROM medical_wishes WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'people_to_notify':
        data.people_to_notify = await queryAll(
          'SELECT id, name, relationship, email, phone, notified_by, notes FROM people_to_notify WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'property_items':
        data.property_items = await queryAll(
          'SELECT id, category, title, description, location, intended_recipient, notes FROM property_items WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'personal_messages':
        data.personal_messages = await queryAll(
          'SELECT id, recipient_name, relationship, message, notes FROM personal_messages WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'songs_that_define_me':
        data.songs_that_define_me = await queryAll(
          'SELECT id, title, artist, album, why_meaningful FROM songs_that_define_me WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'life_wishes':
        data.life_wishes = await queryAll(
          'SELECT id, title, description, category, status, notes FROM life_wishes WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
    }
  }

  res.json({
    contact_name:     tokenRow.contact_name,
    expires_at:       tokenRow.expires_at,
    is_executor:      !!tokenRow.is_executor,
    owner: {
      name:           owner.name,
      date_of_birth:  owner.date_of_birth,
      about_me:       owner.about_me,
      legacy_message: owner.legacy_message,
      country_code:   owner.country_code,
      is_deceased:    !!owner.is_deceased,
    },
    visible_sections: permissions,
    data,
  });
});

// Only an executor's token can confirm demise, and only with an explicit
// confirm flag, a deliberate two-step action on the client rather than a
// single click (matches the equivalent org-portal flow in routes/orgPortal.js).
router.post('/:token/mark-demised', async (req, res) => {
  if (req.body.confirm !== true) {
    return res.status(400).json({ error: 'Confirmation is required to mark this account as deceased.' });
  }

  const tokenRow = await loadTokenRow(req.params.token);
  if (!tokenRow) {
    return res.status(404).json({ error: 'This link is invalid or has expired. Please ask the account holder to generate a new link.' });
  }
  if (!tokenRow.is_executor) {
    return res.status(403).json({ error: 'Only the designated executor can take this action.' });
  }

  await markUserDeceased(tokenRow.user_id, { markedByType: 'executor', markedById: tokenRow.contact_id });
  res.json({ success: true });
});

module.exports = router;
