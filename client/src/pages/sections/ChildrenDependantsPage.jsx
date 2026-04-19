import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const TYPES = [
  { value: 'child',           label: 'Child' },
  { value: 'pet',             label: 'Pet' },
  { value: 'elderly_parent',  label: 'Elderly parent / relative' },
  { value: 'other',           label: 'Other dependant' },
]

const TYPE_LABELS  = Object.fromEntries(TYPES.map(t => [t.value, t.label]))

const TYPE_ICONS = {
  child:          '👶',
  pet:            '🐾',
  elderly_parent: '🤍',
  other:          '🤝',
}

const empty = {
  name: '', type: 'child', date_of_birth: '', special_needs: '',
  preferred_guardian: '', guardian_contact: '',
  alternate_guardian: '', alternate_contact: '', notes: '',
}

export default function ChildrenDependantsPage() {
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
    axios.get(`${API}/sections/children-dependants`)
      .then(r => setItems(r.data))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      name:               item.name               || '',
      type:               item.type               || 'child',
      date_of_birth:      item.date_of_birth      || '',
      special_needs:      item.special_needs      || '',
      preferred_guardian: item.preferred_guardian || '',
      guardian_contact:   item.guardian_contact   || '',
      alternate_guardian: item.alternate_guardian || '',
      alternate_contact:  item.alternate_contact  || '',
      notes:              item.notes              || '',
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
        await axios.put(`${API}/sections/children-dependants/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/children-dependants`, form)
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
      await axios.delete(`${API}/sections/children-dependants/${id}`)
      load()
    } catch {
      setError("We couldn't remove this record. Please try again.")
    }
  }

  const formatDob = dob => {
    if (!dob) return null
    try { return new Date(dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) }
    catch { return dob }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
        <h3 style={{ color: 'var(--green-900)' }}>👶 Children & Dependants</h3>
        <p className="text-muted">
          Record care arrangements for anyone who depends on you, including children, pets, or elderly relatives.
          Include guardianship wishes and any special care needs so your loved ones know exactly what to do.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add a dependant</Button>
      </div>

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : loadFailed ? (
        <div className="section-placeholder">
          <p className="text-muted small">Couldn't load your records right now. Please refresh the page.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>👶</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No dependants recorded yet</p>
          <p className="text-muted small mb-0">
            Add anyone who would need care if you were no longer able to provide it, such as children, pets, or relatives.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => {
            const typeIcon = TYPE_ICONS[item.type] || '🤝'
            const typeLabel = TYPE_LABELS[item.type] || item.type
            return (
              <div key={item.id} className="section-card">
                <div className="d-flex justify-content-between align-items-start">
                  <div style={{ flex: 1 }}>
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span style={{ fontSize: '1.4rem' }}>{typeIcon}</span>
                      <div>
                        <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 0 }}>{item.name}</p>
                        <span className="text-muted small">{typeLabel}</span>
                        {item.date_of_birth && (
                          <span className="text-muted small ms-2">· Born {formatDob(item.date_of_birth)}</span>
                        )}
                      </div>
                    </div>

                    {item.special_needs && (
                      <div className="mb-2 p-2" style={{ background: 'var(--gold-50)', borderRadius: 6, border: '1px solid var(--gold-light)' }}>
                        <span className="small" style={{ color: 'var(--green-900)', fontWeight: 600 }}>Special needs / care: </span>
                        <span className="small text-muted">{item.special_needs}</span>
                      </div>
                    )}

                    {(item.preferred_guardian || item.guardian_contact) && (
                      <p className="small mb-1">
                        <span className="text-muted">Preferred guardian: </span>
                        <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{item.preferred_guardian || 'Not recorded'}</span>
                        {item.guardian_contact && (
                          <span className="text-muted ms-2">({item.guardian_contact})</span>
                        )}
                      </p>
                    )}

                    {(item.alternate_guardian || item.alternate_contact) && (
                      <p className="small mb-1">
                        <span className="text-muted">Alternate guardian: </span>
                        <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{item.alternate_guardian || 'Not recorded'}</span>
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
            )
          })}
        </div>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit record' : 'Add a dependant'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Name <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name" autoFocus />
              </Col>
              <Col md={3}>
                <Form.Label>Type</Form.Label>
                <Form.Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={3}>
                <Form.Label>Date of birth</Form.Label>
                <Form.Control type="date" value={form.date_of_birth}
                  onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Special needs / care requirements</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.special_needs}
                onChange={e => setForm({ ...form, special_needs: e.target.value })}
                placeholder="Medical conditions, dietary needs, routine, medications, vet details…" />
            </Form.Group>

            <div style={{ background: 'var(--green-50)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
              <p className="small mb-2" style={{ fontWeight: 600, color: 'var(--green-900)' }}>Guardianship wishes</p>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Label className="small">Preferred guardian</Form.Label>
                  <Form.Control value={form.preferred_guardian}
                    onChange={e => setForm({ ...form, preferred_guardian: e.target.value })}
                    placeholder="Name of preferred guardian" />
                </Col>
                <Col md={6}>
                  <Form.Label className="small">Their contact details</Form.Label>
                  <Form.Control value={form.guardian_contact}
                    onChange={e => setForm({ ...form, guardian_contact: e.target.value })}
                    placeholder="Phone or email" />
                </Col>
                <Col md={6}>
                  <Form.Label className="small">Alternate guardian</Form.Label>
                  <Form.Control value={form.alternate_guardian}
                    onChange={e => setForm({ ...form, alternate_guardian: e.target.value })}
                    placeholder="Name of alternate guardian" />
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
                placeholder="School, childcare, favourite things, any other important instructions…" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add dependant'}
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
