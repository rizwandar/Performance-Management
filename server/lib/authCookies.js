const crypto = require('crypto');

// The client (in-good-hands-client(-staging).onrender.com or the production
// custom domain) and the API (in-good-hands-api(-staging).onrender.com) are
// hosted on different registrable domains, so this is a genuinely cross-site
// relationship for cookie purposes, not just cross-origin - SameSite=None is
// required for the browser to send the cookie back to the API at all, which
// in turn requires Secure. Chrome treats http://localhost as a secure context
// for this purpose, so it works for local dev too without HTTPS.
//
// `partitioned: true` (CHIPS) is required on top of that as of mid-2026: Chrome
// now treats any SameSite=None cookie set from a "foreign" (cross-site) context
// as third-party state and requires the Partitioned attribute for it to keep
// being stored/sent reliably - without it, Chrome logs "will soon be rejected"
// and, for a growing share of users already enrolled in the rollout, rejects it
// outright today. That silently broke the CSRF double-submit cookie (readable,
// non-httpOnly, so exactly what CHIPS targets) while the httpOnly session
// cookie kept working a while longer, producing "Invalid or missing CSRF
// token" on every mutating request for affected users - found live 2026-08-05
// via the browser console warning on both cookies. Partitioned cookies need no
// Domain attribute and Path=/ to key correctly, which this already has.
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  partitioned: true,
  maxAge: 8 * 60 * 60 * 1000, // matches the JWT's own 8h expiresIn
  path: '/',
};

// `Partitioned` is part of a cookie's storage identity, not just an extra
// flag on the same cookie - a browser that already had an unpartitioned
// token/csrf_token from before this attribute was added does NOT treat the
// new partitioned Set-Cookie as replacing it. Both coexist and both get sent
// on every request. The server's cookie parser and the client's document.cookie
// read don't necessarily resolve duplicate same-named cookies the same way,
// so the two csrf_token values can mismatch even on a freshly issued login -
// producing "Invalid or missing CSRF token" every time, not intermittently.
// Found live 2026-08-05 by inspecting the actual failing request's Cookie
// header, which showed two token and two csrf_token values sent at once.
// This shape (no `partitioned`) targets exactly that stale entry so it can
// be explicitly cleared - Secure/SameSite=None still have to match for the
// browser to recognize it as the same cookie to clear, but Partitioned does
// not carry over from COOKIE_OPTS here, which is the whole point.
const LEGACY_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
};

// Sets the session cookie (httpOnly - never readable by client JS, that's the
// entire point of SEC-09) plus a second, deliberately NOT-httpOnly cookie
// carrying a fresh random CSRF token, still compared server-side in
// middleware/auth.js exactly as before.
//
// CORRECTION, found live 2026-08-05: the original design assumed the web
// client could read this cookie back via document.cookie to echo it in a
// header (the standard double-submit pattern). That assumption doesn't hold
// here - client and API are on different registrable domains, and
// document.cookie only ever exposes cookies belonging to the CURRENT page's
// own origin. A cookie set by the API is simply never visible to
// document.cookie on the client's page, for any client, regardless of
// SameSite/Secure/Partitioned - this has nothing to do with Chrome's CHIPS
// policy (the real cause of the two long comments below, since superseded).
// That means getCookie('csrf_token') in AuthContext.jsx could never have
// worked at all: it silently returned null on every request, so the header
// was never sent, so every mutating cookie-authenticated request has been
// failing CSRF since SEC-09 shipped, not just after Chrome's later CHIPS
// enforcement. The actual fix (this function now returning csrfToken so
// callers can also hand it to the client directly in the response body,
// instead of relying on the client re-reading a cookie it can never see) is
// in the callers of setAuthCookies and in AuthContext.jsx, not here - this
// function still sets the cookie exactly as before, since the server's own
// read of it (req.cookies.csrf_token) was never the broken half.
function setAuthCookies(res, token) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.clearCookie('token', LEGACY_COOKIE_OPTS);
  res.clearCookie('csrf_token', { ...LEGACY_COOKIE_OPTS, httpOnly: false });
  res.cookie('token', token, COOKIE_OPTS);
  res.cookie('csrf_token', csrfToken, { ...COOKIE_OPTS, httpOnly: false });
  return csrfToken;
}

function clearAuthCookies(res) {
  res.clearCookie('token', { ...COOKIE_OPTS, maxAge: undefined });
  res.clearCookie('csrf_token', { ...COOKIE_OPTS, httpOnly: false, maxAge: undefined });
  res.clearCookie('token', LEGACY_COOKIE_OPTS);
  res.clearCookie('csrf_token', { ...LEGACY_COOKIE_OPTS, httpOnly: false });
}

module.exports = { setAuthCookies, clearAuthCookies };
