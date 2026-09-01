import { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { Card, Form, Button, Alert } from 'react-bootstrap'
import axios from 'axios'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'
import { getRetryAfterSeconds, rateLimitMessage, useCountdown } from '../utils/rateLimit'

const API = import.meta.env.VITE_API_URL

// Show a soft warning before a lockout actually happens, once a few
// consecutive attempts have failed, and point straight at the way out
// (SEC-14) rather than letting the next failure be the first anyone hears
// of it.
const EARLY_WARNING_THRESHOLD = 3

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const countdown = useCountdown(retryAfterSeconds)
  const registered = location.state?.registered
  const vaultDestroyed = location.state?.vaultDestroyed

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setRetryAfterSeconds(null)
    setLoading(true)
    try {
      const res = await axios.post(`${API}/auth/login`, form)
      setFailedAttempts(0)
      login(res.data.user, res.data.csrf_token)
      navigate(
        res.data.user.is_admin ? '/admin'
          : res.data.user.org_role ? '/org'
          : res.data.needs_trial_offer ? '/welcome-trial'
          : '/profile'
      )
    } catch (err) {
      if (!err.response) {
        setError("We couldn't reach the server. Please check your connection and try again.")
      } else if (err.response.status === 429) {
        setRetryAfterSeconds(getRetryAfterSeconds(err))
      } else if (err.response.status === 401) {
        setFailedAttempts(n => n + 1)
        setError('Incorrect email or password. Please check your details and try again.')
      } else {
        setError(err.response?.data?.error || 'Sign in failed. Please try again.')
      }
    }
    setLoading(false)
  }

  // Once the countdown reaches 0 the window has reset server-side too, so
  // drop back to the normal form instead of leaving a stale "0:00" message up.
  const rateLimited = retryAfterSeconds != null && countdown > 0
  // Show alongside the "incorrect password" error, not instead of it - every
  // failed attempt sets `error`, so gating this on `!error` (as originally
  // shipped) meant it could only ever appear in the brief loading window of
  // the *next* submit, before that attempt's own response overwrote it again.
  // Found live on production 2026-08-07: the banner never actually rendered
  // in practice. failedAttempts alone is the right signal.
  const showEarlyWarning = !rateLimited && failedAttempts >= EARLY_WARNING_THRESHOLD

  return (
    <div className="d-flex flex-column align-items-center pt-4">
      <p className="text-muted text-center mb-3" style={{ maxWidth: 380, fontSize: '0.92rem' }}>
        Everything in good hands.
      </p>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Header><h5 className="mb-0">Welcome back</h5></Card.Header>
        <Card.Body>
          {registered && (
            <Alert variant="success">
              <strong>Account created.</strong> Please check your email for a verification link before signing in.
              Once verified, you can sign in here.
            </Alert>
          )}
          {vaultDestroyed && (
            <Alert variant="danger">
              <strong>Your vault has been permanently deleted</strong> after too many incorrect password
              attempts, per your account's safety setting. Sign in to set up a new vault password. We
              sent you an email with details.
            </Alert>
          )}
          {rateLimited && <Alert variant="danger">{rateLimitMessage(countdown)}</Alert>}
          {!rateLimited && error && <Alert variant="danger">{error}</Alert>}
          {showEarlyWarning && (
            <Alert variant="warning">
              A few more failed attempts will temporarily lock sign-in from this device.{' '}
              <Link to="/forgot-password">Forgot your password?</Link>
            </Alert>
          )}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="text"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
                placeholder="your@email.com"
                autoComplete="username"
              />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>Password</Form.Label>
              <PasswordInput
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="current-password"
              />
            </Form.Group>
            <Button type="submit" variant="primary" className="w-100" disabled={loading || rateLimited}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </Form>
          <div className="text-center mt-3">
            <Link to="/forgot-password" className="text-muted small">Forgot your password?</Link>
          </div>
          <div className="text-center mt-2">
            <small className="text-muted">
              New here? <Link to="/register">Begin your journey</Link>
            </small>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
