import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, Form, Button, Alert, Row, Col } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm_password: '', date_of_birth: ''
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm_password) {
      return setError('Passwords do not match')
    }
    setSaving(true)
    try {
      await axios.post(`${API}/auth/register`, {
        name: form.name,
        email: form.email,
        password: form.password,
        date_of_birth: form.date_of_birth || null
      })
      navigate('/login', { state: { registered: true } })
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    }
    setSaving(false)
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 500 }}>
        <Card.Header><h5 className="mb-0">Create Your Profile</h5></Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Full Name</Form.Label>
              <Form.Control
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Your full name"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email Address</Form.Label>
              <Form.Control
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
                placeholder="your@email.com"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Date of Birth <span className="text-muted small">(optional — used for password recovery)</span>
              </Form.Label>
              <Form.Control
                type="date"
                value={form.date_of_birth}
                onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </Form.Group>
            <Row className="g-3 mb-4">
              <Col md={6}>
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                  autoComplete="new-password"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Confirm Password</Form.Label>
                <Form.Control
                  type="password"
                  value={form.confirm_password}
                  onChange={e => setForm({ ...form, confirm_password: e.target.value })}
                  required
                  autoComplete="new-password"
                />
              </Col>
            </Row>
            <Button type="submit" variant="primary" className="w-100" disabled={saving}>
              {saving ? 'Creating profile...' : 'Create Profile'}
            </Button>
          </Form>
          <div className="text-center mt-3">
            <small className="text-muted">
              Already have an account? <Link to="/login">Login</Link>
            </small>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
