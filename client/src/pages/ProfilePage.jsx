import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Spinner, InputGroup } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

function PasswordRequirements({ password }) {
  const checks = [
    { label: 'At least 8 characters',  met: password.length >= 8 },
    { label: 'One uppercase letter',    met: /[A-Z]/.test(password) },
    { label: 'One number',             met: /[0-9]/.test(password) },
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

export default function ProfilePage() {
  const { user: authUser, login, token, logout } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const [form, setForm] = useState({ name: '', email: '', date_of_birth: '' })

  // Change password state
  const [pwForm, setPwForm]     = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  // Inactivity timer state
  const [timerData, setTimerData]     = useState(null)
  const [timerMonths, setTimerMonths] = useState(12)
  const [savingTimer, setSavingTimer] = useState(false)

  // Vault password state
  const [vaultExists, setVaultExists]       = useState(null)  // null = loading, true/false
  const [vaultPwForm, setVaultPwForm]       = useState({ old_password: '', new_password: '', confirm: '' })
  const [showVaultFields, setShowVaultFields] = useState({ old: false, new: false })
  const [vaultPwSaving, setVaultPwSaving]   = useState(false)
  const [vaultPwError, setVaultPwError]     = useState('')
  const [vaultPwSuccess, setVaultPwSuccess] = useState('')
  // Reset vault state
  const [showVaultReset, setShowVaultReset]   = useState(false)
  const [vaultResetPw, setVaultResetPw]       = useState('')
  const [vaultResetting, setVaultResetting]   = useState(false)
  const [vaultResetError, setVaultResetError] = useState('')

  // Delete account state
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deleteForm, setDeleteForm] = useState({ password: '', vault_password: '' })
  const [deleting, setDeleting]     = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    const loadProfile = axios.get(`${API}/users/me`)
      .then(r => {
        const u = r.data
        setForm({
          name:          u.name          || '',
          email:         u.email         || '',
          date_of_birth: u.date_of_birth || '',
        })
      })
      .catch(() => {
        setForm({
          name:          authUser?.name  || '',
          email:         authUser?.email || '',
          date_of_birth: '',
        })
      })

    const loadTimer = axios.get(`${API}/users/me/timer`)
      .then(r => { setTimerData(r.data); setTimerMonths(r.data.inactivity_period_months) })
      .catch(() => {})

    const loadVault = axios.get(`${API}/sections/digital-life/vault`)
      .then(r => setVaultExists(r.data.exists))
      .catch(() => setVaultExists(false))

    Promise.all([loadProfile, loadTimer, loadVault]).finally(() => setLoading(false))
  }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Your name is required.')
    setError('')
    setSaving(true)
    try {
      await axios.put(`${API}/users/me`, form)
      if (authUser && form.name !== authUser.name) {
        login(token, { ...authUser, name: form.name })
      }
      setSuccess('Profile saved.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save your profile. Please try again.")
    }
    setSaving(false)
  }

  const handleChangePassword = async () => {
    setPwError('')
    if (!pwForm.current || !pwForm.next) return setPwError('Please fill in all fields.')
    if (pwForm.next !== pwForm.confirm) return setPwError('New passwords do not match.')
    if (pwForm.next.length < 8) return setPwError('New password must be at least 8 characters.')
    if (!/[A-Z]/.test(pwForm.next)) return setPwError('New password must contain at least one uppercase letter.')
    if (!/[0-9]/.test(pwForm.next)) return setPwError('New password must contain at least one number.')

    setPwSaving(true)
    try {
      await axios.post(`${API}/users/me/change-password`, {
        current_password: pwForm.current,
        new_password:     pwForm.next,
      })
      setPwSuccess('Password changed successfully.')
      setPwForm({ current: '', next: '', confirm: '' })
      setTimeout(() => setPwSuccess(''), 4000)
    } catch (err) {
      setPwError(err.response?.data?.error || "We couldn't change your password. Please try again.")
    }
    setPwSaving(false)
  }

  const handleChangeVaultPw = async () => {
    const { old_password, new_password, confirm } = vaultPwForm
    setVaultPwError('')
    if (!old_password) return setVaultPwError('Please enter your current vault password.')
    if (!new_password || new_password.length < 8) return setVaultPwError('New vault password must be at least 8 characters.')
    if (new_password !== confirm) return setVaultPwError('New passwords do not match.')
    setVaultPwSaving(true)
    try {
      await axios.put(`${API}/sections/digital-life/vault`, { old_password, new_password })
      setVaultPwForm({ old_password: '', new_password: '', confirm: '' })
      setVaultPwSuccess('Vault password changed. All credentials re-encrypted with the new password.')
      setTimeout(() => setVaultPwSuccess(''), 5000)
    } catch (err) {
      setVaultPwError(err.response?.data?.error || 'Could not change vault password. Please try again.')
    }
    setVaultPwSaving(false)
  }

  const handleResetVault = async () => {
    setVaultResetError('')
    if (!vaultResetPw) return setVaultResetError('Please enter your account password to confirm.')
    setVaultResetting(true)
    try {
      await axios.delete(`${API}/sections/digital-life/vault`, { data: { account_password: vaultResetPw } })
      setVaultExists(false)
      setShowVaultReset(false)
      setVaultResetPw('')
      setSuccess('Vault reset. Your vault-protected data has been deleted. You can set a new vault password next time you visit Digital Life or Legal Documents.')
      setTimeout(() => setSuccess(''), 6000)
    } catch (err) {
      setVaultResetError(err.response?.data?.error || 'Could not reset vault. Please try again.')
    }
    setVaultResetting(false)
  }

  const handleSaveTimer = async () => {
    setSavingTimer(true)
    try {
      const r = await axios.put(`${API}/users/me/timer`, { inactivity_period_months: timerMonths })
      setTimerData(td => ({ ...td, inactivity_period_months: r.data.inactivity_period_months }))
      setSuccess('Inactivity period updated.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't update the timer.")
    }
    setSavingTimer(false)
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    if (!deleteForm.password) return setDeleteError('Please enter your account password.')
    setDeleting(true)
    try {
      await axios.delete(`${API}/users/me`, {
        data: {
          password:       deleteForm.password,
          vault_password: deleteForm.vault_password || undefined,
        },
      })
      logout()
      navigate('/', { state: { accountDeleted: true } })
    } catch (err) {
      const data = err.response?.data || {}
      if (data.requires_vault) {
        setDeleteError('You have a vault set up. Please also enter your vault password.')
      } else {
        setDeleteError(data.error || 'Could not delete your account. Please try again.')
      }
    }
    setDeleting(false)
  }

  const formatDate = iso => {
    if (!iso) return 'Not set'
    try { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) }
    catch { return iso }
  }

  if (loading) return (
    <div className="text-center py-5">
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="mb-4">
        <h3 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif' }}>My Profile</h3>
        <p className="text-muted">Your account details and security settings.</p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error   && <Alert variant="danger">{error}</Alert>}

      {/* ── Personal Details ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 20 }}>Personal Details</h6>
        <Row className="g-3 mb-3">
          <Col md={6}>
            <Form.Label>Full name <span style={{ color: 'var(--gold)' }}>*</span></Form.Label>
            <Form.Control value={form.name} onChange={set('name')} placeholder="Your full name" />
          </Col>
          <Col md={6}>
            <Form.Label>Date of birth</Form.Label>
            <Form.Control type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
          </Col>
        </Row>
        <Form.Group className="mb-1">
          <Form.Label>Email address</Form.Label>
          <Form.Control type="email" value={form.email} onChange={set('email')} />
          <Form.Text className="text-muted">
            This is also your sign-in email. Changes take effect immediately.
          </Form.Text>
        </Form.Group>

        <div className="mt-4">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save details'}
          </Button>
        </div>
      </div>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Change Password</h6>
        <p className="text-muted small mb-4">
          Choose a strong password you don't use elsewhere. If you've forgotten your password,
          sign out and use the <strong>Forgot password</strong> link on the sign-in page.
        </p>

        {pwSuccess && <Alert variant="success">{pwSuccess}</Alert>}
        {pwError   && <Alert variant="danger">{pwError}</Alert>}

        <Form.Group className="mb-3">
          <Form.Label>Current password</Form.Label>
          <Form.Control type="password" value={pwForm.current} autoComplete="current-password"
            onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
        </Form.Group>
        <Row className="g-3">
          <Col md={6}>
            <Form.Label>New password</Form.Label>
            <Form.Control type="password" value={pwForm.next} autoComplete="new-password"
              onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} />
            <PasswordRequirements password={pwForm.next} />
          </Col>
          <Col md={6}>
            <Form.Label>Confirm new password</Form.Label>
            <Form.Control type="password" value={pwForm.confirm} autoComplete="new-password"
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
          </Col>
        </Row>

        <div className="mt-4">
          <Button variant="outline-primary" onClick={handleChangePassword} disabled={pwSaving}>
            {pwSaving ? 'Changing...' : 'Change password'}
          </Button>
        </div>
      </div>

      {/* ── Vault Password ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Vault Password</h6>
        <p className="text-muted small mb-4">
          Your vault password protects your most sensitive sections: Personal &amp; Legal Documents
          and Digital Life. It is never stored on our servers. If you forget it, the only option
          is a full vault reset, which permanently deletes all vault-protected content.
        </p>

        {vaultExists === false && (
          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 8, padding: '14px 16px', fontSize: '0.9rem',
          }}>
            <span style={{ color: 'var(--green-800)' }}>
              🔐 No vault set up yet.
            </span>
            <p className="text-muted small mb-0 mt-1">
              Your vault password will be created the first time you open the
              Personal & Legal Documents or Digital Life sections.
            </p>
          </div>
        )}

        {vaultExists === true && !showVaultReset && (
          <>
            <div style={{
              background: 'var(--green-50)', border: '1px solid var(--green-100)',
              borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: '0.85rem',
              color: 'var(--green-800)',
            }}>
              🔒 Vault is active. Your legal documents and digital credentials are protected.
            </div>

            {vaultPwSuccess && <Alert variant="success">{vaultPwSuccess}</Alert>}
            {vaultPwError   && <Alert variant="danger">{vaultPwError}</Alert>}

            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600 }}>Current vault password</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showVaultFields.old ? 'text' : 'password'}
                  value={vaultPwForm.old_password}
                  onChange={e => setVaultPwForm(f => ({ ...f, old_password: e.target.value }))}
                  placeholder="Your current vault password"
                />
                <Button variant="outline-secondary"
                  onClick={() => setShowVaultFields(f => ({ ...f, old: !f.old }))}>
                  {showVaultFields.old ? 'Hide' : 'Show'}
                </Button>
              </InputGroup>
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>New vault password</Form.Label>
                <InputGroup>
                  <Form.Control
                    type={showVaultFields.new ? 'text' : 'password'}
                    value={vaultPwForm.new_password}
                    onChange={e => setVaultPwForm(f => ({ ...f, new_password: e.target.value }))}
                    placeholder="At least 8 characters"
                  />
                  <Button variant="outline-secondary"
                    onClick={() => setShowVaultFields(f => ({ ...f, new: !f.new }))}>
                    {showVaultFields.new ? 'Hide' : 'Show'}
                  </Button>
                </InputGroup>
              </Col>
              <Col md={6}>
                <Form.Label>Confirm new password</Form.Label>
                <Form.Control
                  type="password"
                  value={vaultPwForm.confirm}
                  onChange={e => setVaultPwForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Type it again"
                />
              </Col>
            </Row>
            <div className="d-flex gap-3 align-items-center flex-wrap mt-4">
              <Button variant="outline-primary" onClick={handleChangeVaultPw} disabled={vaultPwSaving}>
                {vaultPwSaving ? 'Changing...' : 'Change vault password'}
              </Button>
              <button className="btn btn-link p-0"
                style={{ color: '#DC3545', fontSize: '0.85rem' }}
                onClick={() => { setShowVaultReset(true); setVaultResetError(''); setVaultResetPw('') }}>
                Reset vault (deletes all vault data)
              </button>
            </div>
          </>
        )}

        {showVaultReset && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '20px' }}>
            <p style={{ color: '#9f1239', fontWeight: 600, marginBottom: 8 }}>⚠️ Reset your vault</p>
            <p className="small mb-3" style={{ color: '#7f1d1d' }}>
              This permanently deletes <strong>all</strong> vault-protected data, including legal documents and
              digital credentials. This action cannot be undone. You can set a new vault password afterwards.
            </p>
            {vaultResetError && <Alert variant="danger">{vaultResetError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600 }}>Confirm with your account password</Form.Label>
              <Form.Control
                type="password"
                value={vaultResetPw}
                onChange={e => setVaultResetPw(e.target.value)}
                placeholder="Your In Good Hands login password"
                autoFocus
              />
            </Form.Group>
            <div className="d-flex gap-3">
              <Button variant="danger" onClick={handleResetVault} disabled={vaultResetting}>
                {vaultResetting ? 'Resetting...' : 'Yes, delete all vault data'}
              </Button>
              <Button variant="outline-secondary" onClick={() => { setShowVaultReset(false); setVaultResetError('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Inactivity Timer ──────────────────────────────────────────────── */}
      {timerData && (
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)' }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Inactivity Timer</h6>
          <p className="text-muted small mb-4">
            If you don't log in within this period, your trusted contacts will be notified.
            Logging in resets the timer automatically.
          </p>

          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 10, padding: '16px 20px', marginBottom: 20,
          }}>
            <Row className="text-center g-0">
              <Col>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--green-900)', lineHeight: 1 }}>
                  {timerData.days_left}
                </div>
                <div className="text-muted small mt-1">days remaining</div>
              </Col>
              <Col style={{ borderLeft: '1px solid var(--green-100)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--green-800)', fontWeight: 600 }}>Last active</div>
                <div className="text-muted small">{formatDate(timerData.last_active_at)}</div>
              </Col>
              <Col style={{ borderLeft: '1px solid var(--green-100)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--green-800)', fontWeight: 600 }}>Resets on</div>
                <div className="text-muted small">every login</div>
              </Col>
            </Row>
          </div>

          <Form.Group className="mb-3">
            <Form.Label style={{ fontWeight: 600 }}>How long before your contacts are notified?</Form.Label>
            <Form.Select value={timerMonths} onChange={e => setTimerMonths(Number(e.target.value))}
              style={{ maxWidth: 280 }}>
              <option value={2}>2 months</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months (recommended)</option>
              <option value={18}>18 months</option>
              <option value={24}>24 months</option>
            </Form.Select>
            <Form.Text className="text-muted">You'll receive reminder emails as the deadline approaches.</Form.Text>
          </Form.Group>
          <Button variant="outline-primary" onClick={handleSaveTimer} disabled={savingTimer}>
            {savingTimer ? 'Saving...' : 'Update timer'}
          </Button>
        </div>
      )}

      {/* ── Delete My Account ────────────────────────────────────────────── */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginTop: 24 }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Delete My Account</h6>
        <p className="text-muted small mb-3" style={{ lineHeight: 1.65 }}>
          Permanently delete your account and all associated data. This includes all your plans,
          wishes, contacts, messages, uploaded files, and vault data. This cannot be undone.
          Your data will be erased immediately and a confirmation email will be sent to you.
        </p>
        <p className="text-muted small mb-4" style={{ lineHeight: 1.65 }}>
          Your data export (PDF) serves as your portable copy. We recommend downloading it before deleting.
          Alternatively, contact the administrator who will call you to confirm before proceeding.
        </p>

        {!showDeleteAccount ? (
          <Button variant="outline-danger" size="sm"
            onClick={() => { setShowDeleteAccount(true); setDeleteError(''); setDeleteForm({ password: '', vault_password: '' }) }}>
            Delete my account permanently
          </Button>
        ) : (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '20px' }}>
            <p style={{ color: '#991B1B', fontWeight: 600, marginBottom: 8 }}>
              This will permanently delete everything. Are you sure?
            </p>
            {deleteError && <Alert variant="danger" className="py-2 small">{deleteError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Your account password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Confirm with your account password"
                value={deleteForm.password}
                onChange={e => setDeleteForm(f => ({ ...f, password: e.target.value }))}
                autoFocus
              />
            </Form.Group>
            {vaultExists && (
              <Form.Group className="mb-3">
                <Form.Label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Your vault password</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="Required because you have a vault set up"
                  value={deleteForm.vault_password}
                  onChange={e => setDeleteForm(f => ({ ...f, vault_password: e.target.value }))}
                />
                <Form.Text className="text-muted small">Vault-protected data is included in the deletion.</Form.Text>
              </Form.Group>
            )}
            <div className="d-flex gap-3 mt-4">
              <Button variant="danger" onClick={handleDeleteAccount} disabled={deleting}>
                {deleting ? 'Deleting everything…' : 'Yes, permanently delete my account'}
              </Button>
              <Button variant="outline-secondary"
                onClick={() => { setShowDeleteAccount(false); setDeleteError('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
