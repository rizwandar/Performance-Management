const { queryOne, query } = require('../db/database');
const { destroyVaultData } = require('./vaultDestroy');

const LOCKOUT_INTERVAL = 5;   // temporary lockout every N attempts, as a throttle
const LOGOUT_THRESHOLD = 3;
const LOCKOUT_MINUTES  = 15;
const DEFAULT_DESTROY_AFTER = 100;

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
// above LOCKOUT_INTERVAL could never be hit. The 15-minute lockout still
// fires every LOCKOUT_INTERVAL attempts as a throttle in between.
async function recordVaultAttempt(userId, req) {
  const user = await queryOne(
    'SELECT id, name, email, vault_attempts FROM users WHERE id = $1',
    [userId]
  );
  if (!user) return { attempts: 0, shouldLogout: false, vaultLocked: false, vaultDestroyed: false, lockedUntil: null };

  const vault = await queryOne(
    'SELECT destroy_after_attempts FROM digital_vault WHERE user_id = $1',
    [userId]
  );
  const destroyAfter = vault?.destroy_after_attempts || DEFAULT_DESTROY_AFTER;

  const newAttempts  = (user.vault_attempts || 0) + 1;
  const shouldLogout = newAttempts >= LOGOUT_THRESHOLD;

  if (newAttempts >= destroyAfter) {
    await query('UPDATE users SET vault_attempts = 0, vault_locked_until = NULL WHERE id = $1', [userId]);
    await destroyVaultData(userId, {
      reason: 'vault_destroyed_max_attempts',
      req,
      metadata: { attempts: newAttempts, destroy_after_attempts: destroyAfter },
    });
    _sendDestroyedEmail(user, newAttempts);
    return { attempts: newAttempts, shouldLogout: true, vaultLocked: false, vaultDestroyed: true, lockedUntil: null };
  }

  const vaultLocked = newAttempts % LOCKOUT_INTERVAL === 0;
  const lockedUntil = vaultLocked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

  await query('UPDATE users SET vault_attempts = $1 WHERE id = $2', [newAttempts, userId]);

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

  const remaining = Math.max(0, destroyAfter - newAttempts);
  _sendAttemptEmail(user, newAttempts, remaining, destroyAfter);

  if (vaultLocked) {
    await query('UPDATE users SET vault_locked_until = $1 WHERE id = $2', [lockedUntil.toISOString(), userId]);
    _sendLockedEmail(user, lockedUntil);
  }

  return { attempts: newAttempts, shouldLogout, vaultLocked, vaultDestroyed: false, lockedUntil };
}

async function resetVaultAttempts(userId) {
  await query('UPDATE users SET vault_attempts = 0, vault_locked_until = NULL WHERE id = $1', [userId]);
}

function _sendAttemptEmail(user, attempts, remaining, maxAttempts) {
  const { sendEmail } = require('./sendEmail');
  const { vaultAttemptEmail } = require('./emailTemplates');
  sendEmail({
    to:      user.email,
    subject: `In Good Hands: Failed vault access attempt ${attempts} of ${maxAttempts}`,
    html:    vaultAttemptEmail({ name: user.name, attempts, remaining, maxAttempts }),
  }).catch(e => console.error('[vault-attempts] Email failed:', e.message));
}

function _sendLockedEmail(user, lockedUntil) {
  const { sendEmail } = require('./sendEmail');
  const { vaultLockedEmail } = require('./emailTemplates');
  sendEmail({
    to:      user.email,
    subject: 'In Good Hands: Your vault has been temporarily locked',
    html:    vaultLockedEmail({ name: user.name, lockedUntil, minutes: LOCKOUT_MINUTES }),
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
  recordVaultAttempt, resetVaultAttempts, getVaultLockStatus,
  LOCKOUT_INTERVAL, LOCKOUT_MINUTES, DEFAULT_DESTROY_AFTER,
};
