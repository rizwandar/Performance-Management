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
// OPS-30: 'pet-care' (table `pets`) and 'insurance_items' were confirmed
// non-vault-protected (see VAULT_PROTECTED_SECTIONS in lib/vaultSections.js)
// and added here, matching VALID_SECTIONS in routes/trustedContacts.js.
// household_info and digital_life/digital_credentials remain excluded - they
// stay vault-protected and must never appear in this list.
const EXECUTOR_SECTIONS = [
  'funeral_wishes', 'doctors', 'medical_records',
  'people_to_notify', 'personal_messages', 'songs_that_define_me',
  'life_wishes', 'children_dependants', 'unfinished_business', 'last_moments',
  'pet-care', 'insurance_items',
];

// OPS-29: attach any files uploaded against this section (e.g. a scanned
// will, a property deed, an insurance policy) so an executor/trusted contact
// can actually open the document, not just see its text metadata. Deliberately
// excluded for 'digital_life' and for anything in VAULT_PROTECTED_SECTIONS
// (legal_documents, financial_items, property_items, household_info,
// digital_credentials): an access link has no vault password to check
// against (see checkVault in lib/vaultAuth.js, which every authenticated
// document download goes through), so a vault-protected file can never be
// safely surfaced here. As of SEC-20, none of the 5 vault-protected sections
// (legal_documents, financial_items, property_items, household_info,
// digital_credentials) or digital_life reach this loop at all (they're
// filtered out of `permissions` and absent from EXECUTOR_SECTIONS /
// trustedContacts.js's VALID_SECTIONS), but the checks below stay in place
// as an explicit guard, not an incidental one.
async function loadSectionDocuments(userId, sectionId) {
  if (sectionId === 'digital_life' || isVaultProtectedSection(sectionId)) return [];

  const docs = await queryAll(
    `SELECT id, item_id, original_name, size_bytes, mime_type, r2_key
     FROM uploaded_documents WHERE user_id = $1 AND section_id = $2`,
    [userId, sectionId]
  );
  if (!docs.length) return [];

  // Signed URL generated fresh per request, never stored - same pattern as
  // the personal_messages audio attachment above and the authenticated
  // document download route in documents.js.
  return Promise.all(docs.map(async ({ r2_key, ...doc }) => ({
    ...doc,
    download_url: await getDownloadUrl(r2_key),
  })));
}

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
          'SELECT id, recipient_name, relationship, message, notes FROM personal_messages WHERE user_id = $1',
          [tokenRow.user_id]
        );
        // IDEA-34: up to 3 voice clips per message now, held in a child
        // table rather than a single column - fetched in one batched query
        // rather than per message. Signed URLs generated fresh per request,
        // never stored - same pattern as the authenticated document download
        // route in documents.js.
        const clipRows = rows.length
          ? await queryAll(
              'SELECT id, message_id, r2_key, duration_seconds FROM personal_message_audio_clips WHERE message_id = ANY($1::int[]) ORDER BY created_at',
              [rows.map(r => r.id)]
            )
          : [];
        data.personal_messages = await Promise.all(rows.map(async row => ({
          ...row,
          audio_clips: await Promise.all(
            clipRows
              .filter(c => c.message_id === row.id)
              .map(async c => ({ id: c.id, audio_url: await getDownloadUrl(c.r2_key), duration_seconds: c.duration_seconds }))
          ),
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
      // OPS-30: 'pet-care' and 'insurance_items' were confirmed
      // non-vault-protected and added to EXECUTOR_SECTIONS above; these two
      // cases are new.
      case 'pet-care':
        data['pet-care'] = await queryAll(
          `SELECT id, name, age, special_needs, preferred_caretaker,
                  caretaker_contact, alternate_caretaker, alternate_contact, notes
           FROM pets WHERE user_id = $1 ORDER BY name`,
          [tokenRow.user_id]
        );
        break;
      case 'insurance_items':
        data.insurance_items = await queryAll(
          'SELECT id, policy_type, provider, policy_number, contact, beneficiary, notes FROM insurance_items WHERE user_id = $1 ORDER BY created_at DESC',
          [tokenRow.user_id]
        );
        break;
    }

    const documents = await loadSectionDocuments(tokenRow.user_id, sectionId);
    if (documents.length) data[`${sectionId}_documents`] = documents;
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
