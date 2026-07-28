// Mounted directly in index.js with express.raw(), BEFORE the global
// express.json() middleware — Stripe's signature check needs the raw body.
const { stripe } = require('../lib/stripe');
const { query, queryOne } = require('../db/database');

const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_MONTHLY]: 'premium',
  [process.env.STRIPE_PRICE_ANNUAL]:  'premium',
};

function toTimestamp(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

async function upsertFromSubscription(subscription, userId) {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const plan = PRICE_TO_PLAN[priceId] || 'premium';
  // Period dates live on the subscription item, not the subscription itself,
  // as of recent Stripe API versions (the older top-level fields were removed).
  const periodStart = item?.current_period_start;
  const periodEnd   = item?.current_period_end;

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const existing = await queryOne(
      'SELECT user_id FROM subscriptions WHERE provider_customer_id = $1',
      [subscription.customer]
    );
    resolvedUserId = existing?.user_id;
  }
  if (!resolvedUserId) {
    console.error('[stripe webhook] Could not resolve user_id for subscription', subscription.id);
    return;
  }

  await query(
    `INSERT INTO subscriptions
       (user_id, plan, status, provider, provider_customer_id, provider_subscription_id,
        provider_price_id, current_period_start, current_period_end, cancelled_at)
     VALUES ($1, $2, $3, 'stripe', $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id) DO UPDATE SET
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       provider = 'stripe',
       provider_customer_id = EXCLUDED.provider_customer_id,
       provider_subscription_id = EXCLUDED.provider_subscription_id,
       provider_price_id = EXCLUDED.provider_price_id,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancelled_at = EXCLUDED.cancelled_at,
       updated_at = NOW()`,
    [
      resolvedUserId,
      plan,
      subscription.status,
      subscription.customer,
      subscription.id,
      priceId || null,
      toTimestamp(periodStart),
      toTimestamp(periodEnd),
      subscription.canceled_at ? toTimestamp(subscription.canceled_at) : null,
    ]
  );
}

module.exports = async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await upsertFromSubscription(subscription, session.client_reference_id);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await upsertFromSubscription(subscription, subscription.metadata?.user_id);
        break;
      }
      // invoice.payment_failed needs no explicit handling here: Stripe moves
      // the subscription itself to status 'past_due' and fires
      // customer.subscription.updated for that, which already revokes access
      // via the status check in lib/subscription.js.
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] Handler failed:', err.message, err.stack);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};
