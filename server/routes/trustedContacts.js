const express = require('express');
const router  = express.Router();
const { queryOne, queryAll, query, transaction } = require('../db/database');
const requireAuth = require('../middleware/auth');
const checkPlanLock = require('../middleware/planLock');
const { sendEmail } = require('../lib/sendEmail');
const { contactAccessEmail, executorDesignatedEmail } = require('../lib/emailTemplates');
const { generateAccessLink } = require('../lib/inactivityTimer');
const { getLimit } = require('../lib/planLimits');
const { getUserPlan } = require('../lib/subscription');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// OPS-33 (2026-08-27): moved deceased-plan lock from router-wide to per-route
// to prevent blocking legitimate read-shaped POST routes (e.g., viewing vault
// contents, verifying passwords) while still locking all true mutations. Both
// GET and mutating routes here remain locked/protected as appropriate.

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

// The Legacy Contact is one of these rows (is_executor = 1) but it is a
// separate, free allowance and must not consume a trusted contact slot
// (owner's decision, 2026-10-04: a free account holds 1 Legacy Contact,
// 1 emergency contact and 2 trusted contacts). Keeping it in this table was
// deliberate rather than overlooked: every access token, permission and link
// path already works off that row, so splitting the storage would be
// migration risk for no user benefit. Only the counting and the presentation
// changed, which is why every cap query here filters the row out instead of
// the schema separating it.
//
// IS DISTINCT FROM 1 rather than = 0 because is_executor is a nullable
// INTEGER DEFAULT 0 (see db/database.js), so a NULL has to count as an
// ordinary contact. `is_executor = 0` would silently drop such a row from the
// count and quietly hand that account an extra slot.
const ORDINARY_ONLY = 'is_executor IS DISTINCT FROM 1';

// Plan wording deliberately avoids naming the paid tier: the upgrade page is
// where the plan is actually explained. See the matching copy in
// client/src/components/PlanLimitNotice.jsx. Shared between the cheap
// pre-check and the in-transaction guard so both report the same thing.
function capMessage(plan, limit) {
  return plan !== 'premium'
    ? `Your plan includes ${limit} trusted contacts. Upgrade your account if you would like to add more.`
    : `You can add up to ${limit} trusted contacts.`;
}

// Separate wording for the one case where the cap bites on a removal rather
// than an addition: giving up the Legacy Contact role moves that person back
// onto the trusted contacts list, which is an addition to it.
//
// `subject` names whoever is losing the role, because the same refusal is
// reported from the Profile page's spouse checkbox (routes/users.js), where
// the person displaced is either the owner's spouse or the contact who holds
// the role today, not the contact named in the URL. One template with a
// substituted subject rather than a second copy of the sentence, so the
// wording cannot drift between the two routes.
function demoteCapMessage(plan, limit, subject = 'this person') {
  const base = `Removing the Legacy Contact role would move ${subject} back to your trusted contacts, and you already have ${limit}.`;
  return plan !== 'premium'
    ? `${base} Remove a trusted contact first, or upgrade your account if you would like room for more.`
    : `${base} Remove a trusted contact first.`;
}

// The one cap check for "an exempt Legacy Contact row is about to become an
// ordinary contact", shared by every route that can cause that.
//
// It has to be shared rather than copied because the exemption is only safe
// while EVERY such path is guarded. A row that can be converted from exempt
// to ordinary without passing the cap is a free slot generator: designate an
// exempt Legacy Contact, convert them to ordinary, designate another, and the
// ordinary list grows without bound. routes/users.js's spouse checkbox was
// exactly that hole (it moves the role, from two places, and checked
// nothing), so it now calls this.
//
// Returns the refusal sentence, or null when there is room. The caller must
// already hold the owner row lock (SELECT ... FOR UPDATE on users, as the add
// route below does) and must apply the demotion in the same transaction:
// without that, two concurrent saves both read a count with room and both
// demote, which is the same race that once stored 11 contacts against a cap
// of 10.
async function demotionCapRefusal(client, userId, plan, subject) {
  const limit = getLimit('trusted_contacts', plan);
  if (limit === Infinity) return null;
  const ordinary = await client.query(
    `SELECT COUNT(*)::int AS c FROM trusted_contacts WHERE user_id = $1 AND ${ORDINARY_ONLY}`,
    [userId]
  );
  return ordinary.rows[0].c >= limit ? demoteCapMessage(plan, limit, subject) : null;
}

// Tells a newly designated Legacy Contact what the role means right away,
// rather than them finding out only if/when the inactivity timer eventually
// lapses (see executorDesignatedEmail for why this matters: funerals often
// happen within days, so they are also told about the "Report a passing"
// page). Shared by the designate-an-existing-contact route and the
// create-already-designated path, which have to say exactly the same thing.
// Never throws: a failed email must not undo a designation already saved.
async function notifyExecutorDesignated(userId, contact) {
  if (!contact.email) return;
  try {
    const owner = await queryOne('SELECT name, inactivity_period_months FROM users WHERE id = $1', [userId]);
    const previewLink = await generateAccessLink(contact, { purpose: 'executor_preview' });
    await sendEmail({
      to:      contact.email,
      subject: `You have been named ${owner.name}'s Legacy Contact on In Good Hands`,
      html:    executorDesignatedEmail({
        recipientName:          contact.name,
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

router.post('/', requireAuth, checkPlanLock, async (req, res) => {
  const { sequence, name, relationship, email, phone, invite_message, visible_sections = [] } = req.body;

  if (!name) return res.status(400).json({ error: 'Name is required.' });

  // Create the row already designated as Legacy Contact. The Legacy Contact
  // page needs this: a free account whose two trusted contact slots are
  // already full must still be able to name a brand new person as Legacy
  // Contact, which a create-then-promote pair of calls could not do, since the
  // create would be refused by the very cap the role is exempt from. Both
  // `true` and the 1 this column actually stores are accepted, so a future
  // mobile client sending either reaches the same path.
  const asExecutor = req.body.is_executor === true || req.body.is_executor === 1;

  const invalid = visible_sections.filter(s => !VALID_SECTIONS.has(s));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid section(s): ${invalid.join(', ')}` });
  }

  const plan = await getUserPlan(req.user.id);
  const limit = getLimit('trusted_contacts', plan);

  // Every row for this user, the Legacy Contact included: UNIQUE
  // (user_id, sequence) spans them all, so position assignment below has to
  // see that row's position even though the cap does not count it.
  const rows = await queryAll(
    'SELECT sequence, is_executor FROM trusted_contacts WHERE user_id = $1', [req.user.id]
  );
  const taken = rows.map(r => r.sequence);
  const ordinaryCount = rows.filter(r => r.is_executor !== 1).length;

  if (!asExecutor && ordinaryCount >= limit) {
    return res.status(400).json({ error: capMessage(plan, limit) });
  }

  // sequence is optional. It is display order only - nothing in the app
  // reads it as a notification priority or escalation order (the only other
  // readers are two ORDER BY clauses, here and in routes/export.js) - so
  // there is no reason to make the user choose one. When it is omitted we
  // take the lowest free positive position, the same approach already used
  // by the profile spouse-sync path in routes/users.js. An explicit
  // sequence is still accepted so an existing or future client (including
  // mobile, which must keep working against this contract) can send one.
  // Only an absent value means "assign one for me". A supplied 0, '' or any
  // other falsy-but-present value is a client bug, not a request to
  // auto-assign, and is reported rather than silently turned into position 1.
  let position = sequence;
  if (position === undefined || position === null) {
    position = 1;
    while (taken.includes(position)) position += 1;
  } else {
    // Range-check an explicitly supplied position. The dropped
    // CHECK (sequence IN (1,2,3)) used to make this impossible to get wrong;
    // without it an arbitrary client value reaches the column directly, and
    // anything outside int4 (or a non-integer) would surface as a 500 rather
    // than a clear 400. The ceiling is deliberately well above any plan limit
    // rather than equal to it, since an account that dropped from a paid plan
    // can legitimately still hold positions above its current cap.
    if (!Number.isInteger(position) || position < 1 || position > 1000) {
      return res.status(400).json({ error: 'Invalid position.' });
    }
    if (taken.includes(position)) {
      return res.status(400).json({ error: `Position ${position} is already taken.` });
    }
  }

  let contactId;
  try {
    contactId = await transaction(async (client) => {
      // Serialise concurrent adds for THIS user before counting. The
      // conditional INSERT below is not sufficient on its own: under
      // READ COMMITTED, which is Postgres's default, two statements running
      // at the same time each evaluate their count subquery against their own
      // snapshot, so both can observe room for the final slot and both insert.
      // Measured: 20 simultaneous adds against a cap of 10 stored 11 rows.
      // Locking the owner row makes the count authoritative, and costs nothing
      // in the normal case where a person adds one contact at a time. Other
      // users are unaffected, since the lock is on their own row.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);

      // At most one Legacy Contact per owner. The partial unique index
      // trusted_contacts_one_executor enforces that in the database as well,
      // but checking here (under the lock above, so the answer cannot change
      // underneath us) reports it as a sentence rather than a constraint
      // violation. It also closes a cap bypass: without it, creating an exempt
      // Legacy Contact row over and over and letting each new one demote the
      // last would let an account hold any number of ordinary contacts.
      if (asExecutor) {
        const existing = await client.query(
          'SELECT id FROM trusted_contacts WHERE user_id = $1 AND is_executor = 1', [req.user.id]
        );
        if (existing.rowCount > 0) {
          const err = new Error('executor_exists');
          err.executorExists = true;
          throw err;
        }
      }

      // The Legacy Contact row is exempt from the cap, so the in-statement
      // guard is made unreachable for it rather than removed: one INSERT, one
      // place that knows what the cap is.
      const insertCap = asExecutor || limit === Infinity ? Number.MAX_SAFE_INTEGER : limit;
      const r = await client.query(`
        INSERT INTO trusted_contacts (user_id, sequence, name, relationship, email, phone, invite_message, is_executor)
        SELECT $1, $2, $3, $4, $5, $6, $7, $9
        WHERE (SELECT COUNT(*) FROM trusted_contacts WHERE user_id = $1 AND ${ORDINARY_ONLY}) < $8
        RETURNING id
      `, [req.user.id, position, name, relationship || null, email || null, phone || null, invite_message || null,
          insertCap, asExecutor ? 1 : 0]);
      if (r.rowCount === 0) {
        const err = new Error("plan_limit_reached");
        err.planLimitReached = true;
        throw err;
      }
      const cid = r.rows[0].id;
      for (const sectionId of visible_sections) {
        await client.query(
          'INSERT INTO trusted_contact_permissions (contact_id, section_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [cid, sectionId]
        );
      }
      return cid;
    });
  } catch (err) {
    // UNIQUE (user_id, sequence) still guards the table, so two adds racing
    // for the same auto-assigned position lose one insert. Report it as a
    // retryable conflict rather than letting it surface as a 500 with a
    // generic "something went wrong", which is exactly how the old
    // CHECK (sequence IN (1,2,3)) constraint presented itself for years.
    // Lost a race for the last slot against another request from the same
    // account. Same wording as the pre-transaction check above, since from
    // the user's point of view it is the same situation.
    if (err && err.planLimitReached) {
      return res.status(400).json({ error: capMessage(plan, limit) });
    }
    if (err && err.executorExists) {
      return res.status(409).json({ error: 'You already have a Legacy Contact. Remove that role from them first, or name an existing trusted contact instead.' });
    }
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'That position was just taken. Please try again.' });
    }
    throw err;
  }

  const contact = await queryOne('SELECT * FROM trusted_contacts WHERE id = $1', [contactId]);
  if (asExecutor) await notifyExecutorDesignated(req.user.id, contact);
  res.status(201).json({ ...contact, visible_sections });
});

router.put('/:id', requireAuth, checkPlanLock, async (req, res) => {
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

router.put('/:id/permissions', requireAuth, checkPlanLock, async (req, res) => {
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
router.put('/:id/executor', requireAuth, checkPlanLock, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { is_executor } = req.body;
  const plan = await getUserPlan(req.user.id);

  // Set inside the transaction and acted on after it, so the refusal path
  // leaves the transaction to roll back without writing anything.
  let refusal = null;

  await transaction(async (client) => {
    // Owner row lock before counting, same discipline as the add route above
    // and for the same reason: the cap check below and the UPDATEs that act on
    // its answer must see one consistent count, or two concurrent demotions
    // both find room and the account ends up over its allowance.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);

    // Giving up the role moves that person back onto the ordinary trusted
    // contacts list, which is an addition to it, so the cap applies here just
    // as it does when adding one. Refusing is also what keeps the exemption
    // from being farmed: designate an exempt Legacy Contact, demote them,
    // designate another, and an account could hold any number of ordinary
    // contacts.
    //
    // The condition asks whether ANY row holds the role, not whether this one
    // does, because the clearing UPDATE below is blanket. A request naming an
    // ordinary contact with is_executor false still demotes whoever actually
    // holds the role, so keying the check off contact.is_executor let that
    // call grow the ordinary list by one while skipping the check entirely.
    if (!is_executor) {
      const held = await client.query(
        'SELECT id FROM trusted_contacts WHERE user_id = $1 AND is_executor = 1', [req.user.id]
      );
      if (held.rowCount > 0) {
        // Name the person who actually loses the role, which is only the
        // contact in the URL when that contact is the one holding it.
        refusal = await demotionCapRefusal(
          client, req.user.id, plan,
          contact.is_executor ? 'this person' : 'your Legacy Contact'
        );
        if (refusal) return;
      }
    }

    await client.query('UPDATE trusted_contacts SET is_executor = 0 WHERE user_id = $1', [req.user.id]);
    if (is_executor) {
      await client.query('UPDATE trusted_contacts SET is_executor = 1 WHERE id = $1', [contact.id]);
    }
    // Keep the Profile page's "designate my spouse as executor" checkbox
    // (OPS-15) truthful, otherwise saving the profile again would silently
    // re-apply the checkbox's stale state over whatever was just set here.
    //
    // Written unconditionally rather than only when this contact is the linked
    // spouse: the clearing UPDATE above is blanket, so moving the role TO
    // another contact takes it away from the linked spouse too, and leaving
    // the box ticked in that case both lies and makes the next profile save
    // try to take the role back (which, now that the profile path is capped,
    // would refuse an otherwise innocent save).
    await client.query(
      'UPDATE users SET spouse_is_executor = $1 WHERE id = $2',
      [!!is_executor && !!contact.linked_to_profile_spouse, req.user.id]
    );
  });

  if (refusal) return res.status(400).json({ error: refusal });

  const updated = await queryOne('SELECT * FROM trusted_contacts WHERE id = $1', [contact.id]);

  if (is_executor) await notifyExecutorDesignated(req.user.id, updated);

  res.json({ id: updated.id, is_executor: !!updated.is_executor });
});

router.delete('/:id', requireAuth, checkPlanLock, async (req, res) => {
  const contact = await queryOne(
    'SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  await query('DELETE FROM trusted_contacts WHERE id = $1', [contact.id]);
  res.json({ success: true });
});

router.post('/:id/access-link', requireAuth, checkPlanLock, async (req, res) => {
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

// Exported for routes/users.js, whose Profile page spouse checkbox moves the
// Legacy Contact role and therefore has to apply exactly this cap. Same
// pattern routes/billing.js already uses to reach into routes/stripeWebhook.js
// rather than keeping a second copy of shared logic. Nothing here requires
// routes/users.js, so there is no require cycle.
module.exports.demotionCapRefusal = demotionCapRefusal;
