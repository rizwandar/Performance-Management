const { queryOne, query } = require('../db/database');

const MAX_ATTEMPTS     = 5;
const LOGOUT_THRESHOLD = 3;

async function recordVaultAttempt(userId, req) {
  const user = await queryOne(
    'SELECT id, name, email, vault_attempts FROM users WHERE id = $1',
    [userId]
  );
  if (!user) return { attempts: 0, shouldLogout: false, vaultDeleted: false };

  const newAttempts  = (user.vault_attempts || 0) + 1;
  const vaultDeleted = newAttempts >= MAX_ATTEMPTS;
  const shouldLogout = newAttempts >= LOGOUT_THRESHOLD;

  await query('UPDATE users SET vault_attempts = $1 WHERE id = $2', [newAttempts, userId]);

  try {
    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0].trim() || req?.socket?.remoteAddress || null;
    const ua = req?.headers?.['user-agent'] || null;
    await query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'vault_attempt_failed', ip, ua, JSON.stringify({ attempt: newAttempts, vault_deleted: vaultDeleted })]
    );
  } catch (e) {
    console.error('[vault-attempts] Audit log failed:', e.message);
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
  _sendAttemptEmail(user, newAttempts, remaining);

  if (vaultDeleted) {
    await query('DELETE FROM digital_vault WHERE user_id = $1', [userId]);
    await query('DELETE FROM digital_credentials WHERE user_id = $1', [userId]);
    await query('UPDATE users SET vault_attempts = 0 WHERE id = $1', [userId]);
    _sendDestroyedEmail(user);
  }

  return { attempts: newAttempts, shouldLogout, vaultDeleted };
}

async function resetVaultAttempts(userId) {
  await query('UPDATE users SET vault_attempts = 0 WHERE id = $1', [userId]);
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
