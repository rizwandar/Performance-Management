import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'
import DictateButton from '../../components/DictateButton'
import DictationDisclosure from '../../components/DictationDisclosure'
import { useDictation } from '../../hooks/useDictation'

const API = import.meta.env.VITE_API_URL

const empty = { name: '', description: '', notes: '' }

export default function UnfinishedBusinessPage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)
  const [expanded, setExpanded]   = useState(null)

  const [loadFailed, setLoadFailed] = useState(false)

  const descriptionDictation = useDictation({ getValue: () => form.description, setValue: v => setForm(f => ({ ...f, description: v })) })
  const notesDictation       = useDictation({ getValue: () => form.notes,       setValue: v => setForm(f => ({ ...f, notes: v })) })
  const closeModal = () => {
    descriptionDictation.stopDictation()
    notesDictation.stopDictation()
    setShowModal(false)
  }

  const load = () => {
    setLoading(true)
    setLoadFailed(false)
    axios.get(`${API}/sections/unfinished-business`)
      .then(r => setItems(r.data))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      name:        item.name        || '',
      description: item.description || '',
      notes:       item.notes       || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Please enter a name or topic.')
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/unfinished-business/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/unfinished-business`, form)
      }
      descriptionDictation.stopDictation()
      notesDictation.stopDictation()
      setShowModal(false)
      setSuccess(editing ? 'Entry updated.' : 'Entry saved.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return
    try {
      await axios.delete(`${API}/sections/unfinished-business/${id}`)
      load()
    } catch {
      setError("We couldn't delete this entry. Please try again.")
    }
  }

  const PREVIEW_LENGTH = 160

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
      </div>

      <SectionHero
        eyebrow="Your Legacy"
        headline="Reconciliation, apologies, and loose ends"
        highlight="loose ends"
        subtext="Record the relationships you'd like mended, the apologies you want made, and anything left unsaid or undone. This is kept separate from your Bucket List and your Messages to Loved Ones, so it stays about the things you'd still like to set right."
        cta={{ label: '+ Add an entry', onClick: openAdd }}
        secondaryAction={<ShareSectionTrigger section="unfinished_business" sectionLabel="Unfinished Business" />}
      />

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : loadFailed ? (
        <div className="section-placeholder">
          <p className="text-muted small">Couldn't load your entries right now. Please refresh the page.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🕊️</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>Nothing recorded yet</p>
          <p className="text-muted small mb-0">
            Note any relationship you'd like mended, an apology you want made, or anything else left unsaid.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => {
            const isExpanded = expanded === item.id
            const isLong = item.description && item.description.length > PREVIEW_LENGTH
            return (
              <div key={item.id} className="section-card">
                <div className="d-flex justify-content-between align-items-start">
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 2, fontSize: '1.05rem' }}>
                      {item.name}
                    </p>
                    {item.description && (
                      <div>
                        <p className="text-muted small mb-1" style={{ fontStyle: 'italic', lineHeight: 1.6 }}>
                          {isExpanded || !isLong
                            ? item.description
                            : item.description.slice(0, PREVIEW_LENGTH) + '…'}
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
                    {item.notes && (
                      <p className="text-muted small mb-0 mt-1" style={{ fontStyle: 'italic' }}>{item.notes}</p>
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

      <Modal show={showModal} onHide={closeModal} centered size="lg">
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? `Edit entry` : 'Add an entry'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Person or topic <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
              <Form.Control value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Name of the person, or a short topic, e.g. My brother, The old business partnership"
                autoFocus />
            </Form.Group>
            <Form.Group className="mb-3">
              <div className="d-flex justify-content-between align-items-center">
                <Form.Label className="mb-0">What's unfinished</Form.Label>
                <DictateButton dictation={descriptionDictation} />
              </div>
              <Form.Control
                as="textarea"
                rows={6}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the apology, the reconciliation, or the loose end you'd like addressed."
                style={{ lineHeight: 1.7, fontSize: '0.95rem' }}
              />
              {descriptionDictation.supported && <DictationDisclosure />}
            </Form.Group>
            <Form.Group>
              <div className="d-flex justify-content-between align-items-center">
                <Form.Label className="mb-0">Additional notes</Form.Label>
                <DictateButton dictation={notesDictation} />
              </div>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything else you'd like recorded alongside this." />
              {notesDictation.supported && <DictationDisclosure />}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Save entry'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}

      <ShareSectionHistory section="unfinished_business" />

      <SectionFooterNav sectionId="unfinished_business" />
    </div>
  )
}
