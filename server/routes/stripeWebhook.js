// Mounted directly in index.js with express.raw(), BEFORE the global
// express.json() middleware — Stripe's signature check needs the raw body.
const { stripe, PRICE_IDS } = require('../lib/stripe');
const { query, queryOne } = require('../db/database');
const { ORG_PRICE_IDS } = require('../lib/orgPlanLimits');
const { countActiveCustomers, getOverageConfig } = require('../lib/orgBilling');
const { sendEmail } = require('../lib/sendEmail');
const {
  paymentConfirmationEmail, refundConfirmationEmail, subscriptionCancelledEmail,
  subscriptionReinstatedEmail, paymentFailedEmail,
} = require('../lib/emailTemplates');

const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_MONTHLY]: 'premium',
  [process.env.STRIPE_PRICE_ANNUAL]:  'premium',
};

const PLAN_DISPLAY = {
  [PRICE_IDS.monthly]: 'Premium Monthly',
  [PRICE_IDS.annual]:  'Premium Annual',
};

const APP_NAME = 'In Good Hands';

// BIL-07: looks up the consumer (non-org) user tied to a Stripe customer id,
// for sending payment/refund/cancellation emails. Returns null for org
// customers (organizations.stripe_customer_id match) - org billing emails
// are a separate, not-yet-built scope, so those are silently skipped here
// rather than misfiring a consumer-styled email.
async function findConsumerUserByCustomerId(customerId) {
  const org = await queryOne('SELECT id FROM organizations WHERE stripe_customer_id = $1', [customerId]);
  if (org) return null;
  return queryOne(
    `SELECT u.id, u.name, u.email, s.provider_price_id
     FROM subscriptions s JOIN users u ON u.id = s.user_id
     WHERE s.provider_customer_id = $1`,
    [customerId]
  );
}

// BIL-07 fix: on a brand-new subscription, Stripe does not guarantee event
// delivery order across event types - invoice.payment_succeeded can arrive
// before checkout.session.completed has finished writing subscriptions.
// provider_customer_id for that customer. When that race happens,
// findConsumerUserByCustomerId above finds no row and the payment
// confirmation email is silently skipped (no error, since the customer
// genuinely isn't linked yet). Falls back to the invoice's own
// customer_email (always present on a Stripe invoice) matched directly
// against users.email - only once the customer id is confirmed not to
// belong to an organization, so this can't misfire a consumer-styled email
// at an org customer's address. Renewals are unaffected either way, since
// by then the subscriptions row has long existed.
async function findConsumerUserForInvoice(invoice) {
  const user = await findConsumerUserByCustomerId(invoice.customer);
  if (user) return user;
  if (!invoice.customer_email) return null;
  const org = await queryOne('SELECT id FROM organizations WHERE stripe_customer_id = $1', [invoice.customer]);
  if (org) return null;
  return queryOne('SELECT id, name, email FROM users WHERE email = $1', [invoice.customer_email]);
}

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

  // Durable "this account has ever actually been Premium" flag, set once and
  // never cleared - see the schema comment in database.js. Covers both the
  // 14-day-trial and the skip-trial-pay-now paths, since both eventually
  // land here with plan resolved to 'premium'.
  if (plan === 'premium') {
    await query(
      'UPDATE users SET premium_used_at = NOW() WHERE id = $1 AND premium_used_at IS NULL',
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

  // REV-11: Stripe delivers events at-least-once, so any event (including
  // invoice.upcoming, which drives the REV-10 org-overage invoice item
  // below) can arrive more than once. Recording event.id here, before any
  // event-specific handling runs, and bailing out on a conflict makes every
  // case in the switch below idempotent in one place, rather than needing a
  // separate dedupe check per case. Return 200 on a duplicate delivery
  // (not an error status) - Stripe interprets anything else as "retry this
  // event again later", which is the opposite of what we want here.
  try {
    await query(
      'INSERT INTO processed_stripe_events (event_id, event_type) VALUES ($1, $2)',
      [event.id, event.type]
    );
  } catch (err) {
    if (err.code === '23505') {
      console.log(`[stripe webhook] Duplicate delivery of event ${event.id} (${event.type}), skipping`);
      return res.json({ received: true });
    }
    console.error('[stripe webhook] Failed to record processed event id:', err.message);
    return res.status(500).json({ error: 'Webhook handler failed' });
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
        const eventSubscription = event.data.object;
        if (eventSubscription.metadata?.organization_id) {
          await upsertOrgFromSubscription(eventSubscription, eventSubscription.metadata.organization_id);
        } else {
          // REV-29: Stripe delivers webhook events at-least-once with no
          // ordering guarantee, so event.data.object can be stale - a
          // retried older "updated" event (status active) arriving after a
          // later "deleted" event could otherwise flip the row back to
          // active here. Re-retrieving the subscription from Stripe right
          // before writing it mirrors the checkout.session.completed
          // handler above: whichever event triggers this block, the write
          // always reflects Stripe's current live state, not whatever this
          // particular event's payload happened to say. Canceled
          // subscriptions stay retrievable on Stripe's side, so this works
          // the same for customer.subscription.deleted too.
          //
          // REV-29 follow-up, resolved by OPS-35: the retrieve() below (and
          // the DB write right after it) are a failure point that did not
          // exist when this handler just read event.data.object directly.
          // event.id was already recorded in processed_stripe_events before
          // this switch ran (REV-11 dedup, above), so a transient failure
          // here (Stripe hiccup, network blip, timeout) needs the dedupe row
          // rolled back or Stripe's retry of the same event.id would hit
          // that dedup short-circuit and get silently skipped, permanently
          // dropping this subscription update (a canceled subscription in
          // particular generates no further event to self-correct with, so
          // the row could get stuck at a stale "active" status
          // indefinitely). That rollback used to be a local try/catch right
          // here; it is now handled generically for every case in this
          // switch by the outer catch block below, so this can just await
          // directly and let a failure propagate there.
          const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
          await upsertFromSubscription(subscription, subscription.metadata?.user_id);

          // BIL-07: confirm the cancellation right away, the moment
          // cancel_at_period_end flips to true (the user clicked Cancel -
          // see POST /billing/cancel), not weeks later when Stripe actually
          // fires subscription.deleted at period end. previous_attributes
          // (only present on .updated events) is what lets this fire exactly
          // once per cancellation request rather than on every unrelated
          // update to the subscription (renewals, plan changes, etc.).
          const wasNotCancelling = event.data.previous_attributes?.cancel_at_period_end === false;
          if (event.type === 'customer.subscription.updated' && wasNotCancelling && subscription.cancel_at_period_end) {
            const user = await findConsumerUserByCustomerId(subscription.customer);
            if (user) {
              const accessUntilDate = new Date(subscription.items.data[0]?.current_period_end * 1000)
                .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              // BIL-08: logged as its own statement (not chained off the email
              // promise below) so the event still lands in the customer's
              // billing history even if the Resend send fails or times out.
              await query(
                'INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, $2, $3)',
                [user.id, 'cancelled', JSON.stringify({ accessUntilDate, stripeRef: subscription.id })]
              ).catch(err => console.error('[stripe webhook] Failed to log cancellation event:', err.message));
              await sendEmail({
                to:      user.email,
                subject: `Your ${APP_NAME} subscription has been cancelled`,
                html:    subscriptionCancelledEmail({ name: user.name, accessUntilDate, stripeRef: subscription.id }),
              }).catch(err => console.error('[stripe webhook] Cancellation email failed:', err.message));
            }
          }

          // Mirror image of the cancellation confirmation above: confirm a
          // reinstatement (POST /billing/reinstate, or the same undo-cancel
          // action from the Stripe-hosted Billing Portal) the moment
          // cancel_at_period_end flips back to false, so the user isn't left
          // wondering whether "reinstated" actually took on Stripe's side.
          const wasCancelling = event.data.previous_attributes?.cancel_at_period_end === true;
          if (event.type === 'customer.subscription.updated' && wasCancelling && !subscription.cancel_at_period_end) {
            const user = await findConsumerUserByCustomerId(subscription.customer);
            if (user) {
              const item = subscription.items.data[0];
              const nextBillingDate = new Date(item?.current_period_end * 1000)
                .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              const price = item?.price?.unit_amount != null
                ? `$${(item.price.unit_amount / 100).toFixed(2)}`
                : null;
              await query(
                'INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, $2, $3)',
                [user.id, 'reinstated', JSON.stringify({ nextBillingDate, price, stripeRef: subscription.id })]
              ).catch(err => console.error('[stripe webhook] Failed to log reinstatement event:', err.message));
              await sendEmail({
                to:      user.email,
                subject: `Your ${APP_NAME} subscription has been reinstated`,
                html:    subscriptionReinstatedEmail({ name: user.name, nextBillingDate, price, stripeRef: subscription.id }),
              }).catch(err => console.error('[stripe webhook] Reinstatement email failed:', err.message));
            }
          }
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        // Fires for every successful charge, first payment and renewals
        // alike - $0 invoices (e.g. the trial-start invoice) are skipped so
        // the user doesn't get a confusing "payment succeeded: $0.00" email,
        // matching the same amount_paid > 0 guard GET /billing/history uses.
        const invoice = event.data.object;
        if (invoice.amount_paid > 0) {
          const user = await findConsumerUserForInvoice(invoice);
          if (user) {
            const chargeDate = new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000)
              .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            // Prefer the invoice's own line-item price (always accurate and
            // present regardless of which lookup path found the user) over
            // user.provider_price_id, which is undefined on the email-fallback
            // path above since that query doesn't join through subscriptions.
            const priceId = invoice.lines?.data?.[0]?.price?.id || user.provider_price_id;
            const amount = `$${(invoice.amount_paid / 100).toFixed(2)}`;
            // BIL-08: logged here too for a complete audit trail, but note
            // GET /billing/history does not re-surface 'payment_succeeded'
            // rows in its merged timeline - that endpoint already lists every
            // paid invoice straight from Stripe, so replaying them here as
            // well would just show each payment twice on the client.
            await query(
              'INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, $2, $3)',
              [user.id, 'payment_succeeded', JSON.stringify({ amount, planName: PLAN_DISPLAY[priceId] || 'Premium', chargeDate, stripeRef: invoice.id })]
            ).catch(err => console.error('[stripe webhook] Failed to log payment_succeeded event:', err.message));
            await sendEmail({
              to:      user.email,
              subject: `Your ${APP_NAME} payment was successful`,
              html:    paymentConfirmationEmail({
                name:        user.name,
                planName:    PLAN_DISPLAY[priceId] || 'Premium',
                price:       amount,
                chargeDate,
                receiptUrl:  invoice.hosted_invoice_url || null,
                stripeRef:   invoice.id,
              }),
            }).catch(err => console.error('[stripe webhook] Payment confirmation email failed:', err.message));
          }
        }
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        const user = await findConsumerUserByCustomerId(charge.customer);
        if (user) {
          const chargeDate = new Date(charge.created * 1000)
            .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const amount = `$${(charge.amount_refunded / 100).toFixed(2)}`;
          await query(
            'INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, $2, $3)',
            [user.id, 'refunded', JSON.stringify({ amount, chargeDate, stripeRef: charge.id })]
          ).catch(err => console.error('[stripe webhook] Failed to log refunded event:', err.message));
          await sendEmail({
            to:      user.email,
            subject: `Your ${APP_NAME} refund has been processed`,
            html:    refundConfirmationEmail({
              name:   user.name,
              amount,
              chargeDate,
              stripeRef: charge.id,
            }),
          }).catch(err => console.error('[stripe webhook] Refund confirmation email failed:', err.message));
        }
        break;
      }
      case 'invoice.upcoming': {
        await addGrowthOverageIfNeeded(event.data.object);
        break;
      }
      // IDEA-13: dunning email. Stripe itself still owns the retry schedule
      // and the eventual past_due -> canceled transition: it moves the
      // subscription to status 'past_due' and fires
      // customer.subscription.updated for that, which already revokes access
      // via the status check in lib/subscription.js (consumer) / billing_status
      // (org) - none of that changes here. This case only adds the
      // previously-missing "your payment failed, please update your card"
      // email, the same gap paymentConfirmationEmail/refundConfirmationEmail/
      // subscriptionCancelledEmail above already closed for their own events.
      // Org billing customers are skipped (findConsumerUserForInvoice returns
      // null for them), matching every other email case in this file - org
      // dunning emails are a separate, not-yet-built scope.
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.amount_due > 0) {
          const user = await findConsumerUserForInvoice(invoice);
          if (user) {
            const priceId = invoice.lines?.data?.[0]?.price?.id || user.provider_price_id;
            const amount = `$${(invoice.amount_due / 100).toFixed(2)}`;
            // next_payment_attempt is null on the final failed attempt (no
            // more retries scheduled, subscription is about to go past_due
            // for good) and set to a future unix timestamp otherwise.
            const nextRetryDate = invoice.next_payment_attempt
              ? new Date(invoice.next_payment_attempt * 1000)
                  .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : null;
            await query(
              'INSERT INTO subscription_events (user_id, event_type, metadata) VALUES ($1, $2, $3)',
              [user.id, 'payment_failed', JSON.stringify({ amount, planName: PLAN_DISPLAY[priceId] || 'Premium', nextRetryDate, stripeRef: invoice.id })]
            ).catch(err => console.error('[stripe webhook] Failed to log payment_failed event:', err.message));
            await sendEmail({
              to:      user.email,
              subject: `Action needed: your ${APP_NAME} payment didn't go through`,
              html:    paymentFailedEmail({
                name:      user.name,
                planName:  PLAN_DISPLAY[priceId] || 'Premium',
                amount,
                nextRetryDate,
                stripeRef: invoice.id,
              }),
            }).catch(err => console.error('[stripe webhook] Payment failed email send failed:', err.message));
          }
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    // OPS-35: event.id was recorded in processed_stripe_events before the
    // switch above ran (REV-11 dedup, above), so a failure partway through
    // any case here (a DB error, a Stripe API call failure, etc.) would
    // otherwise leave the event marked "processed" despite never actually
    // completing. Stripe's automatic retry of that same event.id would then
    // hit the dedup check and get silently skipped as a duplicate,
    // permanently losing whatever that event should have caused, with no
    // error and no retry ever succeeding. Deleting the dedupe row here,
    // generically for every event type, so Stripe's retry is reprocessed
    // cleanly instead of skipped, replaces the narrower per-case version of
    // this same fix that used to live only inside the
    // customer.subscription.updated/deleted case (see the REV-29 comment
    // above).
    await query('DELETE FROM processed_stripe_events WHERE event_id = $1', [event.id])
      .catch(delErr => console.error('[stripe webhook] Failed to roll back dedupe row after processing failure:', delErr.message));
    console.error('[stripe webhook] Handler failed:', err.message, err.stack);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};
