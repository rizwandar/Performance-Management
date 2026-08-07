const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { queryOne, queryAll, query, transaction } = require('../db/database');
const auth = require('../middleware/auth');
const { deriveKey, verifyVaultPassword } = require('../lib/vault');
const { deleteFile, getDownloadUrl } = require('../lib/r2');
const { sendEmail } = require('../lib/sendEmail');
const { accountDeletionConfirmEmail, executorDesignatedEmail } = require('../lib/emailTemplates');
const { generateAccessLink } = require('../lib/inactivityTimer');
const { stripe } = require('../lib/stripe');

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev-secret-change-in-production';
const CLIENT_URL  = process.env.CLIENT_URL  || 'http://localhost:5173';

// Account-level changes (password, profile fields, account deletion) are out of
// scope for view-as, which only grants access to the plan's sections. GET /me is
// still allowed since it's used for read-only profile display.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.viewAs) return res.status(403).json({ error: 'Account changes are not available in view-as mode.' });
  } catch { /* an invalid token is left for the route's own requireAuth to reject */ }
  next();
});

router.get('/me', auth, async (req, res) => {
  const user = await queryOne(`
    SELECT id, name, email, date_of_birth, about_me, legacy_message,
           life_story, remembered_for, country_code,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email,
           marital_status, spouse_name, spouse_phone, spouse_email, spouse_is_executor,
           songs_enabled, bucket_list_enabled, is_admin, created_at,
           security_question
    FROM users WHERE id = $1
  `, [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const songs       = await queryAll('SELECT * FROM favourite_songs WHERE user_id = $1 ORDER BY added_at', [user.id]);
  const bucket_list = await queryAll('SELECT * FROM bucket_list_items WHERE user_id = $1 ORDER BY added_at', [user.id]);

  // security_question text is fine to return (it's not sensitive); the answer
  // hash is never selected above in the first place, let alone returned.
  res.json({ ...user, has_security_question: !!user.security_question, songs, bucket_list });
});

// OPS-15: keeps the Profile page's "designate my spouse as executor" checkbox
// in sync with a trusted_contacts row, without duplicating the executor logic
// already in trustedContacts.js. Runs after the users row is saved, using the
// values just written. Only ever touches the one row flagged
// linked_to_profile_spouse for this user, so it never collides with contacts
// the owner added by hand on the Trusted Contacts page (even one that happens
// to also be named after their spouse).
async function syncSpouseExecutor(userId, { marital_status, spouse_name, spouse_email, spouse_phone, spouse_is_executor }) {
  const eligible = ['Married', 'Common-law / Domestic Partner'].includes(marital_status)
    && !!spouse_name && !!spouse_is_executor;

  const linked = await queryOne(
    'SELECT * FROM trusted_contacts WHERE user_id = $1 AND linked_to_profile_spouse = true',
    [userId]
  );

  if (!eligible) {
    // Box unchecked, or the spouse fields no longer apply (e.g. marital
    // status changed). Leave the contact record itself alone, an owner may
    // still want their spouse listed as a contact, just not as executor.
    if (linked && linked.is_executor) {
      await query('UPDATE trusted_contacts SET is_executor = 0 WHERE id = $1', [linked.id]);
    }
    return null;
  }

  if (linked) {
    const wasExecutor = !!linked.is_executor;
    await transaction(async (client) => {
      await client.query('UPDATE trusted_contacts SET is_executor = 0 WHERE user_id = $1', [userId]);
      await client.query(
        `UPDATE trusted_contacts SET name = $1, relationship = $2, email = $3, phone = $4, is_executor = 1 WHERE id = $5`,
        [spouse_name, 'Spouse', spouse_email || null, spouse_phone || null, linked.id]
      );
    });
    // Only report back (and email) if this save is what newly turned the
    // flag on, resaving an already-executor spouse shouldn't re-notify them.
    return wasExecutor ? null : { id: linked.id, name: spouse_name, email: spouse_email || null };
  }

  // No linked contact yet. Trusted Contacts caps at 3 (sequence 1-3); if the
  // owner already used all 3 slots on other people, don't silently fail the
  // whole profile save, just skip the executor sync and tell the client why.
  const count = await queryOne('SELECT COUNT(*)::int as c FROM trusted_contacts WHERE user_id = $1', [userId]);
  if (count.c >= 3) return { blocked: true };

  const taken = new Set(
    (await queryAll('SELECT sequence FROM trusted_contacts WHERE user_id = $1', [userId])).map(r => r.sequence)
  );
  const sequence = [1, 2, 3].find(s => !taken.has(s));

  const newContactId = await transaction(async (client) => {
    await client.query('UPDATE trusted_contacts SET is_executor = 0 WHERE user_id = $1', [userId]);
    const r = await client.query(`
      INSERT INTO trusted_contacts
        (user_id, sequence, name, relationship, email, phone, is_executor, linked_to_profile_spouse)
      VALUES ($1, $2, $3, 'Spouse', $4, $5, 1, true)
      RETURNING id
    `, [userId, sequence, spouse_name, spouse_email || null, spouse_phone || null]);
    return r.rows[0].id;
  });

  return { id: newContactId, name: spouse_name, email: spouse_email || null };
}

router.put('/me', auth, async (req, res) => {
  const { name, email, date_of_birth, about_me, legacy_message,
          life_story, remembered_for,
          emergency_contact_name, emergency_contact_phone, emergency_contact_email,
          marital_status, spouse_name, spouse_phone, spouse_email, spouse_is_executor } = req.body;
  try {
    const existing = await queryOne('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
    await query(`
      UPDATE users SET name=$1, email=$2, date_of_birth=$3, about_me=$4, legacy_message=$5,
        life_story=$6, remembered_for=$7,
        emergency_contact_name=$8, emergency_contact_phone=$9, emergency_contact_email=$10,
        marital_status=$11, spouse_name=$12, spouse_phone=$13, spouse_email=$14,
        spouse_is_executor=$15
      WHERE id=$16
    `, [
      name  ?? existing.name,
      email ?? existing.email,
      date_of_birth || null, about_me || null, legacy_message || null,
      life_story || null, remembered_for || null,
      emergency_contact_name || null, emergency_contact_phone || null,
      emergency_contact_email || null,
      marital_status || null, spouse_name || null, spouse_phone || null, spouse_email || null,
      !!spouse_is_executor,
      req.user.id,
    ]);

    const syncResult = await syncSpouseExecutor(req.user.id, {
      marital_status, spouse_name, spouse_email, spouse_phone, spouse_is_executor,
    });

    const responseExtra = {};
    if (syncResult?.blocked) {
      responseExtra.spouse_executor_blocked = true;
    } else if (syncResult) {
      if (syncResult.email) {
        const owner = await queryOne('SELECT name, inactivity_period_months FROM users WHERE id = $1', [req.user.id]);
        try {
          const previewLink = await generateAccessLink(
            { id: syncResult.id, is_executor: true },
            { purpose: 'executor_preview' }
          );
          await sendEmail({
            to:      syncResult.email,
            subject: `You have been named ${owner.name}'s executor on In Good Hands`,
            html:    executorDesignatedEmail({
              recipientName:          syncResult.name,
              ownerName:              owner.name,
              inactivityPeriodMonths: owner.inactivity_period_months || 12,
              accessLink:             previewLink,
              reportDeathLink:        `${CLIENT_URL}/report-passing`,
            }),
          });
        } catch (err) {
          console.error('[users] Spouse executor designation email failed:', err.message);
        }
      } else {
        responseExtra.spouse_executor_email_skipped = true;
      }
    }

    res.json({ success: true, ...responseExtra });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That email address is already registered to another account.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/me/change-password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Both current and new password are required.' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (!/[A-Z]/.test(new_password))
    return res.status(400).json({ error: 'New password must contain at least one uppercase letter.' });
  if (!/[0-9]/.test(new_password))
    return res.status(400).json({ error: 'New password must contain at least one number.' });

  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Your current password is incorrect.' });

  const hash = bcrypt.hashSync(new_password, 10);
  // Bumping session_version signs out any other active session on its next
  // request - matches the same invalidation-on-password-change behavior as
  // the forgot-password reset flow (SEC-04).
  await query('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [hash, req.user.id]);
  res.json({ success: true });
});

// Normalizing before hashing means "Rex" and " rex " both verify correctly -
// the entropy here is already low, no reason to add whitespace/case as a
// second way for a legitimate user to get locked out of their own answer.
function normalizeSecurityAnswer(answer) {
  return String(answer || '').trim().toLowerCase();
}

// Setting up or changing the security question requires the current account
// password (reauthentication) - this is an additional recovery signal, so
// anyone who could set/replace it without proving they're already the account
// owner could quietly plant their own answer for a future takeover (SEC-05).
router.put('/me/security-question', auth, async (req, res) => {
  const { current_password, question, answer } = req.body;
  if (!current_password) return res.status(400).json({ error: 'Your current password is required to make this change.' });
  if (!question?.trim() || !answer?.trim())
    return res.status(400).json({ error: 'A question and an answer are both required.' });
  if (normalizeSecurityAnswer(answer).length < 3)
    return res.status(400).json({ error: 'Please choose an answer that\'s at least 3 characters.' });

  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Your current password is incorrect.' });

  const answerHash = bcrypt.hashSync(normalizeSecurityAnswer(answer), 10);
  await query(
    'UPDATE users SET security_question = $1, security_answer_hash = $2 WHERE id = $3',
    [question.trim(), answerHash, req.user.id]
  );
  res.json({ success: true });
});

router.delete('/me/security-question', auth, async (req, res) => {
  const { current_password } = req.body;
  if (!current_password) return res.status(400).json({ error: 'Your current password is required to make this change.' });

  const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Your current password is incorrect.' });

  await query('UPDATE users SET security_question = NULL, security_answer_hash = NULL WHERE id = $1', [req.user.id]);
  res.json({ success: true });
});

// A customer can view and revoke their view/edit consent for the organization
// they're linked to at any time (org portal spec, section 10). One org per
// customer at a time, so this is at most a single row.
router.get('/me/org-consent', auth, async (req, res) => {
  const row = await queryOne(
    `SELECT oc.view_consent, oc.view_consent_at, oc.edit_consent, oc.edit_consent_at, o.name as organization_name
     FROM organization_customers oc JOIN organizations o ON o.id = oc.organization_id
     WHERE oc.user_id = $1`,
    [req.user.id]
  );
  res.json(row || null);
});

router.put('/me/org-consent/revoke-view', auth, async (req, res) => {
  const row = await queryOne('SELECT id FROM organization_customers WHERE user_id = $1', [req.user.id]);
  if (!row) return res.status(404).json({ error: 'No organization association found.' });
  await query(
    `UPDATE organization_customers SET view_consent = 0, edit_consent = 0 WHERE id = $1`,
    [row.id]
  );
  await query(
    'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
    [req.user.id, 'org_view_consent_revoked', JSON.stringify({ organization_customer_id: row.id })]
  );
  res.json({ success: true });
});

router.put('/me/org-consent/revoke-edit', auth, async (req, res) => {
  const row = await queryOne('SELECT id FROM organization_customers WHERE user_id = $1', [req.user.id]);
  if (!row) return res.status(404).json({ error: 'No organization association found.' });
  await query(`UPDATE organization_customers SET edit_consent = 0 WHERE id = $1`, [row.id]);
  await query(
    'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
    [req.user.id, 'org_edit_consent_revoked', JSON.stringify({ organization_customer_id: row.id })]
  );
  res.json({ success: true });
});

// Logo-in-interface branding (org portal spec, section 12): a customer linked to
// an organization sees that organization's logo and about text, in addition to
// the site's own branding, not in place of it.
router.get('/me/org-branding', auth, async (req, res) => {
  const org = await queryOne(
    `SELECT o.name, o.about, o.logo_url
     FROM organization_customers oc JOIN organizations o ON o.id = oc.organization_id
     WHERE oc.user_id = $1`,
    [req.user.id]
  );
  if (!org) return res.json(null);
  res.json({
    name: org.name,
    about: org.about,
    logo_url: org.logo_url ? await getDownloadUrl(org.logo_url) : null,
  });
});

router.get('/me/timer', auth, async (req, res) => {
  const user = await queryOne(`
    SELECT last_active_at, inactivity_period_months, last_reminder_sent_at
    FROM users WHERE id = $1
  `, [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const period    = user.inactivity_period_months || 12;
  const rawActive = user.last_active_at;
  const lastActive = rawActive ? new Date(rawActive) : new Date();
  const expiresAt  = new Date(lastActive);
  expiresAt.setMonth(expiresAt.getMonth() + period);
  const msLeft   = expiresAt.getTime() - Date.now();
  const daysLeft = Number.isFinite(msLeft) ? Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24))) : 0;

  res.json({
    last_active_at:           rawActive || new Date().toISOString(),
    inactivity_period_months: period,
    expires_at:               expiresAt.toISOString(),
    days_left:                daysLeft,
    last_reminder_sent_at:    user.last_reminder_sent_at,
  });
});

router.put('/me/timer', auth, async (req, res) => {
  const { inactivity_period_months } = req.body;
  const allowed = [2, 3, 6, 12, 18, 24];
  if (!allowed.includes(Number(inactivity_period_months))) {
    return res.status(400).json({ error: 'Invalid period. Choose from: 2, 3, 6, 12, 18, or 24 months.' });
  }
  await query('UPDATE users SET inactivity_period_months = $1 WHERE id = $2', [inactivity_period_months, req.user.id]);
  res.json({ success: true, inactivity_period_months });
});

router.post('/me/songs', auth, async (req, res) => {
  const { deezer_id, title, artist, album } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'title and artist are required' });

  const user = await queryOne('SELECT songs_enabled FROM users WHERE id = $1', [req.user.id]);
  if (!user.songs_enabled) return res.status(403).json({ error: 'Songs feature is not enabled for your account' });

  const count = await queryOne('SELECT COUNT(*)::int as count FROM favourite_songs WHERE user_id = $1', [req.user.id]);
  if (count.count >= 20) return res.status(400).json({ error: 'Maximum 20 songs allowed' });

  const result = await query(
    'INSERT INTO favourite_songs (user_id, deezer_id, title, artist, album) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.user.id, deezer_id || null, title, artist, album || null]
  );
  res.status(201).json({ id: result.rows[0].id });
});

router.delete('/me/songs/:songId', auth, async (req, res) => {
  await query('DELETE FROM favourite_songs WHERE id = $1 AND user_id = $2', [req.params.songId, req.user.id]);
  res.json({ success: true });
});

router.post('/me/bucket-list', auth, async (req, res) => {
  const { title, description, planning } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const user = await queryOne('SELECT bucket_list_enabled FROM users WHERE id = $1', [req.user.id]);
  if (!user.bucket_list_enabled) return res.status(403).json({ error: 'Bucket list feature is not enabled for your account' });

  const count = await queryOne('SELECT COUNT(*)::int as count FROM bucket_list_items WHERE user_id = $1', [req.user.id]);
  if (count.count >= 50) return res.status(400).json({ error: 'Maximum 50 bucket list items allowed' });

  const result = await query(
    'INSERT INTO bucket_list_items (user_id, title, description, planning) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.user.id, title, description || null, planning || null]
  );
  res.status(201).json({ id: result.rows[0].id });
});

router.delete('/me/bucket-list/:itemId', auth, async (req, res) => {
  await query('DELETE FROM bucket_list_items WHERE id = $1 AND user_id = $2', [req.params.itemId, req.user.id]);
  res.json({ success: true });
});

router.delete('/me', auth, async (req, res) => {
  const { password, vault_password } = req.body;
  if (!password) return res.status(400).json({ error: 'Your account password is required to confirm deletion.' });

  const user = await queryOne('SELECT * FROM users WHERE id = $1 AND is_admin = 0', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password. Please check and try again.' });
  }

  const vault = await queryOne('SELECT check_enc FROM digital_vault WHERE user_id = $1', [user.id]);
  if (vault) {
    if (!vault_password) {
      return res.status(400).json({
        error: 'You have a vault set up. Your vault password is also required to delete your account.',
        requires_vault: true,
      });
    }
    const key = deriveKey(vault_password, user.id);
    if (!verifyVaultPassword(vault.check_enc, key)) {
      return res.status(401).json({ error: 'Incorrect vault password. Please check and try again.' });
    }
  }

  const uploads = await queryAll('SELECT r2_key FROM uploaded_documents WHERE user_id = $1', [user.id]);
  for (const upload of uploads) {
    try { await deleteFile(upload.r2_key); } catch { /* continue */ }
  }

  // A deleted account should never keep being billed. Cancel immediately
  // (not cancel_at_period_end) since there's no account left to retain
  // access for. Never let a Stripe hiccup block the deletion itself.
  const sub = await queryOne('SELECT provider, provider_subscription_id FROM subscriptions WHERE user_id = $1', [user.id]);
  if (sub?.provider === 'stripe' && sub.provider_subscription_id) {
    try {
      await stripe.subscriptions.cancel(sub.provider_subscription_id);
    } catch (e) {
      console.error('[delete-account] Stripe cancellation failed:', e.message);
    }
  }

  await query('DELETE FROM users WHERE id = $1', [user.id]);

  sendEmail({
    to:      user.email,
    subject: 'In Good Hands: Your account has been deleted',
    html:    accountDeletionConfirmEmail({ name: user.name }),
  }).catch(e => console.error('[delete-account] Email failed:', e.message));

  res.json({ success: true });
});

router.post('/me/device-token', auth, async (req, res) => {
  const { token } = req.body;
  await query('UPDATE users SET expo_push_token = $1 WHERE id = $2', [token || null, req.user.id]);
  res.json({ success: true });
});

module.exports = router;
