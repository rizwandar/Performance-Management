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

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (decoded.viewAs) {
    const { error, user } = await applyViewAs(req, decoded);
    if (error) return res.status(403).json({ error });
    req.user = user;
  } else {
    req.user = decoded;
  }
  next();
};
