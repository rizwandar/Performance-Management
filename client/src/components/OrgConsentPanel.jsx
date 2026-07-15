import { useState, useEffect } from 'react'
import { Button, Alert, Spinner, Badge } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const card = { background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }

export default function OrgConsentPanel() {
  const [consent, setConsent] = useState(undefined) // undefined = loading, null = no org, object = consent state
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [revoking, setRevoking] = useState(false)

  const load = () => {
    axios.get(`${API}/users/me/org-consent`)
      .then(r => setConsent(r.data))
      .catch(() => setConsent(null))
  }
  useEffect(load, [])

  const revoke = async (type) => {
    setRevoking(true)
    setError(''); setSuccess('')
    try {
      await axios.put(`${API}/users/me/org-consent/revoke-${type}`)
      setSuccess(type === 'view' ? 'View and edit access have been revoked.' : 'Edit access has been revoked.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update this setting.')
    }
    setRevoking(false)
  }

  if (consent === undefined) return null // don't flash a loading state for a section most users won't have
  if (consent === null) return null // no organization association at all

  return (
    <div style={card}>
      <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Organization Access</h6>
      <p className="text-muted small mb-3">
        <strong>{consent.organization_name}</strong> helped set up your plan. You can revoke their access
        at any time.
      </p>

      {success && <Alert variant="success">{success}</Alert>}
      {error   && <Alert variant="danger">{error}</Alert>}

      <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
        <Badge bg={consent.view_consent ? 'success' : 'secondary'}>
          {consent.view_consent ? 'View access granted' : 'View access revoked'}
        </Badge>
        <Badge bg={consent.edit_consent ? 'success' : 'secondary'}>
          {consent.edit_consent ? 'Edit access granted' : 'Edit access revoked'}
        </Badge>
      </div>

      <div className="d-flex gap-2">
        {consent.edit_consent && (
          <Button size="sm" variant="outline-danger" disabled={revoking} onClick={() => revoke('edit')}>
            Revoke edit access
          </Button>
        )}
        {consent.view_consent && (
          <Button size="sm" variant="outline-danger" disabled={revoking} onClick={() => revoke('view')}>
            Revoke all access
          </Button>
        )}
      </div>
    </div>
  )
}
