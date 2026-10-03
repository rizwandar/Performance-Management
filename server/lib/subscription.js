const { queryOne } = require('../db/database');

// BIL-08's no-card 30-day vault trial. Separate from BIL-04's card-required
// Stripe trial.
//
// RETIRED 2026-10-03. The product decision is that the free plan should be
// permanently usable rather than temporarily generous: a trial makes every
// new account premium and then demotes it, so the user's first strong
// feeling about the product is a takeaway. Generous free limits with a quiet
// upgrade path do the same job without that moment.
//
// Switched off rather than torn out. The flag is the single source of truth
// and everything that offered, started, reminded about or honoured a trial
// reads it: routes/billing.js (the start/decline routes and the
// client-visible availability signal), routes/auth.js (the post-login
// interstitial), index.js (the reminder sweep) and isWithinSignupTrial
// below, which is what makes getAccessInfo stop granting premium. Setting it
// back to true restores the whole feature, which is worth more than a
// slightly smaller diff if the decision is ever revisited.
//
// Turning it off does demote anyone mid-trial at the moment it ships. That
// was acceptable here because production had no real users yet; it would not
// be later, so re-read this before flipping it on and off again.
const SIGNUP_TRIAL_ENABLED = false;

// Note the trial was never automatic even while enabled: routes/auth.js's
// /register leaves users.signup_trial_started_at NULL, and only
// /start-signup-trial ever set it. A brand new account has always read as
// 'free' here.
const SIGNUP_TRIAL_DAYS = 30;
const SIGNUP_TRIAL_MS = SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000;

// Pure date check, no DB access - also used by the reminder cron so the
// "still within the trial window" definition lives in exactly one place.
function isWithinSignupTrial(signupTrialStartedAt, now = new Date()) {
  // One gate for every caller. With the trial retired, an account that still
  // carries a signup_trial_started_at from before reads as free like any
  // other, and getAccessInfo's signupTrialExpired goes false rather than
  // true, so nobody is shown "your trial has ended" for a trial that was
  // withdrawn rather than served out.
  if (!SIGNUP_TRIAL_ENABLED) return false;
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
  // Gated on the flag as well, not just on signupTrialActive. Those are not
  // the same question: with the trial retired, isWithinSignupTrial always
  // returns false, so an account still carrying a signup_trial_started_at
  // from before would otherwise satisfy every term here and be told "your
  // 30-day free trial has ended". Its trial was withdrawn, not served out,
  // and the plain free-plan copy is the honest thing to show it.
  const signupTrialExpired = SIGNUP_TRIAL_ENABLED
    && !hasActivePremiumSub && !!row.signup_trial_started_at && !signupTrialActive;

  const plan = hasActivePremiumSub ? row.plan : (signupTrialActive ? 'premium' : 'free');

  return { plan, signupTrialActive, signupTrialExpired, signupTrialEndsAt };
}

async function getUserPlan(userId) {
  return (await getAccessInfo(userId)).plan;
}

async function isPremium(userId) {
  return (await getUserPlan(userId)) === 'premium';
}

module.exports = {
  getUserPlan, isPremium, getAccessInfo, isWithinSignupTrial,
  isActivePremiumSubscription, SIGNUP_TRIAL_DAYS, SIGNUP_TRIAL_ENABLED,
};
