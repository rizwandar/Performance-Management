const express = require('express');
const router  = express.Router();
const { queryOne, queryAll, query, transaction } = require('../db/database');
const requireAuth = require('../middleware/auth');
const checkPlanLock = require('../middleware/planLock');
const { sendEmail } = require('../lib/sendEmail');
const { contactAccessEmail, executorDesignatedEmail } = require('../lib/emailTemplates');
const { generateAccessLink } = require('../lib/inactivityTimer');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// REV-19 (2026-08-26 review): a deceased user's plan is locked from edits
// (middleware/planLock.js), but this file never checked it, so a locked plan's
// trusted contacts could still be added, renamed, re-permissioned, deleted, or
// re-designated as executor. That is the single worst place to still allow
// edits: whoever holds the session could hand themselves the executor role, or
// grant a contact of their choosing access to sections the owner never shared,
// exactly when the owner can no longer notice. The lock skips GET, so listing
// contacts stays available. POST /:id/access-link is covered too: it mints and
// emails an access token, and after the owner has died the automatic
// inactivity/report-death paths are the ones meant to be sending those.
router.use(checkPlanLock);

// SEC-20 (ported directly to main): legal_documents, financial_items, and
// property_items are vault-protected and must never be grantable as a
// regular trusted-contact permission. See the matching comment in
// routes/access.js.
// IDEA-19: unfinished_business is deliberately added here alongside
// personal_messages, replicating its exact access model (an explicit, scoped
// decision for this section - not a fix to the separate pre-existing gap
// where household_info/digital_life/pets/insurance_items are missing from
// this list, which is left alone; see OPS-30).
// IDEA-32: medical_wishes replaced by doctors + medical_records. donation_bank
// (vault-protected, new to the shared vault) is deliberately excluded, same
// as household_info/digital_credentials, which were never grantable here.
// OPS-30: 'pet-care' and 'insurance_items' were confirmed non-vault-protected
// (see VAULT_PROTECTED_SECTIONS in lib/vaultSections.js) and are added here.
// household_info and digital_life/digital_credentials remain excluded - they
// stay vault-protected and must never appear in this list.
const VALID_SECTIONS = new Set([
  'funeral_wishes', 'doctors', 'medical_records',
  'people_to_notify', 'personal_messages', 'songs_that_define_me',
  'life_wishes', 'children_dependants', 'unfinished_business', 'last_moments',
  'pet-care', 'insurance_items',
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
  const { sequence, name, relationship, email, phone, invite_message, visible_sections = [] } = req.body;

  if (!name)     return res.status(400).json({ error: 'Name is required.' });
  if (!sequence) return res.status(400).json({ error: 'Sequence (1, 2, or 3) is required.' });

  const invalid = visible_sections.filter(s => !VALID_SECTIONS.has(s));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid section(s): ${invalid.join(', ')}` });
  }

  const count = await queryOne('SELECT COUNT(*)::int as c FROM trusted_contacts WHERE user_id = $1', [req.user.id]);
  if (count.c >= 3) return res.status(400).json({ error: 'You can add up to 3 trusted contacts.' });

  const existing = await queryOne(
    'SELECT id FROM trusted_contacts WHERE user_id = $1 AND sequence = $2',
    [req.user.id, sequence]
  );
  if (existing) return res.status(400).json({ error: `Position ${sequence} is already taken.` });

  const contactId = await transaction(async (client) => {
    const r = await client.query(`
      INSERT INTO trusted_contacts (user_id, sequence, name, relationship, email, phone, invite_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [req.user.id, sequence, name, relationship || null, email || null, phone || null, invite_message || null]);
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

  const { name, relationship, email, phone, invite_message } = req.body;
  await query(`
    UPDATE trusted_contacts SET name = $1, relationship = $2, email = $3, phone = $4, invite_message = $5 WHERE id = $6
  `, [
    name         ?? contact.name,
    relationship ?? contact.relationship,
    email        ?? contact.email,
    phone        ?? contact.phone,
    invite_message ?? contact.invite_message,
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

// Sets this contact as the owner's sole executor, clearing the flag from any
// other contact first (the DB also enforces at most one executor per user via
// a partial unique index, but clearing-then-setting here lets the owner freely
// move the flag between their contacts without hitting that constraint).
router.put('/:id/executor', requireAuth, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { is_executor } = req.body;

  await transaction(async (client) => {
    await client.query('UPDATE trusted_contacts SET is_executor = 0 WHERE user_id = $1', [req.user.id]);
    if (is_executor) {
      await client.query('UPDATE trusted_contacts SET is_executor = 1 WHERE id = $1', [contact.id]);
    }
    // Keep the Profile page's "designate my spouse as executor" checkbox
    // (OPS-15) truthful if this contact is the one it's linked to, otherwise
    // saving the profile again would silently re-apply the checkbox's stale
    // state over whatever was just set here.
    if (contact.linked_to_profile_spouse) {
      await client.query('UPDATE users SET spouse_is_executor = $1 WHERE id = $2', [!!is_executor, req.user.id]);
    }
  });

  const updated = await queryOne('SELECT * FROM trusted_contacts WHERE id = $1', [contact.id]);

  // Let the new executor know right away what the role means, rather than them
  // finding out only if/when the inactivity timer eventually lapses (see
  // executorDesignatedEmail for why this matters: funerals often happen within
  // days, so they're also told about the "Report a passing" page).
  if (is_executor && updated.email) {
    const owner = await queryOne('SELECT name, inactivity_period_months FROM users WHERE id = $1', [req.user.id]);
    try {
      const previewLink = await generateAccessLink(updated, { purpose: 'executor_preview' });
      await sendEmail({
        to:      updated.email,
        subject: `You have been named ${owner.name}'s Legacy Contact on In Good Hands`,
        html:    executorDesignatedEmail({
          recipientName:          updated.name,
          ownerName:              owner.name,
          inactivityPeriodMonths: owner.inactivity_period_months || 12,
          accessLink:             previewLink,
          reportDeathLink:        `${CLIENT_URL}/report-passing`,
        }),
      });
    } catch (err) {
      console.error('[trusted-contacts] Executor designation email failed:', err.message);
    }
  }

  res.json({ id: updated.id, is_executor: !!updated.is_executor });
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

  // An executor's access link ignores individually-granted permissions
  // entirely and gets EXECUTOR_SECTIONS (see routes/access.js), so the
  // "at least one section" requirement below only makes sense for a
  // non-executor contact - an executor with zero individually-granted
  // sections is still fully entitled to a link.
  if (!contact.is_executor) {
    const permissions = await queryAll(
      'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
      [contact.id]
    );
    if (permissions.length === 0) return res.status(400).json({ error: 'Please grant this contact access to at least one section before sending a link.' });
  }

  // Reuses the same helper the automatic inactivity/report-death paths use,
  // so an executor's manually-sent link is non-expiring for the same reason
  // theirs are: sections don't apply to them, and once they're the one being
  // relied on, there may be no one left to resend an expired link.
  const accessLink = await generateAccessLink(contact);
  const owner = await queryOne('SELECT name FROM users WHERE id = $1', [req.user.id]);

  try {
    await sendEmail({
      to:      contact.email,
      subject: `${owner.name} has shared important information with you via In Good Hands`,
      html:    contactAccessEmail({
        recipientName: contact.name,
        ownerName:     owner.name,
        accessLink,
        expiresHours:  contact.is_executor ? null : 72,
        personalMessage: contact.invite_message || null,
      }),
    });
  } catch (err) {
    console.error('[trusted-contacts] Email send failed:', err.message);
  }

  const tokenRow = await queryOne('SELECT token, expires_at FROM trusted_contact_tokens WHERE contact_id = $1', [contact.id]);
  res.json({ success: true, token: tokenRow.token, expires_at: tokenRow.expires_at, access_link: accessLink });
});

module.exports = router;
