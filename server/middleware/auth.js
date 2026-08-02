const jwt = require('jsonwebtoken');
const { queryOne, query } = require('../db/database');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable must be set in production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// A view-as token (minted by POST /api/org-portal/customers/:id/view-as) carries
// a `viewAs` claim instead of acting as a normal session. Every request using one
// is re-checked against live consent here (revocation must take effect immediately,
// not just at mint time), then req.user is swapped to the customer so the rest of
// the app — all 14 section routes included — reads req.user.id exactly as it
// already does, with zero changes needed elsewhere. Vault access is still hard
// blocked separately in routes/sections.js; this only grants section-level access.
async function applyViewAs(req, decoded) {
  const { customerId, organizationCustomerId, editAllowed } = decoded.viewAs;
  const oc = await queryOne(
    'SELECT view_consent, edit_consent FROM organization_customers WHERE id = $1 AND user_id = $2',
    [organizationCustomerId, customerId]
  );
  if (!oc || !oc.view_consent) {
    return { error: 'View access has been revoked or is no longer available.' };
  }
  const canEdit = editAllowed && !!oc.edit_consent;
  if (req.method !== 'GET' && !canEdit) {
    return { error: 'Edit access has not been granted for this customer.' };
  }
  if (req.method !== 'GET') {
    query(
      'INSERT INTO user_audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [decoded.id, 'edit_on_behalf', JSON.stringify({
        customer_id: customerId, organization_customer_id: organizationCustomerId,
        method: req.method, path: req.originalUrl,
      })]
    ).catch(err => console.error('[audit] Log failed:', err.message));
  }
  req.actingUser = { id: decoded.id, email: decoded.email };
  req.isViewAs = true;
  req.canEditOnBehalf = canEdit;
  return { user: { id: customerId, email: null, is_admin: 0 } };
}

// SEC-09: the web client no longer holds a readable copy of the session
// token at all - it lives only in an httpOnly cookie, sent automatically by
// the browser. Mobile has no meaningful browser cookie jar, so it keeps
// sending the token it already stores in expo-secure-store as a Bearer
// header exactly as before; that path is completely unaffected by any of
// this. Cookie first, header as the fallback, so a request carrying both
// (shouldn't normally happen) prefers the cookie.
module.exports = async (req, res, next) => {
  const cookieToken = req.cookies?.token;
  const header = req.headers.authorization;
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = cookieToken || headerToken;
  const authViaCookie = !!cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', session_expired: true });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', session_expired: true });
  }

  // CSRF only matters for cookie-authenticated requests - a cross-site page
  // can make the browser attach the cookie automatically, but can't read the
  // separate csrf_token cookie to echo it back (same-origin policy), so a
  // forged request fails this check even with valid session cookies riding
  // along. Bearer-header requests (mobile, or any non-browser client) aren't
  // reachable by a malicious web page in the first place, so they're exempt.
  // Safe methods are exempt since they don't change state.
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (authViaCookie && isMutating) {
    const csrfCookie = req.cookies?.csrf_token;
    const csrfHeader = req.headers['x-csrf-token'];
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    }
  }

  if (decoded.viewAs) {
    const { error, user } = await applyViewAs(req, decoded);
    if (error) return res.status(403).json({ error });
    req.user = user;
  } else {
    // Tokens minted since the session_version migration carry an `sv` claim;
    // a mismatch against the user's live value means the password was reset
    // or changed since this token was issued, so it's rejected even though it
    // hasn't expired yet. Tokens without the claim (already-issued sessions at
    // migration time, or a couple of org-flow token issuers not yet updated)
    // skip the check rather than being force-logged-out by this change.
    // The same lookup also catches two other cases a still-valid-but-stale JWT
    // shouldn't survive (SEC-10): the account was deleted entirely (org staff
    // deactivation only sets is_active=0 today; a regular account only ever
    // goes away via hard delete, so "row missing" is the real-world case for
    // that path too), and org staff deactivated mid-session (org_role account
    // with is_active=0) - previously that only blocked future logins, not
    // requests already carrying a token issued before the deactivation. The
    // is_admin comparison is forward-looking defense-in-depth: no admin
    // promote/demote feature exists yet, so it can't fire today, but the
    // enforcement point is ready the moment one is built, without needing to
    // touch this file again.
    if (decoded.sv !== undefined) {
      const row = await queryOne('SELECT session_version, is_active, org_role, is_admin FROM users WHERE id = $1', [decoded.id]);
      const deactivated = row?.org_role && row.is_active === 0;
      if (!row || row.session_version !== decoded.sv || deactivated || row.is_admin !== decoded.is_admin) {
        return res.status(401).json({ error: 'Your session has expired. Please sign in again.', session_expired: true });
      }
    }
    req.user = decoded;
  }
  next();
};
