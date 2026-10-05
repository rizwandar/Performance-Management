/**
 * Attempt counting and lockout for the release-code endpoint
 * (docs/VAULT_RELEASE_ON_DEATH_SPEC.md, section 4: "replay or brute force of
 * the release code").
 *
 * Deliberately the same shape as lib/vaultAttempts.js, which throttles
 * guesses at the owner's vault password, rather than a scheme of its own:
 * a second guessing path into the same vault key must not have softer or
 * merely different limits from the first.
 *
 * Mirrored from vaultAttempts.js:
 *
 *   - the counter is incremented atomically with UPDATE ... RETURNING, so
 *     concurrent guesses cannot both read N and both write N+1 (REV-28).
 *   - the counter is persistent across lockouts and is only reset by a
 *     correct code, so the lockout keeps firing every interval instead of
 *     being zeroed each time it triggers.
 *   - a correct code works immediately even mid-lockout. There is nothing
 *     left to throttle once somebody has already got it right.
 *
 * Deliberately NOT mirrored:
 *
 *   - no permanent destruction. vaultAttempts can delete a vault after an
 *     opt-in number of wrong guesses. Here the owner is dead, cannot have
 *     opted in to this, and cannot recover from it: destroying the vault
 *     because a grieving person mistyped would be the single worst outcome
 *     this feature can produce.
 *   - no forced logout. There is no session to end.
 *   - no email per failed attempt. The address those mails go to belongs to
 *     someone who has been declared dead, so they are noise at best. The
 *     audit log carries the record instead.
 *
 * The counter lives on vault_release.attempts / vault_release.locked_until,
 * which the schema has carried since the table was created, so this needs no
 * migration. It is per owner rather than per IP: the route adds a per-IP
 * limiter on top for the cross-account case.
 */

const { queryOne } = require('../db/database');

// Five wrong codes, then a pause, and the counter keeps running so the pause
// recurs. The release code is 20 characters over a 32-symbol alphabet (100
// bits), so this is not what stands between an attacker and the vault: the
// entropy is. It is here because an unthrottled endpoint is still an oracle,
// and because the rest of the vault surface throttles.
//
// Fifteen minutes rather than vaultAttempts' three. That value is tuned for
// an owner who is sitting at the screen and will remember their password in a
// moment; this code is transcribed from a sheet of paper that was put
// somewhere safe years ago, so a wrong code here is far more likely to mean
// "wrong piece of paper" than "nearly right", and a retry is unlikely to be
// immediate. The response carries locked_until so the UI can name the exact
// time rather than leaving someone guessing.
const ATTEMPTS_PER_LOCKOUT = 5;
const LOCKOUT_MINUTES = 15;

/**
 * The active lockout for this owner's envelope, or null if there is none.
 * An expired locked_until is treated as no lockout and left in place, same as
 * getVaultLockStatus does with users.vault_locked_until.
 */
async function getReleaseLockStatus(userId) {
  const row = await queryOne('SELECT locked_until FROM vault_release WHERE user_id = $1', [userId]);
  if (!row?.locked_until) return null;
  const lockedUntil = new Date(row.locked_until);
  return lockedUntil > new Date() ? lockedUntil : null;
}

/**
 * Record one wrong code. Returns { attempts, locked, lockedUntil }.
 *
 * `locked` is true only on the attempt that trips the lockout, which is what
 * the caller needs in order to answer 423 rather than 401 on that one
 * request.
 */
async function recordReleaseAttempt(userId) {
  const row = await queryOne(
    'UPDATE vault_release SET attempts = attempts + 1 WHERE user_id = $1 RETURNING attempts',
    [userId]
  );
  if (!row) return { attempts: 0, locked: false, lockedUntil: null };

  const attempts = Number(row.attempts);
  if (attempts % ATTEMPTS_PER_LOCKOUT !== 0) {
    return { attempts, locked: false, lockedUntil: null };
  }

  const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  await queryOne(
    'UPDATE vault_release SET locked_until = $1 WHERE user_id = $2 RETURNING id',
    [lockedUntil.toISOString(), userId]
  );
  return { attempts, locked: true, lockedUntil };
}

/** A correct code clears both the counter and any lockout. */
async function resetReleaseAttempts(userId) {
  await queryOne(
    'UPDATE vault_release SET attempts = 0, locked_until = NULL WHERE user_id = $1 RETURNING id',
    [userId]
  );
}

module.exports = {
  getReleaseLockStatus,
  recordReleaseAttempt,
  resetReleaseAttempts,
  ATTEMPTS_PER_LOCKOUT,
  LOCKOUT_MINUTES,
};
