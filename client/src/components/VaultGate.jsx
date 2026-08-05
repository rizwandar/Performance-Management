/**
 * Shared vault UI screens used by Digital Life and Legal Documents.
 * Both sections use the same vault (digital_vault table), so these
 * screens hit the same endpoints regardless of which section renders them.
 */
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Alert, InputGroup, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// First-time vault setup
// ---------------------------------------------------------------------------
export function VaultSetupScreen({ onSetup }) {
  const [pw, setPw]           = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [showPw, setShowPw]   = useState(false)

  const handleSetup = async () => {
    if (pw.length < 8) return setError('Your vault password must be at least 8 characters.')
    if (pw !== confirm)  return setError("Passwords don't match.")
    setError('')
    setSaving(true)
    try {
      await axios.post(`${API}/sections/digital-life/vault`, { vault_password: pw })
      onSetup()
    } catch (err) {
      setError(err.response?.data?.error || 'Setup failed. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <div style={{
        background: 'var(--parchment)', borderRadius: 12,
        padding: '32px 36px', border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 12 }}>🔐</div>
        <h5 style={{ color: 'var(--green-900)', textAlign: 'center', marginBottom: 8 }}>
          Set up your vault password
        </h5>
        <p className="text-muted small text-center mb-4">
          Your most sensitive information (Personal &amp; Legal Documents, Digital Vault credentials,
          Financial Affairs, Property &amp; Possessions, and Household Information) is
          protected by a separate vault password that only you know.
          Once set, it applies to all five sections.
        </p>

        {error && <Alert variant="danger">{error}</Alert>}

        <div style={{
          background: '#FEF3C7', border: '1px solid #F59E0B',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.85rem',
        }}>
          <strong>Important:</strong> Your vault password is never stored on our servers.
          If you forget it, your vault-protected data cannot be recovered.
          Resetting your vault <strong>permanently deletes</strong> all five vault-protected sections.
          Keep your vault password somewhere safe, or use Settings to change it any time while
          you still remember it.
        </div>

        <Form.Group className="mb-3">
          <Form.Label style={{ fontWeight: 600 }}>Vault password</Form.Label>
          <InputGroup>
            <Form.Control
              type={showPw ? 'text' : 'password'}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="At least 8 characters"
            />
            <Button variant="outline-secondary" onClick={() => setShowPw(s => !s)}>
              {showPw ? 'Hide' : 'Show'}
            </Button>
          </InputGroup>
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label style={{ fontWeight: 600 }}>Confirm vault password</Form.Label>
          <Form.Control
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Type it again"
            onKeyDown={e => e.key === 'Enter' && handleSetup()}
          />
        </Form.Group>

        <Button variant="primary" className="btn-vault w-100" onClick={handleSetup} disabled={saving}>
          {saving ? 'Setting up...' : 'Create my vault'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unlock / Reset screen
// ---------------------------------------------------------------------------
export function VaultLockScreen({ onUnlock, onReset }) {
  const { logout } = useAuth()
  const navigate   = useNavigate()

  const [pw, setPw]             = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError]       = useState('')
  // 'none' -> locked screen, 'choice' -> "do you still remember an earlier password?",
  // 'confirm' -> the destructive delete-everything screen
  const [resetStep, setResetStep] = useState('none')
  const [lockedUntil, setLockedUntil] = useState(null)

  // Reset flow
  const [accountPw, setAccountPw]   = useState('')
  const [resetting, setResetting]   = useState(false)
  const [resetError, setResetError] = useState('')

  const inputRef = useRef(null)

  const handleUnlock = async () => {
    if (!pw) return setError('Please enter your vault password.')
    setError('')
    setChecking(true)
    try {
      await axios.post(`${API}/sections/digital-life/vault/verify`, { vault_password: pw })
      setLockedUntil(null)
      onUnlock(pw)
    } catch (err) {
      const data = err.response?.data || {}
      if (data.vault_locked) {
        setLockedUntil(data.locked_until)
        setChecking(false)
        return
      }
      if (data.force_logout) {
        logout()
        navigate('/login', { state: { vaultLockout: true } })
        return
      }
      const isNetworkError = !err.response
      setError(isNetworkError
        ? 'Could not reach the server. Please check your connection and try again.'
        : (data.error || 'Incorrect vault password. Please try again.')
      )
      setChecking(false)
      // Refocus the input after a failed attempt so the user can immediately retry
      setTimeout(() => inputRef.current?.focus(), 50)
      return
    }
    setChecking(false)
  }

  const handleReset = async () => {
    if (!accountPw) return setResetError('Please enter your account password to confirm.')
    setResetError('')
    setResetting(true)
    try {
      await axios.delete(`${API}/sections/digital-life/vault`, { data: { account_password: accountPw } })
      onReset()
    } catch (err) {
      setResetError(err.response?.data?.error || 'Could not reset vault. Please try again.')
    }
    setResetting(false)
  }

  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()

  if (resetStep === 'choice') {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{
          background: 'var(--parchment)', borderRadius: 12,
          padding: '32px 36px', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 12 }}>🔑</div>
          <h5 style={{ color: 'var(--green-900)', textAlign: 'center', marginBottom: 8 }}>
            Forgot your vault password?
          </h5>
          <p className="text-muted small text-center mb-4">
            Do you still remember an earlier vault password, even if the attempt you just made
            didn't work? A typo is easy to fix without losing anything.
          </p>

          <Button variant="primary" className="w-100 mb-2" onClick={() => navigate('/profile/settings')}>
            Yes, take me to Settings to change it
          </Button>
          <p className="text-muted small text-center mb-4" style={{ fontSize: '0.8rem' }}>
            Settings lets you change your vault password using your current one. Nothing is deleted.
          </p>

          <Button variant="outline-danger" className="w-100 mb-3" onClick={() => setResetStep('confirm')}>
            No, I've completely forgotten it
          </Button>

          <button className="btn btn-link w-100 p-0"
            style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}
            onClick={() => setResetStep('none')}>
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (resetStep === 'confirm') {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 12, padding: '32px 36px' }}>
          <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 12 }}>⚠️</div>
          <h5 style={{ color: '#9f1239', textAlign: 'center', marginBottom: 8 }}>Reset your vault</h5>
          <p className="small text-center mb-4" style={{ color: '#7f1d1d' }}>
            This will <strong>permanently delete all vault-protected data</strong>: Personal &amp; Legal
            Documents, Digital Vault credentials, Financial Affairs, Property &amp; Possessions, and
            Household Information. This cannot be undone.
            You will be able to set a new vault password afterwards.
          </p>

          {resetError && <Alert variant="danger">{resetError}</Alert>}

          <Form.Group className="mb-4">
            <Form.Label style={{ fontWeight: 600 }}>Confirm with your account password</Form.Label>
            <Form.Control
              type="password"
              value={accountPw}
              onChange={e => setAccountPw(e.target.value)}
              placeholder="Your In Good Hands login password"
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              autoFocus
            />
          </Form.Group>

          <Button variant="danger" className="w-100 mb-3" onClick={handleReset} disabled={resetting}>
            {resetting ? 'Resetting...' : 'Yes, delete all vault data and reset'}
          </Button>
          <button className="btn btn-link w-100 p-0"
            style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}
            onClick={() => { setResetStep('choice'); setResetError(''); setAccountPw('') }}>
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 440, margin: '0 auto' }}>
      <div style={{
        background: 'var(--parchment)', borderRadius: 12,
        padding: '32px 36px', border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 12 }}>🔒</div>
        <h5 style={{ color: 'var(--green-900)', textAlign: 'center', marginBottom: 8 }}>
          This section is vault-protected
        </h5>
        <p className="text-muted small text-center mb-4">
          Enter your vault password to access this section.
          It stays in memory only. It is never saved to disk or sent anywhere except during this session.
        </p>

        {isLocked && (
          <Alert variant="warning">
            Too many incorrect attempts. Your vault is temporarily locked until{' '}
            <strong>{new Date(lockedUntil).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</strong>.
            Nothing has been deleted — entering the correct password now will unlock it immediately.
          </Alert>
        )}
        {!isLocked && error && <Alert variant="danger">{error}</Alert>}

        <Form.Group className="mb-4">
          <Form.Label style={{ fontWeight: 600 }}>Vault password</Form.Label>
          <Form.Control
            ref={inputRef}
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Enter your vault password"
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            autoFocus
            aria-label="Vault password"
          />
        </Form.Group>

        <Button variant="primary" className="btn-vault w-100 mb-3" onClick={handleUnlock} disabled={checking}>
          {checking
            ? <><Spinner size="sm" animation="border" className="me-2" aria-hidden="true" />Unlocking...</>
            : 'Unlock vault'
          }
        </Button>

        <div className="text-center">
          <button className="btn btn-link p-0"
            style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}
            onClick={() => setResetStep('choice')}>
            Forgot your vault password?
          </button>
        </div>
      </div>
    </div>
  )
}
