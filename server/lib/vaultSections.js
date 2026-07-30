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
]);

function isVaultProtectedSection(sectionId) {
  return VAULT_PROTECTED_SECTIONS.has(sectionId);
}

module.exports = { VAULT_PROTECTED_SECTIONS, isVaultProtectedSection };
