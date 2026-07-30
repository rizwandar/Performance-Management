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
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    axios.get(`${API}/settings`).then(res => {
      setMethod(res.data.password_reset_method || 'email')
    }).catch(() => {})
  }, [])

  // A reset link is always delivered by email, never returned here directly -
  // date of birth (when the site asks for it) is only an additional check
  // before that email is sent, not an alternate way to get a working link.
  // The response is identical whether the account exists, the DOB matched, or
  // the request was rate-limited, so this form can't be used to test either.
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    try {
      const res = await axios.post(`${API}/auth/forgot-password`, form)
      setStatus({ type: 'success', msg: res.data.message })
      setSubmitted(true)
    } catch (err) {
      setStatus({ type: 'danger', msg: err.response?.data?.error || 'Something went wrong' })
    }
    setLoading(false)
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Header><h5 className="mb-0">Reset Password</h5></Card.Header>
        <Card.Body>
          {status && <Alert variant={status.type}>{status.msg}</Alert>}

          {!submitted && (
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
                {loading ? 'Sending...' : 'Send Reset Link'}
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
