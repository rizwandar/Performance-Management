const express = require('express');
const router  = express.Router();
const { queryOne, queryAll } = require('../db/database');
const auth    = require('../middleware/auth');
const { getUserPlan } = require('../lib/subscription');
const { stripe, PRICE_IDS } = require('../lib/stripe');

router.get('/subscription', auth, async (req, res) => {
  const sub = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
  if (!sub) {
    return res.json({ plan: 'free', status: 'active', trial_ends_at: null, current_period_end: null });
  }
  res.json({
    plan:                 sub.plan,
    status:               sub.status,
    provider:             sub.provider,
    trial_ends_at:        sub.trial_ends_at,
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
          'Key Contacts',
          'People to Notify',
          'Children and Dependants',
          'Trusted contacts with access permissions',
        ],
      },
      {
        id:            'monthly',
        name:          'Premium Monthly',
        description:   'Full access to all 14 sections, billed monthly',
        price_monthly: 4.99,
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
        description:  'Full access, billed annually (save $30)',
        price_monthly: null,
        price_annual:  29.99,
        features: ['Everything in Premium Monthly', 'Save $30 vs monthly'],
      },
    ],
  });
});

// Creates a Stripe Checkout session for the given plan and returns its
// redirect URL. Reuses the caller's existing Stripe customer if one was
// already created by a prior checkout attempt, rather than creating a
// duplicate customer per attempt.
router.post('/create-checkout-session', auth, async (req, res) => {
  const { plan } = req.body;
  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }

  try {
    const user = await queryOne('SELECT id, email, name FROM users WHERE id = $1', [req.user.id]);
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

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: String(user.id),
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { user_id: String(user.id) } },
      success_url: `${clientUrl}/upgrade?checkout=success`,
      cancel_url: `${clientUrl}/upgrade?checkout=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] Checkout session creation failed:', err.message);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// Cancels at the end of the current billing period rather than immediately,
// so the user keeps access they already paid for. The subscriptions row
// itself is updated by the webhook (source of truth), not here.
router.post('/cancel', auth, async (req, res) => {
  const sub = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
  if (!sub || sub.provider !== 'stripe' || !sub.provider_subscription_id) {
    return res.status(400).json({ error: 'No active paid subscription to cancel.' });
  }
  try {
    await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: true });
    res.json({ message: 'Your subscription will stay active until the end of the current billing period, then it will not renew.' });
  } catch (err) {
    console.error('[billing] Cancel failed:', err.message);
    res.status(500).json({ error: 'Could not cancel your subscription. Please try again or contact support.' });
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
