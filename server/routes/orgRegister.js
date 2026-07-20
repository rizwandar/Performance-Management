const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { queryOne, query } = require('../db/database');
const { PLAN_TIERS, PLAN_RATES } = require('../lib/orgPlanLimits');
const { sendEmail } = require('../lib/sendEmail');
const { orgAdminInviteEmail } = require('../lib/emailTemplates');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const BUSINESS_CATEGORIES = [
  'Funeral Home', 'Cremation Services', 'Cemetery / Memorial Park',
  'Pre-Need Insurance Provider', 'Estate & Life Management Services',
  'Hospice / Palliative Care Partner', 'Other',
];

// Public, fully automatic: no IGHP approval step. An org shell is created
// immediately so the invite token has something to attach to; if the applicant
// never completes setup it just sits unused, which is an acceptable trade-off
// for not burying anyone in manual application review.
router.post('/apply', async (req, res) => {
  const { org_name, business_categories, applicant_name, applicant_email } = req.body;
  if (!org_name?.trim() || !applicant_name?.trim() || !applicant_email?.trim()) {
    return res.status(400).json({ error: 'Organization name, your name, and your email are required.' });
  }
  const normalizedEmail = applicant_email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });

  const categories = Array.isArray(business_categories)
    ? business_categories.filter(c => BUSINESS_CATEGORIES.includes(c))
    : [];

  const orgResult = await query(
    `INSERT INTO organizations (name, business_categories, plan_tier) VALUES ($1, $2, 'starter') RETURNING id`,
    [org_name.trim(), JSON.stringify(categories)]
  );
  const orgId = orgResult.rows[0].id;

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query(
    'INSERT INTO organization_admin_invites (organization_id, name, email, token, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [orgId, applicant_name.trim(), normalizedEmail, token, expiresAt]
  );

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const link = `${clientUrl}/register/organization/complete/${token}`;
  try {
    await sendEmail({
      to: normalizedEmail,
      subject: `Complete your ${org_name.trim()} setup on In Good Hands`,
      html: orgAdminInviteEmail({ name: applicant_name.trim(), orgName: org_name.trim(), completeLink: link }),
    });
  } catch (err) {
    console.error('[org-register] Invite email failed:', err.message);
  }

  res.status(201).json({ success: true });
});

router.get('/:token', async (req, res) => {
  const invite = await queryOne(
    `SELECT oai.*, o.name as org_name
     FROM organization_admin_invites oai JOIN organizations o ON o.id = oai.organization_id
     WHERE oai.token = $1`,
    [req.params.token]
  );
  if (!invite) return res.status(400).json({ error: 'Invalid or expired link.' });
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This link has expired. Please register again.' });
  }
  res.json({ org_name: invite.org_name, name: invite.name, email: invite.email });
});

router.post('/:token/complete', async (req, res) => {
  const invite = await queryOne(
    `SELECT oai.*, o.name as org_name
     FROM organization_admin_invites oai JOIN organizations o ON o.id = oai.organization_id
     WHERE oai.token = $1`,
    [req.params.token]
  );
  if (!invite) return res.status(400).json({ error: 'Invalid or expired link.' });
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This link has expired. Please register again.' });
  }

  const { plan_tier, password, privacy_consent } = req.body;
  if (!PLAN_TIERS.includes(plan_tier)) return res.status(400).json({ error: 'Please choose a plan.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!privacy_consent) return res.status(400).json({ error: 'You must agree to the Privacy Policy and Terms of Service to continue.' });

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [invite.email]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });

  const hash = bcrypt.hashSync(password, 10);
  const userResult = await query(
    `INSERT INTO users (name, email, password_hash, is_admin, email_verified, org_role, organization_id, privacy_consent, privacy_consent_at)
     VALUES ($1, $2, $3, 0, 1, 'org_admin', $4, 1, NOW()) RETURNING id`,
    [invite.name, invite.email, hash, invite.organization_id]
  );
  const userId = userResult.rows[0].id;

  await query('UPDATE organizations SET plan_tier = $1 WHERE id = $2', [plan_tier, invite.organization_id]);
  await query(
    `INSERT INTO organization_billing_events (organization_id, old_plan_tier, new_plan_tier, rate_snapshot, changed_by_user_id)
     VALUES ($1, NULL, $2, $3, $4)`,
    [invite.organization_id, plan_tier, PLAN_RATES[plan_tier], userId]
  );
  await query('DELETE FROM organization_admin_invites WHERE id = $1', [invite.id]);
  await query(
    'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
    [userId, 'org_self_registered', JSON.stringify({ organization_id: invite.organization_id, plan_tier })]
  );

  const token = jwt.sign(
    { id: userId, email: invite.email, is_admin: false, org_role: 'org_admin', organization_id: invite.organization_id },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.status(201).json({
    token,
    user: { id: userId, name: invite.name, email: invite.email, is_admin: 0, org_role: 'org_admin', organization_id: invite.organization_id },
  });
});

module.exports = router;
