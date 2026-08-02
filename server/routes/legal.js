const express = require('express');
const router = express.Router();
const { queryOne, queryAll, query } = require('../db/database');
const auth = require('../middleware/auth');
const { uploadFile } = require('../lib/r2');

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

const MODULES = ['privacy', 'tos'];
function validModule(req, res, next) {
  if (!MODULES.includes(req.params.module)) {
    return res.status(404).json({ error: 'Unknown policy module' });
  }
  next();
}

async function auditLog(userId, action, req, metadata) {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
              || req.socket?.remoteAddress
              || null;
    const ua = req.headers['user-agent'] || null;
    await query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [userId || null, action, ip, ua, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('[audit] Log failed:', err.message);
  }
}

async function currentVersion(module) {
  return queryOne(
    'SELECT version, content_html, summary, published_at FROM policy_versions WHERE module = $1 ORDER BY version DESC LIMIT 1',
    [module]
  );
}

// Public: powers the live /privacy and /terms pages. No auth required, since
// both pages are reachable by logged-out visitors.
router.get('/:module/current', validModule, async (req, res) => {
  const current = await currentVersion(req.params.module);
  if (!current) return res.status(404).json({ error: 'No published version yet' });
  res.json(current);
});

// Whether the logged-in user needs to re-consent to either policy, i.e. their
// last-consented version is behind whatever is currently published. Drives
// the LegalReconsentBanner in App.jsx.
router.get('/status', auth, async (req, res) => {
  const user = await queryOne(
    'SELECT privacy_version_consented, tos_version_consented FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  const [privacy, tos] = await Promise.all([currentVersion('privacy'), currentVersion('tos')]);
  const privacyBehind = !!privacy && user.privacy_version_consented !== privacy.version;
  const tosBehind = !!tos && user.tos_version_consented !== tos.version;

  res.json({
    needs_reconsent: privacyBehind || tosBehind,
    privacy: privacy ? { current_version: privacy.version, consented_version: user.privacy_version_consented } : null,
    tos: tos ? { current_version: tos.version, consented_version: user.tos_version_consented } : null,
  });
});

// Records (or re-records) consent to whatever is currently published for both
// policies at once - a single combined action, matching the one checkbox at
// signup. Used both by registration and by the re-consent banner.
router.post('/consent', auth, async (req, res) => {
  const [privacy, tos] = await Promise.all([currentVersion('privacy'), currentVersion('tos')]);
  if (!privacy || !tos) return res.status(409).json({ error: 'No published policy versions to consent to' });

  await query(
    `UPDATE users
     SET privacy_consent = 1, privacy_consent_at = NOW(),
         privacy_version_consented = $1, tos_version_consented = $2
     WHERE id = $3`,
    [privacy.version, tos.version, req.user.id]
  );
  auditLog(req.user.id, 'legal_consent', req, { privacy_version: privacy.version, tos_version: tos.version });
  res.json({ success: true, privacy_version: privacy.version, tos_version: tos.version });
});

// Admin: full version history for a module, most recent first.
router.get('/:module/history', auth, adminOnly, validModule, async (req, res) => {
  const rows = await queryAll(
    `SELECT pv.version, pv.summary, pv.published_at, u.name as published_by_name
     FROM policy_versions pv
     LEFT JOIN users u ON u.id = pv.published_by_admin_id
     WHERE pv.module = $1
     ORDER BY pv.version DESC`,
    [req.params.module]
  );
  res.json(rows);
});

// Admin: publish a new version. Auto-increments per module, archives the same
// content to R2 as a durable secondary copy alongside the DB row (local disk
// isn't used - Render's filesystem is ephemeral and wouldn't survive the next
// deploy, so it would be a fake safety net for a legal record).
router.post('/:module/publish', auth, adminOnly, validModule, async (req, res) => {
  const { content_html, summary } = req.body;
  if (!content_html || !content_html.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }
  const module = req.params.module;

  const last = await queryOne('SELECT COALESCE(MAX(version), 0) as max FROM policy_versions WHERE module = $1', [module]);
  const nextVersion = last.max + 1;

  await query(
    `INSERT INTO policy_versions (module, version, content_html, summary, published_by_admin_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [module, nextVersion, content_html, summary || null, req.user.id]
  );

  try {
    await uploadFile({
      key: `legal-archive/${module}/v${nextVersion}.html`,
      buffer: Buffer.from(content_html, 'utf8'),
      mimeType: 'text/html',
    });
  } catch (err) {
    // The DB row is already the durable source of truth; the R2 copy is a
    // secondary archive, so a failure here shouldn't block the publish.
    console.error('[legal] R2 archive copy failed:', err.message);
  }

  auditLog(req.user.id, 'legal_version_published', req, { module, version: nextVersion });
  res.status(201).json({ module, version: nextVersion });
});

module.exports = router;
