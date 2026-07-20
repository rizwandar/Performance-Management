import { useState, useEffect } from 'react'
import { Form, Button, Modal, Spinner, Badge, Alert } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 16 }

const TIER_LABELS = { starter: 'Starter', professional: 'Professional', growth: 'Growth' }

export default function OrgStaffPage() {
  const [staff, setStaff]         = useState([])
  const [locations, setLocations] = useState([])
  const [settings, setSettings]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [alert, setAlert]         = useState(null)
  const [requesting, setRequesting] = useState(null)

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 4000) }

  // Promise.allSettled (not Promise.all) so a single failed request doesn't
  // prevent the other two from updating state, and doesn't leave the page
  // stuck on a spinner forever, settings only stays null if its own fetch
  // failed, in which case loadError drives a visible retry instead.
  const load = () => {
    setLoading(true)
    Promise.allSettled([
      axios.get(`${API}/org-portal/staff`),
      axios.get(`${API}/org-portal/locations`),
      axios.get(`${API}/org-portal/settings`),
    ]).then(([s, l, set]) => {
      if (s.status === 'fulfilled') setStaff(s.value.data)
      if (l.status === 'fulfilled') setLocations(l.value.data)
      if (set.status === 'fulfilled') setSettings(set.value.data)
      if (s.status === 'rejected' || l.status === 'rejected' || set.status === 'rejected') {
        showAlert('danger', 'Could not load all staff data.')
      }
    }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const deactivate = async (member) => {
    try {
      await axios.put(`${API}/org-portal/staff/${member.id}`, { is_active: 0 })
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not deactivate this staff member.')
    }
  }

  const requestReactivation = async (member) => {
    setRequesting(member.id)
    try {
      await axios.post(`${API}/org-portal/staff/${member.id}/request-reactivation`)
      showAlert('success', 'Reactivation request sent to In Good Hands. We will follow up by email.')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not send the request.')
    }
    setRequesting(null)
  }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  if (!settings) {
    return (
      <div style={card} className="text-center">
        <p className="text-muted small mb-2">Couldn't load plan and staff limits.</p>
        <Button size="sm" variant="outline-secondary" onClick={load}>Retry</Button>
      </div>
    )
  }

  const atCap = settings.counts.orgAdmins >= settings.limits.orgAdmins && settings.counts.orgStaff >= settings.limits.orgStaff

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', margin: 0 }}>Staff</h2>
        {!atCap && (
          <Button size="sm" onClick={() => setShowAdd(true)} style={{ background: 'var(--green-800)', border: 'none' }}>
            + Add Staff
          </Button>
        )}
      </div>

      <div style={{ ...card, padding: '14px 20px' }} className="small text-muted d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>
          <strong>{TIER_LABELS[settings.plan_tier] || settings.plan_tier}</strong> plan:{' '}
          {settings.counts.orgAdmins}/{settings.limits.orgAdmins} Org Admins, {settings.counts.orgStaff}/{settings.limits.orgStaff} Org Staff
        </span>
        {atCap && (
          <span>
            At your plan's limit. <a href="/pricing" target="_blank" rel="noopener noreferrer">See plans to upgrade</a>
          </span>
        )}
      </div>

      {alert && <Alert variant={alert.type}>{alert.msg}</Alert>}

      {staff.map(s => (
        <div key={s.id} style={card}>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green-900)' }}>
                {s.name}
                {!s.is_active && <Badge className="ms-2" bg="secondary">Deactivated</Badge>}
              </div>
              <div className="small text-muted">
                {s.email} · <Badge style={{ background: s.org_role === 'org_admin' ? 'var(--green-800)' : 'var(--text-muted)' }}>
                  {s.org_role === 'org_admin' ? 'Org Admin' : 'Org Staff'}
                </Badge>
                {locations.find(l => l.id === s.organization_location_id) && ` · ${locations.find(l => l.id === s.organization_location_id).name}`}
              </div>
            </div>
            {s.is_active ? (
              <Button size="sm" variant="outline-danger" onClick={() => deactivate(s)}>Deactivate</Button>
            ) : (
              <Button size="sm" variant="outline-secondary" disabled={requesting === s.id} onClick={() => requestReactivation(s)}>
                {requesting === s.id ? 'Sending…' : 'Request Reactivation'}
              </Button>
            )}
          </div>
        </div>
      ))}

      <AddStaffModal
        show={showAdd} onHide={() => setShowAdd(false)} locations={locations}
        counts={settings.counts} limits={settings.limits}
        onAdded={() => { setShowAdd(false); load() }} showAlert={showAlert}
      />
    </div>
  )
}

function AddStaffModal({ show, onHide, locations, counts, limits, onAdded, showAlert }) {
  const adminAtCap = counts.orgAdmins >= limits.orgAdmins
  const staffAtCap = counts.orgStaff >= limits.orgStaff

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [orgRole, setOrgRole]   = useState(staffAtCap ? 'org_admin' : 'org_staff')
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving]     = useState(false)

  // Resync the default role every time the modal opens (not just once at
  // mount), the modal stays mounted across opens, so a prior session's choice
  // (e.g. forced to org_admin because staff was at cap) would otherwise stick.
  useEffect(() => {
    if (show) setOrgRole(staffAtCap ? 'org_admin' : 'org_staff')
  }, [show, staffAtCap])

  const handleAdd = async () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      showAlert('danger', 'Name, email, and an 8+ character password are required.')
      return
    }
    setSaving(true)
    try {
      await axios.post(`${API}/org-portal/staff`, { name, email, password, org_role: orgRole, location_id: locationId || null })
      showAlert('success', 'Staff account created. Share these credentials with them securely.')
      setName(''); setEmail(''); setPassword(''); setLocationId('')
      onAdded()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not create staff account.')
    }
    setSaving(false)
  }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', color: 'var(--green-900)' }}>Add Staff</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Name</Form.Label>
          <Form.Control value={name} onChange={e => setName(e.target.value)} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Email</Form.Label>
          <Form.Control type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Temporary password</Form.Label>
          <Form.Control value={password} onChange={e => setPassword(e.target.value)} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Role</Form.Label>
          <Form.Select value={orgRole} onChange={e => setOrgRole(e.target.value)}>
            <option value="org_staff" disabled={staffAtCap}>Org Staff{staffAtCap ? ' (plan limit reached)' : ''}</option>
            <option value="org_admin" disabled={adminAtCap}>Org Admin{adminAtCap ? ' (plan limit reached)' : ''}</option>
          </Form.Select>
        </Form.Group>
        {locations.length > 0 && (
          <Form.Group className="mb-3">
            <Form.Label className="small fw-bold">Location (optional)</Form.Label>
            <Form.Select value={locationId} onChange={e => setLocationId(e.target.value)}>
              <option value="">No location</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Form.Select>
          </Form.Group>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>Cancel</Button>
        <Button size="sm" style={{ background: 'var(--green-800)', border: 'none' }} disabled={saving || (adminAtCap && staffAtCap)} onClick={handleAdd}>
          {saving ? 'Creating…' : 'Create Staff Account'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
