const { queryAll, query } = require('../db/database');
const { sendEmail } = require('./sendEmail');
const { trialEndingReminderEmail } = require('./emailTemplates');
const { PRICE_IDS } = require('./stripe');

const REMINDER_DAYS_BEFORE = 2;
const APP_NAME = 'In Good Hands';

const PLAN_DISPLAY = {
  [PRICE_IDS.monthly]: { name: 'Premium Monthly', price: '$10' },
  [PRICE_IDS.annual]:  { name: 'Premium Annual',  price: '$100' },
};

// BIL-04: fires once per trial, ~2 days before it converts to a paid
// subscription, with a clear cancellation link. trial_reminder_sent_at
// guards against resending on subsequent daily runs once the window
// (trial ending within 2 days) has already been hit.
async function sendTrialReminders() {
  const trials = await queryAll(`
    SELECT s.id, s.user_id, s.trial_ends_at, s.provider_price_id, u.name, u.email
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'trialing'
      AND s.trial_ends_at IS NOT NULL
      AND s.trial_ends_at <= NOW() + INTERVAL '${REMINDER_DAYS_BEFORE} days'
      AND s.trial_reminder_sent_at IS NULL
  `);

  for (const trial of trials) {
    try {
      const display = PLAN_DISPLAY[trial.provider_price_id] || { name: 'Premium', price: 'the plan price' };
      const chargeDate = new Date(trial.trial_ends_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });

      await sendEmail({
        to:      trial.email,
        subject: `Your ${APP_NAME} trial ends in 2 days`,
        html:    trialEndingReminderEmail({
          name:      trial.name,
          planName:  display.name,
          price:     display.price,
          chargeDate,
        }),
      });

      await query('UPDATE subscriptions SET trial_reminder_sent_at = NOW() WHERE id = $1', [trial.id]);
      console.log(`[billing] Trial ending reminder sent to ${trial.email}`);
    } catch (err) {
      console.error(`[billing] Failed to send trial reminder for subscription ${trial.id}:`, err.message);
    }
  }
}

module.exports = { sendTrialReminders };
