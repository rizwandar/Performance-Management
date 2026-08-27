const { queryOne } = require('../db/database');

// BIL-08: universal no-card 30-day vault trial. Every new account gets one,
// starting at registration (users.signup_trial_started_at) - see auth.js's
// /register route. Separate from BIL-04's card-required Stripe trial.
const SIGNUP_TRIAL_DAYS = 30;
const SIGNUP_TRIAL_MS = SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000;

// Pure date check, no DB access - also used by the reminder cron so the
// "still within the trial window" definition lives in exactly one place.
function isWithinSignupTrial(signupTrialStartedAt, now = new Date()) {
  if (!signupTrialStartedAt) return false;
  const startedAt = new Date(signupTrialStartedAt).getTime();
  return now.getTime() < startedAt + SIGNUP_TRIAL_MS;
}

// Shared precedence check: true when a subscriptions row (or the
// subscriptions columns of a joined row) represents a real paid premium
// subscription that's currently active or trialing. getAccessInfo uses this
// to make a real subscription always win over the no-card signup trial;
// billing.js's create-checkout-session route (REV-12) reuses the same
// definition to block starting a second Checkout session while one is
// already in effect, rather than re-implementing the check.
function isActivePremiumSubscription(sub) {
  return !!sub && (sub.status === 'active' || sub.status === 'trialing') && sub.plan === 'premium';
}

// A real Stripe subscription always takes precedence and is checked first,
// independently of the signup trial: a paying (or Stripe-trialing) customer
// is never affected by their no-card signup trial window separately
// expiring. Only when there's no active/trialing subscription row do we
// fall back to the no-card signup trial - while that fallback applies,
// access is identical to plan 'premium'.
async function getAccessInfo(userId) {
  const row = await queryOne(
    `SELECT s.plan, s.status, u.signup_trial_started_at
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!row) {
    return { plan: 'free', signupTrialActive: false, signupTrialExpired: false, signupTrialEndsAt: null };
  }

  // Every user gets a subscriptions row the moment they register (plan
  // 'free', status 'active' - see auth.js's /register), so "has a
  // subscription row with an active/trialing status" is true for nearly
  // everyone and can't be the precedence check on its own. What actually
  // has to take priority over the signup trial is a *paid* subscription:
  // status active/trialing AND plan 'premium' (Stripe, org grant, or the
  // one-time grandfather cutover - all write plan='premium' here).
  const hasActivePremiumSub = isActivePremiumSubscription(row);
  const signupTrialEndsAt = row.signup_trial_started_at
    ? new Date(new Date(row.signup_trial_started_at).getTime() + SIGNUP_TRIAL_MS)
    : null;
  const signupTrialActive = !hasActivePremiumSub && isWithinSignupTrial(row.signup_trial_started_at);
  // "Expired" = the account had a no-card trial, it's now over, and no real
  // paid subscription is providing premium access either. Lets the client
  // show "your trial has ended" instead of the generic "this is a Premium
  // section" copy for someone who never had a trial to begin with.
  const signupTrialExpired = !hasActivePremiumSub && !!row.signup_trial_started_at && !signupTrialActive;

  const plan = hasActivePremiumSub ? row.plan : (signupTrialActive ? 'premium' : 'free');

  return { plan, signupTrialActive, signupTrialExpired, signupTrialEndsAt };
}

async function getUserPlan(userId) {
  return (await getAccessInfo(userId)).plan;
}

async function isPremium(userId) {
  return (await getUserPlan(userId)) === 'premium';
}

module.exports = { getUserPlan, isPremium, getAccessInfo, isWithinSignupTrial, isActivePremiumSubscription, SIGNUP_TRIAL_DAYS };
