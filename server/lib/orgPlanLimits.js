const PLAN_LIMITS = {
  starter:      { orgAdmins: 1, orgStaff: 1 },
  professional: { orgAdmins: 3, orgStaff: 3 },
  growth:       { orgAdmins: 5, orgStaff: 10 },
};

const PLAN_RATES = {
  starter:      'Free',
  professional: '$99/month',
  growth:       '$199/month + $3 per active customer beyond 100',
};

const PLAN_TIERS = ['starter', 'professional', 'growth'];

// Starter is free, no Stripe price needed. Growth's $3/customer overage isn't
// a Stripe metered price - see lib/orgBilling.js, it's billed as a one-off
// invoice item added via the invoice.upcoming webhook instead.
const ORG_PRICE_IDS = {
  professional: process.env.STRIPE_ORG_PRICE_PROFESSIONAL,
  growth:       process.env.STRIPE_ORG_PRICE_GROWTH,
};

const TIER_LABELS = { starter: 'Starter', professional: 'Professional', growth: 'Growth' };

const { queryOne, queryAll } = require('../db/database');

async function getActiveRoleCounts(organizationId) {
  const rows = await queryAll(
    `SELECT org_role, COUNT(*)::int as c FROM users WHERE organization_id = $1 AND org_role IS NOT NULL AND is_active = 1 GROUP BY org_role`,
    [organizationId]
  );
  const countMap = { org_admin: 0, org_staff: 0 };
  rows.forEach(r => { countMap[r.org_role] = r.c; });
  return { orgAdmins: countMap.org_admin, orgStaff: countMap.org_staff };
}

// Single choke point for the "does adding/promoting to this role fit the org's
// plan" check, used by every path that can put a user into org_admin/org_staff
// (creation, role promotion, and reactivation) so the invariant can't quietly
// be bypassed by a path that forgot to call it.
async function checkRoleQuota(organizationId, planTier, role) {
  const limits = PLAN_LIMITS[planTier] || PLAN_LIMITS.starter;
  const limitKey = role === 'org_admin' ? 'orgAdmins' : 'orgStaff';
  const roleLabel = role === 'org_admin' ? 'Org Admin' : 'Org Staff';
  const activeCount = await queryOne(
    'SELECT COUNT(*)::int as c FROM users WHERE organization_id = $1 AND org_role = $2 AND is_active = 1',
    [organizationId, role]
  );
  if (activeCount.c >= limits[limitKey]) {
    return `This plan allows up to ${limits[limitKey]} ${roleLabel}${limits[limitKey] === 1 ? '' : 's'}. Upgrade the plan to add more.`;
  }
  return null;
}

module.exports = { PLAN_LIMITS, PLAN_RATES, PLAN_TIERS, TIER_LABELS, ORG_PRICE_IDS, getActiveRoleCounts, checkRoleQuota };
