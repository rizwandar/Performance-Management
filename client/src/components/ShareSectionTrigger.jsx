import { useState } from 'react'
import { Button, Modal, Form, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import PasswordInput from './PasswordInput'
import { emitSectionShareChanged } from '../utils/sectionShareEvents'

const API = import.meta.env.VITE_API_URL

const emptyForm = { recipient_name: '', recipient_email: '', vault_password: '' }

// Compact "Share this section" entry point: a small link (meant to sit
// beside the section's own primary action, e.g. "+ Add a person") that
// opens the name/email (+ vault password, for vault-protected sections)
// modal. The shared-with history + revoke list lives separately at the
// bottom of the page (see ShareSectionHistory) — the two talk to each other
// via sectionShareEvents rather than shared state, since they're no longer
// next to each other in the layout.
export default function ShareSectionTrigger({ section, sectionLabel, isVaultSection = false }) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState('')

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
      emitSectionShareChanged(section)
    } catch (err) {
      setModalError(err.response?.data?.error || "We couldn't send this share. Please try again.")
    }
    setSubmitting(false)
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-link p-0 small"
        style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem' }}
        onClick={openModal}>
        Share this section
      </button>

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
                <PasswordInput value={form.vault_password} onChange={set('vault_password')} placeholder="Required to share vault-protected information" />
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
    </>
  )
}
