const express = require('express');
const router  = express.Router();
const { queryOne, queryAll } = require('../db/database');
const { markUserDeceased } = require('../lib/deceased');
const { getDownloadUrl } = require('../lib/r2');
const { isVaultProtectedSection } = require('../lib/vaultSections');

// An executor's access ignores individually-granted permissions and always sees
// every section except the vault (digital_life), which is never shareable via
// any access link, executor or otherwise. This mirrors VALID_SECTIONS in
// routes/trustedContacts.js, which never allows 'digital_life' to be granted
// as a regular permission either.
// SEC-20 (ported directly to main - see PR description): legal_documents,
// financial_items, and property_items are all vault-protected (see
// VAULT_PROTECTED_SECTIONS in lib/vaultSections.js) and must never appear
// here. An access-link viewer (trusted contact or executor) has no way to
// supply the vault password, so there is no legitimate path for
// vault-protected content to reach this endpoint at all.
// IDEA-19: unfinished_business follows personal_messages' access model
// exactly here too - see the matching note in routes/trustedContacts.js.
// IDEA-32: medical_wishes replaced by doctors + medical_records (both open,
// same as the section it replaces). donation_bank, the third piece of the
// old Medical & Care Wishes split, is deliberately NOT added here - it's
// vault-protected (new to the shared vault), same treatment as
// household_info/digital_credentials, which were never in this list either.
// insurance_items is NOT included here either - a known pre-existing gap
// (same one pets/pet_care has), logged as OPS-30, not fixed here.
const EXECUTOR_SECTIONS = [
  'funeral_wishes', 'doctors', 'medical_records',
  'people_to_notify', 'personal_messages', 'songs_that_define_me',
  'life_wishes', 'children_dependants', 'unfinished_business', 'last_moments',
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

  // SEC-20: filter out vault-protected sections defensively, in addition to
  // their removal from EXECUTOR_SECTIONS above - this also closes the gap for
  // any trusted_contact_permissions row that already references one of these
  // section_ids from before this fix (VALID_SECTIONS in trustedContacts.js
  // only gates *setting* new permissions, not reading ones already stored).
  const permissions = (tokenRow.is_executor
    ? EXECUTOR_SECTIONS
    : (await queryAll(
        'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
        [tokenRow.contact_id]
      )).map(p => p.section_id)
  ).filter(sectionId => !isVaultProtectedSection(sectionId));

  const owner = await queryOne(
    'SELECT name, date_of_birth, about_me, legacy_message, country_code, is_deceased FROM users WHERE id = $1',
    [tokenRow.user_id]
  );

  const data = {};

  for (const sectionId of permissions) {
    switch (sectionId) {
      // SEC-20: legal_documents and financial_items are vault-protected and
      // are filtered out of `permissions` above before this loop runs, so
      // these cases are intentionally absent, not an oversight.
      case 'digital_life':
        data.digital_life_note = 'Digital credentials are encrypted and cannot be shared via access links.';
        break;
      case 'funeral_wishes':
        data.funeral_wishes = await queryOne(
          'SELECT burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan, pre_paid_details, readings, flowers_preference, donation_charity, special_requests, notes FROM funeral_wishes WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'doctors':
        data.doctors = await queryOne(
          'SELECT gp_name, gp_phone, hospital_preference FROM doctors WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'medical_records':
        data.medical_records = await queryOne(
          'SELECT advance_care_directive, directive_location, dnr_preference, current_medications, medical_conditions, notes FROM medical_records WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'people_to_notify':
        data.people_to_notify = await queryAll(
          'SELECT id, name, relationship, email, phone, notified_by, notes FROM people_to_notify WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      // SEC-20: property_items is vault-protected, same reasoning as above.
      case 'personal_messages': {
        const rows = await queryAll(
          'SELECT id, recipient_name, relationship, message, notes, audio_r2_key FROM personal_messages WHERE user_id = $1',
          [tokenRow.user_id]
        );
        // Signed URL generated fresh per request, never stored - same pattern
        // as the authenticated document download route in documents.js.
        data.personal_messages = await Promise.all(rows.map(async ({ audio_r2_key, ...row }) => ({
          ...row,
          audio_url: audio_r2_key ? await getDownloadUrl(audio_r2_key) : null,
        })));
        break;
      }
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
      case 'children_dependants':
        data.children_dependants = await queryAll(
          `SELECT id, name, type, date_of_birth, special_needs, preferred_guardian,
                  guardian_contact, alternate_guardian, alternate_contact, notes
           FROM children_dependants WHERE user_id = $1`,
          [tokenRow.user_id]
        );
        break;
      case 'unfinished_business':
        data.unfinished_business = await queryAll(
          'SELECT id, name, description, notes FROM unfinished_business WHERE user_id = $1',
          [tokenRow.user_id]
        );
        break;
      case 'last_moments': {
        const row = await queryOne(
          'SELECT message, notes, audio_r2_key FROM last_moments WHERE user_id = $1',
          [tokenRow.user_id]
        );
        if (row) {
          const { audio_r2_key, ...rest } = row;
          data.last_moments = {
            ...rest,
            audio_url: audio_r2_key ? await getDownloadUrl(audio_r2_key) : null,
          };
        }
        break;
      }
    }
  }

  res.json({
    contact_name:        tokenRow.contact_name,
    expires_at:          tokenRow.expires_at,
    is_executor:         !!tokenRow.is_executor,
    can_confirm_demise:  tokenRow.allow_demise_confirm !== false,
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
    return res.status(403).json({ error: 'Only the designated Legacy Contact can take this action.' });
  }
  // OPS-20: the 14-day preview link sent alongside the designation email is
  // deliberately read-only and cannot confirm a passing, even though it
  // otherwise behaves like a full executor token. Enforced here server-side,
  // not just by hiding the button on the client.
  if (tokenRow.allow_demise_confirm === false) {
    return res.status(403).json({ error: 'This link is for reference only and cannot be used to report a passing. Please use the Report a Passing page instead.' });
  }

  await markUserDeceased(tokenRow.user_id, { markedByType: 'executor', markedById: tokenRow.contact_id });
  res.json({ success: true });
});

module.exports = router;
