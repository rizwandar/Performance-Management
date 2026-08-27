import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'

const API = import.meta.env.VITE_API_URL

const empty = {
  policy_type: '', provider: '', policy_number: '',
  contact: '', beneficiary: '', notes: '',
}

// IDEA-29: Insurance. A flat list of policy entries, matching the shape of
// the other simple sections (e.g. Property & Possessions), NOT the 7-way
// category split some competitor products use. Unlike Property, Financial
// Affairs, and the other vault-protected sections it sits alongside on the
// dashboard, Insurance is deliberately NOT vault-protected, so this page has
// no vault lock/unlock screens - it talks to the API directly, same pattern
// as PetCarePage.
export default function InsurancePage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)

  const [loadFailed, setLoadFailed] = useState(false)

  const load = () => {
    setLoading(true)
    setLoadFailed(false)
    axios.get(`${API}/sections/insurance`)
      .then(r => setItems(r.data))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      policy_type:   item.policy_type   || '',
      provider:      item.provider      || '',
      policy_number: item.policy_number || '',
      contact:       item.contact       || '',
      beneficiary:   item.beneficiary   || '',
      notes:         item.notes         || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.policy_type.trim() && !form.provider.trim()) {
      return setError('Please add at least a policy type or provider.')
    }
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/insurance/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/insurance`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Policy updated.' : 'Policy added.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this policy from your records?')) return
    try {
      await axios.delete(`${API}/sections/insurance/${id}`)
      load()
    } catch {
      setError("We couldn't remove this policy. Please try again.")
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
      </div>

      <SectionHero
        eyebrow="Your Affairs"
        headline="Your insurance policies, all in one place"
        highlight="all in one place"
        subtext="Record your life, health, home, auto, or other insurance policies, along with who to contact and who benefits, so your loved ones know exactly where to look."
        cta={{ label: '+ Add a policy', onClick: openAdd }}
        secondaryAction={<ShareSectionTrigger section="insurance_items" sectionLabel="Insurance" />}
      />

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : loadFailed ? (
        <div className="section-placeholder">
          <p className="text-muted small">Couldn't load your records right now. Please refresh the page.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🛡️</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No policies recorded yet</p>
          <p className="text-muted small mb-0">
            Add any life, health, home, auto, or other insurance policies you hold.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  {item.policy_type && (
                    <span style={{
                      background: 'var(--gold-50)', color: 'var(--gold)',
                      border: '1px solid var(--gold-light)',
                      borderRadius: 6, padding: '1px 8px', fontSize: '0.78rem', fontWeight: 600,
                      display: 'inline-block', marginBottom: 6,
                    }}>
                      {item.policy_type}
                    </span>
                  )}
                  <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4 }}>
                    {item.provider || 'Unnamed policy'}
                  </p>
                  {item.policy_number && <p className="text-muted small mb-1">Policy number: {item.policy_number}</p>}
                  {item.contact       && <p className="text-muted small mb-1">Contact: {item.contact}</p>}
                  {item.beneficiary && (
                    <p className="small mb-1" style={{ color: 'var(--green-800)' }}>
                      Beneficiary: <span style={{ fontWeight: 600 }}>{item.beneficiary}</span>
                    </p>
                  )}
                  {item.notes && <p className="text-muted small mb-0" style={{ fontStyle: 'italic' }}>{item.notes}</p>}
                </div>
                <div className="d-flex gap-2 ms-3 flex-shrink-0">
                  <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                  <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Remove</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit policy' : 'Add an insurance policy'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={5}>
                <Form.Label>Policy type</Form.Label>
                <Form.Control value={form.policy_type} onChange={e => setForm({ ...form, policy_type: e.target.value })}
                  placeholder="e.g. Life, Health, Home, Auto" />
              </Col>
              <Col md={7}>
                <Form.Label>Provider</Form.Label>
                <Form.Control value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}
                  placeholder="e.g. State Farm, Blue Cross" />
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Policy number</Form.Label>
                <Form.Control value={form.policy_number}
                  onChange={e => setForm({ ...form, policy_number: e.target.value })}
                  placeholder="Policy or account number" />
              </Col>
              <Col md={6}>
                <Form.Label>Contact</Form.Label>
                <Form.Control value={form.contact}
                  onChange={e => setForm({ ...form, contact: e.target.value })}
                  placeholder="Agent or company contact details" />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Beneficiary</Form.Label>
              <Form.Control value={form.beneficiary}
                onChange={e => setForm({ ...form, beneficiary: e.target.value })}
                placeholder="Who this policy benefits" />
            </Form.Group>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any other details: coverage amount, renewal date, where documents are kept..." />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add policy'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}

      <ShareSectionHistory section="insurance_items" />

      <SectionFooterNav sectionId="insurance_items" />
    </div>
  )
}
