import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Form, Button, Alert, Row, Col } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const BUSINESS_CATEGORIES = [
  'Funeral Home', 'Cremation Services', 'Cemetery / Memorial Park',
  'Pre-Need Insurance Provider', 'Estate & Life Management Services',
  'Hospice / Palliative Care Partner', 'Other',
]

const TIERS = [
  { name: 'Starter', price: 'Free', customers: 'Up to 5 customers', admins: '1 Org Admin', staff: '1 Org Staff' },
  { name: 'Professional', price: '$99/mo', customers: 'Up to 50 customers', admins: '3 Org Admins', staff: '3 Org Staff', highlight: true },
  { name: 'Growth', price: '$199/mo+', customers: 'Unlimited customers', admins: '5 Org Admins', staff: '10 Org Staff' },
]

export default function RegisterOrganizationPage() {
  const [form, setForm] = useState({ org_name: '', business_categories: [], applicant_name: '', applicant_email: '' })
  const [error, setError]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving]   = useState(false)

  const toggleCategory = (c) => {
    setForm(f => ({
      ...f,
      business_categories: f.business_categories.includes(c)
        ? f.business_categories.filter(x => x !== c)
        : [...f.business_categories, c],
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.org_name.trim()) return setError('Please enter your organization name.')
    if (!form.applicant_name.trim()) return setError('Please enter your name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.applicant_email)) return setError('Please enter a valid email address.')

    setSaving(true)
    try {
      await axios.post(`${API}/org-register/apply`, form)
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit your application. Please try again.')
    }
    setSaving(false)
  }

  if (submitted) {
    return (
      <div className="d-flex justify-content-center pt-4">
        <Card style={{ width: '100%', maxWidth: 560 }}>
          <Card.Body>
            <Alert variant="success" className="mb-0">
              <strong>Application received.</strong> Check <strong>{form.applicant_email}</strong> for a link to
              choose your plan and finish setting up {form.org_name}.
            </Alert>
          </Card.Body>
        </Card>
      </div>
    )
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 680 }}>
        <Card.Header><h5 className="mb-0">Register Your Organization</h5></Card.Header>
        <Card.Body>
          <div className="d-flex gap-2 mb-3">
            <Button as={Link} to="/register" variant="outline-secondary" size="sm">
              I'm signing up for myself
            </Button>
            <Button variant="primary" size="sm" disabled style={{ pointerEvents: 'none' }}>
              I'm registering my organization
            </Button>
          </div>

          <p className="text-muted small">
            For funeral homes, cremation services, cemeteries, and life management companies who want to
            help their customers complete an end-of-life plan on In Good Hands.
          </p>

          <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <p className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>What you'll be able to do</p>
            <Row className="g-3 small text-muted">
              <Col md={6}>
                <strong style={{ color: 'var(--green-900)' }}>Org Admin</strong>
                <ul className="mb-0 ps-3">
                  <li>Add and manage staff accounts</li>
                  <li>Manage locations and visibility settings</li>
                  <li>View and assist all customers</li>
                  <li>Manage the org profile and plan</li>
                </ul>
              </Col>
              <Col md={6}>
                <strong style={{ color: 'var(--green-900)' }}>Org Staff</strong>
                <ul className="mb-0 ps-3">
                  <li>Add and manage customers</li>
                  <li>View customers at their assigned location</li>
                  <li>Help customers complete their plans</li>
                </ul>
              </Col>
            </Row>
          </div>

          <div className="mb-4">
            <p className="fw-bold small mb-2" style={{ color: 'var(--green-900)' }}>Plans at a glance</p>
            <Row className="g-2">
              {TIERS.map(t => (
                <Col md={4} key={t.name}>
                  <div style={{
                    border: t.highlight ? '2px solid var(--green-800)' : '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 12px', height: '100%',
                  }}>
                    <div className="fw-bold small" style={{ color: 'var(--green-900)' }}>{t.name}</div>
                    <div className="small">{t.price}</div>
                    <div className="text-muted small mt-1">{t.customers}</div>
                    <div className="text-muted small">{t.admins} · {t.staff}</div>
                  </div>
                </Col>
              ))}
            </Row>
            <p className="text-muted small mt-2 mb-0">
              You'll pick your plan on the next step. <Link to="/pricing">Full pricing details</Link>.
            </p>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Organization name</Form.Label>
              <Form.Control value={form.org_name} onChange={e => setForm({ ...form, org_name: e.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Business categories</Form.Label>
              <div>
                {BUSINESS_CATEGORIES.map(c => (
                  <Form.Check
                    key={c} inline type="checkbox" label={c}
                    checked={form.business_categories.includes(c)}
                    onChange={() => toggleCategory(c)}
                  />
                ))}
              </div>
            </Form.Group>
            <Row className="g-3 mb-4">
              <Col md={6}>
                <Form.Label>Your name</Form.Label>
                <Form.Control value={form.applicant_name} onChange={e => setForm({ ...form, applicant_name: e.target.value })} required />
              </Col>
              <Col md={6}>
                <Form.Label>Your email</Form.Label>
                <Form.Control type="email" value={form.applicant_email} onChange={e => setForm({ ...form, applicant_email: e.target.value })} required />
              </Col>
            </Row>
            <p className="text-muted small">
              We'll email this address a secure link to choose your plan and set your password. You'll be
              the organization's first Org Admin.
            </p>
            <Button type="submit" variant="primary" className="w-100" disabled={saving}>
              {saving ? 'Submitting…' : 'Submit Application'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}
