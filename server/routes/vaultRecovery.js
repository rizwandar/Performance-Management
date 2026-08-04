const express = require('express');
const router  = express.Router();
const { queryOne, queryAll, query, transaction } = require('../db/database');
const requireAuth = require('../middleware/auth');
const {
  deriveKey, verifyVaultPassword, createVaultCheck, encryptField, decryptField,
} = require('../lib/vault');
const { TABLE_FIELDS, decryptRow, migrateRow } = require('../lib/vaultFields');
const { escrowAllPairs, tryRecoverKey } = require('../lib/vaultRecovery');

// GET /api/sections/digital-life/recovery/questions
// No vault unlock required - that's the entire point of this endpoint.
router.get('/questions', requireAuth, async (req, res) => {
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
  const shares = escrowAllPairs(key, withIndex, vault.id);

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
        'INSERT INTO vault_recovery_shares (digital_vault_id, question_index_a, question_index_b, key_enc) VALUES ($1,$2,$3,$4)',
        [vault.id, s.question_index_a, s.question_index_b, s.key_enc]
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
// No vault unlock needed - the whole point. Answer >=2 questions correctly
// and choose a new password in the same request. On success, recovery is
// disabled and must be re-configured - re-escrowing only the pairs touching
// the answers submitted here (possibly not all originally configured
// questions) would leave other pairs silently pointing at a now-defunct key,
// a worse failure mode than an honest "set it up again."
router.post('/recover', requireAuth, async (req, res) => {
  const { answers, new_password } = req.body;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Please answer at least 2 questions.' });
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'New vault password must be at least 8 characters.' });

  const vault = await queryOne('SELECT id, recovery_enabled FROM digital_vault WHERE user_id = $1', [req.user.id]);
  if (!vault || !vault.recovery_enabled) {
    return res.status(403).json({ error: 'Security-question recovery is not enabled for this vault.' });
  }

  const shareRows = await queryAll(
    'SELECT question_index_a, question_index_b, key_enc FROM vault_recovery_shares WHERE digital_vault_id = $1',
    [vault.id]
  );
  const oldKey = tryRecoverKey(answers, shareRows, vault.id);
  if (!oldKey) {
    return res.status(401).json({ error: "We couldn't verify at least 2 correct answers. Please try again." });
  }

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

module.exports = router;
