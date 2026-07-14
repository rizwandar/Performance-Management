const express = require('express');
const router  = express.Router();
const { queryOne, queryAll } = require('../db/database');
const auth    = require('../middleware/auth');
const { getUserPlan } = require('../lib/subscription');

router.get('/subscription', auth, async (req, res) => {
  const sub = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
  if (!sub) {
    return res.json({ plan: 'free', status: 'active', trial_ends_at: null, current_period_end: null });
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
        coming_soon: true,
      },
      {
        id:           'annual',
        name:         'Premium Annual',
        description:  'Full access, billed annually (save $30)',
        price_monthly: null,
        price_annual:  29.99,
        features: ['Everything in Premium Monthly', 'Save $30 vs monthly'],
        coming_soon: true,
      },
    ],
  });
});

router.post('/subscribe', auth, (req, res) => {
  res.status(501).json({ error: 'Payment processing is not yet available. Coming soon.' });
});

router.post('/cancel', auth, (req, res) => {
  res.status(501).json({ error: 'Subscription management is not yet available. Coming soon.' });
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
