// Server-side mirror of the GDPR-tagged entries in client's
// client/src/pages/RegisterPage.jsx's COUNTRIES array. The client needs the
// full country list and regime labels for its UI; the server only needs to
// know, for a submitted country_code, whether GDPR applies, so it can
// enforce the age-consent requirement itself rather than trust a disabled
// button in the browser. These two lists must be kept in sync by hand:
// this project has no cross-runtime shared module for server-only values
// today (see shared/package.json's single "./format" export, and
// server/lib/planLimits.js / client/src/constants/planLimits.js for the
// same hand-synced arrangement elsewhere in this codebase). Change one,
// change the other in the same commit.
//
// Copied verbatim from the codes tagged regime: 'gdpr' in COUNTRIES: the 27
// EU member states, plus the EEA/UK/Switzerland countries that list carries
// as GDPR-equivalent (UK, Norway, Iceland, Liechtenstein, Switzerland).
const GDPR_COUNTRY_CODES = [
  // EU member states
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  // EEA + UK + Switzerland (GDPR-equivalent)
  'GB', 'NO', 'IS', 'LI', 'CH',
];

const GDPR_COUNTRY_SET = new Set(GDPR_COUNTRY_CODES);

// Returns 'gdpr' for a country in the list above, otherwise null. Only the
// gdpr/not-gdpr distinction is needed server-side today (to gate the age
// consent check at registration) - the client's finer-grained regime tags
// (pipeda, privacy_act, nz, ccpa, general, restricted) only drive UI copy
// and have no server-side enforcement behind them yet.
function regimeForCountry(countryCode) {
  if (!countryCode) return null;
  return GDPR_COUNTRY_SET.has(String(countryCode).toUpperCase()) ? 'gdpr' : null;
}

module.exports = { GDPR_COUNTRY_CODES, regimeForCountry };
