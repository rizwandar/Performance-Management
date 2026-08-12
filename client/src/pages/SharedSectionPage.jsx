import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Spinner, Alert, Button } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Generic read-only renderer for a { kind, fields | items } view (see
// server/lib/sectionShareContent.js — the same shape is used to build the
// email content, so this page always matches what the recipient's email said).
// ---------------------------------------------------------------------------
function FieldRow({ label, value, type }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ minWidth: 190, fontWeight: 600, color: 'var(--green-900)', fontSize: '0.9rem' }}>{label}</span>
      {type === 'audio' ? (
        <audio controls src={value} style={{ flex: 1, minWidth: 240, height: 36 }} />
      ) : (
        <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.9rem' }}>{value}</span>
      )}
    </div>
  )
}

function ItemCard({ children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 12 }}>
      {children}
    </div>
  )
}

function SectionView({ view }) {
  if (view.kind === 'empty') {
    return <p className="text-muted small">Nothing has been recorded in this section yet.</p>
  }
  if (view.kind === 'single') {
    return (
      <ItemCard>
        {view.fields.map(f => <FieldRow key={f.label} label={f.label} value={f.value} type={f.type} />)}
      </ItemCard>
    )
  }
  return view.items.map((item, i) => (
    <ItemCard key={i}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 8 }}>{item.title}</p>
      {item.fields.map(f => <FieldRow key={f.label} label={f.label} value={f.value} type={f.type} />)}
    </ItemCard>
  ))
}

export default function SharedSectionPage() {
  const { token } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    // For a vault-protected section, the decryption key travels only in the
    // link's URL fragment (never sent to any server on a normal page load,
    // never stored in our database — see server/routes/sectionShares.js).
    // Read it once here and submit it explicitly to redeem the link.
    const key = window.location.hash ? window.location.hash.slice(1) : undefined
    axios.post(`${API}/section-shares/access/${token}`, key ? { key } : {})
      .then(r => setPayload(r.data))
      .catch(err => setError(err.response?.data?.error || 'This link is no longer valid.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  if (error) return (
    <div style={{ maxWidth: 540, margin: '60px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src="/logo.svg" alt="In Good Hands" width="48" height="48" style={{ marginBottom: 12 }} />
        <h4 style={{ color: 'var(--green-900)' }}>In Good Hands</h4>
      </div>
      <Alert variant="danger">{error}</Alert>
    </div>
  )

  const { owner_name, section_label, recipient_name, expires_at, view } = payload

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <img src="/logo.svg" alt="In Good Hands" width="48" height="48" style={{ marginBottom: 10 }} />
        <h3 style={{ color: 'var(--green-900)', marginBottom: 4 }}>In Good Hands</h3>
        <p className="text-muted small">
          <strong>{owner_name}</strong> shared their <strong>{section_label}</strong>{recipient_name ? <> with <strong>{recipient_name}</strong></> : null}
        </p>
        <p className="text-muted" style={{ fontSize: '0.78rem' }}>
          This link expires {new Date(expires_at).toLocaleString()}
        </p>
      </div>

      {/* Guest vs. returning-visitor banner */}
      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 10,
        padding: '16px 20px', marginBottom: 32, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        {user ? (
          <>
            <p className="mb-0 small" style={{ color: 'var(--green-900)' }}>
              You're signed in as {user.name || user.email}. This shared information is separate from your own account.
            </p>
            <Button as={Link} to="/profile" variant="outline-success" size="sm">Go to my dashboard</Button>
          </>
        ) : (
          <>
            <p className="mb-0 small" style={{ color: 'var(--green-900)' }}>
              You're viewing this as a guest, nothing was created for you. If you'd like your own
              private plan on In Good Hands, you can create an account any time.
            </p>
            <Button as={Link} to="/register" variant="success" size="sm">Create my own account</Button>
          </>
        )}
      </div>

      <SectionView view={view} />

      <div style={{ textAlign: 'center', marginTop: 48, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <p className="text-muted small">
          This information was shared privately via <strong>In Good Hands</strong>.<br/>
          Please treat it with care and confidentiality.
        </p>
      </div>
    </div>
  )
}
