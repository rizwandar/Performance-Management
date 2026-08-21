const express = require('express');
const router  = express.Router();
const { queryOne, queryAll } = require('../db/database');
const auth    = require('../middleware/auth');
const { getUserPlan } = require('../lib/subscription');
const { stripe, PRICE_IDS } = require('../lib/stripe');
const { upsertFromSubscription } = require('./stripeWebhook');

router.get('/subscription', auth, async (req, res) => {
  const user = await queryOne('SELECT trial_used_at FROM users WHERE id = $1', [req.user.id]);
  const sub = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
  if (!sub) {
    return res.json({
      plan: 'free', status: 'active', trial_ends_at: null, current_period_end: null,
      trial_used: !!user?.trial_used_at,
    });
  }
  const planId = Object.entries(PRICE_IDS).find(([, priceId]) => priceId === sub.provider_price_id)?.[0] || null;
  res.json({
    plan:                 sub.plan,
    plan_id:              planId, // 'monthly' | 'annual' | null - which price, not just "premium"
    status:               sub.status,
    provider:             sub.provider,
    trial_ends_at:        sub.trial_ends_at,
    trial_skipped:        sub.trial_skipped,
    trial_used:           !!user?.trial_used_at,
    current_period_start: sub.current_period_start,
    current_period_end:   sub.current_period_end,
    cancelled_at:         sub.cancelled_at,
  });
});

router.get('/access', auth, async (req, res) => {
  const plan = await getUserPlan(req.user.id);
  res.json({ plan, is_premium: plan === 'premium' });
});

router.get('/plans', (req, res) => {
  res.json({
    plans: [
      {
        id:            'free',
        name:          'Free',
        description:   'Start your end-of-life planning at no cost',
        price_monthly: 0,
        price_annual:  0,
        features: [
          "How I'd Like to Be Remembered",
          'Messages to Loved Ones',
          'Songs That Define Me',
          'My Bucket List',
          'Funeral and End-of-Life Wishes',
          'Medical and Care Wishes',
          'Emergency Contact',
          'People to Notify',
          'Your Loved Ones',
          'Pet Care',
          'Trusted contacts with access permissions',
        ],
      },
      {
        id:            'monthly',
        name:          'Premium Monthly',
        description:   'Full access to all 16 sections, billed monthly',
        price_monthly: 10,
        price_annual:  null,
        features: [
          'All free sections',
          'Personal and Legal Documents',
          'Property and Possessions',
          'Financial Affairs',
          'Vault-encrypted Digital Life',
          'Practical Household Information',
          'Document uploads',
          'Full PDF export with vault',
          'Inactivity timer',
        ],
      },
      {
        id:           'annual',
        name:         'Premium Annual',
        description:  'Full access, billed annually (save $20)',
        price_monthly: null,
        price_annual:  100,
        features: ['Everything in Premium Monthly', 'Save $20 vs monthly'],
      },
    ],
  });
});

const TRIAL_DAYS = 14;

// Creates a Stripe Checkout session for the given plan and returns its
// redirect URL. Reuses the caller's existing Stripe customer if one was
// already created by a prior checkout attempt, rather than creating a
// duplicate customer per attempt.
//
// BIL-04: grants a 14-day card-required trial unless the user already had
// one (users.trial_used_at) or explicitly chose to skip it. The card itself
// can't be fingerprint-checked yet at this point - it isn't collected until
// the customer fills out Stripe's hosted page - so the trial is granted
// optimistically here and the one-card-one-trial check happens in the
// checkout.session.completed webhook, after the card is known.
router.post('/create-checkout-session', auth, async (req, res) => {
  const { plan, skipTrial } = req.body;
  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }

  try {
    const user = await queryOne('SELECT id, email, name, trial_used_at FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const existingSub = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
    let customerId = existingSub?.provider === 'stripe' ? existingSub.provider_customer_id : null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { user_id: String(user.id) },
      });
      customerId = customer.id;
    }

    const eligibleForTrial = !skipTrial && !user.trial_used_at;

    const subscriptionData = { metadata: { user_id: String(user.id), trial_skipped: skipTrial ? '1' : '0' } };
    if (eligibleForTrial) {
      subscriptionData.trial_period_days = TRIAL_DAYS;
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: String(user.id),
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      // Collect a card even though nothing is due today during a trial -
      // BIL-04 is explicitly a card-required trial, not a no-card trial.
      // (No custom_text here: this Stripe account has Managed Payments
      // enabled, which rejects custom_text outright - the reassurance copy
      // lives on the Upgrade page instead, right above these buttons.)
      payment_method_collection: 'always',
      // Land on My Profile, not back on the plan-selection page just paid
      // past (IDEA-11) - the Billing & Subscription section there is also
      // where ongoing plan management already lives.
      success_url: `${clientUrl}/profile/settings?checkout=success`,
      cancel_url: `${clientUrl}/upgrade?checkout=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] Checkout session creation failed:', err.message);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// Cancels at the end of the current billing period rather than immediately,
// so the user keeps access they already paid for. The webhook remains the
// source of truth for out-of-band changes (e.g. a dashboard-initiated edit),
// but we also apply Stripe's response here directly - otherwise a client
// re-fetch right after this call can race ahead of the async webhook and
// briefly show stale (pre-cancel) data.
router.post('/cancel', auth, async (req, res) => {
  const sub = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
  if (!sub || sub.provider !== 'stripe' || !sub.provider_subscription_id) {
    return res.status(400).json({ error: 'No active paid subscription to cancel.' });
  }
  try {
    const updated = await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: true });
    await upsertFromSubscription(updated, req.user.id);
    res.json({ message: 'Your subscription will stay active until the end of the current billing period, then it will not renew.' });
  } catch (err) {
    console.error('[billing] Cancel failed:', err.message);
    res.status(500).json({ error: 'Could not cancel your subscription. Please try again or contact support.' });
  }
});

// Undoes a pending cancel_at_period_end before it takes effect. Only works
// while the subscription is still 'active' (i.e. before Stripe actually
// fires customer.subscription.deleted at period end) - past that point the
// subscription is gone and the user needs a fresh checkout instead.
router.post('/reinstate', auth, async (req, res) => {
  const sub = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
  if (!sub || sub.provider !== 'stripe' || !sub.provider_subscription_id) {
    return res.status(400).json({ error: 'No subscription to reinstate.' });
  }
  if (!sub.cancelled_at) {
    return res.status(400).json({ error: 'Your subscription is not currently scheduled to cancel.' });
  }
  try {
    const updated = await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: false });
    await upsertFromSubscription(updated, req.user.id);
    res.json({ message: 'Your premium membership has been reinstated. You will continue to be billed as normal.' });
  } catch (err) {
    console.error('[billing] Reinstate failed:', err.message);
    res.status(500).json({ error: 'Could not reinstate your subscription. Please try again or contact support.' });
  }
});

// Stripe-hosted Billing Portal session, for updating the card on file. Using
// Stripe's own hosted flow rather than building custom card-collection UI
// (Stripe Elements etc.) - avoids taking on PCI-relevant handling for a
// need Stripe already solves, and matches the existing pattern of using
// hosted Stripe Checkout for the original subscription rather than a custom
// payment form. Requires a Billing Portal configuration to exist for this
// Stripe account (set up once in the Stripe Dashboard, or Stripe creates a
// default automatically in test mode on first real use).
router.post('/portal-session', auth, async (req, res) => {
  const sub = await queryOne(
    'SELECT provider, provider_customer_id FROM subscriptions WHERE user_id = $1',
    [req.user.id]
  );
  if (!sub || sub.provider !== 'stripe' || !sub.provider_customer_id) {
    return res.status(400).json({ error: 'No billing account found. Subscribe to a plan first.' });
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.provider_customer_id,
      return_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/profile/settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] Portal session creation failed:', err.message);
    res.status(500).json({ error: 'Could not open the billing portal. Please try again or contact support.' });
  }
});

// Payment history: date, amount charged, and transaction ID per line item
// (WEB-05). Stripe invoices are the source of truth here rather than
// charges, since each subscription renewal produces one invoice with a
// clean paid amount, whereas charges can include uncaptured/failed
// attempts that would be confusing to show as "payment history".
router.get('/history', auth, async (req, res) => {
  const sub = await queryOne(
    'SELECT provider, provider_customer_id FROM subscriptions WHERE user_id = $1',
    [req.user.id]
  );
  if (!sub || sub.provider !== 'stripe' || !sub.provider_customer_id) {
    return res.json({ payments: [] });
  }
  try {
    const invoices = await stripe.invoices.list({ customer: sub.provider_customer_id, limit: 100 });
    const payments = invoices.data
      .filter(inv => inv.amount_paid > 0)
      .map(inv => ({
        id:          inv.id,
        amount:      inv.amount_paid / 100,
        currency:    inv.currency,
        date:        new Date((inv.status_transitions?.paid_at || inv.created) * 1000).toISOString(),
        receipt_url: inv.hosted_invoice_url || null,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ payments });
  } catch (err) {
    console.error('[billing] Payment history fetch failed:', err.message);
    res.status(500).json({ error: 'Could not load your payment history. Please try again.' });
  }
});

router.get('/payment-methods', auth, async (req, res) => {
  const methods = await queryAll(
    'SELECT id, card_brand, card_last4, card_exp_month, card_exp_year, is_default FROM payment_methods WHERE user_id = $1',
    [req.user.id]
  );
  res.json(methods);
});

router.delete('/payment-methods/:id', auth, (req, res) => {
  res.status(501).json({ error: 'Payment method management is not yet available. Coming soon.' });
});

module.exports = router;
