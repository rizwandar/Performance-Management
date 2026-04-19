/**
 * Billing & Subscription routes — stub implementation
 *
 * These endpoints define the API surface for the payment system.
 * Actual payment processing (Stripe) will be wired up in a future phase.
 * Schema tables (subscriptions, payment_methods) are already created in database.js.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const auth    = require('../middleware/auth');

// ---------------------------------------------------------------------------
// GET /api/billing/subscription — get current user's subscription status
// ---------------------------------------------------------------------------
router.get('/subscription', auth, (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);

  // Return free plan stub if no subscription record exists yet
  if (!sub) {
    return res.json({
      plan:   'free',
      status: 'active',
      trial_ends_at: null,
      current_period_end: null,
    });
  }

  res.json({
    plan:                 sub.plan,
    status:               sub.status,
    trial_ends_at:        sub.trial_ends_at,
    current_period_start: sub.current_period_start,
    current_period_end:   sub.current_period_end,
    cancelled_at:         sub.cancelled_at,
  });
});

// ---------------------------------------------------------------------------
// GET /api/billing/plans — available subscription plans
// ---------------------------------------------------------------------------
router.get('/plans', (req, res) => {
  res.json({
    plans: [
      {
        id:          'free',
        name:        'Free',
        description: 'Essential end-of-life planning tools',
        price_monthly: 0,
        price_annual:  0,
        features: [
          'Up to 3 sections',
          'Basic PDF export',
        ],
      },
      {
        id:          'monthly',
        name:        'Monthly',
        description: 'Full access, billed monthly',
        price_monthly: 9.99,
        price_annual:  null,
        features: [
          'All 12 sections',
          'Trusted contacts',
          'Document uploads',
          'Full PDF export',
          'Inactivity timer',
        ],
        coming_soon: true,
      },
      {
        id:          'annual',
        name:        'Annual',
        description: 'Full access, billed annually (save 20%)',
        price_monthly: null,
        price_annual:  95.88,
        features: [
          'Everything in Monthly',
          '2 months free',
        ],
        coming_soon: true,
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// POST /api/billing/subscribe — initiate subscription (stub)
// ---------------------------------------------------------------------------
router.post('/subscribe', auth, (req, res) => {
  // TODO: integrate Stripe Checkout or Payment Intents here
  res.status(501).json({
    error: 'Payment processing is not yet available. Coming soon.',
  });
});

// ---------------------------------------------------------------------------
// POST /api/billing/cancel — cancel subscription (stub)
// ---------------------------------------------------------------------------
router.post('/cancel', auth, (req, res) => {
  // TODO: call Stripe subscriptions.cancel and update local record
  res.status(501).json({
    error: 'Subscription management is not yet available. Coming soon.',
  });
});

// ---------------------------------------------------------------------------
// GET /api/billing/payment-methods — list saved payment methods (stub)
// ---------------------------------------------------------------------------
router.get('/payment-methods', auth, (req, res) => {
  // Only last4 and brand are stored — never full card numbers
  const methods = db.prepare(
    'SELECT id, card_brand, card_last4, card_exp_month, card_exp_year, is_default FROM payment_methods WHERE user_id = ?'
  ).all(req.user.id);
  res.json(methods);
});

// ---------------------------------------------------------------------------
// DELETE /api/billing/payment-methods/:id — remove a saved payment method (stub)
// ---------------------------------------------------------------------------
router.delete('/payment-methods/:id', auth, (req, res) => {
  // TODO: call Stripe paymentMethods.detach before deleting locally
  res.status(501).json({
    error: 'Payment method management is not yet available. Coming soon.',
  });
});

module.exports = router;
