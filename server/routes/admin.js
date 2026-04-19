const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const auth    = require('../middleware/auth');
const multer  = require('multer');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
});

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// ---------------------------------------------------------------------------
// Stats overview
// ---------------------------------------------------------------------------
router.get('/stats', auth, adminOnly, (req, res) => {
  const totalUsers    = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 0').get().c;
  const newThisMonth  = db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_admin = 0 AND created_at >= date('now','start of month')`).get().c;
  const recentLogins  = db.prepare(`SELECT COUNT(*) as c FROM user_audit_logs WHERE action = 'login_success' AND created_at >= date('now','-7 days')`).get().c;
  const totalSections = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM legal_documents)   +
      (SELECT COUNT(*) FROM financial_items)   +
      (SELECT COUNT(*) FROM digital_credentials) +
      (SELECT COUNT(*) FROM funeral_wishes)    +
      (SELECT COUNT(*) FROM medical_wishes)    +
      (SELECT COUNT(*) FROM people_to_notify)  +
      (SELECT COUNT(*) FROM property_items)    +
      (SELECT COUNT(*) FROM personal_messages) +
      (SELECT COUNT(*) FROM songs_that_define_me) +
      (SELECT COUNT(*) FROM life_wishes) as c
  `).get().c;

  res.json({ total_users: totalUsers, new_this_month: newThisMonth, recent_logins: recentLogins, total_entries: totalSections });
});

// ---------------------------------------------------------------------------
// User list
// ---------------------------------------------------------------------------
router.get('/users', auth, adminOnly, (req, res) => {
  const { q } = req.query;
  const where = q ? `AND (u.name LIKE ? OR u.email LIKE ?)` : '';
  const args  = q ? [`%${q}%`, `%${q}%`] : [];

  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.date_of_birth, u.created_at, u.last_active_at,
           u.inactivity_period_months,
           (SELECT MAX(created_at) FROM user_audit_logs WHERE user_id = u.id AND action = 'login_success') as last_login,
           (
             (SELECT COUNT(*) FROM legal_documents    WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM financial_items    WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM digital_credentials WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM funeral_wishes     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM medical_wishes     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM people_to_notify   WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM property_items     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM personal_messages  WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM songs_that_define_me WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM life_wishes        WHERE user_id = u.id)
           ) as total_entries
    FROM users u
    WHERE u.is_admin = 0 ${where}
    ORDER BY u.name
  `).all(...args);

  res.json(users);
});

// ---------------------------------------------------------------------------
// Single user detail
// ---------------------------------------------------------------------------
router.get('/users/:id', auth, adminOnly, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, date_of_birth, about_me, legacy_message,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email,
           last_active_at, inactivity_period_months, created_at
    FROM users WHERE id = ? AND is_admin = 0
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const completion = {
    legal_documents:    db.prepare('SELECT COUNT(*) as c FROM legal_documents    WHERE user_id = ?').get(user.id).c,
    financial_items:    db.prepare('SELECT COUNT(*) as c FROM financial_items    WHERE user_id = ?').get(user.id).c,
    digital_credentials:db.prepare('SELECT COUNT(*) as c FROM digital_credentials WHERE user_id = ?').get(user.id).c,
    funeral_wishes:     db.prepare('SELECT COUNT(*) as c FROM funeral_wishes     WHERE user_id = ?').get(user.id).c,
    medical_wishes:     db.prepare('SELECT COUNT(*) as c FROM medical_wishes     WHERE user_id = ?').get(user.id).c,
    people_to_notify:   db.prepare('SELECT COUNT(*) as c FROM people_to_notify   WHERE user_id = ?').get(user.id).c,
    property_items:     db.prepare('SELECT COUNT(*) as c FROM property_items     WHERE user_id = ?').get(user.id).c,
    personal_messages:  db.prepare('SELECT COUNT(*) as c FROM personal_messages  WHERE user_id = ?').get(user.id).c,
    songs_that_define_me: db.prepare('SELECT COUNT(*) as c FROM songs_that_define_me WHERE user_id = ?').get(user.id).c,
    life_wishes:        db.prepare('SELECT COUNT(*) as c FROM life_wishes        WHERE user_id = ?').get(user.id).c,
  };

  const recentAudit = db.prepare(`
    SELECT action, ip_address, created_at FROM user_audit_logs
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
  `).all(user.id);

  res.json({ ...user, completion, recent_audit: recentAudit });
});

// ---------------------------------------------------------------------------
// User activity log — full audit history with optional action filter
// GET /admin/users/:id/activity?limit=50&offset=0&action=login_success
// ---------------------------------------------------------------------------
router.get('/users/:id/activity', auth, adminOnly, (req, res) => {
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ? AND is_admin = 0').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const limit  = Math.min(Number(req.query.limit)  || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const action = req.query.action || null;

  const where  = action ? 'AND action = ?' : '';
  const args   = action ? [user.id, action, limit, offset] : [user.id, limit, offset];

  const rows = db.prepare(`
    SELECT action, ip_address, user_agent, metadata, created_at
    FROM user_audit_logs
    WHERE user_id = ? ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...args);

  const total = db.prepare(
    `SELECT COUNT(*) as c FROM user_audit_logs WHERE user_id = ? ${where}`
  ).get(...(action ? [user.id, action] : [user.id])).c;

  res.json({ user: { id: user.id, name: user.name, email: user.email }, rows, total, limit, offset });
});

// ---------------------------------------------------------------------------
// Reset a user's password (admin-initiated)
// ---------------------------------------------------------------------------
router.post('/users/:id/reset-password', auth, adminOnly, (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND is_admin = 0').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const bcrypt = require('bcryptjs');
  const hash   = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?').run(hash, user.id);

  // Log it
  db.prepare(`INSERT INTO user_audit_logs (user_id, action, metadata) VALUES (?, 'password_reset', ?)`).run(
    user.id, JSON.stringify({ reset_by: 'admin', admin_id: req.user.id })
  );

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Delete user
// ---------------------------------------------------------------------------
router.delete('/users/:id', auth, adminOnly, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND is_admin = 0').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Branding — save site name and logo preset
// ---------------------------------------------------------------------------
router.post('/branding', auth, adminOnly, (req, res) => {
  const { site_name, site_logo_type, site_logo_preset } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  if (site_name      !== undefined) upsert.run('site_name',      site_name);
  if (site_logo_type !== undefined) upsert.run('site_logo_type', site_logo_type);
  if (site_logo_preset !== undefined) upsert.run('site_logo_preset', site_logo_preset);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Branding — upload custom logo to R2
// ---------------------------------------------------------------------------
router.post('/branding/logo', auth, adminOnly, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const mime = req.file.mimetype;
  const ALLOWED = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const ext = ALLOWED[mime];
  if (!ext) return res.status(400).json({ error: 'Only SVG, PNG, JPEG, or WebP logos are accepted.' });

  // Delete previous custom logo if one exists
  const existing = db.prepare("SELECT value FROM app_settings WHERE key = 'site_logo_custom_key'").get();
  if (existing?.value) {
    try { await deleteFile(existing.value); } catch { /* ignore missing file */ }
  }

  const key = `branding/logo-${Date.now()}.${ext}`;
  await uploadFile({ key, buffer: req.file.buffer, mimeType: mime });

  const upsert = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  upsert.run('site_logo_custom_key', key);
  upsert.run('site_logo_type', 'custom');

  const logoUrl = await getDownloadUrl(key);
  res.json({ success: true, logo_url: logoUrl });
});

module.exports = router;
