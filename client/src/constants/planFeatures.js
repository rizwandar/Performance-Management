// Canonical Free vs. Premium feature lists, shared by UpgradePage.jsx (the
// plan comparison cards). Extracted out of UpgradePage.jsx so pages read from
// one place rather than keeping hand-maintained copies in sync, the same
// extraction pattern as client/src/constants/sections.js.
//
// Rewritten 2026-10-04, when the vault was opened on the free plan. Before
// that, these lists split the product in two: seven sections were Premium-only
// and Free got the rest. That split no longer exists. Every section is
// available on every plan, including the vault, and Premium sells capacity
// instead of access. See docs/FREE_VAULT_PLAN.md.
//
// So FREE_FEATURES is no longer a list of sections, because the honest answer
// is "all of them". Listing twenty-one names would also bury the thing that
// actually matters, which is that the vault is included.
//
// The numbers below are display copy and must match the real limits in
// client/src/constants/planLimits.js, which mirrors the server's
// server/lib/planLimits.js. Three files, kept in step by hand. Change one,
// change all three in the same commit.
export const FREE_FEATURES = [
  'Every section, including the vault',
  'Vault-encrypted protection for your most sensitive records',
  'A Legacy Contact, an emergency contact, and 2 trusted contacts',
  'Up to 2 legal documents and 2 saved accounts',
  'Up to 3 uploaded files, plus 5 funeral gallery photos',
  'PDF export of everything outside your vault',
  'Inactivity timer and notifications',
]

export const PREMIUM_FEATURES = [
  'Everything in the free plan, with no limits on what you can record',
  'Unlimited legal, financial, property and household records',
  'Unlimited saved accounts in your Digital Life vault',
  'Unlimited uploads, and up to 30 funeral gallery photos',
  'Full PDF export, including your vault',
  'Up to 10 trusted contacts instead of 2',
  'No sponsor messages',
]
