import { useState, useEffect } from 'react'
import { Form, Button, Modal, Spinner, Badge, Alert } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 16 }

export default function OrgStaffPage() {
  const [staff, setStaff]         = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [alert, setAlert]         = useState(null)

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 4000) }

  const load = () => {
    setLoading(true)
    Promise.all([
      axios.get(`${API}/org-portal/staff`),
      axios.get(`${API}/org-portal/locations`),
    ]).then(([s, l]) => { setStaff(s.data); setLocations(l.data) })
      .catch(() => showAlert('danger', 'Could not load staff.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const toggleActive = async (member) => {
    try {
      await axios.put(`${API}/org-portal/staff/${member.id}`, { is_active: member.is_active ? 0 : 1 })
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not update staff member.')
    }
  }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', margin: 0 }}>Staff</h2>
        <Button size="sm" onClick={() => setShowAdd(true)} style={{ background: 'var(--green-800)', border: 'none' }}>
          + Add Staff
        </Button>
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
            <Button size="sm" variant={s.is_active ? 'outline-danger' : 'outline-success'} onClick={() => toggleActive(s)}>
              {s.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        </div>
      ))}

      <AddStaffModal show={showAdd} onHide={() => setShowAdd(false)} locations={locations} onAdded={() => { setShowAdd(false); load() }} showAlert={showAlert} />
    </div>
  )
}

function AddStaffModal({ show, onHide, locations, onAdded, showAlert }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [orgRole, setOrgRole]   = useState('org_staff')
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving]     = useState(false)

  const handleAdd = async () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      showAlert('danger', 'Name, email, and an 8+ character password are required.')
      return
    }
    setSaving(true)
    try {
      await axios.post(`${API}/org-portal/staff`, { name, email, password, org_role: orgRole, location_id: locationId || null })
      showAlert('success', 'Staff account created. Share these credentials with them securely.')
      setName(''); setEmail(''); setPassword(''); setOrgRole('org_staff'); setLocationId('')
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
            <option value="org_staff">Org Staff</option>
            <option value="org_admin">Org Admin</option>
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
        <Button size="sm" style={{ background: 'var(--green-800)', border: 'none' }} disabled={saving} onClick={handleAdd}>
          {saving ? 'Creating…' : 'Create Staff Account'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
