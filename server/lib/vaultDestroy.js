/**
 * Shared vault-destruction routine — the one place that actually deletes
 * vault-protected data. Used by both the manual "I forgot it, reset me"
 * endpoint and the automatic destroy-after-N-wrong-attempts path, so there
 * is exactly one implementation of "what gets deleted" to keep correct.
 */

const { queryAll, transaction } = require('../db/database')
const { TABLE_FIELDS } = require('./vaultFields')
const { deleteFile } = require('./r2')

// reason: 'vault_destroyed_manual' | 'vault_destroyed_max_attempts' — written
// to user_audit_logs so admins can see who lost data, when, and why.
async function destroyVaultData(userId, { reason, req, metadata } = {}) {
  const vaultProtectedTables = Object.keys(TABLE_FIELDS)
  const vaultFiles = await queryAll(
    `SELECT r2_key FROM uploaded_documents WHERE user_id = $1 AND section_id = ANY($2)`,
    [userId, vaultProtectedTables]
  )

  await transaction(async (client) => {
    await client.query('DELETE FROM digital_credentials WHERE user_id = $1', [userId])
    await client.query('DELETE FROM digital_vault WHERE user_id = $1', [userId])
    await client.query(`DELETE FROM uploaded_documents WHERE user_id = $1 AND section_id = ANY($2)`, [userId, vaultProtectedTables])
    for (const table of vaultProtectedTables) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
    }

    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0].trim() || req?.socket?.remoteAddress || null
    const ua = req?.headers?.['user-agent'] || null
    await client.query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [userId, reason, ip, ua, JSON.stringify(metadata || {})]
    )
  })

  for (const f of vaultFiles) {
    deleteFile(f.r2_key).catch(() => {})
  }
}

module.exports = { destroyVaultData }
