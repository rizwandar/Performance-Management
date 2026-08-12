import { useEffect, useState } from 'react'
import { Spinner, Button } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const ACTION_LABELS = {
  vault_destroyed_manual:               { label: 'Vault reset (manual)',              color: '#B45309' },
  vault_destroyed_max_attempts:         { label: 'Vault auto-destroyed (max attempts)', color: '#B91C1C' },
  vault_recovered_via_security_questions: { label: 'Vault recovered (security questions)', color: '#166534' },
}

export default function VaultSecurityPanel() {
  const [rows, setRows]     = useState([])
  const [total, setTotal]   = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const limit = 50

  const load = (newOffset = offset) => {
    setLoading(true)
    axios.get(`${API}/admin/vault-audit`, { params: { limit, offset: newOffset } })
      .then(r => { setRows(r.data.rows); setTotal(r.data.total); setOffset(newOffset) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <p className="text-muted small mb-3">
        Every time a vault is reset, auto-destroyed after too many wrong password attempts, or
        recovered via security questions, it's logged here so it can be traced back.
      </p>

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : rows.length === 0 ? (
        <p className="text-muted">No vault security events recorded.</p>
      ) : (
        <>
          <p className="text-muted small mb-2">{total} total events, showing {rows.length}</p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="table table-hover mb-0" style={{ fontSize: '0.85rem' }}>
              <thead style={{ background: 'var(--green-50)' }}>
                <tr>
                  <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>Event</th>
                  <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>User</th>
                  <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>IP Address</th>
                  <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>Details</th>
                  <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>Date &amp; Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const conf = ACTION_LABELS[row.action] || {}
                  let metadata = {}
                  try { metadata = JSON.parse(row.metadata || '{}') } catch { /* ignore */ }
                  return (
                    <tr key={i}>
                      <td style={{ color: conf.color || 'var(--text)', fontWeight: 500 }}>
                        {conf.label || row.action.replace(/_/g, ' ')}
                      </td>
                      <td>
                        {row.user_id
                          ? <>{row.name} <span className="text-muted small">{row.email}</span></>
                          : <span className="text-muted fst-italic">Deleted user</span>}
                      </td>
                      <td className="text-muted">{row.ip_address || 'N/A'}</td>
                      <td className="text-muted">
                        {metadata.attempts ? `${metadata.attempts} attempts` : ''}
                        {metadata.destroy_after_attempts ? ` / threshold ${metadata.destroy_after_attempts}` : ''}
                      </td>
                      <td className="text-muted">
                        {row.created_at ? new Date(row.created_at).toLocaleString('en-US', {
                          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        }) : 'N/A'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="d-flex gap-2 mt-3">
            <Button variant="outline-secondary" size="sm" disabled={offset === 0} onClick={() => load(Math.max(0, offset - limit))}>
              ← Previous
            </Button>
            <Button variant="outline-secondary" size="sm" disabled={offset + limit >= total} onClick={() => load(offset + limit)}>
              Next →
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
