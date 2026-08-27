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

// REV-05 fix: per-row notified_at tracking (like trusted_contacts.deceased_notified_at
// in lib/inactivityTimer.js) so a retry after a partial failure only re-sends to
// people who weren't successfully notified the first time.
async function notifyPeopleToNotify(user) {
  const people = await queryAll(
    `SELECT id, name, email FROM people_to_notify
     WHERE user_id = $1 AND email IS NOT NULL AND email != '' AND notified_at IS NULL`,
    [user.id]
  );
  let sentCount = 0;
  for (const person of people) {
    try {
      await sendEmail({
        to:      person.email,
        subject: `An update regarding ${user.name}`,
        html:    demiseNotificationEmail({ recipientName: person.name, ownerName: user.name }),
      });
      await query('UPDATE people_to_notify SET notified_at = $1 WHERE id = $2', [new Date().toISOString(), person.id]);
      sentCount++;
    } catch (err) {
      console.error(`[deceased] Failed to notify ${person.email}:`, err.message);
    }
  }
  return { sentCount, attempted: people.length, failedCount: people.length - sentCount };
}

// Single entry point for marking a user deceased, called from every path that can
// trigger it: the executor confirming via their access link (routes/access.js) and
// funeral-home staff via the org portal (routes/orgPortal.js). This is the only
// place that fans out to the owner's other trusted contacts and people to notify -
// the inactivity timer itself never marks anyone deceased, it only notifies the
// executor first (see notifyExecutor in lib/inactivityTimer.js).
//
// REV-05 fix: is_deceased used to be both the "mark as deceased" flag AND the
// idempotency guard for the notification fan-out below it, so a call that set
// is_deceased but then had every send fail (a crash, an email provider outage)
// left no way to tell "deceased and notified" apart from "deceased but nobody
// was told" - a retry just hit `if (user.is_deceased) return user;` and silently
// no-op'd instead of finishing the job. deceased_notified_at now tracks fan-out
// completion separately: it's only set once every step below (trusted contacts,
// people to notify, the executor notice) has succeeded with nothing pending.
// A retry re-runs only the steps that still have unnotified recipients, using
// the same per-contact/per-person tracking as notifyTrustedContacts/
// notifyPeopleToNotify - already-succeeded recipients are not re-notified.
async function markUserDeceased(userId, { markedByType, markedById }) {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error('User not found.');
  if (user.is_deceased && user.deceased_notified_at) return user;

  const isRetry = user.is_deceased;

  if (!isRetry) {
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
  }

  const contactsResult = await notifyTrustedContacts(user, { deceasedContext: true });
  const peopleResult   = await notifyPeopleToNotify(user);

  // If someone other than the executor made this call (e.g. funeral-home staff),
  // let the designated executor know it has happened. If the executor did this
  // themselves, they already know. Tracked on its own column so a retry doesn't
  // re-send it once it has already gone out.
  let executorNoticeOk = true;
  if (markedByType !== 'executor' && !user.deceased_executor_notified_at) {
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
        await query('UPDATE users SET deceased_executor_notified_at = $1 WHERE id = $2', [new Date().toISOString(), userId]);
      } catch (err) {
        console.error('[deceased] Executor notification failed:', err.message);
        executorNoticeOk = false;
      }
    }
  }

  const fanOutComplete = contactsResult.failedCount === 0 && peopleResult.failedCount === 0 && executorNoticeOk;
  if (fanOutComplete) {
    await query('UPDATE users SET deceased_notified_at = $1 WHERE id = $2', [new Date().toISOString(), userId]);
  }

  // markedById is a users.id for org_staff (a real admin account) but a
  // trusted_contacts.id for executor (not a users row at all - the FK on
  // user_audit_logs.user_id would reject it). Only pass a real user id through;
  // the contact id is still recorded in metadata either way.
  const auditUserId = markedByType === 'org_staff' ? markedById : null;
  await auditLog(auditUserId, isRetry ? 'user_deceased_notification_retry' : 'user_marked_deceased', {
    user_id: userId, marked_by_type: markedByType, marked_by_id: markedById,
    contacts_notified: contactsResult.sentCount, contacts_failed: contactsResult.failedCount,
    people_notified: peopleResult.sentCount, people_failed: peopleResult.failedCount,
    executor_notice_ok: executorNoticeOk, fan_out_complete: fanOutComplete,
  });

  return queryOne('SELECT * FROM users WHERE id = $1', [userId]);
}

module.exports = { markUserDeceased, notifyPeopleToNotify };
