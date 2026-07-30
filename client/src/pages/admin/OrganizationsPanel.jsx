import { useState, useEffect } from 'react'
import { Form, Button, Modal, Spinner, Badge, Row, Col } from 'react-bootstrap'
import axios from 'axios'
import { formatPhone } from '@in-good-hands/shared/format'

const API = import.meta.env.VITE_API_URL

const BUSINESS_CATEGORIES = [
  'Funeral Home', 'Cremation Services', 'Cemetery / Memorial Park',
  'Pre-Need Insurance Provider', 'Estate & Life Management Services',
  'Hospice / Palliative Care Partner', 'Other',
]

const TIER_LABELS = { starter: 'Starter', professional: 'Professional', growth: 'Growth' }

const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 20 }

export default function OrganizationsPanel({ showAlert }) {
  const [orgs, setOrgs]                 = useState([])
  const [loading, setLoading]           = useState(true)
  const [showCreate, setShowCreate]     = useState(false)
  const [selectedOrgId, setSelectedOrgId] = useState(null)

  const load = () => {
    setLoading(true)
    axios.get(`${API}/admin/organizations`)
      .then(r => setOrgs(r.data))
      .catch(() => showAlert('danger', 'Could not load organizations.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="text-muted small mb-0">Funeral homes and life management companies using the organization portal.</p>
        <Button size="sm" onClick={() => setShowCreate(true)} style={{ background: 'var(--green-800)', border: 'none' }}>
          + New Organization
        </Button>
      </div>

      {orgs.length === 0 && (
        <div style={card} className="text-center text-muted small">No organizations yet.</div>
      )}

      {orgs.map(org => (
        <div key={org.id} style={{ ...card, cursor: 'pointer' }} onClick={() => setSelectedOrgId(org.id)}>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green-900)' }}>{org.name}</div>
              <div className="small text-muted">{org.business_categories.join(', ') || 'No categories set'}</div>
            </div>
            <Badge style={{ background: 'var(--green-700)' }}>{TIER_LABELS[org.plan_tier] || org.plan_tier}</Badge>
          </div>
          <div className="small text-muted mt-2">
            {org.location_count} location{org.location_count === 1 ? '' : 's'} · {org.staff_count} staff · {org.active_customer_count} active customer{org.active_customer_count === 1 ? '' : 's'}
          </div>
        </div>
      ))}

      <CreateOrgModal
        show={showCreate}
        onHide={() => setShowCreate(false)}
        onCreated={(org) => { setShowCreate(false); load(); setSelectedOrgId(org.id) }}
        showAlert={showAlert}
      />

      {selectedOrgId && (
        <OrgDetailModal orgId={selectedOrgId} onHide={() => { setSelectedOrgId(null); load() }} showAlert={showAlert} />
      )}
    </div>
  )
}

function CreateOrgModal({ show, onHide, onCreated, showAlert }) {
  const [name, setName]         = useState('')
  const [categories, setCategories] = useState([])
  const [about, setAbout]       = useState('')
  const [planTier, setPlanTier] = useState('starter')
  const [saving, setSaving]     = useState(false)

  const toggleCategory = (c) => {
    setCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  const handleCreate = async () => {
    if (!name.trim()) { showAlert('danger', 'Organization name is required.'); return }
    setSaving(true)
    try {
      const r = await axios.post(`${API}/admin/organizations`, {
        name, business_categories: categories, about, plan_tier: planTier,
      })
      showAlert('success', 'Organization created.')
      setName(''); setCategories([]); setAbout(''); setPlanTier('starter')
      onCreated(r.data)
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not create organization.')
    }
    setSaving(false)
  }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', color: 'var(--green-900)' }}>New Organization</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Organization name</Form.Label>
          <Form.Control value={name} onChange={e => setName(e.target.value)} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Business categories</Form.Label>
          {BUSINESS_CATEGORIES.map(c => (
            <Form.Check key={c} type="checkbox" label={c} checked={categories.includes(c)} onChange={() => toggleCategory(c)} />
          ))}
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">About (shown to their customers)</Form.Label>
          <Form.Control as="textarea" rows={2} value={about} onChange={e => setAbout(e.target.value)} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Plan tier</Form.Label>
          <Form.Select value={planTier} onChange={e => setPlanTier(e.target.value)}>
            <option value="starter">Starter (free, up to 5 customers)</option>
            <option value="professional">Professional ($99/month, up to 50 customers)</option>
            <option value="growth">Growth ($199/month + $3/customer beyond 100, unlimited)</option>
          </Form.Select>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>Cancel</Button>
        <Button size="sm" style={{ background: 'var(--green-800)', border: 'none' }} disabled={saving} onClick={handleCreate}>
          {saving ? 'Creating…' : 'Create Organization'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function OrgDetailModal({ orgId, onHide, showAlert }) {
  const [org, setOrg]           = useState(null)
  const [loading, setLoading]   = useState(true)
  const [locationForm, setLocationForm] = useState({ name: '', address: '', phone: '' })
  const [contactForm, setContactForm]   = useState({ name: '', designation: '', email: '', phone: '', is_billing_contact: false })
  const [adminForm, setAdminForm]       = useState({ name: '', email: '', password: '' })
  const [savingLocation, setSavingLocation] = useState(false)
  const [savingContact, setSavingContact]   = useState(false)
  const [savingAdmin, setSavingAdmin]       = useState(false)

  const load = () => {
    axios.get(`${API}/admin/organizations/${orgId}`)
      .then(r => setOrg(r.data))
      .catch(() => showAlert('danger', 'Could not load organization.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [orgId])

  const addLocation = async () => {
    if (!locationForm.name.trim()) return
    setSavingLocation(true)
    try {
      await axios.post(`${API}/admin/organizations/${orgId}/locations`, locationForm)
      setLocationForm({ name: '', address: '', phone: '' })
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not add location.')
    }
    setSavingLocation(false)
  }

  const addContact = async () => {
    if (!contactForm.name.trim()) return
    setSavingContact(true)
    try {
      await axios.post(`${API}/admin/organizations/${orgId}/contacts`, contactForm)
      setContactForm({ name: '', designation: '', email: '', phone: '', is_billing_contact: false })
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not add contact.')
    }
    setSavingContact(false)
  }

  const createFirstAdmin = async () => {
    if (!adminForm.name.trim() || !adminForm.email.trim() || adminForm.password.length < 8) {
      showAlert('danger', 'Name, email, and an 8+ character password are required.')
      return
    }
    setSavingAdmin(true)
    try {
      await axios.post(`${API}/admin/organizations/${orgId}/admins`, adminForm)
      showAlert('success', 'Org Admin created. Share these credentials with them securely.')
      setAdminForm({ name: '', email: '', password: '' })
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not create Org Admin.')
    }
    setSavingAdmin(false)
  }

  const reactivateStaff = async (staffId) => {
    try {
      await axios.put(`${API}/admin/organizations/${orgId}/staff/${staffId}/reactivate`)
      showAlert('success', 'Staff account reactivated.')
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not reactivate this account.')
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('logo', file)
    try {
      await axios.post(`${API}/admin/organizations/${orgId}/logo`, fd)
      showAlert('success', 'Logo updated.')
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not upload logo.')
    }
  }

  const sectionStyle = { borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }

  return (
    <Modal show onHide={onHide} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', color: 'var(--green-900)' }}>{org?.name || 'Organization'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading || !org ? (
          <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
        ) : (
          <>
            <div className="d-flex align-items-center gap-3 mb-2">
              {org.logo_url && (
                <img src={org.logo_url} alt="" width="48" height="48" style={{ borderRadius: 8, border: '1px solid var(--border)' }} />
              )}
              <Form.Group>
                <Form.Label className="small fw-bold mb-1">Logo</Form.Label>
                <Form.Control type="file" size="sm" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={handleLogoUpload} />
              </Form.Group>
            </div>

            <div style={sectionStyle}>
              <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Locations ({org.locations.length})</div>
              {org.locations.map(l => (
                <div key={l.id} className="small mb-1">
                  {l.name}{l.address ? `, ${l.address}` : ''}{l.phone ? `, ${formatPhone(l.phone)}` : ''}
                </div>
              ))}
              <Row className="g-2 mt-1">
                <Col xs={4}><Form.Control size="sm" placeholder="Name" value={locationForm.name} onChange={e => setLocationForm({ ...locationForm, name: e.target.value })} /></Col>
                <Col xs={4}><Form.Control size="sm" placeholder="Address" value={locationForm.address} onChange={e => setLocationForm({ ...locationForm, address: e.target.value })} /></Col>
                <Col xs={3}><Form.Control size="sm" placeholder="Phone" value={locationForm.phone} onChange={e => setLocationForm({ ...locationForm, phone: e.target.value })} /></Col>
                <Col xs={1}>
                  <Button size="sm" disabled={savingLocation} onClick={addLocation} style={{ background: 'var(--green-800)', border: 'none' }}>+</Button>
                </Col>
              </Row>
            </div>

            <div style={sectionStyle}>
              <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Contacts ({org.contacts.length})</div>
              {org.contacts.map(c => (
                <div key={c.id} className="small mb-1">
                  {c.name}{c.designation ? ` (${c.designation})` : ''}
                  {c.is_billing_contact ? <Badge className="ms-2" style={{ background: 'var(--green-700)' }}>Billing</Badge> : null}
                </div>
              ))}
              <Row className="g-2 mt-1 align-items-center">
                <Col xs={3}><Form.Control size="sm" placeholder="Name" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} /></Col>
                <Col xs={2}><Form.Control size="sm" placeholder="Role" value={contactForm.designation} onChange={e => setContactForm({ ...contactForm, designation: e.target.value })} /></Col>
                <Col xs={3}><Form.Control size="sm" placeholder="Email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} /></Col>
                <Col xs={2}><Form.Control size="sm" placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} /></Col>
                <Col xs={1}>
                  <Form.Check title="Billing contact" checked={contactForm.is_billing_contact} onChange={e => setContactForm({ ...contactForm, is_billing_contact: e.target.checked })} />
                </Col>
                <Col xs={1}>
                  <Button size="sm" disabled={savingContact} onClick={addContact} style={{ background: 'var(--green-800)', border: 'none' }}>+</Button>
                </Col>
              </Row>
            </div>

            <div style={sectionStyle}>
              <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Staff ({org.staff.length})</div>
              {org.staff.map(s => (
                <div key={s.id} className="small mb-1 d-flex align-items-center gap-2">
                  <span>{s.name}, {s.email}</span>
                  <Badge style={{ background: s.org_role === 'org_admin' ? 'var(--green-800)' : 'var(--text-muted)' }}>
                    {s.org_role === 'org_admin' ? 'Org Admin' : 'Org Staff'}
                  </Badge>
                  {!s.is_active && (
                    <>
                      <Badge bg="secondary">Deactivated</Badge>
                      <Button size="sm" variant="outline-success" onClick={() => reactivateStaff(s.id)} style={{ padding: '0px 8px', fontSize: '0.75rem' }}>
                        Reactivate
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {org.staff.filter(s => s.org_role === 'org_admin').length === 0 && (
                <>
                  <div className="small text-muted mb-2 mt-2">
                    No Org Admin yet. Create the first one below; they can add more staff themselves afterward.
                  </div>
                  <Row className="g-2">
                    <Col xs={4}><Form.Control size="sm" placeholder="Name" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} /></Col>
                    <Col xs={4}><Form.Control size="sm" placeholder="Email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} /></Col>
                    <Col xs={3}><Form.Control size="sm" placeholder="Temp password" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} /></Col>
                    <Col xs={1}>
                      <Button size="sm" disabled={savingAdmin} onClick={createFirstAdmin} style={{ background: 'var(--green-800)', border: 'none' }}>+</Button>
                    </Col>
                  </Row>
                </>
              )}
            </div>

            <div style={sectionStyle}>
              <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Billing History ({org.billingEvents?.length || 0})</div>
              {(!org.billingEvents || org.billingEvents.length === 0) && (
                <div className="small text-muted">No plan changes recorded yet.</div>
              )}
              {org.billingEvents?.map(ev => (
                <div key={ev.id} className="small mb-1">
                  {new Date(ev.created_at).toLocaleDateString()}: {ev.old_plan_tier ? `${ev.old_plan_tier} → ` : ''}{ev.new_plan_tier}
                  {ev.rate_snapshot ? ` (${ev.rate_snapshot})` : ''}
                  {ev.changed_by_name ? `, by ${ev.changed_by_name}` : ''}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
