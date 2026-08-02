const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const { queryOne, queryAll, query } = require('../db/database');
const auth    = require('../middleware/auth');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');
const { checkRoleQuota } = require('../lib/orgPlanLimits');
const { matchesExtension } = require('../lib/fileSignature');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

async function auditLog(userId, action, req, metadata) {
  try {
    await query(
      'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [userId || null, action, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('[audit] Log failed:', err.message);
  }
}

function serializeOrg(org) {
  return {
    ...org,
    business_categories: org.business_categories ? JSON.parse(org.business_categories) : [],
  };
}

router.get('/', auth, adminOnly, async (req, res) => {
  const orgs = await queryAll(`
    SELECT o.*,
           (SELECT COUNT(*)::int FROM organization_locations WHERE organization_id = o.id) as location_count,
           (SELECT COUNT(*)::int FROM organization_customers WHERE organization_id = o.id AND lifecycle_status != 'archived') as active_customer_count,
           (SELECT COUNT(*)::int FROM users WHERE organization_id = o.id AND org_role IS NOT NULL) as staff_count
    FROM organizations o
    ORDER BY o.name
  `);
  res.json(orgs.map(serializeOrg));
});

router.get('/:id', auth, adminOnly, async (req, res) => {
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.params.id]);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const [locations, contacts, staff, billingEvents] = await Promise.all([
    queryAll('SELECT * FROM organization_locations WHERE organization_id = $1 ORDER BY name', [org.id]),
    queryAll('SELECT * FROM organization_contacts WHERE organization_id = $1 ORDER BY name', [org.id]),
    queryAll(
      `SELECT id, name, email, org_role, organization_location_id, is_active, created_at
       FROM users WHERE organization_id = $1 AND org_role IS NOT NULL ORDER BY name`,
      [org.id]
    ),
    queryAll(
      `SELECT be.*, u.name as changed_by_name
       FROM organization_billing_events be LEFT JOIN users u ON u.id = be.changed_by_user_id
       WHERE be.organization_id = $1 ORDER BY be.created_at DESC`,
      [org.id]
    ),
  ]);

  res.json({ ...serializeOrg(org), locations, contacts, staff, billingEvents });
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { name, business_categories, about, plan_tier } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Organization name is required.' });

  const tier = ['starter', 'professional', 'growth'].includes(plan_tier) ? plan_tier : 'starter';
  const categories = Array.isArray(business_categories) ? business_categories : [];

  const result = await query(
    `INSERT INTO organizations (name, business_categories, about, plan_tier)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name.trim(), JSON.stringify(categories), about || null, tier]
  );
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [result.rows[0].id]);
  auditLog(req.user.id, 'organization_created', req, { organization_id: org.id, name: org.name });
  res.status(201).json(serializeOrg(org));
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.params.id]);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const { name, business_categories, about, plan_tier, location_visibility_policy } = req.body;
  const updated = {
    name: name !== undefined ? name.trim() : org.name,
    business_categories: business_categories !== undefined
      ? JSON.stringify(Array.isArray(business_categories) ? business_categories : [])
      : org.business_categories,
    about: about !== undefined ? about : org.about,
    plan_tier: ['starter', 'professional', 'growth'].includes(plan_tier) ? plan_tier : org.plan_tier,
    location_visibility_policy: ['all_locations', 'own_location'].includes(location_visibility_policy)
      ? location_visibility_policy
      : org.location_visibility_policy,
  };

  await query(
    `UPDATE organizations SET name = $1, business_categories = $2, about = $3, plan_tier = $4, location_visibility_policy = $5
     WHERE id = $6`,
    [updated.name, updated.business_categories, updated.about, updated.plan_tier, updated.location_visibility_policy, org.id]
  );
  auditLog(req.user.id, 'organization_updated', req, { organization_id: org.id });
  const fresh = await queryOne('SELECT * FROM organizations WHERE id = $1', [org.id]);
  res.json(serializeOrg(fresh));
});

router.post('/:id/logo', auth, adminOnly, upload.single('logo'), async (req, res) => {
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.params.id]);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });
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

// First Org Admin for a newly created organization (subsequent staff are created
// by that Org Admin themselves via the org portal, not by the IGHP Administrator).
router.post('/:id/admins', auth, adminOnly, async (req, res) => {
  const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.params.id]);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const quotaError = await checkRoleQuota(org.id, org.plan_tier, 'org_admin');
  if (quotaError) return res.status(403).json({ error: quotaError });

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing) return res.status(409).json({ error: 'A user with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, is_admin, email_verified, org_role, organization_id)
     VALUES ($1, $2, $3, 0, 1, 'org_admin', $4) RETURNING id`,
    [name.trim(), email.toLowerCase(), hash, org.id]
  );
  const newId = result.rows[0].id;
  auditLog(newId, 'org_admin_created', req, { organization_id: org.id, created_by_admin_id: req.user.id });
  res.status(201).json({ success: true, id: newId });
});

router.post('/:id/locations', auth, adminOnly, async (req, res) => {
  const org = await queryOne('SELECT id FROM organizations WHERE id = $1', [req.params.id]);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const { name, address, phone } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Location name is required.' });

  const result = await query(
    'INSERT INTO organization_locations (organization_id, name, address, phone) VALUES ($1, $2, $3, $4) RETURNING id',
    [org.id, name.trim(), address || null, phone || null]
  );
  const location = await queryOne('SELECT * FROM organization_locations WHERE id = $1', [result.rows[0].id]);
  res.status(201).json(location);
});

router.put('/:id/locations/:locationId', auth, adminOnly, async (req, res) => {
  const location = await queryOne(
    'SELECT * FROM organization_locations WHERE id = $1 AND organization_id = $2',
    [req.params.locationId, req.params.id]
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

router.delete('/:id/locations/:locationId', auth, adminOnly, async (req, res) => {
  const location = await queryOne(
    'SELECT * FROM organization_locations WHERE id = $1 AND organization_id = $2',
    [req.params.locationId, req.params.id]
  );
  if (!location) return res.status(404).json({ error: 'Location not found.' });
  await query('DELETE FROM organization_locations WHERE id = $1', [location.id]);
  res.json({ success: true });
});

router.post('/:id/contacts', auth, adminOnly, async (req, res) => {
  const org = await queryOne('SELECT id FROM organizations WHERE id = $1', [req.params.id]);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const { name, designation, email, phone, is_billing_contact } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Contact name is required.' });

  const result = await query(
    `INSERT INTO organization_contacts (organization_id, name, designation, email, phone, is_billing_contact)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [org.id, name.trim(), designation || null, email || null, phone || null, is_billing_contact ? 1 : 0]
  );
  const contact = await queryOne('SELECT * FROM organization_contacts WHERE id = $1', [result.rows[0].id]);
  res.status(201).json(contact);
});

router.put('/:id/contacts/:contactId', auth, adminOnly, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM organization_contacts WHERE id = $1 AND organization_id = $2',
    [req.params.contactId, req.params.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { name, designation, email, phone, is_billing_contact } = req.body;
  const willBeBilling = is_billing_contact !== undefined ? !!is_billing_contact : !!contact.is_billing_contact;

  if (contact.is_billing_contact && !willBeBilling) {
    const otherBilling = await queryOne(
      'SELECT id FROM organization_contacts WHERE organization_id = $1 AND is_billing_contact = 1 AND id != $2',
      [req.params.id, contact.id]
    );
    if (!otherBilling) return res.status(400).json({ error: 'At least one billing contact is required per organization.' });
  }

  await query(
    `UPDATE organization_contacts SET name = $1, designation = $2, email = $3, phone = $4, is_billing_contact = $5 WHERE id = $6`,
    [
      name?.trim() || contact.name,
      designation !== undefined ? designation : contact.designation,
      email !== undefined ? email : contact.email,
      phone !== undefined ? phone : contact.phone,
      willBeBilling ? 1 : 0,
      contact.id,
    ]
  );
  const fresh = await queryOne('SELECT * FROM organization_contacts WHERE id = $1', [contact.id]);
  res.json(fresh);
});

router.delete('/:id/contacts/:contactId', auth, adminOnly, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM organization_contacts WHERE id = $1 AND organization_id = $2',
    [req.params.contactId, req.params.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  if (contact.is_billing_contact) {
    const otherBilling = await queryOne(
      'SELECT id FROM organization_contacts WHERE organization_id = $1 AND is_billing_contact = 1 AND id != $2',
      [req.params.id, contact.id]
    );
    if (!otherBilling) return res.status(400).json({ error: 'At least one billing contact is required per organization. Add another before removing this one.' });
  }

  await query('DELETE FROM organization_contacts WHERE id = $1', [contact.id]);
  res.json({ success: true });
});

// Reverting a deceased status is IGHP-Administrator-only, protecting living
// customers from being permanently locked out by a staff error while keeping
// the reversal controlled (org portal spec, section 9).
router.post('/:id/customers/:customerId/revert-deceased', auth, adminOnly, async (req, res) => {
  const customer = await queryOne(
    'SELECT * FROM organization_customers WHERE id = $1 AND organization_id = $2',
    [req.params.customerId, req.params.id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  if (customer.lifecycle_status !== 'deceased') return res.status(400).json({ error: 'This customer is not marked deceased.' });

  await query(
    `UPDATE organization_customers SET lifecycle_status = 'plan_in_progress', deceased_at = NULL WHERE id = $1`,
    [customer.id]
  );
  if (customer.user_id) {
    await query(
      `UPDATE users SET is_deceased = false, deceased_at = NULL, deceased_by = NULL WHERE id = $1`,
      [customer.user_id]
    );
  }
  auditLog(req.user.id, 'deceased_status_reverted', req, { organization_customer_id: customer.id });

  const fresh = await queryOne('SELECT * FROM organization_customers WHERE id = $1', [customer.id]);
  res.json(fresh);
});

// The other half of the reactivation-request loop: an Org Admin can only request
// reactivation (org-portal spec), the IGHP Administrator is the one who actually
// flips it back on, after verifying the emailed request.
router.put('/:id/staff/:staffId/reactivate', auth, adminOnly, async (req, res) => {
  const staffMember = await queryOne(
    'SELECT * FROM users WHERE id = $1 AND organization_id = $2 AND org_role IS NOT NULL',
    [req.params.staffId, req.params.id]
  );
  if (!staffMember) return res.status(404).json({ error: 'Staff member not found.' });
  if (staffMember.is_active) return res.status(400).json({ error: 'This account is already active.' });

  const org = await queryOne('SELECT plan_tier FROM organizations WHERE id = $1', [req.params.id]);
  const quotaError = await checkRoleQuota(req.params.id, org.plan_tier, staffMember.org_role);
  if (quotaError) {
    return res.status(400).json({ error: `Cannot reactivate: ${quotaError} Ask the organization to upgrade its plan first, or deactivate another account in the same role.` });
  }

  await query('UPDATE users SET is_active = 1 WHERE id = $1', [staffMember.id]);
  auditLog(req.user.id, 'org_staff_reactivated', req, { staff_id: staffMember.id, organization_id: req.params.id });
  res.json({ success: true });
});

module.exports = router;
