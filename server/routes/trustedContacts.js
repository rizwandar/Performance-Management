const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db/database');
const requireAuth = require('../middleware/auth');
const { sendEmail } = require('../lib/sendEmail');
const { contactAccessEmail } = require('../lib/emailTemplates');

const VALID_SECTIONS = new Set([
  'legal_documents', 'financial_items', 'funeral_wishes', 'medical_wishes',
  'people_to_notify', 'property_items', 'personal_messages', 'songs_that_define_me',
  'life_wishes',
]);

// ---------------------------------------------------------------------------
// GET /api/trusted-contacts
// Returns all trusted contacts for the current user, with their permissions
// ---------------------------------------------------------------------------
router.get('/', requireAuth, (req, res) => {
  const contacts = db.prepare(`
    SELECT * FROM trusted_contacts
    WHERE user_id = ?
    ORDER BY sequence ASC
  `).all(req.user.id);

  // Attach section permissions to each contact
  const result = contacts.map(contact => {
    const permissions = db.prepare(`
      SELECT section_id FROM trusted_contact_permissions WHERE contact_id = ?
    `).all(contact.id).map(p => p.section_id);
    return { ...contact, visible_sections: permissions };
  });

  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/trusted-contacts
// Add a trusted contact (max 3 per user)
// Body: { sequence, name, relationship, email, phone, visible_sections[] }
// ---------------------------------------------------------------------------
router.post('/', requireAuth, (req, res) => {
  const { sequence, name, relationship, email, phone, visible_sections = [] } = req.body;

  if (!name)     return res.status(400).json({ error: 'Name is required.' });
  if (!sequence) return res.status(400).json({ error: 'Sequence (1, 2, or 3) is required.' });

  const count = db.prepare('SELECT COUNT(*) as c FROM trusted_contacts WHERE user_id = ?').get(req.user.id).c;
  if (count >= 3) return res.status(400).json({ error: 'You can add up to 3 trusted contacts.' });

  // Check sequence slot is not already taken
  const existing = db.prepare('SELECT id FROM trusted_contacts WHERE user_id = ? AND sequence = ?').get(req.user.id, sequence);
  if (existing) return res.status(400).json({ error: `Position ${sequence} is already taken.` });

  const insertContact = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO trusted_contacts (user_id, sequence, name, relationship, email, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, sequence, name, relationship || null, email || null, phone || null);

    const contactId = result.lastInsertRowid;

    for (const sectionId of visible_sections) {
      db.prepare(`
        INSERT OR IGNORE INTO trusted_contact_permissions (contact_id, section_id) VALUES (?, ?)
      `).run(contactId, sectionId);
    }

    return contactId;
  });

  const contactId = insertContact();
  const contact = db.prepare('SELECT * FROM trusted_contacts WHERE id = ?').get(contactId);
  res.status(201).json({ ...contact, visible_sections });
});

// ---------------------------------------------------------------------------
// PUT /api/trusted-contacts/:id
// Update a trusted contact's details
// Body: { name, relationship, email, phone }
// ---------------------------------------------------------------------------
router.put('/:id', requireAuth, (req, res) => {
  const contact = db.prepare('SELECT * FROM trusted_contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { name, relationship, email, phone } = req.body;

  db.prepare(`
    UPDATE trusted_contacts
    SET name = ?, relationship = ?, email = ?, phone = ?
    WHERE id = ?
  `).run(
    name        ?? contact.name,
    relationship ?? contact.relationship,
    email        ?? contact.email,
    phone        ?? contact.phone,
    contact.id
  );

  const updated = db.prepare('SELECT * FROM trusted_contacts WHERE id = ?').get(contact.id);
  const permissions = db.prepare('SELECT section_id FROM trusted_contact_permissions WHERE contact_id = ?')
    .all(contact.id).map(p => p.section_id);

  res.json({ ...updated, visible_sections: permissions });
});

// ---------------------------------------------------------------------------
// PUT /api/trusted-contacts/:id/permissions
// Replace all section permissions for a contact
// Body: { visible_sections: ['legal_documents', 'financial_items', ...] }
// ---------------------------------------------------------------------------
router.put('/:id/permissions', requireAuth, (req, res) => {
  const contact = db.prepare('SELECT * FROM trusted_contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { visible_sections = [] } = req.body;
  const invalid = visible_sections.filter(s => !VALID_SECTIONS.has(s));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid section(s): ${invalid.join(', ')}` });
  }

  const updatePermissions = db.transaction(() => {
    db.prepare('DELETE FROM trusted_contact_permissions WHERE contact_id = ?').run(contact.id);
    for (const sectionId of visible_sections) {
      db.prepare(`
        INSERT INTO trusted_contact_permissions (contact_id, section_id) VALUES (?, ?)
      `).run(contact.id, sectionId);
    }
  });

  updatePermissions();
  res.json({ contact_id: contact.id, visible_sections });
});

// ---------------------------------------------------------------------------
// DELETE /api/trusted-contacts/:id
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, (req, res) => {
  const contact = db.prepare('SELECT * FROM trusted_contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  // Permissions are deleted automatically via ON DELETE CASCADE
  db.prepare('DELETE FROM trusted_contacts WHERE id = ?').run(contact.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/trusted-contacts/:id/access-link
// Generate a 72-hour access token and email it to the contact
// ---------------------------------------------------------------------------
router.post('/:id/access-link', requireAuth, async (req, res) => {
  const contact = db.prepare('SELECT * FROM trusted_contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  if (!contact.email) return res.status(400).json({ error: 'This contact has no email address. Please add one first.' });
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(contact.email)) {
    return res.status(400).json({ error: 'This contact has an invalid email address. Please update it before sending a link.' });
  }

  // Check this contact has at least one permitted section
  const permissions = db.prepare('SELECT section_id FROM trusted_contact_permissions WHERE contact_id = ?').all(contact.id);
  if (permissions.length === 0) return res.status(400).json({ error: 'Please grant this contact access to at least one section before sending a link.' });

  const EXPIRES_HOURS = 72;
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();

  // Replace any existing token for this contact
  db.prepare('DELETE FROM trusted_contact_tokens WHERE contact_id = ?').run(contact.id);
  db.prepare(`
    INSERT INTO trusted_contact_tokens (contact_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(contact.id, token, expiresAt);

  const accessLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/access/${token}`;
  const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);

  try {
    await sendEmail({
      to:      contact.email,
      subject: `${owner.name} has shared important information with you via In Good Hands`,
      html:    contactAccessEmail({
        recipientName: contact.name,
        ownerName:     owner.name,
        accessLink,
        expiresHours:  EXPIRES_HOURS,
      }),
    });
  } catch (err) {
    console.error('[trusted-contacts] Email send failed:', err.message);
    // Token is still valid — return it even if email fails
  }

  res.json({ success: true, token, expires_at: expiresAt, access_link: accessLink });
});

module.exports = router;
