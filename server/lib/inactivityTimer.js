const crypto = require('crypto');
const db = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { inactivityReminderEmail, inactivityContactNotificationEmail } = require('./emailTemplates');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const EXPIRES_HOURS = 72;
const RENOTIFY_DAYS = 30; // re-notify trusted contacts every 30 days if owner still inactive

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// Generate an access token for a trusted contact and return the link
function generateAccessLink(contact) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM trusted_contact_tokens WHERE contact_id = ?').run(contact.id);
  db.prepare('INSERT INTO trusted_contact_tokens (contact_id, token, expires_at) VALUES (?, ?, ?)')
    .run(contact.id, token, expiresAt);
  return `${CLIENT_URL}/access/${token}`;
}

// ---------------------------------------------------------------------------
// Notify trusted contacts when the owner's inactivity period has expired
// ---------------------------------------------------------------------------
async function notifyTrustedContacts(user) {
  const contacts = db.prepare(`
    SELECT tc.* FROM trusted_contacts tc
    WHERE tc.user_id = ? AND tc.email IS NOT NULL AND tc.email != ''
  `).all(user.id);

  if (contacts.length === 0) return;

  for (const contact of contacts) {
    const permissions = db.prepare(
      'SELECT section_id FROM trusted_contact_permissions WHERE contact_id = ?'
    ).all(contact.id);
    if (permissions.length === 0) continue; // no sections granted — skip

    const accessLink = generateAccessLink(contact);

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

  db.prepare('UPDATE users SET inactivity_contacts_notified_at = ? WHERE id = ?')
    .run(new Date().toISOString(), user.id);
}

// ---------------------------------------------------------------------------
// Core check — runs daily
// ---------------------------------------------------------------------------

async function checkInactivity() {
  const now = new Date();

  const users = db.prepare(`
    SELECT id, name, email, last_active_at, inactivity_period_months,
           last_reminder_sent_at, inactivity_contacts_notified_at
    FROM users
    WHERE is_admin = 0
      AND inactivity_period_months IS NOT NULL
      AND last_active_at IS NOT NULL
  `).all();

  for (const user of users) {
    try {
      const lastActive = new Date(user.last_active_at);
      const expiresAt  = addMonths(lastActive, user.inactivity_period_months);
      const daysLeft   = daysBetween(now, expiresAt);

      // ── Timer has expired: notify trusted contacts ───────────────────────
      if (daysLeft < 0) {
        const alreadyNotified = user.inactivity_contacts_notified_at
          ? daysBetween(new Date(user.inactivity_contacts_notified_at), now) < RENOTIFY_DAYS
          : false;

        if (!alreadyNotified) {
          await notifyTrustedContacts(user);
        }
        continue;
      }

      // ── Timer still active: send reminder to the user ────────────────────
      const shouldRemind = daysLeft <= 14;
      if (!shouldRemind) continue;

      // Throttle: avoid repeated reminders within the same window
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

      db.prepare('UPDATE users SET last_reminder_sent_at = ? WHERE id = ?')
        .run(now.toISOString(), user.id);

      console.log(`[inactivity] Reminder sent to ${user.email} (${daysLeft} days left)`);
    } catch (err) {
      console.error(`[inactivity] Failed to process user ${user.id}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup — removes expired trusted contact tokens to prevent DB bloat
// ---------------------------------------------------------------------------
function cleanupExpiredTokens() {
  const result = db.prepare(
    "DELETE FROM trusted_contact_tokens WHERE expires_at < datetime('now')"
  ).run();
  if (result.changes > 0) {
    console.log(`[cleanup] Removed ${result.changes} expired trusted contact token(s).`);
  }
}

module.exports = { checkInactivity, cleanupExpiredTokens };
