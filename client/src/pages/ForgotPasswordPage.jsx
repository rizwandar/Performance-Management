import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, Form, Button, Alert } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function ForgotPasswordPage() {
  const [method, setMethod] = useState('email')
  const [form, setForm] = useState({ email: '', date_of_birth: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dobToken, setDobToken] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    axios.get(`${API}/settings`).then(res => {
      setMethod(res.data.password_reset_method || 'email')
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    try {
      const res = await axios.post(`${API}/auth/forgot-password`, form)
      if (method === 'dob' && res.data.token) {
        setDobToken(res.data.token)
      } else {
        setStatus({ type: 'success', msg: res.data.message })
      }
    } catch (err) {
      setStatus({ type: 'danger', msg: err.response?.data?.error || 'Something went wrong' })
    }
    setLoading(false)
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      return setStatus({ type: 'danger', msg: 'Passwords do not match' })
    }
    setLoading(true)
    try {
      await axios.post(`${API}/auth/reset-password`, { token: dobToken, password: newPassword })
      setDone(true)
    } catch (err) {
      setStatus({ type: 'danger', msg: err.response?.data?.error || 'Reset failed' })
    }
    setLoading(false)
  }

  if (done) return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Body className="text-center py-4">
          <p className="text-success fw-bold mb-3">Password reset successfully!</p>
          <Link to="/login">Back to Login</Link>
        </Card.Body>
      </Card>
    </div>
  )

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Header><h5 className="mb-0">Reset Password</h5></Card.Header>
        <Card.Body>
          {status && <Alert variant={status.type}>{status.msg}</Alert>}

          {dobToken ? (
            <Form onSubmit={handleReset}>
              <p className="text-muted small mb-3">Identity verified. Enter your new password below.</p>
              <Form.Group className="mb-3">
                <Form.Label>New Password</Form.Label>
                <Form.Control
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Confirm Password</Form.Label>
                <Form.Control
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </Form.Group>
              <Button type="submit" variant="primary" className="w-100" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </Form>
          ) : (
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label>Email Address</Form.Label>
                <Form.Control
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                />
              </Form.Group>
              {method === 'dob' && (
                <Form.Group className="mb-3">
                  <Form.Label>Date of Birth</Form.Label>
                  <Form.Control
                    type="date"
                    value={form.date_of_birth}
                    onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
                    required
                  />
                </Form.Group>
              )}
              <Button type="submit" variant="primary" className="w-100 mb-3" disabled={loading}>
                {loading ? 'Sending...' : method === 'email' ? 'Send Reset Link' : 'Verify & Continue'}
              </Button>
            </Form>
          )}
          <div className="text-center">
            <Link to="/login" className="text-muted small">Back to Login</Link>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
