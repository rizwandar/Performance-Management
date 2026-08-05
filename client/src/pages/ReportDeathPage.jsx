import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Form, Button, Alert } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function ReportDeathPage() {
  const [form, setForm] = useState({
    owner_email: '', reporter_name: '', reporter_email: '',
    reporter_relationship: '', reporter_phone: '',
  })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    try {
      const res = await axios.post(`${API}/report-death`, form)
      setDone(true)
      setStatus({ type: 'success', msg: res.data.message })
    } catch (err) {
      setStatus({ type: 'danger', msg: err.response?.data?.error || 'Something went wrong. Please try again.' })
    }
    setLoading(false)
  }

  if (done) return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <Card.Body className="text-center py-4">
          <p className="fw-bold mb-2" style={{ color: 'var(--green-900)' }}>Thank you</p>
          <p className="text-muted small mb-3">{status?.msg}</p>
          <Link to="/">Back to homepage</Link>
        </Card.Body>
      </Card>
    </div>
  )

  return (
    <div className="d-flex justify-content-center pt-4" style={{ padding: '0 16px 40px' }}>
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <Card.Header><h5 className="mb-0">Report a Passing</h5></Card.Header>
        <Card.Body>
          <p className="text-muted small mb-4">
            If someone you know who used In Good Hands has passed away, and you have been
            named their executor, use this form to get access right away rather than waiting.
            If you're not their executor, this won't grant you access, but their designated
            executor will be notified.
          </p>

          {status && <Alert variant={status.type}>{status.msg}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Their account email address</Form.Label>
              <Form.Control
                type="email"
                value={form.owner_email}
                onChange={e => setForm({ ...form, owner_email: e.target.value })}
                placeholder="The email they used to sign up"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Your name</Form.Label>
              <Form.Control
                value={form.reporter_name}
                onChange={e => setForm({ ...form, reporter_name: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Your relationship to them <span className="text-muted">(optional)</span></Form.Label>
              <Form.Control
                value={form.reporter_relationship}
                onChange={e => setForm({ ...form, reporter_relationship: e.target.value })}
                placeholder="e.g. spouse, sibling, friend, colleague"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Your email address</Form.Label>
              <Form.Control
                type="email"
                value={form.reporter_email}
                onChange={e => setForm({ ...form, reporter_email: e.target.value })}
                placeholder="In case we need to follow up with you"
                required
              />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>Your phone number <span className="text-muted">(optional)</span></Form.Label>
              <Form.Control
                type="tel"
                value={form.reporter_phone}
                onChange={e => setForm({ ...form, reporter_phone: e.target.value })}
                placeholder="In case email isn't the fastest way to reach you"
              />
            </Form.Group>
            <Button type="submit" variant="primary" className="w-100" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit report'}
            </Button>
          </Form>

          <div className="text-center mt-3">
            <Link to="/" className="text-muted small">Back to homepage</Link>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
