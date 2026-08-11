const { queryOne } = require('../db/database');
const { deriveKey, verifyVaultPassword } = require('./vault');
const { recordVaultAttempt, getVaultLockStatus, resetVaultAttempts } = require('./vaultAttempts');

// Shared vault-password check used by every route that touches vault-protected
// data (sections.js, documents.js). Centralized so the lockout/attempt-counter
// behavior can't drift between routes the way it did before the four
// unprotected GET routes were found in 2026-07-27.
async function checkVault(vault_password, userId, res, req) {
  if (!vault_password) {
    res.status(400).json({ error: 'vault_password is required.' });
    return false;
  }
  const vault = await queryOne('SELECT check_enc FROM digital_vault WHERE user_id = $1', [userId]);
  if (!vault) {
    res.status(403).json({ error: 'No vault found. Please set up your vault password first.' });
    return false;
  }
  const key = deriveKey(vault_password, userId);
  const isCorrect = verifyVaultPassword(vault.check_enc, key);

  // A correct password always unlocks immediately, even mid-lockout - that's
  // proof of legitimate ownership, and there's nothing left to brute-force
  // once they've already gotten it right.
  if (isCorrect) {
    await resetVaultAttempts(userId);
    return true;
  }

  const lockedUntil = await getVaultLockStatus(userId);
  if (lockedUntil) {
    res.status(423).json({
      error: `Too many incorrect attempts. Your vault is temporarily locked until ${lockedUntil.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Nothing has been deleted.`,
      vault_locked: true,
      locked_until: lockedUntil.toISOString(),
    });
    return false;
  }

  await _sendVaultFailResponse(userId, res, req);
  return false;
}

async function _sendVaultFailResponse(userId, res, req) {
  const {
    attempts, shouldLogout, vaultLocked, vaultDestroyed, lockedUntil,
    logoutAfter, lockoutInterval, destroyAfter,
  } = await recordVaultAttempt(userId, req);

  if (vaultDestroyed) {
    res.status(410).json({
      error: `Too many incorrect attempts (${attempts}). This account's vault has been permanently deleted, as configured. You can set up a new vault password any time.`,
      vault_destroyed: true,
      force_logout: true,
    });
    return;
  }

  const remaining = Math.max(0, destroyAfter - attempts);
  if (vaultLocked) {
    res.status(423).json({
      error: `Too many incorrect attempts. Your vault has been temporarily locked until ${lockedUntil.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Nothing has been deleted - enter the correct password any time to unlock it immediately.`,
      vault_locked: true,
      locked_until: lockedUntil.toISOString(),
    });
  } else if (shouldLogout) {
    res.status(403).json({
      error: `Incorrect vault password. For your security, you have been signed out. Please sign in again. (${attempts} of ${destroyAfter} attempts used.)`,
      force_logout: true, attempts,
    });
  } else {
    res.status(401).json({
      error: `Incorrect vault password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before your vault is permanently deleted. After ${logoutAfter} incorrect attempt${logoutAfter !== 1 ? 's' : ''} you will be signed out; every ${lockoutInterval}, your vault is temporarily locked for 15 minutes.`,
      attempts, remaining,
    });
  }
}

module.exports = { checkVault };
