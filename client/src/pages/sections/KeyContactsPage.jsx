import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner, Badge } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { formatPhone } from '@in-good-hands/shared/format'
import SectionHero from '../../components/SectionHero'

const API = import.meta.env.VITE_API_URL

const SECTIONS = [
  { id: 'legal_documents',      label: 'Legal Documents' },
  { id: 'financial_items',      label: 'Financial Affairs' },
  { id: 'funeral_wishes',       label: 'Funeral Wishes' },
  { id: 'medical_wishes',       label: 'Medical Wishes' },
  { id: 'people_to_notify',     label: 'People to Notify' },
  { id: 'property_items',       label: 'Property & Possessions' },
  { id: 'personal_messages',    label: 'Messages to Loved Ones' },
  { id: 'songs_that_define_me', label: 'Songs That Define Me' },
  { id: 'life_wishes',          label: 'My Bucket List' },
  { id: 'children_dependants',  label: 'Children & Dependants' },
]

const POSITIONS = [1, 2, 3]
const emptyContact = { sequence: '', name: '', relationship: '', email: '', phone: '' }

export default function KeyContactsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // ── Emergency contact state ────────────────────────────────────────────────
  const [ecLoading, setEcLoading]   = useState(true)
  const [ecSaving, setEcSaving]     = useState(false)
  const [ecSuccess, setEcSuccess]   = useState('')
  const [ecError, setEcError]       = useState('')
  const [ecForm, setEcForm] = useState({
    emergency_contact_name:  '',
    emergency_contact_phone: '',
    emergency_contact_email: '',
  })

  // ── Trusted contacts state ─────────────────────────────────────────────────
  const [contacts, setContacts]   = useState([])
  const [tcLoading, setTcLoading] = useState(true)
  const [tcError, setTcError]     = useState('')
  const [tcSuccess, setTcSuccess] = useState('')

  const [showModal, setShowModal]         = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [form, setForm]                   = useState(emptyContact)
  const [permissions, setPermissions]     = useState([])
  const [saving, setSaving]               = useState(false)
  const [modalError, setModalError]       = useState('')

  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkContact, setLinkContact]     = useState(null)
  const [sendingLink, setSendingLink]     = useState(false)
  const [linkResult, setLinkResult]       = useState(null)
  const [linkError, setLinkError]         = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)

  // Defaults to 12 (the server's own fallback in GET /users/me/timer) so the
  // explanatory copy below reads correctly even before the fetch resolves,
  // rather than showing a placeholder or nothing.
  const [inactivityMonths, setInactivityMonths] = useState(12)

  const loadContacts = () => {
    setTcLoading(true)
    setTcError('')
    const fetchOnce = () => axios.get(`${API}/trusted-contacts`)
    // Most failures here are a brief blip, not a real problem, so retry once
    // silently before bothering the user with anything.
    fetchOnce()
      .catch(() => fetchOnce())
      .then(r => setContacts(r.data))
      .catch(() => setTcError('Your trusted contacts are taking a moment to load.'))
      .finally(() => setTcLoading(false))
  }

  // ── Load both on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API}/users/me`)
      .then(r => setEcForm({
        emergency_contact_name:  r.data.emergency_contact_name  || '',
        emergency_contact_phone: r.data.emergency_contact_phone || '',
        emergency_contact_email: r.data.emergency_contact_email || '',
      }))
      .catch(() => {})
      .finally(() => setEcLoading(false))

    axios.get(`${API}/users/me/timer`)
      .then(r => setInactivityMonths(r.data.inactivity_period_months || 12))
      .catch(() => {})

    loadContacts()
  }, [])

  // ── Emergency contact save ─────────────────────────────────────────────────
  const saveEcForm = async () => {
    setEcSaving(true)
    setEcError('')
    try {
      await axios.put(`${API}/users/me`, ecForm)
      setEcSuccess('Emergency contact saved.')
      setTimeout(() => setEcSuccess(''), 3000)
    } catch {
      setEcError("We couldn't save this. Please try again.")
    }
    setEcSaving(false)
  }

  const setEc = field => e => setEcForm(f => ({ ...f, [field]: e.target.value }))

  // ── Trusted contacts helpers ───────────────────────────────────────────────
  const takenSequences = contacts.map(c => c.sequence)

  const openAdd = () => {
    setEditingContact(null)
    const next = POSITIONS.find(p => !takenSequences.includes(p)) || ''
    setForm({ ...emptyContact, sequence: next })
    setPermissions([])
    setModalError('')
    setShowModal(true)
  }

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

  const handleSave = async () => {
    if (!form.name.trim()) return setModalError('Name is required.')
    if (!editingContact && !form.sequence) return setModalError('Please choose a position (1, 2 or 3).')
    setSaving(true)
    setModalError('')
    try {
      if (editingContact) {
        await axios.put(`${API}/trusted-contacts/${editingContact.id}`, {
          name: form.name, relationship: form.relationship, email: form.email, phone: form.phone,
        })
        await axios.put(`${API}/trusted-contacts/${editingContact.id}/permissions`, { visible_sections: permissions })
      } else {
        await axios.post(`${API}/trusted-contacts`, {
          sequence: form.sequence, name: form.name, relationship: form.relationship,
          email: form.email, phone: form.phone, visible_sections: permissions,
        })
      }
      setShowModal(false)
      setTcSuccess(editingContact ? `${form.name}'s details updated.` : `${form.name} added.`)
      loadContacts()
      setTimeout(() => setTcSuccess(''), 4000)
    } catch (err) {
      setModalError(err.response?.data?.error || 'Could not save. Please try again.')
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await axios.delete(`${API}/trusted-contacts/${deleteTarget.id}`)
      setDeleteTarget(null)
      setTcSuccess(`${deleteTarget.name} has been removed.`)
      loadContacts()
      setTimeout(() => setTcSuccess(''), 3000)
    } catch {
      setTcError("We couldn't remove this contact. Please try again.")
    }
    setDeleting(false)
  }

  const [executorSaving, setExecutorSaving] = useState(false)
  // Only used for the "make executor" direction - removing someone as
  // executor is low-stakes and reversible, so that action stays a single
  // click. Making someone executor fires an immediate email to a third
  // party, which deserves a confirm step right where the action happens,
  // not just an explanation paragraph elsewhere on the page a user could
  // click past without reading (OPS-19 found exactly that gap live).
  const [executorConfirmTarget, setExecutorConfirmTarget] = useState(null)

  const handleToggleExecutor = async (contact) => {
    setExecutorSaving(true)
    try {
      await axios.put(`${API}/trusted-contacts/${contact.id}/executor`, { is_executor: !contact.is_executor })
      setTcSuccess(contact.is_executor ? `${contact.name} is no longer your executor.` : `${contact.name} is now your executor and has been emailed about it.`)
      loadContacts()
      setTimeout(() => setTcSuccess(''), 3000)
    } catch (err) {
      setTcError(err.response?.data?.error || "We couldn't update this. Please try again.")
    }
    setExecutorConfirmTarget(null)
    setExecutorSaving(false)
  }

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

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
      </div>

      <SectionHero
        eyebrow="Your People"
        headline="The people to call on"
        highlight="call on"
        subtext="The people who matter most in an emergency, the trusted contacts who will be given access to your plans when the time comes, and the one person you trust to confirm it and set everything in motion."
      />

      {/* ── Emergency Contact ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--parchment)', borderRadius: 'var(--card-radius-sm, 12px)', padding: '24px', marginBottom: 28, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Emergency Contact</h6>
        <p className="text-muted small mb-1">
          The first person to call if you are in an emergency and unable to speak for yourself.
          This is typically a partner, close family member, or trusted friend who is always reachable.
        </p>
        <p className="text-muted small mb-4" style={{ fontStyle: 'italic' }}>
          Unlike trusted contacts, your emergency contact does not receive access to your plans. They are simply someone to call in a crisis.
        </p>

        {ecSuccess && <Alert variant="success" className="py-2">{ecSuccess}</Alert>}
        {ecError   && <Alert variant="danger"  className="py-2">{ecError}</Alert>}

        {ecLoading ? (
          <Spinner animation="border" size="sm" style={{ color: 'var(--green-800)' }} />
        ) : (
          <>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Name</Form.Label>
                <Form.Control value={ecForm.emergency_contact_name} onChange={setEc('emergency_contact_name')}
                  placeholder="Full name" />
              </Col>
              <Col md={6}>
                <Form.Label>Phone</Form.Label>
                <Form.Control value={ecForm.emergency_contact_phone} onChange={setEc('emergency_contact_phone')}
                  placeholder="e.g. 0400 123 456" />
              </Col>
            </Row>
            <Form.Group className="mb-4">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={ecForm.emergency_contact_email} onChange={setEc('emergency_contact_email')}
                placeholder="email@example.com" />
            </Form.Group>
            <Button variant="primary" onClick={saveEcForm} disabled={ecSaving}>
              {ecSaving ? 'Saving...' : 'Save emergency contact'}
            </Button>
          </>
        )}
      </div>

      {/* ── Trusted Contacts ────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--parchment)', borderRadius: 'var(--card-radius-sm, 12px)', padding: '24px 24px 16px', marginBottom: 16, border: '1px solid var(--border)' }}>
        <div className="d-flex justify-content-between align-items-start mb-1 flex-wrap gap-2">
          <h6 style={{ color: 'var(--green-900)', margin: 0 }}>Trusted Contacts</h6>
          {contacts.length < 3 && (
            <Button size="sm" variant="primary" onClick={openAdd}>+ Add contact</Button>
          )}
        </div>
        <p className="text-muted small mb-1">
          The people who should be given access to your plans when the time comes.
          You can add up to 3 trusted contacts and choose exactly which sections each person can see.
        </p>
        <p className="text-muted small mb-1" style={{ fontStyle: 'italic' }}>
          Unlike your emergency contact, trusted contacts receive a secure link to read your plans. You control what each person can access.
        </p>
        <p className="text-muted small mb-0" style={{ fontStyle: 'italic' }}>
          One of these three can also be made your <strong>Executor</strong>: the person notified
          first if you stop logging in. They can view everything you've recorded except your
          vault, and are the one who confirms what's happened. Only then are your other trusted
          contacts and the people you've listed to notify actually informed.
          {' '}Making someone your executor emails them <strong>right away</strong> to explain the role,
          not only if the inactivity timer ever lapses.
        </p>
      </div>

      {tcSuccess && <Alert variant="success">{tcSuccess}</Alert>}
      {tcError && (
        <Alert variant="danger" className="d-flex justify-content-between align-items-center gap-2">
          <span>{tcError}</span>
          <Button size="sm" variant="outline-danger" onClick={loadContacts}>Try again</Button>
        </Alert>
      )}

      {tcLoading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : (
        <>
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
                              {!!contact.is_executor && (
                                <Badge bg={null} style={{ background: 'var(--green-800)', color: '#fff', fontWeight: 600 }}>
                                  Executor
                                </Badge>
                              )}
                            </div>
                            <div className="text-muted small" style={{ paddingLeft: 34 }}>
                              {contact.email && <span className="me-3">✉ {contact.email}</span>}
                              {contact.phone && <span>📞 {formatPhone(contact.phone, user?.country_code)}</span>}
                            </div>
                            {contact.is_executor ? (
                              <p className="text-muted small mb-0" style={{ paddingLeft: 34, marginTop: 6 }}>
                                As executor, sees everything you've recorded except your vault, regardless
                                of the sections picked below.
                              </p>
                            ) : contact.visible_sections?.length > 0 ? (
                              <div style={{ paddingLeft: 34, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {contact.visible_sections.map(sid => {
                                  const s = SECTIONS.find(x => x.id === sid)
                                  return s ? (
                                    <Badge key={sid} bg={null} style={{ background: '#fff', color: 'var(--green-900)', border: '1px solid var(--green-100)', fontWeight: 500, fontSize: '0.75rem' }}>
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
                            <Button size="sm" variant={contact.is_executor ? 'outline-secondary' : 'outline-success'}
                              onClick={() => contact.is_executor ? handleToggleExecutor(contact) : setExecutorConfirmTarget(contact)}
                              disabled={executorSaving}>
                              {contact.is_executor ? 'Remove as executor' : 'Make executor'}
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
                        <Button size="sm" variant="outline-primary" onClick={openAdd}>+ Add</Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-light)', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 6 }}>How trusted contact access works</p>
            <ul className="text-muted small mb-0" style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
              <li>Click <strong>Send access link</strong> to email a secure link to your contact.</li>
              <li>For your two non-executor contacts, the link is valid for <strong>72 hours</strong> and gives read-only access to the sections you select.</li>
              <li>Your <strong>executor</strong>'s link is different: it doesn't expire, and gives read-only access to everything except your vault, since sections don't apply to their role.</li>
              <li>Your digital credentials (passwords) are never included. They are encrypted and only accessible by you.</li>
              <li>You can send a new link at any time. A new link invalidates the previous one.</li>
              <li>
                If you haven't logged in within <strong>{inactivityMonths} month{inactivityMonths === 1 ? '' : 's'}</strong>,
                your <strong>executor</strong> is notified first and can confirm what's happened. Only then are your
                other trusted contacts emailed automatically. If you haven't designated an executor, all trusted
                contacts are notified directly instead. You can change this period any time in{' '}
                <Link to="/profile/settings#inactivity-timer">your profile</Link>.
              </li>
            </ul>
          </div>
        </>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
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
                <Form.Check type="checkbox" id={`perm-${s.id}`} label={s.label}
                  checked={permissions.includes(s.id)}
                  onChange={() => togglePermission(s.id)} />
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

      {/* ── Send Access Link Modal ───────────────────────────────────────────── */}
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
              <p>This will generate a secure link and send it to <strong>{linkContact?.email}</strong>.</p>
              {linkContact?.is_executor ? (
                <p className="text-muted small">
                  As your executor, the link gives <strong>{linkContact?.name}</strong> read-only access
                  to everything you've recorded except your vault, and <strong>does not expire</strong>.
                  Any previous link will be invalidated.
                </p>
              ) : (
                <>
                  <p className="text-muted small">
                    The link gives <strong>{linkContact?.name}</strong> read-only access to the sections
                    you have selected, for <strong>72 hours</strong>. Any previous link will be invalidated.
                  </p>
                  {linkContact?.visible_sections?.length === 0 && (
                    <Alert variant="info" className="mb-0">
                      You haven't granted this contact access to any sections yet. Edit their details first.
                    </Alert>
                  )}
                </>
              )}
            </>
          ) : (
            <Alert variant="success">
              <p className="mb-1 fw-bold">Link sent to {linkContact?.email}</p>
              <p className="mb-0 small">
                {linkResult?.expires_at ? 'The link expires in 72 hours. Resend at any time.' : 'This link does not expire. Resend at any time.'}
              </p>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          {!linkResult ? (
            <>
              <Button variant="outline-secondary" onClick={() => setShowLinkModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSendLink}
                disabled={sendingLink || (!linkContact?.is_executor && linkContact?.visible_sections?.length === 0)}>
                {sendingLink ? <><Spinner size="sm" animation="border" className="me-2" />Sending…</> : 'Send link'}
              </Button>
            </>
          ) : (
            <Button variant="outline-secondary" onClick={() => setShowLinkModal(false)}>Close</Button>
          )}
        </Modal.Footer>
      </Modal>

      {/* ── Make Executor Confirmation ──────────────────────────────────────── */}
      <Modal show={!!executorConfirmTarget} onHide={() => setExecutorConfirmTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Make {executorConfirmTarget?.name} your executor?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          They can view everything you've recorded except your vault, and are the one who
          confirms what's happened if you stop logging in. Only then are your other trusted
          contacts and the people you've listed to notify actually informed.
          <p className="mb-0 mt-3" style={{ fontWeight: 600 }}>
            They will be emailed right away to explain the role - not only if the inactivity
            timer ever lapses.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setExecutorConfirmTarget(null)}>Cancel</Button>
          <Button variant="success" onClick={() => handleToggleExecutor(executorConfirmTarget)} disabled={executorSaving}>
            {executorSaving ? 'Saving…' : 'Yes, make executor'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Delete Confirmation ──────────────────────────────────────────────── */}
      <Modal show={!!deleteTarget} onHide={() => setDeleteTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Remove trusted contact</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to remove <strong>{deleteTarget?.name}</strong>?
          Any access links sent to them will also be invalidated.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Yes, remove'}
          </Button>
        </Modal.Footer>
      </Modal>

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
