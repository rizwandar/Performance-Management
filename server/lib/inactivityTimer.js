const crypto = require('crypto');
const { queryOne, queryAll, query } = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { inactivityReminderEmail, inactivityContactNotificationEmail, executorInviteEmail } = require('./emailTemplates');

async function sendPushNotification(expoPushToken, title, body) {
  if (!expoPushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: expoPushToken, title, body, sound: 'default' }),
    });
  } catch (err) {
    console.error('[push] Failed to send push notification:', err.message);
  }
}

const CLIENT_URL   = process.env.CLIENT_URL || 'http://localhost:5173';
const EXPIRES_HOURS  = 72;
const RENOTIFY_DAYS  = 30;
const EXECUTOR_PREVIEW_DAYS = 14;

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// Testing-only escape hatch: inactivity_test_override_minutes lets a specific
// user's timer be set to lapse in minutes instead of months, without touching
// the public inactivity_period_months setting or its validation.
function computeExpiresAt(user, lastActive) {
  if (user.inactivity_test_override_minutes) {
    return new Date(lastActive.getTime() + user.inactivity_test_override_minutes * 60 * 1000);
  }
  return addMonths(lastActive, user.inactivity_period_months);
}

// An executor's link never expires (contact.is_executor) - the owner, who'd
// normally be the one to resend an expired link, is by definition unreachable
// once the plan is actually triggered. The other two trusted-contact slots
// keep the original 72-hour window, resendable by the owner at any time.
//
// purpose: 'executor_preview' is the one exception (OPS-20) - the link sent
// immediately alongside executorDesignatedEmail, before anything has actually
// happened. An executor may need this information on short notice for
// funeral/practical arrangements, so they shouldn't have to wait out the full
// inactivity period for any access at all - but this early link must not be
// able to confirm a passing, only the later triggered links (inactivity
// timeout, Report a Passing) can. 14 days, read-only, no demise-confirm.
async function generateAccessLink(contact, { purpose } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  let expiresAt;
  let allowDemiseConfirm = true;
  if (purpose === 'executor_preview') {
    expiresAt = new Date(Date.now() + EXECUTOR_PREVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    allowDemiseConfirm = false;
  } else if (contact.is_executor) {
    expiresAt = null;
  } else {
    expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();
  }
  await query('DELETE FROM trusted_contact_tokens WHERE contact_id = $1', [contact.id]);
  await query(
    'INSERT INTO trusted_contact_tokens (contact_id, token, expires_at, allow_demise_confirm) VALUES ($1, $2, $3, $4)',
    [contact.id, token, expiresAt, allowDemiseConfirm]
  );
  return `${CLIENT_URL}/access/${token}`;
}

async function notifyTrustedContacts(user) {
  const contacts = await queryAll(
    `SELECT tc.* FROM trusted_contacts tc
     WHERE tc.user_id = $1 AND tc.email IS NOT NULL AND tc.email != ''`,
    [user.id]
  );
  if (contacts.length === 0) return;

  for (const contact of contacts) {
    // Sections don't apply to an executor (they get EXECUTOR_SECTIONS
    // regardless, see routes/access.js), so the "at least one granted
    // section" requirement below only makes sense for the other two slots.
    if (!contact.is_executor) {
      const permissions = await queryAll(
        'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
        [contact.id]
      );
      if (permissions.length === 0) continue;
    }

    const accessLink = await generateAccessLink(contact);
    try {
      await sendEmail({
        to:      contact.email,
        subject: `An important message about ${user.name} from In Good Hands`,
        html:    inactivityContactNotificationEmail({
          recipientName: contact.name,
          ownerName:     user.name,
          accessLink,
          expiresHours:  contact.is_executor ? null : EXPIRES_HOURS,
        }),
      });
      console.log(`[inactivity] Notified trusted contact ${contact.email} for user ${user.id}`);
    } catch (err) {
      console.error(`[inactivity] Failed to notify contact ${contact.email}:`, err.message);
    }
  }

  await query(
    'UPDATE users SET inactivity_contacts_notified_at = $1 WHERE id = $2',
    [new Date().toISOString(), user.id]
  );
}

// When a user has designated an executor (one of their up-to-3 trusted contacts,
// see is_executor), the lapsed timer notifies that person only, rather than
// blasting every trusted contact at once. The executor gets full read access
// (still excluding the vault, enforced in routes/access.js) and can confirm the
// owner has passed away, which is what actually triggers notifyTrustedContacts
// and notifyPeopleToNotify (see lib/deceased.js). Users without an executor fall
// back to the original behavior in checkInactivity below.
async function notifyExecutor(user, contact) {
  const accessLink = await generateAccessLink(contact);
  try {
    await sendEmail({
      to:      contact.email,
      subject: `${user.name} has not checked in: action needed as their executor`,
      html:    executorInviteEmail({
        recipientName: contact.name,
        ownerName:     user.name,
        accessLink,
      }),
    });
    console.log(`[inactivity] Notified executor ${contact.email} for user ${user.id}`);
  } catch (err) {
    console.error(`[inactivity] Failed to notify executor ${contact.email}:`, err.message);
  }

  await query(
    'UPDATE users SET inactivity_contacts_notified_at = $1 WHERE id = $2',
    [new Date().toISOString(), user.id]
  );
}

async function checkInactivity() {
  const now = new Date();

  const users = await queryAll(`
    SELECT id, name, email, last_active_at, inactivity_period_months,
           inactivity_test_override_minutes, is_deceased,
           last_reminder_sent_at, inactivity_contacts_notified_at, expo_push_token
    FROM users
    WHERE is_admin = 0
      AND inactivity_period_months IS NOT NULL
      AND last_active_at IS NOT NULL
      AND is_deceased = false
  `);

  for (const user of users) {
    try {
      const lastActive = new Date(user.last_active_at);
      const expiresAt  = computeExpiresAt(user, lastActive);
      const daysLeft   = daysBetween(now, expiresAt);

      if (daysLeft < 0) {
        const alreadyNotified = user.inactivity_contacts_notified_at
          ? daysBetween(new Date(user.inactivity_contacts_notified_at), now) < RENOTIFY_DAYS
          : false;
        if (!alreadyNotified) {
          const executorContact = await queryOne(
            'SELECT * FROM trusted_contacts WHERE user_id = $1 AND is_executor = 1',
            [user.id]
          );
          if (executorContact?.email) {
            await notifyExecutor(user, executorContact);
          } else {
            await notifyTrustedContacts(user);
          }
        }
        continue;
      }

      const shouldRemind = daysLeft <= 14;
      if (!shouldRemind) continue;

      if (user.last_reminder_sent_at) {
        const lastReminder      = new Date(user.last_reminder_sent_at);
        const daysSinceReminder = daysBetween(lastReminder, now);
        if (daysLeft > 7  && daysSinceReminder < 7) continue;
        if (daysLeft > 1  && daysSinceReminder < 3) continue;
        if (daysLeft <= 1 && daysSinceReminder < 1) continue;
      }

      await sendEmail({
        to:      user.email,
        subject: `A gentle reminder from In Good Hands: ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`,
        html:    inactivityReminderEmail({
          name:                   user.name,
          daysLeft,
          inactivityPeriodMonths: user.inactivity_period_months,
        }),
      });

      await sendPushNotification(
        user.expo_push_token,
        'A gentle reminder from In Good Hands',
        daysLeft <= 1
          ? "Please open the app to confirm you're still with us and reset your timer."
          : `Your inactivity timer has ${daysLeft} days remaining. Open the app to reset it.`
      );

      await query(
        'UPDATE users SET last_reminder_sent_at = $1 WHERE id = $2',
        [now.toISOString(), user.id]
      );
      console.log(`[inactivity] Reminder sent to ${user.email} (${daysLeft} days left)`);
    } catch (err) {
      console.error(`[inactivity] Failed to process user ${user.id}:`, err.message);
    }
  }
}

async function cleanupExpiredTokens() {
  const result = await query(
    'DELETE FROM trusted_contact_tokens WHERE expires_at < NOW()'
  );
  if (result.rowCount > 0) {
    console.log(`[cleanup] Removed ${result.rowCount} expired trusted contact token(s).`);
  }
}

module.exports = { checkInactivity, cleanupExpiredTokens, notifyTrustedContacts, generateAccessLink, EXPIRES_HOURS };
