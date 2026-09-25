/**
 * Sanitize a value before interpolating it into a log line.
 *
 * CodeQL flags three sites as js/log-injection (routes/contact.js and
 * lib/sendEmail.js twice). The risk is modest and worth stating honestly: an
 * attacker can write forged lines into the log, not read it, so there is no
 * credential exposure and no execution path. What it does buy them is a log
 * that cannot be trusted during an incident, which is exactly when it matters.
 *
 * Two things are stripped:
 *
 *   - Control characters, CR and LF included. Newlines are the whole trick:
 *     without them an attacker can only make one line ugly, with them they can
 *     fabricate entire entries that look like the server's own output.
 *   - Excess length. `subject` at sendEmail.js is built from an unvalidated
 *     `name` on the public contact form, so it is attacker-sized.
 *   - The double quote, replaced with a single quote. sendEmail.js wraps the
 *     subject in quotes, so an embedded one can make a reader misjudge where
 *     that field ends. Cosmetic next to the newline case, but free to close.
 *
 * The pattern uses the Unicode property escape \p{Cc} ("Other, control"), which
 * is exactly U+0000-U+001F plus U+007F-U+009F. An earlier version spelled that
 * range out and ended up holding literal control bytes, which made git treat
 * this source file as binary. This form is unambiguous and pure ASCII.
 */

const CONTROL_CHARS = /\p{Cc}/gu;
const DOUBLE_QUOTE = /"/g;
const MAX_LOGGED_LENGTH = 300;

function forLog(value) {
  if (value === null || value === undefined) return String(value);
  const flattened = String(value)
    .replace(CONTROL_CHARS, ' ')
    .replace(DOUBLE_QUOTE, "'");
  return flattened.length > MAX_LOGGED_LENGTH
    ? flattened.slice(0, MAX_LOGGED_LENGTH) + '...[truncated]'
    : flattened;
}

module.exports = { forLog, MAX_LOGGED_LENGTH };
