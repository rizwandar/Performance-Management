const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const auth    = require('../middleware/auth');
const { getUserPlan } = require('../lib/subscription');

const FREE_SECTION_IDS = new Set([
  'messages',
  'songs-that-define-me',
  'lifes-wishes',
  'how-to-be-remembered',
]);

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
// GET /api/billing/access — sections the current user can access
// ---------------------------------------------------------------------------
router.get('/access', auth, (req, res) => {
  const plan = getUserPlan(req.user.id);
  res.json({ plan, is_premium: plan === 'premium' });
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
        description: 'Start your end-of-life planning at no cost',
        price_monthly: 0,
        price_annual:  0,
        features: [
          'Your Legacy sections (4 sections)',
          'Messages to Loved Ones',
          'Songs That Define Me',
          'My Bucket List',
          'How I\'d Like to Be Remembered',
        ],
      },
      {
        id:          'monthly',
        name:        'Premium Monthly',
        description: 'Full access to all 14 sections, billed monthly',
        price_monthly: 4.99,
        price_annual:  null,
        features: [
          'All 14 planning sections',
          'Vault-encrypted Digital Life',
          'Personal & Legal Documents',
          'Trusted contacts with access permissions',
          'Document uploads',
          'Full PDF export with vault',
          'Inactivity timer',
        ],
        coming_soon: true,
      },
      {
        id:          'annual',
        name:        'Premium Annual',
        description: 'Full access, billed annually (save $30)',
        price_monthly: null,
        price_annual:  29.99,
        features: [
          'Everything in Premium Monthly',
          'Save $30 vs monthly',
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
