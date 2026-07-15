const { query } = require('../db/database');

// Customers signed up through an organization get Premium free for one year
// from association, then revert to Free unless they upgrade personally or the
// org relationship is still active with a fresh grant (org portal spec, section
// 7.3). Admin-granted honorary premium (provider = 'admin_grant') never expires
// and is untouched here, since it's a different provider value on the same row.
async function expireOrgPremiumGrants() {
  const result = await query(`
    UPDATE subscriptions
    SET plan = 'free', status = 'active', provider = NULL, organization_id = NULL, updated_at = NOW()
    WHERE provider = 'org_grant' AND current_period_end IS NOT NULL AND current_period_end < NOW()
  `);
  if (result.rowCount > 0) {
    console.log(`[org-premium] Expired ${result.rowCount} org-granted premium subscription(s).`);
  }
}

module.exports = { expireOrgPremiumGrants };
