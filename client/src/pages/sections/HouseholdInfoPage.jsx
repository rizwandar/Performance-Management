import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const CATEGORIES = [
  { value: 'utility',      label: 'Utility (electricity, gas, water)' },
  { value: 'insurance',    label: 'Insurance' },
  { value: 'subscription', label: 'Subscription / streaming' },
  { value: 'regular_bill', label: 'Regular bill' },
  { value: 'access_code',  label: 'Access code / password' },
  { value: 'other',        label: 'Other' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

const CATEGORY_BADGES = {
  utility:      { bg: '#EFF6FF', color: '#1D4ED8' },
  insurance:    { bg: '#F0FDF4', color: '#15803D' },
  subscription: { bg: '#FDF4FF', color: '#7E22CE' },
  regular_bill: { bg: '#FFF7ED', color: '#C2410C' },
  access_code:  { bg: '#FEF9C3', color: '#854D0E' },
  other:        { bg: 'var(--parchment-dark)', color: 'var(--text-muted)' },
}

const empty = { category: '', title: '', provider: '', account_reference: '', contact: '', notes: '' }

export default function HouseholdInfoPage() {
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
    axios.get(`${API}/sections/household-info`)
      .then(r => setItems(r.data))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      category:          item.category          || '',
      title:             item.title             || '',
      provider:          item.provider          || '',
      account_reference: item.account_reference || '',
      contact:           item.contact           || '',
      notes:             item.notes             || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return setError('Please add a title for this entry.')
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/household-info/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/household-info`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Entry updated.' : 'Entry added.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this entry?')) return
    try {
      await axios.delete(`${API}/sections/household-info/${id}`)
      load()
    } catch {
      setError("We couldn't remove this entry. Please try again.")
    }
  }

  // Group items by category for display
  const grouped = {}
  items.forEach(item => {
    const cat = item.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  })

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
        <h3 style={{ color: 'var(--green-900)' }}>🔑 Practical Household Information</h3>
        <p className="text-muted">
          Utility providers, insurance policies, regular bills, alarm codes, and the day-to-day details
          that keep your home running. Your family will need these to keep things going.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add an entry</Button>
      </div>

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : loadFailed ? (
        <div className="section-placeholder">
          <p className="text-muted small">Couldn't load your information right now. Please refresh the page.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🔑</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>Nothing recorded yet</p>
          <p className="text-muted small mb-0">
            Add utility providers, insurance policies, subscriptions, access codes, and other household details.
          </p>
        </div>
      ) : (
        <div>
          {Object.entries(grouped).map(([cat, catItems]) => {
            const badge = CATEGORY_BADGES[cat] || CATEGORY_BADGES.other
            return (
              <div key={cat} className="mb-4">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span style={{
                    padding: '3px 12px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600,
                    background: badge.bg, color: badge.color,
                  }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <span className="text-muted small">({catItems.length})</span>
                </div>
                {catItems.map(item => (
                  <div key={item.id} className="section-card">
                    <div className="d-flex justify-content-between align-items-start">
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 2 }}>{item.title}</p>
                        {item.provider && (
                          <p className="text-muted small mb-1">{item.provider}</p>
                        )}
                        {item.account_reference && (
                          <p className="small mb-1">
                            <span className="text-muted">Ref / code: </span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--green-900)' }}>{item.account_reference}</span>
                          </p>
                        )}
                        {item.contact && (
                          <p className="text-muted small mb-1">Contact: {item.contact}</p>
                        )}
                        {item.notes && (
                          <p className="text-muted small mb-0" style={{ fontStyle: 'italic' }}>{item.notes}</p>
                        )}
                      </div>
                      <div className="d-flex gap-2 ms-3 flex-shrink-0">
                        <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                        <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Remove</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit entry' : 'Add household information'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Category</Form.Label>
                <Form.Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select a category…</option>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label>Title <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Electricity – Origin Energy, Home Alarm" autoFocus />
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Provider / Company</Form.Label>
                <Form.Control value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}
                  placeholder="e.g. Origin Energy, Allianz, Foxtel" />
              </Col>
              <Col md={6}>
                <Form.Label>Account number / Reference / Code</Form.Label>
                <Form.Control value={form.account_reference} onChange={e => setForm({ ...form, account_reference: e.target.value })}
                  placeholder="Account #, policy #, alarm code, etc." />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Contact phone or email</Form.Label>
              <Form.Control value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })}
                placeholder="e.g. 13 24 61 or support@provider.com" />
            </Form.Group>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional details, instructions, or reminders…" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add entry'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
      </div>
    </div>
  )
}
