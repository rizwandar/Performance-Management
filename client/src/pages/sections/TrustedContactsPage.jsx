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
  { id: 'children_dependants',  label: 'Dependents' },
  { id: 'unfinished_business',  label: 'Unfinished Business' },
  { id: 'last_moments',         label: 'Your Last Moments' },
  { id: 'pet-care',             label: 'Pet Care' },
  { id: 'insurance_items',      label: 'Insurance' },
]

const emptyContact = { name: '', relationship: '', email: '', phone: '', invite_message: '' }

// "4 October 2026", matching the wording in the spec and the profile's own
// formatDate. Falls back to the raw value rather than rendering "Invalid Date".
const formatIssuedDate = (iso) => {
  if (!iso) return 'at an unknown date'
  try { return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return iso }
}

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

  // Vault release state, so the Legacy Contact's card can say in one line
  // whether their vault access is actually set up (spec 8.3 item 2). It is
  // read-only here on purpose: issuing or re-issuing a code needs the vault
  // password, which belongs on the profile's vault screens, not on a page
  // about who can see which sections.
  const [releaseStatus, setReleaseStatus] = useState(null)

  const loadReleaseStatus = () => {
    axios.get(`${API}/sections/digital-life/release/status`)
      .then(r => setReleaseStatus(r.data))
      // A failure here must not break the page. The line simply does not
      // render, which is better than a card that cannot load at all.
      .catch(() => setReleaseStatus(null))
  }

  useEffect(() => {
    loadContacts()
    loadReleaseStatus()
  }, [])

  // Whether the foot-of-page vault paragraph can promise a release at all.
  // `enabled` alone is not enough: a suspended arrangement is one the owner
  // cancelled, so telling them their Legacy Contact will be let in would be
  // wrong until they resume it.
  const releaseArmed = !!releaseStatus?.enabled && releaseStatus.release?.status !== 'suspended'

  // The envelope survives its contact being deleted or demoted (contact_id is
  // ON DELETE SET NULL, deliberately), and the code already handed over still
  // opens it. So when the name is gone, say "they" rather than invent one or
  // print the current Legacy Contact's name over an envelope sealed for
  // somebody else.
  const releaseContactName = releaseStatus?.release?.contact_name || 'they'

  // Not hardcoded: window_hours is per-user, and the spec leaves room for a
  // shorter window when an organization attests to a passing rather than a
  // Legacy Contact declaring one. Days while it divides evenly, which covers
  // both the 168-hour default and a 48-hour org window, hours otherwise, so an
  // odd value can never render as "1.5 days".
  const releaseWindow = (() => {
    const hours = Number(releaseStatus?.release?.window_hours)
    if (!Number.isFinite(hours) || hours <= 0) return '7 days'
    if (hours % 24 === 0) {
      const days = hours / 24
      return days === 1 ? '1 day' : `${days} days`
    }
    return hours === 1 ? '1 hour' : `${hours} hours`
  })()

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
      // Moving the role changes whether an existing sealed envelope still
      // points at the current Legacy Contact, so the line below has to be
      // re-read rather than left describing the previous arrangement.
      loadReleaseStatus()
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
      {/* The header carries what a first-time reader needs: what a trusted
          contact is, how information reaches them, and what naming one of them
          as Legacy Contact does. This replaced two standalone explainer panels
          that sat further down the page and split the same explanation across
          three places. Wording is the owner's own. */}
      <SectionHero
        eyebrow="Your People"
        headline="Trusted Contacts"
        subheadline="The people you trust"
        subtext={(
          <>
            <p className="mb-2">
              Trusted contacts are people you choose to share your selected information with, via a
              secure link.
            </p>
            <p className="mb-0">
              You can also name one of them your <strong>Legacy Contact</strong>: the person notified
              first, and the one who can confirm your passing. There is more about what that means
              at the foot of this page.
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
                              <>
                                <p className="text-muted small mb-0" style={{ paddingLeft: 34, marginTop: 6 }}>
                                  As Legacy Contact, sees everything you've recorded except your vault, regardless
                                  of the sections picked below.
                                </p>
                                {/* Spec 8.3 item 2: one line of state and one
                                    action, here rather than buried in the
                                    profile, because this card is where you
                                    look when you are thinking about this
                                    person. Only shown once a vault exists:
                                    there is nothing to release otherwise. */}
                                {releaseStatus?.vault_exists && (
                                  <p className="small mb-0" style={{ paddingLeft: 34, marginTop: 6 }}>
                                    <span className="text-muted">
                                      Vault release:{' '}
                                      {releaseStatus.enabled && releaseStatus.release?.contact_id === contact.id
                                        ? `code issued ${formatIssuedDate(releaseStatus.release.code_issued_at)}.`
                                        : releaseStatus.enabled
                                          ? 'set up for a different contact.'
                                          : 'not set up.'}
                                    </span>{' '}
                                    <Link to="/profile?section=vault-password#vault-release">
                                      {releaseStatus.enabled && releaseStatus.release?.contact_id === contact.id
                                        ? 'Issue a new code'
                                        : 'Set up'}
                                    </Link>
                                  </p>
                                )}
                              </>
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

          <PlanLimitNotice limitKey="trusted_contacts" currentCount={contacts.length} alwaysShow omitCount />

          {/* The Legacy Contact explanation sits at the foot of the page, not in
              the header: it is the most consequential thing on this screen, but
              it is reference material rather than something you act on while
              adding a contact.

              The closing vault paragraph used to state flatly that the vault
              could never be opened by anyone, the Legacy Contact included. That
              was true until vault release shipped and is now false for anyone
              who has armed it, which is why there are two versions rather than
              one hedged paragraph: release is opt-in, so no single wording is
              honest for both states. Copy is the owner's own.

              Neither version may be collapsed into the other, and the "only you
              can decrypt" promise in both is a fact about the encryption rather
              than a policy: the server holds ciphertext only, and arming
              release does not change that, it only seals a second copy of the
              key under a code the owner hands over in person. */}
          <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 10, padding: '20px 22px', marginTop: 24 }}>
            <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 10, fontSize: '1.02rem' }}>
              About your Legacy Contact
            </p>
            <p className="text-muted small mb-2">
              Any one of your trusted contacts can be named your Legacy Contact. It is the most
              important choice on this page, so pick the person you would trust to act calmly on
              your behalf when your family cannot.
            </p>
            <ul className="text-muted small mb-2" style={{ paddingLeft: '1.1rem', lineHeight: 1.75 }}>
              <li>
                <strong>Their access does not expire.</strong> Everyone else receives a link good for
                72 hours. Your Legacy Contact keeps theirs, because when it is finally needed you will
                not be there to send another one.
              </li>
              <li>
                <strong>They see everything you have recorded, except your vault.</strong>
              </li>
              <li>
                <strong>They are told first if you stop logging in.</strong> You choose how long that
                wait is in{' '}<Link to="/profile/settings#inactivity-timer">your profile</Link>.
              </li>
              <li>
                <strong>They can confirm your passing.</strong> That does not wait for any timer: the
                moment it is confirmed, every trusted contact and everyone on your People to Notify
                list is told straight away.
              </li>
            </ul>
            {releaseArmed ? (
              <p className="text-muted small mb-0">
                <strong>Your vault is the exception.</strong> Your vault is encrypted and only you can
                decrypt the information in your vault using your vault password. Only your Legacy
                Contact {releaseContactName} can open it using the code you gave them, but only after
                a passing is declared and a waiting period of {releaseWindow} has passed. During that
                period we try to reach you on every contact detail we hold. In case you log in during
                this period, we cancel the timer. After {releaseWindow}, your Legacy Contact gets a
                secured link where they can enter the Vault Release Code you provided to them and
                access the vault information.{' '}
                <Link to="/faq#legacy-contact-vs-trusted-contact">Learn more</Link>.
              </p>
            ) : (
              <p className="text-muted small mb-0">
                <strong>Your vault is the exception.</strong> Once you set up your vault, only you can
                decrypt your information using your vault password. This ensures that no one can see
                your private data, even if the data is compromised. You can, though, designate a
                Legacy Contact and set up a vault release in your profile. You will have to personally
                hand them a Vault Release Code, which they can use to open the vault once you are not
                there to take care of your affairs.{' '}
                <Link to="/faq#legacy-contact-vs-trusted-contact">Learn more</Link>.
              </p>
            )}
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
