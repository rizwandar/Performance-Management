const { queryOne, queryAll, query } = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { demiseNotificationEmail, executorNotificationEmail } = require('./emailTemplates');
const { notifyTrustedContacts } = require('./inactivityTimer');

async function auditLog(userId, action, metadata) {
  try {
    await query(
      'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [userId || null, action, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('[audit] Log failed:', err.message);
  }
}

async function notifyPeopleToNotify(user) {
  const people = await queryAll(
    `SELECT name, email FROM people_to_notify WHERE user_id = $1 AND email IS NOT NULL AND email != ''`,
    [user.id]
  );
  for (const person of people) {
    try {
      await sendEmail({
        to:      person.email,
        subject: `An update regarding ${user.name}`,
        html:    demiseNotificationEmail({ recipientName: person.name, ownerName: user.name }),
      });
    } catch (err) {
      console.error(`[deceased] Failed to notify ${person.email}:`, err.message);
    }
  }
}

// Single entry point for marking a user deceased, called from every path that can
// trigger it: the executor confirming via their access link (routes/access.js) and
// funeral-home staff via the org portal (routes/orgPortal.js). Idempotent. This is
// the only place that fans out to the owner's other trusted contacts and people to
// notify - the inactivity timer itself never marks anyone deceased, it only
// notifies the executor first (see notifyExecutor in lib/inactivityTimer.js).
async function markUserDeceased(userId, { markedByType, markedById }) {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error('User not found.');
  if (user.is_deceased) return user;

  await query(
    `UPDATE users SET is_deceased = true, deceased_at = NOW(), deceased_by = $1 WHERE id = $2`,
    [markedByType, userId]
  );

  const orgCustomer = await queryOne(
    'SELECT id FROM organization_customers WHERE user_id = $1',
    [userId]
  );
  if (orgCustomer) {
    await query(
      `UPDATE organization_customers SET lifecycle_status = 'deceased', deceased_at = NOW() WHERE id = $1`,
      [orgCustomer.id]
    );
  }

  await notifyTrustedContacts(user);
  await notifyPeopleToNotify(user);

  // If someone other than the executor made this call (e.g. funeral-home staff),
  // let the designated executor know it has happened. If the executor did this
  // themselves, they already know.
  if (markedByType !== 'executor') {
    const executor = await queryOne(
      `SELECT name, email FROM trusted_contacts WHERE user_id = $1 AND is_executor = 1`,
      [userId]
    );
    if (executor?.email) {
      try {
        await sendEmail({
          to:      executor.email,
          subject: `An update regarding ${user.name}'s In Good Hands plan`,
          html:    executorNotificationEmail({ executorName: executor.name, ownerName: user.name }),
        });
      } catch (err) {
        console.error('[deceased] Executor notification failed:', err.message);
      }
    }
  }

  await auditLog(markedById, 'user_marked_deceased', { user_id: userId, marked_by_type: markedByType });

  return queryOne('SELECT * FROM users WHERE id = $1', [userId]);
}

module.exports = { markUserDeceased, notifyPeopleToNotify };
