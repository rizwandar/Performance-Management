import { useEffect, useState } from 'react'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { useSubscription } from '../../context/SubscriptionContext'
import { formatPhone } from '@in-good-hands/shared/format'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'
import PlanLimitNotice from '../../components/PlanLimitNotice'
import DictateButton from '../../components/DictateButton'
import DictationDisclosure from '../../components/DictationDisclosure'
import { useDictation } from '../../hooks/useDictation'
import { PLAN_LIMITS } from '../../constants/planLimits'

const API = import.meta.env.VITE_API_URL

const empty = { name: '', relationship: '', email: '', phone: '', notified_by: '', notes: '' }

export default function PeopleToNotifyPage() {
  const { user } = useAuth()
  const { isPremium } = useSubscription()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)

  const notesDictation = useDictation({ getValue: () => form.notes, setValue: v => setForm(f => ({ ...f, notes: v })) })
  const closeModal = () => {
    notesDictation.stopDictation()
    setShowModal(false)
  }

  const load = () => {
    setLoading(true)
    axios.get(`${API}/sections/people-to-notify`)
      .then(r => setItems(r.data))
      .catch(() => setError("We couldn't load your list. Please try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // How many people this account may list. The server enforces the same
  // number from server/lib/planLimits.js - this is the display mirror.
  // A null premium value means no cap, matching that file's convention.
  const cap = isPremium
    ? (PLAN_LIMITS.people_to_notify.premium ?? Infinity)
    : PLAN_LIMITS.people_to_notify.free
  const canAddMore = items.length < cap

  // Two different shapes for the same limit, on purpose, following Trusted
  // Contacts. A free plan shows its full capacity as empty, fillable slots,
  // so what the plan includes is visible at a glance rather than discovered
  // as a wall. An uncapped plan grows one person at a time from a single
  // button instead, since there is no capacity to draw.
  //
  // Math.max guards the case that matters most here: an account that held
  // more people while paying (or during the signup trial) and has since
  // returned to the free plan keeps every entry. The slots array starts from
  // the entries themselves, so all of them render even above the cap. Never
  // hide someone's own data to make it fit a limit.
  const emptySlotCount = isPremium ? 0 : Math.max(0, cap - items.length)
  const slots = [
    ...items.map((item, i) => ({ item, pos: i + 1 })),
    ...Array.from({ length: emptySlotCount }, (_, i) => ({ item: null, pos: items.length + i + 1 })),
  ]

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
      notesDictation.stopDictation()
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
      {/* No "back to my plans" link here: it pushed the whole page down for a
          destination the main navigation and the journey footer both already
          reach. The header is the first thing on the page. */}
      {/* The header now carries the whole explanation: who to list, who
          contacts them, and what those people do and do not receive. That
          replaced a standalone italic paragraph underneath, which said the
          same thing a second time in a quieter voice. Wording is the owner's
          own. */}
      <SectionHero
        eyebrow="Your People"
        headline="People to Notify"
        subheadline="Make sure no one is forgotten"
        subtext={(
          <>
            <p className="mb-2">
              Who would you want notified when you pass away? List each person and who should
              contact them.
            </p>
            <p className="mb-0">
              They'll receive a short, caring message, without access to your plans. Add their
              email address for automatic notification after your Legacy Contact or funeral home
              confirms your passing.
            </p>
          </>
        )}
        cta={canAddMore ? { label: '+ Add a person', onClick: openAdd } : undefined}
        secondaryAction={<ShareSectionTrigger section="people_to_notify" sectionLabel="People to Notify" />}
      />

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : (
        <>
          <div className="mb-4">
            {/* Only reachable on an uncapped plan with nothing listed: a
                capped plan always has its empty slots to fill, which are a
                warmer invitation than a placeholder. */}
            {slots.length === 0 ? (
              <div className="section-placeholder">
                <p style={{ fontSize: '2rem', marginBottom: 8 }}>👥</p>
                <p className="mb-1" style={{ fontWeight: 600 }}>No one listed yet</p>
                <p className="text-muted small mb-0">
                  Add friends, family, colleagues, or anyone else who should be told.
                </p>
              </div>
            ) : slots.map(({ item, pos }) => (
              item ? (
                // Entries themselves carry no slot number: the order here is
                // just when each person was added, not a priority, so
                // numbering them would imply a meaning the data has not got.
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
                          {[item.email, formatPhone(item.phone, user?.country_code)].filter(Boolean).join(' · ')}
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
              ) : (
                <div key={`empty-${pos}`} className="section-card">
                  <div className="d-flex align-items-center gap-3">
                    <span style={{
                      background: 'var(--border)', color: 'var(--text-muted)', borderRadius: '50%',
                      width: 26, height: 26, display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                    }}>{pos}</span>
                    <span className="text-muted" style={{ flex: 1 }}>Person {pos}: empty</span>
                    <Button size="sm" variant="outline-primary" onClick={openAdd}>+ Add</Button>
                  </div>
                </div>
              )
            ))}

            {/* Uncapped plans grow one at a time from here rather than being
                shown a run of empty slots they have no ceiling for. */}
            {isPremium && canAddMore && (
              <Button variant="outline-primary" onClick={openAdd}>
                + Add a person
              </Button>
            )}
          </div>

          {/* Below the people, not above them: the allowance is already stated
              by the slots themselves, so this only needs to be the invitation
              to upgrade, read after someone has seen what they have. */}
          <PlanLimitNotice limitKey="people_to_notify" currentCount={items.length} alwaysShow omitCount />
        </>
      )}

      <Modal show={showModal} onHide={closeModal} centered>
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
              <div className="d-flex justify-content-between align-items-center">
                <Form.Label className="mb-0">Notes</Form.Label>
                <DictateButton dictation={notesDictation} />
              </div>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything useful to know about reaching or telling this person..." />
              {notesDictation.supported && <DictationDisclosure />}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add person'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}

      <ShareSectionHistory section="people_to_notify" />

      <SectionFooterNav sectionId="people_to_notify" />
    </div>
  )
}
