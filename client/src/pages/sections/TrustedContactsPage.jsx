import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner, Badge } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { useSubscription } from '../../context/SubscriptionContext'
import { formatPhone } from '@in-good-hands/shared/format'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'
import PlanLimitNotice from '../../components/PlanLimitNotice'
import DictateButton from '../../components/DictateButton'
import DictationDisclosure from '../../components/DictationDisclosure'
import { useDictation } from '../../hooks/useDictation'
import { PLAN_LIMITS } from '../../constants/planLimits'

const API = import.meta.env.VITE_API_URL

// SEC-20: legal_documents, financial_items, and property_items are
// vault-protected and were removed from here. They can never be safely
// shared via a trusted-contact access link (no way for the link viewer to
// supply the vault password), so they should not be offered as a grantable
// permission at all.
// OPS-30: 'pet-care' and 'insurance_items' were confirmed non-vault-protected
// but were missing from both this checkbox list and the server's
// VALID_SECTIONS allowlist in server/routes/trustedContacts.js, so an owner
// could never share them via a trusted-contact access link even though
// neither is vault-protected. Added to both here.
const SECTIONS = [
  { id: 'funeral_wishes',       label: 'Funeral Wishes' },
  { id: 'doctors',              label: 'Doctors' },
  { id: 'medical_records',      label: 'Medical Records' },
  { id: 'people_to_notify',     label: 'People to Notify' },
  { id: 'personal_messages',    label: 'Messages to Loved Ones' },
  { id: 'songs_that_define_me', label: 'Songs That Define Me' },
  { id: 'life_wishes',          label: 'My Bucket List' },
  { id: 'children_dependants',  label: 'Your Loved Ones' },
  { id: 'unfinished_business',  label: 'Unfinished Business' },
  { id: 'last_moments',         label: 'Your Last Moments' },
  { id: 'pet-care',             label: 'Pet Care' },
  { id: 'insurance_items',      label: 'Insurance' },
]

const emptyContact = { name: '', relationship: '', email: '', phone: '', invite_message: '' }

export default function TrustedContactsPage() {
  const { user } = useAuth()
  const { isPremium } = useSubscription()

  // How many contacts this account may hold. The server enforces the same
  // number from server/lib/planLimits.js - this is the display mirror.
  const cap = isPremium ? PLAN_LIMITS.trusted_contacts.premium : PLAN_LIMITS.trusted_contacts.free

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

  const inviteMessageDictation = useDictation({ getValue: () => form.invite_message, setValue: v => setForm(f => ({ ...f, invite_message: v })) })
  const closeModal = () => {
    inviteMessageDictation.stopDictation()
    setShowModal(false)
  }

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

  useEffect(() => {
    axios.get(`${API}/users/me/timer`)
      .then(r => setInactivityMonths(r.data.inactivity_period_months || 12))
      .catch(() => {})

    loadContacts()
  }, [])

  // Position is display order only (see the POST route in
  // server/routes/trustedContacts.js) and is now assigned server-side, so
  // the number shown against each contact is simply its place in the list.
  // That keeps the numbering contiguous even when the stored sequences are
  // not, which happens as soon as a middle contact is removed.
  const ordered = [...contacts].sort((a, b) => a.sequence - b.sequence)
  const canAddMore = ordered.length < cap

  // Two different shapes for the same limit, on purpose. A free plan shows
  // its full capacity as empty, fillable slots, so what the plan includes is
  // visible at a glance rather than discovered as a wall. A paid plan grows
  // one contact at a time from a single button instead: ten empty slots is a
  // wall of nothing, and nobody needs to see nine of them to add a fourth.
  const emptySlotCount = isPremium ? 0 : Math.max(0, cap - ordered.length)
  const slots = [
    ...ordered.map((contact, i) => ({ contact, pos: i + 1 })),
    ...Array.from({ length: emptySlotCount }, (_, i) => ({ contact: null, pos: ordered.length + i + 1 })),
  ]

  const openAdd = () => {
    setEditingContact(null)
    setForm({ ...emptyContact })
    setPermissions([])
    setModalError('')
    setShowModal(true)
  }

  const openEdit = (contact) => {
    setEditingContact(contact)
    setForm({
      name: contact.name, relationship: contact.relationship || '',
      email: contact.email || '', phone: contact.phone || '', invite_message: contact.invite_message || '',
    })
    setPermissions(contact.visible_sections || [])
    setModalError('')
    setShowModal(true)
  }

  const togglePermission = (id) => {
    setPermissions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const handleSave = async () => {
    if (!form.name.trim()) return setModalError('Name is required.')
    setSaving(true)
    setModalError('')
    try {
      if (editingContact) {
        await axios.put(`${API}/trusted-contacts/${editingContact.id}`, {
          name: form.name, relationship: form.relationship, email: form.email, phone: form.phone,
          invite_message: form.invite_message,
        })
        await axios.put(`${API}/trusted-contacts/${editingContact.id}/permissions`, { visible_sections: permissions })
      } else {
        await axios.post(`${API}/trusted-contacts`, {
          name: form.name, relationship: form.relationship,
          email: form.email, phone: form.phone, invite_message: form.invite_message, visible_sections: permissions,
        })
      }
      inviteMessageDictation.stopDictation()
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
      setTcSuccess(contact.is_executor ? `${contact.name} is no longer your Legacy Contact.` : `${contact.name} is now your Legacy Contact and has been emailed about it.`)
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
      {/* No "back to my plans" link here: it pushed the whole page down for a
          destination the main navigation already reaches. The header is the
          first thing on the page. */}
      {/* The header carries everything a first-time reader needs: what a trusted
          contact is, how they differ from the emergency contact, how many this
          plan allows, and what naming one of them as Legacy Contact does. This
          replaced two standalone explainer panels that sat further down the page
          and split the same explanation across three places. */}
      <SectionHero
        eyebrow="Your People"
        headline="Trusted Contacts"
        subheadline="The people you trust"
        subtext={(
          <>
            <p className="mb-2">
              Trusted contacts are the people you choose to share your plans with. Unlike your
              emergency contact, each one receives a secure link that lets them actually read the
              sections you've picked for them, when the time comes. You can add up to {cap}.
            </p>
            <p className="mb-0">
              You can also name one of them your <strong>Legacy Contact</strong>: the person notified
              first if you stop logging in. They can see everything you've recorded, except your
              vault.{' '}
              <Link to="/faq#legacy-contact-vs-trusted-contact">Learn more</Link>.
            </p>
          </>
        )}
        cta={canAddMore ? {
          label: '+ Add a trusted contact',
          onClick: openAdd,
        } : undefined}
      />

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
            {slots.map(({ contact, pos }) => {
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
                                  Legacy Contact
                                </Badge>
                              )}
                            </div>
                            <div className="text-muted small" style={{ paddingLeft: 34 }}>
                              {contact.email && <span className="me-3">✉ {contact.email}</span>}
                              {contact.phone && <span>📞 {formatPhone(contact.phone, user?.country_code)}</span>}
                            </div>
                            {contact.is_executor ? (
                              <p className="text-muted small mb-0" style={{ paddingLeft: 34, marginTop: 6 }}>
                                As Legacy Contact, sees everything you've recorded except your vault, regardless
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
                              {contact.is_executor ? 'Remove as Legacy Contact' : 'Make Legacy Contact'}
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
                        <span className="text-muted" style={{ flex: 1 }}>Contact {pos}: empty</span>
                        <Button size="sm" variant="outline-primary" onClick={openAdd}>+ Add</Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Paid plans grow one at a time from here rather than being shown
                every remaining slot up front. Hidden at the cap: the ceiling
                is then stated by PlanLimitNotice above instead, so there is
                never a visible control that cannot work. */}
            {isPremium && canAddMore && (
              <Button variant="outline-primary" onClick={openAdd}>
                + Add a trusted contact
              </Button>
            )}
          </div>

          <PlanLimitNotice limitKey="trusted_contacts" currentCount={contacts.length} alwaysShow />

          <div style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-light)', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 6 }}>How trusted contact access works</p>
            <ul className="text-muted small mb-0" style={{ listStyle: 'none', padding: 0, lineHeight: 1.7 }}>
              <li className="mb-2">
                <strong>Trusted Contacts:</strong> share selected information through a read-only link
                that expires after 72 hours.
              </li>
              <li className="mb-2">
                <strong>Legacy Contact:</strong> share everything except your vault through a permanent
                read-only link. They're notified after{' '}
                <strong>{inactivityMonths} month{inactivityMonths === 1 ? '' : 's'}</strong> of
                inactivity, which you can adjust in{' '}
                <Link to="/profile/settings#inactivity-timer">your profile</Link>.
              </li>
              <li>
                <strong>Your passwords:</strong> encrypted, never shared, and accessible only to you.
              </li>
            </ul>
          </div>
        </>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      <Modal show={showModal} onHide={closeModal} centered size="lg">
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editingContact ? `Edit: ${editingContact.name}` : 'Add a trusted contact'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {modalError && <Alert variant="danger">{modalError}</Alert>}
          <Row className="g-3">
            {/* The "Position" picker that used to sit here is gone: position is
                display order only and is now assigned by the server, so there
                was nothing for the user to decide. It was also the control
                that made the old 3-position database constraint reachable. */}
            <Col xs={12} sm={6}>
              <Form.Group>
                <Form.Label>Full name <span style={{ color: 'red' }}>*</span></Form.Label>
                <Form.Control value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sarah Johnson" />
              </Form.Group>
            </Col>
            <Col xs={12} sm={6}>
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
            <Col xs={12}>
              <Form.Group>
                <div className="d-flex justify-content-between align-items-center">
                  <Form.Label className="mb-0">Personal message</Form.Label>
                  <DictateButton dictation={inviteMessageDictation} />
                </div>
                <Form.Control as="textarea" rows={2} value={form.invite_message}
                  onChange={e => setForm(f => ({ ...f, invite_message: e.target.value }))}
                  placeholder="Optional: a short note to include when you send this person their access link, e.g. This is important to me, please take a look when you can." />
                {inviteMessageDictation.supported && <DictationDisclosure />}
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
          <Button variant="outline-secondary" onClick={closeModal}>Cancel</Button>
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
                  As your Legacy Contact, the link gives <strong>{linkContact?.name}</strong> read-only access
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

      {/* ── Make Legacy Contact Confirmation ──────────────────────────────────── */}
      <Modal show={!!executorConfirmTarget} onHide={() => setExecutorConfirmTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Make {executorConfirmTarget?.name} your Legacy Contact?</Modal.Title>
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
            {executorSaving ? 'Saving…' : 'Yes, make Legacy Contact'}
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

      <SectionFooterNav sectionId="trusted_contacts" />
    </div>
  )
}
