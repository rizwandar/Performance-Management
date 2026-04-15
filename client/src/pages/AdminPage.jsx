import { useState, useEffect } from 'react'
import { Card, Table, Form, Button, Alert, Spinner, Badge, Row, Col, InputGroup, Modal } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function AdminPage() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [settings, setSettings] = useState({})
  const [selectedUser, setSelectedUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)

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

  const openUser = async (userId) => {
    setLoadingUser(true)
    setSelectedUser(null)
    try {
      const res = await axios.get(`${API}/admin/users/${userId}`)
      setSelectedUser(res.data)
    } catch {
      showAlert('danger', 'Failed to load user profile')
    }
    setLoadingUser(false)
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
                    <td
                      className="fw-semibold text-primary"
                      style={{ cursor: 'pointer' }}
                      onClick={() => openUser(u.id)}
                    >
                      {u.name}
                    </td>
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
      {/* User profile modal */}
      <Modal show={loadingUser || !!selectedUser} onHide={() => { setSelectedUser(null); setLoadingUser(false) }} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{selectedUser ? selectedUser.name : 'Loading...'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingUser && <div className="text-center py-4"><Spinner animation="border" variant="primary" /></div>}

          {selectedUser && (
            <>
              {/* Basic info */}
              <Row className="g-2 mb-3">
                <Col md={6}>
                  <small className="text-muted d-block">Email</small>
                  <span>{selectedUser.email}</span>
                </Col>
                <Col md={3}>
                  <small className="text-muted d-block">Date of Birth</small>
                  <span>{selectedUser.date_of_birth || '—'}</span>
                </Col>
                <Col md={3}>
                  <small className="text-muted d-block">Joined</small>
                  <span>{new Date(selectedUser.created_at).toLocaleDateString()}</span>
                </Col>
                {selectedUser.emergency_contact_name && (
                  <Col md={12}>
                    <small className="text-muted d-block">Trusted Contact</small>
                    <span>{selectedUser.emergency_contact_name}</span>
                    {selectedUser.emergency_contact_phone && <span className="text-muted ms-2">· {selectedUser.emergency_contact_phone}</span>}
                    {selectedUser.emergency_contact_email && <span className="text-muted ms-2">· {selectedUser.emergency_contact_email}</span>}
                  </Col>
                )}
              </Row>

              {/* About me */}
              {selectedUser.about_me && (
                <div className="mb-3">
                  <small className="text-muted d-block fw-semibold mb-1">Their Story</small>
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{selectedUser.about_me}</p>
                </div>
              )}

              {/* Legacy message */}
              {selectedUser.legacy_message && (
                <div className="mb-3">
                  <small className="text-muted d-block fw-semibold mb-1">Words for Those They Leave Behind</small>
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{selectedUser.legacy_message}</p>
                </div>
              )}

              {/* Songs */}
              {selectedUser.songs?.length > 0 && (
                <div className="mb-3">
                  <small className="text-muted d-block fw-semibold mb-1">
                    Favourite Songs ({selectedUser.songs.length})
                  </small>
                  {selectedUser.songs.map(s => (
                    <div key={s.id} className="py-1 border-bottom small">
                      <span className="fw-semibold">{s.title}</span>
                      <span className="text-muted ms-2">— {s.artist}</span>
                      {s.album && <span className="text-muted ms-2">({s.album})</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Bucket list */}
              {selectedUser.bucket_list?.length > 0 && (
                <div>
                  <small className="text-muted d-block fw-semibold mb-1">
                    Bucket List ({selectedUser.bucket_list.length})
                  </small>
                  {selectedUser.bucket_list.map(item => (
                    <div key={item.id} className="py-2 border-bottom">
                      <div className="fw-semibold small">{item.title}</div>
                      {item.description && <div className="text-muted small">{item.description}</div>}
                      {item.planning && <div className="text-muted small"><strong>Planning:</strong> {item.planning}</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setSelectedUser(null)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
