const express = require('express');
const router  = express.Router();
const { queryOne, queryAll, query } = require('../db/database');
const auth    = require('../middleware/auth');
const multer  = require('multer');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');
const { runBackup, listBackups } = require('../lib/backup');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

router.get('/stats', auth, adminOnly, async (req, res) => {
  const totalUsers   = await queryOne('SELECT COUNT(*)::int as c FROM users WHERE is_admin = 0');
  const newThisMonth = await queryOne(`SELECT COUNT(*)::int as c FROM users WHERE is_admin = 0 AND created_at >= date_trunc('month', NOW())`);
  const recentLogins = await queryOne(`SELECT COUNT(*)::int as c FROM user_audit_logs WHERE action = 'login_success' AND created_at >= NOW() - INTERVAL '7 days'`);
  const totalSections = await queryOne(`
    SELECT (
      (SELECT COUNT(*) FROM legal_documents)    +
      (SELECT COUNT(*) FROM financial_items)    +
      (SELECT COUNT(*) FROM digital_credentials)+
      (SELECT COUNT(*) FROM funeral_wishes)     +
      (SELECT COUNT(*) FROM medical_wishes)     +
      (SELECT COUNT(*) FROM people_to_notify)   +
      (SELECT COUNT(*) FROM property_items)     +
      (SELECT COUNT(*) FROM personal_messages)  +
      (SELECT COUNT(*) FROM songs_that_define_me)+
      (SELECT COUNT(*) FROM life_wishes)
    )::int as c
  `);
  res.json({
    total_users:   totalUsers.c,
    new_this_month: newThisMonth.c,
    recent_logins: recentLogins.c,
    total_entries: totalSections.c,
  });
});

router.get('/users', auth, adminOnly, async (req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT u.id, u.name, u.email, u.date_of_birth, u.created_at, u.last_active_at,
           u.inactivity_period_months,
           (SELECT MAX(created_at) FROM user_audit_logs WHERE user_id = u.id AND action = 'login_success') as last_login,
           (
             (SELECT COUNT(*) FROM legal_documents     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM financial_items     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM digital_credentials WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM funeral_wishes      WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM medical_wishes      WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM people_to_notify    WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM property_items      WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM personal_messages   WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM songs_that_define_me WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM life_wishes         WHERE user_id = u.id)
           )::int as total_entries
    FROM users u
    WHERE u.is_admin = 0
  `;
  const args = [];
  if (q) {
    args.push(`%${q}%`);
    sql += ` AND (u.name ILIKE $1 OR u.email ILIKE $1)`;
  }
  sql += ' ORDER BY u.name';
  const users = await queryAll(sql, args);
  res.json(users);
});

router.get('/users/:id', auth, adminOnly, async (req, res) => {
  const user = await queryOne(`
    SELECT id, name, email, date_of_birth, about_me, legacy_message,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email,
           last_active_at, inactivity_period_months, created_at
    FROM users WHERE id = $1 AND is_admin = 0
  `, [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const [
    ld, fi, dc, fw, mw, ptn, pi, pm, stm, lw
  ] = await Promise.all([
    queryOne('SELECT COUNT(*)::int as c FROM legal_documents     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM financial_items     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM digital_credentials WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM funeral_wishes      WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM medical_wishes      WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM people_to_notify    WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM property_items      WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM personal_messages   WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM songs_that_define_me WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM life_wishes         WHERE user_id = $1', [user.id]),
  ]);

  const completion = {
    legal_documents:     ld.c,
    financial_items:     fi.c,
    digital_credentials: dc.c,
    funeral_wishes:      fw.c,
    medical_wishes:      mw.c,
    people_to_notify:    ptn.c,
    property_items:      pi.c,
    personal_messages:   pm.c,
    songs_that_define_me: stm.c,
    life_wishes:         lw.c,
  };

  const recentAudit = await queryAll(`
    SELECT action, ip_address, created_at FROM user_audit_logs
    WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
  `, [user.id]);

  res.json({ ...user, completion, recent_audit: recentAudit });
});

router.get('/users/:id/activity', auth, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT id, name, email FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const limit  = Math.min(Number(req.query.limit)  || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const action = req.query.action || null;

  let rowsSql, totalSql, rowsArgs, totalArgs;
  if (action) {
    rowsSql   = `SELECT action, ip_address, user_agent, metadata, created_at FROM user_audit_logs WHERE user_id = $1 AND action = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`;
    rowsArgs  = [user.id, action, limit, offset];
    totalSql  = `SELECT COUNT(*)::int as c FROM user_audit_logs WHERE user_id = $1 AND action = $2`;
    totalArgs = [user.id, action];
  } else {
    rowsSql   = `SELECT action, ip_address, user_agent, metadata, created_at FROM user_audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    rowsArgs  = [user.id, limit, offset];
    totalSql  = `SELECT COUNT(*)::int as c FROM user_audit_logs WHERE user_id = $1`;
    totalArgs = [user.id];
  }

  const [rows, totalRow] = await Promise.all([
    queryAll(rowsSql, rowsArgs),
    queryOne(totalSql, totalArgs),
  ]);

  res.json({ user: { id: user.id, name: user.name, email: user.email }, rows, total: totalRow.c, limit, offset });
});

router.post('/users/:id/verify-email', auth, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  await query(
    'UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expires_at = NULL WHERE id = $1',
    [user.id]
  );
  res.json({ success: true });
});

router.post('/users/:id/reset-password', auth, adminOnly, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const bcrypt = require('bcryptjs');
  const hash   = bcrypt.hashSync(new_password, 10);
  await query('UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2', [hash, user.id]);
  await query(
    `INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, 'password_reset', $2)`,
    [user.id, JSON.stringify({ reset_by: 'admin', admin_id: req.user.id })]
  );
  res.json({ success: true });
});

router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

router.post('/branding', auth, adminOnly, async (req, res) => {
  const { site_name, site_logo_type, site_logo_preset } = req.body;
  const upsert = (k, v) => query(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [k, v]
  );
  if (site_name        !== undefined) await upsert('site_name',        site_name);
  if (site_logo_type   !== undefined) await upsert('site_logo_type',   site_logo_type);
  if (site_logo_preset !== undefined) await upsert('site_logo_preset', site_logo_preset);
  res.json({ success: true });
});

router.post('/branding/logo', auth, adminOnly, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const mime = req.file.mimetype;
  const ALLOWED = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const ext = ALLOWED[mime];
  if (!ext) return res.status(400).json({ error: 'Only SVG, PNG, JPEG, or WebP logos are accepted.' });

  const existing = await queryOne("SELECT value FROM app_settings WHERE key = 'site_logo_custom_key'");
  if (existing?.value) {
    try { await deleteFile(existing.value); } catch { /* ignore */ }
  }

  const key = `branding/logo-${Date.now()}.${ext}`;
  await uploadFile({ key, buffer: req.file.buffer, mimeType: mime });

  const upsert = (k, v) => query(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [k, v]
  );
  await upsert('site_logo_custom_key', key);
  await upsert('site_logo_type', 'custom');

  const logoUrl = await getDownloadUrl(key);
  res.json({ success: true, logo_url: logoUrl });
});

router.get('/backups', auth, adminOnly, async (req, res) => {
  try {
    const keys = await listBackups();
    res.json({ backups: keys });
  } catch (err) {
    console.error('[backup] List failed:', err.message);
    res.status(500).json({ error: "We couldn't list backups. Please try again." });
  }
});

router.post('/backups/run', auth, adminOnly, async (req, res) => {
  try {
    const result = await runBackup();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[backup] Manual run failed:', err.message);
    res.status(500).json({ error: "Backup failed. Check server logs for details." });
  }
});

module.exports = router;
