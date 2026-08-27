const { queryOne, query } = require('../db/database');
const { destroyVaultData } = require('./vaultDestroy');

// Defaults for a vault row that predates these columns, or hasn't set them.
// Both are independently configurable per-vault (digital_vault table) -
// see routes/vaultRecovery.js's logout-threshold/lockout-threshold.
const DEFAULT_LOCKOUT_INTERVAL = 5;   // temporary lockout every N attempts, as a throttle
const DEFAULT_LOGOUT_THRESHOLD = 5;   // REV-22: was 3, aligned with the lockout interval
const LOCKOUT_MINUTES  = 3;           // REV-22: was 15, a throttle rather than a punishment

// REV-22: there is deliberately NO default destroy threshold. Permanent
// destruction of vault-protected data is opt-in only, and a vault with
// destroy_after_attempts IS NULL never destroys anything, no matter how many
// wrong guesses it sees. This value is only the number the client suggests
// when a user explicitly turns the setting on.
const OPT_IN_DESTROY_AFTER = 100;

// Normalizes the raw destroy_after_attempts column into either a positive
// integer threshold or null for "disabled". Deliberately NOT
// `vault?.destroy_after_attempts || SOMETHING`: NULL, 0 and undefined are all
// falsy, so an `||` fallback would silently re-enable permanent destruction on
// exactly the vaults that have it switched off. Missing vault row, NULL, and
// any non-positive value all mean disabled.
function resolveDestroyAfter(raw) {
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

// Checks whether the vault is currently under a lockout from a past run of
// failed attempts. Returns the lockedUntil timestamp if still locked, or
// null if there's no lockout (or it has already expired).
async function getVaultLockStatus(userId) {
  const user = await queryOne('SELECT vault_locked_until FROM users WHERE id = $1', [userId]);
  if (!user?.vault_locked_until) return null;
  const lockedUntil = new Date(user.vault_locked_until);
  return lockedUntil > new Date() ? lockedUntil : null;
}

// The wrong-attempt counter is persistent across lockouts (only a *correct*
// password resets it, via resetVaultAttempts) so a user-configured
// destroy_after_attempts threshold is actually reachable - it used to be
// zeroed the moment a lockout fired, which meant a cumulative threshold
// above LOCKOUT_INTERVAL could never be hit. The lockout still fires every
// LOCKOUT_INTERVAL attempts as a throttle in between.
//
// destroyAfter comes back as null for the default, disabled case (REV-22), in
// which case no number of wrong attempts destroys anything: the vault just
// keeps signing the session out and locking temporarily. Callers must handle
// a null destroyAfter in their user-facing messages rather than printing
// "N attempts remaining before deletion" for a vault that deletes nothing.
//
// REV-28: The vault_attempts counter is now incremented atomically via
// UPDATE...RETURNING to prevent concurrent requests from both reading the
// same count, incrementing it, and writing back the same value (which would
// undercount attempts and weaken lockout/destroy thresholds).
async function recordVaultAttempt(userId, req) {
  // Atomically increment vault_attempts and return the updated user row in one round trip.
  // This prevents concurrent requests from both reading count=N, incrementing to N+1,
  // and both writing N+1, causing an undercount.
  const user = await queryOne(
    'UPDATE users SET vault_attempts = vault_attempts + 1 WHERE id = $1 RETURNING id, name, email, vault_attempts',
    [userId]
  );
  if (!user) return { attempts: 0, shouldLogout: false, vaultLocked: false, vaultDestroyed: false, lockedUntil: null };

  const newAttempts = user.vault_attempts;

  const vault = await queryOne(
    'SELECT destroy_after_attempts, logout_after_attempts, lockout_after_attempts FROM digital_vault WHERE user_id = $1',
    [userId]
  );
  const destroyAfter   = resolveDestroyAfter(vault?.destroy_after_attempts);
  const logoutAfter    = vault?.logout_after_attempts    || DEFAULT_LOGOUT_THRESHOLD;
  const lockoutInterval = vault?.lockout_after_attempts  || DEFAULT_LOCKOUT_INTERVAL;

  const shouldLogout = newAttempts >= logoutAfter;

  if (destroyAfter !== null && newAttempts >= destroyAfter) {
    await query('UPDATE users SET vault_attempts = 0, vault_locked_until = NULL WHERE id = $1', [userId]);
    await destroyVaultData(userId, {
      reason: 'vault_destroyed_max_attempts',
      req,
      metadata: { attempts: newAttempts, destroy_after_attempts: destroyAfter },
    });
    _sendDestroyedEmail(user, newAttempts);
    return {
      attempts: newAttempts, shouldLogout: true, vaultLocked: false, vaultDestroyed: true, lockedUntil: null,
      logoutAfter, lockoutInterval, destroyAfter,
    };
  }

  const vaultLocked = newAttempts % lockoutInterval === 0;
  const lockedUntil = vaultLocked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

  // vault_attempts was already incremented atomically in the UPDATE...RETURNING above.
  // No separate UPDATE needed here.

  try {
    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0].trim() || req?.socket?.remoteAddress || null;
    const ua = req?.headers?.['user-agent'] || null;
    await query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'vault_attempt_failed', ip, ua, JSON.stringify({ attempt: newAttempts, vault_locked: vaultLocked })]
    );
  } catch (e) {
    console.error('[vault-attempts] Audit log failed:', e.message);
  }

  const remaining = destroyAfter === null ? null : Math.max(0, destroyAfter - newAttempts);
  _sendAttemptEmail(user, newAttempts, remaining, destroyAfter, logoutAfter, lockoutInterval);

  if (vaultLocked) {
    await query('UPDATE users SET vault_locked_until = $1 WHERE id = $2', [lockedUntil.toISOString(), userId]);
    _sendLockedEmail(user, lockedUntil, lockoutInterval);
  }

  return {
    attempts: newAttempts, shouldLogout, vaultLocked, vaultDestroyed: false, lockedUntil,
    logoutAfter, lockoutInterval, destroyAfter,
  };
}

async function resetVaultAttempts(userId) {
  await query('UPDATE users SET vault_attempts = 0, vault_locked_until = NULL WHERE id = $1', [userId]);
}

// maxAttempts is null when auto-destruction is disabled (the default since
// REV-22), so the subject line and body must not promise a countdown to a
// deletion that will never happen.
function _sendAttemptEmail(user, attempts, remaining, maxAttempts, logoutAfter, lockoutInterval) {
  const { sendEmail } = require('./sendEmail');
  const { vaultAttemptEmail } = require('./emailTemplates');
  sendEmail({
    to:      user.email,
    subject: maxAttempts === null
      ? `In Good Hands: Failed vault access attempt ${attempts}`
      : `In Good Hands: Failed vault access attempt ${attempts} of ${maxAttempts}`,
    html:    vaultAttemptEmail({
      name: user.name, attempts, remaining, maxAttempts,
      logoutAfter, lockoutInterval, lockoutMinutes: LOCKOUT_MINUTES,
    }),
  }).catch(e => console.error('[vault-attempts] Email failed:', e.message));
}

function _sendLockedEmail(user, lockedUntil, interval) {
  const { sendEmail } = require('./sendEmail');
  const { vaultLockedEmail } = require('./emailTemplates');
  sendEmail({
    to:      user.email,
    subject: 'In Good Hands: Your vault has been temporarily locked',
    html:    vaultLockedEmail({ name: user.name, lockedUntil, minutes: LOCKOUT_MINUTES, interval }),
  }).catch(e => console.error('[vault-attempts] Locked email failed:', e.message));
}

function _sendDestroyedEmail(user, attempts) {
  const { sendEmail } = require('./sendEmail');
  const { vaultDestroyedEmail } = require('./emailTemplates');
  sendEmail({
    to:      user.email,
    subject: 'In Good Hands: Your vault has been permanently deleted',
    html:    vaultDestroyedEmail({ name: user.name, attempts }),
  }).catch(e => console.error('[vault-attempts] Destroyed email failed:', e.message));
}

module.exports = {
  recordVaultAttempt, resetVaultAttempts, getVaultLockStatus, resolveDestroyAfter,
  DEFAULT_LOCKOUT_INTERVAL, DEFAULT_LOGOUT_THRESHOLD, LOCKOUT_MINUTES, OPT_IN_DESTROY_AFTER,
};
