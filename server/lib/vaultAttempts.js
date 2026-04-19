/**
 * Vault attempt tracking — fires on every failed vault password entry.
 * Accumulates per login session (counter resets on successful login).
 * At 3 attempts: force logout flag.
 * At 5 attempts: permanently delete vault data.
 */
const db = require('../db/database');

const MAX_ATTEMPTS     = 5;
const LOGOUT_THRESHOLD = 3;

/**
 * Call this whenever a vault password check fails.
 * Synchronous DB ops, fire-and-forget emails.
 * Returns { attempts, shouldLogout, vaultDeleted }
 */
function recordVaultAttempt(userId, req) {
  const user = db.prepare(
    'SELECT id, name, email, vault_attempts FROM users WHERE id = ?'
  ).get(userId);
  if (!user) return { attempts: 0, shouldLogout: false, vaultDeleted: false };

  const newAttempts  = (user.vault_attempts || 0) + 1;
  const vaultDeleted = newAttempts >= MAX_ATTEMPTS;
  const shouldLogout = newAttempts >= LOGOUT_THRESHOLD;

  db.prepare('UPDATE users SET vault_attempts = ? WHERE id = ?').run(newAttempts, userId);

  // Write to audit log
  try {
    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0].trim() || req?.socket?.remoteAddress || null;
    const ua = req?.headers?.['user-agent'] || null;
    db.prepare(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, 'vault_attempt_failed', ip, ua, JSON.stringify({ attempt: newAttempts, vault_deleted: vaultDeleted }));
  } catch (e) {
    console.error('[vault-attempts] Audit log failed:', e.message);
  }

  // Fire-and-forget email on every attempt
  const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
  _sendAttemptEmail(user, newAttempts, remaining);

  if (vaultDeleted) {
    // Permanently delete vault data
    db.prepare('DELETE FROM digital_vault WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM digital_credentials WHERE user_id = ?').run(userId);
    db.prepare('UPDATE users SET vault_attempts = 0 WHERE id = ?').run(userId);
    _sendDestroyedEmail(user);
  }

  return { attempts: newAttempts, shouldLogout, vaultDeleted };
}

/**
 * Reset the counter on successful login.
 */
function resetVaultAttempts(userId) {
  db.prepare('UPDATE users SET vault_attempts = 0 WHERE id = ?').run(userId);
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

function _sendDestroyedEmail(user) {
  const { sendEmail } = require('./sendEmail');
  const { vaultDestroyedEmail } = require('./emailTemplates');
  sendEmail({
    to:      user.email,
    subject: 'In Good Hands: Your vault has been deleted for your security',
    html:    vaultDestroyedEmail({ name: user.name }),
  }).catch(e => console.error('[vault-attempts] Destroyed email failed:', e.message));
}

module.exports = { recordVaultAttempt, resetVaultAttempts };
