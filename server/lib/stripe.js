const Stripe = require('stripe');

// A missing/invalid key must not crash the whole server at boot (it used to -
// new Stripe() throws synchronously, and this module is required
// unconditionally from index.js). Instead, only the billing/webhook routes
// that actually try to use it fail, with a clear error, everything else
// keeps working.
// Pin the Stripe API version explicitly (2026-10-06). Without this the SDK
// uses whatever its own build defaults to, which means a routine dependency
// bump silently moves the API version this account talks to. That is a live
// billing change arriving disguised as a lockfile update, and it is exactly
// how a subscription field quietly relocating would reach production without
// anyone deciding to accept it. Stripe has already moved
// current_period_start/current_period_end off the Subscription object and onto
// its items once, which routes/stripeWebhook.js is written against.
//
// This value is the default of stripe-node 22.6.2, the version in use when the
// pin was added, so adding it changed no behaviour at all. Moving it is now a
// deliberate, separate decision: change this string, read Stripe's upgrade
// notes for every version crossed, and check routes/stripeWebhook.js and
// routes/billing.js against the new object shapes before shipping it.
const STRIPE_API_VERSION = '2026-08-26.dahlia';

let stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
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
