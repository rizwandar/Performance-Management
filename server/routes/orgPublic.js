const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { queryOne, query } = require('../db/database');
const { setAuthCookies } = require('../lib/authCookies');

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function loadToken(token) {
  const row = await queryOne(
    `SELECT t.*, oc.organization_id, oc.invited_name, oc.invited_email, oc.user_id, oc.lifecycle_status,
            o.name as org_name
     FROM organization_customer_tokens t
     JOIN organization_customers oc ON oc.id = t.organization_customer_id
     JOIN organizations o ON o.id = oc.organization_id
     WHERE t.token = $1`,
    [token]
  );
  if (!row) return { error: 'Invalid or expired link.' };
  if (new Date(row.expires_at) < new Date()) return { error: 'This link has expired. Please ask the organization to resend it.' };
  return { row };
}

async function grantOrgPremium(userId, organizationId) {
  const periodEnd = new Date(Date.now() + ONE_YEAR_MS).toISOString();
  await query(`
    INSERT INTO subscriptions (user_id, plan, status, provider, organization_id, current_period_start, current_period_end, updated_at)
    VALUES ($1, 'premium', 'active', 'org_grant', $2, NOW(), $3, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      plan = 'premium', status = 'active', provider = 'org_grant',
      organization_id = $2, current_period_start = NOW(), current_period_end = $3, updated_at = NOW()
  `, [userId, organizationId, periodEnd]);
}

router.get('/:token', async (req, res) => {
  const { error, row } = await loadToken(req.params.token);
  if (error) return res.status(400).json({ error });

  res.json({
    token_type: row.token_type,
    org_name:   row.org_name,
    name:       row.invited_name,
    email:      row.invited_email,
  });
});

// New customer (no existing IGHP account): completes their own signup. The
// organization never sets or sees this password (org portal spec, section 7.1).
router.post('/:token/complete-invite', async (req, res) => {
  const { error, row } = await loadToken(req.params.token);
  if (error) return res.status(400).json({ error });
  if (row.token_type !== 'invite') return res.status(400).json({ error: 'This link is not a signup invitation.' });

  const { name, password, privacy_consent } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!privacy_consent) return res.status(400).json({ error: 'You must agree to the Privacy Policy and Terms of Service to create an account.' });

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [row.invited_email]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please use the sign in page instead.' });

  const hash = bcrypt.hashSync(password, 10);
  const [privacyVersion, tosVersion] = await Promise.all([
    queryOne("SELECT version FROM policy_versions WHERE module = 'privacy' ORDER BY version DESC LIMIT 1"),
    queryOne("SELECT version FROM policy_versions WHERE module = 'tos' ORDER BY version DESC LIMIT 1"),
  ]);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, privacy_consent, privacy_consent_at,
                        privacy_version_consented, tos_version_consented, email_verified)
     VALUES ($1, $2, $3, 1, NOW(), $4, $5, 1) RETURNING id`,
    [(name || row.invited_name || '').trim() || row.invited_name, row.invited_email, hash,
     privacyVersion?.version ?? null, tosVersion?.version ?? null]
  );
  const userId = result.rows[0].id;

  try {
    await query(
      `UPDATE organization_customers
       SET user_id = $1, lifecycle_status = 'signed_up', view_consent = 1, view_consent_at = NOW(),
           premium_granted_at = NOW(), premium_expires_at = NOW() + interval '1 year'
       WHERE id = $2`,
      [userId, row.organization_customer_id]
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This account is already associated with another organization.' });
    }
    throw err;
  }

  await grantOrgPremium(userId, row.organization_id);
  await query('DELETE FROM organization_customer_tokens WHERE id = $1', [row.id]);
  await query(
    'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
    [userId, 'org_customer_signup', JSON.stringify({ organization_id: row.organization_id })]
  );

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  const token = jwt.sign({ id: userId, email: row.invited_email, is_admin: 0 }, JWT_SECRET, { expiresIn: '8h' });
  const csrfToken = setAuthCookies(res, token); // web-only flow (org customer onboarding), same as /auth/register
  res.status(201).json({ success: true, token, csrf_token: csrfToken, user: { id: userId, name: row.invited_name, email: row.invited_email, is_admin: 0 } });
});

// Existing IGHP account: one click approves the association. No data moves and
// nothing changes until this is clicked (org portal spec, section 7.2).
router.post('/:token/approve', async (req, res) => {
  const { error, row } = await loadToken(req.params.token);
  if (error) return res.status(400).json({ error });

  if (row.token_type === 'edit_consent') {
    await query(
      `UPDATE organization_customers SET edit_consent = 1, edit_consent_at = NOW() WHERE id = $1`,
      [row.organization_customer_id]
    );
    await query('DELETE FROM organization_customer_tokens WHERE id = $1', [row.id]);
    await query(
      'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [row.user_id, 'edit_consent_granted', JSON.stringify({ organization_id: row.organization_id })]
    );
    return res.json({ success: true });
  }

  if (row.token_type !== 'link_request') return res.status(400).json({ error: 'This link is not a connection request.' });

  const user = await queryOne('SELECT id FROM users WHERE email = $1', [row.invited_email]);
  if (!user) return res.status(404).json({ error: 'No matching account was found for this request.' });

  try {
    await query(
      `UPDATE organization_customers
       SET user_id = $1, lifecycle_status = 'signed_up', view_consent = 1, view_consent_at = NOW(),
           premium_granted_at = NOW(), premium_expires_at = NOW() + interval '1 year'
       WHERE id = $2`,
      [user.id, row.organization_customer_id]
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This account is already associated with another organization.' });
    }
    throw err;
  }

  await grantOrgPremium(user.id, row.organization_id);
  await query('DELETE FROM organization_customer_tokens WHERE id = $1', [row.id]);
  await query(
    'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
    [user.id, 'org_customer_linked', JSON.stringify({ organization_id: row.organization_id })]
  );

  res.json({ success: true });
});

module.exports = router;
