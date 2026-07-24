const Stripe = require('stripe');

// A missing/invalid key must not crash the whole server at boot (it used to -
// new Stripe() throws synchronously, and this module is required
// unconditionally from index.js). Instead, only the billing/webhook routes
// that actually try to use it fail, with a clear error, everything else
// keeps working.
let stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
} catch (err) {
  console.error('[stripe] Failed to initialize, billing routes will fail until fixed:', err.message);
  stripe = new Proxy({}, {
    get() {
      throw new Error('Stripe is not configured (missing or invalid STRIPE_SECRET_KEY)');
    },
  });
}

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual:  process.env.STRIPE_PRICE_ANNUAL,
};

module.exports = { stripe, PRICE_IDS };
