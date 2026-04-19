import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner, Badge } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Section definitions — match section_id keys used in permissions
// ---------------------------------------------------------------------------
const SECTIONS = [
  { id: 'legal_documents',   label: 'Legal Documents' },
  { id: 'financial_items',   label: 'Financial Affairs' },
  { id: 'funeral_wishes',    label: 'Funeral Wishes' },
  { id: 'medical_wishes',    label: 'Medical Wishes' },
  { id: 'people_to_notify',  label: 'People to Notify' },
  { id: 'property_items',    label: 'Property & Possessions' },
  { id: 'personal_messages', label: 'Messages to Loved Ones' },
  { id: 'songs_that_define_me', label: 'Songs That Define Me' },
  { id: 'life_wishes',       label: "My Bucket List" },
]

const POSITIONS = [1, 2, 3]

const emptyContact = { sequence: '', name: '', relationship: '', email: '', phone: '' }

export default function TrustedContactsPage() {
  const navigate = useNavigate()
  const [contacts, setContacts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  // Add/edit modal
  const [showModal, setShowModal]     = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [form, setForm]               = useState(emptyContact)
  const [permissions, setPermissions] = useState([])
  const [saving, setSaving]           = useState(false)
  const [modalError, setModalError]   = useState('')

  // Send link modal
  const [showLinkModal, setShowLinkModal]   = useState(false)
  const [linkContact, setLinkContact]       = useState(null)
  const [sendingLink, setSendingLink]       = useState(false)
  const [linkResult, setLinkResult]         = useState(null)
  const [linkError, setLinkError]           = useState('')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)

  const load = () => {
    setLoading(true)
    axios.get(`${API}/trusted-contacts`)
      .then(r => setContacts(r.data))
      .catch(() => setError("We couldn't load your trusted contacts."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // ── Open add modal ──────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingContact(null)
    const taken = contacts.map(c => c.sequence)
    const next  = POSITIONS.find(p => !taken.includes(p)) || ''
    setForm({ ...emptyContact, sequence: next })
    setPermissions([])
    setModalError('')
    setShowModal(true)
  }

  // ── Open edit modal ─────────────────────────────────────────────────────
  const openEdit = (contact) => {
    setEditingContact(contact)
    setForm({ sequence: contact.sequence, name: contact.name, relationship: contact.relationship || '', email: contact.email || '', phone: contact.phone || '' })
    setPermissions(contact.visible_sections || [])
    setModalError('')
    setShowModal(true)
  }

  const togglePermission = (id) => {
    setPermissions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  // ── Save contact ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) return setModalError('Name is required.')
    if (!editingContact && !form.sequence) return setModalError('Please choose a position (1, 2 or 3).')
    setSaving(true)
    setModalError('')
    try {
      let savedContact

      if (editingContact) {
        // Update details
        const r = await axios.put(`${API}/trusted-contacts/${editingContact.id}`, {
          name: form.name, relationship: form.relationship, email: form.email, phone: form.phone,
        })
        savedContact = r.data
        // Update permissions
        await axios.put(`${API}/trusted-contacts/${editingContact.id}/permissions`, { visible_sections: permissions })
      } else {
        const r = await axios.post(`${API}/trusted-contacts`, {
          sequence: form.sequence,
          name: form.name,
          relationship: form.relationship,
          email: form.email,
          phone: form.phone,
          visible_sections: permissions,
        })
        savedContact = r.data
      }

      setShowModal(false)
      setSuccess(editingContact ? `${form.name}'s details updated.` : `${form.name} added as a trusted contact.`)
      load()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setModalError(err.response?.data?.error || 'Could not save. Please try again.')
    }
    setSaving(false)
  }

  // ── Delete contact ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true)
    try {
      await axios.delete(`${API}/trusted-contacts/${deleteTarget.id}`)
      setDeleteTarget(null)
      setSuccess(`${deleteTarget.name} has been removed.`)
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError("We couldn't remove this contact. Please try again.")
    }
    setDeleting(false)
  }

  // ── Send access link ───────────────────────────────────────────────────
  const openSendLink = (contact) => {
    setLinkContact(contact)
    setLinkResult(null)
    setLinkError('')
    setShowLinkModal(true)
  }

  const handleSendLink = async () => {
    setSendingLink(true)
    setLinkError('')
    try {
      const r = await axios.post(`${API}/trusted-contacts/${linkContact.id}/access-link`)
      setLinkResult(r.data)
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Could not generate the link. Please try again.')
    }
    setSendingLink(false)
  }

  // ── Available sequence slots ───────────────────────────────────────────
  const takenSequences = contacts.map(c => c.sequence)
  const canAddMore     = contacts.length < 3

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
        <h3 style={{ color: 'var(--green-900)' }}>Trusted Contacts</h3>
        <p className="text-muted">
          These are the people who should be notified and given access to your plans when the time comes.
          You can add up to 3 trusted contacts and choose exactly what each of them can see.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error   && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : (
        <>
          {/* ── Contact slots ─────────────────────────────────────────── */}
          <div className="mb-4">
            {POSITIONS.map(pos => {
              const contact = contacts.find(c => c.sequence === pos)
              return (
                <div key={pos} className="card mb-3" style={{ borderLeft: '4px solid var(--gold)' }}>
                  <div className="card-body">
                    {contact ? (
                      <div>
                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{
                                background: 'var(--gold)', color: '#fff', borderRadius: '50%',
                                width: 26, height: 26, display: 'inline-flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                              }}>{pos}</span>
                              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--green-900)' }}>
                                {contact.name}
                              </span>
                              {contact.relationship && (
                                <span className="text-muted small">({contact.relationship})</span>
                              )}
                            </div>
                            <div className="text-muted small" style={{ paddingLeft: 34 }}>
                              {contact.email && <span className="me-3">✉ {contact.email}</span>}
                              {contact.phone && <span>📞 {contact.phone}</span>}
                            </div>
                            {/* Section permissions */}
                            {contact.visible_sections?.length > 0 ? (
                              <div style={{ paddingLeft: 34, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {contact.visible_sections.map(sid => {
                                  const s = SECTIONS.find(x => x.id === sid)
                                  return s ? (
                                    <Badge key={sid} style={{ background: 'var(--green-100)', color: 'var(--green-900)', fontWeight: 500, fontSize: '0.75rem' }}>
                                      {s.label}
                                    </Badge>
                                  ) : null
                                })}
                              </div>
                            ) : (
                              <p className="text-muted small mb-0" style={{ paddingLeft: 34, marginTop: 6 }}>
                                No sections shared yet. Edit to grant access.
                              </p>
                            )}
                          </div>

                          <div className="d-flex gap-2 flex-wrap">
                            <Button size="sm" variant="outline-primary" onClick={() => openEdit(contact)}>Edit</Button>
                            <Button size="sm" variant="primary" onClick={() => openSendLink(contact)}
                              disabled={!contact.email}>
                              Send access link
                            </Button>
                            <Button size="sm" variant="outline-danger" onClick={() => setDeleteTarget(contact)}>Remove</Button>
                          </div>
                        </div>
                        {!contact.email && (
                          <p className="text-muted small mb-0 mt-2" style={{ paddingLeft: 34, fontStyle: 'italic' }}>
                            Add an email address to send an access link.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="d-flex align-items-center gap-3">
                        <span style={{
                          background: 'var(--border)', color: 'var(--text-muted)', borderRadius: '50%',
                          width: 26, height: 26, display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                        }}>{pos}</span>
                        <span className="text-muted" style={{ flex: 1 }}>Position {pos}: empty</span>
                        <Button size="sm" variant="outline-primary" onClick={openAdd}>
                          + Add contact
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Explainer ─────────────────────────────────────────────── */}
          <div style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-light)', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 6 }}>How trusted contact access works</p>
            <ul className="text-muted small mb-0" style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
              <li>When you click <strong>Send access link</strong>, a secure, time-limited link is emailed to your contact.</li>
              <li>The link is valid for <strong>72 hours</strong> and gives read-only access to the sections you have shared.</li>
              <li>Your digital credentials (passwords) are never included. They are encrypted and only you can access them.</li>
              <li>You can send a new link at any time. Generating a new link will invalidate the previous one.</li>
              <li>The system can also notify your contacts automatically if you have not logged in for your chosen inactivity period.</li>
            </ul>
          </div>
        </>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editingContact ? `Edit: ${editingContact.name}` : 'Add a trusted contact'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {modalError && <Alert variant="danger">{modalError}</Alert>}

          <Row className="g-3">
            {!editingContact && (
              <Col xs={12} sm={3}>
                <Form.Group>
                  <Form.Label>Position</Form.Label>
                  <Form.Select value={form.sequence}
                    onChange={e => setForm(f => ({ ...f, sequence: Number(e.target.value) }))}>
                    <option value="">Select position...</option>
                    {POSITIONS.filter(p => !takenSequences.includes(p)).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            )}
            <Col xs={12} sm={editingContact ? 6 : 5}>
              <Form.Group>
                <Form.Label>Full name <span style={{ color: 'red' }}>*</span></Form.Label>
                <Form.Control value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sarah Johnson" />
              </Form.Group>
            </Col>
            <Col xs={12} sm={editingContact ? 6 : 4}>
              <Form.Group>
                <Form.Label>Relationship</Form.Label>
                <Form.Control value={form.relationship}
                  onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
                  placeholder="e.g. Spouse, Sister, Solicitor" />
              </Form.Group>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Group>
                <Form.Label>Email address</Form.Label>
                <Form.Control type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="needed to send access link" />
              </Form.Group>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Group>
                <Form.Label>Phone number</Form.Label>
                <Form.Control value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="optional" />
              </Form.Group>
            </Col>
          </Row>

          {/* Section permissions */}
          <hr style={{ borderColor: 'var(--border)', margin: '20px 0 16px' }} />
          <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 10, fontSize: '0.95rem' }}>
            What can this contact see?
          </p>
          <p className="text-muted small mb-3">
            Tick the sections you want this person to have read-only access to when you send them a link.
          </p>
          <Row className="g-2">
            {SECTIONS.map(s => (
              <Col xs={12} sm={6} key={s.id}>
                <Form.Check
                  type="checkbox"
                  id={`perm-${s.id}`}
                  label={s.label}
                  checked={permissions.includes(s.id)}
                  onChange={() => togglePermission(s.id)}
                />
              </Col>
            ))}
          </Row>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editingContact ? 'Save changes' : 'Add contact'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Send Access Link Modal ─────────────────────────────────────────── */}
      <Modal show={showLinkModal} onHide={() => setShowLinkModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            Send access link to {linkContact?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {linkError && <Alert variant="danger">{linkError}</Alert>}

          {!linkResult ? (
            <>
              <p>
                This will generate a secure link and send it to <strong>{linkContact?.email}</strong>.
              </p>
              <p className="text-muted small">
                The link will give <strong>{linkContact?.name}</strong> read-only access to the sections
                you have selected for them, for <strong>72 hours</strong>. Any previously sent link will be invalidated.
              </p>
              {linkContact?.visible_sections?.length === 0 && (
                <Alert variant="info" className="mb-0">
                  You haven't granted this contact access to any sections yet. Edit their details first.
                </Alert>
              )}
            </>
          ) : (
            <Alert variant="success">
              <p className="mb-1 fw-bold">Link sent to {linkContact?.email}</p>
              <p className="mb-0 small">
                The link expires in 72 hours. If you need to resend, simply click "Send access link" again.
              </p>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          {!linkResult ? (
            <>
              <Button variant="outline-secondary" onClick={() => setShowLinkModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSendLink}
                disabled={sendingLink || linkContact?.visible_sections?.length === 0}>
                {sendingLink ? <><Spinner size="sm" animation="border" className="me-2" />Sending…</> : 'Send link'}
              </Button>
            </>
          ) : (
            <Button variant="outline-secondary" onClick={() => setShowLinkModal(false)}>Close</Button>
          )}
        </Modal.Footer>
      </Modal>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      <Modal show={!!deleteTarget} onHide={() => setDeleteTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Remove trusted contact</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to remove <strong>{deleteTarget?.name}</strong> as a trusted contact?
          Any access links sent to them will also be invalidated.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Yes, remove'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
