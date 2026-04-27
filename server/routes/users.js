const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const auth = require('../middleware/auth');
const { deriveKey, verifyVaultPassword } = require('../lib/vault');
const { deleteFile } = require('../lib/r2');
const { sendEmail } = require('../lib/sendEmail');
const { accountDeletionConfirmEmail } = require('../lib/emailTemplates');

// Get own profile
router.get('/me', auth, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, date_of_birth, about_me, legacy_message,
           life_story, remembered_for,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email,
           songs_enabled, bucket_list_enabled, is_admin, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const songs = db.prepare('SELECT * FROM favourite_songs WHERE user_id = ? ORDER BY added_at').all(user.id);
  const bucket_list = db.prepare('SELECT * FROM bucket_list_items WHERE user_id = ? ORDER BY added_at').all(user.id);

  res.json({ ...user, songs, bucket_list });
});

// Update own profile
router.put('/me', auth, (req, res) => {
  const { name, email, date_of_birth, about_me, legacy_message,
          life_story, remembered_for,
          emergency_contact_name, emergency_contact_phone, emergency_contact_email } = req.body;
  try {
    const existing = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user.id);
    db.prepare(`
      UPDATE users SET name=?, email=?, date_of_birth=?, about_me=?, legacy_message=?,
        life_story=?, remembered_for=?,
        emergency_contact_name=?, emergency_contact_phone=?, emergency_contact_email=? WHERE id=?
    `).run(
           name  ?? existing.name,
           email ?? existing.email,
           date_of_birth || null, about_me || null, legacy_message || null,
           life_story || null, remembered_for || null,
           emergency_contact_name || null, emergency_contact_phone || null,
           emergency_contact_email || null, req.user.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'That email address is already registered to another account.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Change password (requires current password)
router.post('/me/change-password', auth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Both current and new password are required.' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (!/[A-Z]/.test(new_password))
    return res.status(400).json({ error: 'New password must contain at least one uppercase letter.' });
  if (!/[0-9]/.test(new_password))
    return res.status(400).json({ error: 'New password must contain at least one number.' });

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Your current password is incorrect.' });

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true });
});

// Get inactivity timer status
router.get('/me/timer', auth, (req, res) => {
  const user = db.prepare(`
    SELECT last_active_at, inactivity_period_months, last_reminder_sent_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const period = user.inactivity_period_months || 12;
  const rawActive = user.last_active_at;
  // last_active_at is set on every login; may be null for brand-new accounts
  const lastActive = rawActive ? new Date(rawActive) : new Date();
  const expiresAt  = new Date(lastActive);
  expiresAt.setMonth(expiresAt.getMonth() + period);
  const msLeft  = expiresAt.getTime() - Date.now();
  const daysLeft = Number.isFinite(msLeft) ? Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24))) : 0;

  res.json({
    last_active_at:           rawActive || new Date().toISOString(),
    inactivity_period_months: period,
    expires_at:               expiresAt.toISOString(),
    days_left:                daysLeft,
    last_reminder_sent_at:    user.last_reminder_sent_at,
  });
});

// Update inactivity period
router.put('/me/timer', auth, (req, res) => {
  const { inactivity_period_months } = req.body;
  const allowed = [2, 3, 6, 12, 18, 24];
  if (!allowed.includes(Number(inactivity_period_months))) {
    return res.status(400).json({ error: 'Invalid period. Choose from: 2, 3, 6, 12, 18, or 24 months.' });
  }
  db.prepare('UPDATE users SET inactivity_period_months = ? WHERE id = ?')
    .run(inactivity_period_months, req.user.id);
  res.json({ success: true, inactivity_period_months });
});

// Add song
router.post('/me/songs', auth, (req, res) => {
  const { deezer_id, title, artist, album } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'title and artist are required' });

  const user = db.prepare('SELECT songs_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user.songs_enabled) return res.status(403).json({ error: 'Songs feature is not enabled for your account' });

  const count = db.prepare('SELECT COUNT(*) as count FROM favourite_songs WHERE user_id = ?').get(req.user.id);
  if (count.count >= 20) return res.status(400).json({ error: 'Maximum 20 songs allowed' });

  const result = db.prepare(
    'INSERT INTO favourite_songs (user_id, deezer_id, title, artist, album) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, deezer_id || null, title, artist, album || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete song
router.delete('/me/songs/:songId', auth, (req, res) => {
  db.prepare('DELETE FROM favourite_songs WHERE id = ? AND user_id = ?').run(req.params.songId, req.user.id);
  res.json({ success: true });
});

// Add bucket list item
router.post('/me/bucket-list', auth, (req, res) => {
  const { title, description, planning } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const user = db.prepare('SELECT bucket_list_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user.bucket_list_enabled) return res.status(403).json({ error: 'Bucket list feature is not enabled for your account' });

  const count = db.prepare('SELECT COUNT(*) as count FROM bucket_list_items WHERE user_id = ?').get(req.user.id);
  if (count.count >= 50) return res.status(400).json({ error: 'Maximum 50 bucket list items allowed' });

  const result = db.prepare(
    'INSERT INTO bucket_list_items (user_id, title, description, planning) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, title, description || null, planning || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete bucket list item
router.delete('/me/bucket-list/:itemId', auth, (req, res) => {
  db.prepare('DELETE FROM bucket_list_items WHERE id = ? AND user_id = ?').run(req.params.itemId, req.user.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Delete own account — requires account password + vault password (if vault exists)
// ---------------------------------------------------------------------------
router.delete('/me', auth, async (req, res) => {
  const { password, vault_password } = req.body;
  if (!password) return res.status(400).json({ error: 'Your account password is required to confirm deletion.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_admin = 0').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password. Please check and try again.' });
  }

  // If vault exists, vault password is also required
  const vault = db.prepare('SELECT check_enc FROM digital_vault WHERE user_id = ?').get(user.id);
  if (vault) {
    if (!vault_password) {
      return res.status(400).json({
        error: 'You have a vault set up. Your vault password is also required to delete your account.',
        requires_vault: true,
      });
    }
    const key = deriveKey(vault_password, user.id);
    if (!verifyVaultPassword(vault.check_enc, key)) {
      return res.status(401).json({ error: 'Incorrect vault password. Please check and try again.' });
    }
  }

  // Delete all uploaded R2 files (best effort, non-blocking)
  const uploads = db.prepare('SELECT r2_key FROM uploaded_documents WHERE user_id = ?').all(user.id);
  for (const upload of uploads) {
    try { await deleteFile(upload.r2_key); } catch { /* continue */ }
  }

  // Delete the user row — all section data cascades automatically
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

  // Send confirmation email (fire and forget)
  sendEmail({
    to:      user.email,
    subject: 'In Good Hands: Your account has been deleted',
    html:    accountDeletionConfirmEmail({ name: user.name }),
  }).catch(e => console.error('[delete-account] Email failed:', e.message));

  res.json({ success: true });
});

// Register or remove a mobile push token
router.post('/me/device-token', auth, (req, res) => {
  const { token } = req.body;
  db.prepare('UPDATE users SET expo_push_token = ? WHERE id = ?').run(token || null, req.user.id);
  res.json({ success: true });
});

module.exports = router;
