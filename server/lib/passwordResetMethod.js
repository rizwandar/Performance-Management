// Resolves the app_settings value 'password_reset_method' into the method the
// forgot-password flow will actually apply.
//
// Why anything needs resolving at all: 'dob' used to be a selectable method,
// where the submitted date of birth was compared against users.date_of_birth
// as an ADDITIONAL check before the reset link was emailed (never an alternate
// path to a token). Registration stopped collecting a date of birth on
// 2026-10-06, so every account created from then on has NULL in that column.
// With 'dob' selected those users could never satisfy the check, the comparison
// falls through to the generic "no match" branch by design, and they would be
// locked out of self-serve password reset with no explanation given.
//
// The check was only ever a minor defence layered on an email link, so it is
// not worth a lockout: 'dob' now resolves to 'email'. Anything unrecognised
// resolves to 'email' too, since an admin can write any string to this key via
// PUT /api/settings/:key and the safe default is the method every account can
// always use. 'security_question' is unaffected: it has a real credential
// behind it that the user sets up themselves, and nothing about dropping the
// date of birth touches it.
//
// Removing the option from the admin panel is not enough on its own, which is
// why this lives on the server: a stale 'dob' row may already exist in
// app_settings, and that key is writable through the generic settings route.
const SUPPORTED_PASSWORD_RESET_METHODS = ['email', 'security_question'];

function resolvePasswordResetMethod(rawValue) {
  return SUPPORTED_PASSWORD_RESET_METHODS.includes(rawValue) ? rawValue : 'email';
}

module.exports = { SUPPORTED_PASSWORD_RESET_METHODS, resolvePasswordResetMethod };
