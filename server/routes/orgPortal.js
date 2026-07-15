const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { queryOne, queryAll, query } = require('../db/database');
const auth    = require('../middleware/auth');
const { requireOrgUser, requireOrgAdmin } = require('../middleware/orgAuth');
const { sendEmail } = require('../lib/sendEmail');
const { orgInviteEmail, orgLinkRequestEmail, orgEditConsentRequestEmail, executorNotificationEmail } = require('../lib/emailTemplates');

const LIFECYCLE_STATUSES = ['invited', 'signed_up', 'plan_in_progress', 'plan_completed', 'deceased', 'archived'];

async function auditLog(userId, action, metadata) {
  try {
    await query(
      'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [userId || null, action, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('[audit] Log failed:', err.message);
  }
}

// Org Admins always see every customer. Org Staff are scoped to their own
// location when the org's location_visibility_policy is 'own_location'.
async function locationFilter(req) {
  if (req.user.org_role === 'org_admin') return null;
  const org = await queryOne('SELECT location_visibility_policy FROM organizations WHERE id = $1', [req.user.organization_id]);
  if (org?.location_visibility_policy === 'own_location') {
    return req.user.organization_location_id || -1;
  }
  return null;
}

router.get('/dashboard', auth, requireOrgUser, async (req, res) => {
  const locFilter = await locationFilter(req);
  let sql = `SELECT lifecycle_status, COUNT(*)::int as count FROM organization_customers WHERE organization_id = $1`;
  const args = [req.user.organization_id];
  if (locFilter !== null) { args.push(locFilter); sql += ` AND location_id = $${args.length}`; }
  sql += ' GROUP BY lifecycle_status';
  const rows = await queryAll(sql, args);

  const counts = Object.fromEntries(LIFECYCLE_STATUSES.map(s => [s, 0]));
  rows.forEach(r => { counts[r.lifecycle_status] = r.count; });
  res.json({ counts });
});

router.get('/customers', auth, requireOrgUser, async (req, res) => {
  const locFilter = await locationFilter(req);
  let sql = `
    SELECT oc.*, u.name as user_name, u.email as user_email, l.name as location_name
    FROM organization_customers oc
    LEFT JOIN users u ON u.id = oc.user_id
    LEFT JOIN organization_locations l ON l.id = oc.location_id
    WHERE oc.organization_id = $1
  `;
  const args = [req.user.organization_id];
  if (locFilter !== null) { args.push(locFilter); sql += ` AND oc.location_id = $${args.length}`; }
  if (req.query.status) { args.push(req.query.status); sql += ` AND oc.lifecycle_status = $${args.length}`; }
  sql += ' ORDER BY oc.created_at DESC';
  const rows = await queryAll(sql, args);
  res.json(rows);
});

router.get('/customers/:id', auth, requireOrgUser, async (req, res) => {
  const customer = await queryOne(
    `SELECT oc.*, u.name as user_name, u.email as user_email, l.name as location_name
     FROM organization_customers oc
     LEFT JOIN users u ON u.id = oc.user_id
     LEFT JOIN organization_locations l ON l.id = oc.location_id
     WHERE oc.id = $1 AND oc.organization_id = $2`,
    [req.params.id, req.user.organization_id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  res.json(customer);
});

router.post('/customers', auth, requireOrgUser, async (req, res) => {
  const { name, email, location_id } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const orgId = req.user.organization_id;

  const existingInvite = await queryOne(
    `SELECT id FROM organization_customers WHERE organization_id = $1 AND invited_email = $2 AND lifecycle_status != 'archived'`,
    [orgId, normalizedEmail]
  );
  if (existingInvite) return res.status(409).json({ error: 'This email has already been added to your organization.' });

  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [orgId]);

  const result = await query(
    `INSERT INTO organization_customers (organization_id, invited_name, invited_email, location_id, lifecycle_status)
     VALUES ($1, $2, $3, $4, 'invited') RETURNING id`,
    [orgId, name.trim(), normalizedEmail, location_id || null]
  );
  const ocId = result.rows[0].id;

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const existingUser = await queryOne('SELECT id, name FROM users WHERE email = $1', [normalizedEmail]);
  const tokenType = existingUser ? 'link_request' : 'invite';

  await query(
    'INSERT INTO organization_customer_tokens (organization_customer_id, token_type, token, expires_at) VALUES ($1, $2, $3, $4)',
    [ocId, tokenType, token, expiresAt]
  );

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const link = `${clientUrl}/org/link/${token}`;

  try {
    if (tokenType === 'invite') {
      await sendEmail({
        to: normalizedEmail,
        subject: `${org.name} has invited you to In Good Hands`,
        html: orgInviteEmail({ name: name.trim(), orgName: org.name, inviteLink: link }),
      });
    } else {
      await sendEmail({
        to: normalizedEmail,
        subject: `${org.name} would like to connect on In Good Hands`,
        html: orgLinkRequestEmail({ name: existingUser.name, orgName: org.name, linkRequestLink: link }),
      });
    }
  } catch (err) {
    console.error('[org-portal] Invite/link-request email failed:', err.message);
  }

  const customer = await queryOne('SELECT * FROM organization_customers WHERE id = $1', [ocId]);
  res.status(201).json(customer);
});

router.put('/customers/:id/status', auth, requireOrgUser, async (req, res) => {
  const { lifecycle_status } = req.body;
  const allowed = ['plan_in_progress', 'plan_completed', 'archived'];
  if (!allowed.includes(lifecycle_status)) {
    return res.status(400).json({ error: 'Status must be one of: ' + allowed.join(', ') });
  }
  const customer = await queryOne(
    'SELECT * FROM organization_customers WHERE id = $1 AND organization_id = $2',
    [req.params.id, req.user.organization_id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  if (customer.lifecycle_status === 'deceased') {
    return res.status(400).json({ error: 'This customer has been marked deceased and cannot be updated here.' });
  }

  await query(
    `UPDATE organization_customers
     SET lifecycle_status = $1, archived_at = CASE WHEN $1 = 'archived' THEN NOW() ELSE archived_at END
     WHERE id = $2`,
    [lifecycle_status, customer.id]
  );
  const fresh = await queryOne('SELECT * FROM organization_customers WHERE id = $1', [customer.id]);
  res.json(fresh);
});

// Marking deceased requires an explicit confirm flag: a deliberate two-step
// action on the client, not a single click (org portal spec, section 9).
router.post('/customers/:id/deceased', auth, requireOrgUser, async (req, res) => {
  if (req.body.confirm !== true) {
    return res.status(400).json({ error: 'Confirmation is required to mark a customer deceased.' });
  }
  const customer = await queryOne(
    'SELECT * FROM organization_customers WHERE id = $1 AND organization_id = $2',
    [req.params.id, req.user.organization_id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  if (!customer.user_id) return res.status(400).json({ error: 'This customer has not completed signup yet.' });
  if (customer.lifecycle_status === 'deceased') return res.json(customer);

  await query(`UPDATE organization_customers SET lifecycle_status = 'deceased', deceased_at = NOW() WHERE id = $1`, [customer.id]);

  const executor = await queryOne(
    `SELECT tc.name, tc.email, u.name as owner_name
     FROM trusted_contacts tc JOIN users u ON u.id = tc.user_id
     WHERE tc.user_id = $1 AND tc.is_executor = 1`,
    [customer.user_id]
  );
  if (executor?.email) {
    try {
      await sendEmail({
        to: executor.email,
        subject: `An update regarding ${executor.owner_name}'s In Good Hands plan`,
        html: executorNotificationEmail({ executorName: executor.name, ownerName: executor.owner_name }),
      });
    } catch (err) {
      console.error('[org-portal] Executor notification failed:', err.message);
    }
  }

  auditLog(req.user.id, 'customer_marked_deceased', { organization_customer_id: customer.id, customer_user_id: customer.user_id });

  const fresh = await queryOne('SELECT * FROM organization_customers WHERE id = $1', [customer.id]);
  res.json(fresh);
});

// Edit consent is requested any time, separately from view consent, and the
// customer approves via a one-click emailed link (org portal spec, section 10).
router.post('/customers/:id/request-edit-consent', auth, requireOrgUser, async (req, res) => {
  const customer = await queryOne(
    `SELECT oc.*, u.name as user_name, u.email as user_email
     FROM organization_customers oc JOIN users u ON u.id = oc.user_id
     WHERE oc.id = $1 AND oc.organization_id = $2`,
    [req.params.id, req.user.organization_id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found or has not completed signup yet.' });
  if (customer.edit_consent) return res.status(400).json({ error: 'This customer has already granted edit consent.' });

  const org = await queryOne('SELECT name FROM organizations WHERE id = $1', [req.user.organization_id]);

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query(
    'INSERT INTO organization_customer_tokens (organization_customer_id, token_type, token, expires_at) VALUES ($1, $2, $3, $4)',
    [customer.id, 'edit_consent', token, expiresAt]
  );

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const link = `${clientUrl}/org/link/${token}`;
  try {
    await sendEmail({
      to: customer.user_email,
      subject: `${org.name} is requesting edit access on In Good Hands`,
      html: orgEditConsentRequestEmail({ name: customer.user_name, orgName: org.name, consentLink: link }),
    });
  } catch (err) {
    console.error('[org-portal] Edit-consent request email failed:', err.message);
  }

  auditLog(req.user.id, 'edit_consent_requested', { organization_customer_id: customer.id });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// View-as: org staff/admin view (and, with consent, edit) a customer's plan.
// Minting re-checks consent and issues a separate, short-lived token scoped to
// this customer, kept independent of the org user's normal session (org portal
// spec, sections 10-11).
// ---------------------------------------------------------------------------
router.post('/customers/:id/view-as', auth, requireOrgUser, async (req, res) => {
  const customer = await queryOne(
    'SELECT * FROM organization_customers WHERE id = $1 AND organization_id = $2',
    [req.params.id, req.user.organization_id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  if (!customer.user_id) return res.status(400).json({ error: 'This customer has not completed signup yet.' });
  if (!customer.view_consent) return res.status(403).json({ error: 'This customer has not granted view consent.' });

  const customerUser = await queryOne('SELECT name FROM users WHERE id = $1', [customer.user_id]);

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  const viewAsToken = jwt.sign(
    {
      id: req.user.id, email: req.user.email, is_admin: false,
      viewAs: { customerId: customer.user_id, organizationCustomerId: customer.id, editAllowed: !!customer.edit_consent },
    },
    JWT_SECRET,
    { expiresIn: '45m' }
  );

  auditLog(req.user.id, 'view_as_start', { organization_customer_id: customer.id, customer_id: customer.user_id });
  res.json({ token: viewAsToken, customer_name: customerUser?.name, edit_allowed: !!customer.edit_consent });
});

router.post('/view-as/end', auth, async (req, res) => {
  if (!req.isViewAs || !req.actingUser) return res.status(400).json({ error: 'No active view-as session.' });
  auditLog(req.actingUser.id, 'view_as_end', { customer_id: req.user.id });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Staff (Org Admin only)
// ---------------------------------------------------------------------------
router.get('/staff', auth, requireOrgAdmin, async (req, res) => {
  const staff = await queryAll(
    `SELECT id, name, email, org_role, organization_location_id, is_active, created_at
     FROM users WHERE organization_id = $1 AND org_role IS NOT NULL ORDER BY name`,
    [req.user.organization_id]
  );
  res.json(staff);
});

router.post('/staff', auth, requireOrgAdmin, async (req, res) => {
  const { name, email, password, org_role, location_id } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const role = org_role === 'org_admin' ? 'org_admin' : 'org_staff';

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing) return res.status(409).json({ error: 'A user with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, is_admin, email_verified, org_role, organization_id, organization_location_id)
     VALUES ($1, $2, $3, 0, 1, $4, $5, $6) RETURNING id`,
    [name.trim(), email.toLowerCase(), hash, role, req.user.organization_id, location_id || null]
  );
  auditLog(result.rows[0].id, 'org_staff_created', { organization_id: req.user.organization_id, created_by: req.user.id, role });
  res.status(201).json({ success: true, id: result.rows[0].id });
});

router.put('/staff/:id', auth, requireOrgAdmin, async (req, res) => {
  const staffMember = await queryOne(
    'SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND org_role IS NOT NULL',
    [req.params.id, req.user.organization_id]
  );
  if (!staffMember) return res.status(404).json({ error: 'Staff member not found.' });

  const { org_role, location_id, is_active } = req.body;
  const newRole   = org_role === 'org_admin' || org_role === 'org_staff' ? org_role : staffMember.org_role;
  const newActive = is_active !== undefined ? (is_active ? 1 : 0) : staffMember.is_active;
  const newLoc    = location_id !== undefined ? (location_id || null) : staffMember.organization_location_id;

  await query(
    'UPDATE users SET org_role = $1, organization_location_id = $2, is_active = $3 WHERE id = $4',
    [newRole, newLoc, newActive, staffMember.id]
  );
  auditLog(req.user.id, 'org_staff_updated', { staff_id: staffMember.id, is_active: newActive });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
router.get('/locations', auth, requireOrgUser, async (req, res) => {
  const locations = await queryAll('SELECT * FROM organization_locations WHERE organization_id = $1 ORDER BY name', [req.user.organization_id]);
  res.json(locations);
});

router.post('/locations', auth, requireOrgAdmin, async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Location name is required.' });
  const result = await query(
    'INSERT INTO organization_locations (organization_id, name, address, phone) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.user.organization_id, name.trim(), address || null, phone || null]
  );
  const location = await queryOne('SELECT * FROM organization_locations WHERE id = $1', [result.rows[0].id]);
  res.status(201).json(location);
});

router.put('/locations/:id', auth, requireOrgAdmin, async (req, res) => {
  const location = await queryOne(
    'SELECT * FROM organization_locations WHERE id = $1 AND organization_id = $2',
    [req.params.id, req.user.organization_id]
  );
  if (!location) return res.status(404).json({ error: 'Location not found.' });
  const { name, address, phone } = req.body;
  await query(
    'UPDATE organization_locations SET name = $1, address = $2, phone = $3 WHERE id = $4',
    [name?.trim() || location.name, address !== undefined ? address : location.address, phone !== undefined ? phone : location.phone, location.id]
  );
  const fresh = await queryOne('SELECT * FROM organization_locations WHERE id = $1', [location.id]);
  res.json(fresh);
});

router.delete('/locations/:id', auth, requireOrgAdmin, async (req, res) => {
  const location = await queryOne(
    'SELECT * FROM organization_locations WHERE id = $1 AND organization_id = $2',
    [req.params.id, req.user.organization_id]
  );
  if (!location) return res.status(404).json({ error: 'Location not found.' });
  await query('DELETE FROM organization_locations WHERE id = $1', [location.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Contacts (add only from the portal; full edit/delete stays an IGHP-admin
// action via /api/admin/organizations for now)
// ---------------------------------------------------------------------------
router.get('/contacts', auth, requireOrgUser, async (req, res) => {
  const contacts = await queryAll('SELECT * FROM organization_contacts WHERE organization_id = $1 ORDER BY name', [req.user.organization_id]);
  res.json(contacts);
});

router.post('/contacts', auth, requireOrgAdmin, async (req, res) => {
  const { name, designation, email, phone, is_billing_contact } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Contact name is required.' });
  const result = await query(
    `INSERT INTO organization_contacts (organization_id, name, designation, email, phone, is_billing_contact)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.organization_id, name.trim(), designation || null, email || null, phone || null, is_billing_contact ? 1 : 0]
  );
  const contact = await queryOne('SELECT * FROM organization_contacts WHERE id = $1', [result.rows[0].id]);
  res.status(201).json(contact);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get('/settings', auth, requireOrgUser, async (req, res) => {
  const org = await queryOne('SELECT id, name, location_visibility_policy FROM organizations WHERE id = $1', [req.user.organization_id]);
  const locations = await queryAll('SELECT * FROM organization_locations WHERE organization_id = $1 ORDER BY name', [req.user.organization_id]);
  res.json({ ...org, locations });
});

router.put('/settings', auth, requireOrgAdmin, async (req, res) => {
  const { location_visibility_policy } = req.body;
  if (!['all_locations', 'own_location'].includes(location_visibility_policy)) {
    return res.status(400).json({ error: 'Invalid location visibility policy.' });
  }
  await query('UPDATE organizations SET location_visibility_policy = $1 WHERE id = $2', [location_visibility_policy, req.user.organization_id]);
  res.json({ success: true });
});

module.exports = router;
