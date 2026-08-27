const express = require('express');
const router  = express.Router();
const { queryOne, query } = require('../db/database');
const { sendEmail } = require('../lib/sendEmail');
const { executorReportedInviteEmail } = require('../lib/emailTemplates');
const { generateAccessLink } = require('../lib/inactivityTimer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public, unauthenticated: lets anyone who already knows an In Good Hands member
// has passed away report it immediately, rather than waiting for the automatic
// inactivity timer (which can be months) to notify the executor. Always responds
// with the same generic message regardless of whether a match was found, so this
// can't be used to check whether a given email belongs to an account (same
// anti-enumeration pattern as password reset).
const GENERIC_RESPONSE = {
  message: "If this matches an account with a designated Legacy Contact, we've sent them an email with next steps.",
};

router.post('/', async (req, res) => {
  const { owner_email, reporter_name, reporter_email, reporter_relationship, reporter_phone } = req.body;

  if (!owner_email || !EMAIL_RE.test(owner_email)) {
    return res.status(400).json({ error: "Please enter the account holder's email address." });
  }
  if (!reporter_name || !reporter_name.trim()) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (!reporter_email || !EMAIL_RE.test(reporter_email)) {
    return res.status(400).json({ error: 'Please enter your own email address.' });
  }

  try {
    const owner = await queryOne(
      'SELECT id, name, is_deceased FROM users WHERE email = $1',
      [owner_email.toLowerCase().trim()]
    );

    if (owner && !owner.is_deceased) {
      const executor = await queryOne(
        'SELECT id, name, email, is_executor FROM trusted_contacts WHERE user_id = $1 AND is_executor = 1',
        [owner.id]
      );

      if (executor?.email) {
        // REV-13: tagged 'report_death' so a normal login by the (still very
        // much alive) owner afterward revokes this token too - see the login
        // handler in routes/auth.js.
        const accessLink = await generateAccessLink(executor, { source: 'report_death' });
        try {
          await sendEmail({
            to:      executor.email,
            subject: `An update regarding ${owner.name}'s In Good Hands plan`,
            html:    executorReportedInviteEmail({
              recipientName: executor.name,
              ownerName:     owner.name,
              accessLink,
            }),
          });
        } catch (err) {
          console.error(`[report-death] Failed to email executor ${executor.email}:`, err.message);
        }
      }

      await query(
        'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
        [owner.id, 'death_reported', JSON.stringify({
          reporter_name, reporter_email,
          reporter_relationship: reporter_relationship || null,
          reporter_phone:        reporter_phone || null,
          matched_executor: !!executor?.email,
        })]
      );
    } else {
      await query(
        'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
        [owner?.id || null, 'death_reported', JSON.stringify({
          reporter_name, reporter_email, owner_email,
          reporter_relationship: reporter_relationship || null,
          reporter_phone:        reporter_phone || null,
          reason: owner ? 'already_marked_deceased' : 'no_matching_account',
        })]
      );
    }
  } catch (err) {
    console.error('[report-death] Failed:', err.message);
  }

  // Always the same response, whether or not owner_email matched anything.
  res.json(GENERIC_RESPONSE);
});

module.exports = router;
