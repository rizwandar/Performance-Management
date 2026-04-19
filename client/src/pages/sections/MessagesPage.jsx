import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const empty = { recipient_name: '', relationship: '', message: '' }

export default function MessagesPage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)
  const [expanded, setExpanded]   = useState(null) // id of message shown in full

  const load = () => {
    setLoading(true)
    axios.get(`${API}/sections/messages`)
      .then(r => setItems(r.data))
      .catch(() => setError("We couldn't load your messages. Please try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      recipient_name: item.recipient_name || '',
      relationship:   item.relationship   || '',
      message:        item.message        || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.recipient_name.trim()) return setError("Please enter the recipient's name.")
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/messages/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/messages`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Message updated.' : 'Message saved.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this message. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return
    try {
      await axios.delete(`${API}/sections/messages/${id}`)
      load()
    } catch {
      setError("We couldn't delete this message. Please try again.")
    }
  }

  const PREVIEW_LENGTH = 160

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
        <h3 style={{ color: 'var(--green-900)' }}>💌 Messages to Loved Ones</h3>
        <p className="text-muted">
          Write the words you want them to hear. These messages will be kept safely
          and passed on to the people who matter most to you.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Write a message</Button>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>💌</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No messages written yet</p>
          <p className="text-muted small mb-0">
            Write personal letters or notes for the people you love.
            They'll be kept safely until the time comes.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => {
            const isExpanded = expanded === item.id
            const isLong = item.message && item.message.length > PREVIEW_LENGTH
            return (
              <div key={item.id} className="section-card">
                <div className="d-flex justify-content-between align-items-start">
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 2, fontSize: '1.05rem' }}>
                      To {item.recipient_name}
                      {item.relationship && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.9rem' }}>
                          ({item.relationship})
                        </span>
                      )}
                    </p>
                    {item.message && (
                      <div>
                        <p className="text-muted small mb-1" style={{ fontStyle: 'italic', lineHeight: 1.6 }}>
                          {isExpanded || !isLong
                            ? item.message
                            : item.message.slice(0, PREVIEW_LENGTH) + '…'}
                        </p>
                        {isLong && (
                          <button className="btn btn-link p-0"
                            style={{ fontSize: '0.8rem', color: 'var(--green-800)' }}
                            onClick={() => setExpanded(isExpanded ? null : item.id)}>
                            {isExpanded ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="d-flex gap-2 ms-3 flex-shrink-0">
                    <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                    <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Delete</Button>
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
            {editing ? `Edit message to ${editing.recipient_name}` : 'Write a message'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>To <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.recipient_name}
                  onChange={e => setForm({ ...form, recipient_name: e.target.value })}
                  placeholder="Name of the person this is for" />
              </Col>
              <Col md={6}>
                <Form.Label>Their relationship to you</Form.Label>
                <Form.Control value={form.relationship}
                  onChange={e => setForm({ ...form, relationship: e.target.value })}
                  placeholder="e.g. My daughter, my closest friend" />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Your message</Form.Label>
              <Form.Control
                as="textarea"
                rows={8}
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                placeholder="Write whatever is in your heart. There are no rules here."
                style={{ lineHeight: 1.7, fontSize: '0.95rem' }}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Save message'}
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
