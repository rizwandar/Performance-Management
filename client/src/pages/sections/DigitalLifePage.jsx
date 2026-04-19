import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner, InputGroup } from 'react-bootstrap'
import axios from 'axios'
import { VaultSetupScreen, VaultLockScreen } from '../../components/VaultGate'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const COMMON_SERVICES = [
  'Gmail', 'Outlook / Hotmail', 'Yahoo Mail', 'iCloud',
  'Facebook', 'Instagram', 'Twitter / X', 'LinkedIn', 'TikTok', 'YouTube',
  'Netflix', 'Spotify', 'Amazon', 'Apple ID', 'Google Account',
  'PayPal', 'eBay', 'Afterpay', 'Online Banking',
  'Medicare / My Health Record', 'myGov', 'ATO Online',
  'Dropbox', 'Google Drive', 'OneDrive',
  'Other',
]

const emptyForm = { service: '', service_url: '', username: '', password: '', notes: '' }

// VaultSetupScreen and VaultLockScreen are imported from components/VaultGate

// ---------------------------------------------------------------------------
// Main page — renders the right screen based on vault state
// ---------------------------------------------------------------------------
export default function DigitalLifePage() {
  const navigate = useNavigate()

  // vault state: 'loading' | 'no-vault' | 'locked' | 'unlocked'
  const [vaultState, setVaultState] = useState('loading')
  const [vaultPassword, setVaultPassword] = useState('')  // in memory only

  const [items, setItems]         = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(emptyForm)
  const [showPasswords, setShowPasswords] = useState({})  // id → bool
  const [showFormPw, setShowFormPw] = useState(false)


  // Check if vault exists on mount
  useEffect(() => {
    axios.get(`${API}/sections/digital-life/vault`)
      .then(r => setVaultState(r.data.exists ? 'locked' : 'no-vault'))
      .catch(() => setVaultState('locked'))
  }, [])

  const loadItems = useCallback((pw) => {
    setLoadingItems(true)
    axios.post(`${API}/sections/digital-life/list`, { vault_password: pw })
      .then(r => setItems(r.data))
      .catch(() => setError("Couldn't load credentials. Please lock and try again."))
      .finally(() => setLoadingItems(false))
  }, [])

  const handleUnlock = (pw) => {
    setVaultPassword(pw)
    setVaultState('unlocked')
    loadItems(pw)
  }

  const handleLock = () => {
    setVaultPassword('')
    setItems([])
    setVaultState('locked')
  }

  const handleVaultReset = () => {
    // Vault was destroyed — go back to setup screen
    setVaultState('no-vault')
    setVaultPassword('')
    setItems([])
  }

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowFormPw(false)
    setError('')
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      service:     item.service     || '',
      service_url: item.service_url || '',
      username:    item.username    || '',
      password:    item.password    || '',
      notes:       item.notes       || '',
    })
    setShowFormPw(false)
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.service.trim()) return setError('Please select or enter a service name.')
    if (!form.username.trim() && !form.password.trim()) return setError('Please enter at least a username or password.')
    setError('')
    setSaving(true)
    try {
      const payload = { ...form, vault_password: vaultPassword }
      if (editing) {
        await axios.put(`${API}/sections/digital-life/${editing.id}`, payload)
      } else {
        await axios.post(`${API}/sections/digital-life`, payload)
      }
      setShowModal(false)
      setSuccess(editing ? 'Credential updated.' : 'Credential saved.')
      loadItems(vaultPassword)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this credential from your vault?')) return
    try {
      await axios.delete(`${API}/sections/digital-life/${id}`, { data: { vault_password: vaultPassword } })
      loadItems(vaultPassword)
    } catch {
      setError("Couldn't remove this credential. Please try again.")
    }
  }

  const toggleShowPassword = (id) => {
    setShowPasswords(p => ({ ...p, [id]: !p[id] }))
  }

  // ── Back link ──────────────────────────────────────────────────────────────
  const backLink = (
    <div className="mb-4">
      <button className="btn btn-link p-0 mb-2"
        style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
        onClick={() => navigate('/profile')}>
        ← Back to my plans
      </button>
      <h3 style={{ color: 'var(--green-900)' }}>💻 Digital Life</h3>
      <p className="text-muted">
        Securely store the usernames and passwords for your online accounts.
        Everything is encrypted. Only you can unlock it with your vault password.
      </p>
    </div>
  )

  // ── Loading ────────────────────────────────────────────────────────────────
  if (vaultState === 'loading') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
        <div className="text-center py-5">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      </div>
    )
  }

  // ── No vault yet ──────────────────────────────────────────────────────────
  if (vaultState === 'no-vault') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
        <VaultSetupScreen onSetup={() => setVaultState('locked')} />
      </div>
    )
  }

  // ── Locked ────────────────────────────────────────────────────────────────
  if (vaultState === 'locked') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
        <VaultLockScreen onUnlock={handleUnlock} onReset={handleVaultReset} />
      </div>
    )
  }

  // ── Unlocked — main vault UI ───────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {backLink}

      {/* Vault status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 8, padding: '10px 16px', marginBottom: 24,
      }}>
        <span style={{ color: 'var(--green-800)', fontSize: '0.9rem' }}>
          🔓 Vault unlocked. Credentials are visible in this session only.
        </span>
        <div className="d-flex gap-3">
          <button className="btn btn-link p-0"
            style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textDecoration: 'none' }}
            onClick={() => navigate('/profile/settings')}>
            Manage vault
          </button>
          <button className="btn btn-link p-0"
            style={{ color: 'var(--green-800)', fontSize: '0.85rem', textDecoration: 'none' }}
            onClick={handleLock}>
            Lock vault
          </button>
        </div>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add an account</Button>
      </div>

      {/* Credentials list */}
      {loadingItems ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>💻</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No accounts saved yet</p>
          <p className="text-muted small mb-0">
            Add your email accounts, social media, subscriptions, banking logins, and more.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 4, fontSize: '1rem' }}>
                    {item.service}
                    {item.service_url && (
                      <a href={item.service_url} target="_blank" rel="noopener noreferrer"
                        style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--gold)' }}>
                        ↗ visit
                      </a>
                    )}
                  </p>

                  {item.username && (
                    <p className="text-muted small mb-1">
                      <span style={{ fontWeight: 600 }}>Username / email:</span> {item.username}
                    </p>
                  )}

                  {item.password && (
                    <p className="small mb-1" style={{ fontFamily: 'monospace' }}>
                      <span style={{ fontWeight: 600, fontFamily: 'inherit' }}>Password: </span>
                      {showPasswords[item.id]
                        ? <span style={{ letterSpacing: '0.05em' }}>{item.password}</span>
                        : '••••••••••••'
                      }
                      <button
                        className="btn btn-link p-0 ms-2"
                        style={{ fontSize: '0.78rem', color: 'var(--green-800)' }}
                        onClick={() => toggleShowPassword(item.id)}
                      >
                        {showPasswords[item.id] ? 'hide' : 'show'}
                      </button>
                    </p>
                  )}

                  {item.notes && (
                    <p className="text-muted small mb-0" style={{ fontStyle: 'italic' }}>{item.notes}</p>
                  )}
                </div>

                <div className="d-flex gap-2 ms-3 flex-shrink-0">
                  <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                  <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Remove</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? `Edit ${editing.service}` : 'Add an account'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Service <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Select
                  value={COMMON_SERVICES.includes(form.service) ? form.service : 'Other'}
                  onChange={e => {
                    if (e.target.value !== 'Other') setForm({ ...form, service: e.target.value })
                    else setForm({ ...form, service: '' })
                  }}
                >
                  <option value="">Select a service</option>
                  {COMMON_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </Form.Select>
                {(!COMMON_SERVICES.includes(form.service) || form.service === '') && (
                  <Form.Control
                    className="mt-2"
                    value={form.service}
                    onChange={e => setForm({ ...form, service: e.target.value })}
                    placeholder="Type service name"
                  />
                )}
              </Col>
              <Col md={6}>
                <Form.Label>Website URL</Form.Label>
                <Form.Control
                  value={form.service_url}
                  onChange={e => setForm({ ...form, service_url: e.target.value })}
                  placeholder="e.g. https://gmail.com"
                />
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Username or email</Form.Label>
              <Form.Control
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="The username or email you log in with"
                autoComplete="off"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showFormPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Password"
                  autoComplete="new-password"
                />
                <Button variant="outline-secondary" onClick={() => setShowFormPw(s => !s)}>
                  {showFormPw ? 'Hide' : 'Show'}
                </Button>
              </InputGroup>
            </Form.Group>

            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea" rows={2}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Security questions, PINs, recovery codes, or anything else worth noting..."
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Save to vault'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
      </div>
    </div>
  )
}
