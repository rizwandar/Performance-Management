import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, Form, Button, Alert } from 'react-bootstrap'
import axios from 'axios'
import { getRetryAfterSeconds, rateLimitMessage } from '../utils/rateLimit'

const API = import.meta.env.VITE_API_URL

export default function ForgotPasswordPage() {
  const [method, setMethod] = useState('email')
  const [form, setForm] = useState({ email: '', date_of_birth: '', security_answer: '' })
  const [question, setQuestion] = useState(null)
  const [loadingQuestion, setLoadingQuestion] = useState(false)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    axios.get(`${API}/settings`).then(res => {
      setMethod(res.data.password_reset_method || 'email')
    }).catch(() => {})
  }, [])

  // A reset link is always delivered by email, never returned here directly -
  // date of birth or a security question answer (when the site asks for one)
  // is only an additional check before that email is sent, not an alternate
  // way to get a working link. The response is identical whether the account
  // exists, the additional check matched, or the request was rate-limited, so
  // this form can't be used to test any of that (SEC-04, SEC-05).
  const handleEmailBlur = async () => {
    if (method !== 'security_question' || !form.email || question) return
    setLoadingQuestion(true)
    try {
      const res = await axios.post(`${API}/auth/forgot-password/question`, { email: form.email })
      setQuestion(res.data.question)
    } catch {
      // non-fatal - the security-answer field just won't have a prompt yet
    }
    setLoadingQuestion(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    try {
      const res = await axios.post(`${API}/auth/forgot-password`, form)
      setStatus({ type: 'success', msg: res.data.message })
      setSubmitted(true)
    } catch (err) {
      // The per-email limiter behind this endpoint deliberately disguises a
      // block as the same generic 200 everyone else gets (so being throttled
      // isn't itself a signal an account exists) - a true 429 here would only
      // come from something upstream of that, e.g. general API abuse. Still
      // worth a real message rather than silence or a raw fallback (SEC-14).
      if (err.response?.status === 429) {
        setStatus({ type: 'danger', msg: rateLimitMessage(getRetryAfterSeconds(err)) })
      } else {
        setStatus({ type: 'danger', msg: err.response?.data?.error || 'Something went wrong' })
      }
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
                  onChange={e => { setForm({ ...form, email: e.target.value }); setQuestion(null) }}
                  onBlur={handleEmailBlur}
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
              {method === 'security_question' && (
                <Form.Group className="mb-3">
                  <Form.Label>
                    {loadingQuestion ? 'Loading your security question...' : question || 'Security question answer'}
                  </Form.Label>
                  <Form.Control
                    value={form.security_answer}
                    onChange={e => setForm({ ...form, security_answer: e.target.value })}
                    placeholder="Your answer"
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
