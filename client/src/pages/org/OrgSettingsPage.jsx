import { useState, useEffect } from 'react'
import { Form, Button, Spinner, Alert, Row, Col } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

const API = import.meta.env.VITE_API_URL

const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 20 }

export default function OrgSettingsPage() {
  const { user } = useAuth()
  const isOrgAdmin = user?.org_role === 'org_admin'

  const [settings, setSettings]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [policy, setPolicy]       = useState('all_locations')
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [locationForm, setLocationForm] = useState({ name: '', address: '', phone: '' })
  const [savingLocation, setSavingLocation] = useState(false)
  const [alert, setAlert]         = useState(null)

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 4000) }

  const load = () => {
    setLoading(true)
    axios.get(`${API}/org-portal/settings`)
      .then(r => { setSettings(r.data); setPolicy(r.data.location_visibility_policy) })
      .catch(() => showAlert('danger', 'Could not load settings.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const savePolicy = async () => {
    setSavingPolicy(true)
    try {
      await axios.put(`${API}/org-portal/settings`, { location_visibility_policy: policy })
      showAlert('success', 'Location visibility policy updated.')
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not update policy.')
    }
    setSavingPolicy(false)
  }

  const addLocation = async () => {
    if (!locationForm.name.trim()) return
    setSavingLocation(true)
    try {
      await axios.post(`${API}/org-portal/locations`, locationForm)
      setLocationForm({ name: '', address: '', phone: '' })
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not add location.')
    }
    setSavingLocation(false)
  }

  const deleteLocation = async (id) => {
    try {
      await axios.delete(`${API}/org-portal/locations/${id}`)
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not remove location.')
    }
  }

  if (loading || !settings) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  return (
    <div>
      <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 24 }}>Settings</h2>
      {alert && <Alert variant={alert.type}>{alert.msg}</Alert>}

      <div style={card}>
        <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Location visibility</div>
        <p className="small text-muted">Controls which customers your staff can see.</p>
        <Form.Check
          type="radio" name="policy" id="policy-all" label="All locations: every staff member sees all customers"
          checked={policy === 'all_locations'} disabled={!isOrgAdmin}
          onChange={() => setPolicy('all_locations')}
        />
        <Form.Check
          type="radio" name="policy" id="policy-own" label="Own location only: staff see only customers assigned to their location"
          checked={policy === 'own_location'} disabled={!isOrgAdmin}
          onChange={() => setPolicy('own_location')}
          className="mb-3"
        />
        {isOrgAdmin && (
          <Button size="sm" disabled={savingPolicy} onClick={savePolicy} style={{ background: 'var(--green-800)', border: 'none' }}>
            {savingPolicy ? 'Saving…' : 'Save policy'}
          </Button>
        )}
      </div>

      <div style={card}>
        <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Locations ({settings.locations.length})</div>
        {settings.locations.map(l => (
          <div key={l.id} className="small mb-1 d-flex justify-content-between align-items-center">
            <span>{l.name}{l.address ? ` — ${l.address}` : ''}{l.phone ? ` — ${l.phone}` : ''}</span>
            {isOrgAdmin && (
              <Button variant="link" size="sm" className="text-danger p-0" onClick={() => deleteLocation(l.id)}>Remove</Button>
            )}
          </div>
        ))}
        {isOrgAdmin && (
          <Row className="g-2 mt-2">
            <Col xs={4}><Form.Control size="sm" placeholder="Name" value={locationForm.name} onChange={e => setLocationForm({ ...locationForm, name: e.target.value })} /></Col>
            <Col xs={4}><Form.Control size="sm" placeholder="Address" value={locationForm.address} onChange={e => setLocationForm({ ...locationForm, address: e.target.value })} /></Col>
            <Col xs={3}><Form.Control size="sm" placeholder="Phone" value={locationForm.phone} onChange={e => setLocationForm({ ...locationForm, phone: e.target.value })} /></Col>
            <Col xs={1}>
              <Button size="sm" disabled={savingLocation} onClick={addLocation} style={{ background: 'var(--green-800)', border: 'none' }}>+</Button>
            </Col>
          </Row>
        )}
      </div>
    </div>
  )
}
