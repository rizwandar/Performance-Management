function requireOrgUser(req, res, next) {
  if (!req.user.org_role || !req.user.organization_id) {
    return res.status(403).json({ error: 'Organization access required.' });
  }
  next();
}

function requireOrgAdmin(req, res, next) {
  if (req.user.org_role !== 'org_admin' || !req.user.organization_id) {
    return res.status(403).json({ error: 'Organization Admin access required.' });
  }
  next();
}

module.exports = { requireOrgUser, requireOrgAdmin };
