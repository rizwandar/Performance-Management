const crypto = require('crypto');
const { queryOne, queryAll, query } = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { inactivityReminderEmail, inactivityContactNotificationEmail } = require('./emailTemplates');

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

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

async function generateAccessLink(contact) {
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();
  await query('DELETE FROM trusted_contact_tokens WHERE contact_id = $1', [contact.id]);
  await query(
    'INSERT INTO trusted_contact_tokens (contact_id, token, expires_at) VALUES ($1, $2, $3)',
    [contact.id, token, expiresAt]
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
    const permissions = await queryAll(
      'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = $1',
      [contact.id]
    );
    if (permissions.length === 0) continue;

    const accessLink = await generateAccessLink(contact);
    try {
      await sendEmail({
        to:      contact.email,
        subject: `An important message about ${user.name} from In Good Hands`,
        html:    inactivityContactNotificationEmail({
          recipientName: contact.name,
          ownerName:     user.name,
          accessLink,
          expiresHours:  EXPIRES_HOURS,
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

async function checkInactivity() {
  const now = new Date();

  const users = await queryAll(`
    SELECT id, name, email, last_active_at, inactivity_period_months,
           last_reminder_sent_at, inactivity_contacts_notified_at, expo_push_token
    FROM users
    WHERE is_admin = 0
      AND inactivity_period_months IS NOT NULL
      AND last_active_at IS NOT NULL
  `);

  for (const user of users) {
    try {
      const lastActive = new Date(user.last_active_at);
      const expiresAt  = addMonths(lastActive, user.inactivity_period_months);
      const daysLeft   = daysBetween(now, expiresAt);

      if (daysLeft < 0) {
        const alreadyNotified = user.inactivity_contacts_notified_at
          ? daysBetween(new Date(user.inactivity_contacts_notified_at), now) < RENOTIFY_DAYS
          : false;
        if (!alreadyNotified) await notifyTrustedContacts(user);
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

module.exports = { checkInactivity, cleanupExpiredTokens };
