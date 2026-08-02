// Mounted directly in index.js with express.raw(), BEFORE the global
// express.json() middleware — Stripe's signature check needs the raw body.
const { stripe } = require('../lib/stripe');
const { query, queryOne } = require('../db/database');
const { ORG_PRICE_IDS } = require('../lib/orgPlanLimits');
const { countActiveCustomers, getOverageConfig } = require('../lib/orgBilling');

const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_MONTHLY]: 'premium',
  [process.env.STRIPE_PRICE_ANNUAL]:  'premium',
};

const ORG_PRICE_TO_TIER = {
  [ORG_PRICE_IDS.professional]: 'professional',
  [ORG_PRICE_IDS.growth]:       'growth',
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
  const trialSkipped = subscription.metadata?.trial_skipped === '1';

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
        provider_price_id, current_period_start, current_period_end, cancelled_at,
        trial_ends_at, trial_skipped, trial_skipped_at)
     VALUES ($1, $2, $3, 'stripe', $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
       trial_ends_at = EXCLUDED.trial_ends_at,
       trial_skipped = EXCLUDED.trial_skipped,
       trial_skipped_at = EXCLUDED.trial_skipped_at,
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
      toTimestamp(subscription.trial_end),
      trialSkipped,
      trialSkipped ? new Date().toISOString() : null,
    ]
  );

  // Durable "this account has had a trial" flag, set once and never cleared -
  // see the schema comment in database.js for why this can't just live on
  // the subscriptions row.
  if (subscription.trial_end) {
    await query(
      'UPDATE users SET trial_used_at = NOW() WHERE id = $1 AND trial_used_at IS NULL',
      [resolvedUserId]
    );
  }
}

// One-trial-per-person enforcement, card side (BIL-04). Checkout Sessions
// can't check the card fingerprint before granting a trial - the card isn't
// collected until the customer fills out Stripe's hosted page, after the
// session (and its trial_period_days) was already created. So the trial is
// granted optimistically at checkout, and revoked here, right after the card
// is known, if that exact card has already been used for a trial on a
// different account. This is Stripe's own recommended pattern: not a hard
// signup block, the user just doesn't get a second free trial and is
// charged immediately instead.
async function enforceOneTrialPerCard(subscription, userId) {
  const pm = subscription.default_payment_method;
  const fingerprint = pm && typeof pm === 'object' ? pm.card?.fingerprint : null;
  if (!fingerprint) return subscription;

  const priorUse = await queryOne(
    'SELECT user_id FROM used_trial_fingerprints WHERE fingerprint = $1',
    [fingerprint]
  );

  if (priorUse && String(priorUse.user_id) !== String(userId)) {
    console.log(`[billing] Duplicate trial card for user ${userId} (already used for a trial by user ${priorUse.user_id}) - ending trial immediately`);
    await query(
      'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [userId, 'trial_denied_duplicate_card', JSON.stringify({ fingerprint })]
    );
    return stripe.subscriptions.update(subscription.id, { trial_end: 'now' });
  }

  await query(
    'INSERT INTO used_trial_fingerprints (fingerprint, user_id) VALUES ($1, $2) ON CONFLICT (fingerprint) DO NOTHING',
    [fingerprint, userId]
  );
  return subscription;
}

// Orgs going back to Starter (free) on cancellation - Starter has no Stripe
// price, so there's nothing to map the subscription's price to.
async function upsertOrgFromSubscription(subscription, organizationId) {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id;

  let resolvedOrgId = organizationId;
  if (!resolvedOrgId) {
    const existing = await queryOne(
      'SELECT id FROM organizations WHERE stripe_customer_id = $1',
      [subscription.customer]
    );
    resolvedOrgId = existing?.id;
  }
  if (!resolvedOrgId) {
    console.error('[stripe webhook] Could not resolve organization_id for subscription', subscription.id);
    return;
  }

  const org = await queryOne('SELECT plan_tier FROM organizations WHERE id = $1', [resolvedOrgId]);
  const isEnding = subscription.status === 'canceled';
  const newTier = isEnding ? 'starter' : (ORG_PRICE_TO_TIER[priceId] || org.plan_tier);

  await query(
    `UPDATE organizations
     SET plan_tier = $1, stripe_customer_id = $2, stripe_subscription_id = $3, billing_status = $4
     WHERE id = $5`,
    [newTier, subscription.customer, isEnding ? null : subscription.id, subscription.status, resolvedOrgId]
  );

  if (newTier !== org.plan_tier) {
    await query(
      `INSERT INTO organization_billing_events (organization_id, old_plan_tier, new_plan_tier, rate_snapshot)
       VALUES ($1, $2, $3, $4)`,
      [resolvedOrgId, org.plan_tier, newTier, subscription.status]
    );
  }
}

// Fires shortly before Stripe finalizes an org's next invoice. If they're on
// Growth and over their included customer count, add a one-off line item for
// the overage - Stripe automatically sweeps any pending invoice item into the
// invoice that's about to finalize for that customer, no separate metered
// price/usage-reporting setup needed.
async function addGrowthOverageIfNeeded(invoice) {
  const org = await queryOne(
    'SELECT * FROM organizations WHERE stripe_customer_id = $1',
    [invoice.customer]
  );
  if (!org || org.plan_tier !== 'growth') return;

  const [activeCount, { includedCustomers, overageRateCents }] = await Promise.all([
    countActiveCustomers(org.id),
    getOverageConfig(),
  ]);
  const overageCount = Math.max(0, activeCount - includedCustomers);
  if (overageCount === 0) return;

  await stripe.invoiceItems.create({
    customer: invoice.customer,
    currency: 'usd',
    amount: overageCount * overageRateCents,
    description: `${overageCount} customer${overageCount === 1 ? '' : 's'} over the ${includedCustomers} included in Growth ($${(overageRateCents / 100).toFixed(2)}/customer)`,
  });
}

module.exports.upsertFromSubscription = upsertFromSubscription;

module.exports.handler = async (req, res) => {
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
          let subscription = await stripe.subscriptions.retrieve(session.subscription, {
            expand: ['default_payment_method'],
          });
          if (session.metadata?.organization_id) {
            await upsertOrgFromSubscription(subscription, session.metadata.organization_id);
          } else {
            if (subscription.status === 'trialing') {
              subscription = await enforceOneTrialPerCard(subscription, session.client_reference_id);
            }
            await upsertFromSubscription(subscription, session.client_reference_id);
          }
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        if (subscription.metadata?.organization_id) {
          await upsertOrgFromSubscription(subscription, subscription.metadata.organization_id);
        } else {
          await upsertFromSubscription(subscription, subscription.metadata?.user_id);
        }
        break;
      }
      case 'invoice.upcoming': {
        await addGrowthOverageIfNeeded(event.data.object);
        break;
      }
      // invoice.payment_failed needs no explicit handling here: Stripe moves
      // the subscription itself to status 'past_due' and fires
      // customer.subscription.updated for that, which already revokes access
      // via the status check in lib/subscription.js (consumer) / billing_status
      // (org).
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] Handler failed:', err.message, err.stack);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};
