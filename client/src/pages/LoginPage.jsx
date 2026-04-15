import { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { Card, Form, Button, Alert } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const registered = location.state?.registered

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post(`${API}/auth/login`, form)
      login(res.data.token, res.data.user)
      navigate(res.data.user.is_admin ? '/admin' : '/profile')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    }
    setLoading(false)
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Card.Header><h5 className="mb-0">Login</h5></Card.Header>
        <Card.Body>
          {registered && <Alert variant="success">Profile created! Please log in.</Alert>}
          {error && <Alert variant="danger">{error}</Alert>}
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
              <Form.Control
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="current-password"
              />
            </Form.Group>
            <Button type="submit" variant="primary" className="w-100" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </Form>
          <div className="text-center mt-3">
            <Link to="/forgot-password" className="text-muted small">Forgot password?</Link>
          </div>
          <div className="text-center mt-2">
            <small className="text-muted">
              Don't have an account? <Link to="/register">Create one</Link>
            </small>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
