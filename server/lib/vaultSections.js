// Single source of truth for which section_ids are vault-protected. Reused
// wherever an endpoint needs to decide whether a given section's data (or an
// uploaded document tagged with that section_id) requires the vault password,
// so the list can't drift out of sync between routes the way the individual
// duplicated GET-route vault checks did before (see the 2026-07-27 fix).
const VAULT_PROTECTED_SECTIONS = new Set([
  'legal_documents',
  'financial_items',
  'property_items',
  'household_info',
  'digital_credentials',
  // IDEA-32: split out of the old medical_wishes section. More sensitive
  // personal-medical data than the rest of what was there, so it joins the
  // shared vault instead of staying unprotected like Doctors/Medical Records.
  'donation_bank',
]);

function isVaultProtectedSection(sectionId) {
  return VAULT_PROTECTED_SECTIONS.has(sectionId);
}

module.exports = { VAULT_PROTECTED_SECTIONS, isVaultProtectedSection };
