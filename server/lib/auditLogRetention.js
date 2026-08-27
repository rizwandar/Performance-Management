const { query } = require('../db/database');

// REV-23: the Privacy Policy (server/db/legalSeed.js, Data Retention section)
// promises "Security and audit logs are retained for 12 months and then
// automatically deleted." No job enforced that promise, so user_audit_logs
// (login events, failed login attempts, vault access attempts, IP addresses,
// user agents) accumulated indefinitely. This sweep is the enforcement.
//
// Scope: only user_audit_logs. It's the one table the policy wording actually
// describes (login/vault-attempt audit trail); security_findings is an
// internal admin tracker for security-review findings, not a user-facing
// audit log, and isn't mentioned by this policy clause.
async function deleteExpiredAuditLogs() {
  const result = await query(
    `DELETE FROM user_audit_logs WHERE created_at < NOW() - INTERVAL '12 months'`
  );
  return result.rowCount;
}

module.exports = { deleteExpiredAuditLogs };
