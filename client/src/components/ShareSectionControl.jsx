import { useEffect, useState } from 'react'
import { Button, Modal, Form, Alert, Spinner, Badge } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const emptyForm = { recipient_name: '', recipient_email: '', vault_password: '' }

function shareStatus(share) {
  if (share.revoked_at) return { label: 'Revoked', variant: 'secondary' }
  if (new Date(share.expires_at) <= new Date()) return { label: 'Expired', variant: 'secondary' }
  if (share.accessed_at) return { label: 'Viewed', variant: 'success' }
  return { label: 'Not yet viewed', variant: 'warning' }
}

// Drop-in "Share this section" control: a button that opens a name/email
// (+ vault password, for vault-protected sections) modal, plus a small
// expandable history list of who a section has been shared with, with
// revoke. Independent of the 3-slot Trusted Contacts system — any number of
// people, any time. See server/routes/sectionShares.js.
export default function ShareSectionControl({ section, sectionLabel, isVaultSection = false }) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState('')

  const [shares, setShares]       = useState([])
  const [loadingShares, setLoadingShares] = useState(true)
  const [showHistory, setShowHistory]     = useState(false)
  const [revokingId, setRevokingId]       = useState(null)

  const loadShares = () => {
    setLoadingShares(true)
    axios.get(`${API}/section-shares`, { params: { section } })
      .then(r => setShares(r.data))
      .catch(() => {}) // non-fatal — the button to create a new share still works
      .finally(() => setLoadingShares(false))
  }

  useEffect(loadShares, [section])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const openModal = () => {
    setForm(emptyForm)
    setModalError('')
    setModalSuccess('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.recipient_name.trim() || !form.recipient_email.trim()) {
      setModalError('Please provide both a name and an email address.')
      return
    }
    if (isVaultSection && !form.vault_password) {
      setModalError('Your vault password is required to share this section.')
      return
    }
    setModalError('')
    setSubmitting(true)
    try {
      await axios.post(`${API}/section-shares`, {
        section,
        recipient_name:  form.recipient_name.trim(),
        recipient_email: form.recipient_email.trim(),
        ...(isVaultSection ? { vault_password: form.vault_password } : {}),
      })
      setModalSuccess(`Shared with ${form.recipient_name.trim()}. We've sent them an email right away.`)
      setForm(emptyForm)
      loadShares()
    } catch (err) {
      setModalError(err.response?.data?.error || "We couldn't send this share. Please try again.")
    }
    setSubmitting(false)
  }

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

  const activeCount = shares.filter(s => !s.revoked_at && new Date(s.expires_at) > new Date()).length

  return (
    <div className="mb-4">
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <Button variant="outline-success" size="sm" onClick={openModal}>
          Share this section
        </Button>
        {!loadingShares && shares.length > 0 && (
          <button
            className="btn btn-link p-0 small"
            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
            onClick={() => setShowHistory(s => !s)}>
            {showHistory ? 'Hide' : 'Shared with'} {shares.length} {shares.length === 1 ? 'person' : 'people'}
            {activeCount > 0 && <Badge bg="success" className="ms-2">{activeCount} active</Badge>}
          </button>
        )}
      </div>

      {showHistory && (
        <div style={{ marginTop: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
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
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Share {sectionLabel}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <p className="text-muted small">
              We'll email them an introduction to In Good Hands, who shared this with them, and a
              secure link valid for 72 hours.
            </p>
            {modalSuccess && <Alert variant="success" className="py-2">{modalSuccess}</Alert>}
            {modalError && <Alert variant="danger" className="py-2">{modalError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Their name</Form.Label>
              <Form.Control value={form.recipient_name} onChange={set('recipient_name')} placeholder="e.g. Jamie Smith" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Their email</Form.Label>
              <Form.Control type="email" value={form.recipient_email} onChange={set('recipient_email')} placeholder="jamie@example.com" />
            </Form.Group>
            {isVaultSection && (
              <Form.Group className="mb-1">
                <Form.Label className="small fw-semibold">Your vault password</Form.Label>
                <Form.Control type="password" value={form.vault_password} onChange={set('vault_password')} placeholder="Required to share vault-protected information" />
                <p className="text-muted small mt-1 mb-0">
                  This section is vault-protected, so we ask for your vault password to confirm
                  it's really you before sharing it.
                </p>
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Close</Button>
            <Button variant="success" type="submit" disabled={submitting}>
              {submitting ? <><Spinner size="sm" animation="border" className="me-2" />Sending…</> : 'Send'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  )
}
