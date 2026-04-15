import { useState, useEffect } from 'react'
import { Card, Table, Form, Button, Alert, Spinner, Badge, Row, Col, InputGroup } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function AdminPage() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [settings, setSettings] = useState({})

  const showAlert = (type, msg) => {
    setAlert({ type, msg })
    setTimeout(() => setAlert(null), 3000)
  }

  const loadAll = async () => {
    try {
      const [statsRes, settingsRes] = await Promise.all([
        axios.get(`${API}/admin/stats`),
        axios.get(`${API}/settings`)
      ])
      setStats(statsRes.data)
      setSettings(settingsRes.data)
    } catch {}
  }

  const loadUsers = async (q = '') => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/admin/users`, { params: q ? { q } : {} })
      setUsers(res.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    loadUsers()
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    loadUsers(query)
  }

  const togglePermission = async (userId, field, value) => {
    try {
      const user = users.find(u => u.id === userId)
      await axios.put(`${API}/admin/users/${userId}/permissions`, {
        songs_enabled: field === 'songs_enabled' ? (value ? 1 : 0) : user.songs_enabled,
        bucket_list_enabled: field === 'bucket_list_enabled' ? (value ? 1 : 0) : user.bucket_list_enabled
      })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value ? 1 : 0 } : u))
    } catch {
      showAlert('danger', 'Failed to update permissions')
    }
  }

  const saveSetting = async (key, value) => {
    try {
      await axios.put(`${API}/settings/${key}`, { value })
      setSettings(prev => ({ ...prev, [key]: value }))
      showAlert('success', 'Setting saved!')
    } catch {
      showAlert('danger', 'Failed to save setting')
    }
  }

  return (
    <>
      <h2 className="page-title mb-4">Admin Panel</h2>

      {alert && <Alert variant={alert.type} dismissible onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* Stats */}
      <Row className="mb-4 g-3">
        <Col xs={6} md={3}>
          <Card className="text-center h-100">
            <Card.Body>
              <div className="fs-1 fw-bold text-primary">{stats?.total_users ?? '—'}</div>
              <div className="text-muted small">Total Users</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* App Settings */}
      <Card className="mb-4">
        <Card.Header className="fw-bold">App Settings</Card.Header>
        <Card.Body>
          <Form.Label className="fw-semibold mb-2">Password Reset Method</Form.Label>
          <div className="d-flex gap-4 mb-1">
            <Form.Check
              type="radio"
              id="reset-email"
              label="Email (Resend)"
              name="reset_method"
              checked={settings.password_reset_method === 'email'}
              onChange={() => saveSetting('password_reset_method', 'email')}
            />
            <Form.Check
              type="radio"
              id="reset-dob"
              label="Date of Birth"
              name="reset_method"
              checked={settings.password_reset_method === 'dob'}
              onChange={() => saveSetting('password_reset_method', 'dob')}
            />
          </div>
          <Form.Text className="text-muted">
            <strong>Email:</strong> sends a reset link via Resend. &nbsp;
            <strong>Date of Birth:</strong> user verifies with their registered DOB.
          </Form.Text>
        </Card.Body>
      </Card>

      {/* User Management */}
      <Card>
        <Card.Header className="fw-bold">User Management</Card.Header>
        <Card.Body>
          <Form onSubmit={handleSearch} className="mb-3">
            <InputGroup>
              <Form.Control
                placeholder="Search by name or email..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <Button type="submit" variant="primary">Search</Button>
              {query && (
                <Button variant="outline-secondary" onClick={() => { setQuery(''); loadUsers() }}>Clear</Button>
              )}
            </InputGroup>
          </Form>

          {loading ? (
            <div className="text-center py-3"><Spinner animation="border" variant="primary" /></div>
          ) : users.length === 0 ? (
            <p className="text-muted text-center py-3">No users found.</p>
          ) : (
            <Table responsive hover className="align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Joined</th>
                  <th className="text-center">Songs</th>
                  <th className="text-center">Bucket List</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="fw-semibold">{u.name}</td>
                    <td><small className="text-muted">{u.email}</small></td>
                    <td><small className="text-muted">{new Date(u.created_at).toLocaleDateString()}</small></td>
                    <td className="text-center">
                      <Form.Check
                        type="switch"
                        checked={!!u.songs_enabled}
                        onChange={e => togglePermission(u.id, 'songs_enabled', e.target.checked)}
                      />
                    </td>
                    <td className="text-center">
                      <Form.Check
                        type="switch"
                        checked={!!u.bucket_list_enabled}
                        onChange={e => togglePermission(u.id, 'bucket_list_enabled', e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </>
  )
}
