import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { formatPhone } from '@in-good-hands/shared/format'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'

const API = import.meta.env.VITE_API_URL

// The Legacy Contact's own page (2026-10-04). The role used to live in three
// places: who they are on the Trusted Contacts page, what they can open under
// the profile's Vault Password screen, and the emergency contact they would
// need in a third section. That was tolerable while the role only meant "gets
// a permanent link"; it stopped being tolerable once they became the one person
// who can ever open the vault.
//
// The record itself did NOT move. A Legacy Contact is still a trusted_contacts
// row with is_executor = 1, protected by the partial unique index
// trusted_contacts_one_executor, because every access token, permission and
// link path already works off that row. Only the presentation and the plan
// counting changed: the Legacy Contact is free on every plan and no longer
// consumes one of the trusted contact slots.
//
// Vault release is deliberately NOT set up from here. Issuing or re-issuing a
// release code needs the vault password, which belongs on the profile's vault
// screens. This page states where that arrangement stands and links to it.

const emptyContact = { name: '', relationship: '', email: '', phone: '' }

// "4 October 2026", matching the profile's own formatDate. Falls back to the
// raw value rather than rendering "Invalid Date".
const formatIssuedDate = (iso) => {
  if (!iso) return 'at an unknown date'
  try { return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return iso }
}

export default function LegacyContactPage() {
  const { user } = useAuth()

  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const [releaseStatus, setReleaseStatus] = useState(null)

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(emptyContact)
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')

  const [showChoose, setShowChoose]           = useState(false)
  const [designateTarget, setDesignateTarget] = useState(null)
  const [designating, setDesignating]         = useState(false)

  const [showRemove, setShowRemove] = useState(false)
  const [removing, setRemoving]     = useState(false)

  const [showLink, setShowLink]       = useState(false)
  const [sendingLink, setSendingLink] = useState(false)
  const [linkResult, setLinkResult]   = useState(null)
  const [linkError, setLinkError]     = useState('')

  const loadContacts = () => {
    setLoading(true)
    setError('')
    const fetchOnce = () => axios.get(`${API}/trusted-contacts`)
    // Most failures here are a brief blip rather than a real problem, so retry
    // once silently before bothering the reader with anything.
    fetchOnce()
      .catch(() => fetchOnce())
      .then(r => setContacts(r.data))
      .catch(() => setError('Your contacts are taking a moment to load.'))
      .finally(() => setLoading(false))
  }

  const loadReleaseStatus = () => {
    axios.get(`${API}/sections/digital-life/release/status`)
      .then(r => setReleaseStatus(r.data))
      // A failure here must not break the page. The release line simply does
      // not render, which is better than a page that cannot load at all.
      .catch(() => setReleaseStatus(null))
  }

  useEffect(() => {
    loadContacts()
    loadReleaseStatus()
  }, [])

  // At most one of these exists, guaranteed by the database rather than by
  // this line, so find() is safe here.
  const legacyContact = contacts.find(c => !!c.is_executor) || null
  const others        = contacts.filter(c => !c.is_executor)

  // Whether the vault paragraph at the foot can promise a release at all.
  // `enabled` alone is not enough: a suspended arrangement is one the owner
  // cancelled, so telling them their Legacy Contact will be let in would be
  // wrong until they resume it.
  const releaseArmed = !!releaseStatus?.enabled && releaseStatus.release?.status !== 'suspended'

  // The envelope survives its contact being deleted or demoted (contact_id is
  // ON DELETE SET NULL, deliberately), and the code already handed over still
  // opens it. So when the name is gone, say "they" rather than print the
  // current Legacy Contact's name over an envelope sealed for somebody else.
  const releaseContactName = releaseStatus?.release?.contact_name || 'they'

  // Not hardcoded: window_hours is per-user, and the spec leaves room for a
  // shorter window when an organization attests to a passing rather than a
  // Legacy Contact declaring one. Days while it divides evenly, hours
  // otherwise, so an odd value can never render as "1.5 days".
  const releaseWindow = (() => {
    const hours = Number(releaseStatus?.release?.window_hours)
    if (!Number.isFinite(hours) || hours <= 0) return '7 days'
    if (hours % 24 === 0) {
      const days = hours / 24
      return days === 1 ? '1 day' : `${days} days`
    }
    return hours === 1 ? '1 hour' : `${hours} hours`
  })()

  const openAdd = () => {
    setEditing(false)
    setForm({ ...emptyContact })
    setFormError('')
    setShowForm(true)
  }

  const openEdit = () => {
    setEditing(true)
    setForm({
      name:         legacyContact.name         || '',
      relationship: legacyContact.relationship || '',
      email:        legacyContact.email        || '',
      phone:        legacyContact.phone        || '',
    })
    setFormError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return setFormError('Please enter their name.')
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        await axios.put(`${API}/trusted-contacts/${legacyContact.id}`, form)
        setSuccess('Saved.')
      } else {
        // is_executor is sent on the create itself rather than creating the
        // person and promoting them in a second call. The promote-afterwards
        // route cannot work on a full free account: the create would be
        // refused by the trusted contact cap this role is exempt from.
        await axios.post(`${API}/trusted-contacts`, { ...form, is_executor: true })
        setSuccess(`${form.name} is now your Legacy Contact and has been emailed about it.`)
      }
      setShowForm(false)
      loadContacts()
    } catch (err) {
      setFormError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDesignate = async () => {
    setDesignating(true)
    setError('')
    try {
      await axios.put(`${API}/trusted-contacts/${designateTarget.id}/executor`, { is_executor: true })
      setSuccess(`${designateTarget.name} is now your Legacy Contact and has been emailed about it.`)
      setShowChoose(false)
      loadContacts()
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't update this. Please try again.")
    }
    setDesignateTarget(null)
    setDesignating(false)
  }

  // Standing down from the role leaves the person on the trusted contacts list,
  // which is why the server can refuse this when that list is already full.
  // Its message explains the choice, so it is shown as-is rather than replaced.
  const handleRemove = async () => {
    setRemoving(true)
    setError('')
    try {
      await axios.put(`${API}/trusted-contacts/${legacyContact.id}/executor`, { is_executor: false })
      setSuccess(`${legacyContact.name} is no longer your Legacy Contact. They remain one of your trusted contacts, but the access link they held no longer works. Send them a new one if you still want them to have access.`)
      setShowRemove(false)
      loadContacts()
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't update this. Please try again.")
      setShowRemove(false)
    }
    setRemoving(false)
  }

  const openSendLink = () => {
    setLinkResult(null)
    setLinkError('')
    setShowLink(true)
  }

  const handleSendLink = async () => {
    setSendingLink(true)
    setLinkError('')
    try {
      const r = await axios.post(`${API}/trusted-contacts/${legacyContact.id}/access-link`)
      setLinkResult(r.data)
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Could not generate the link. Please try again.')
    }
    setSendingLink(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <SectionHero
        eyebrow="Your People"
        headline="Legacy Contact"
        subheadline="The one person who speaks for you"
        subtext={(
          <>
            <p className="mb-2">
              Your Legacy Contact is told first if you stop logging in, can confirm your passing, and
              sees everything you have recorded except your vault.
            </p>
            <p className="mb-0">
              Naming one is included on every plan and does not use up one of your{' '}
              <Link to="/sections/trusted-contacts">trusted contacts</Link>.
            </p>
          </>
        )}
        cta={!loading && !legacyContact ? {
          label: '+ Name a Legacy Contact',
          onClick: others.length > 0 ? () => setShowChoose(true) : openAdd,
        } : undefined}
      />

      {success && <Alert variant="success">{success}</Alert>}
      {error && (
        <Alert variant="danger" className="d-flex justify-content-between align-items-center gap-2">
          <span>{error}</span>
          <Button size="sm" variant="outline-danger" onClick={loadContacts}>Try again</Button>
        </Alert>
      )}

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : (
        <>
          {legacyContact ? (
            <div className="card mb-3" style={{ borderLeft: '4px solid var(--green-800)' }}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--green-900)' }}>
                      {legacyContact.name}
                      {legacyContact.relationship && (
                        <span className="text-muted small fw-normal ms-2">({legacyContact.relationship})</span>
                      )}
                    </div>
                    <div className="text-muted small mt-1">
                      {legacyContact.email && <span className="me-3">✉ {legacyContact.email}</span>}
                      {legacyContact.phone && <span>📞 {formatPhone(legacyContact.phone, user?.country_code)}</span>}
                    </div>
                    <p className="text-muted small mb-0" style={{ marginTop: 8 }}>
                      Sees everything you have recorded except your vault, and their access link does not
                      expire.
                    </p>
                    {/* One line of state and one action, here rather than
                        buried in the profile, because this page is where you
                        look when you are thinking about this person. Only shown
                        once a vault exists: there is nothing to release
                        otherwise. */}
                    {releaseStatus?.vault_exists && (
                      <p className="small mb-0" style={{ marginTop: 6 }}>
                        <span className="text-muted">
                          Vault release:{' '}
                          {releaseStatus.enabled && releaseStatus.release?.contact_id === legacyContact.id
                            ? `code issued ${formatIssuedDate(releaseStatus.release.code_issued_at)}.`
                            : releaseStatus.enabled
                              ? 'set up for a different contact.'
                              : 'not set up.'}
                        </span>{' '}
                        <Link to="/profile?section=vault-password#vault-release">
                          {releaseStatus.enabled && releaseStatus.release?.contact_id === legacyContact.id
                            ? 'Issue a new code'
                            : 'Set up'}
                        </Link>
                      </p>
                    )}
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline-primary" onClick={openEdit}>Edit</Button>
                    <Button size="sm" variant="primary" onClick={openSendLink} disabled={!legacyContact.email}>
                      Send access link
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => setShowRemove(true)}>
                      Remove as Legacy Contact
                    </Button>
                  </div>
                </div>
                {!legacyContact.email && (
                  <p className="text-muted small mb-0 mt-2" style={{ fontStyle: 'italic' }}>
                    Add an email address so they can be sent an access link and told what the role means.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="card mb-3" style={{ borderLeft: '4px solid var(--border)' }}>
              <div className="card-body">
                <p className="mb-2" style={{ fontWeight: 600, color: 'var(--green-900)' }}>
                  You have not named a Legacy Contact yet.
                </p>
                <p className="text-muted small mb-3">
                  Until you do, nobody can confirm what has happened on your behalf, and nothing you have
                  recorded reaches anyone sooner than your inactivity timer allows.
                </p>
                <div className="d-flex gap-2 flex-wrap">
                  {others.length > 0 && (
                    <Button variant="primary" onClick={() => setShowChoose(true)}>
                      Choose one of my trusted contacts
                    </Button>
                  )}
                  <Button variant={others.length > 0 ? 'outline-primary' : 'primary'} onClick={openAdd}>
                    + Add someone new
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* The role explanation sits at the foot of the page, not in the
              header: it is the most consequential thing on this screen, but it
              is reference material rather than something you act on while
              naming someone. Moved here verbatim from the Trusted Contacts
              page, which is where it used to live.

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
              Any one of your trusted contacts can be named your Legacy Contact, or you can name someone
              who is not on that list at all. It is the most important choice on your plan, so pick the
              person you would trust to act calmly on your behalf when your family cannot.
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

      {/* ── Add / Edit ────────────────────────────────────────────────────────── */}
      <Modal show={showForm} onHide={() => setShowForm(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? `Edit: ${legacyContact?.name}` : 'Name your Legacy Contact'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formError && <Alert variant="danger">{formError}</Alert>}
          {!editing && (
            <p className="text-muted small">
              They will be emailed right away to explain the role, not only if your inactivity timer
              ever lapses.
            </p>
          )}
          {/* No "what can they see" checkboxes here, unlike the trusted contact
              form. A Legacy Contact's access is the whole plan minus the vault
              (EXECUTOR_SECTIONS in server/routes/access.js), so per-section
              permissions are ignored for them and offering the choice would
              imply a control that does nothing. */}
          <Row className="g-3">
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
          </Row>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Make Legacy Contact'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Choose from existing trusted contacts ─────────────────────────────── */}
      <Modal show={showChoose} onHide={() => setShowChoose(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            Choose your Legacy Contact
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Naming one of your trusted contacts frees the slot they were using, so you can add someone
            else in their place.
          </p>
          <div className="d-grid gap-2">
            {others.map(contact => (
              <Button key={contact.id} variant="outline-primary" className="text-start"
                onClick={() => setDesignateTarget(contact)}>
                <strong>{contact.name}</strong>
                {contact.relationship && <span className="text-muted small ms-2">({contact.relationship})</span>}
              </Button>
            ))}
          </div>
          <hr style={{ borderColor: 'var(--border)' }} />
          <Button variant="link" className="p-0" onClick={() => { setShowChoose(false); openAdd() }}>
            Or add someone who is not on that list
          </Button>
        </Modal.Body>
      </Modal>

      {/* ── Designation confirmation ──────────────────────────────────────────── */}
      <Modal show={!!designateTarget} onHide={() => setDesignateTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Make {designateTarget?.name} your Legacy Contact?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          They can view everything you&apos;ve recorded except your vault, and are the one who
          confirms what&apos;s happened if you stop logging in. Only then are your other trusted
          contacts and the people you&apos;ve listed to notify actually informed.
          <p className="mb-0 mt-3" style={{ fontWeight: 600 }}>
            They will be emailed right away to explain the role, not only if the inactivity
            timer ever lapses.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setDesignateTarget(null)}>Cancel</Button>
          <Button variant="success" onClick={handleDesignate} disabled={designating}>
            {designating ? 'Saving…' : 'Yes, make Legacy Contact'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Remove confirmation ───────────────────────────────────────────────── */}
      <Modal show={showRemove} onHide={() => setShowRemove(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Remove {legacyContact?.name} as Legacy Contact?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          They stay one of your trusted contacts and keep whatever sections you have shared with them,
          but they will no longer be told first, will no longer be able to confirm your passing, and any
          vault release code you handed them stops working. The access link they already hold stops
          working too, so send them a new one if you still want them to see those sections.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowRemove(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleRemove} disabled={removing}>
            {removing ? 'Removing…' : 'Yes, remove the role'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Send access link ─────────────────────────────────────────────────── */}
      <Modal show={showLink} onHide={() => setShowLink(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            Send access link to {legacyContact?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {linkError && <Alert variant="danger">{linkError}</Alert>}
          {!linkResult ? (
            <>
              <p>This will generate a secure link and send it to <strong>{legacyContact?.email}</strong>.</p>
              <p className="text-muted small mb-0">
                As your Legacy Contact, the link gives <strong>{legacyContact?.name}</strong> read-only
                access to everything you&apos;ve recorded except your vault, and{' '}
                <strong>does not expire</strong>. Any previous link will be invalidated.
              </p>
            </>
          ) : (
            <Alert variant="success" className="mb-0">
              <p className="mb-1 fw-bold">Link sent to {legacyContact?.email}</p>
              <p className="mb-0 small">This link does not expire. Resend at any time.</p>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          {!linkResult ? (
            <>
              <Button variant="outline-secondary" onClick={() => setShowLink(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSendLink} disabled={sendingLink}>
                {sendingLink ? <><Spinner size="sm" animation="border" className="me-2" />Sending…</> : 'Send link'}
              </Button>
            </>
          ) : (
            <Button variant="outline-secondary" onClick={() => setShowLink(false)}>Close</Button>
          )}
        </Modal.Footer>
      </Modal>

      <SectionFooterNav sectionId="legacy_contact" />
    </div>
  )
}
