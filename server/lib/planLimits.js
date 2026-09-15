// Central free-vs-premium item-count limits for sections that allow
// multiple entries. This is deliberately separate from whole-SECTION
// gating (entire section Free vs Premium, enforced by the requirePremium
// middleware per route) - it's a second, narrower kind of limit: a
// free-plan cap on how many items you can add within a section that's
// otherwise available on Free (e.g. Trusted Contacts, Messages to Loved
// Ones). See client/src/constants/planLimits.js for the UI-facing mirror
// of these same numbers (kept in sync by hand - this project has no
// cross-runtime shared module for server-only values today, see
// shared/package.json's single "./format" export).
//
// A signup_trial_active user (BIL-08's 30-day no-card vault trial) reads
// as plan:'premium' from getUserPlan() already, so these limits compose
// correctly with that system for free without any extra code here.
//
// premium: null means no cap on Premium.
const PLAN_LIMITS = {
  trusted_contacts:       { free: 2, premium: 10 },
  personal_messages:      { free: 2, premium: null },
  unfinished_business:    { free: 2, premium: null },
  people_to_notify:       { free: 2, premium: null },
  funeral_gallery_photos: { free: 5, premium: 50 },
  message_audio_clips:    { free: 1, premium: 3 },
};

// plan is 'free' or 'premium' (see server/lib/subscription.js's
// getUserPlan). Returns Infinity for "no cap" so callers can always do
// `count >= getLimit(key, plan)` without a separate null-check branch.
function getLimit(key, plan) {
  const entry = PLAN_LIMITS[key];
  if (!entry) throw new Error(`Unknown plan-limit key: ${key}`);
  const value = plan === 'premium' ? entry.premium : entry.free;
  return value == null ? Infinity : value;
}

module.exports = { PLAN_LIMITS, getLimit };
