import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, Form, Button, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

const API = import.meta.env.VITE_API_URL

export default function OrgTokenPage() {
  const { token } = useParams()
  const navigate   = useNavigate()
  const { login }  = useAuth()

  const [info, setInfo]       = useState(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(true)

  const [name, setName]         = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approved, setApproved] = useState(false)

  useEffect(() => {
    axios.get(`${API}/org-links/${token}`)
      .then(r => { setInfo(r.data); setName(r.data.name || '') })
      .catch(err => setError(err.response?.data?.error || 'This link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  const completeSignup = async (e) => {
    e.preventDefault()
    if (!consent) { setError('You must agree to the Privacy Policy and Terms of Service to continue.'); return }
    setSubmitting(true)
    setError('')
    try {
      const r = await axios.post(`${API}/org-links/${token}/complete-invite`, { name, password, privacy_consent: consent })
      login(r.data.user, r.data.csrf_token)
      navigate('/profile')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not complete signup. Please try again.')
    }
    setSubmitting(false)
  }

  const approveLink = async () => {
    setSubmitting(true)
    setError('')
    try {
      await axios.post(`${API}/org-links/${token}/approve`)
      setApproved(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not approve this request. Please try again.')
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

  if (info.token_type === 'link_request' || info.token_type === 'edit_consent') {
    const isEdit = info.token_type === 'edit_consent'
    return (
      <div className="d-flex justify-content-center pt-4">
        <Card style={{ width: '100%', maxWidth: 480 }}>
          <Card.Header><h5 className="mb-0">{isEdit ? `Edit access request from ${info.org_name}` : `Connect with ${info.org_name}`}</h5></Card.Header>
          <Card.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            {approved ? (
              <>
                <Alert variant="success">
                  {isEdit
                    ? `${info.org_name} can now make edits to your plan on your behalf.`
                    : `You're connected. ${info.org_name} staff can now view your plan to help you complete it.`}
                </Alert>
                <Link to="/login" className="btn btn-sm" style={{ background: 'var(--green-800)', color: '#fff', border: 'none' }}>Sign in</Link>
              </>
            ) : (
              <>
                <p>
                  {isEdit ? (
                    <><strong>{info.org_name}</strong> is requesting permission to make edits to your plan on your behalf, to help you complete it. You can revoke this at any time from your account settings.</>
                  ) : (
                    <><strong>{info.org_name}</strong> would like to connect to your In Good Hands account to assist with your planning. Approving this lets their staff view your plan. No data moves and nothing changes until you approve.</>
                  )}
                </p>
                <Button disabled={submitting} onClick={approveLink} style={{ background: 'var(--green-800)', border: 'none' }}>
                  {submitting ? 'Approving…' : isEdit ? 'Grant edit access' : 'Approve connection'}
                </Button>
              </>
            )}
          </Card.Body>
        </Card>
      </div>
    )
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <Card.Header><h5 className="mb-0">You've been invited to In Good Hands</h5></Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <p className="small text-muted">
            <strong>{info.org_name}</strong> has invited you to complete an end-of-life plan. They will never see or set your password.
          </p>
          <Form onSubmit={completeSignup}>
            <Form.Group className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control value={name} onChange={e => setName(e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control value={info.email} disabled />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Choose a password</Form.Label>
              <Form.Control type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Check
                type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                label={<span>I agree to the <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms of Service</Link></span>}
              />
            </Form.Group>
            <Button type="submit" className="w-100" disabled={submitting} style={{ background: 'var(--green-800)', border: 'none' }}>
              {submitting ? 'Creating your account…' : 'Complete signup'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}
