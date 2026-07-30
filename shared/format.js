import { parsePhoneNumberWithError } from 'libphonenumber-js'

// Display-only phone formatting. Formats using countryCode as a hint for
// parsing national-format numbers (e.g. a stored "0400123456" needs to know
// it's Australian to format correctly) - it never changes what's stored,
// only how it's shown. Falls back to the raw input on anything that doesn't
// parse, so bad or partial data never breaks the page.
export function formatPhone(phone, countryCode) {
  if (!phone) return phone
  try {
    const parsed = parsePhoneNumberWithError(phone, countryCode || undefined)
    if (parsed && parsed.isValid()) return parsed.formatInternational()
  } catch {
    // not a parseable phone number - show it as entered
  }
  return phone
}
