const crypto = require('crypto');

// The client (in-good-hands-client(-staging).onrender.com or the production
// custom domain) and the API (in-good-hands-api(-staging).onrender.com) are
// hosted on different registrable domains, so this is a genuinely cross-site
// relationship for cookie purposes, not just cross-origin - SameSite=None is
// required for the browser to send the cookie back to the API at all, which
// in turn requires Secure. Chrome treats http://localhost as a secure context
// for this purpose, so it works for local dev too without HTTPS.
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 8 * 60 * 60 * 1000, // matches the JWT's own 8h expiresIn
  path: '/',
};

// Sets the session cookie (httpOnly - never readable by client JS, that's the
// entire point of SEC-09) plus a second, deliberately NOT-httpOnly cookie
// carrying a fresh random CSRF token. A cross-site attacker's page can make
// the browser send both cookies automatically, but same-origin policy stops
// it reading the csrf_token value to echo back in a header - see the
// double-submit check in middleware/auth.js.
function setAuthCookies(res, token) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie('token', token, COOKIE_OPTS);
  res.cookie('csrf_token', csrfToken, { ...COOKIE_OPTS, httpOnly: false });
}

function clearAuthCookies(res) {
  res.clearCookie('token', { ...COOKIE_OPTS, maxAge: undefined });
  res.clearCookie('csrf_token', { ...COOKIE_OPTS, httpOnly: false, maxAge: undefined });
}

module.exports = { setAuthCookies, clearAuthCookies };
