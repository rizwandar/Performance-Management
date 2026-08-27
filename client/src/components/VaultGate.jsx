/**
 * Shared vault UI screens used by Digital Life and Legal Documents.
 * Both sections use the same vault (digital_vault table), so these
 * screens hit the same endpoints regardless of which section renders them.
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import PasswordInput from './PasswordInput'
import { useAuth } from '../context/AuthContext'
import VaultRecoveryQuestionsForm, {
  defaultRecoveryQuestions, validateRecoveryQuestions, toApiQuestions,
} from './VaultRecoveryQuestionsForm'
import VaultRecoverForm from './VaultRecoverForm'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// First-time vault setup
// ---------------------------------------------------------------------------
export function VaultSetupScreen({ onSetup }) {
  const [pw, setPw]           = useState('')
  const [confirm, setConfirm] = useState('')
  const [hint, setHint]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // After the password itself is created: 'choice' -> pick a forgot-password
  // plan, 'questions' -> set up recovery questions (only if they opted in).
  const [step, setStep] = useState('password')
  const [recoveryQuestions, setRecoveryQuestions] = useState(defaultRecoveryQuestions())
  const [recoveryError, setRecoveryError] = useState('')
  const [recoverySaving, setRecoverySaving] = useState(false)

  const handleSetup = async () => {
    if (pw.length < 8) return setError('Your vault password must be at least 8 characters.')
    if (pw !== confirm)  return setError("Passwords don't match.")
    setError('')
    setSaving(true)
    try {
      await axios.post(`${API}/sections/digital-life/vault`, { vault_password: pw, password_hint: hint })
      setStep('choice')
    } catch (err) {
      setError(err.response?.data?.error || 'Setup failed. Please try again.')
    }
    setSaving(false)
  }

  const finishWithoutRecovery = () => onSetup()

  const saveRecoveryQuestions = async () => {
    const validationError = validateRecoveryQuestions(recoveryQuestions)
    if (validationError) return setRecoveryError(validationError)
    setRecoveryError('')
    setRecoverySaving(true)
    try {
      await axios.put(`${API}/sections/digital-life/recovery/setup`, {
        vault_password: pw,
        questions: toApiQuestions(recoveryQuestions),
      })
      onSetup()
    } catch (err) {
      setRecoveryError(err.response?.data?.error || 'Could not save your recovery questions. Please try again.')
    }
    setRecoverySaving(false)
  }

  if (step === 'choice') {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '32px 36px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 12 }}>🔑</div>
          <p className="text-muted small text-center mb-1">
            You have 2 options for what happens if you ever forget your vault password:
          </p>
          <h5 style={{ color: 'var(--green-900)', textAlign: 'center', marginBottom: 8 }}>
            If you ever forget this password, what should happen?
          </h5>
          <p className="text-muted small text-center mb-4">
            It's up to you. You can change this choice later in Profile &gt; Vault Settings.
          </p>

          <Row className="g-3">
            <Col md={6}>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, height: '100%' }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Let me recover it with security questions</p>
                <p className="text-muted small mb-3">
                  Set up 3-5 questions now. If you forget your password, answering at least 3 of them gets
                  you back in and nothing is deleted. This does mean your vault is only as safe as those
                  answers, not "even we cannot read it."
                </p>
                <Button variant="primary" size="sm" onClick={() => setStep('questions')}>
                  Set up recovery questions
                </Button>
              </div>
            </Col>

            <Col md={6}>
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, height: '100%' }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Require a full reset if forgotten (default)</p>
                <p className="text-muted small mb-3">
                  No recovery questions, nothing stored beyond your password itself. If you forget it, your
                  vault-protected data is permanently deleted and you start over. Strongest privacy guarantee.
                </p>
                <Button variant="outline-secondary" size="sm" onClick={finishWithoutRecovery}>
                  I'll use this, no recovery questions
                </Button>
              </div>
            </Col>
          </Row>
        </div>
      </div>
    )
  }

  if (step === 'questions') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '32px 36px', border: '1px solid var(--border)' }}>
          <h5 style={{ color: 'var(--green-900)', marginBottom: 8 }}>Set up your vault recovery questions</h5>
          <p className="text-muted small mb-4">
            This vault is a secured area - these questions are separate from your account's own security
            question and are used only to recover this vault password. Choose answers only you would know.
            You'll need to answer at least 3 correctly to recover access later.
          </p>

          {recoveryError && <Alert variant="danger">{recoveryError}</Alert>}

          <VaultRecoveryQuestionsForm questions={recoveryQuestions} setQuestions={setRecoveryQuestions} />

          <div className="d-flex gap-3 mt-4">
            <Button variant="primary" onClick={saveRecoveryQuestions} disabled={recoverySaving}>
              {recoverySaving ? 'Saving...' : 'Save and continue'}
            </Button>
            <Button variant="outline-secondary" onClick={() => setStep('choice')}>
              Back
            </Button>
          </div>
        </div>
      </div>
    )
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
          Financial Affairs, Property &amp; Possessions, Household Information, and Donation Bank) is
          protected by a separate vault password that only you know.
          Once set, it applies to all six sections.
        </p>

        {error && <Alert variant="danger">{error}</Alert>}

        <div style={{
          background: '#FEF3C7', border: '1px solid #F59E0B',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.85rem',
        }}>
          <strong>Important:</strong> Your vault password is never stored on our servers.
          After you create it, you'll choose what happens if you ever forget it: recover it with
          security questions, or require a full reset that permanently deletes your vault data.
          Keep your vault password somewhere safe either way.
        </div>

        <Form.Group className="mb-3">
          <Form.Label style={{ fontWeight: 600 }}>Vault password</Form.Label>
          <PasswordInput
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="At least 8 characters"
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label style={{ fontWeight: 600 }}>Confirm vault password</Form.Label>
          <PasswordInput
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Type it again"
          />
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label style={{ fontWeight: 600 }}>Password hint <span className="text-muted" style={{ fontWeight: 400 }}>(optional)</span></Form.Label>
          <Form.Control
            value={hint}
            onChange={e => setHint(e.target.value)}
            placeholder="e.g. childhood pet's name"
            maxLength={200}
            onKeyDown={e => e.key === 'Enter' && handleSetup()}
          />
          <Form.Text className="text-muted">
            Shown to you only, on the locked-vault screen, if you ever forget your password.
            Don't put the password itself here.
          </Form.Text>
        </Form.Group>

        <Button variant="primary" className="btn-vault w-100" onClick={handleSetup} disabled={saving}>
          {saving ? 'Setting up...' : 'Create my vault'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unlock / Reset / Recover screen
// ---------------------------------------------------------------------------
export function VaultLockScreen({ onUnlock, onReset }) {
  const { logout } = useAuth()
  const navigate   = useNavigate()

  const [pw, setPw]             = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError]       = useState('')
  // 'none' -> locked screen, 'choice' -> "do you still remember an earlier password?",
  // 'confirm' -> the destructive delete-everything screen, 'recover' -> answer
  // security questions to get back in non-destructively.
  const [resetStep, setResetStep] = useState('none')
  const [lockedUntil, setLockedUntil] = useState(null)
  const [hint, setHint]         = useState(null)

  // The owner's own optional hint (IDEA-15), set at vault creation. Fetched
  // here rather than threaded down as a prop so every page that renders this
  // shared screen (Digital Life, Legal Documents, Financial Affairs, Property,
  // Household Info, Donation Bank) doesn't need its own copy of this logic.
  useEffect(() => {
    axios.get(`${API}/sections/digital-life/vault`)
      .then(r => setHint(r.data.hint || null))
      .catch(() => {})
  }, [])

  // Reset flow
  const [accountPw, setAccountPw]   = useState('')
  const [resetting, setResetting]   = useState(false)
  const [resetError, setResetError] = useState('')

  // Recovery flow
  const [recoveryQuestions, setRecoveryQuestions] = useState([])
  const [recoveryLoading, setRecoveryLoading]     = useState(false)

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
      if (data.vault_destroyed) {
        logout()
        navigate('/login', { state: { vaultDestroyed: true } })
        return
      }
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

  const openChoice = async () => {
    setResetStep('choice')
    setRecoveryLoading(true)
    try {
      const { data } = await axios.get(`${API}/sections/digital-life/recovery/questions`)
      setRecoveryQuestions(data.recovery_enabled ? data.questions : [])
    } catch {
      setRecoveryQuestions([])
    }
    setRecoveryLoading(false)
  }

  const openRecover = () => {
    setResetStep('recover')
  }

  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()

  if (resetStep === 'recover') {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '32px 36px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 12 }}>🔑</div>
          <h5 style={{ color: 'var(--green-900)', textAlign: 'center', marginBottom: 8 }}>
            Recover your vault
          </h5>
          <p className="text-muted small text-center mb-4">
            Answer at least 3 of your questions below (leave the rest blank if you don't remember them),
            then choose a new vault password. There's no limit on attempts, so take your time.
          </p>

          <VaultRecoverForm
            questions={recoveryQuestions}
            onRecovered={onUnlock}
            onCancel={() => setResetStep('choice')}
          />
        </div>
      </div>
    )
  }

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

          {recoveryLoading && (
            <div className="text-center mb-3"><Spinner size="sm" animation="border" aria-hidden="true" /></div>
          )}
          {!recoveryLoading && recoveryQuestions.length > 0 && (
            <>
              <Button variant="outline-primary" className="w-100 mb-2" onClick={openRecover}>
                Recover using my security questions
              </Button>
              <p className="text-muted small text-center mb-4" style={{ fontSize: '0.8rem' }}>
                Answer at least 3 of your questions to get back in. Nothing is deleted.
              </p>
            </>
          )}

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
            Documents, Digital Vault credentials, Financial Affairs, Property &amp; Possessions,
            Household Information, and Donation Bank. This cannot be undone.
            You will be able to set a new vault password afterwards.
          </p>

          {resetError && <Alert variant="danger">{resetError}</Alert>}

          <Form.Group className="mb-4">
            <Form.Label style={{ fontWeight: 600 }}>Confirm with your account password</Form.Label>
            <PasswordInput
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
          <PasswordInput
            ref={inputRef}
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Enter your vault password"
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            autoFocus
            aria-label="Vault password"
          />
          {hint && (
            <Form.Text className="text-muted">
              Your hint: <em>{hint}</em>
            </Form.Text>
          )}
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
            onClick={openChoice}>
            Forgot your vault password?
          </button>
        </div>
      </div>
    </div>
  )
}
