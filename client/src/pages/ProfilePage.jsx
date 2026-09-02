import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Spinner, Dropdown, Modal } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { useSubscription } from '../context/SubscriptionContext'
import OrgConsentPanel from '../components/OrgConsentPanel'
import PasswordInput from '../components/PasswordInput'
import VaultRecoveryQuestionsForm, {
  defaultRecoveryQuestions, validateRecoveryQuestions, toApiQuestions,
} from '../components/VaultRecoveryQuestionsForm'
import VaultRecoverForm from '../components/VaultRecoverForm'

const API = import.meta.env.VITE_API_URL

// REV-22: the number pre-filled when a user turns the optional "maximum
// security" auto-delete on. It is only a suggestion, not a default that
// applies to anyone who leaves the setting alone: with the setting off, no
// number of wrong attempts deletes anything. Mirrors OPT_IN_DESTROY_AFTER in
// server/lib/vaultAttempts.js.
const DEFAULT_DESTROY_SUGGESTION = 100

const CUSTOM_QUESTION = 'Other (write my own)'
const SECURITY_QUESTION_PRESETS = [
  'What was the name of your first pet?',
  'What was the make and model of your first car?',
  'In what city did your parents meet?',
  'What was the name of your first school?',
  'What is your favorite childhood book?',
  CUSTOM_QUESTION,
]

// ---------------------------------------------------------------------------
// Section picker (IDEA-35) — Personal Details and Change Password stay pinned
// at the top of the page; everything else lives behind this dropdown, mirroring
// the pinned-item-plus-dropdown pattern from OPS-24's admin nav (AdminPage.jsx).
// Vault Recovery Settings folds into "Vault Password" and Payment History
// folds into "Billing & Subscription", since they're closely related settings
// rather than separate destinations. Delete My Account is visually separated
// as the destructive, rarely-used option.
// ---------------------------------------------------------------------------
const SETTINGS_SECTIONS = [
  { id: 'security-question', label: 'Security Question' },
  { id: 'vault-password',    label: 'Vault Password' },
  { id: 'inactivity-timer',  label: 'Inactivity Timer' },
  { id: 'billing',           label: 'Billing & Subscription' },
]
const DELETE_ACCOUNT_SECTION = { id: 'delete-account', label: 'Delete My Account' }
const ALL_SECTION_IDS = [...SETTINGS_SECTIONS.map(s => s.id), DELETE_ACCOUNT_SECTION.id]
const SECTION_LABELS = Object.fromEntries([...SETTINGS_SECTIONS, DELETE_ACCOUNT_SECTION].map(s => [s.id, s.label]))

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
  const { user: authUser, login, logout } = useAuth()
  const { refresh: refreshSubscription } = useSubscription()
  const navigate = useNavigate()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)

  // Section picker (IDEA-35) — which of the non-pinned sections is showing
  // below Personal Details / Change Password, mirrored into ?section= so a
  // reload or bookmark lands back on the same section.
  const [searchParams, setSearchParams] = useSearchParams()
  const [section, setSectionRaw] = useState(() => {
    const fromUrl = searchParams.get('section')
    return ALL_SECTION_IDS.includes(fromUrl) ? fromUrl : null
  })
  const setSection = (s) => {
    setSectionRaw(s)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (!s) next.delete('section')
      else next.set('section', s)
      return next
    }, { replace: true })
  }

  const [form, setForm] = useState({
    name: '', email: '', date_of_birth: '',
    marital_status: '', spouse_name: '', spouse_phone: '', spouse_email: '', spouse_is_executor: false,
  })

  // Change password state
  const [pwForm, setPwForm]     = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  // Security question state
  const [securityQuestion, setSecurityQuestion] = useState(null) // current question text, or null if unset
  const [showSqForm, setShowSqForm]     = useState(false)
  const [sqForm, setSqForm]             = useState({ current_password: '', questionChoice: SECURITY_QUESTION_PRESETS[0], customQuestion: '', answer: '', confirmAnswer: '' })
  const [sqSaving, setSqSaving]         = useState(false)
  const [sqError, setSqError]           = useState('')
  const [sqSuccess, setSqSuccess]       = useState('')
  const [showSqRemove, setShowSqRemove] = useState(false)
  const [sqRemovePw, setSqRemovePw]     = useState('')
  const [sqRemoving, setSqRemoving]     = useState(false)
  const [sqRemoveError, setSqRemoveError] = useState('')

  // Inactivity timer state
  const [timerData, setTimerData]     = useState(null)
  const [timerMonths, setTimerMonths] = useState(12)
  const [savingTimer, setSavingTimer] = useState(false)

  // Vault password state
  const [vaultExists, setVaultExists]       = useState(null)  // null = loading, true/false
  const [vaultPwForm, setVaultPwForm]       = useState({ old_password: '', new_password: '', confirm: '', hint: '' })
  const [vaultPwSaving, setVaultPwSaving]   = useState(false)
  const [vaultPwError, setVaultPwError]     = useState('')
  const [vaultPwSuccess, setVaultPwSuccess] = useState('')
  // Reset vault state
  const [showVaultReset, setShowVaultReset]   = useState(false)
  const [vaultResetPw, setVaultResetPw]       = useState('')
  const [vaultResetting, setVaultResetting]   = useState(false)
  const [vaultResetError, setVaultResetError] = useState('')

  // Vault recovery settings (security questions + auto-destroy threshold)
  const [recoveryEnabled, setRecoveryEnabled]       = useState(false)
  // REV-22: null means auto-destruction is OFF, which is now the default for
  // every vault. A number is the opted-in threshold. Never initialize this to
  // a number, or the toggle renders as already-on before the vault loads.
  const [destroyAfter, setDestroyAfter]             = useState(null)
  const [showRecoverySetup, setShowRecoverySetup]   = useState(false)
  const [recoverySetupPw, setRecoverySetupPw]       = useState('')
  const [recoveryQuestions, setRecoveryQuestions]   = useState(defaultRecoveryQuestions())
  const [recoverySaving, setRecoverySaving]         = useState(false)
  const [recoveryError, setRecoveryError]           = useState('')
  const [recoverySuccess, setRecoverySuccess]       = useState('')
  const [showRecoveryDisable, setShowRecoveryDisable] = useState(false)
  const [recoveryDisablePw, setRecoveryDisablePw]     = useState('')
  const [recoveryDisabling, setRecoveryDisabling]     = useState(false)
  const [recoveryDisableError, setRecoveryDisableError] = useState('')
  const [destroyThresholdInput, setDestroyThresholdInput] = useState(DEFAULT_DESTROY_SUGGESTION)
  const [destroyThresholdPw, setDestroyThresholdPw]       = useState('')
  const [savingThreshold, setSavingThreshold]             = useState(false)
  const [thresholdError, setThresholdError]               = useState('')
  const [thresholdSuccess, setThresholdSuccess]           = useState('')
  // The two confirmation dialogs for the opt-in switch. Turning it ON has to
  // pass through a real warning, so the switch itself never writes anything.
  const [showDestroyEnable, setShowDestroyEnable]   = useState(false)
  const [showDestroyDisable, setShowDestroyDisable] = useState(false)
  const [destroyAcknowledged, setDestroyAcknowledged] = useState(false)

  // Also configurable, matching the destroy threshold above (SEC-13 scope
  // expansion): logout_after_attempts forces a sign-out, lockout_after_attempts
  // is the repeating-throttle interval. Independent settings, independent forms.
  const [logoutAfter, setLogoutAfter]                     = useState(5)
  const [logoutThresholdInput, setLogoutThresholdInput]   = useState(5)
  const [logoutThresholdPw, setLogoutThresholdPw]         = useState('')
  const [savingLogoutThreshold, setSavingLogoutThreshold] = useState(false)
  const [logoutThresholdError, setLogoutThresholdError]   = useState('')
  const [logoutThresholdSuccess, setLogoutThresholdSuccess] = useState('')

  const [lockoutAfter, setLockoutAfter]                     = useState(5)
  const [lockoutThresholdInput, setLockoutThresholdInput]   = useState(5)
  const [lockoutThresholdPw, setLockoutThresholdPw]         = useState('')
  const [savingLockoutThreshold, setSavingLockoutThreshold] = useState(false)
  const [lockoutThresholdError, setLockoutThresholdError]   = useState('')
  const [lockoutThresholdSuccess, setLockoutThresholdSuccess] = useState('')

  // "Forgot your current vault password?" entry point from Change Vault
  // Password (SEC-13 scope expansion) - the same recovery flow as VaultGate's
  // locked-out screen, but reachable here too since a user can forget the
  // vault password without ever being locked out of the app itself.
  const [showChangeVaultRecover, setShowChangeVaultRecover] = useState(false)
  const [changeVaultRecoverQuestions, setChangeVaultRecoverQuestions] = useState([])
  const [loadingChangeVaultRecover, setLoadingChangeVaultRecover]     = useState(false)

  // Delete account state
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deleteForm, setDeleteForm] = useState({ password: '', vault_password: '' })
  const [deleting, setDeleting]     = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Billing & subscription state
  const [subscription, setSubscription]     = useState(null)
  const [cancelling, setCancelling]         = useState(false)
  const [reinstating, setReinstating]       = useState(false)
  const [openingPortal, setOpeningPortal]   = useState(false)
  const [billingMessage, setBillingMessage] = useState('')
  const [billingError, setBillingError]     = useState('')
  const [paymentHistory, setPaymentHistory] = useState([])

  useEffect(() => {
    const loadProfile = axios.get(`${API}/users/me`)
      .then(r => {
        const u = r.data
        setForm({
          name:               u.name               || '',
          email:              u.email              || '',
          date_of_birth:      u.date_of_birth       || '',
          marital_status:     u.marital_status      || '',
          spouse_name:        u.spouse_name         || '',
          spouse_phone:       u.spouse_phone        || '',
          spouse_email:       u.spouse_email        || '',
          spouse_is_executor: !!u.spouse_is_executor,
        })
        setSecurityQuestion(u.security_question || null)
      })
      .catch(() => {
        setForm({
          name:           authUser?.name  || '',
          email:          authUser?.email || '',
          date_of_birth:  '',
          marital_status: '', spouse_name: '', spouse_phone: '', spouse_email: '', spouse_is_executor: false,
        })
      })

    const loadTimer = axios.get(`${API}/users/me/timer`)
      .then(r => { setTimerData(r.data); setTimerMonths(r.data.inactivity_period_months) })
      .catch(() => {})

    const loadVault = axios.get(`${API}/sections/digital-life/vault`)
      .then(r => {
        setVaultExists(r.data.exists)
        if (r.data.hint) setVaultPwForm(f => ({ ...f, hint: r.data.hint }))
        setRecoveryEnabled(r.data.recovery_enabled)
        // REV-22: destroy_after_attempts is null whenever auto-destruction is
        // off, so this is set unconditionally rather than only when truthy.
        // A truthiness guard here would leave the toggle stuck on whatever the
        // previous render had, which for this setting is the wrong direction
        // to be wrong in.
        setDestroyAfter(r.data.destroy_after_attempts ?? null)
        setDestroyThresholdInput(r.data.destroy_after_attempts ?? DEFAULT_DESTROY_SUGGESTION)
        if (r.data.logout_after_attempts) {
          setLogoutAfter(r.data.logout_after_attempts)
          setLogoutThresholdInput(r.data.logout_after_attempts)
        }
        if (r.data.lockout_after_attempts) {
          setLockoutAfter(r.data.lockout_after_attempts)
          setLockoutThresholdInput(r.data.lockout_after_attempts)
        }
      })
      .catch(() => setVaultExists(false))

    const loadBilling = axios.get(`${API}/billing/subscription`)
      .then(r => setSubscription(r.data))
      .catch(() => {})

    const loadPaymentHistory = axios.get(`${API}/billing/history`)
      .then(r => setPaymentHistory(r.data.payments || []))
      .catch(() => {})

    Promise.all([loadProfile, loadTimer, loadVault, loadBilling, loadPaymentHistory]).finally(() => setLoading(false))
  }, [])

  // Landed here fresh from a successful Stripe checkout (IDEA-11) - the
  // subscription context still has the pre-checkout plan cached, so it needs
  // an explicit refresh rather than waiting for its own next natural refetch.
  // IDEA-35: Billing & Subscription is now behind the section picker, so this
  // also selects that section, matching the banner's "right below" copy.
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setCheckoutSuccess(true)
      refreshSubscription()
      setSectionRaw('billing')
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('checkout')
        next.set('section', 'billing')
        return next
      }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lets other pages deep-link here (e.g. Trusted Contacts links to
  // #inactivity-timer so a user can jump straight to changing their
  // configured period). IDEA-35: Inactivity Timer now lives behind the
  // section picker, so a hash deep-link selects that section first; the
  // scroll effect below then handles the actual scroll once it's rendered.
  useEffect(() => {
    if (loading || !window.location.hash) return
    if (window.location.hash === '#inactivity-timer') setSection('inactivity-timer')
  }, [loading])

  // Scrolls the newly-selected section into view (dropdown pick, or the
  // hash/checkout deep-links above). A client-side route/state change doesn't
  // trigger the browser's own hash-scroll behavior, so this is manual.
  useEffect(() => {
    if (loading || !section) return
    const el = document.getElementById(section)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [section, loading])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Your name is required.')
    setError('')
    setSaving(true)
    try {
      const res = await axios.put(`${API}/users/me`, form)
      if (authUser && form.name !== authUser.name) {
        login({ ...authUser, name: form.name })
      }
      if (res.data?.spouse_executor_blocked) {
        // Profile fields still saved, only the executor sync was skipped, so
        // this is a warning alongside the save, not a failure of the save.
        setSuccess('Profile saved. Your spouse could not be added as Legacy Contact: you already have 3 trusted contacts. Remove one on the Trusted Contacts page first, then try again.')
      } else if (res.data?.spouse_executor_email_skipped) {
        setSuccess("Profile saved. Your spouse has been added as Legacy Contact, but they weren't notified by email since no email address is on file for them.")
      } else {
        setSuccess('Profile saved.')
      }
      setTimeout(() => setSuccess(''), res.data?.spouse_executor_blocked || res.data?.spouse_executor_email_skipped ? 6000 : 3000)
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

  const openSqForm = () => {
    setSqError('')
    setSqForm({ current_password: '', questionChoice: SECURITY_QUESTION_PRESETS[0], customQuestion: '', answer: '', confirmAnswer: '' })
    setShowSqForm(true)
  }

  const handleSaveSecurityQuestion = async () => {
    setSqError('')
    const question = sqForm.questionChoice === CUSTOM_QUESTION ? sqForm.customQuestion.trim() : sqForm.questionChoice
    if (!sqForm.current_password) return setSqError('Please enter your current password to confirm.')
    if (!question) return setSqError('Please choose or write a question.')
    if (!sqForm.answer.trim()) return setSqError('Please enter an answer.')
    if (sqForm.answer !== sqForm.confirmAnswer) return setSqError('Answers do not match.')
    setSqSaving(true)
    try {
      await axios.put(`${API}/users/me/security-question`, {
        current_password: sqForm.current_password,
        question,
        answer: sqForm.answer,
      })
      setSecurityQuestion(question)
      setShowSqForm(false)
      setSqSuccess('Security question saved.')
      setTimeout(() => setSqSuccess(''), 4000)
    } catch (err) {
      setSqError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSqSaving(false)
  }

  const handleRemoveSecurityQuestion = async () => {
    setSqRemoveError('')
    if (!sqRemovePw) return setSqRemoveError('Please enter your current password to confirm.')
    setSqRemoving(true)
    try {
      await axios.delete(`${API}/users/me/security-question`, { data: { current_password: sqRemovePw } })
      setSecurityQuestion(null)
      setShowSqRemove(false)
      setSqRemovePw('')
      setSqSuccess('Security question removed.')
      setTimeout(() => setSqSuccess(''), 4000)
    } catch (err) {
      setSqRemoveError(err.response?.data?.error || "We couldn't remove this. Please try again.")
    }
    setSqRemoving(false)
  }

  const handleChangeVaultPw = async () => {
    const { old_password, new_password, confirm, hint } = vaultPwForm
    setVaultPwError('')
    if (!old_password) return setVaultPwError('Please enter your current vault password.')
    if (!new_password || new_password.length < 8) return setVaultPwError('New vault password must be at least 8 characters.')
    if (new_password !== confirm) return setVaultPwError('New passwords do not match.')
    setVaultPwSaving(true)
    try {
      const { data } = await axios.put(`${API}/sections/digital-life/vault`, { old_password, new_password, password_hint: hint })
      setVaultPwForm({ old_password: '', new_password: '', confirm: '', hint })
      if (data.recovery_disabled) {
        setRecoveryEnabled(false)
        setVaultPwSuccess('Vault password changed. All credentials re-encrypted with the new password. Your recovery questions were reset since they were tied to the old password - set them up again below if you\'d like recovery enabled.')
      } else {
        setVaultPwSuccess('Vault password changed. All credentials re-encrypted with the new password.')
      }
      setTimeout(() => setVaultPwSuccess(''), 8000)
    } catch (err) {
      setVaultPwError(err.response?.data?.error || 'Could not change vault password. Please try again.')
    }
    setVaultPwSaving(false)
  }

  const handleSetupRecovery = async () => {
    setRecoveryError('')
    if (!recoverySetupPw) return setRecoveryError('Please enter your current vault password to confirm.')
    const validationError = validateRecoveryQuestions(recoveryQuestions)
    if (validationError) return setRecoveryError(validationError)
    setRecoverySaving(true)
    try {
      await axios.put(`${API}/sections/digital-life/recovery/setup`, {
        vault_password: recoverySetupPw,
        questions: toApiQuestions(recoveryQuestions),
      })
      setRecoveryEnabled(true)
      setShowRecoverySetup(false)
      setRecoverySetupPw('')
      setRecoveryQuestions(defaultRecoveryQuestions())
      setRecoverySuccess('Recovery questions saved. You can now recover your vault password by answering at least 3 of them.')
      setTimeout(() => setRecoverySuccess(''), 6000)
    } catch (err) {
      setRecoveryError(err.response?.data?.error || 'Could not save your recovery questions. Please try again.')
    }
    setRecoverySaving(false)
  }

  const handleDisableRecovery = async () => {
    setRecoveryDisableError('')
    if (!recoveryDisablePw) return setRecoveryDisableError('Please enter your current vault password to confirm.')
    setRecoveryDisabling(true)
    try {
      await axios.delete(`${API}/sections/digital-life/recovery/setup`, { data: { vault_password: recoveryDisablePw } })
      setRecoveryEnabled(false)
      setShowRecoveryDisable(false)
      setRecoveryDisablePw('')
      setRecoverySuccess('Recovery questions removed. If you forget your vault password now, a full reset will be required.')
      setTimeout(() => setRecoverySuccess(''), 6000)
    } catch (err) {
      setRecoveryDisableError(err.response?.data?.error || 'Could not remove recovery questions. Please try again.')
    }
    setRecoveryDisabling(false)
  }

  // Turns the optional auto-delete ON (or changes its threshold once on).
  // Only ever reached from the confirmation dialog below, never straight from
  // the switch: this is the one setting on this page that can destroy data.
  const handleEnableDestroy = async () => {
    setThresholdError('')
    if (!destroyAcknowledged) return setThresholdError('Please tick the box to confirm you understand what this does.')
    if (!destroyThresholdPw) return setThresholdError('Please enter your current vault password to confirm.')
    const n = parseInt(destroyThresholdInput, 10)
    if (!Number.isInteger(n) || n < 3 || n > 1000) return setThresholdError('Please choose a value between 3 and 1000.')
    setSavingThreshold(true)
    try {
      await axios.put(`${API}/sections/digital-life/recovery/destroy-threshold`, {
        vault_password: destroyThresholdPw,
        destroy_after_attempts: n,
      })
      setDestroyAfter(n)
      setDestroyThresholdPw('')
      setDestroyAcknowledged(false)
      setShowDestroyEnable(false)
      setThresholdSuccess(`Maximum security is on. Your vault data will be permanently deleted after ${n} wrong password attempts in a row.`)
      setTimeout(() => setThresholdSuccess(''), 8000)
    } catch (err) {
      setThresholdError(err.response?.data?.error || 'Could not save this setting. Please try again.')
    }
    setSavingThreshold(false)
  }

  // Turns it back off. Sends an explicit null rather than omitting the field,
  // which the server rejects on purpose (see routes/vaultRecovery.js).
  const handleDisableDestroy = async () => {
    setThresholdError('')
    if (!destroyThresholdPw) return setThresholdError('Please enter your current vault password to confirm.')
    setSavingThreshold(true)
    try {
      await axios.put(`${API}/sections/digital-life/recovery/destroy-threshold`, {
        vault_password: destroyThresholdPw,
        destroy_after_attempts: null,
      })
      setDestroyAfter(null)
      setDestroyThresholdInput(DEFAULT_DESTROY_SUGGESTION)
      setDestroyThresholdPw('')
      setShowDestroyDisable(false)
      setThresholdSuccess('Maximum security is off. Wrong password attempts will never delete your vault data.')
      setTimeout(() => setThresholdSuccess(''), 8000)
    } catch (err) {
      setThresholdError(err.response?.data?.error || 'Could not save this setting. Please try again.')
    }
    setSavingThreshold(false)
  }

  const openDestroyDialog = (turningOn) => {
    setThresholdError('')
    setThresholdSuccess('')
    setDestroyThresholdPw('')
    setDestroyAcknowledged(false)
    if (turningOn) {
      setDestroyThresholdInput(destroyAfter ?? DEFAULT_DESTROY_SUGGESTION)
      setShowDestroyEnable(true)
    } else {
      setShowDestroyDisable(true)
    }
  }

  const handleSaveLogoutThreshold = async () => {
    setLogoutThresholdError('')
    if (!logoutThresholdPw) return setLogoutThresholdError('Please enter your current vault password to confirm.')
    const n = parseInt(logoutThresholdInput, 10)
    if (!Number.isInteger(n) || n < 1 || n > 50) return setLogoutThresholdError('Please choose a value between 1 and 50.')
    setSavingLogoutThreshold(true)
    try {
      await axios.put(`${API}/sections/digital-life/recovery/logout-threshold`, {
        vault_password: logoutThresholdPw,
        logout_after_attempts: n,
      })
      setLogoutAfter(n)
      setLogoutThresholdPw('')
      setLogoutThresholdSuccess('Saved.')
      setTimeout(() => setLogoutThresholdSuccess(''), 4000)
    } catch (err) {
      setLogoutThresholdError(err.response?.data?.error || 'Could not save this setting. Please try again.')
    }
    setSavingLogoutThreshold(false)
  }

  const handleSaveLockoutThreshold = async () => {
    setLockoutThresholdError('')
    if (!lockoutThresholdPw) return setLockoutThresholdError('Please enter your current vault password to confirm.')
    const n = parseInt(lockoutThresholdInput, 10)
    if (!Number.isInteger(n) || n < 1 || n > 50) return setLockoutThresholdError('Please choose a value between 1 and 50.')
    setSavingLockoutThreshold(true)
    try {
      await axios.put(`${API}/sections/digital-life/recovery/lockout-threshold`, {
        vault_password: lockoutThresholdPw,
        lockout_after_attempts: n,
      })
      setLockoutAfter(n)
      setLockoutThresholdPw('')
      setLockoutThresholdSuccess('Saved.')
      setTimeout(() => setLockoutThresholdSuccess(''), 4000)
    } catch (err) {
      setLockoutThresholdError(err.response?.data?.error || 'Could not save this setting. Please try again.')
    }
    setSavingLockoutThreshold(false)
  }

  const openChangeVaultRecover = async () => {
    setShowChangeVaultRecover(true)
    setLoadingChangeVaultRecover(true)
    try {
      const { data } = await axios.get(`${API}/sections/digital-life/recovery/questions`)
      setChangeVaultRecoverQuestions(data.recovery_enabled ? data.questions : [])
    } catch {
      setChangeVaultRecoverQuestions([])
    }
    setLoadingChangeVaultRecover(false)
  }

  const handleChangeVaultRecovered = () => {
    setShowChangeVaultRecover(false)
    setVaultPwForm(f => ({ ...f, old_password: '', new_password: '', confirm: '' }))
    setRecoveryEnabled(false)
    setVaultPwSuccess('Vault password recovered and changed. All credentials re-encrypted with the new password. Your recovery questions were reset since they were tied to the old password - set them up again below if you\'d like recovery enabled.')
    setTimeout(() => setVaultPwSuccess(''), 8000)
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

  const handleCancelSubscription = async () => {
    if (!window.confirm(
      "Cancel your premium membership?\n\nYou'll keep full access until the end of your current billing period. " +
      "After that, your account reverts to the Essentials plan, nothing is deleted, and everything you've recorded in " +
      'the premium sections stays safely stored and becomes visible again the moment you resubscribe.'
    )) return
    setCancelling(true)
    setBillingError('')
    setBillingMessage('')
    try {
      const r = await axios.post(`${API}/billing/cancel`)
      setBillingMessage(r.data.message)
      const fresh = await axios.get(`${API}/billing/subscription`)
      setSubscription(fresh.data)
    } catch (err) {
      setBillingError(err.response?.data?.error || 'Could not cancel your subscription.')
    }
    setCancelling(false)
  }

  const handleOpenBillingPortal = async () => {
    setOpeningPortal(true)
    setBillingError('')
    setBillingMessage('')
    try {
      const r = await axios.post(`${API}/billing/portal-session`)
      window.location.href = r.data.url
    } catch (err) {
      setBillingError(err.response?.data?.error || 'Could not open the billing portal.')
      setOpeningPortal(false)
    }
  }

  const handleReinstate = async () => {
    setReinstating(true)
    setBillingError('')
    setBillingMessage('')
    try {
      const r = await axios.post(`${API}/billing/reinstate`)
      setBillingMessage(r.data.message)
      const fresh = await axios.get(`${API}/billing/subscription`)
      setSubscription(fresh.data)
    } catch (err) {
      setBillingError(err.response?.data?.error || 'Could not reinstate your subscription.')
    }
    setReinstating(false)
  }

  const formatDate = iso => {
    if (!iso) return 'Not set'
    try { return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) }
    catch { return iso }
  }

  if (loading) return (
    <div className="text-center py-5">
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  // Admin sees a stripped-down account page — password change only
  if (authUser?.is_admin) return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="mb-4">
        <h3 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif' }}>Admin Account</h3>
        <p className="text-muted">Manage your administrator password.</p>
      </div>

      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 20 }}>Change Password</h6>

        {pwError   && <Alert variant="danger">{pwError}</Alert>}
        {pwSuccess && <Alert variant="success">{pwSuccess}</Alert>}

        <Form.Group className="mb-3">
          <Form.Label>Current password</Form.Label>
          <PasswordInput value={pwForm.current}
            onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
            placeholder="Your current password" />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>New password</Form.Label>
          <PasswordInput value={pwForm.next}
            onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
            placeholder="At least 8 characters, one uppercase, one number" />
          <PasswordRequirements password={pwForm.next} />
        </Form.Group>
        <Form.Group className="mb-4">
          <Form.Label>Confirm new password</Form.Label>
          <PasswordInput value={pwForm.confirm}
            onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
            placeholder="Type new password again"
            onKeyDown={e => e.key === 'Enter' && handleChangePassword()} />
        </Form.Group>
        <Button variant="primary" onClick={handleChangePassword} disabled={pwSaving}>
          {pwSaving ? 'Saving...' : 'Change password'}
        </Button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }} className="mb-4">
        <div>
          <h3 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif' }}>My Profile</h3>
          <p className="text-muted">Your account details and security settings.</p>
        </div>

        {/* ── Section picker (IDEA-35) ─────────────────────────────────────── */}
        <div className="d-flex gap-2 flex-wrap align-items-center">
          <Dropdown onSelect={(key) => key && setSection(key)}>
            <Dropdown.Toggle
              id="profile-section-dropdown"
              variant="outline-secondary"
              style={{
                padding: '6px 18px', borderRadius: 20, border: '1px solid',
                fontSize: '0.9rem', fontFamily: 'inherit',
                borderColor: section ? 'var(--green-800)' : 'var(--border)',
                background: section ? 'var(--green-800)' : 'transparent',
                color: section ? '#fff' : 'var(--text-muted)',
              }}>
              {section ? SECTION_LABELS[section] : 'More settings'}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ background: 'var(--parchment)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
              {SETTINGS_SECTIONS.map(s => (
                <Dropdown.Item key={s.id} eventKey={s.id} active={section === s.id}
                  style={{
                    fontSize: '0.9rem', fontFamily: 'inherit',
                    color: section === s.id ? '#fff' : 'var(--green-900)',
                    background: section === s.id ? 'var(--green-800)' : 'transparent',
                  }}>
                  {s.label}
                </Dropdown.Item>
              ))}
              <Dropdown.Divider />
              <Dropdown.Item eventKey={DELETE_ACCOUNT_SECTION.id} active={section === DELETE_ACCOUNT_SECTION.id}
                style={{
                  fontSize: '0.9rem', fontFamily: 'inherit', fontWeight: 600,
                  color: section === DELETE_ACCOUNT_SECTION.id ? '#fff' : '#DC3545',
                  background: section === DELETE_ACCOUNT_SECTION.id ? '#DC3545' : 'transparent',
                }}>
                {DELETE_ACCOUNT_SECTION.label}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </div>

      {checkoutSuccess && (
        <div style={{
          background: 'var(--green-700)', color: '#fff', borderRadius: 12,
          padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>🎉</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 2 }}>You're on Premium!</p>
            <p style={{ margin: 0, opacity: 0.92, fontSize: '0.9rem' }}>
              Thank you for subscribing. Every section is unlocked, right below in Billing &amp; Subscription.
            </p>
          </div>
        </div>
      )}

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
        <Form.Group className="mb-3">
          <Form.Label>Email address</Form.Label>
          <Form.Control type="email" value={form.email} onChange={set('email')} />
          <Form.Text className="text-muted">
            This is also your sign-in email. Changes take effect immediately.
          </Form.Text>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Marital status</Form.Label>
          <Form.Select value={form.marital_status} onChange={set('marital_status')} style={{ maxWidth: 320 }}>
            <option value="">Prefer not to say</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Common-law / Domestic Partner">Common-law / Domestic Partner</option>
            <option value="Separated">Separated</option>
            <option value="Divorced">Divorced</option>
            <option value="Widowed">Widowed</option>
          </Form.Select>
        </Form.Group>

        {['Married', 'Common-law / Domestic Partner'].includes(form.marital_status) && (
          <>
            <Row className="g-3 mb-1">
              <Col md={4}>
                <Form.Label>Spouse / partner name</Form.Label>
                <Form.Control value={form.spouse_name} onChange={set('spouse_name')} placeholder="Their full name" />
              </Col>
              <Col md={4}>
                <Form.Label>Their phone</Form.Label>
                <Form.Control value={form.spouse_phone} onChange={set('spouse_phone')} placeholder="Optional" />
              </Col>
              <Col md={4}>
                <Form.Label>Their email</Form.Label>
                <Form.Control type="email" value={form.spouse_email} onChange={set('spouse_email')} placeholder="Optional" />
              </Col>
            </Row>
            <Form.Group className="mt-3">
              <Form.Check
                type="checkbox"
                id="spouse-is-executor"
                label="Also make my spouse / partner my Legacy Contact"
                checked={form.spouse_is_executor}
                disabled={!form.spouse_name.trim()}
                onChange={e => setForm(f => ({ ...f, spouse_is_executor: e.target.checked }))}
              />
              <Form.Text className="text-muted">
                {form.spouse_name.trim()
                  ? "They'll be added to your Trusted Contacts as Legacy Contact and, if you've given an email above, notified right away. You can manage this further on the Trusted Contacts page."
                  : 'Enter their name above first.'}
              </Form.Text>
            </Form.Group>
          </>
        )}

        <div className="mt-4">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save details'}
          </Button>
        </div>
      </div>

      <OrgConsentPanel />

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
          <PasswordInput value={pwForm.current} autoComplete="current-password"
            onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
        </Form.Group>
        <Row className="g-3">
          <Col md={6}>
            <Form.Label>New password</Form.Label>
            <PasswordInput value={pwForm.next} autoComplete="new-password"
              onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} />
            <PasswordRequirements password={pwForm.next} />
          </Col>
          <Col md={6}>
            <Form.Label>Confirm new password</Form.Label>
            <PasswordInput value={pwForm.confirm} autoComplete="new-password"
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
          </Col>
        </Row>

        <div className="mt-4">
          <Button variant="outline-primary" onClick={handleChangePassword} disabled={pwSaving}>
            {pwSaving ? 'Changing...' : 'Change password'}
          </Button>
        </div>
      </div>

      {/* ── Security Question ────────────────────────────────────────────── */}
      {section === 'security-question' && (
      <div id="security-question" style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Security Question</h6>
        <p className="text-muted small mb-4">
          An optional extra check some accounts use during password recovery, on top of the emailed link -
          never a way to recover your account by itself. Changing it always requires your current password.
        </p>

        {sqSuccess && <Alert variant="success">{sqSuccess}</Alert>}

        {!showSqForm && !showSqRemove && (
          <>
            {securityQuestion ? (
              <div style={{
                background: 'var(--green-50)', border: '1px solid var(--green-100)',
                borderRadius: 8, padding: '14px 16px', marginBottom: 16, fontSize: '0.9rem',
              }}>
                <span style={{ color: 'var(--green-800)' }}>🔑 Question set:</span>{' '}
                <strong style={{ color: 'var(--green-900)' }}>{securityQuestion}</strong>
              </div>
            ) : (
              <div style={{
                background: '#fff8e6', border: '1px solid #f5d78e', borderRadius: 8,
                padding: '14px 16px', marginBottom: 16, fontSize: '0.9rem', color: '#8a6416',
              }}>
                Not set up yet.
              </div>
            )}
            <div className="d-flex gap-3 flex-wrap">
              <Button variant="outline-primary" onClick={openSqForm}>
                {securityQuestion ? 'Change security question' : 'Set up a security question'}
              </Button>
              {securityQuestion && (
                <button className="btn btn-link p-0" style={{ color: '#DC3545', fontSize: '0.85rem' }}
                  onClick={() => { setShowSqRemove(true); setSqRemoveError(''); setSqRemovePw('') }}>
                  Remove
                </button>
              )}
            </div>
          </>
        )}

        {showSqForm && (
          <div>
            {sqError && <Alert variant="danger">{sqError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600 }}>Current password</Form.Label>
              <PasswordInput autoComplete="current-password" value={sqForm.current_password}
                onChange={e => setSqForm(f => ({ ...f, current_password: e.target.value }))}
                placeholder="Required to confirm this change" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Question</Form.Label>
              <Form.Select value={sqForm.questionChoice}
                onChange={e => setSqForm(f => ({ ...f, questionChoice: e.target.value }))}>
                {SECURITY_QUESTION_PRESETS.map(q => <option key={q} value={q}>{q}</option>)}
              </Form.Select>
              {sqForm.questionChoice === CUSTOM_QUESTION && (
                <Form.Control className="mt-2" value={sqForm.customQuestion}
                  onChange={e => setSqForm(f => ({ ...f, customQuestion: e.target.value }))}
                  placeholder="Write your own question" />
              )}
            </Form.Group>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label>Answer</Form.Label>
                <Form.Control value={sqForm.answer}
                  onChange={e => setSqForm(f => ({ ...f, answer: e.target.value }))}
                  placeholder="Choose something only you would know" />
              </Col>
              <Col md={6}>
                <Form.Label>Confirm answer</Form.Label>
                <Form.Control value={sqForm.confirmAnswer}
                  onChange={e => setSqForm(f => ({ ...f, confirmAnswer: e.target.value }))} />
              </Col>
            </Row>
            <Form.Text className="text-muted">
              Avoid answers that are easy to look up (e.g. on social media). Not case-sensitive.
            </Form.Text>
            <div className="d-flex gap-3 mt-4">
              <Button variant="primary" onClick={handleSaveSecurityQuestion} disabled={sqSaving}>
                {sqSaving ? 'Saving...' : 'Save security question'}
              </Button>
              <Button variant="outline-secondary" onClick={() => setShowSqForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {showSqRemove && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '20px' }}>
            <p style={{ color: '#9f1239', fontWeight: 600, marginBottom: 8 }}>Remove your security question?</p>
            <p className="small mb-3" style={{ color: '#7f1d1d' }}>
              If the site's recovery method is set to security question, you won't be able to
              use it to reset your password until you set a new one.
            </p>
            {sqRemoveError && <Alert variant="danger">{sqRemoveError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600 }}>Confirm with your current password</Form.Label>
              <PasswordInput value={sqRemovePw}
                onChange={e => setSqRemovePw(e.target.value)} autoFocus />
            </Form.Group>
            <div className="d-flex gap-3">
              <Button variant="danger" onClick={handleRemoveSecurityQuestion} disabled={sqRemoving}>
                {sqRemoving ? 'Removing...' : 'Yes, remove it'}
              </Button>
              <Button variant="outline-secondary" onClick={() => { setShowSqRemove(false); setSqRemoveError('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Vault Password (+ Vault Recovery Settings, folded together) ───── */}
      {section === 'vault-password' && (
      <div id="vault-password">
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Vault Password</h6>
        <p className="text-muted small mb-4">
          Your vault password protects your most sensitive sections: Personal &amp; Legal Documents,
          Digital Life, Financial Affairs, Property &amp; Possessions, and Household Information.
          It is never stored on our servers. If you remember it, use <strong>Change vault password</strong>{' '}
          below, nothing is deleted. If you've completely forgotten it, the only option is a full
          vault reset, which permanently deletes all vault-protected content.
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
              Your vault password will be created the first time you open any vault-protected
              section: Personal & Legal Documents, Digital Life, Financial Affairs,
              Property & Possessions, or Household Information.
            </p>
          </div>
        )}

        {vaultExists === true && !showVaultReset && !showChangeVaultRecover && (
          <>
            <div style={{
              background: 'var(--green-50)', border: '1px solid var(--green-100)',
              borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: '0.85rem',
              color: 'var(--green-800)',
            }}>
              🔒 Vault is active. Your legal documents, digital credentials, financial, property, and
              household information are protected.
            </div>

            {vaultPwSuccess && <Alert variant="success">{vaultPwSuccess}</Alert>}
            {vaultPwError   && <Alert variant="danger">{vaultPwError}</Alert>}

            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600 }}>Current vault password</Form.Label>
              <PasswordInput
                value={vaultPwForm.old_password}
                onChange={e => setVaultPwForm(f => ({ ...f, old_password: e.target.value }))}
                placeholder="Your current vault password"
              />
              {recoveryEnabled && (
                <button className="btn btn-link p-0 mt-1" style={{ fontSize: '0.82rem' }}
                  onClick={openChangeVaultRecover}>
                  Forgot your current vault password?
                </button>
              )}
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>New vault password</Form.Label>
                <PasswordInput
                  value={vaultPwForm.new_password}
                  onChange={e => setVaultPwForm(f => ({ ...f, new_password: e.target.value }))}
                  placeholder="At least 8 characters"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Confirm new password</Form.Label>
                <PasswordInput
                  value={vaultPwForm.confirm}
                  onChange={e => setVaultPwForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Type it again"
                />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Password hint <span className="text-muted" style={{ fontWeight: 400 }}>(optional)</span></Form.Label>
              <Form.Control
                value={vaultPwForm.hint}
                onChange={e => setVaultPwForm(f => ({ ...f, hint: e.target.value }))}
                placeholder="e.g. childhood pet's name"
                maxLength={200}
              />
              <Form.Text className="text-muted">
                Shown to you only, on the locked-vault screen, if you ever forget your password.
                Leave as-is to keep your current hint, or clear it to remove it.
              </Form.Text>
            </Form.Group>
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

        {showChangeVaultRecover && (
          <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px' }}>
            <p style={{ color: 'var(--green-900)', fontWeight: 600, marginBottom: 8 }}>🔑 Recover your vault</p>
            <p className="small text-muted mb-3">
              Answer at least 3 of your security questions below (leave the rest blank if you don't
              remember them), then choose a new vault password. There's no limit on attempts.
            </p>
            {loadingChangeVaultRecover ? (
              <div className="text-center py-3"><Spinner size="sm" animation="border" aria-hidden="true" /></div>
            ) : (
              <VaultRecoverForm
                questions={changeVaultRecoverQuestions}
                onRecovered={handleChangeVaultRecovered}
                onCancel={() => setShowChangeVaultRecover(false)}
              />
            )}
          </div>
        )}

        {showVaultReset && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '20px' }}>
            <p style={{ color: '#9f1239', fontWeight: 600, marginBottom: 8 }}>⚠️ Reset your vault</p>
            <p className="small mb-3" style={{ color: '#7f1d1d' }}>
              This permanently deletes <strong>all</strong> vault-protected data: Personal &amp; Legal
              Documents, Digital Vault credentials, Financial Affairs, Property &amp; Possessions, and
              Household Information. This action cannot be undone. You can set a new vault password
              afterwards. If you still remember your current vault password, use{' '}
              <strong>Change vault password</strong> above instead, nothing will be deleted.
            </p>
            {vaultResetError && <Alert variant="danger">{vaultResetError}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600 }}>Confirm with your account password</Form.Label>
              <PasswordInput
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

      {/* ── Vault Recovery Settings ─────────────────────────────────────────── */}
      {vaultExists === true && (
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Vault Settings</h6>
          <p className="text-muted small mb-4">
            Choose what happens if you ever forget your vault password, and how your vault responds
            to wrong password attempts. Nothing here deletes your data unless you deliberately
            switch that on.
          </p>

          {recoverySuccess && <Alert variant="success">{recoverySuccess}</Alert>}

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
            <p className="mb-2" style={{ fontWeight: 600 }}>
              Forgot-password recovery: {recoveryEnabled ? 'security questions enabled' : 'full reset only'}
            </p>

            {!showRecoverySetup && !showRecoveryDisable && (
              <div className="d-flex gap-3 flex-wrap">
                <Button variant="outline-primary" size="sm" onClick={() => {
                  setRecoveryQuestions(defaultRecoveryQuestions()); setRecoverySetupPw(''); setRecoveryError(''); setShowRecoverySetup(true)
                }}>
                  {recoveryEnabled ? 'Replace recovery questions' : 'Set up recovery questions'}
                </Button>
                {recoveryEnabled && (
                  <button className="btn btn-link btn-sm p-0 text-danger" onClick={() => {
                    setRecoveryDisablePw(''); setRecoveryDisableError(''); setShowRecoveryDisable(true)
                  }}>
                    Turn off recovery
                  </button>
                )}
              </div>
            )}

            {showRecoverySetup && (
              <div className="mt-2">
                <p className="text-muted small">
                  These questions are separate from your account's own security question and are used
                  only to recover this vault. You'll need to answer at least 3 correctly to recover.
                </p>
                {recoveryError && <Alert variant="danger">{recoveryError}</Alert>}
                <Form.Group className="mb-3">
                  <Form.Label style={{ fontWeight: 600 }}>Current vault password</Form.Label>
                  <PasswordInput value={recoverySetupPw}
                    onChange={e => setRecoverySetupPw(e.target.value)}
                    placeholder="Required to confirm you still know it" />
                </Form.Group>
                <VaultRecoveryQuestionsForm questions={recoveryQuestions} setQuestions={setRecoveryQuestions} />
                <div className="d-flex gap-3 mt-3">
                  <Button variant="primary" size="sm" onClick={handleSetupRecovery} disabled={recoverySaving}>
                    {recoverySaving ? 'Saving...' : 'Save recovery questions'}
                  </Button>
                  <Button variant="outline-secondary" size="sm" onClick={() => setShowRecoverySetup(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {showRecoveryDisable && (
              <div className="mt-2">
                <p className="small" style={{ color: '#7f1d1d' }}>
                  Turning this off deletes your saved recovery questions. If you forget your vault
                  password afterwards, a full reset (deleting all vault data) will be the only option.
                </p>
                {recoveryDisableError && <Alert variant="danger">{recoveryDisableError}</Alert>}
                <Form.Group className="mb-3">
                  <Form.Label style={{ fontWeight: 600 }}>Current vault password</Form.Label>
                  <PasswordInput value={recoveryDisablePw}
                    onChange={e => setRecoveryDisablePw(e.target.value)}
                    placeholder="Required to confirm" />
                </Form.Group>
                <div className="d-flex gap-3">
                  <Button variant="danger" size="sm" onClick={handleDisableRecovery} disabled={recoveryDisabling}>
                    {recoveryDisabling ? 'Turning off...' : 'Turn off recovery'}
                  </Button>
                  <Button variant="outline-secondary" size="sm" onClick={() => setShowRecoveryDisable(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* REV-22: auto-delete is off unless the user deliberately turns it
              on. The switch itself never saves; both directions go through a
              confirmation dialog, and turning it on also needs a tick box and
              the vault password. */}
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '14px 16px' }}>
            <Form.Check
              type="switch"
              id="destroy-after-attempts-switch"
              checked={destroyAfter !== null}
              onChange={e => openDestroyDialog(e.target.checked)}
              label={
                <span style={{ fontWeight: 600, color: '#92400E' }}>
                  Maximum security: delete my vault data after repeated wrong passwords
                </span>
              }
            />
            <p className="text-muted small mb-0 mt-2">
              {destroyAfter === null ? (
                <>
                  <strong>Currently off.</strong> Getting your vault password wrong will never delete
                  anything. You will be signed out and your vault will pause for a few minutes, and
                  that is all. This is the right setting for almost everyone.
                </>
              ) : (
                <>
                  <strong>Currently on.</strong> If your vault password is entered wrongly{' '}
                  {destroyAfter} times in a row, everything in your vault is permanently deleted and
                  cannot be brought back. Turn this off any time.
                </>
              )}
            </p>
            {thresholdError && !showDestroyEnable && !showDestroyDisable && (
              <Alert variant="danger" className="mt-3 mb-0">{thresholdError}</Alert>
            )}
            {thresholdSuccess && <Alert variant="success" className="mt-3 mb-0">{thresholdSuccess}</Alert>}
            {destroyAfter !== null && (
              <Button variant="link" size="sm" className="p-0 mt-2" onClick={() => openDestroyDialog(true)}>
                Change the number of attempts
              </Button>
            )}
          </div>

          <Modal show={showDestroyEnable} onHide={() => setShowDestroyEnable(false)} centered>
            <Modal.Header closeButton>
              <Modal.Title style={{ fontSize: '1.1rem', color: '#991B1B' }}>
                Please read this before turning it on
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                <p className="mb-2" style={{ color: '#991B1B', fontWeight: 600 }}>
                  This setting can delete your information forever.
                </p>
                <p className="mb-2 small" style={{ color: '#7F1D1D' }}>
                  If you turn this on, then anyone who types the wrong vault password too many times
                  in a row will cause all of your vault-protected information to be deleted
                  permanently. That includes your legal documents, digital account details, financial
                  affairs, property and possessions, and household information.
                </p>
                <p className="mb-0 small" style={{ color: '#7F1D1D' }}>
                  We cannot undo it, and neither can you. There is no backup and no way to get it
                  back. That includes the case where it is you who has simply forgotten your own
                  password. Only turn this on if you would genuinely rather lose this information
                  than risk someone else eventually guessing their way into it.
                </p>
              </div>
              {thresholdError && <Alert variant="danger">{thresholdError}</Alert>}
              <Form.Group className="mb-3">
                <Form.Label className="small" style={{ fontWeight: 600 }}>
                  Delete after this many wrong attempts in a row
                </Form.Label>
                <Form.Control type="number" min={3} max={1000} value={destroyThresholdInput}
                  onChange={e => setDestroyThresholdInput(e.target.value)} />
                <Form.Text className="text-muted">Between 3 and 1000. We suggest {DEFAULT_DESTROY_SUGGESTION}.</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="small" style={{ fontWeight: 600 }}>Current vault password</Form.Label>
                <PasswordInput value={destroyThresholdPw}
                  onChange={e => setDestroyThresholdPw(e.target.value)}
                  placeholder="Required to confirm" />
              </Form.Group>
              <Form.Check
                type="checkbox"
                id="destroy-acknowledge"
                checked={destroyAcknowledged}
                onChange={e => setDestroyAcknowledged(e.target.checked)}
                label="I understand my vault data will be permanently deleted and cannot be recovered."
              />
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowDestroyEnable(false)}>
                Cancel, leave it off
              </Button>
              <Button variant="danger" onClick={handleEnableDestroy} disabled={savingThreshold || !destroyAcknowledged}>
                {savingThreshold ? 'Saving...' : 'Turn on permanent deletion'}
              </Button>
            </Modal.Footer>
          </Modal>

          <Modal show={showDestroyDisable} onHide={() => setShowDestroyDisable(false)} centered>
            <Modal.Header closeButton>
              <Modal.Title style={{ fontSize: '1.1rem' }}>Turn off maximum security</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="small text-muted">
                Wrong vault password attempts will no longer delete anything. You will still be
                signed out after {logoutAfter} wrong attempts, and your vault will still pause
                briefly every {lockoutAfter}, which are the normal protections.
              </p>
              {thresholdError && <Alert variant="danger">{thresholdError}</Alert>}
              <Form.Group>
                <Form.Label className="small" style={{ fontWeight: 600 }}>Current vault password</Form.Label>
                <PasswordInput value={destroyThresholdPw}
                  onChange={e => setDestroyThresholdPw(e.target.value)}
                  placeholder="Required to confirm" />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowDestroyDisable(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleDisableDestroy} disabled={savingThreshold}>
                {savingThreshold ? 'Saving...' : 'Turn it off'}
              </Button>
            </Modal.Footer>
          </Modal>

          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '14px 16px', marginTop: 16 }}>
            <p className="mb-2" style={{ fontWeight: 600, color: '#92400E' }}>
              Sign out after failed attempts (currently: {logoutAfter})
            </p>
            <p className="text-muted small mb-3">
              After this many wrong vault-password attempts in a row, you'll be signed out of your
              account entirely, not just locked out of the vault. Nothing is deleted. Minimum 1,
              default 5.
            </p>
            {logoutThresholdError && <Alert variant="danger">{logoutThresholdError}</Alert>}
            {logoutThresholdSuccess && <Alert variant="success">{logoutThresholdSuccess}</Alert>}
            <Row className="g-2 align-items-end">
              <Col xs={4} md={3}>
                <Form.Label className="small">Attempts</Form.Label>
                <Form.Control type="number" min={1} max={50} value={logoutThresholdInput}
                  onChange={e => setLogoutThresholdInput(e.target.value)} />
              </Col>
              <Col xs={8} md={6}>
                <Form.Label className="small">Current vault password</Form.Label>
                <PasswordInput value={logoutThresholdPw}
                  onChange={e => setLogoutThresholdPw(e.target.value)}
                  placeholder="Required to confirm" />
              </Col>
              <Col xs={12} md={3}>
                <Button variant="outline-primary" size="sm" className="w-100" onClick={handleSaveLogoutThreshold} disabled={savingLogoutThreshold}>
                  {savingLogoutThreshold ? 'Saving...' : 'Save'}
                </Button>
              </Col>
            </Row>
          </div>

          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '14px 16px', marginTop: 16 }}>
            <p className="mb-2" style={{ fontWeight: 600, color: '#92400E' }}>
              Temporary lockout interval (currently: every {lockoutAfter})
            </p>
            <p className="text-muted small mb-3">
              Every time your wrong-attempt count reaches a multiple of this number (e.g. every {lockoutAfter}{' '}
              attempts), the vault is temporarily locked for 3 minutes as a throttle. The correct
              password unlocks it straight away, even during a lock. Minimum 1, default 5.
            </p>
            {lockoutThresholdError && <Alert variant="danger">{lockoutThresholdError}</Alert>}
            {lockoutThresholdSuccess && <Alert variant="success">{lockoutThresholdSuccess}</Alert>}
            <Row className="g-2 align-items-end">
              <Col xs={4} md={3}>
                <Form.Label className="small">Attempts</Form.Label>
                <Form.Control type="number" min={1} max={50} value={lockoutThresholdInput}
                  onChange={e => setLockoutThresholdInput(e.target.value)} />
              </Col>
              <Col xs={8} md={6}>
                <Form.Label className="small">Current vault password</Form.Label>
                <PasswordInput value={lockoutThresholdPw}
                  onChange={e => setLockoutThresholdPw(e.target.value)}
                  placeholder="Required to confirm" />
              </Col>
              <Col xs={12} md={3}>
                <Button variant="outline-primary" size="sm" className="w-100" onClick={handleSaveLockoutThreshold} disabled={savingLockoutThreshold}>
                  {savingLockoutThreshold ? 'Saving...' : 'Save'}
                </Button>
              </Col>
            </Row>
          </div>
        </div>
      )}
      </div>
      )}

      {/* ── Inactivity Timer ──────────────────────────────────────────────── */}
      {section === 'inactivity-timer' && timerData && (
        <div id="inactivity-timer" style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)' }}>
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

      {/* ── Billing & Subscription (+ Payment History, folded together) ───── */}
      {section === 'billing' && (
      <div id="billing">
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginTop: 24 }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Billing &amp; Subscription</h6>

        {billingError && <Alert variant="danger" className="mt-3">{billingError}</Alert>}
        {billingMessage && <Alert variant="success" className="mt-3">{billingMessage}</Alert>}

        {!subscription || subscription.plan === 'free' ? (
          <>
            <p className="text-muted small mb-3">You're on the Essentials plan. Upgrade to unlock every section.</p>
            <Button variant="outline-primary" onClick={() => navigate('/upgrade')}>See Premium plans</Button>
          </>
        ) : subscription.cancelled_at ? (
          <div style={{ background: '#fff8e6', border: '1px solid #f5d78e', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ color: '#8a6416', fontWeight: 600, marginBottom: 8 }}>
              You cancelled your premium membership on {formatDate(subscription.cancelled_at)}.
            </p>
            <p className="small mb-3" style={{ color: '#8a6416', lineHeight: 1.6 }}>
              Your subscription stays active until <strong>{formatDate(subscription.current_period_end)}</strong>, then
              it will not renew and you will not be billed again. Nothing is deleted: everything you've recorded in
              your premium sections stays safely stored, and will unlock again the moment you resubscribe.
              You can reinstate your membership any time before then.
            </p>
            <Button variant="outline-primary" onClick={handleReinstate} disabled={reinstating}>
              {reinstating ? 'Reinstating...' : 'Reinstate my membership'}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-muted small mb-1">
              You're on the <strong>{subscription.plan_id === 'annual' ? 'Premium Annual' : 'Premium Monthly'}</strong> plan.
            </p>
            {subscription.current_period_end && (
              <p className="text-muted small mb-3">Renews {formatDate(subscription.current_period_end)}.</p>
            )}
            {subscription.provider === 'stripe' && (
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <Button variant="outline-secondary" size="sm" onClick={handleOpenBillingPortal} disabled={openingPortal}>
                  {openingPortal ? 'Opening...' : 'Update payment method'}
                </Button>
                <button className="btn btn-link p-0" style={{ color: '#DC3545', fontSize: '0.85rem' }}
                  onClick={handleCancelSubscription} disabled={cancelling}>
                  {cancelling ? 'Cancelling...' : 'Cancel subscription'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Payment History ──────────────────────────────────────────────── */}
      {paymentHistory.length > 0 && (
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginTop: 24 }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 12 }}>Payment History</h6>
          <div style={{ overflowX: 'auto' }}>
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map(p => (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td>
                    <td>${p.amount.toFixed(2)} {p.currency.toUpperCase()}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {p.receipt_url ? (
                        <a href={p.receipt_url} target="_blank" rel="noreferrer">{p.id}</a>
                      ) : p.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      )}

      {/* ── Delete My Account ────────────────────────────────────────────── */}
      {section === 'delete-account' && (
      <div id="delete-account" style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginTop: 24 }}>
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
              <PasswordInput
                placeholder="Confirm with your account password"
                value={deleteForm.password}
                onChange={e => setDeleteForm(f => ({ ...f, password: e.target.value }))}
                autoFocus
              />
            </Form.Group>
            {vaultExists && (
              <Form.Group className="mb-3">
                <Form.Label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Your vault password</Form.Label>
                <PasswordInput
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
      )}
    </div>
  )
}
