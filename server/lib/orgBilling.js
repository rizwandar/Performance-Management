const { queryOne, queryAll } = require('../db/database');

// Archived/deceased customers no longer occupy a billable seat - only
// still-relevant relationships count toward the Growth tier's included
// customer count and overage.
async function countActiveCustomers(organizationId) {
  const row = await queryOne(
    `SELECT COUNT(*)::int as c FROM organization_customers
     WHERE organization_id = $1 AND lifecycle_status NOT IN ('archived', 'deceased')`,
    [organizationId]
  );
  return row.c;
}

async function getOverageConfig() {
  const rows = await queryAll(
    "SELECT key, value FROM app_settings WHERE key IN ('org_growth_included_customers', 'org_growth_overage_rate_cents')"
  );
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    includedCustomers: parseInt(map.org_growth_included_customers, 10) || 50,
    overageRateCents:  parseInt(map.org_growth_overage_rate_cents, 10) || 200,
  };
}

module.exports = { countActiveCustomers, getOverageConfig };
