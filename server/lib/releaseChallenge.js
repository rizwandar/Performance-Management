/**
 * The challenge window for vault release on confirmed death
 * (docs/VAULT_RELEASE_ON_DEATH_SPEC.md, sections 3.3, 8.5 and 10).
 *
 * What this file is for, in one paragraph. A declaration of death already
 * releases everything that is not vault-protected, immediately, and that is
 * correct and does not change (spec 3.2). The vault cannot work that way: it
 * is the one thing that cannot be un-released, so instead of releasing it the
 * declaration opens a waiting period during which the owner is challenged.
 * Only a living person can object to being declared dead, so the safeguard is
 * not proof of anything, it is a challenge plus a clock. Any reply, or simply
 * signing in, cancels it. If the clock runs out uncancelled, the row moves to
 * 'released' and the Legacy Contact may then open the envelope with the code
 * the owner gave them by hand.
 *
 * The state machine, which is the whole of this module:
 *
 *     armed  --(a passing is declared)-->  pending
 *     pending --(owner replies, or signs in)-->  armed      [cancelled_*]
 *     pending --(window_hours elapse, uncancelled)-->  released
 *
 * Two asymmetries are deliberate and run through every function here.
 *
 *   1. Cancelling is cheap, reversible and available by several routes.
 *      Releasing is expensive, irreversible and has exactly one route. Where
 *      a decision could go either way, it goes toward not releasing.
 *   2. Nothing in this file reads, writes, derives from or logs key_enc, the
 *      release code, or anything that could help produce one. This module
 *      only moves state. The envelope and the code never meet here, and the
 *      "we cannot read your vault" promise is not this file's to weaken.
 *
 * Idempotency. The sweep runs daily and may re-run after a partial failure,
 * so every write here is either a conditional UPDATE that matches nothing on
 * a second pass (the status transitions) or is guarded by a per-recipient
 * "already told" stamp (the fan-outs), which is the same shape lib/deceased.js
 * and lib/inactivityTimer.js already use. Per-recipient failures never abort a
 * fan-out: each send is its own try/catch and the loop continues.
 */

const crypto = require('crypto');
const { query, queryOne, queryAll } = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { forLog } = require('./logSafe');
const {
  vaultReleaseChallengeEmail,
  vaultReleaseDeclarationNoticeEmail,
  vaultReleaseAvailableEmail,
} = require('./emailTemplates');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Where the "I am here" link points. It has to be an absolute URL that works
// from any mail client with no session, no cookie and no app shell, so it
// addresses the API directly rather than a client route: a link into the SPA
// would depend on a page existing to receive it, and the one link in the
// product that must never 404 is the one that stops a vault being handed over.
//
// No new required configuration. Render injects RENDER_EXTERNAL_URL on every
// web service, and a local dev server is reachable on its own port.
// PUBLIC_API_URL is there for any host that provides neither, or to front the
// API with a nicer domain later.
const PUBLIC_API_URL = (
  process.env.PUBLIC_API_URL
  || process.env.RENDER_EXTERNAL_URL
  || `http://localhost:${process.env.PORT || 3001}`
).replace(/\/+$/, '');

// How long to leave between challenge emails to the same owner. The cron
// entry runs once a day, so this only has to be short enough not to skip a
// day when a run lands slightly late or a deploy shifts the schedule, and
// long enough that an owner reading their mail does not see two identical
// messages in one morning. Deliberately not 24, which would make a run at
// 08:01 after one at 08:00 the previous day send nothing at all.
const CHALLENGE_INTERVAL_HOURS = 20;

function auditLog(userId, action, metadata) {
  // Fire and forget with its own catch, same as the audit helper in
  // lib/deceased.js: losing an audit row must not abort a sweep that is
  // part-way through a fan-out, and must never be the reason a cancellation
  // fails to apply.
  return query(
    'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
    [userId || null, action, metadata ? JSON.stringify(metadata) : null]
  ).catch(err => console.error('[vault-release] Audit log failed:', err.message));
}

/**
 * The moment the window closes, as a Date.
 *
 * window_hours is per-row rather than global because the spec leaves room for
 * a shorter window when an organization attests to a passing rather than a
 * Legacy Contact declaring one (spec 8, "funeral home attestation:
 * deferred"). Nothing sets a per-declarer value today; this reads whatever
 * the row carries so that adding one later needs no migration and no change
 * here.
 */
function windowClosesAt(row) {
  const started = new Date(row.pending_started_at);
  return new Date(started.getTime() + Number(row.window_hours) * 60 * 60 * 1000);
}

/**
 * The deadline as a human would read it, including the zone.
 *
 * Deployed servers run in UTC and the owner may be anywhere, so an unlabelled
 * local-looking time would be a guess presented as a fact. Naming the zone is
 * less friendly and more honest, which is the right trade for the one email
 * whose deadline actually matters. en-US to match the rest of the product
 * (the app is US-first; see the en-AU date-locale fix of 2026-09-24).
 */
function formatDeadline(date) {
  return date.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * A channel is one medium for reaching the owner during a pending release.
 *
 * Spec 10.3 is explicit that this has to be a list of channels with email as
 * the only implementation today, so that adding SMS later is one new entry
 * rather than a rewrite. SMS was scoped and then dropped (spec section 10):
 * it needed a provider, a verified sender, per-country number handling and,
 * for a "reply 1" flow, inbound webhooks and carrier registration. The job it
 * was there to do was narrow and worth preserving, though: a second path to
 * the owner that does not run through the mailbox a false declarer may also
 * control.
 *
 * The contract, kept deliberately small:
 *
 *   name          a stable identifier, used in logs and audit metadata.
 *   destinations  (owner) -> [{ kind, address }], the addresses on the
 *                 owner's record this medium can actually use. Empty is a
 *                 normal answer, not an error.
 *   send          (destination, message) -> Promise, rejecting on failure.
 *
 * A message is medium-agnostic and carries a rendering per medium: { subject,
 * html, text }. Email uses subject and html; an SMS channel would use text
 * and ignore the rest. That is the part that makes a second channel additive:
 * callers compose one message and never learn how many media exist.
 */
const emailChannel = {
  name: 'email',
  destinations(owner) {
    const out = [{ kind: 'primary', address: owner.email }];
    // The nominated backup address is the whole of what replaced SMS (spec
    // 10.2): it means an attacker who falsely declares a passing has to
    // control two mailboxes rather than one. Compared case-insensitively
    // against the primary as a belt-and-braces check - the route that sets it
    // already refuses the primary address, but a row written before that
    // check, or by hand, must not turn the second channel into a duplicate of
    // the first.
    const backup = owner.release_challenge_email;
    if (backup && backup.toLowerCase() !== String(owner.email || '').toLowerCase()) {
      out.push({ kind: 'backup', address: backup });
    }
    return out.filter(d => d.address);
  },
  async send(destination, message) {
    await sendEmail({ to: destination.address, subject: message.subject, html: message.html });
  },
};

const CHANNELS = [emailChannel];

/**
 * Send one message to the owner on every channel and every destination.
 *
 * Per-destination failures never stop the rest, matching the fan-outs in
 * lib/deceased.js: one dead mailbox must not cost the owner the other
 * address, or a future SMS, that might have saved them.
 */
async function dispatchToOwner(owner, message) {
  let sent = 0;
  let attempted = 0;
  const reached = [];
  const failed = [];

  for (const channel of CHANNELS) {
    let destinations = [];
    try {
      destinations = channel.destinations(owner) || [];
    } catch (err) {
      console.error(`[vault-release] Channel ${channel.name} could not resolve destinations:`, err.message);
      continue;
    }
    for (const destination of destinations) {
      attempted++;
      try {
        await channel.send(destination, message);
        sent++;
        reached.push(`${channel.name}:${destination.kind}`);
      } catch (err) {
        failed.push(`${channel.name}:${destination.kind}`);
        // forLog, not the raw address: the provider echoes the recipient back
        // in its error text, and this is an address the owner nominated.
        console.error(
          `[vault-release] ${channel.name} challenge to ${destination.kind} (${forLog(destination.address)}) failed:`,
          err.message
        );
      }
    }
  }

  return { sent, attempted, failedCount: attempted - sent, reached, failed };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/**
 * A passing has been declared: open the challenge window.
 *
 * Called from markUserDeceased (lib/deceased.js), which is the single entry
 * point every declaration path funnels through - the Legacy Contact from
 * their access link, organization staff from the org portal, and the
 * inactivity timer's direct-notify fallback. It releases nothing. Everything
 * that is not vault-protected has already been released by the time this
 * runs, exactly as before; this only moves a vault_release row from 'armed'
 * to 'pending'.
 *
 * Idempotent by construction. The UPDATE is conditioned on status = 'armed',
 * so a retried markUserDeceased (which happens by design: it re-runs after a
 * partial notification failure) matches zero rows the second time and cannot
 * restart a clock that is already running, re-open a window the owner has
 * already cancelled, or reverse a release.
 *
 * Returns { opened, reason } rather than throwing for the ordinary "nothing
 * to do" cases, because for most accounts there is no vault_release row at
 * all: release is opt-in, and a vault with nobody set up to receive it simply
 * stays sealed forever (spec 3.5).
 */
async function openReleaseWindow(userId, { declaredByType, declaredById } = {}) {
  const row = await queryOne(
    'SELECT id, status FROM vault_release WHERE user_id = $1',
    [userId]
  );
  if (!row) return { opened: false, reason: 'not_set_up' };
  if (row.status !== 'armed') return { opened: false, reason: `already_${row.status}` };

  const updated = await queryOne(
    `UPDATE vault_release
     SET status              = 'pending',
         pending_started_at  = NOW(),
         pending_declared_by = $1,
         cancelled_at        = NULL,
         cancelled_reason    = NULL,
         last_challenged_at  = NULL,
         release_notified_at = NULL,
         cancel_token        = NULL
     WHERE user_id = $2 AND status = 'armed'
     RETURNING id, window_hours, pending_started_at`,
    [declaredByType || 'unknown', userId]
  );
  // Lost the race to something else that moved this row. Not an error: the
  // window is open either way, which is all the caller needs.
  if (!updated) return { opened: false, reason: 'race_lost' };

  // Only the declarer TYPE goes in pending_declared_by, matching
  // users.deceased_by, which stores the same thing. The id is a users.id for
  // org staff but a trusted_contacts.id for a Legacy Contact, so putting both
  // in one TEXT column would produce a field nobody could safely interpret.
  // The id goes in the audit metadata instead, where it is labelled.
  await auditLog(userId, 'vault_release_window_opened', {
    declared_by_type: declaredByType || null,
    declared_by_id:   declaredById ?? null,
    window_hours:     updated.window_hours,
    window_closes_at: windowClosesAt(updated).toISOString(),
  });

  console.log(
    `[vault-release] Challenge window opened for user ${userId} ` +
    `(${updated.window_hours}h, declared by ${declaredByType || 'unknown'}). Nothing released.`
  );

  // Challenge the owner and tell the contacts now, rather than waiting for
  // the next 8am run. See dispatchPendingNow for why, and for why it cannot
  // throw back into the declaration path.
  await dispatchPendingNow(userId);

  return { opened: true, windowHours: updated.window_hours };
}

/**
 * Cancel a pending release.
 *
 * The cheap, reversible half of the design, and the one that must work from
 * as many directions as possible. Three callers today:
 *
 *   - a successful login (routes/auth.js), reason 'owner_login'. Passive,
 *     needs no decision from the owner, and the strongest evidence of life
 *     available (spec 3.3).
 *   - the "I am here" link in the challenge email (routes/vaultReleaseCancel.js),
 *     reason 'owner_challenge_link'. Works with no session, because someone
 *     being falsely declared dead may not be able to sign in quickly.
 *   - the daily sweep, reason 'owner_activity_detected', when
 *     users.last_active_at has moved since the declaration. This is a safety
 *     net rather than a separate route: if the inline cancel on login ever
 *     fails to write, the next sweep still notices the owner was here.
 *
 * Conditioned on status = 'pending', so it cannot resurrect a released row.
 * Releasing is the one transition this function will not undo, and that
 * asymmetry is intentional: once the envelope has been handed over there is
 * nothing to take back.
 *
 * Returns true only if this call is the one that cancelled it.
 */
async function cancelPendingRelease(userId, reason, metadata = {}) {
  const cancelled = await queryOne(
    `UPDATE vault_release
     SET status             = 'armed',
         cancelled_at       = NOW(),
         cancelled_reason   = $1,
         last_challenged_at = NULL,
         cancel_token       = NULL
     WHERE user_id = $2 AND status = 'pending'
     RETURNING id, pending_started_at, pending_declared_by, window_hours`,
    [String(reason || 'unknown').slice(0, 120), userId]
  );
  if (!cancelled) return false;

  // pending_started_at and pending_declared_by are deliberately NOT cleared.
  // Together with cancelled_at and cancelled_reason they are the record of
  // the false alarm: who declared it, when the clock started, and how it was
  // stopped. Re-arming the envelope (routes/vaultRelease.js) is what clears
  // them, because that is the point at which the arrangement itself changes.

  // So that a later, genuine declaration tells everyone afresh instead of
  // being silently suppressed by a stamp left over from this false alarm.
  await query(
    'UPDATE trusted_contacts SET release_declared_notified_at = NULL WHERE user_id = $1',
    [userId]
  );

  await auditLog(userId, 'vault_release_cancelled', {
    reason,
    pending_started_at: cancelled.pending_started_at,
    declared_by_type:   cancelled.pending_declared_by,
    ...metadata,
  });

  console.log(`[vault-release] Pending release cancelled for user ${userId} (${forLog(reason)}).`);
  return true;
}

/**
 * Cancel from the "I am here" link, with no session involved.
 *
 * Looked up by exact token value against a partial unique index, the same way
 * routes/access.js consumes a trusted_contact_tokens row, and only honoured
 * while the row is still pending. Single-use: cancelPendingRelease above sets
 * cancel_token to NULL in the same statement that cancels, so a second press
 * finds nothing.
 *
 * Returns { cancelled, reason }. A token that matches nothing is reported
 * back as 'not_found' with no further detail, and the route renders the same
 * page for a token that never existed, one already used and one whose window
 * has since closed. There is nothing to be learned from distinguishing them
 * and an attacker holding a guess should not be told which kind of wrong it
 * is.
 */
async function cancelByToken(token, context = {}) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    return { cancelled: false, reason: 'not_found' };
  }
  const row = await queryOne(
    `SELECT user_id, status FROM vault_release WHERE cancel_token = $1`,
    [token]
  );
  if (!row || row.status !== 'pending') return { cancelled: false, reason: 'not_found' };

  const cancelled = await cancelPendingRelease(row.user_id, 'owner_challenge_link', {
    ip:         context.ip || null,
    user_agent: context.userAgent || null,
  });
  return cancelled ? { cancelled: true } : { cancelled: false, reason: 'not_found' };
}

/**
 * The token carried by this window's challenge emails, minted on first need.
 *
 * One token for the whole window rather than one per email. The owner may
 * well open the first message after the third has arrived, and rotating the
 * token would quietly break the link in every earlier email, which is the
 * opposite of what a safety valve should do.
 *
 * The UPDATE is conditioned on status = 'pending' AND cancel_token IS NULL,
 * so two concurrent callers cannot overwrite each other's token and leave one
 * of them emailing a value that no longer works. A loser re-reads the stored
 * one.
 */
async function ensureCancelToken(userId) {
  const existing = await queryOne(
    `SELECT cancel_token FROM vault_release WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
  if (!existing) return null;
  if (existing.cancel_token) return existing.cancel_token;

  const token = crypto.randomBytes(32).toString('hex');
  const updated = await queryOne(
    `UPDATE vault_release SET cancel_token = $1
     WHERE user_id = $2 AND status = 'pending' AND cancel_token IS NULL
     RETURNING cancel_token`,
    [token, userId]
  );
  if (updated) return updated.cancel_token;

  const reread = await queryOne(
    `SELECT cancel_token FROM vault_release WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
  return reread?.cancel_token || null;
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/**
 * Tell every trusted contact that a declaration has been made.
 *
 * Not only the person who made it (spec 3.3). This is a security control
 * dressed as a courtesy, and the cheapest one in the design: it routes
 * through other people rather than another device, so one bad actor cannot
 * declare a passing quietly, and for most users another human answering the
 * phone is a faster alarm than any automated message. The declarer is
 * included rather than filtered out, deliberately - a receipt costs nothing
 * and makes a false declaration feel observed.
 *
 * Per-contact stamp, per-contact try/catch, exactly like notifyTrustedContacts
 * in lib/inactivityTimer.js: a provider failure for one recipient must not
 * cost the others, and tomorrow's run must retry only the ones still missing
 * a stamp rather than re-emailing everybody every morning.
 *
 * No access link and no instructions on opening anything. Whoever is entitled
 * to an access link already received one from the demise fan-out in
 * lib/deceased.js, which runs before this ever does.
 */
async function notifyContactsOfDeclaration(row, owner, deadlineText) {
  const contacts = await queryAll(
    `SELECT id, name, email FROM trusted_contacts
     WHERE user_id = $1 AND email IS NOT NULL AND email != ''
       AND release_declared_notified_at IS NULL`,
    [row.user_id]
  );
  if (contacts.length === 0) return { sentCount: 0, attempted: 0, failedCount: 0 };

  let sentCount = 0;
  for (const contact of contacts) {
    try {
      await sendEmail({
        to:      contact.email,
        subject: `A report has been made about ${owner.name}`,
        html:    vaultReleaseDeclarationNoticeEmail({
          recipientName: contact.name || 'there',
          ownerName:     owner.name,
          deadlineText,
        }),
      });
      await query(
        'UPDATE trusted_contacts SET release_declared_notified_at = NOW() WHERE id = $1',
        [contact.id]
      );
      sentCount++;
    } catch (err) {
      console.error(
        `[vault-release] Declaration notice to contact ${contact.id} (${forLog(contact.email)}) failed:`,
        err.message
      );
    }
  }

  if (sentCount > 0) {
    await auditLog(row.user_id, 'vault_release_declaration_notice_sent', {
      notified: sentCount, attempted: contacts.length, failed: contacts.length - sentCount,
    });
  }
  return { sentCount, attempted: contacts.length, failedCount: contacts.length - sentCount };
}

/**
 * Challenge the owner, if one is due.
 *
 * Paced by last_challenged_at rather than sent once, because "repeatedly
 * rather than once" is the point (spec 3.3): a single message can be missed,
 * filtered or read a week late, and the whole safeguard rests on the owner
 * seeing one of them.
 *
 * last_challenged_at is only stamped when at least one destination actually
 * accepted the message, the same success-gating as notifyTrustedContacts in
 * lib/inactivityTimer.js. An all-failed attempt leaves it NULL or stale so
 * tomorrow's run tries again, and - see releaseIfWindowClosed below - a
 * window whose owner has never once been successfully challenged will not be
 * allowed to run out.
 *
 * Caveat worth knowing when reading logs: lib/sendEmail.js resolves without
 * sending when RESEND_API_KEY is unset, so on a machine with no email
 * configured this counts as a success. That is a local-development property,
 * not a deployed one.
 */
async function challengeOwner(row, owner, deadlineText) {
  if (row.last_challenged_at) {
    const sinceHours = (Date.now() - new Date(row.last_challenged_at).getTime()) / (60 * 60 * 1000);
    if (sinceHours < CHALLENGE_INTERVAL_HOURS) return { skipped: true, sent: 0 };
  }

  const token = await ensureCancelToken(row.user_id);
  if (!token) {
    // The row stopped being pending between the sweep's SELECT and here, so
    // somebody cancelled or it was re-armed. Sending a challenge now would
    // tell the owner a clock is running when it is not.
    return { skipped: true, sent: 0, reason: 'no_longer_pending' };
  }

  const result = await dispatchToOwner(owner, {
    subject: 'Please confirm you are there',
    html:    vaultReleaseChallengeEmail({
      name:         owner.name,
      contactName:  row.contact_name || null,
      deadlineText,
      cancelLink:   `${PUBLIC_API_URL}/api/vault-release/cancel/${token}`,
    }),
    // For a future SMS channel. Spec 9.2's wording, link-only: spec 9.4
    // concluded that accepting an inbound "reply 1" needs a two-way number,
    // an inbound webhook and per-country carrier registration, and that the
    // fallback is an SMS carrying only the link, which keeps the second
    // channel without needing inbound capability.
    text: `In Good Hands: it has been reported that you have passed away. `
        + `If you are reading this, open this link and nothing further will happen: `
        + `${PUBLIC_API_URL}/api/vault-release/cancel/${token}`,
  });

  if (result.sent > 0) {
    await query('UPDATE vault_release SET last_challenged_at = NOW() WHERE user_id = $1', [row.user_id]);
    await auditLog(row.user_id, 'vault_release_challenge_sent', {
      reached: result.reached, failed: result.failed, window_closes_at: deadlineText,
    });
    console.log(`[vault-release] Challenged user ${row.user_id} on ${result.reached.join(', ')}.`);
  } else {
    await auditLog(row.user_id, 'vault_release_challenge_failed', { failed: result.failed, attempted: result.attempted });
    console.error(
      `[vault-release] Could not reach user ${row.user_id} on any channel ` +
      `(${result.attempted} destination(s) attempted). The window will not be allowed to close.`
    );
  }
  return { skipped: false, sent: result.sent };
}

/**
 * The window has closed uncancelled: move the row to 'released'.
 *
 * This is the only irreversible transition in the module, so it carries two
 * guards rather than one.
 *
 *   1. The clock must actually have run out: pending_started_at +
 *      window_hours in the past.
 *   2. The owner must have been successfully challenged at least once.
 *
 * The second guard is not in the spec, and it should be. Without it a server
 * that was down for the length of the window, or an email provider outage
 * spanning it, releases a vault to someone who declared a death while the
 * owner was never once contacted - every one of the safeguards in section 3.3
 * silently skipped, and the "challenge plus a waiting period" reduced to a
 * waiting period. The fix is not to release early or late but to treat the
 * window as beginning when the owner was first actually reached: if the clock
 * runs out with last_challenged_at still NULL, pending_started_at is pushed
 * forward and the clock restarts, which is recorded as its own audit event so
 * a later reader can see it happened and why. That cannot loop indefinitely
 * in the normal case - one successful send sets last_challenged_at and the
 * restart can never fire again for this window - and in the pathological case
 * where the owner is permanently unreachable it errs toward not releasing,
 * which is the standing rule for this feature.
 *
 * The state change is written before the courtesy email, and tracked by its
 * own column, so an email failure cannot leave the row describing a release
 * that did not happen, nor a release whose recipient is never told.
 */
async function releaseIfWindowClosed(row, owner) {
  const closesAt = windowClosesAt(row);
  if (closesAt.getTime() > Date.now()) return { released: false, reason: 'window_open' };

  if (!row.last_challenged_at) {
    const restarted = await queryOne(
      `UPDATE vault_release SET pending_started_at = NOW()
       WHERE user_id = $1 AND status = 'pending' AND last_challenged_at IS NULL
       RETURNING pending_started_at`,
      [row.user_id]
    );
    if (restarted) {
      await auditLog(row.user_id, 'vault_release_window_restarted', {
        previous_pending_started_at: row.pending_started_at,
        reason: 'owner_was_never_successfully_challenged',
      });
      console.warn(
        `[vault-release] Window for user ${row.user_id} ran out without the owner ever being ` +
        `reached. Clock restarted rather than releasing.`
      );
      row.pending_started_at = restarted.pending_started_at;
    }
    return { released: false, reason: 'never_challenged' };
  }

  const released = await queryOne(
    `UPDATE vault_release
     SET status = 'released', released_at = NOW(), cancel_token = NULL
     WHERE user_id = $1 AND status = 'pending'
     RETURNING id, contact_id, released_at`,
    [row.user_id]
  );
  if (!released) return { released: false, reason: 'no_longer_pending' };

  await auditLog(row.user_id, 'vault_release_released', {
    contact_id:         released.contact_id,
    declared_by_type:   row.pending_declared_by,
    pending_started_at: row.pending_started_at,
    window_hours:       row.window_hours,
    last_challenged_at: row.last_challenged_at,
  });
  console.log(
    `[vault-release] Window closed uncancelled for user ${row.user_id}. ` +
    `Envelope is now available to contact ${released.contact_id}.`
  );

  await notifyReleaseAvailable({ ...row, contact_id: released.contact_id }, owner);
  return { released: true };
}

/**
 * Tell the Legacy Contact the envelope is available (spec 8.5, step 7).
 *
 * Retryable on its own column, because the release itself has already
 * happened and must not be undone by a failed send. Picked up again by the
 * sweep's released-but-unnotified pass below.
 *
 * Reuses the access link the contact already holds rather than minting a new
 * one. generateAccessLink in lib/inactivityTimer.js deletes every existing
 * token for a contact before inserting, so calling it here would invalidate
 * the never-expiring link that was emailed to this person when the passing
 * was confirmed - breaking a working link in order to send a courtesy notice.
 * If they have no live token the email simply goes without a button; they
 * have their original one, and this message is not how they reach the vault.
 */
async function notifyReleaseAvailable(row, owner) {
  if (row.release_notified_at) return { sentCount: 0 };
  if (!row.contact_id) {
    // contact_id is ON DELETE SET NULL by design, so the envelope survives a
    // deleted contact. There is nobody to write to; the release still stands
    // and the audit trail says why no notice went out.
    await auditLog(row.user_id, 'vault_release_release_notice_skipped', { reason: 'no_contact_designated' });
    return { sentCount: 0 };
  }

  const contact = await queryOne(
    'SELECT id, name, email FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [row.contact_id, row.user_id]
  );
  if (!contact?.email) {
    await auditLog(row.user_id, 'vault_release_release_notice_skipped', {
      reason: 'contact_missing_or_no_email', contact_id: row.contact_id,
    });
    return { sentCount: 0 };
  }

  const tokenRow = await queryOne(
    `SELECT token FROM trusted_contact_tokens
     WHERE contact_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [contact.id]
  );

  try {
    await sendEmail({
      to:      contact.email,
      subject: `${owner.name}'s vault is now available to you`,
      html:    vaultReleaseAvailableEmail({
        recipientName: contact.name || 'there',
        ownerName:     owner.name,
        accessLink:    tokenRow ? `${CLIENT_URL}/access/${tokenRow.token}` : null,
      }),
    });
    await query('UPDATE vault_release SET release_notified_at = NOW() WHERE user_id = $1', [row.user_id]);
    await auditLog(row.user_id, 'vault_release_release_notice_sent', { contact_id: contact.id });
    return { sentCount: 1 };
  } catch (err) {
    console.error(
      `[vault-release] Release notice to contact ${contact.id} (${forLog(contact.email)}) failed:`,
      err.message
    );
    return { sentCount: 0 };
  }
}

// The columns every per-row step below needs, joined to the owner and the
// designated contact. Kept in one place so that the daily sweep and the
// immediate pass that runs the moment a window opens cannot drift apart in
// what they load.
const SWEEP_SELECT = `
  SELECT vr.user_id, vr.status, vr.pending_started_at, vr.pending_declared_by,
         vr.window_hours, vr.last_challenged_at, vr.release_notified_at,
         vr.contact_id, vr.released_at,
         u.name, u.email, u.release_challenge_email, u.last_active_at,
         tc.name AS contact_name
  FROM vault_release vr
  JOIN users u ON u.id = vr.user_id
  LEFT JOIN trusted_contacts tc ON tc.id = vr.contact_id
`;

/**
 * Everything that happens to one row on one pass.
 *
 * Order matters and is chosen to err toward not releasing:
 *
 *   1. Has the owner been active since the declaration? Cancel and stop.
 *      Checked first so that a login the inline hook in routes/auth.js
 *      somehow failed to act on still cancels before anything can release.
 *   2. Has the clock run out, with the owner having been reached at least
 *      once? Release, tell the Legacy Contact, and stop.
 *   3. Tell any trusted contacts not yet told that a declaration was made.
 *   4. Challenge the owner, if one is due.
 *
 * The deadline text is computed after step 2 on purpose: that step can push
 * pending_started_at forward when the owner has never been reached, and
 * quoting a deadline that has already passed would be worse than useless in
 * the one message somebody actually needs to act on.
 */
async function processReleaseRow(row) {
  const owner = {
    id: row.user_id, name: row.name, email: row.email,
    release_challenge_email: row.release_challenge_email,
  };

  // Already released and only owed its courtesy notice. Nothing below can or
  // should change that state.
  if (row.status === 'released') {
    await notifyReleaseAvailable(row, owner);
    return { outcome: 'release_notice_retried' };
  }

  // Safety net for the cancel-on-login hook in routes/auth.js. Login stamps
  // users.last_active_at, so an owner who signed in after the declaration has
  // demonstrated they are alive whether or not the inline cancel wrote
  // successfully. Strictly after pending_started_at, so activity from before
  // the declaration cannot cancel the window.
  if (row.last_active_at && new Date(row.last_active_at) > new Date(row.pending_started_at)) {
    const cancelled = await cancelPendingRelease(row.user_id, 'owner_activity_detected', {
      last_active_at: row.last_active_at,
    });
    return { outcome: cancelled ? 'cancelled' : 'no_change' };
  }

  const releaseResult = await releaseIfWindowClosed(row, owner);
  if (releaseResult.released) return { outcome: 'released' };

  const deadlineText = formatDeadline(windowClosesAt(row));

  await notifyContactsOfDeclaration(row, owner, deadlineText);

  const challengeResult = await challengeOwner(row, owner, deadlineText);
  return {
    outcome: (!challengeResult.skipped && challengeResult.sent > 0) ? 'challenged' : 'no_change',
  };
}

/**
 * The daily sweep. Registered on the 8am cron in server/index.js next to the
 * inactivity check, which is the job this one is the vault-shaped sibling of.
 *
 * Rows still owed a release notice are swept alongside the pending ones, so a
 * failed courtesy email is retried tomorrow rather than lost.
 *
 * Every row is wrapped in its own try/catch: one account with a broken row or
 * an unreachable mailbox must not stop the sweep reaching the next.
 */
async function runVaultReleaseChallenges() {
  const rows = await queryAll(`
    ${SWEEP_SELECT}
    WHERE vr.status = 'pending'
       OR (vr.status = 'released' AND vr.release_notified_at IS NULL)
    ORDER BY vr.pending_started_at ASC
  `);
  if (rows.length === 0) return { examined: 0, cancelled: 0, released: 0, challenged: 0 };

  const counts = { examined: rows.length, cancelled: 0, released: 0, challenged: 0 };
  for (const row of rows) {
    try {
      const { outcome } = await processReleaseRow(row);
      if (outcome === 'cancelled')  counts.cancelled++;
      if (outcome === 'released')   counts.released++;
      if (outcome === 'challenged') counts.challenged++;
    } catch (err) {
      console.error(`[vault-release] Sweep failed for user ${row.user_id}:`, err.message);
    }
  }

  console.log(
    `[vault-release] Sweep done: ${counts.examined} row(s) examined, ` +
    `${counts.challenged} challenged, ${counts.cancelled} cancelled, ${counts.released} released.`
  );
  return counts;
}

/**
 * One pass over a single account, run inline the moment a window opens.
 *
 * Without this the first challenge email and the all-contacts notice would
 * wait for the next 8am cron run, costing the owner up to a day of a window
 * that exists solely to give them time to object, and leaving the "one bad
 * actor cannot do this quietly" control silent for that day as well. Sending
 * inline is consistent with the path it runs from: markUserDeceased already
 * fans out to every trusted contact and everyone on the notify list in the
 * same request.
 *
 * Errors are swallowed and logged rather than propagated. The window is
 * already open and recorded by the time this runs, so an email provider
 * failure must not turn into a failed declaration, and the daily sweep picks
 * up whatever did not get done here.
 */
async function dispatchPendingNow(userId) {
  try {
    const row = await queryOne(
      `${SWEEP_SELECT} WHERE vr.user_id = $1 AND vr.status = 'pending'`,
      [userId]
    );
    if (!row) return;
    await processReleaseRow(row);
  } catch (err) {
    console.error(`[vault-release] Immediate challenge pass failed for user ${userId}:`, err.message);
  }
}

module.exports = {
  openReleaseWindow,
  cancelPendingRelease,
  cancelByToken,
  runVaultReleaseChallenges,
  dispatchPendingNow,
  // Exported for tests and for the route layer; not part of the sweep's
  // public surface.
  windowClosesAt,
  formatDeadline,
  CHALLENGE_INTERVAL_HOURS,
  CHANNELS,
};
