// Canonical Free vs. Premium feature lists, shared by UpgradePage.jsx (the
// plan comparison cards) and WelcomeTrialPage.jsx (the post-login trial
// interstitial's comparison list). Extracted out of UpgradePage.jsx so both
// pages read from one place rather than keeping two hand-maintained copies
// in sync - same extraction pattern as client/src/constants/sections.js.
//
// PREMIUM_FEATURES deliberately starts with the literal 'All free sections'
// entry: Premium is Free-plus-more, not a separate list, and both pages rely
// on that convention rather than restating every free feature again.
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
