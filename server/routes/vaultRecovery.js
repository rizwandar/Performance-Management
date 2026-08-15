const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { queryOne, queryAll, query, transaction } = require('../db/database');
const requireAuth = require('../middleware/auth');
const {
  deriveKey, verifyVaultPassword, createVaultCheck, encryptField, decryptField,
} = require('../lib/vault');
const { TABLE_FIELDS, decryptRow, migrateRow } = require('../lib/vaultFields');
const { escrowAllTriples, tryRecoverKey } = require('../lib/vaultRecovery');
const { recordVaultAttempt, getVaultLockStatus, resetVaultAttempts } = require('../lib/vaultAttempts');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// This router was missing the same protections routes/sections.js applies to
// every vault route (found in a 2026-08-15 security review before this PR was
// promoted to main): the vault, including recovery, must never be reachable
// in org-portal view-as mode, and a locked/deceased plan must not be
// recoverable/resettable either. Mirrors sections.js's checkPlanLock and the
// '/digital-life/vault' view-as block, decoding the token directly since
// requireAuth (which exposes this via req.isViewAs) hasn't run yet at this
// point - same reasoning as sections.js's own comments on both checks.
//
// Reads the cookie first, same precedence as middleware/auth.js (SEC-09):
// the web client's session - including the view-as session minted by
// POST /api/org-portal/customers/:id/view-as, which is delivered exclusively
// as the httpOnly cookie, never a header - has had no readable token to put
// in an Authorization header since SEC-09 shipped. A header-only check here
// (the pattern sections.js itself uses) would silently no-op for every web
// request and let the exact bypass this middleware exists to close straight
// through. Only mobile's Bearer header has no cookie equivalent.
router.use(async (req, res, next) => {
  const header = req.headers.authorization;
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = req.cookies?.token || headerToken;
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

// GET /api/sections/digital-life/recovery/questions
// No vault unlock required - that's the entire point of this endpoint.
router.get('/questions', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  const vault = await queryOne('SELECT id, recovery_enabled FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault || !vault.recovery_enabled) {
    return res.json({ recovery_enabled: false, questions: [] });
  }
  const questions = await queryAll(
    'SELECT question_index, question_text, is_mandatory FROM vault_recovery_questions WHERE digital_vault_id = $1 ORDER BY question_index',
    [vault.id]
  );
  res.json({ recovery_enabled: true, questions });
});

// PUT /api/sections/digital-life/recovery/setup
// Requires the vault to already be unlocked - escrowing needs the real key.
router.put('/setup', requireAuth, async (req, res) => {
  const { vault_password, questions } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'Your current vault password is required to confirm.' });
  if (!Array.isArray(questions) || questions.length < 3 || questions.length > 5) {
    return res.status(400).json({ error: 'Please provide between 3 and 5 questions.' });
  }
  if (questions.filter(q => q.is_mandatory).length < 3) {
    return res.status(400).json({ error: 'At least 3 questions must be marked mandatory.' });
  }
  for (const q of questions) {
    if (!q.text || !String(q.text).trim()) return res.status(400).json({ error: 'Every question needs text.' });
    if (!q.answer || !String(q.answer).trim()) return res.status(400).json({ error: 'Every question needs an answer.' });
  }

  const vault = await queryOne('SELECT id, check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key = deriveKey(vault_password, req.user.id);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    return res.status(401).json({ error: 'Current vault password is incorrect.' });
  }

  // Assign clean 1..N ordinals server-side rather than trusting client-sent indices.
  const withIndex = questions.map((q, i) => ({
    index: i + 1,
    text: String(q.text).trim(),
    is_mandatory: !!q.is_mandatory,
    answer: q.answer,
  }));
  const shares = escrowAllTriples(key, withIndex, vault.id);

  await transaction(async (client) => {
    await client.query('DELETE FROM vault_recovery_questions WHERE digital_vault_id = $1', [vault.id]);
    await client.query('DELETE FROM vault_recovery_shares WHERE digital_vault_id = $1', [vault.id]);
    for (const q of withIndex) {
      await client.query(
        'INSERT INTO vault_recovery_questions (digital_vault_id, question_index, question_text, is_mandatory) VALUES ($1,$2,$3,$4)',
        [vault.id, q.index, q.text, q.is_mandatory]
      );
    }
    for (const s of shares) {
      await client.query(
        'INSERT INTO vault_recovery_shares (digital_vault_id, question_index_a, question_index_b, question_index_c, key_enc) VALUES ($1,$2,$3,$4,$5)',
        [vault.id, s.question_index_a, s.question_index_b, s.question_index_c, s.key_enc]
      );
    }
    await client.query('UPDATE digital_vault SET recovery_enabled = true WHERE id = $1', [vault.id]);
  });

  res.json({ success: true });
});

// DELETE /api/sections/digital-life/recovery/setup — turn recovery off.
router.delete('/setup', requireAuth, async (req, res) => {
  const { vault_password } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'Your current vault password is required to confirm.' });

  const vault = await queryOne('SELECT id, check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key = deriveKey(vault_password, req.user.id);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    return res.status(401).json({ error: 'Current vault password is incorrect.' });
  }

  await transaction(async (client) => {
    await client.query('DELETE FROM vault_recovery_questions WHERE digital_vault_id = $1', [vault.id]);
    await client.query('DELETE FROM vault_recovery_shares WHERE digital_vault_id = $1', [vault.id]);
    await client.query('UPDATE digital_vault SET recovery_enabled = false WHERE id = $1', [vault.id]);
  });

  res.json({ success: true });
});

// POST /api/sections/digital-life/recovery/recover
// No vault unlock needed - the whole point. Answer >=3 questions correctly
// and choose a new password in the same request. On success, recovery is
// disabled and must be re-configured - re-escrowing only the combinations
// touching the answers submitted here (possibly not all originally
// configured questions) would leave other combinations silently pointing at
// a now-defunct key, a worse failure mode than an honest "set it up again."
router.post('/recover', requireAuth, async (req, res) => {
  const { answers, new_password } = req.body;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Please answer at least 3 questions.' });
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'New vault password must be at least 8 characters.' });

  const vault = await queryOne('SELECT id, recovery_enabled FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault || !vault.recovery_enabled) {
    return res.status(403).json({ error: 'Security-question recovery is not enabled for this vault.' });
  }

  // Recovery is a second credential-guessing path into the same vault key as
  // the password check in vaultAuth.js's checkVault() - it must be bound to
  // the exact same destroy/logout/lockout thresholds, or those thresholds are
  // trivially bypassed by guessing answers instead of the password (found in
  // the 2026-08-15 security review before this PR was promoted to main).
  const lockedUntil = await getVaultLockStatus(req.user.id);
  if (lockedUntil) {
    return res.status(423).json({
      error: `Too many incorrect attempts. Your vault is temporarily locked until ${lockedUntil.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Nothing has been deleted.`,
      vault_locked: true,
      locked_until: lockedUntil.toISOString(),
    });
  }

  const shareRows = await queryAll(
    'SELECT question_index_a, question_index_b, question_index_c, key_enc FROM vault_recovery_shares WHERE digital_vault_id = $1',
    [vault.id]
  );
  const oldKey = tryRecoverKey(answers, shareRows, vault.id);
  if (!oldKey) {
    const {
      attempts, shouldLogout, vaultLocked, vaultDestroyed, lockedUntil: newLockedUntil,
      logoutAfter, lockoutInterval, destroyAfter,
    } = await recordVaultAttempt(req.user.id, req);

    if (vaultDestroyed) {
      return res.status(410).json({
        error: `Too many incorrect attempts (${attempts}). This account's vault has been permanently deleted, as configured. You can set up a new vault password any time.`,
        vault_destroyed: true,
        force_logout: true,
      });
    }
    if (vaultLocked) {
      return res.status(423).json({
        error: `Too many incorrect attempts. Your vault has been temporarily locked until ${newLockedUntil.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Nothing has been deleted - answering correctly any time unlocks it immediately.`,
        vault_locked: true,
        locked_until: newLockedUntil.toISOString(),
      });
    }
    if (shouldLogout) {
      return res.status(403).json({
        error: `We couldn't verify at least 3 correct answers. For your security, you have been signed out. Please sign in again. (${attempts} of ${destroyAfter} attempts used.)`,
        force_logout: true, attempts,
      });
    }
    const remaining = Math.max(0, destroyAfter - attempts);
    return res.status(401).json({
      error: `We couldn't verify at least 3 correct answers. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before your vault is permanently deleted. After ${logoutAfter} incorrect attempt${logoutAfter !== 1 ? 's' : ''} you will be signed out; every ${lockoutInterval}, your vault is temporarily locked for 15 minutes.`,
      attempts, remaining,
    });
  }

  // Correct answers are proof of legitimate ownership, same as a correct
  // vault password in checkVault() - reset the counter rather than leaving a
  // prior run of wrong guesses still on the books.
  await resetVaultAttempts(req.user.id);

  const newKey   = deriveKey(new_password, req.user.id);
  const newCheck = createVaultCheck(newKey);

  await transaction(async (client) => {
    const credRows = (await client.query(
      'SELECT id, username_enc, password_enc, notes_enc FROM digital_credentials WHERE user_id = $1',
      [req.user.id]
    )).rows;
    for (const row of credRows) {
      await client.query(`
        UPDATE digital_credentials SET username_enc=$1, password_enc=$2, notes_enc=$3, updated_at=NOW() WHERE id=$4
      `, [
        encryptField(decryptField(row.username_enc, oldKey), newKey),
        encryptField(decryptField(row.password_enc, oldKey), newKey),
        encryptField(decryptField(row.notes_enc,    oldKey), newKey),
        row.id,
      ]);
    }

    const clientQuery = (sql, params) => client.query(sql, params);
    for (const table of Object.keys(TABLE_FIELDS)) {
      const tableRows = (await client.query(`SELECT * FROM ${table} WHERE user_id = $1`, [req.user.id])).rows;
      for (const row of tableRows) {
        const { decrypted } = decryptRow(table, row, oldKey);
        await migrateRow(clientQuery, table, row.id, decrypted, newKey);
      }
    }

    await client.query('UPDATE digital_vault SET check_enc=$1, recovery_enabled=false WHERE id=$2', [newCheck, vault.id]);
    await client.query('DELETE FROM vault_recovery_questions WHERE digital_vault_id = $1', [vault.id]);
    await client.query('DELETE FROM vault_recovery_shares WHERE digital_vault_id = $1', [vault.id]);

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;
    await client.query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'vault_recovered_via_security_questions', ip, ua, JSON.stringify({})]
    );
  });

  res.json({ success: true, recovery_disabled: true });
});

// PUT /api/sections/digital-life/recovery/destroy-threshold
router.put('/destroy-threshold', requireAuth, async (req, res) => {
  const { vault_password, destroy_after_attempts } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'Your current vault password is required to confirm.' });
  const n = parseInt(destroy_after_attempts, 10);
  if (!Number.isInteger(n) || n < 3 || n > 1000) {
    return res.status(400).json({ error: 'Please choose a value between 3 and 1000.' });
  }

  const vault = await queryOne('SELECT id, check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key = deriveKey(vault_password, req.user.id);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    return res.status(401).json({ error: 'Current vault password is incorrect.' });
  }

  await query('UPDATE digital_vault SET destroy_after_attempts = $1 WHERE id = $2', [n, vault.id]);
  res.json({ success: true, destroy_after_attempts: n });
});

// PUT /api/sections/digital-life/recovery/logout-threshold
// Same shape as destroy-threshold above: forces a sign-out once cumulative
// wrong vault-password attempts reach this many (default 3). See
// lib/vaultAttempts.js for how this interacts with lockout/destroy.
router.put('/logout-threshold', requireAuth, async (req, res) => {
  const { vault_password, logout_after_attempts } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'Your current vault password is required to confirm.' });
  const n = parseInt(logout_after_attempts, 10);
  if (!Number.isInteger(n) || n < 1 || n > 50) {
    return res.status(400).json({ error: 'Please choose a value between 1 and 50.' });
  }

  const vault = await queryOne('SELECT id, check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key = deriveKey(vault_password, req.user.id);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    return res.status(401).json({ error: 'Current vault password is incorrect.' });
  }

  await query('UPDATE digital_vault SET logout_after_attempts = $1 WHERE id = $2', [n, vault.id]);
  res.json({ success: true, logout_after_attempts: n });
});

// PUT /api/sections/digital-life/recovery/lockout-threshold
// Sets the interval, every Nth wrong attempt triggers a repeating 15-minute
// throttle (default 5, i.e. attempts 5, 10, 15... each lock the vault
// temporarily). Independent of logout_after_attempts and destroy_after_attempts.
router.put('/lockout-threshold', requireAuth, async (req, res) => {
  const { vault_password, lockout_after_attempts } = req.body;
  if (!vault_password) return res.status(400).json({ error: 'Your current vault password is required to confirm.' });
  const n = parseInt(lockout_after_attempts, 10);
  if (!Number.isInteger(n) || n < 1 || n > 50) {
    return res.status(400).json({ error: 'Please choose a value between 1 and 50.' });
  }

  const vault = await queryOne('SELECT id, check_enc FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault) return res.status(404).json({ error: 'No vault found.' });

  const key = deriveKey(vault_password, req.user.id);
  if (!verifyVaultPassword(vault.check_enc, key)) {
    return res.status(401).json({ error: 'Current vault password is incorrect.' });
  }

  await query('UPDATE digital_vault SET lockout_after_attempts = $1 WHERE id = $2', [n, vault.id]);
  res.json({ success: true, lockout_after_attempts: n });
});

module.exports = router;
