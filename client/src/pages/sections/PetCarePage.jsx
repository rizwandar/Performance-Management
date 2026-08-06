import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'

const API = import.meta.env.VITE_API_URL

const empty = {
  name: '', age: '', special_needs: '',
  preferred_caretaker: '', caretaker_contact: '',
  alternate_caretaker: '', alternate_contact: '', notes: '',
}

export default function PetCarePage() {
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
    axios.get(`${API}/sections/pets`)
      .then(r => setItems(r.data))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      name:                 item.name                 || '',
      age:                  item.age                  || '',
      special_needs:        item.special_needs        || '',
      preferred_caretaker:  item.preferred_caretaker  || '',
      caretaker_contact:    item.caretaker_contact    || '',
      alternate_caretaker:  item.alternate_caretaker  || '',
      alternate_contact:    item.alternate_contact    || '',
      notes:                item.notes                || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Please enter a name.')
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/pets/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/pets`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Record updated.' : 'Record added.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this record?')) return
    try {
      await axios.delete(`${API}/sections/pets/${id}`)
      load()
    } catch {
      setError("We couldn't remove this record. Please try again.")
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
        eyebrow="Your People"
        headline="Care instructions for the pets who depend on you"
        highlight="depend on you"
        subtext="Record care arrangements for your pets, including feeding routines, vet details, and any special needs. Note who you'd like to take them in so your loved ones know exactly what to do."
        cta={{ label: '+ Add a pet', onClick: openAdd }}
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
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🐾</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No pets recorded yet</p>
          <p className="text-muted small mb-0">
            Add any pets who would need care if you were no longer able to provide it.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span style={{ fontSize: '1.4rem' }}>🐾</span>
                    <div>
                      <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 0 }}>{item.name}</p>
                      {item.age && <span className="text-muted small">{item.age}</span>}
                    </div>
                  </div>

                  {item.special_needs && (
                    <div className="mb-2 p-2" style={{ background: 'var(--gold-50)', borderRadius: 6, border: '1px solid var(--gold-light)' }}>
                      <span className="small" style={{ color: 'var(--green-900)', fontWeight: 600 }}>Special needs / care: </span>
                      <span className="small text-muted">{item.special_needs}</span>
                    </div>
                  )}

                  {(item.preferred_caretaker || item.caretaker_contact) && (
                    <p className="small mb-1">
                      <span className="text-muted">Preferred caretaker: </span>
                      <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{item.preferred_caretaker || 'Not recorded'}</span>
                      {item.caretaker_contact && (
                        <span className="text-muted ms-2">({item.caretaker_contact})</span>
                      )}
                    </p>
                  )}

                  {(item.alternate_caretaker || item.alternate_contact) && (
                    <p className="small mb-1">
                      <span className="text-muted">Alternate caretaker: </span>
                      <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{item.alternate_caretaker || 'Not recorded'}</span>
                      {item.alternate_contact && (
                        <span className="text-muted ms-2">({item.alternate_contact})</span>
                      )}
                    </p>
                  )}

                  {item.notes && (
                    <p className="text-muted small mb-0 mt-1" style={{ fontStyle: 'italic' }}>{item.notes}</p>
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
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit record' : 'Add a pet'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={8}>
                <Form.Label>Name <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Pet's name" autoFocus />
              </Col>
              <Col md={4}>
                <Form.Label>Age</Form.Label>
                <Form.Control value={form.age}
                  onChange={e => setForm({ ...form, age: e.target.value })}
                  placeholder="e.g. 3 years" />
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Special needs / care instructions</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.special_needs}
                onChange={e => setForm({ ...form, special_needs: e.target.value })}
                placeholder="Feeding routine, medications, vet details, breed, microchip number…" />
            </Form.Group>

            <div style={{ background: 'var(--green-50)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
              <p className="small mb-2" style={{ fontWeight: 600, color: 'var(--green-900)' }}>Caretaker wishes</p>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Label className="small">Preferred caretaker</Form.Label>
                  <Form.Control value={form.preferred_caretaker}
                    onChange={e => setForm({ ...form, preferred_caretaker: e.target.value })}
                    placeholder="Name of preferred caretaker" />
                </Col>
                <Col md={6}>
                  <Form.Label className="small">Their contact details</Form.Label>
                  <Form.Control value={form.caretaker_contact}
                    onChange={e => setForm({ ...form, caretaker_contact: e.target.value })}
                    placeholder="Phone or email" />
                </Col>
                <Col md={6}>
                  <Form.Label className="small">Alternate caretaker</Form.Label>
                  <Form.Control value={form.alternate_caretaker}
                    onChange={e => setForm({ ...form, alternate_caretaker: e.target.value })}
                    placeholder="Name of alternate caretaker" />
                </Col>
                <Col md={6}>
                  <Form.Label className="small">Their contact details</Form.Label>
                  <Form.Control value={form.alternate_contact}
                    onChange={e => setForm({ ...form, alternate_contact: e.target.value })}
                    placeholder="Phone or email" />
                </Col>
              </Row>
            </div>

            <Form.Group>
              <Form.Label>Additional notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Favorite things, routines, anything else your pet's caretaker should know…" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add pet'}
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
