import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { VaultSetupScreen, VaultLockScreen } from '../../components/VaultGate'
import SectionHero from '../../components/SectionHero'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'
import { useVaultSession } from '../../context/VaultSessionContext'

const API = import.meta.env.VITE_API_URL

const empty = { organ_donation: '', organ_donation_details: '' }

// IDEA-32: Donation Bank, split out of the old combined Medical & Care
// Wishes section along with Doctors and Medical Records. Unlike those two,
// Donation Bank is NEW to the shared vault (same vault/password as Legal
// Documents, Digital Life, Financial Affairs, Property & Possessions, and
// Practical Household Information) - organ/body donation preferences are
// more sensitive than the rest of old Medical, per an explicit product
// decision, so this page follows the vault-gated pattern those pages use
// (VaultSetupScreen / VaultLockScreen / shared VaultSessionContext), not the
// plain pattern Doctors/Medical Records use. It's a single form, though, not
// a list, so it talks to POST .../donation-bank/view (vault_password in the
// body, same convention as the other vault sections' .../list routes) and
// PUT .../donation-bank, rather than the list CRUD routes those use.
export default function DonationBankPage() {
  const navigate = useNavigate()

  const { vaultPassword, vaultUnlocked, unlockVault, lockVault } = useVaultSession()
  const [vaultExists, setVaultExists] = useState(null) // null = still checking

  const [form, setForm]       = useState(empty)
  const [hasData, setHasData] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    axios.get(`${API}/sections/digital-life/vault`)
      .then(r => setVaultExists(!!r.data.exists))
      .catch(() => setVaultExists(true))
  }, [])

  const loadForm = (pw) => {
    setLoading(true)
    axios.post(`${API}/sections/donation-bank/view`, { vault_password: pw })
      .then(r => {
        if (r.data && (r.data.organ_donation || r.data.organ_donation_details)) {
          setHasData(true)
          setForm({
            organ_donation:         r.data.organ_donation         || '',
            organ_donation_details: r.data.organ_donation_details || '',
          })
        } else {
          setHasData(false)
          setForm(empty)
        }
      })
      .catch(() => setError("We couldn't load your donation preferences. Please try locking and unlocking again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (vaultExists && vaultUnlocked && vaultPassword) {
      loadForm(vaultPassword)
    } else if (!vaultUnlocked) {
      setForm(empty)
      setHasData(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultExists, vaultUnlocked])

  const handleUnlock = (pw) => { unlockVault(pw) }
  const handleVaultReset = () => { lockVault(); setVaultExists(false) }

  const vaultState = vaultExists === null ? 'loading'
    : !vaultExists ? 'no-vault'
    : vaultUnlocked ? 'unlocked'
    : 'locked'

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      await axios.put(`${API}/sections/donation-bank`, { ...form, vault_password: vaultPassword })
      setSuccess('Your donation preferences have been saved.')
      setHasData(true)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const backLink = (
    <div className="mb-4">
      <button className="btn btn-link p-0 mb-2"
        style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
        onClick={() => navigate('/profile')}>
        ← Back to my plans
      </button>
    </div>
  )

  const hero = (
    <SectionHero
      eyebrow="Your Affairs"
      headline="Your donation wishes, protected"
      highlight="protected"
      subtext="Your organ, tissue, and body donation preferences. This section is vault-protected, only you can access it with your vault password."
    />
  )

  if (vaultState === 'loading') {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {backLink}
        {hero}
        <div className="text-center py-5">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      </div>
    )
  }

  if (vaultState === 'no-vault') {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {backLink}
        {hero}
        <VaultSetupScreen onSetup={() => setVaultExists(true)} />
      </div>
    )
  }

  if (vaultState === 'locked') {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {backLink}
        {hero}
        <VaultLockScreen onUnlock={handleUnlock} onReset={handleVaultReset} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {backLink}
      {hero}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 8, padding: '10px 16px', marginBottom: 24,
      }}>
        <span style={{ color: 'var(--green-800)', fontSize: '0.9rem' }}>
          🔓 Vault unlocked. Records are visible in this session only.
        </span>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--green-800)', fontSize: '0.85rem', textDecoration: 'none' }}
          onClick={lockVault}>
          Lock vault
        </button>
      </div>

      <div className="mb-4">
        <ShareSectionTrigger section="donation_bank" sectionLabel="Donation Bank" isVaultSection />
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : (
        <Form>
          <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
            <h6 style={{ color: 'var(--green-900)', marginBottom: 16 }}>Organ &amp; Tissue Donation</h6>

            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: 600 }}>Organ donation preference</Form.Label>
              <div className="d-flex gap-3 flex-wrap">
                {[
                  { value: 'yes',    label: 'Yes, donate all' },
                  { value: 'some',   label: 'Some organs only' },
                  { value: 'no',     label: 'No' },
                  { value: 'unsure', label: 'Not decided' },
                ].map(opt => (
                  <Form.Check key={opt.value} type="radio" id={`od-${opt.value}`}
                    label={opt.label} name="organ_donation"
                    value={opt.value}
                    checked={form.organ_donation === opt.value}
                    onChange={e => setForm(f => ({ ...f, organ_donation: e.target.value }))}
                  />
                ))}
              </div>
            </Form.Group>

            {(form.organ_donation === 'yes' || form.organ_donation === 'some') && (
              <Form.Group>
                <Form.Label>Details</Form.Label>
                <Form.Control as="textarea" rows={2} value={form.organ_donation_details}
                  onChange={e => setForm(f => ({ ...f, organ_donation_details: e.target.value }))}
                  placeholder={form.organ_donation === 'some'
                    ? "Which organs or tissues you consent to donate..."
                    : "Any specific instructions or notes..."} />
              </Form.Group>
            )}
          </div>

          <div className="d-flex align-items-center gap-3 flex-wrap">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : hasData ? 'Update my preferences' : 'Save my preferences'}
            </Button>
            <button className="btn btn-link p-0"
              style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
              onClick={() => navigate('/profile')}>
              ← Back to my plans
            </button>
          </div>
          {success && <Alert variant="success" className="mt-3">{success}</Alert>}
          {error   && <Alert variant="danger"  className="mt-3">{error}</Alert>}
        </Form>
      )}

      <ShareSectionHistory section="donation_bank" />
    </div>
  )
}
