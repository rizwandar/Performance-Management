const { queryAll, query } = require('../db/database');
const { stripe } = require('./stripe');
const { sendEmail } = require('./sendEmail');
const { cardExpiringReminderEmail } = require('./emailTemplates');

// BIL-07: warns a subscriber before the card on file for their subscription
// expires, at two fixed points - 14 days and 7 days before the end of the
// card's expiry month. Stripe only exposes exp_month/exp_year for a card
// (no exact day), so "expiry" is treated as the last calendar day of that
// month, matching how card networks actually define validity.
//
// There's no local cache of card expiry (the payment_methods table exists in
// the schema but nothing populates it - a separate, pre-existing gap, not
// fixed here) so this queries Stripe directly for each active subscriber's
// default payment method. Fine at current scale; would need batching/caching
// if the subscriber count grows large enough to make that N Stripe calls/day
// meaningfully slow or costly.
const REMINDER_WINDOWS = [
  { days: 14, column: 'card_expiry_14d_reminder_sent_at' },
  { days: 7,  column: 'card_expiry_7d_reminder_sent_at' },
];

function lastDayOfExpiryMonth(expMonth, expYear) {
  // JS Date's day-0-of-next-month trick gives the last day of expMonth
  // (expMonth is 1-indexed, as Stripe returns it; Date's month param is
  // 0-indexed, so passing expMonth directly already points one month ahead).
  return new Date(expYear, expMonth, 0);
}

function daysUntil(date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date.getTime() - Date.now()) / msPerDay);
}

async function sendCardExpiryReminders() {
  const subs = await queryAll(`
    SELECT id, user_id, provider_subscription_id,
           card_expiry_14d_reminder_sent_at, card_expiry_7d_reminder_sent_at,
           card_expiry_reminder_exp_month, card_expiry_reminder_exp_year,
           u.name, u.email
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE s.provider = 'stripe'
      AND s.status IN ('active', 'trialing')
      AND s.provider_subscription_id IS NOT NULL
  `);

  for (const sub of subs) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(sub.provider_subscription_id, {
        expand: ['default_payment_method'],
      });
      const card = stripeSub.default_payment_method?.card;
      if (!card) continue; // no card on file (e.g. a non-card payment method) - nothing to warn about

      const cardChanged = card.exp_month !== sub.card_expiry_reminder_exp_month
                        || card.exp_year  !== sub.card_expiry_reminder_exp_year;
      if (cardChanged) {
        // New/replaced card - reset both flags so the new card gets its own
        // full reminder cycle, rather than staying silently suppressed
        // because the old card's flags happened to already be set.
        await query(
          `UPDATE subscriptions
           SET card_expiry_reminder_exp_month = $1, card_expiry_reminder_exp_year = $2,
               card_expiry_14d_reminder_sent_at = NULL, card_expiry_7d_reminder_sent_at = NULL
           WHERE id = $3`,
          [card.exp_month, card.exp_year, sub.id]
        );
        sub.card_expiry_14d_reminder_sent_at = null;
        sub.card_expiry_7d_reminder_sent_at = null;
      }

      const daysLeft = daysUntil(lastDayOfExpiryMonth(card.exp_month, card.exp_year));

      for (const { days, column } of REMINDER_WINDOWS) {
        if (daysLeft <= days && daysLeft >= 0 && !sub[column]) {
          await sendEmail({
            to:      sub.email,
            subject: `Your In Good Hands payment card is expiring soon`,
            html:    cardExpiringReminderEmail({
              name:       sub.name,
              daysLeft,
              cardBrand:  card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : null,
              cardLast4:  card.last4,
            }),
          });
          await query(`UPDATE subscriptions SET ${column} = NOW() WHERE id = $1`, [sub.id]);
          console.log(`[billing] Card-expiry (${days}d) reminder sent to ${sub.email}`);
        }
      }
    } catch (err) {
      console.error(`[billing] Card-expiry check failed for subscription ${sub.id}:`, err.message);
    }
  }
}

module.exports = { sendCardExpiryReminders };
