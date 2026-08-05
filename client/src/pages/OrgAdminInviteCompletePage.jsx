import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

const TIERS = [
  { id: 'starter', name: 'Starter', price: 'Free', detail: '5 customers · 1 Org Admin · 1 Org Staff' },
  { id: 'professional', name: 'Professional', price: '$99/month', detail: '50 customers · 3 Org Admins · 3 Org Staff', highlight: true },
  { id: 'growth', name: 'Growth', price: '$199/month+', detail: 'Unlimited customers · 5 Org Admins · 10 Org Staff' },
]

export default function OrgAdminInviteCompletePage() {
  const { token } = useParams()
  const navigate   = useNavigate()
  const { login }  = useAuth()

  const [info, setInfo]       = useState(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [planTier, setPlanTier]   = useState('starter')
  const [password, setPassword]   = useState('')
  const [consent, setConsent]     = useState(false)

  useEffect(() => {
    axios.get(`${API}/org-register/${token}`)
      .then(r => setInfo(r.data))
      .catch(err => setError(err.response?.data?.error || 'This link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!consent) { setError('You must agree to the Privacy Policy and Terms of Service to continue.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setSubmitting(true)
    setError('')
    try {
      const r = await axios.post(`${API}/org-register/${token}/complete`, { plan_tier: planTier, password, privacy_consent: consent })
      login(r.data.user, r.data.csrf_token)
      navigate('/org')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not complete setup. Please try again.')
    }
    setSubmitting(false)
  }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  if (error && !info) {
    return (
      <div className="d-flex justify-content-center pt-4">
        <Card style={{ width: '100%', maxWidth: 480 }}>
          <Card.Body><Alert variant="danger" className="mb-0">{error}</Alert></Card.Body>
        </Card>
      </div>
    )
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 620 }}>
        <Card.Header><h5 className="mb-0">Set up {info.org_name}</h5></Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <p className="text-muted small">
            Payments aren't active yet during our launch period. Choosing any plan gives you full access
            now. We'll follow up separately once billing is switched on.
          </p>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-4">
              <Form.Label className="fw-bold">Choose your plan</Form.Label>
              <Row className="g-2">
                {TIERS.map(t => (
                  <Col md={4} key={t.id}>
                    <div
                      onClick={() => setPlanTier(t.id)}
                      style={{
                        cursor: 'pointer', borderRadius: 8, padding: '12px',
                        border: planTier === t.id ? '2px solid var(--green-800)' : '1px solid var(--border)',
                        background: planTier === t.id ? 'var(--green-50)' : 'transparent',
                      }}
                    >
                      <Form.Check
                        type="radio" name="plan" id={`plan-${t.id}`} checked={planTier === t.id}
                        onChange={() => setPlanTier(t.id)}
                        label={<strong style={{ color: 'var(--green-900)' }}>{t.name}</strong>}
                      />
                      <div className="small">{t.price}</div>
                      <div className="text-muted small">{t.detail}</div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control value={info.email} disabled />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Choose a password</Form.Label>
              <Form.Control type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Check
                type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                label={<span>I agree to the <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms of Service</Link></span>}
              />
            </Form.Group>
            <Button type="submit" className="w-100" disabled={submitting} style={{ background: 'var(--green-800)', border: 'none' }}>
              {submitting ? 'Setting up your organization…' : 'Complete setup'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}
