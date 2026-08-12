import { useEffect, useState } from 'react'
import { Badge } from 'react-bootstrap'
import axios from 'axios'
import { onSectionShareChanged } from '../utils/sectionShareEvents'

const API = import.meta.env.VITE_API_URL

function shareStatus(share) {
  if (share.revoked_at) return { label: 'Revoked', variant: 'secondary' }
  if (new Date(share.expires_at) <= new Date()) return { label: 'Expired', variant: 'secondary' }
  if (share.accessed_at) return { label: 'Viewed', variant: 'success' }
  return { label: 'Not yet viewed', variant: 'warning' }
}

// Belongs at the bottom of a shareable section page, below the section's own
// content: who this section has been shared with, and per-share revoke.
// Renders nothing once loaded if the section has never been shared, so pages
// that were never shared don't grow an empty "Shared with" block. Companion
// to ShareSectionTrigger (top of page) — the two sync via sectionShareEvents.
export default function ShareSectionHistory({ section }) {
  const [shares, setShares]             = useState([])
  const [loadingShares, setLoadingShares] = useState(true)
  const [revokingId, setRevokingId]     = useState(null)

  const loadShares = () => {
    setLoadingShares(true)
    axios.get(`${API}/section-shares`, { params: { section } })
      .then(r => setShares(r.data))
      .catch(() => {})
      .finally(() => setLoadingShares(false))
  }

  useEffect(loadShares, [section])
  useEffect(() => onSectionShareChanged(section, loadShares), [section])

  const handleRevoke = async (id) => {
    setRevokingId(id)
    try {
      await axios.post(`${API}/section-shares/${id}/revoke`)
      loadShares()
    } catch {
      // surfaced inline below rather than a blocking alert, revoke is low-stakes to retry
    }
    setRevokingId(null)
  }

  if (loadingShares || shares.length === 0) return null

  const activeCount = shares.filter(s => !s.revoked_at && new Date(s.expires_at) > new Date()).length

  return (
    <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      <p className="small mb-2" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
        Shared with {shares.length} {shares.length === 1 ? 'person' : 'people'}
        {activeCount > 0 && <Badge bg="success" className="ms-2">{activeCount} active</Badge>}
      </p>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
        {shares.map(share => {
          const status = shareStatus(share)
          return (
            <div key={share.id} className="d-flex align-items-center justify-content-between flex-wrap gap-2 py-2"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600, color: 'var(--green-900)', fontSize: '0.88rem' }}>{share.recipient_name}</span>
                <span className="text-muted small ms-2">{share.recipient_email}</span>
                <div className="text-muted small">
                  Shared {new Date(share.created_at).toLocaleDateString()} · <Badge bg={status.variant}>{status.label}</Badge>
                </div>
              </div>
              {!share.revoked_at && new Date(share.expires_at) > new Date() && (
                <button className="btn btn-sm btn-outline-danger"
                  disabled={revokingId === share.id}
                  onClick={() => handleRevoke(share.id)}>
                  {revokingId === share.id ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
