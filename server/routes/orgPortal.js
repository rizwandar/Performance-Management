const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const multer  = require('multer');
const { queryOne, queryAll, query } = require('../db/database');
const auth    = require('../middleware/auth');
const { requireOrgUser, requireOrgAdmin } = require('../middleware/orgAuth');
const { sendEmail } = require('../lib/sendEmail');
const { orgInviteEmail, orgLinkRequestEmail, orgEditConsentRequestEmail, orgReactivationRequestEmail } = require('../lib/emailTemplates');
const { PLAN_LIMITS, PLAN_TIERS, PLAN_RATES, ORG_PRICE_IDS, getActiveRoleCounts, checkRoleQuota } = require('../lib/orgPlanLimits');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');
const { markUserDeceased } = require('../lib/deceased');
const { stripe } = require('../lib/stripe');
const { getOverageConfig } = require('../lib/orgBilling');
const { setAuthCookies } = require('../lib/authCookies');
const { matchesExtension } = require('../lib/fileSignature');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const IGHP_SUPPORT_EMAIL = 'info@ingoodhandsplan.com';

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

  // markUserDeceased handles the users table flag, syncing organization_customers'
  // lifecycle_status, and fanning out to the owner's trusted contacts, people to
  // notify, and (since staff rather than the executor is taking this action) a
  // notice to the executor if one is designated (server/lib/deceased.js).
  await markUserDeceased(customer.user_id, { markedByType: 'org_staff', markedById: req.user.id });

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
  // SEC-09: the org portal is web-only, so the view-as token is handed off
  // the same way a normal login is now - set as the httpOnly session cookie,
  // overwriting the org admin's own token cookie for the duration of the
  // view-as session, rather than returned here for the client to stash in
  // localStorage and swap in manually.
  const csrfToken = setAuthCookies(res, viewAsToken);
  res.json({ customer_name: customerUser?.name, edit_allowed: !!customer.edit_consent, csrf_token: csrfToken });
});

router.post('/view-as/end', auth, async (req, res) => {
  if (!req.isViewAs || !req.actingUser) return res.status(400).json({ error: 'No active view-as session.' });
  auditLog(req.actingUser.id, 'view_as_end', { customer_id: req.user.id });

  // Re-mint the real admin's normal session cookie from their current live
  // row (not the stale claims on the view-as token) so this also picks up
  // anything that changed while they were viewing-as (SEC-10's live-check
  // philosophy) - a deactivated-mid-session admin doesn't get a working
  // session handed back here. Previously the client restored this from a
  // realToken it had stashed in localStorage before the swap; that stash no
  // longer exists (SEC-09), so the server has to do this instead.
  const admin = await queryOne('SELECT * FROM users WHERE id = $1', [req.actingUser.id]);
  if (!admin) return res.status(401).json({ error: 'Your session has expired. Please sign in again.', session_expired: true });

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  const restoredToken = jwt.sign(
    {
      id: admin.id, email: admin.email, is_admin: admin.is_admin,
      org_role: admin.org_role || undefined, organization_id: admin.organization_id || undefined,
      organization_location_id: admin.organization_location_id || undefined,
      sv: admin.session_version ?? 1,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  const csrfToken = setAuthCookies(res, restoredToken);
  res.json({
    success: true,
    csrf_token: csrfToken,
    user: {
      id: admin.id, name: admin.name, email: admin.email, is_admin: admin.is_admin,
      email_verified: admin.email_verified ?? 1, songs_enabled: admin.songs_enabled, bucket_list_enabled: admin.bucket_list_enabled,
      country_code: admin.country_code || null, org_role: admin.org_role || null,
      organization_id: admin.organization_id || null, organization_location_id: admin.organization_location_id || null,
    },
  });
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

  const org = await queryOne('SELECT plan_tier FROM organizations WHERE id = $1', [req.user.organization_id]);
  const quotaError = await checkRoleQuota(req.user.organization_id, org.plan_tier, role);
  if (quotaError) return res.status(403).json({ error: quotaError });

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
  const wantsActive = is_active !== undefined ? !!is_active : null;

  // Reactivating a deactivated account is not self-service (org portal spec,
  // consent/quota decisions): only the IGHP Administrator can do it, so that a
  // deactivated slot reliably frees up room until IGHP explicitly restores it.
  if (wantsActive === true && staffMember.is_active === 0) {
    return res.status(400).json({
      error: 'Reactivation must be requested from the IGHP Administrator. Use the "Request Reactivation" button.',
    });
  }

  const newRole = org_role === 'org_admin' || org_role === 'org_staff' ? org_role : staffMember.org_role;

  // Promoting an active member to a different role (e.g. org_staff -> org_admin)
  // is functionally the same as creating a new member in that role, so it must
  // respect the same plan-tier quota POST /staff enforces.
  if (newRole !== staffMember.org_role && staffMember.is_active === 1) {
    const org = await queryOne('SELECT plan_tier FROM organizations WHERE id = $1', [req.user.organization_id]);
    const quotaError = await checkRoleQuota(req.user.organization_id, org.plan_tier, newRole);
    if (quotaError) return res.status(403).json({ error: quotaError });
  }

  const newActive = wantsActive === false ? 0 : staffMember.is_active;
  const newLoc    = location_id !== undefined ? (location_id || null) : staffMember.organization_location_id;

  await query(
    'UPDATE users SET org_role = $1, organization_location_id = $2, is_active = $3 WHERE id = $4',
    [newRole, newLoc, newActive, staffMember.id]
  );
  auditLog(req.user.id, 'org_staff_updated', { staff_id: staffMember.id, is_active: newActive });
  res.json({ success: true });
});

router.post('/staff/:id/request-reactivation', auth, requireOrgAdmin, async (req, res) => {
  const staffMember = await queryOne(
    'SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND org_role IS NOT NULL',
    [req.params.id, req.user.organization_id]
  );
  if (!staffMember) return res.status(404).json({ error: 'Staff member not found.' });
  if (staffMember.is_active) return res.status(400).json({ error: 'This account is already active.' });

  const org = await queryOne('SELECT name FROM organizations WHERE id = $1', [req.user.organization_id]);
  const requester = await queryOne('SELECT name, email FROM users WHERE id = $1', [req.user.id]);

  try {
    await sendEmail({
      to: IGHP_SUPPORT_EMAIL,
      subject: `Reactivation request: ${staffMember.name} at ${org.name}`,
      html: orgReactivationRequestEmail({
        orgName: org.name,
        staffName: staffMember.name,
        staffEmail: staffMember.email,
        staffRole: staffMember.org_role === 'org_admin' ? 'Org Admin' : 'Org Staff',
        requestedByName: requester.name,
        requestedByEmail: requester.email,
      }),
    });
  } catch (err) {
    console.error('[org-portal] Reactivation request email failed:', err.message);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[org-portal] Non-prod: acknowledging the request despite email delivery failure.');
      return res.json({ success: true, warning: 'Request logged but email not delivered (email not configured for this recipient in dev).' });
    }
    return res.status(500).json({ error: 'Could not send the reactivation request. Please try again shortly.' });
  }

  auditLog(req.user.id, 'org_staff_reactivation_requested', { staff_id: staffMember.id });
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
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.user.organization_id]);
  const locations = await queryAll('SELECT * FROM organization_locations WHERE organization_id = $1 ORDER BY name', [req.user.organization_id]);
  const counts = await getActiveRoleCounts(req.user.organization_id);
  const limits = PLAN_LIMITS[org.plan_tier] || PLAN_LIMITS.starter;
  const overage = await getOverageConfig();
  const rate = org.plan_tier === 'growth'
    ? `$199/month + $${(overage.overageRateCents / 100).toFixed(2)} per active customer beyond ${overage.includedCustomers}`
    : (PLAN_RATES[org.plan_tier] || null);

  res.json({
    ...org,
    business_categories: org.business_categories ? JSON.parse(org.business_categories) : [],
    logo_url: org.logo_url ? await getDownloadUrl(org.logo_url) : null,
    locations,
    limits,
    counts,
    rate,
    overage,
  });
});

// Patch-style: only fields present in the body are updated. A self-registered
// org has no IGHP admin to lean on, so this is how it manages its own profile
// (previously an IGHP-admin-only action via /api/admin/organizations).
router.put('/settings', auth, requireOrgAdmin, async (req, res) => {
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.user.organization_id]);
  const { location_visibility_policy, name, about, business_categories } = req.body;

  if (location_visibility_policy !== undefined && !['all_locations', 'own_location'].includes(location_visibility_policy)) {
    return res.status(400).json({ error: 'Invalid location visibility policy.' });
  }
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Organization name cannot be empty.' });
  }

  const updated = {
    location_visibility_policy: location_visibility_policy !== undefined ? location_visibility_policy : org.location_visibility_policy,
    name: name !== undefined ? name.trim() : org.name,
    about: about !== undefined ? about : org.about,
    business_categories: business_categories !== undefined
      ? JSON.stringify(Array.isArray(business_categories) ? business_categories : [])
      : org.business_categories,
  };

  await query(
    'UPDATE organizations SET location_visibility_policy = $1, name = $2, about = $3, business_categories = $4 WHERE id = $5',
    [updated.location_visibility_policy, updated.name, updated.about, updated.business_categories, req.user.organization_id]
  );
  res.json({ success: true });
});

router.post('/logo', auth, requireOrgAdmin, upload.single('logo'), async (req, res) => {
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.user.organization_id]);
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const mime = req.file.mimetype;
  const ALLOWED = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const ext = ALLOWED[mime];
  if (!ext) return res.status(400).json({ error: 'Only SVG, PNG, JPEG, or WebP logos are accepted.' });
  if (!matchesExtension(req.file.buffer, ext)) {
    return res.status(400).json({ error: "That file's content doesn't match its type. Please check the file and try again." });
  }

  if (org.logo_url) {
    try { await deleteFile(org.logo_url); } catch { /* ignore */ }
  }

  const key = `organizations/${org.id}/logo-${Date.now()}.${ext}`;
  await uploadFile({ key, buffer: req.file.buffer, mimeType: mime });
  await query('UPDATE organizations SET logo_url = $1 WHERE id = $2', [key, org.id]);

  const logoUrl = await getDownloadUrl(key);
  res.json({ success: true, logo_url: logoUrl });
});

// Self-service plan changes. A downgrade is blocked if current active
// admin/staff counts exceed the new tier's limits, so the org is never left
// in a state that violates its own plan.
//
// Three real cases, handled differently:
// - Starter -> paid: no payment method on file yet, needs a real Stripe
//   Checkout session (client redirects to session.url). DB plan_tier flips
//   via the checkout.session.completed webhook, not here.
// - paid -> paid (Professional <-> Growth): a subscription and payment
//   method already exist, just swap the subscription's price with proration.
//   DB plan_tier flips via the resulting customer.subscription.updated
//   webhook.
// - paid -> Starter: cancel_at_period_end, same fairness pattern as the
//   consumer tier (org keeps what it paid for through the current period).
//   DB flips to starter via customer.subscription.deleted once it actually
//   ends.
router.post('/settings/upgrade-plan', auth, requireOrgAdmin, async (req, res) => {
  const { plan_tier } = req.body;
  if (!PLAN_TIERS.includes(plan_tier)) return res.status(400).json({ error: 'Please choose a valid plan.' });

  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.user.organization_id]);
  if (plan_tier === org.plan_tier) return res.status(400).json({ error: 'You are already on this plan.' });

  const newLimits = PLAN_LIMITS[plan_tier];
  const counts = await getActiveRoleCounts(req.user.organization_id);

  if (counts.orgAdmins > newLimits.orgAdmins || counts.orgStaff > newLimits.orgStaff) {
    return res.status(400).json({
      error: `You currently have ${counts.orgAdmins} Org Admin(s) and ${counts.orgStaff} Org Staff, which exceeds the ${plan_tier} plan's limits (${newLimits.orgAdmins} / ${newLimits.orgStaff}). Deactivate accounts down to the new limit before switching.`,
    });
  }

  try {
    if (plan_tier === 'starter') {
      if (!org.stripe_subscription_id) {
        // No real subscription behind the current tier - nothing to cancel, flip directly.
        await query('UPDATE organizations SET plan_tier = $1 WHERE id = $2', ['starter', org.id]);
        await query(
          `INSERT INTO organization_billing_events (organization_id, old_plan_tier, new_plan_tier, rate_snapshot, changed_by_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [org.id, org.plan_tier, 'starter', PLAN_RATES.starter, req.user.id]
        );
        auditLog(req.user.id, 'org_plan_changed', { organization_id: org.id, old_plan_tier: org.plan_tier, new_plan_tier: 'starter' });
        return res.json({ success: true, plan_tier: 'starter' });
      }
      await stripe.subscriptions.update(org.stripe_subscription_id, { cancel_at_period_end: true });
      return res.json({ success: true, message: 'Your plan will move to Starter at the end of the current billing period.' });
    }

    const priceId = ORG_PRICE_IDS[plan_tier];

    if (org.stripe_subscription_id && org.plan_tier !== 'starter') {
      const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      await stripe.subscriptions.update(org.stripe_subscription_id, {
        items: [{ id: subscription.items.data[0].id, price: priceId }],
        proration_behavior: 'create_prorations',
      });
      return res.json({ success: true, message: 'Plan updated.' });
    }

    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: req.user.email,
        metadata: { organization_id: String(org.id) },
      });
      customerId = customer.id;
      await query('UPDATE organizations SET stripe_customer_id = $1 WHERE id = $2', [customerId, org.id]);
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      metadata: { organization_id: String(org.id) },
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { organization_id: String(org.id) } },
      success_url: `${clientUrl}/org/settings?checkout=success`,
      cancel_url: `${clientUrl}/org/settings?checkout=cancelled`,
    });

    res.json({ checkout_url: session.url });
  } catch (err) {
    console.error('[org billing] Plan change failed:', err.message);
    res.status(500).json({ error: 'Could not process the plan change. Please try again.' });
  }
});

module.exports = router;
