/**
 * Password-reset token hashing, shared by the forgot-password flow
 * (routes/auth.js) and the first-boot admin seed (db/database.js).
 *
 * Extracted rather than copy-pasted: this is the function that decides what
 * lands in users.reset_token, so two drifting copies would mean a token minted
 * by one path silently failing to verify on the other.
 *
 * The database only ever stores this hash, never the raw token. The raw value
 * exists only inside the emailed link.
 */
const crypto = require('crypto');

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { hashResetToken };
