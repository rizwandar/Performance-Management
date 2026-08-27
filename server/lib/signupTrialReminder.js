const { queryAll, query } = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { signupTrialEndingReminderEmail } = require('./emailTemplates');
const { SIGNUP_TRIAL_DAYS } = require('./subscription');

const APP_NAME = 'In Good Hands';

// BIL-08: reminders for the universal no-card 30-day vault trial every new
// account gets automatically (see subscription.js / auth.js's /register).
// Two fixed checkpoints, each with its own dedupe column on users so the
// daily sweep only ever sends each one once per account - same one-shot
// pattern as BIL-07's card-expiry reminders (cardExpiryReminder.js).
//
// Deliberately separate from BIL-04's sendTrialReminders (trialReminder.js):
// this trial is never tied to Stripe or a card, and users who already have
// an active/trialing paid subscription are excluded below since a reminder
// about the no-card trial ending would be confusing to a paying customer -
// their access was never at risk from this trial window in the first place
// (see getUserPlan in subscription.js for the precedence rule itself).
const REMINDER_WINDOWS = [
  { atDay: 25, daysLeft: SIGNUP_TRIAL_DAYS - 25, column: 'trial_25d_reminder_sent_at' },
  { atDay: 28, daysLeft: SIGNUP_TRIAL_DAYS - 28, column: 'trial_28d_reminder_sent_at' },
];

async function sendSignupTrialReminders() {
  for (const { atDay, daysLeft, column } of REMINDER_WINDOWS) {
    const users = await queryAll(`
      SELECT u.id, u.name, u.email, u.signup_trial_started_at
      FROM users u
      WHERE u.signup_trial_started_at IS NOT NULL
        AND u.${column} IS NULL
        AND u.signup_trial_started_at <= NOW() - INTERVAL '${atDay} days'
        AND u.signup_trial_started_at > NOW() - INTERVAL '${SIGNUP_TRIAL_DAYS} days'
        AND NOT EXISTS (
          -- Every user has a subscriptions row from registration (plan
          -- 'free', status 'active' - see auth.js's /register), so this
          -- must check for a *paid* premium subscription specifically, not
          -- just an active/trialing status row, or it would match nobody.
          SELECT 1 FROM subscriptions s
          WHERE s.user_id = u.id AND s.plan = 'premium' AND s.status IN ('active', 'trialing')
        )
    `);

    for (const user of users) {
      try {
        const trialEndsAt = new Date(
          new Date(user.signup_trial_started_at).getTime() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000
        );
        const endDate = trialEndsAt.toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        });

        await sendEmail({
          to:      user.email,
          subject: `Your ${APP_NAME} trial ends in ${daysLeft} days`,
          html:    signupTrialEndingReminderEmail({ name: user.name, daysLeft, endDate }),
        });

        await query(`UPDATE users SET ${column} = NOW() WHERE id = $1`, [user.id]);
        console.log(`[billing] Signup trial reminder (day ${atDay}) sent to ${user.email}`);
      } catch (err) {
        console.error(`[billing] Signup trial reminder (day ${atDay}) failed for user ${user.id}:`, err.message);
      }
    }
  }
}

module.exports = { sendSignupTrialReminders };
