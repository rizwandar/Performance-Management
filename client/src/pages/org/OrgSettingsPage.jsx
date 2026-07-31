import { useState, useEffect } from 'react'
import { Form, Button, Spinner, Alert, Row, Col } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import { formatPhone } from '@in-good-hands/shared/format'

const API = import.meta.env.VITE_API_URL

const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 20 }

const TIER_LABELS = { starter: 'Starter', professional: 'Professional', growth: 'Growth' }
const BUSINESS_CATEGORIES = [
  'Funeral Home', 'Cremation Services', 'Cemetery / Memorial Park',
  'Pre-Need Insurance Provider', 'Estate & Life Management Services',
  'Hospice / Palliative Care Partner', 'Other',
]

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

  const [profileForm, setProfileForm]     = useState({ name: '', about: '', business_categories: [] })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [selectedTier, setSelectedTier]   = useState('starter')
  const [savingPlan, setSavingPlan]       = useState(false)

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 6000) }

  const load = () => {
    setLoading(true)
    axios.get(`${API}/org-portal/settings`)
      .then(r => {
        setSettings(r.data)
        setPolicy(r.data.location_visibility_policy)
        setProfileForm({ name: r.data.name, about: r.data.about || '', business_categories: r.data.business_categories || [] })
        setSelectedTier(r.data.plan_tier)
      })
      .catch(() => showAlert('danger', 'Could not load settings.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status === 'success') {
      showAlert('success', 'Payment successful, your plan is now active.')
      window.history.replaceState({}, '', '/org/settings')
    } else if (status === 'cancelled') {
      showAlert('info', 'Checkout was cancelled, no charge was made.')
      window.history.replaceState({}, '', '/org/settings')
    }
  }, [])

  const toggleCategory = (c) => {
    setProfileForm(f => ({
      ...f,
      business_categories: f.business_categories.includes(c)
        ? f.business_categories.filter(x => x !== c)
        : [...f.business_categories, c],
    }))
  }

  const saveProfile = async () => {
    if (!profileForm.name.trim()) { showAlert('danger', 'Organization name cannot be empty.'); return }
    setSavingProfile(true)
    try {
      await axios.put(`${API}/org-portal/settings`, profileForm)
      showAlert('success', 'Organization profile updated.')
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not update profile.')
    }
    setSavingProfile(false)
  }

  const uploadLogo = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)
    const fd = new FormData()
    fd.append('logo', file)
    try {
      await axios.post(`${API}/org-portal/logo`, fd)
      showAlert('success', 'Logo updated.')
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not upload logo.')
    }
    setUploadingLogo(false)
  }

  const changePlan = async () => {
    if (selectedTier === settings.plan_tier) return
    setSavingPlan(true)
    try {
      const r = await axios.post(`${API}/org-portal/settings/upgrade-plan`, { plan_tier: selectedTier })
      if (r.data.checkout_url) {
        window.location.href = r.data.checkout_url
        return
      }
      showAlert('success', r.data.message || `Plan changed to ${TIER_LABELS[selectedTier]}.`)
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not change plan.')
    }
    setSavingPlan(false)
  }

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
        <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Plan</div>
        <p className="small text-muted">
          Currently on <strong>{TIER_LABELS[settings.plan_tier]}</strong> ({settings.rate}).
          Moving to a paid plan opens Stripe checkout; switching between paid plans or back to Starter takes effect
          {selectedTier === 'starter' ? ' at the end of your current billing period' : ' immediately, prorated for the rest of the period'}.
        </p>
        {isOrgAdmin ? (
          <>
            <Form.Select size="sm" className="mb-2" style={{ maxWidth: 360 }} value={selectedTier} onChange={e => setSelectedTier(e.target.value)}>
              <option value="starter">Starter: Free (1 Org Admin, 1 Org Staff)</option>
              <option value="professional">Professional: $99/month (3 Org Admins, 3 Org Staff)</option>
              <option value="growth">
                {`Growth: $199/month + $${(settings.overage.overageRateCents / 100).toFixed(2)}/customer beyond ${settings.overage.includedCustomers} (5 Org Admins, 10 Org Staff)`}
              </option>
            </Form.Select>
            <Button size="sm" disabled={savingPlan || selectedTier === settings.plan_tier} onClick={changePlan} style={{ background: 'var(--green-800)', border: 'none' }}>
              {savingPlan ? 'Saving…' : 'Change Plan'}
            </Button>
          </>
        ) : (
          <p className="small text-muted mb-0">Only an Org Admin can change the plan.</p>
        )}
      </div>

      <div style={card}>
        <div className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Organization Profile</div>
        <div className="d-flex align-items-center gap-3 mb-3">
          {settings.logo_url && (
            <img src={settings.logo_url} alt="" width="48" height="48" style={{ borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }} />
          )}
          {isOrgAdmin && (
            <Form.Group>
              <Form.Label className="small fw-bold mb-1">Logo</Form.Label>
              <Form.Control type="file" size="sm" disabled={uploadingLogo} accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={uploadLogo} />
            </Form.Group>
          )}
        </div>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Organization name</Form.Label>
          <Form.Control size="sm" disabled={!isOrgAdmin} value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">About (shown to your customers)</Form.Label>
          <Form.Control as="textarea" rows={2} size="sm" disabled={!isOrgAdmin} value={profileForm.about} onChange={e => setProfileForm({ ...profileForm, about: e.target.value })} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="small fw-bold">Business categories</Form.Label>
          <div>
            {BUSINESS_CATEGORIES.map(c => (
              <Form.Check
                key={c} inline type="checkbox" label={c} disabled={!isOrgAdmin}
                checked={profileForm.business_categories.includes(c)}
                onChange={() => toggleCategory(c)}
              />
            ))}
          </div>
        </Form.Group>
        {isOrgAdmin && (
          <Button size="sm" disabled={savingProfile} onClick={saveProfile} style={{ background: 'var(--green-800)', border: 'none' }}>
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </Button>
        )}
      </div>

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
            <span>{l.name}{l.address ? `, ${l.address}` : ''}{l.phone ? `, ${formatPhone(l.phone)}` : ''}</span>
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
