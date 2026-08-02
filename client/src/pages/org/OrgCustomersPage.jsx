import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Button, Modal, Spinner, Badge, Alert } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

const API = import.meta.env.VITE_API_URL

const STATUS_LABELS = {
  invited:          'Invited',
  signed_up:        'Signed Up',
  plan_in_progress: 'Plan In Progress',
  plan_completed:   'Plan Completed',
  deceased:         'Deceased',
  archived:         'Archived',
}

const STATUS_COLORS = {
  invited:          'var(--text-muted)',
  signed_up:        'var(--green-700)',
  plan_in_progress: '#B45309',
  plan_completed:   'var(--green-800)',
  deceased:         '#4B5563',
  archived:         '#9CA3AF',
}

const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 16 }

export default function OrgCustomersPage() {
  const [customers, setCustomers] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [selected, setSelected]   = useState(null)
  const [alert, setAlert]         = useState(null)

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 4000) }

  const load = () => {
    setLoading(true)
    Promise.all([
      axios.get(`${API}/org-portal/customers`),
      axios.get(`${API}/org-portal/locations`),
    ]).then(([c, l]) => { setCustomers(c.data); setLocations(l.data) })
      .catch(() => showAlert('danger', 'Could not load customers.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', margin: 0 }}>Customers</h2>
        <Button size="sm" onClick={() => setShowAdd(true)} style={{ background: 'var(--green-800)', border: 'none' }}>
          + Add Customer
        </Button>
      </div>

      {alert && <Alert variant={alert.type}>{alert.msg}</Alert>}

      {customers.length === 0 && <div style={card} className="text-center text-muted">No customers yet.</div>}

      {customers.map(c => (
        <div key={c.id} style={{ ...card, cursor: 'pointer' }} onClick={() => setSelected(c)}>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green-900)' }}>{c.user_name || c.invited_name}</div>
              <div className="small text-muted">{c.user_email || c.invited_email}{c.location_name ? ` · ${c.location_name}` : ''}</div>
            </div>
            <Badge style={{ background: STATUS_COLORS[c.lifecycle_status] }}>{STATUS_LABELS[c.lifecycle_status]}</Badge>
          </div>
        </div>
      ))}

      <AddCustomerModal show={showAdd} onHide={() => setShowAdd(false)} locations={locations} onAdded={() => { setShowAdd(false); load() }} showAlert={showAlert} />

      {selected && (
        <CustomerDetailModal customer={selected} onHide={() => { setSelected(null); load() }} showAlert={showAlert} />
      )}
    </div>
  )
}

function AddCustomerModal({ show, onHide, locations, onAdded, showAlert }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving]     = useState(false)

  const handleAdd = async () => {
    if (!name.trim() || !email.trim()) { showAlert('danger', 'Name and email are required.'); return }
    setSaving(true)
    try {
      await axios.post(`${API}/org-portal/customers`, { name, email, location_id: locationId || null })
      showAlert('success', 'Customer added. An invitation email has been sent.')
      setName(''); setEmail(''); setLocationId('')
      onAdded()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not add customer.')
    }
    setSaving(false)
  }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', color: 'var(--green-900)' }}>Add Customer</Modal.Title>
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
        {locations.length > 0 && (
          <Form.Group className="mb-3">
            <Form.Label className="small fw-bold">Location (optional)</Form.Label>
            <Form.Select value={locationId} onChange={e => setLocationId(e.target.value)}>
              <option value="">No location</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Form.Select>
          </Form.Group>
        )}
        <p className="small text-muted mb-0">
          If this email already has an In Good Hands account, they'll receive a request to connect instead
          of an invitation. Either way, nothing changes until they approve.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>Cancel</Button>
        <Button size="sm" style={{ background: 'var(--green-800)', border: 'none' }} disabled={saving} onClick={handleAdd}>
          {saving ? 'Adding…' : 'Add Customer'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function CustomerDetailModal({ customer, onHide, showAlert }) {
  const { startViewAs } = useAuth()
  const navigate = useNavigate()

  const [status, setStatus]           = useState(customer.lifecycle_status)
  const [saving, setSaving]           = useState(false)
  const [confirmingDeceased, setConfirmingDeceased] = useState(false)
  const [markingDeceased, setMarkingDeceased]       = useState(false)
  const [requestingConsent, setRequestingConsent]   = useState(false)
  const [startingViewAs, setStartingViewAs]         = useState(false)

  const viewAs = async () => {
    setStartingViewAs(true)
    try {
      const r = await axios.post(`${API}/org-portal/customers/${customer.id}/view-as`)
      startViewAs(r.data.customer_name, r.data.edit_allowed)
      navigate('/profile')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not start view-as.')
      setStartingViewAs(false)
    }
  }

  const canChangeStatus = !['deceased', 'archived'].includes(customer.lifecycle_status) && customer.lifecycle_status !== 'invited'

  const requestEditConsent = async () => {
    setRequestingConsent(true)
    try {
      await axios.post(`${API}/org-portal/customers/${customer.id}/request-edit-consent`)
      showAlert('success', 'Edit consent request sent.')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not send request.')
    }
    setRequestingConsent(false)
  }

  const updateStatus = async () => {
    setSaving(true)
    try {
      await axios.put(`${API}/org-portal/customers/${customer.id}/status`, { lifecycle_status: status })
      showAlert('success', 'Status updated.')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not update status.')
    }
    setSaving(false)
  }

  const archive = async () => {
    setSaving(true)
    try {
      await axios.put(`${API}/org-portal/customers/${customer.id}/status`, { lifecycle_status: 'archived' })
      showAlert('success', 'Customer archived.')
      onHide()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not archive customer.')
    }
    setSaving(false)
  }

  const confirmDeceased = async () => {
    setMarkingDeceased(true)
    try {
      await axios.post(`${API}/org-portal/customers/${customer.id}/deceased`, { confirm: true })
      showAlert('success', 'Customer marked deceased. Their executor has been notified if one was designated.')
      onHide()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not update this customer.')
    }
    setMarkingDeceased(false)
  }

  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.1rem', color: 'var(--green-900)' }}>
          {customer.user_name || customer.invited_name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted">{customer.user_email || customer.invited_email}</p>
        <p className="small">Current status: <strong>{STATUS_LABELS[customer.lifecycle_status]}</strong></p>

        {customer.user_id && (
          <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
            <Badge bg={customer.view_consent ? 'success' : 'secondary'}>
              {customer.view_consent ? 'View consent granted' : 'No view consent'}
            </Badge>
            <Badge bg={customer.edit_consent ? 'success' : 'secondary'}>
              {customer.edit_consent ? 'Edit consent granted' : 'No edit consent'}
            </Badge>
            {customer.view_consent && !customer.edit_consent && (
              <Button size="sm" variant="outline-secondary" disabled={requestingConsent} onClick={requestEditConsent}>
                {requestingConsent ? 'Sending…' : 'Request edit consent'}
              </Button>
            )}
            {customer.view_consent && customer.lifecycle_status !== 'deceased' && (
              <Button size="sm" disabled={startingViewAs} onClick={viewAs} style={{ background: 'var(--green-800)', border: 'none' }}>
                {startingViewAs ? 'Opening…' : 'View plan'}
              </Button>
            )}
          </div>
        )}

        {customer.lifecycle_status === 'deceased' && (
          <Alert variant="secondary" className="small">
            This plan is locked. Only the IGHP Administrator can revert a deceased status.
          </Alert>
        )}

        {canChangeStatus && (
          <>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Update status</Form.Label>
              <Form.Select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="plan_in_progress">Plan In Progress</option>
                <option value="plan_completed">Plan Completed</option>
              </Form.Select>
            </Form.Group>
            <div className="d-flex gap-2 mb-3">
              <Button size="sm" disabled={saving} onClick={updateStatus} style={{ background: 'var(--green-800)', border: 'none' }}>
                Save status
              </Button>
              <Button size="sm" variant="outline-secondary" disabled={saving} onClick={archive}>Archive</Button>
            </div>

            <hr />
            {!confirmingDeceased ? (
              <Button size="sm" variant="outline-danger" onClick={() => setConfirmingDeceased(true)}>
                Mark as Deceased
              </Button>
            ) : (
              <Alert variant="danger" className="small">
                <p className="mb-2">
                  This will permanently lock {customer.user_name || customer.invited_name}'s plan from further edits
                  and notify their designated executor, if one exists. This cannot be undone except by the IGHP
                  Administrator.
                </p>
                <div className="d-flex gap-2">
                  <Button size="sm" variant="danger" disabled={markingDeceased} onClick={confirmDeceased}>
                    {markingDeceased ? 'Confirming…' : 'Yes, mark as deceased'}
                  </Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => setConfirmingDeceased(false)}>Cancel</Button>
                </div>
              </Alert>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
