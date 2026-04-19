import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const empty = { name: '', relationship: '', email: '', phone: '', notified_by: '', notes: '' }

export default function PeopleToNotifyPage() {
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
    axios.get(`${API}/sections/people-to-notify`)
      .then(r => setItems(r.data))
      .catch(() => setError("We couldn't load your list. Please try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      name:         item.name         || '',
      relationship: item.relationship || '',
      email:        item.email        || '',
      phone:        item.phone        || '',
      notified_by:  item.notified_by  || '',
      notes:        item.notes        || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Please enter this person\'s name.')
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/people-to-notify/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/people-to-notify`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Person updated.' : 'Person added.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this person from the list?')) return
    try {
      await axios.delete(`${API}/sections/people-to-notify/${id}`)
      load()
    } catch {
      setError("We couldn't remove this person. Please try again.")
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
        <h3 style={{ color: 'var(--green-900)' }}>👥 People to Notify</h3>
        <p className="text-muted">
          When the time comes, who needs to know? List the people you'd want notified,
          and, just as importantly, who will be responsible for reaching each of them.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add a person</Button>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>👥</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No one listed yet</p>
          <p className="text-muted small mb-0">
            Add friends, family, colleagues, or anyone else who should be told.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 2 }}>
                    {item.name}
                    {item.relationship && (
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.9rem' }}>
                        {item.relationship}
                      </span>
                    )}
                  </p>
                  {(item.email || item.phone) && (
                    <p className="text-muted small mb-1">
                      {[item.email, item.phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {item.notified_by && (
                    <p className="small mb-1" style={{ color: 'var(--green-800)' }}>
                      Notified by: <span style={{ fontWeight: 600 }}>{item.notified_by}</span>
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
            {editing ? 'Edit person' : 'Add a person to notify'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Name <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name" />
              </Col>
              <Col md={6}>
                <Form.Label>Relationship</Form.Label>
                <Form.Control value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })}
                  placeholder="e.g. Sister, best friend, colleague" />
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com" />
              </Col>
              <Col md={6}>
                <Form.Label>Phone</Form.Label>
                <Form.Control value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="e.g. 0400 123 456" />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Who will notify them?</Form.Label>
              <Form.Control value={form.notified_by} onChange={e => setForm({ ...form, notified_by: e.target.value })}
                placeholder="e.g. My daughter Sarah, my solicitor" />
              <Form.Text className="text-muted">Name the person responsible for making this call.</Form.Text>
            </Form.Group>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything useful to know about reaching or telling this person..." />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add person'}
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
