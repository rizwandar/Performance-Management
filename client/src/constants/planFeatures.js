// Canonical Free vs. Premium feature lists, shared by UpgradePage.jsx (the
// plan comparison cards) and WelcomeTrialPage.jsx (the post-login trial
// interstitial's comparison list). Extracted out of UpgradePage.jsx so both
// pages read from one place rather than keeping two hand-maintained copies
// in sync - same extraction pattern as client/src/constants/sections.js.
//
// PREMIUM_FEATURES deliberately starts with a vault-encrypted-security
// summary line, since that's Premium's clearest differentiator; 'All free
// sections' (Premium is Free-plus-more, not a separate list) is kept as the
// very next entry so that framing still reads early in the list, just no
// longer as the leading/highlighted item.
export const FREE_FEATURES = [
  'How I\'d Like to Be Remembered',
  'Messages to Loved Ones',
  'Unfinished Business',
  'Songs That Define Me',
  'My Bucket List',
  'Funeral and End-of-Life Wishes',
  'Doctors',
  'Medical Records',
  'Emergency Contact',
  'People to Notify',
  'Your Loved Ones',
  'Pet Care',
  'Insurance',
  'Trusted contact access permissions',
]

export const PREMIUM_FEATURES = [
  'Vault-encrypted protection for your most sensitive records',
  'All free sections',
  'Your Last Moments (a dedicated final recording or letter)',
  'Personal and Legal Documents',
  'Property and Possessions',
  'Financial Affairs',
  'Digital Life (vault-encrypted)',
  'Practical Household Information',
  'Donation Bank (vault-encrypted)',
  'Document and photo uploads',
  'Full PDF export (including vault)',
  'Inactivity timer and notifications',
]
