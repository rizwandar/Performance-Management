// Shared view-as session detection, used by every route file that needs to
// block an action before requireAuth has run (requireAuth is applied
// per-route, not globally, so req.user/req.isViewAs aren't set yet at the
// point these checks need to run).
//
// REV-01 (2026-08-26 review): users.js and export.js were each decoding the
// session token from req.headers.authorization only. Since SEC-09, the web
// client's session - including the view-as session minted by
// POST /api/org-portal/customers/:id/view-as, which is delivered exclusively
// via the httpOnly cookie, never returned in a response body for the client
// to put in a header - has had no readable token to send as an Authorization
// header at all. A header-only check silently no-ops for every web request,
// meaning both guards did not actually apply to any browser-based session
// (view-as included). sections.js already had the correct cookie-first,
// Bearer-header-fallback precedence (fixed for SEC-18, 2026-08-15); this file
// centralizes that exact logic so it can't drift out of sync a third time.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Cookie first, Bearer header as the mobile-only fallback - same precedence
// middleware/auth.js's requireAuth already uses (SEC-09). Mobile has no
// browser cookie jar, so it keeps sending the token it already stores in
// expo-secure-store as a Bearer header, unaffected by any of this.
function extractToken(req) {
  const header = req.headers.authorization;
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
  return req.cookies?.token || headerToken;
}

// Returns an Express middleware that rejects any request carrying a decoded
// view-as session with the given error message. A missing or invalid token is
// left alone for the route's own requireAuth to reject.
function blockViewAs(message) {
  return (req, res, next) => {
    const token = extractToken(req);
    if (!token) return next();
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); } catch { return next(); }
    if (decoded.viewAs) return res.status(403).json({ error: message });
    next();
  };
}

module.exports = { extractToken, blockViewAs };
