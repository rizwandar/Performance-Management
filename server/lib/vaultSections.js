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
  // IDEA-32: found missing here during PR promotion verification - donation_bank
  // was vault-gated correctly at its own routes (checkVault + field encryption)
  // but never added to this shared source of truth, so access.js's SEC-20
  // defensive filter didn't recognize it as vault-protected either. The actual
  // encrypted content was never exposed (no case block/client config reads
  // donation_bank via the access-link path), but the section_id itself was
  // leaking into visible_sections for any trusted-contact permission or
  // executor grant, which is the exact class of gap SEC-20 exists to close.
  'donation_bank',
]);

function isVaultProtectedSection(sectionId) {
  return VAULT_PROTECTED_SECTIONS.has(sectionId);
}

module.exports = { VAULT_PROTECTED_SECTIONS, isVaultProtectedSection };
