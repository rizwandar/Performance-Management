const { queryOne, query } = require('../db/database');

const MAX_ATTEMPTS     = 5;
const LOGOUT_THRESHOLD = 3;
const LOCKOUT_MINUTES  = 15;

// Checks whether the vault is currently under a lockout from a past run of
// failed attempts. Returns the lockedUntil timestamp if still locked, or
// null if there's no lockout (or it has already expired).
async function getVaultLockStatus(userId) {
  const user = await queryOne('SELECT vault_locked_until FROM users WHERE id = $1', [userId]);
  if (!user?.vault_locked_until) return null;
  const lockedUntil = new Date(user.vault_locked_until);
  return lockedUntil > new Date() ? lockedUntil : null;
}

async function recordVaultAttempt(userId, req) {
  const user = await queryOne(
    'SELECT id, name, email, vault_attempts FROM users WHERE id = $1',
    [userId]
  );
  if (!user) return { attempts: 0, shouldLogout: false, vaultLocked: false, lockedUntil: null };

  const newAttempts  = (user.vault_attempts || 0) + 1;
  const vaultLocked  = newAttempts >= MAX_ATTEMPTS;
  const shouldLogout = newAttempts >= LOGOUT_THRESHOLD;
  const lockedUntil  = vaultLocked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

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

  const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
  _sendAttemptEmail(user, newAttempts, remaining);

  if (vaultLocked) {
    await query(
      'UPDATE users SET vault_attempts = 0, vault_locked_until = $1 WHERE id = $2',
      [lockedUntil.toISOString(), userId]
    );
    _sendLockedEmail(user, lockedUntil);
  }

  return { attempts: newAttempts, shouldLogout, vaultLocked, lockedUntil };
}

async function resetVaultAttempts(userId) {
  await query('UPDATE users SET vault_attempts = 0, vault_locked_until = NULL WHERE id = $1', [userId]);
}

function _sendAttemptEmail(user, attempts, remaining) {
  const { sendEmail } = require('./sendEmail');
  const { vaultAttemptEmail } = require('./emailTemplates');
  sendEmail({
    to:      user.email,
    subject: `In Good Hands: Failed vault access attempt ${attempts} of ${MAX_ATTEMPTS}`,
    html:    vaultAttemptEmail({ name: user.name, attempts, remaining, maxAttempts: MAX_ATTEMPTS }),
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

module.exports = { recordVaultAttempt, resetVaultAttempts, getVaultLockStatus, MAX_ATTEMPTS, LOCKOUT_MINUTES };
