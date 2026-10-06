const express = require('express');
const router  = express.Router();
const { queryOne, queryAll, query, transaction } = require('../db/database');
const auth    = require('../middleware/auth');
const multer  = require('multer');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');
const { runBackup, listBackups } = require('../lib/backup');
const { checkInactivity } = require('../lib/inactivityTimer');
const { runVaultReleaseChallenges } = require('../lib/releaseChallenge');
const { matchesExtension } = require('../lib/fileSignature');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

const FINDING_CATEGORIES = ['authorization', 'injection', 'xss', 'secrets', 'infrastructure', 'session', 'documentation', 'ci-cd', 'other'];
const FINDING_SEVERITIES  = ['info', 'low', 'medium', 'high', 'critical'];
const FINDING_STATUSES    = ['open', 'monitoring', 'resolved', 'accepted_risk'];

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
      (SELECT COUNT(*) FROM donation_bank)      +
      (SELECT COUNT(*) FROM people_to_notify)   +
      (SELECT COUNT(*) FROM property_items)     +
      (SELECT COUNT(*) FROM personal_messages)  +
      (SELECT COUNT(*) FROM songs_that_define_me)+
      (SELECT COUNT(*) FROM life_wishes)        +
      (SELECT COUNT(*) FROM insurance_items)    +
      (SELECT COUNT(*) FROM unfinished_business)+
      (SELECT COUNT(*) FROM last_moments)
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

  const baseFrom = `
    FROM users u
    LEFT JOIN subscriptions s      ON s.user_id = u.id
    LEFT JOIN users granter        ON granter.id = s.granted_by_admin_id
  `;
  let where = `WHERE u.is_admin = 0`;
  const args = [];
  if (q) {
    args.push(`%${q}%`);
    where += ` AND (u.name ILIKE $1 OR u.email ILIKE $1)`;
  }
  const totalSql = `SELECT COUNT(*)::int as c ${baseFrom} ${where}`;

  // REV-25: this used to be 16 correlated subqueries per row (15 section
  // counts + a login MAX), up to 200 rows per page = ~3,200 subqueries per
  // load. Rewritten as LEFT JOIN (SELECT user_id, COUNT(*) ... GROUP BY
  // user_id) aggregates instead, the same shape server/lib/
  // unfinishedSectionsNudge.js already uses. Same 15 tables, same field
  // names, same response shape as before. Only rowsSql needs these joins;
  // totalSql just counts matching users and doesn't need per-section data.
  const aggJoins = `
    LEFT JOIN (SELECT user_id, MAX(created_at) as last_login FROM user_audit_logs WHERE action = 'login_success' GROUP BY user_id) ll  ON ll.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM legal_documents      GROUP BY user_id) ld  ON ld.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM financial_items      GROUP BY user_id) fi  ON fi.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM digital_credentials  GROUP BY user_id) dc  ON dc.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM funeral_wishes       GROUP BY user_id) fw  ON fw.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM doctors              GROUP BY user_id) doc ON doc.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM medical_records      GROUP BY user_id) mr  ON mr.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM donation_bank        GROUP BY user_id) db  ON db.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM people_to_notify     GROUP BY user_id) ptn ON ptn.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM property_items       GROUP BY user_id) pi  ON pi.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM personal_messages    GROUP BY user_id) pm  ON pm.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM songs_that_define_me GROUP BY user_id) stm ON stm.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM life_wishes          GROUP BY user_id) lw  ON lw.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM insurance_items      GROUP BY user_id) ins ON ins.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM unfinished_business  GROUP BY user_id) ub  ON ub.user_id  = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) c FROM last_moments         GROUP BY user_id) lm  ON lm.user_id  = u.id
  `;

  const rowsSql = `
    SELECT u.id, u.name, u.email, u.date_of_birth, u.created_at, u.last_active_at,
           u.inactivity_period_months, u.is_deceased, u.deceased_at, u.email_verified,
           ll.last_login,
           (
             COALESCE(ld.c, 0) + COALESCE(fi.c, 0) + COALESCE(dc.c, 0) + COALESCE(fw.c, 0) +
             COALESCE(doc.c, 0) + COALESCE(mr.c, 0) + COALESCE(db.c, 0) + COALESCE(ptn.c, 0) +
             COALESCE(pi.c, 0)  + COALESCE(pm.c, 0) + COALESCE(stm.c, 0) + COALESCE(lw.c, 0) +
             COALESCE(ins.c, 0) + COALESCE(ub.c, 0) + COALESCE(lm.c, 0)
           )::int as total_entries,
           COALESCE(s.plan, 'free') as plan,
           (s.provider = 'admin_grant') as is_honorary,
           granter.name as granted_by_admin_name
    ${baseFrom}
    ${aggJoins}
    ${where}
    ORDER BY u.created_at DESC
    LIMIT $${args.length + 1} OFFSET $${args.length + 2}
  `;

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
    ld, fi, dc, fw, doc, mr, db, ptn, pi, pm, stm, lw, ins, ub, lm
  ] = await Promise.all([
    queryOne('SELECT COUNT(*)::int as c FROM legal_documents     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM financial_items     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM digital_credentials WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM funeral_wishes      WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM doctors             WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM medical_records     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM donation_bank       WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM people_to_notify    WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM property_items      WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM personal_messages   WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM songs_that_define_me WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM life_wishes         WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM insurance_items     WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM unfinished_business WHERE user_id = $1', [user.id]),
    queryOne('SELECT COUNT(*)::int as c FROM last_moments        WHERE user_id = $1', [user.id]),
  ]);

  const completion = {
    legal_documents:     ld.c,
    financial_items:     fi.c,
    digital_credentials: dc.c,
    funeral_wishes:      fw.c,
    doctors:             doc.c,
    medical_records:     mr.c,
    donation_bank:       db.c,
    people_to_notify:    ptn.c,
    property_items:      pi.c,
    personal_messages:   pm.c,
    songs_that_define_me: stm.c,
    life_wishes:         lw.c,
    insurance_items:     ins.c,
    unfinished_business: ub.c,
    last_moments:        lm.c,
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

  // OPS-36: when reverting a mistaken deceased marking, revoke all permanent
  // deceased-confirmed tokens that were issued to this user's trusted contacts.
  // REV-14 made these tokens permanent (expires_at = NULL) for all contacts,
  // not just the executor, so they persist indefinitely even if the account is
  // confirmed alive again. Revoke them on revert to prevent unauthorized access
  // via stale deceased-access links. This mirrors the pattern in auth.js REV-13,
  // which revokes inactivity-timer tokens on login; that fix deliberately does
  // not touch deceased_confirmed tokens (separate concern), so this task closes
  // that gap.
  await query(
    `DELETE FROM trusted_contact_tokens
     WHERE source = 'deceased_confirmed'
       AND contact_id IN (SELECT id FROM trusted_contacts WHERE user_id = $1)`,
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
// "Security findings log" in CLAUDE.md.
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

// Contact-form submission inbox (IDEA-09): server/routes/contact.js persists
// every submission to contact_submissions independently of the outbound
// email notification, so a missed/failed email doesn't lose the message.
// Readable/manageable from the admin panel's new tab. Mirrors the
// security-findings routes just above (same auth/adminOnly convention).
router.get('/contact-submissions', auth, adminOnly, async (req, res) => {
  const rows = await queryAll(
    'SELECT * FROM contact_submissions ORDER BY created_at DESC'
  );
  res.json(rows);
});

router.put('/contact-submissions/:id', auth, adminOnly, async (req, res) => {
  const existing = await queryOne('SELECT id FROM contact_submissions WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Submission not found.' });
  const { status } = req.body;
  if (!['new', 'read'].includes(status)) {
    return res.status(400).json({ error: "status must be one of: new, read" });
  }
  await query('UPDATE contact_submissions SET status = $1 WHERE id = $2', [status, req.params.id]);
  res.json({ success: true });
});

router.delete('/contact-submissions/:id', auth, adminOnly, async (req, res) => {
  const existing = await queryOne('SELECT id FROM contact_submissions WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Submission not found.' });
  await query('DELETE FROM contact_submissions WHERE id = $1', [req.params.id]);
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

  // Durable "this account has ever actually been Premium" flag - an
  // admin-granted honorary Premium account counts too, since what matters
  // here is that they got full access, not how they got it. See the schema
  // comment in database.js.
  await query(
    'UPDATE users SET premium_used_at = NOW() WHERE id = $1 AND premium_used_at IS NULL',
    [user.id]
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

  // Revoking premium also has to end the no-card signup trial (BIL-08).
  // lib/subscription.js's getAccessInfo falls back to that trial whenever
  // there is no active *paid* subscription, so writing plan 'free' above is
  // not on its own enough: for any account less than 30 days old the trial
  // kept independently granting premium and this route silently did nothing.
  // Clearing signup_trial_started_at makes "revoke" mean what it says, and
  // also makes signupTrialExpired false rather than true, so the user sees
  // the ordinary free-plan copy instead of "your trial has ended" for a
  // trial that was revoked rather than served out.
  await query('UPDATE users SET signup_trial_started_at = NULL WHERE id = $1', [user.id]);

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

// Manually runs the same daily vault-release challenge sweep the 8am cron runs
// (see index.js and lib/releaseChallenge.js), so the release path can be
// exercised without waiting out a real seven-day window. Mirrors the inactivity
// check above. Safe to run anytime, and safe to run twice: every write in the
// sweep is either a conditional UPDATE that matches nothing on a second pass or
// is guarded by an "already told" stamp, so it only acts on rows whose window
// has genuinely lapsed or is due another challenge.
router.post('/vault-release/run', auth, adminOnly, async (req, res) => {
  try {
    const summary = await runVaultReleaseChallenges();
    res.json({ success: true, ...summary });
  } catch (err) {
    console.error('[vault-release] Manual sweep failed:', err.message);
    res.status(500).json({ error: "We couldn't run the vault release sweep. Please try again." });
  }
});

// 168 hours is both the schema default for vault_release.window_hours and the
// seven days the spec promises, so it is the ceiling here as well as the
// starting point: this control exists to shorten a window for testing, never to
// extend one past what the owner was told. One hour is the floor because a zero
// or negative window would close the moment it opened, which is the one outcome
// the whole challenge mechanism exists to prevent.
const VAULT_RELEASE_MIN_WINDOW_HOURS = 1;
const VAULT_RELEASE_MAX_WINDOW_HOURS = 168;

// How much of a pending window must still be left after this route has
// finished with it. A bound of "strictly in the future" would still permit a
// deadline one second away, which is an immediate release wearing a clock, so
// the floor is a few minutes: long enough for whoever pressed this to notice
// and cancel, short enough to be useless as a wait.
const VAULT_RELEASE_MIN_REMAINING_MS = 5 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

// Shortens (or restores) the challenge window for a single account, so a
// release can actually be driven to completion in a test rather than theorised
// about. Per-row by design: lib/releaseChallenge.js reads window_hours off the
// row on every pass, so this takes effect on an already-pending window too,
// recomputed from pending_started_at rather than from now.
//
// That recomputation is exactly why this route refuses to leave a pending
// deadline in the past. releaseIfWindowClosed() reads the deadline as
// pending_started_at + window_hours, so one hour set on a row that went
// pending two hours ago is a deadline that has already lapsed, and the very
// next sweep (including the manual one above) releases that vault. Nothing
// undoes it: POST /users/:id/revert-deceased never touches vault_release, and
// the owner's own POST /resume refuses a released row. Spec section 9.3 states
// the principle this follows, that cancelling is safe because it errs toward
// not releasing while accelerating is not.
//
// The refusal is keyed on the resulting deadline rather than on the status,
// because shortening a pending window to something still in the future is a
// legitimate thing to want during a test, and a flat "no while pending" would
// take away the only case the control was built for.
//
// This is the most dangerous button in the admin panel, which is why it writes
// an audit row before it is of any use to anyone. It compresses the period in
// which a living person can object to having been declared dead, so "who
// shortened it, for whom, from what, to what" has to survive the session that
// did it. The audit row and the change are one transaction: a committed audit
// row beside a failed UPDATE is a trail asserting a change that never
// happened, which is worse than no trail at all.
router.post('/users/:id/vault-release-window', auth, adminOnly, async (req, res) => {
  // Only number and string are accepted: Number() is happy to turn null, true
  // and single-element arrays into valid-looking integers, and a bound on this
  // value is worth nothing if the parse can be talked into producing one.
  const raw = req.body ? req.body.window_hours : undefined;
  const parseable = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== ''));
  const hours = parseable ? Number(raw) : NaN;
  if (!Number.isInteger(hours) || hours < VAULT_RELEASE_MIN_WINDOW_HOURS || hours > VAULT_RELEASE_MAX_WINDOW_HOURS) {
    return res.status(400).json({
      error: `Window must be a whole number of hours between ${VAULT_RELEASE_MIN_WINDOW_HOURS} and ${VAULT_RELEASE_MAX_WINDOW_HOURS}.`,
    });
  }

  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND is_admin = 0', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const outcome = await transaction(async (client) => {
    // FOR UPDATE because the clamp below reads status and pending_started_at
    // and then acts on them. Without the lock a declaration landing in between
    // would move the row from armed to pending after the check had already
    // waved the value through, which is the same past deadline by a slower
    // route. The lock is on one row of one user and is held for two statements.
    //
    // No row means the owner has never armed the envelope. Nothing is created
    // here: key_enc is NOT NULL and only the owner can produce it, so a window
    // without an envelope would be a half-built release record.
    const found = await client.query(
      'SELECT window_hours, status, pending_started_at FROM vault_release WHERE user_id = $1 FOR UPDATE',
      [user.id]
    );
    const existing = found.rows[0];
    if (!existing) {
      return { refusal: { status: 404, error: 'This user has not set up vault release on death, so there is no window to change.' } };
    }

    if (existing.status === 'pending') {
      // A pending row with no start time cannot have its deadline reasoned
      // about at all (windowClosesAt would produce an Invalid Date, which
      // compares false against now and therefore reads as lapsed), so it is
      // refused rather than guessed at.
      if (!existing.pending_started_at) {
        return { refusal: { status: 409, error: 'This release is pending but has no recorded start time, so its deadline cannot be computed. Cancel the pending release instead.' } };
      }

      const startedMs  = new Date(existing.pending_started_at).getTime();
      const closesAtMs = startedMs + hours * MS_PER_HOUR;
      const earliestMs = Date.now() + VAULT_RELEASE_MIN_REMAINING_MS;
      if (closesAtMs < earliestMs) {
        const minHours = Math.max(
          VAULT_RELEASE_MIN_WINDOW_HOURS,
          Math.ceil((earliestMs - startedMs) / MS_PER_HOUR)
        );
        const error = minHours > VAULT_RELEASE_MAX_WINDOW_HOURS
          ? 'This release has been pending for longer than the maximum window, so no value here can leave its deadline in the future. Cancel the pending release instead.'
          : `This release is already pending, and its deadline is measured from when it went pending, not from now. A window of ${hours} hour${hours === 1 ? '' : 's'} has already elapsed, so the next sweep would release the vault straight away. Use at least ${minHours} hours, or cancel the pending release instead.`;
        return { refusal: { status: 400, error } };
      }
    }

    const previousHours = Number(existing.window_hours);
    await client.query(
      `INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, 'vault_release_window_hours_changed', $2)`,
      [user.id, JSON.stringify({
        changed_by_admin_id: req.user.id,
        from_window_hours:   previousHours,
        to_window_hours:     hours,
        status_at_change:    existing.status,
      })]
    );

    // window_hours and nothing else. Status, timers, attempt counters and above
    // all key_enc are none of this route's business.
    await client.query('UPDATE vault_release SET window_hours = $1 WHERE user_id = $2', [hours, user.id]);

    return { previousHours, status: existing.status };
  });

  if (outcome.refusal) {
    return res.status(outcome.refusal.status).json({ error: outcome.refusal.error });
  }

  res.json({ success: true, window_hours: hours, previous_window_hours: outcome.previousHours, status: outcome.status });
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

// A read-only inventory of the live database schema, for comparing one
// environment against another.
//
// Schema changes here are inline startup migrations (CREATE TABLE IF NOT
// EXISTS / ADD COLUMN IF NOT EXISTS in db/database.js), so in principle every
// environment converges on whatever the deployed code declares. In practice
// three things can still leave an environment out of step, and none of them
// are visible without looking: the service may be running older code than the
// branch you are reading, a one-time conditional backfill may have run in one
// environment and not another, and objects created by a branch that was once
// deployed and then abandoned are never cleaned up, because this project
// deliberately never drops anything.
//
// Direct inbound access to the staging and production databases was closed in
// SEC-25, which is correct and is not being reopened, so this endpoint is the
// supported way to see their schema. It returns structure only, never row
// data: table names, column names, types and nullability. Admin-only all the
// same, since an inventory of the schema is useful reconnaissance.
router.get('/schema-audit', auth, adminOnly, async (req, res) => {
  const cols = await queryAll(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `);

  // Views and the like are excluded: only real tables are declared by the
  // migrations, so only real tables are comparable against them.
  const baseTables = await queryAll(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const isBase = new Set(baseTables.map(r => r.table_name));

  const tables = {};
  for (const c of cols) {
    if (!isBase.has(c.table_name)) continue;
    if (!tables[c.table_name]) tables[c.table_name] = [];
    tables[c.table_name].push({
      column:   c.column_name,
      type:     c.data_type,
      nullable: c.is_nullable === 'YES',
    });
  }

  res.json({
    // RENDER_SERVICE_NAME rather than NODE_ENV: Render sets NODE_ENV to
    // 'production' on every web service, staging included, so it cannot tell
    // the two apart. Same reason instrument.js and lib/backup.js use it.
    environment:  process.env.RENDER_SERVICE_NAME || 'local',
    generated_at: new Date().toISOString(),
    table_count:  Object.keys(tables).length,
    column_count: Object.values(tables).reduce((n, c) => n + c.length, 0),
    tables,
  });
});

module.exports = router;
