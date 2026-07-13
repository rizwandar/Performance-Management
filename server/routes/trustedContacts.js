const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { queryOne, queryAll, query, transaction } = require('../db/database');
const requireAuth = require('../middleware/auth');
const { sendEmail } = require('../lib/sendEmail');
const { contactAccessEmail } = require('../lib/emailTemplates');

const VALID_SECTIONS = new Set([
  'legal_documents', 'financial_items', 'funeral_wishes', 'medical_wishes',
  'people_to_notify', 'property_items', 'personal_messages', 'songs_that_define_me',
  'life_wishes',
]);

router.get('/', requireAuth, async (req, res) => {
  const contacts = await queryAll(
    'SELECT * FROM trusted_contacts WHERE user_id = $1 ORDER BY sequence ASC',
    [req.user.id]
  );
  const result = await Promise.all(contacts.map(async contact => {
    const permissions = (await queryAll(
      'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
      [contact.id]
    )).map(p => p.section_id);
    return { ...contact, visible_sections: permissions };
  }));
  res.json(result);
});

router.post('/', requireAuth, async (req, res) => {
  const { sequence, name, relationship, email, phone, visible_sections = [] } = req.body;

  if (!name)     return res.status(400).json({ error: 'Name is required.' });
  if (!sequence) return res.status(400).json({ error: 'Sequence (1, 2, or 3) is required.' });

  const count = await queryOne('SELECT COUNT(*)::int as c FROM trusted_contacts WHERE user_id = $1', [req.user.id]);
  if (count.c >= 3) return res.status(400).json({ error: 'You can add up to 3 trusted contacts.' });

  const existing = await queryOne(
    'SELECT id FROM trusted_contacts WHERE user_id = $1 AND sequence = $2',
    [req.user.id, sequence]
  );
  if (existing) return res.status(400).json({ error: `Position ${sequence} is already taken.` });

  const contactId = await transaction(async (client) => {
    const r = await client.query(`
      INSERT INTO trusted_contacts (user_id, sequence, name, relationship, email, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [req.user.id, sequence, name, relationship || null, email || null, phone || null]);
    const cid = r.rows[0].id;
    for (const sectionId of visible_sections) {
      await client.query(
        'INSERT INTO trusted_contact_permissions (contact_id, section_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [cid, sectionId]
      );
    }
    return cid;
  });

  const contact = await queryOne('SELECT * FROM trusted_contacts WHERE id = $1', [contactId]);
  res.status(201).json({ ...contact, visible_sections });
});

router.put('/:id', requireAuth, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { name, relationship, email, phone } = req.body;
  await query(`
    UPDATE trusted_contacts SET name = $1, relationship = $2, email = $3, phone = $4 WHERE id = $5
  `, [
    name         ?? contact.name,
    relationship ?? contact.relationship,
    email        ?? contact.email,
    phone        ?? contact.phone,
    contact.id,
  ]);

  const updated     = await queryOne('SELECT * FROM trusted_contacts WHERE id = $1', [contact.id]);
  const permissions = (await queryAll(
    'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
    [contact.id]
  )).map(p => p.section_id);

  res.json({ ...updated, visible_sections: permissions });
});

router.put('/:id/permissions', requireAuth, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { visible_sections = [] } = req.body;
  const invalid = visible_sections.filter(s => !VALID_SECTIONS.has(s));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid section(s): ${invalid.join(', ')}` });
  }

  await transaction(async (client) => {
    await client.query('DELETE FROM trusted_contact_permissions WHERE contact_id = $1', [contact.id]);
    for (const sectionId of visible_sections) {
      await client.query(
        'INSERT INTO trusted_contact_permissions (contact_id, section_id) VALUES ($1, $2)',
        [contact.id, sectionId]
      );
    }
  });

  res.json({ contact_id: contact.id, visible_sections });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  await query('DELETE FROM trusted_contacts WHERE id = $1', [contact.id]);
  res.json({ success: true });
});

router.post('/:id/access-link', requireAuth, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  if (!contact.email) return res.status(400).json({ error: 'This contact has no email address. Please add one first.' });
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(contact.email)) {
    return res.status(400).json({ error: 'This contact has an invalid email address. Please update it before sending a link.' });
  }

  const permissions = await queryAll(
    'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
    [contact.id]
  );
  if (permissions.length === 0) return res.status(400).json({ error: 'Please grant this contact access to at least one section before sending a link.' });

  const EXPIRES_HOURS = 72;
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();

  await query('DELETE FROM trusted_contact_tokens WHERE contact_id = $1', [contact.id]);
  await query(
    'INSERT INTO trusted_contact_tokens (contact_id, token, expires_at) VALUES ($1, $2, $3)',
    [contact.id, token, expiresAt]
  );

  const accessLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/access/${token}`;
  const owner = await queryOne('SELECT name FROM users WHERE id = $1', [req.user.id]);

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
  }

  res.json({ success: true, token, expires_at: expiresAt, access_link: accessLink });
});

module.exports = router;
