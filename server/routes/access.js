const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router  = express.Router();
const { queryOne, queryAll, query } = require('../db/database');
const { markUserDeceased } = require('../lib/deceased');
const { getDownloadUrl } = require('../lib/r2');
const { isVaultProtectedSection } = require('../lib/vaultSections');
const { openSealedKey } = require('../lib/vaultRelease');
const { readVaultSections, VAULT_RELEASE_SECTIONS } = require('../lib/vaultReleaseRead');
const { windowClosesAt, formatDeadline } = require('../lib/releaseChallenge');
const {
  getReleaseLockStatus, recordReleaseAttempt, resetReleaseAttempts, ATTEMPTS_PER_LOCKOUT,
} = require('../lib/vaultReleaseAttempts');

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

  // Emergency contact fields are intentionally NOT gated by `permissions`
  // above, and must never be added to VALID_SECTIONS/EXECUTOR_SECTIONS. This
  // is the one piece of information anyone holding a valid access link
  // should always see, same as the owner's name: it answers "who else do I
  // call right now", which matters most while the owner is alive but unable
  // to speak for themselves. Gating it behind a grantable permission would
  // reproduce the exact write-only bug this section was shipped with.
  const owner = await queryOne(
    'SELECT name, date_of_birth, about_me, legacy_message, country_code, is_deceased, emergency_contact_name, emergency_contact_phone, emergency_contact_email, emergency_contact_relationship, emergency_contact_notes FROM users WHERE id = $1',
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
        // date_of_birth is deliberately not selected. A dependant's birth date
        // is no longer collected, and this payload goes to a trusted contact
        // over a link, so legacy values on older rows stay out of it.
        data.children_dependants = await queryAll(
          `SELECT id, name, type, special_needs, preferred_guardian,
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
      ...(tokenRow.is_executor ? {
        emergency_contact_name:         owner.emergency_contact_name,
        emergency_contact_phone:        owner.emergency_contact_phone,
        emergency_contact_email:        owner.emergency_contact_email,
        emergency_contact_relationship: owner.emergency_contact_relationship,
        emergency_contact_notes:        owner.emergency_contact_notes,
      } : {}),
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

// ---------------------------------------------------------------------------
// Vault release: the Legacy Contact opens the envelope
// (docs/VAULT_RELEASE_ON_DEATH_SPEC.md, sections 3.4, 4 and 8)
// ---------------------------------------------------------------------------
//
// The other half of routes/vaultRelease.js. That file is everything the
// living owner does: seal the vault key under a release code, show the code
// once, re-issue it, turn it off. This is the only place the sealed envelope
// is ever opened, and it happens here rather than there because the person
// doing it has no account, no session and no vault password. All they have is
// the access link they were already sent and a code the owner handed them by
// hand.
//
// Four things have to be true before anything is decrypted, and all four are
// checked server-side on every request:
//
//   1. The access token resolves (same loadTokenRow as the rest of this file,
//      so the same expiry and the same contact/owner join).
//   2. The holder is the Legacy Contact (is_executor) on a link that is not
//      the read-only preview (allow_demise_confirm).
//   3. The envelope was sealed FOR THIS CONTACT. Scoping by the token's own
//      owner is what stops one Legacy Contact reaching another owner's
//      vault; requiring contact_id to match is what stops a contact who has
//      since been given the Legacy Contact role reaching an envelope that was
//      sealed for somebody else.
//   4. The row is status = 'released'. Not armed, not pending, not
//      suspended. Only the challenge sweep writes that status, and only after
//      a declaration, an uncancelled window and at least one successful
//      challenge to the owner (releaseIfWindowClosed in
//      lib/releaseChallenge.js).
//
// And the property that makes the whole scheme worth having: the recovered
// vault key is used inside this request and never leaves the process. The
// response carries decrypted section content, never the key, never the
// envelope ciphertext and never the code. A client that held the key could
// decrypt anything it later obtained; a client that holds plaintext holds
// only what it was given.

// The three answers this pair of endpoints is allowed to give to anyone who
// is not entitled to know anything. They are identical whether the token
// belongs to an ordinary trusted contact, whether release was never set up,
// whether it is set up for a different contact, or whether it is armed or
// pending rather than released. Telling those cases apart would hand an
// attacker a map: which accounts have a vault worth declaring a death over,
// and whether a declaration they have already made is working.
const NOTHING_TO_OPEN = 'There is nothing to open on this account.';
const BAD_LINK = 'This link is invalid or has expired. Please ask the account holder to generate a new link.';

// Same short lifetime routes/documents.js gives a signed URL for a
// vault-protected attachment, and for the same reason.
const VAULT_DOWNLOAD_TTL_SECONDS = 300;

// Per-IP budget on top of the per-envelope attempts counter in
// lib/vaultReleaseAttempts.js. The counter throttles guessing at one owner's
// envelope; this throttles one source working through many of them, which the
// per-row counter cannot see. 20/15min matches the authLimiter budget
// server/index.js puts on the owner-facing release routes for the same
// reason, and only applies to the POST: the status GET takes no code, is read
// on every page load of the access link, and must not be able to lock
// somebody out of the thing they came here to do (the collateral-lockout
// pattern SEC-14 and PR #213 both had to undo).
const releaseOpenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts from this connection. Please wait a few minutes and try again.' },
});

/**
 * The vault_release row this token holder is entitled to know about, or null.
 *
 * null is the answer for every kind of "no", and callers must not distinguish
 * between them. key_enc is selected because this is the only consumer that
 * needs it; nothing here returns it to a client.
 */
async function loadReleaseForToken(tokenRow) {
  if (!tokenRow.is_executor) return null;
  // OPS-20's 14-day preview link is explicitly reference-only and cannot
  // report a passing. Opening a vault is not reference. In practice a preview
  // token is replaced by the real one when a passing is confirmed
  // (generateAccessLink deletes a contact's existing tokens before inserting),
  // so this should never be the deciding check - which is exactly why it is
  // cheap to make it one.
  if (tokenRow.allow_demise_confirm === false) return null;

  const row = await queryOne(
    `SELECT user_id, contact_id, key_enc, status, window_hours,
            pending_started_at, released_at, code_issued_at
     FROM vault_release WHERE user_id = $1`,
    [tokenRow.user_id]
  );
  if (!row) return null;
  if (row.contact_id !== tokenRow.contact_id) return null;
  return row;
}

/**
 * Audit one event in the life of an envelope.
 *
 * This is the single most consequential thing that happens in the product,
 * and it happens to an account whose owner is not there to be asked about it
 * afterwards, so the record has to be good enough to reconstruct from years
 * later: which contact, from which token row, from which address, and when.
 * Never the code, never anything derived from it, and never the decrypted
 * content.
 */
async function auditOpen(req, tokenRow, action, metadata) {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;
    await query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [tokenRow.user_id, action, ip, ua, JSON.stringify({
        contact_id:   tokenRow.contact_id,
        contact_name: tokenRow.contact_name,
        via:          'access_link',
        ...(metadata || {}),
      })]
    );
  } catch (e) {
    // Swallowed, same as every other audit helper in this feature: losing an
    // audit row must not be the reason a release the person is entitled to
    // fails. The console line is the fallback record.
    console.error('[vault-release] Open audit log failed:', e.message, action);
  }
}

/**
 * GET /api/access/:token/vault-release
 *
 * What is happening with the vault, in the plainest terms the holder is
 * entitled to. Four states, and the UI copy for each lives on the client:
 *
 *   none      nothing to say. Either release was never set up, or this holder
 *             is not the person it was set up for. Spec 3.5 is explicit that
 *             "the vault stays sealed forever" must be stated rather than
 *             discovered, so the client says so plainly on this state.
 *   armed     set up for this contact, and not available. No declaration has
 *             been made, or one was made and cancelled. Those two are
 *             deliberately collapsed: a suspended arrangement will not
 *             release until the owner turns it back on, and the honest
 *             summary of both is "not available", which errs toward not
 *             promising a handover.
 *   pending   a passing has been declared and the clock is running. Spec 8
 *             decided the Legacy Contact sees a countdown rather than
 *             silence.
 *   released  the window closed uncancelled. Enter the code.
 */
router.get('/:token/vault-release', async (req, res) => {
  // State about one specific account, reached by a secret in the URL, and it
  // changes under the holder's feet as the window closes.
  res.setHeader('Cache-Control', 'no-store, private');

  const tokenRow = await loadTokenRow(req.params.token);
  if (!tokenRow) return res.status(404).json({ error: BAD_LINK });

  const row = await loadReleaseForToken(tokenRow);
  if (!row) return res.json({ state: 'none' });

  if (row.status === 'pending') {
    return res.json({
      state:             'pending',
      window_closes_at:  windowClosesAt(row).toISOString(),
      window_hours:      row.window_hours,
    });
  }

  if (row.status === 'released') {
    const lockedUntil = await getReleaseLockStatus(row.user_id);
    return res.json({
      state:        'released',
      released_at:  row.released_at,
      locked_until: lockedUntil ? lockedUntil.toISOString() : null,
    });
  }

  // 'armed', 'suspended', and anything a later version of the state machine
  // adds. Defaulting to the state that offers nothing is the safe default.
  return res.json({ state: 'armed' });
});

/**
 * POST /api/access/:token/vault-release/open
 *
 * Body: { code }. The code is read, used, and dropped. It is not stored, not
 * echoed back in any response, not written to the audit log, and not logged:
 * spec 8.1 is the one point in the design that cannot bend, and it is only
 * true if this endpoint honours it too.
 *
 * On success the response is the decrypted vault, read-only. There is no
 * matching write path anywhere: a Legacy Contact can read what was recorded
 * and can never change it.
 */
router.post('/:token/vault-release/open', releaseOpenLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');

  const tokenRow = await loadTokenRow(req.params.token);
  if (!tokenRow) return res.status(404).json({ error: BAD_LINK });

  // Entitlement before input validation, deliberately. Somebody who is not
  // entitled gets the same answer whatever they send, including nothing at
  // all, so the shape of their request cannot be used to tell "wrong person"
  // from "wrong code" or "not released yet".
  const row = await loadReleaseForToken(tokenRow);
  if (!row || row.status !== 'released') return res.status(403).json({ error: NOTHING_TO_OPEN });

  const code = req.body?.code;
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Please enter the release code you were given.' });
  }

  // The salt for the envelope is the digital_vault row id, because that is
  // what sealVaultKey() used. A vault that was reset and recreated gets a new
  // id, which is why routes/sections.js deletes the vault_release row on a
  // vault password change rather than leaving a confident-looking envelope
  // over a key that opens nothing.
  const vault = await queryOne('SELECT id FROM digital_vault WHERE user_id = $1', [row.user_id]);
  if (!vault) return res.status(403).json({ error: NOTHING_TO_OPEN });

  // The one line that matters. Returns the vault key or null, and null covers
  // a wrong code, a wrongly shaped code and a corrupt or mis-salted envelope
  // alike - see openSealedKey in lib/vaultRelease.js. Nothing below reverses
  // that: all three produce the same response, because distinguishing them
  // would turn this into an oracle that tells an attacker whether the
  // envelope is intact and whether their code is the right shape.
  const key = openSealedKey(code, row.key_enc, vault.id);

  if (!key) {
    // Lockout is consulted only after the code has been found wrong, exactly
    // as checkVault does in lib/vaultAuth.js: a correct code works
    // immediately even mid-lockout, because there is nothing left to throttle
    // once somebody has already got it right, and because the person typing
    // it is far more likely to be a Legacy Contact who finally found the
    // right sheet of paper than an attacker. An attempt made during a lockout
    // is refused without being counted, so the counter measures real guessing
    // rather than repeats of the same refusal.
    const alreadyLocked = await getReleaseLockStatus(row.user_id);
    if (alreadyLocked) {
      return res.status(423).json({
        // formatDeadline, not a hand-rolled toLocaleString. Mixing
        // dateStyle/timeStyle with timeZoneName is invalid under ECMA-402 and
        // throws a TypeError, which turned the entire lockout path into a 500
        // the first time it was exercised. The named zone matters: the server
        // runs in UTC and the reader may be anywhere.
        error: `Too many incorrect codes. Please try again after ${formatDeadline(alreadyLocked)}. Nothing has been lost, and the code you were given still works.`,
        locked: true,
        locked_until: alreadyLocked.toISOString(),
      });
    }

    const { attempts, locked, lockedUntil } = await recordReleaseAttempt(row.user_id);
    await auditOpen(req, tokenRow, 'vault_release_open_failed', { attempts, locked });
    if (locked) {
      return res.status(423).json({
        error: `That code did not work, and there have now been ${attempts} incorrect attempts. Please try again after ${formatDeadline(lockedUntil)}. Nothing has been lost.`,
        locked: true,
        locked_until: lockedUntil.toISOString(),
      });
    }
    return res.status(401).json({
      error: 'That code did not work. Please check it against the sheet or letter you were given, and type it exactly as it appears. Nothing has been lost.',
      attempts,
      attempts_before_pause: ATTEMPTS_PER_LOCKOUT,
    });
  }

  let payload;
  try {
    payload = await readVaultSections(row.user_id, key);
    payload.documents = await loadVaultSectionDocuments(row.user_id);
  } finally {
    // The key existed in this process for the length of one request and is
    // overwritten before the response is written, whether the read succeeded
    // or threw. It is never stored, never cached and never sent anywhere.
    key.fill(0);
  }

  await resetReleaseAttempts(row.user_id);

  // released_at is set by the sweep when the window closes, so it is almost
  // always already present; COALESCE covers the one path that could reach
  // 'released' without it and keeps this idempotent across repeat opens. A
  // Legacy Contact is expected to come back to this page more than once.
  await query(
    'UPDATE vault_release SET released_at = COALESCE(released_at, NOW()) WHERE user_id = $1',
    [row.user_id]
  );

  await auditOpen(req, tokenRow, 'vault_release_opened', {
    sections_returned: payload.sections,
    code_issued_at:    row.code_issued_at,
    released_at:       row.released_at,
  });
  console.log(
    `[vault-release] Envelope opened for user ${row.user_id} by contact ${tokenRow.contact_id}. ` +
    `Sections handed over: ${payload.sections.join(', ') || 'none recorded'}.`
  );

  res.json({
    state:    'open',
    sections: payload.sections,
    data:     payload.data,
    documents: payload.documents,
  });
});

/**
 * Files attached to vault-protected sections, for a released envelope only.
 *
 * Deliberately a separate function from loadSectionDocuments above rather than
 * a relaxation of it. That one guards the ordinary access-link payload and
 * its guard stays exactly as SEC-20 left it: an access link alone can never
 * surface vault-protected content, because an access link alone proves
 * nothing about the vault.
 *
 * This path is different in kind. Reaching it requires the Legacy Contact's
 * own link, an envelope sealed for that contact, a confirmed passing, an
 * uncancelled challenge window, and the release code - which is strictly more
 * than the vault password the owner's own download route asks for. And the
 * reason to include them at all is the point of the feature: a Legal
 * Documents row that says "Will, held by Hendry & Co, in the study" is half
 * an answer if the scanned will itself is unreachable. Handing over the
 * described item but not the item is not a handover.
 *
 * Short-lived signed URLs, same TTL as the owner's own vault downloads.
 */
// Fail-soft, deliberately, and this is the one place in the feature where
// that is the right call. The decrypted sections are the handover; the
// attachments are the best version of it. If R2 is unreachable or a single
// key cannot be signed, the person who has waited out a challenge window and
// typed their code correctly must still get everything we can give them,
// rather than a 500 that tells them nothing and that they cannot act on. The
// sections name where the documents are held in any case.
async function loadVaultSectionDocuments(userId) {
  let docs = [];
  try {
    docs = await queryAll(
      `SELECT id, section_id, item_id, original_name, size_bytes, mime_type, r2_key
       FROM uploaded_documents WHERE user_id = $1 AND section_id = ANY($2::text[])`,
      [userId, VAULT_RELEASE_SECTIONS]
    );
  } catch (e) {
    console.error('[vault-release] Could not list vault attachments:', e.message);
    return {};
  }

  const out = {};
  for (const { r2_key, section_id, ...doc } of docs) {
    // Belt and braces: never emit a URL for a section this module did not ask
    // for, whatever the query returned.
    if (!isVaultProtectedSection(section_id)) continue;
    try {
      // Signed first, then attached, so a failure leaves no empty section
      // behind that reads as "nothing was attached here".
      const download_url = await getDownloadUrl(r2_key, VAULT_DOWNLOAD_TTL_SECONDS);
      (out[section_id] ||= []).push({ ...doc, download_url });
    } catch (e) {
      console.error(`[vault-release] Could not sign attachment ${doc.id}:`, e.message);
    }
  }
  return out;
}

module.exports = router;
