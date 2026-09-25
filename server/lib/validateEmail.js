/**
 * Shared email-format check.
 *
 * The pattern was copy-pasted into four places (routes/contact.js,
 * routes/reportDeath.js twice, routes/orgRegister.js, routes/sectionShares.js),
 * two of them as a local EMAIL_RE const and two inline. Same duplication shape
 * that produced the JWT_SECRET and hashResetToken problems: four copies means
 * four things to keep in step, and a fix applied to one is invisible to the
 * others.
 *
 * The length guard is the actual security content here. The pattern below
 * backtracks polynomially (CodeQL js/polynomial-redos, flagged HIGH at all five
 * call sites), so an unbounded string reaching it burns CPU on Node's single
 * event loop. Every one of those call sites is an unauthenticated route, and
 * the global express.json limit is 256kb, which is far more headroom than an
 * attacker needs. Checking the length first bounds the work.
 *
 * RFC 5321 caps a full address at 254 characters, so this rejects nothing that
 * was ever deliverable.
 */

const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Deliberately does NOT trim. Call sites differ in whether they trim first
 * (orgRegister and sectionShares do, contact and reportDeath do not), and
 * trimming here would silently widen what those latter two accept. This is a
 * strict subset of the previous behaviour: it rejects only over-long input.
 */
function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  if (value.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_RE.test(value);
}

module.exports = { isValidEmail, MAX_EMAIL_LENGTH };
