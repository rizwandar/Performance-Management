// Shared deceased-plan lock.
//
// Once a user is marked deceased (by their executor, org staff, or the timer's
// direct-notify fallback path - see lib/deceased.js), their plan is locked from
// all edits, whether they're accessed directly or via org-portal view-as.
// users.is_deceased is the single source of truth (kept in sync with
// organization_customers.lifecycle_status for org-managed customers). An admin
// can undo a wrongly-set flag via POST /api/admin/users/:id/revert-deceased
// (or the org equivalent in routes/organizations.js), so a mistaken death
// report is recoverable and this lock never permanently strands a living
// account.
//
// REV-19 (2026-08-26 review): this used to live as a private function inside
// routes/sections.js only, so documents.js, trustedContacts.js and users.js
// never checked it at all - a deceased plan's uploads, trusted contacts,
// profile fields and account settings all stayed fully editable. Moved here so
// every route file applies the same implementation instead of each growing its
// own copy that can drift (the same drift that produced SEC-18 and REV-01).
//
// This decodes the session token itself rather than relying on req.user /
// req.isViewAs, since requireAuth is applied per-route in this codebase, not
// globally, so it may not have run yet at the point this check needs to run.
// extractToken() (lib/viewAsGuard.js) reads the cookie first and falls back to
// the Bearer header, the same precedence middleware/auth.js uses (SEC-09):
// a header-only read silently no-ops for every web request, view-as included.
//
// Applied router-wide (sections.js, trustedContacts.js, users.js) it skips GET,
// so read-only routes stay reachable. documents.js applies it per-route
// instead, because several of its READ routes are POSTs by design (a
// vault_password must travel in a body, never a query string) and a locked
// plan must still be readable.
const jwt = require('jsonwebtoken');
const { queryOne } = require('../db/database');
const { extractToken } = require('../lib/viewAsGuard');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

async function checkPlanLock(req, res, next) {
  if (req.method === 'GET') return next();
  const token = extractToken(req);
  if (!token) return next();
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch { return next(); }
  const effectiveId = decoded.viewAs ? decoded.viewAs.customerId : decoded.id;
  const locked = await queryOne(
    `SELECT id FROM users WHERE id = $1 AND is_deceased = true`,
    [effectiveId]
  );
  if (locked) return res.status(403).json({ error: 'This plan has been locked and can no longer be edited.' });
  next();
}

module.exports = checkPlanLock;
