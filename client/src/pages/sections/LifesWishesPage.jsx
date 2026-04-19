import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner, Badge } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const CATEGORIES = [
  { value: 'travel',       label: 'Travel' },
  { value: 'experience',   label: 'Experience' },
  { value: 'achievement',  label: 'Achievement' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'giving_back',  label: 'Giving Back' },
  { value: 'creativity',   label: 'Creativity' },
  { value: 'other',        label: 'Other' },
]

const STATUS_CONFIG = {
  dream:     { label: 'Dream',     bg: 'var(--parchment-dark)', color: 'var(--text-muted)' },
  planning:  { label: 'Planning',  bg: '#FEF3C7',               color: '#92400E' },
  completed: { label: 'Done ✓',    bg: 'var(--green-50)',        color: 'var(--green-800)' },
}

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))
const empty = { title: '', description: '', category: '', status: 'dream', notes: '' }

export default function LifesWishesPage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)
  const [filter, setFilter]       = useState('all')  // 'all' | 'dream' | 'planning' | 'completed'

  const load = () => {
    setLoading(true)
    axios.get(`${API}/sections/lifes-wishes`)
      .then(r => setItems(r.data))
      .catch(() => setError("We couldn't load your wishes. Please try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({ title: item.title || '', description: item.description || '', category: item.category || '', status: item.status || 'dream', notes: item.notes || '' })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return setError('Please add a title for this wish.')
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/lifes-wishes/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/lifes-wishes`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Wish updated.' : 'Wish added.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const quickStatus = async (item, newStatus) => {
    try {
      await axios.put(`${API}/sections/lifes-wishes/${item.id}`, { ...item, status: newStatus })
      load()
    } catch {
      setError("Couldn't update status.")
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this wish?')) return
    try {
      await axios.delete(`${API}/sections/lifes-wishes/${id}`)
      load()
    } catch {
      setError("We couldn't remove this wish.")
    }
  }

  const counts = { dream: 0, planning: 0, completed: 0 }
  items.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++ })

  const visible = filter === 'all' ? items : items.filter(i => i.status === filter)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
        <h3 style={{ color: 'var(--green-900)' }}>✨ My Bucket List</h3>
        <p className="text-muted">
          The things you hope to do, see, give, and become. Some are dreams, some are in motion,
          some are already ticked off. All of them say something about who you are.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      {/* Status filter tabs */}
      {items.length > 0 && (
        <div className="d-flex gap-2 mb-4 flex-wrap">
          {[
            { key: 'all',       label: `All (${items.length})` },
            { key: 'dream',     label: `Dreams (${counts.dream})` },
            { key: 'planning',  label: `Planning (${counts.planning})` },
            { key: 'completed', label: `Done (${counts.completed})` },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: '1px solid',
                fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                borderColor: filter === f.key ? 'var(--green-800)' : 'var(--border)',
                background: filter === f.key ? 'var(--green-800)' : 'transparent',
                color: filter === f.key ? '#fff' : 'var(--text-muted)',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add a wish</Button>
      </div>

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>✨</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No wishes recorded yet</p>
          <p className="text-muted small mb-0">
            Add the experiences, places, relationships, and achievements you want to pursue.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted text-center py-3">No wishes in this category yet.</p>
      ) : (
        <div>
          {visible.map(item => {
            const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.dream
            return (
              <div key={item.id} className="section-card">
                <div className="d-flex justify-content-between align-items-start">
                  <div style={{ flex: 1 }}>
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <span style={{
                        padding: '2px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600,
                        background: statusCfg.bg, color: statusCfg.color,
                      }}>
                        {statusCfg.label}
                      </span>
                      {item.category && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem',
                          background: 'var(--gold-50)', color: 'var(--gold)', border: '1px solid var(--gold-light)',
                        }}>
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      )}
                    </div>
                    <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 2 }}>{item.title}</p>
                    {item.description && <p className="text-muted small mb-1">{item.description}</p>}
                    {item.notes && <p className="text-muted small mb-1" style={{ fontStyle: 'italic' }}>{item.notes}</p>}

                    {/* Quick status buttons */}
                    {item.status !== 'completed' && (
                      <div className="d-flex gap-2 mt-2">
                        {item.status === 'dream' && (
                          <button className="btn btn-link p-0"
                            style={{ fontSize: '0.8rem', color: '#92400E', textDecoration: 'none' }}
                            onClick={() => quickStatus(item, 'planning')}>
                            → Mark as planning
                          </button>
                        )}
                        <button className="btn btn-link p-0"
                          style={{ fontSize: '0.8rem', color: 'var(--green-800)', textDecoration: 'none' }}
                          onClick={() => quickStatus(item, 'completed')}>
                          ✓ Mark as done
                        </button>
                      </div>
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

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit wish' : 'Add a wish'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Title <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
              <Form.Control value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. See the Northern Lights, Write my memoir, Learn to surf" autoFocus />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description / Notes</Form.Label>
              <Form.Control as="textarea" rows={4} value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="A bit more about this wish: where, with whom, why it matters, any plans..." />
            </Form.Group>
            <Form.Group>
              <Form.Label>Status</Form.Label>
              <Form.Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="dream">Dream (not started yet)</option>
                <option value="planning">Planning (working on it)</option>
                <option value="completed">Done (achieved!)</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add wish'}
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
