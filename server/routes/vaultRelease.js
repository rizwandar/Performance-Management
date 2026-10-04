const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { queryOne, query } = require('../db/database');
const requireAuth = require('../middleware/auth');
const { checkVault } = require('../lib/vaultAuth');
const { sealVaultKey } = require('../lib/vaultRelease');
const { extractToken } = require('../lib/viewAsGuard');

const { JWT_SECRET } = require('../lib/jwtSecret');

// Owner-facing setup for vault release on confirmed death
// (docs/VAULT_RELEASE_ON_DEATH_SPEC.md). This router is only the half the
// living owner touches: arm it, re-issue the code, nominate a backup
// challenge address, turn it off. The declaration hook, the challenge
// dispatcher and the Legacy Contact's own release endpoint are separate
// pieces and are not here.
//
// The one invariant this file exists to hold: the release code is produced
// in sealVaultKey(), returned in exactly one HTTP response, and then gone.
// It is never written to a column, a log line, an email or any other
// response, /status included. There is deliberately no way to ask for it a
// second time - the answer to "show it to me again" is a re-issue, which
// replaces the envelope and kills the previous code. Storing it anywhere
// would put both halves of the scheme in our hands at once and make the
// "we cannot read your vault" promise false.
//
// Structure, guards and voice mirror routes/vaultRecovery.js on purpose:
// both escrow the same vault key under something the server never keeps, so
// they should be read side by side and should not drift apart.

// Same protections routes/vaultRecovery.js applies, and for the same reasons
// found in the 2026-08-15 review that added them there: the vault must never
// be reachable in org-portal view-as mode, and a locked/deceased plan must
// not be able to change its own release arrangements. Arming or re-issuing
// is by definition something only a living owner does; once a passing has
// been confirmed, whoever is holding the session is not the person this
// setting is meant to protect.
//
// The token is decoded directly rather than read from req.isViewAs because
// requireAuth has not run yet at this point, exactly as in vaultRecovery.js.
// extractToken() (lib/viewAsGuard.js, REV-01) reads the cookie first, the
// same precedence middleware/auth.js uses since SEC-09: the web client's
// session, view-as sessions included, exists only as the httpOnly cookie, so
// a header-only check here would silently no-op for every browser request
// and let the exact bypass this middleware exists to close straight through.
router.use(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch { return next(); }

  if (decoded.viewAs) {
    return res.status(403).json({ error: 'The vault is not accessible in view-as mode.' });
  }
  if (req.method !== 'GET') {
    const locked = await queryOne('SELECT id FROM users WHERE id = $1 AND is_deceased = true', [decoded.id]);
    if (locked) return res.status(403).json({ error: 'This plan has been locked and can no longer be edited.' });
  }
  next();
});

// Every column except key_enc. Spelled out rather than SELECT * so that
// adding a column to vault_release later cannot accidentally start leaking
// the envelope through /status: a new field has to be added here on purpose.
const SAFE_COLUMNS = `
  id, contact_id, code_issued_at, window_hours, status,
  pending_started_at, pending_declared_by, cancelled_at, cancelled_reason,
  released_at, locked_until, last_challenged_at, created_at
`;

/**
 * The contact an envelope may be sealed for: one of the caller's own trusted
 * contacts, and currently marked as their Legacy Contact.
 *
 * Both halves matter. Scoping by user_id is what stops one account arming a
 * release against somebody else's contact row, and is_executor is what stops
 * the vault being handed to an ordinary trusted contact who was only ever
 * given a couple of sections. is_executor is INTEGER 0/1 on this table, not
 * a boolean, which is why this compares against 1.
 */
async function findEligibleContact(userId, contactId) {
  const id = parseInt(contactId, 10);
  if (!Number.isInteger(id) || id < 1) return null;
  return queryOne(
    'SELECT id, name, email, is_executor FROM trusted_contacts WHERE id = $1 AND user_id = $2 AND is_executor = 1',
    [id, userId]
  );
}

/**
 * GET /api/sections/digital-life/release/status
 *
 * Everything the profile and the Trusted Contacts card need to describe the
 * current arrangement, and nothing that could help open it. No vault
 * password required: this is state, not content.
 */
router.get('/status', requireAuth, async (req, res) => {
  // Mutable per-user security state, same reasoning as the vault status
  // endpoint in sections.js: a cached copy could show a stale "not set up"
  // after someone has just armed it.
  res.setHeader('Cache-Control', 'no-store, private');

  const user = await queryOne(
    'SELECT email, release_challenge_email FROM users WHERE id = $1',
    [req.user.id]
  );
  const vault = await queryOne('SELECT id FROM digital_vault WHERE user_id = $1', [req.user.id]);
  const row = await queryOne(
    `SELECT ${SAFE_COLUMNS} FROM vault_release WHERE user_id = $1`,
    [req.user.id]
  );

  // Who release could be set up for right now. The partial unique index on
  // trusted_contacts allows at most one is_executor row per owner, so this is
  // a single contact or nobody.
  const legacyContact = await queryOne(
    'SELECT id, name, email FROM trusted_contacts WHERE user_id = $1 AND is_executor = 1',
    [req.user.id]
  );

  // The configured contact can drift out from under the escrow: the owner
  // can move the Legacy Contact role to someone else, or delete the contact
  // entirely (contact_id is ON DELETE SET NULL, deliberately, so the envelope
  // survives). Either way the code already in someone's hands still opens
  // this envelope, so the UI has to be able to say so rather than quietly
  // showing the current Legacy Contact's name over an envelope sealed for a
  // different person.
  let sealedForContact = null;
  if (row?.contact_id) {
    sealedForContact = await queryOne(
      'SELECT id, name, is_executor FROM trusted_contacts WHERE id = $1 AND user_id = $2',
      [row.contact_id, req.user.id]
    );
  }

  res.json({
    vault_exists:      !!vault,
    enabled:           !!row,
    legacy_contact:    legacyContact || null,
    challenge_email:   user?.release_challenge_email || null,
    ...(row ? {
      release: {
        contact_id:         row.contact_id,
        contact_name:       sealedForContact?.name || null,
        contact_missing:    !sealedForContact,
        contact_is_legacy:  !!sealedForContact?.is_executor,
        code_issued_at:     row.code_issued_at,
        window_hours:       row.window_hours,
        status:             row.status,
        pending_started_at: row.pending_started_at,
        cancelled_at:       row.cancelled_at,
        cancelled_reason:   row.cancelled_reason,
        released_at:        row.released_at,
        locked_until:       row.locked_until,
        // A cancellation suspends the arrangement rather than re-arming it,
        // so the profile needs to know to offer "turn it back on" rather than
        // quietly showing it as active. See POST /resume below.
        needs_resume:       row.status === 'suspended',
      },
    } : {}),
  });
});

/**
 * POST /api/sections/digital-life/release/setup
 *
 * Arm release, or re-arm it for a different contact. Takes the vault
 * password once, because that is the only moment the server can reach the
 * vault key at all (lib/vault.js derives it per request and stores nothing),
 * and the chosen contact id.
 *
 * Returns the release code. Once. This is the only response in the whole API
 * that ever carries it.
 *
 * Deliberately an upsert rather than a 409 on an existing row: changing
 * which Legacy Contact the envelope is sealed for has to be possible, and it
 * is the same operation as arming it. `replaced` tells the client an older
 * envelope was overwritten so it can say plainly that the previous code is
 * now dead, which is the one thing a user must not discover by accident.
 */
router.post('/setup', requireAuth, async (req, res) => {
  const { vault_password, contact_id } = req.body;
  if (contact_id === undefined || contact_id === null || contact_id === '') {
    return res.status(400).json({ error: 'Please choose which Legacy Contact should be able to open your vault.' });
  }

  const contact = await findEligibleContact(req.user.id, contact_id);
  if (!contact) {
    // One message for "not yours", "does not exist" and "not your Legacy
    // Contact" alike. Distinguishing them would turn this into a probe for
    // whether a given contact id belongs to somebody, and the owner-facing
    // UI only ever sends an id it was handed by /status anyway.
    return res.status(400).json({
      error: 'That contact is not your Legacy Contact. Only your Legacy Contact can be given vault access.',
    });
  }

  const vault = await queryOne('SELECT id FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found. Please set up your vault password first.' });

  // checkVault() both verifies the password and hands back the derived key,
  // so the scrypt cost is paid once (REV-07), and wrong guesses here feed the
  // same shared attempt counter and lockout as every other vault route. A
  // second guessing path into the same key must never have softer limits
  // than the first.
  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;

  const existing = await queryOne('SELECT id FROM vault_release WHERE user_id = $1', [req.user.id]);
  const { code, keyEnc } = sealVaultKey(key, vault.id);

  // Re-arming resets the state machine as well as the envelope. A row left
  // reading 'pending' or 'cancelled' from an earlier declaration would
  // describe a window that no longer has anything to do with this envelope.
  await query(`
    INSERT INTO vault_release (user_id, contact_id, key_enc, code_issued_at, status)
    VALUES ($1, $2, $3, NOW(), 'armed')
    ON CONFLICT (user_id) DO UPDATE SET
      contact_id          = EXCLUDED.contact_id,
      key_enc             = EXCLUDED.key_enc,
      code_issued_at      = NOW(),
      status              = 'armed',
      pending_started_at  = NULL,
      pending_declared_by = NULL,
      cancelled_at        = NULL,
      cancelled_reason    = NULL,
      released_at         = NULL,
      attempts            = 0,
      locked_until        = NULL,
      last_challenged_at  = NULL,
      -- Challenge-window state for whatever window this row used to be in.
      -- A cancel token left behind is a live secret for a window that no
      -- longer exists, and a stale release_notified_at would suppress the
      -- "the vault is now available" notice for the next one.
      cancel_token        = NULL,
      release_notified_at = NULL
  `, [req.user.id, contact.id, keyEnc]);

  // Audit the fact, never the code. Arming this is the user consenting to
  // their vault being openable by somebody else one day, which is exactly
  // the kind of event support needs to be able to reconstruct later.
  await auditRelease(req, existing ? 'vault_release_reissued' : 'vault_release_enabled', {
    contact_id: contact.id,
  });

  res.json({
    success: true,
    replaced: !!existing,
    code,
    contact: { id: contact.id, name: contact.name },
    code_issued_at: new Date().toISOString(),
  });
});

/**
 * POST /api/sections/digital-life/release/reissue
 *
 * A new code for the contact already configured. Needs the vault password
 * again, unavoidably: re-issuing means re-sealing the vault key under a new
 * code, and the server has no other way to reach that key (spec 8.4).
 *
 * The previous envelope is replaced, so the previous code stops working the
 * instant this returns. A user who re-issues "just in case" and leaves their
 * Legacy Contact holding the old slip has silently broken the thing they set
 * up, which is why the UI has to say this out loud.
 */
router.post('/reissue', requireAuth, async (req, res) => {
  const { vault_password } = req.body;

  const row = await queryOne('SELECT contact_id FROM vault_release WHERE user_id = $1', [req.user.id]);
  if (!row) {
    return res.status(404).json({ error: 'Vault release is not set up yet.' });
  }
  // Re-validated rather than trusted from the stored row: the role may have
  // moved to someone else, or the contact may have been deleted, since this
  // was armed. Handing out a fresh code for a contact who is no longer the
  // Legacy Contact would quietly widen who can open the vault.
  const contact = row.contact_id ? await findEligibleContact(req.user.id, row.contact_id) : null;
  if (!contact) {
    return res.status(409).json({
      error: 'The contact this was set up for is no longer your Legacy Contact. Please set vault release up again for whoever holds that role now.',
      contact_changed: true,
    });
  }

  const vault = await queryOne('SELECT id FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found. Please set up your vault password first.' });

  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;

  const { code, keyEnc } = sealVaultKey(key, vault.id);
  await query(
    `UPDATE vault_release
     SET key_enc = $1, code_issued_at = NOW(), status = 'armed',
         pending_started_at = NULL, pending_declared_by = NULL,
         cancelled_at = NULL, cancelled_reason = NULL, released_at = NULL,
         attempts = 0, locked_until = NULL, last_challenged_at = NULL,
         cancel_token = NULL, release_notified_at = NULL
     WHERE user_id = $2`,
    [keyEnc, req.user.id]
  );

  await auditRelease(req, 'vault_release_reissued', { contact_id: contact.id });

  res.json({
    success: true,
    replaced: true,
    code,
    contact: { id: contact.id, name: contact.name },
    code_issued_at: new Date().toISOString(),
  });
});

/**
 * DELETE /api/sections/digital-life/release/setup
 *
 * Turn it off. The envelope is deleted, any code already handed out becomes
 * useless, and the vault goes back to being sealed forever when the owner
 * dies. That is the product's default and a perfectly valid choice, so this
 * is not framed as a failure anywhere.
 *
 * Requires the vault password, same as turning off security-question
 * recovery. It destroys the only copy of the vault key that outlives the
 * owner, so it should cost the same proof of ownership that creating it did.
 */
/**
 * Turn vault release back on after a cancellation suspended it.
 *
 * Cancelling a pending release suspends the arrangement rather than re-arming
 * it, so that a false declaration costs the person who made it (see
 * cancelPendingRelease in lib/releaseChallenge.js for why). This is how the
 * owner turns it back on once they have satisfied themselves about what
 * happened.
 *
 * Deliberately does NOT require the vault password and does NOT mint a new
 * code. The envelope is untouched by a cancellation, so the code already in
 * the Legacy Contact's hands still opens it, and forcing a re-seal here would
 * mean physically delivering a new code after every false alarm. The thing
 * being proved is only that the account holder is present and chose this,
 * which the session already establishes.
 *
 * Clears the record of the false alarm, since from here on the arrangement is
 * live again and the previous declaration is history rather than state. The
 * audit log keeps what happened.
 */
router.post('/resume', requireAuth, async (req, res) => {
  const row = await queryOne(
    'SELECT id, status FROM vault_release WHERE user_id = $1',
    [req.user.id]
  );
  if (!row) return res.status(404).json({ error: 'Vault release is not set up yet.' });
  if (row.status === 'released') {
    return res.status(409).json({ error: 'Your vault has already been released and this cannot be undone.' });
  }
  if (row.status !== 'suspended') {
    return res.status(409).json({ error: 'Vault release is not suspended.' });
  }

  await query(
    `UPDATE vault_release
     SET status              = 'armed',
         pending_started_at  = NULL,
         pending_declared_by = NULL,
         cancelled_at        = NULL,
         cancelled_reason    = NULL,
         last_challenged_at  = NULL,
         cancel_token        = NULL
     WHERE user_id = $1 AND status = 'suspended'`,
    [req.user.id]
  );

  await auditRelease(req, 'vault_release_resumed', {});
  res.json({ success: true, status: 'armed' });
});

router.delete('/setup', requireAuth, async (req, res) => {
  const { vault_password } = req.body || {};

  const row = await queryOne('SELECT id, contact_id FROM vault_release WHERE user_id = $1', [req.user.id]);
  if (!row) return res.status(404).json({ error: 'Vault release is not set up yet.' });

  const key = await checkVault(vault_password, req.user.id, res, req);
  if (!key) return;

  await query('DELETE FROM vault_release WHERE user_id = $1', [req.user.id]);
  await auditRelease(req, 'vault_release_disabled', { contact_id: row.contact_id });

  res.json({ success: true });
});

/**
 * PUT /api/sections/digital-life/release/challenge-email
 *
 * The backup address the "someone has reported that you have passed away"
 * challenge also goes to. SMS was considered and dropped (spec section 10),
 * so this is the only second channel: it means an attacker who falsely
 * declares a death has to control two mailboxes rather than one.
 *
 * No vault password here, unlike every other route in this file. This is a
 * notification address, not vault-key material: nothing about it can open an
 * envelope, and the challenge still goes to the account's primary address and
 * is still cancelled by any successful login regardless of what is set here.
 * Asking for the vault password to edit a contact address would be friction
 * buying nothing.
 *
 * Pass null or an empty string to clear it.
 */
router.put('/challenge-email', requireAuth, async (req, res) => {
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'challenge_email')) {
    return res.status(400).json({ error: 'challenge_email is required (an address, or null to clear it).' });
  }
  const raw = req.body.challenge_email;
  const value = raw === null || raw === undefined ? '' : String(raw).trim();

  let next = null;
  if (value) {
    // Deliberately loose: a single @ with something either side and a dot in
    // the domain. Anything stricter rejects real addresses, and the address
    // is only ever used as an email destination, never as an identifier or in
    // a query.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 255) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const user = await queryOne('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (user?.email && user.email.toLowerCase() === value.toLowerCase()) {
      // The entire point of this address is to be a second mailbox. Accepting
      // the primary one would look configured while providing no second
      // channel at all, which is worse than leaving it blank.
      return res.status(400).json({
        error: 'Please use a different address from the one you sign in with, so the challenge reaches two separate mailboxes.',
      });
    }
    next = value;
  }

  await query('UPDATE users SET release_challenge_email = $1 WHERE id = $2', [next, req.user.id]);
  await auditRelease(req, next ? 'vault_release_challenge_email_set' : 'vault_release_challenge_email_cleared', {});

  res.json({ success: true, challenge_email: next });
});

/**
 * Audit helper. Records that something happened and to which contact, never
 * the code and never anything derived from it. Failures are logged and
 * swallowed, same as vaultRecovery.js's destroy-threshold audit: losing an
 * audit row should not fail an operation the user has already paid the
 * scrypt cost for and which has already been written.
 */
async function auditRelease(req, action, metadata) {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;
    await query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, action, ip, ua, JSON.stringify(metadata || {})]
    );
  } catch (e) {
    console.error('[vault-release] Audit log failed:', e.message);
  }
}

module.exports = router;
