import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Card, Form, Button, Alert } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

function PasswordRequirements({ password }) {
  const checks = [
    { label: 'At least 8 characters',    met: password.length >= 8 },
    { label: 'One uppercase letter',      met: /[A-Z]/.test(password) },
    { label: 'One number',               met: /[0-9]/.test(password) },
  ]
  if (!password) return null
  return (
    <ul className="list-unstyled mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
      {checks.map(c => (
        <li key={c.label} style={{ color: c.met ? 'var(--success)' : 'var(--text-muted)' }}>
          {c.met ? '✓' : '○'} {c.label}
        </li>
      ))}
    </ul>
  )
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [form, setForm]     = useState({ password: '', confirm: '' })
  const [status, setStatus] = useState(null)
  const [done, setDone]     = useState(false)
  const [loading, setLoading] = useState(false)

  if (!token) return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Body className="text-center">
          <Alert variant="danger">Invalid or missing reset link.</Alert>
          <Link to="/forgot-password">Request a new one</Link>
        </Card.Body>
      </Card>
    </div>
  )

  if (done) return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Body className="text-center py-4">
          <p style={{ color: 'var(--success)', fontWeight: 600 }} className="mb-3">
            Your password has been updated.
          </p>
          <Link to="/login">Sign in</Link>
        </Card.Body>
      </Card>
    </div>
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      return setStatus({ type: 'danger', msg: 'Passwords do not match.' })
    }
    setLoading(true)
    setStatus(null)
    try {
      await axios.post(`${API}/auth/reset-password`, { token, password: form.password })
      setDone(true)
    } catch (err) {
      setStatus({ type: 'danger', msg: err.response?.data?.error || 'We couldn\'t reset your password. Please try again.' })
    }
    setLoading(false)
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Header><h5 className="mb-0">Choose a new password</h5></Card.Header>
        <Card.Body>
          {status && <Alert variant={status.type}>{status.msg}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>New password</Form.Label>
              <Form.Control
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="new-password"
              />
              <PasswordRequirements password={form.password} />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>Confirm new password</Form.Label>
              <Form.Control
                type="password"
                value={form.confirm}
                onChange={e => setForm({ ...form, confirm: e.target.value })}
                required
                autoComplete="new-password"
              />
            </Form.Group>
            <Button type="submit" variant="primary" className="w-100" disabled={loading}>
              {loading ? 'Updating...' : 'Update my password'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}
