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
  // Ordinary trusted contacts only. The Legacy Contact is stored as one of
  // the same trusted_contacts rows (is_executor = 1) but is a separate, free
  // allowance of exactly one on every plan, so it is deliberately absent from
  // this table: there is no free-vs-premium distinction to express, and the
  // single-Legacy-Contact rule is enforced by the partial unique index
  // trusted_contacts_one_executor rather than by a count. So these 2 and 10
  // mean 2 and 10 trusted contacts BESIDES the Legacy Contact, which is why
  // every cap query in routes/trustedContacts.js filters is_executor out.
  // Owner's decision, 2026-10-04: a free account holds 1 Legacy Contact,
  // 1 emergency contact and 2 trusted contacts, four people rather than two.
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

// "1 item", not "1 items". Several caps above are 1 (financial items,
// property, household info, donation bank, your last moments, one voice clip
// per message), so every refusal message that pairs a count with a noun builds
// it here rather than interpolating a hardcoded plural. The nouns in use are
// irregular enough (entry/entries, person/people) that both forms have to be
// given explicitly.
function countNoun(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

module.exports = { PLAN_LIMITS, getLimit, countNoun };
