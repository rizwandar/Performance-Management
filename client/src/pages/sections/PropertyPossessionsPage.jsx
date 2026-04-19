import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const CATEGORIES = [
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'vehicle',     label: 'Vehicle' },
  { value: 'sentimental', label: 'Sentimental Item' },
  { value: 'pet',         label: 'Pet' },
  { value: 'other',       label: 'Other' },
]
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

const empty = { category: '', title: '', description: '', location: '', intended_recipient: '', notes: '' }

export default function PropertyPossessionsPage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)

  const load = () => {
    setLoading(true)
    axios.get(`${API}/sections/property-possessions`)
      .then(r => setItems(r.data))
      .catch(() => setError("We couldn't load your property records. Please try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      category:           item.category           || '',
      title:              item.title              || '',
      description:        item.description        || '',
      location:           item.location           || '',
      intended_recipient: item.intended_recipient || '',
      notes:              item.notes              || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return setError('Please add a title or name for this item.')
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/property-possessions/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/property-possessions`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Item updated.' : 'Item added.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this item from your records?')) return
    try {
      await axios.delete(`${API}/sections/property-possessions/${id}`)
      load()
    } catch {
      setError("We couldn't remove this item. Please try again.")
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
        <h3 style={{ color: 'var(--green-900)' }}>🏡 Property & Possessions</h3>
        <p className="text-muted">
          Record your property, vehicles, and meaningful belongings. Note who you'd like
          to receive them. This helps honour your wishes and prevents disputes.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add an item</Button>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🏡</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>Nothing recorded yet</p>
          <p className="text-muted small mb-0">
            Add your home, car, valuables, pets, or anything with sentimental meaning.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  {item.category && (
                    <span style={{
                      background: 'var(--gold-50)', color: 'var(--gold)',
                      border: '1px solid var(--gold-light)',
                      borderRadius: 6, padding: '1px 8px', fontSize: '0.78rem', fontWeight: 600,
                      display: 'inline-block', marginBottom: 6,
                    }}>
                      {CATEGORY_LABELS[item.category] || item.category}
                    </span>
                  )}
                  <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4 }}>{item.title}</p>
                  {item.description     && <p className="text-muted small mb-1">{item.description}</p>}
                  {item.location        && <p className="text-muted small mb-1">Location: {item.location}</p>}
                  {item.intended_recipient && (
                    <p className="small mb-1" style={{ color: 'var(--green-800)' }}>
                      Goes to: <span style={{ fontWeight: 600 }}>{item.intended_recipient}</span>
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
            {editing ? 'Edit item' : 'Add a property or possession'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={5}>
                <Form.Label>Category</Form.Label>
                <Form.Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select a category</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Form.Select>
              </Col>
              <Col md={7}>
                <Form.Label>Title / name <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Family home, 2019 Toyota Corolla, Grandma's ring" />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description or identifying details..." />
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Location</Form.Label>
                <Form.Control value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="Where it is kept or can be found" />
              </Col>
              <Col md={6}>
                <Form.Label>Intended recipient</Form.Label>
                <Form.Control value={form.intended_recipient}
                  onChange={e => setForm({ ...form, intended_recipient: e.target.value })}
                  placeholder="Who should receive this?" />
              </Col>
            </Row>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any other details: sentimental value, conditions, instructions..." />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add item'}
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
