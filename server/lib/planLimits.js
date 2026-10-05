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
  people_to_notify:       { free: 3, premium: null },
  funeral_gallery_photos: { free: 5, premium: 30 },
  message_audio_clips:    { free: 1, premium: 3 },

  // The vault sections (2026-10-04). These were gated whole by
  // requirePremium: a free user could not open them at all. They are now
  // open to everyone and capped instead, so Premium sells capacity rather
  // than access. See docs/FREE_VAULT_PLAN.md for the reasoning and the
  // owner's own numbers, which these are.
  //
  // Donation Bank and Your Last Moments are single-record sections, so their
  // 1 is inherent rather than a new ceiling. They are listed anyway so the
  // copy can state a limit consistently and so nothing has to special-case
  // them.
  legal_documents:        { free: 2, premium: null },
  financial_items:        { free: 1, premium: null },
  property_items:         { free: 1, premium: null },
  household_info:         { free: 1, premium: null },
  digital_credentials:    { free: 2, premium: null },
  donation_bank:          { free: 1, premium: null },
  last_moments:           { free: 1, premium: null },

  // Uploaded files, counted across every section. The only cap here with
  // real unit economics behind it: a row in Postgres costs nothing to keep,
  // a 20MB PDF in R2 does, and that cost arrives whether or not the account
  // ever pays. Funeral gallery photos are counted separately above and keep
  // their existing allowance, deliberately: folding them in would have taken
  // something away from people who already have it.
  uploaded_documents:     { free: 3, premium: null },
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
