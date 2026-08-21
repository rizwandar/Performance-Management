const express = require('express');
const router  = express.Router();
const { queryOne, queryAll, query } = require('../db/database');
const auth    = require('../middleware/auth');
const multer  = require('multer');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');
const { runBackup, listBackups } = require('../lib/backup');
const { checkInactivity } = require('../lib/inactivityTimer');
const { matchesExtension } = require('../lib/fileSignature');

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
      (SELECT COUNT(*) FROM doctors)            +
      (SELECT COUNT(*) FROM medical_records)    +
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
  // Same limit/offset pagination convention as GET /users/:id/activity below,
  // just applied to the top-level user list instead of one user's log.
  const limit  = Math.min(Number(req.query.limit)  || 20, 200);
  const offset = Number(req.query.offset) || 0;

  let fromWhere = `
    FROM users u
    LEFT JOIN subscriptions s      ON s.user_id = u.id
    LEFT JOIN users granter        ON granter.id = s.granted_by_admin_id
    WHERE u.is_admin = 0
  `;
  const args = [];
  if (q) {
    args.push(`%${q}%`);
    fromWhere += ` AND (u.name ILIKE $1 OR u.email ILIKE $1)`;
  }

  const rowsSql = `
    SELECT u.id, u.name, u.email, u.date_of_birth, u.created_at, u.last_active_at,
           u.inactivity_period_months, u.is_deceased, u.deceased_at, u.email_verified,
           (SELECT MAX(created_at) FROM user_audit_logs WHERE user_id = u.id AND action = 'login_success') as last_login,
           (
             (SELECT COUNT(*) FROM legal_documents     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM financial_items     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM digital_credentials WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM funeral_wishes      WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM doctors             WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM medical_records     WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM people_to_notify    WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM property_items      WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM personal_messages   WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM songs_that_define_me WHERE user_id = u.id) +
             (SELECT COUNT(*) FROM life_wishes         WHERE user_id = u.id)
           )::int as total_entries,
           COALESCE(s.plan, 'free') as plan,
           (s.provider = 'admin_grant') as is_honorary,
           granter.name as granted_by_admin_name
    ${fromWhere}
    ORDER BY u.created_at DESC
    LIMIT $${args.length + 1} OFFSET $${args.length + 2}
  `;
  const totalSql = `SELECT COUNT(*)::int as c ${fromWhere}`;

  const [users, totalRow] = await Promise.all([
    queryAll(rowsSql, [...args, limit, offset]),
    queryOne(totalSql, args),
  ]);

  res.json({ users, total: totalRow.c, limit, offset });
});

router.get('/users/:id', auth, adminOnly, async (req, res) => {
  const user = await queryOne(`
    SELECT u.id, u.name, u.email, u.date_of_birth, u.about_me, u.legacy_message, u.country_code,
           u.emergency_contact_name, u.emergency_contact_phone, u.emergency_contact_email,
           u.emergency_contact_relationship, u.emergency_contact_notes,
           u.last_active_at, u.inactivity_period_months, u.created_at, u.email_verified,
           u.is_deceased, u.deceased_at, u.deceased_by,
           COALESCE(s.plan, 'free') as plan,
           (s.provider = 'admin_grant') as is_honorary,
           s.updated_at as plan_updated_at,
           granter.name as granted_by_admin_name
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN users granter   ON granter.id = s.granted_by_admin_id
    WHERE u.id = $1 AND u.is_admin = 0
  `, [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const [
    ld, fi, dc, fw, doc, mr, ptn, pi, pm, stm, lw
  ] = await Promise.all([
    queryOne('SELECT COUNT(*)::int as c FROM legal_documents     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM financial_items     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM digital_credentials WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM funeral_wishes      WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM doctors             WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM medical_records     WHERE user_id = $1', [user.id]),
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
    doctors:             doc.c,
    medical_records:     mr.c,
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

// Reverting a mistaken deceased marking for a direct (non-org-managed) user is
// admin-only, matching the equivalent safeguard for org-managed customers in
// routes/organizations.js POST /:id/customers/:customerId/revert-deceased.
router.post('/users/:id/revert-deceased', auth, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT id, is_deceased FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.is_deceased) return res.status(400).json({ error: 'This user is not marked deceased.' });

  await query(
    `UPDATE users SET is_deceased = false, deceased_at = NULL, deceased_by = NULL WHERE id = $1`,
    [user.id]
  );
  await query(
    'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
    [req.user.id, 'deceased_status_reverted', JSON.stringify({ user_id: user.id })]
  );

  res.json({ success: true });
});

// Version log: client, admin panel, and org/funeral-home portal are tracked as
// three independently-versioned areas even though they ship in one deploy (see
// app_versions in db/database.js). Displayed in the admin panel's Versions tab.
const VERSION_MODULES = ['client', 'admin', 'org_portal'];
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

router.get('/versions', auth, adminOnly, async (req, res) => {
  const rows = await queryAll(
    'SELECT module, version, summary, released_at FROM app_versions ORDER BY module, released_at DESC'
  );
  res.json(rows);
});

router.post('/versions', auth, adminOnly, async (req, res) => {
  const { module, version, summary } = req.body;
  if (!VERSION_MODULES.includes(module)) {
    return res.status(400).json({ error: 'module must be one of: ' + VERSION_MODULES.join(', ') });
  }
  if (!SEMVER_RE.test(version || '')) {
    return res.status(400).json({ error: 'version must be in MAJOR.MINOR.PATCH format, e.g. 1.4.2' });
  }
  if (!summary || !summary.trim()) {
    return res.status(400).json({ error: 'A short summary of the change is required.' });
  }
  await query(
    'INSERT INTO app_versions (module, version, summary) VALUES ($1, $2, $3)',
    [module, version, summary.trim()]
  );
  res.status(201).json({ success: true });
});

// MKT-02: the campaign landing pages themselves are static files
// (client/lp/*.html), not DB-driven, so this list is hardcoded here rather
// than read from a table - it's a small, code-defined set that changes only
// when a developer adds/removes a campaign page. acquisition_source counts
// are the real, live part: grouped straight off the users table, no
// separate marketing/analytics table exists yet (deliberately - see
// MKT-02 backlog notes on why formal A/B infra was skipped at this scale).
const CAMPAIGN_LANDING_PAGES = [
  { segment: 'adult-children', path: '/lp/adult-children.html', title: 'Some Things Are Too Important to Leave Unsaid', audience: 'Adult children of aging parents' },
  { segment: 'self-planners',  path: '/lp/self-planners.html',  title: 'Leave More Than Paperwork',                     audience: 'Self-planners 50+' },
  { segment: 'life-event',     path: '/lp/life-event.html',     title: 'A Scare Deserves More Than a To-Do List',       audience: 'Recently prompted by a health/life event' },
  { segment: 'caregivers',     path: '/lp/caregivers.html',     title: 'Leave a Note of Your Own',                      audience: 'Caregivers/spouses managing another\'s affairs' },
];

router.get('/marketing/campaigns', auth, adminOnly, async (req, res) => {
  const rows = await queryAll(`
    SELECT acquisition_source, COUNT(*)::int AS signups
    FROM users
    WHERE acquisition_source IS NOT NULL
    GROUP BY acquisition_source
    ORDER BY signups DESC
  `);
  const totalTracked = rows.reduce((sum, r) => sum + r.signups, 0);
  res.json({
    landingPages: CAMPAIGN_LANDING_PAGES,
    acquisitionBreakdown: rows,
    totalTrackedSignups: totalTracked,
  });
});

// Security findings log: a persistent record of security review results
// (audits, probes, infra reviews) readable from the admin panel's Security
// tab in any environment the server is pointed at, and re-readable by a
// future Claude Code session without the original conversation - see
// security_findings in db/database.js and the "Security findings log"
// section of CLAUDE.md.
const FINDING_CATEGORIES = ['authorization', 'injection', 'xss', 'secrets', 'infrastructure', 'session', 'documentation', 'ci-cd', 'other'];
const FINDING_SEVERITIES  = ['info', 'low', 'medium', 'high', 'critical'];
const FINDING_STATUSES    = ['open', 'monitoring', 'resolved', 'accepted_risk'];

router.get('/security-findings', auth, adminOnly, async (req, res) => {
  const rows = await queryAll(
    'SELECT * FROM security_findings ORDER BY discovered_at DESC'
  );
  res.json(rows);
});

router.post('/security-findings', auth, adminOnly, async (req, res) => {
  const { title, category, severity, status, summary, details, source, related_link } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A title is required.' });
  if (!FINDING_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'category must be one of: ' + FINDING_CATEGORIES.join(', ') });
  }
  if (!FINDING_SEVERITIES.includes(severity)) {
    return res.status(400).json({ error: 'severity must be one of: ' + FINDING_SEVERITIES.join(', ') });
  }
  if (!summary || !summary.trim()) return res.status(400).json({ error: 'A short summary is required.' });
  const finalStatus = FINDING_STATUSES.includes(status) ? status : 'open';
  const result = await query(
    `INSERT INTO security_findings (title, category, severity, status, summary, details, source, related_link, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $4 = 'resolved' THEN NOW() ELSE NULL END) RETURNING id`,
    [title.trim(), category, severity, finalStatus, summary.trim(), details || null, source || null, related_link || null]
  );
  res.status(201).json({ id: result.rows[0].id });
});

router.put('/security-findings/:id', auth, adminOnly, async (req, res) => {
  const existing = await queryOne('SELECT id FROM security_findings WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Finding not found.' });
  const { status } = req.body;
  if (!FINDING_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status must be one of: ' + FINDING_STATUSES.join(', ') });
  }
  await query(
    `UPDATE security_findings SET status = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END WHERE id = $2`,
    [status, req.params.id]
  );
  res.json({ success: true });
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

// Global (not per-user) audit trail for vault destruction/recovery events,
// so an admin can see who lost data, when, and why without looking up each
// user individually. Same query shape as GET /users/:id/activity above.
const VAULT_AUDIT_ACTIONS = ['vault_destroyed_manual', 'vault_destroyed_max_attempts', 'vault_recovered_via_security_questions'];
router.get('/vault-audit', auth, adminOnly, async (req, res) => {
  const limit  = Math.min(Number(req.query.limit)  || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const [rows, totalRow] = await Promise.all([
    queryAll(
      `SELECT l.action, l.ip_address, l.user_agent, l.metadata, l.created_at, u.id as user_id, u.name, u.email
       FROM user_audit_logs l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.action = ANY($1)
       ORDER BY l.created_at DESC LIMIT $2 OFFSET $3`,
      [VAULT_AUDIT_ACTIONS, limit, offset]
    ),
    queryOne(`SELECT COUNT(*)::int as c FROM user_audit_logs WHERE action = ANY($1)`, [VAULT_AUDIT_ACTIONS]),
  ]);

  res.json({ rows, total: totalRow.c, limit, offset });
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
  // session_version bump signs out any session the (possibly compromised)
  // account already has open, same as the self-service reset flow (SEC-04).
  await query(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, session_version = session_version + 1 WHERE id = $2',
    [hash, user.id]
  );
  await query(
    `INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, 'password_reset', $2)`,
    [user.id, JSON.stringify({ reset_by: 'admin', admin_id: req.user.id })]
  );
  res.json({ success: true });
});

router.post('/users/:id/grant-premium', auth, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await query(`
    INSERT INTO subscriptions (user_id, plan, status, provider, granted_by_admin_id, updated_at)
    VALUES ($1, 'premium', 'active', 'admin_grant', $2, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      plan = 'premium', status = 'active', provider = 'admin_grant',
      granted_by_admin_id = $2, updated_at = NOW()
  `, [user.id, req.user.id]);

  await query(
    `INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, 'premium_granted', $2)`,
    [user.id, JSON.stringify({ granted_by_admin_id: req.user.id })]
  );

  res.json({ success: true });
});

router.post('/users/:id/revoke-premium', auth, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await query(`
    INSERT INTO subscriptions (user_id, plan, status, provider, granted_by_admin_id, updated_at)
    VALUES ($1, 'free', 'active', NULL, NULL, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      plan = 'free', provider = NULL, granted_by_admin_id = NULL, updated_at = NOW()
  `, [user.id]);

  await query(
    `INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, 'premium_revoked', $2)`,
    [user.id, JSON.stringify({ revoked_by_admin_id: req.user.id })]
  );

  res.json({ success: true });
});

router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // uploaded_documents rows (legal documents, funeral photos, etc.) are
  // removed from the database via ON DELETE CASCADE, but that only ever
  // touches the database - the actual files stay in R2 forever unless we
  // explicitly delete them here too. Read the keys before the cascade wipes
  // the rows out from under us.
  const docs = await queryAll('SELECT r2_key FROM uploaded_documents WHERE user_id = $1', [user.id]);

  await query('DELETE FROM users WHERE id = $1', [req.params.id]);

  // Best-effort, after the account is already gone: the admin's request was
  // to delete the account and everything in it, so a transient R2 failure
  // shouldn't leave the account undeletable. Any file that fails here is
  // orphaned storage, not orphaned personal data tied to a live account.
  await Promise.all(docs.map(d => deleteFile(d.r2_key).catch(err =>
    console.error('[admin] Failed to delete R2 file for removed user', user.id, ':', err.message)
  )));

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
  if (!matchesExtension(req.file.buffer, ext)) {
    return res.status(400).json({ error: "That file's content doesn't match its type. Please check the file and try again." });
  }

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

// Manually runs the same daily inactivity check the 8am cron runs (see index.js),
// so the executor/demise-confirmation flow can be exercised on demand rather than
// waiting for the next real cron tick. Mirrors the existing POST /backups/run
// pattern above. Safe to run anytime: it only acts on users whose timer has
// actually lapsed or is within its reminder window.
router.post('/inactivity-check/run', auth, adminOnly, async (req, res) => {
  try {
    await checkInactivity();
    res.json({ success: true });
  } catch (err) {
    console.error('[inactivity] Manual run failed:', err.message);
    res.status(500).json({ error: "We couldn't run the inactivity check. Please try again." });
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
