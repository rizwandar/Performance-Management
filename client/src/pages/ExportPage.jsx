import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Spinner, Card } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

function downloadBlob(blob, filename) {
  const url  = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href  = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export default function ExportPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [exporting,     setExporting]     = useState(false)
  const [exportingFull, setExportingFull] = useState(false)
  const [vaultPassword, setVaultPassword] = useState('')
  const [vaultError,    setVaultError]    = useState('')
  const [showPassword,  setShowPassword]  = useState(false)

  const safeName = () =>
    user?.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'my-plans'

  // ── Standard export (no vault) ─────────────────────────────────────────────
  const handleStandardExport = async () => {
    setExporting(true)
    try {
      const response = await axios.get(`${API}/export`, { responseType: 'blob' })
      downloadBlob(response.data, `in-good-hands-${safeName()}.pdf`)
    } catch {
      alert("We couldn't generate your PDF right now. Please try again.")
    }
    setExporting(false)
  }

  // ── Complete export (with vault) ───────────────────────────────────────────
  const handleFullExport = async () => {
    if (!vaultPassword.trim()) {
      setVaultError('Please enter your vault password to continue.')
      return
    }
    setExportingFull(true)
    setVaultError('')
    try {
      const response = await axios.post(
        `${API}/export`,
        { vault_password: vaultPassword },
        { responseType: 'blob' }
      )
      downloadBlob(response.data, `in-good-hands-${safeName()}-complete.pdf`)
      setVaultPassword('')
    } catch (err) {
      // With responseType:'blob', error body is a Blob; parse it as JSON
      let status = err.response?.status
      let message = "We couldn't generate your PDF right now. Please try again."
      let parsedJson = null
      if (err.response?.data) {
        try {
          const text = await err.response.data.text()
          parsedJson = JSON.parse(text)
          message = parsedJson.error || message
        } catch {}
      }
      if (parsedJson?.vault_deleted) {
        setVaultError('Your vault has been deleted after too many incorrect attempts. Your other plans and wishes are safe. You can create a new vault in the Digital Life section.')
      } else if (parsedJson?.force_logout) {
        logout()
        navigate('/login', { state: { vaultLockout: true } })
      } else if (status === 401) {
        setVaultError(message)
      } else if (status === 403 && !parsedJson?.force_logout) {
        setVaultError(
          "You haven't set up a vault yet. Visit the Digital Life or Legal Documents section to create your vault first."
        )
      } else {
        setVaultError(message)
      }
    }
    setExportingFull(false)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const cardStyle = {
    border: '1px solid var(--border)',
    borderRadius: 12,
    background: '#fff',
    padding: '28px 28px 24px',
    marginBottom: 20,
  }

  const sectionLabelStyle = {
    display: 'inline-block',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--green-800)',
    background: 'var(--green-50)',
    border: '1px solid var(--green-100)',
    borderRadius: 20,
    padding: '2px 10px',
    marginBottom: 10,
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Page heading ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>
          Download Your Plans
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: 0 }}>
          Everything you've recorded here can be saved as a beautifully formatted PDF document.
          A lasting record you can store safely, share with a trusted person, or hand to those
          who will one day need it most.
        </p>
      </div>

      {/* ── Option 1: Standard export ────────────────────────────────────── */}
      <div style={cardStyle}>
        <span style={sectionLabelStyle}>Standard Export</span>
        <h5 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
          Your Plans: Without Sensitive Vault Sections
        </h5>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.65, marginBottom: 14 }}>
          This document includes all the sections you've completed: your wishes, the people in
          your life, your property and financial affairs, your messages, and more. It's a warm,
          comprehensive record that your loved ones can read and hold onto.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.55, marginBottom: 20 }}>
          Your vault-protected sections (<strong>Personal &amp; Legal Documents</strong> and{' '}
          <strong>Digital Life</strong>) are not included in this version. They will appear at
          the end of the document with a note explaining they are securely protected.
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--green-800)', marginBottom: 20 }}>
          ✓ &nbsp;Safe to share with family, your solicitor, or a trusted person.
        </p>
        <Button
          onClick={handleStandardExport}
          disabled={exporting}
          style={{
            background: 'var(--green-800)', border: 'none',
            padding: '9px 24px', fontSize: '0.9rem', borderRadius: 8,
          }}
        >
          {exporting
            ? <><Spinner size="sm" animation="border" className="me-2" />Generating…</>
            : '⬇  Download Standard PDF'
          }
        </Button>
      </div>

      {/* ── Option 2: Complete export with vault ─────────────────────────── */}
      <div style={{ ...cardStyle, border: '1px solid var(--gold-light)' }}>
        <span style={{ ...sectionLabelStyle, color: '#8A6020', background: '#FEF9EC', border: '1px solid #F0D890' }}>
          Complete Export: Including Vault-Protected Sections
        </span>
        <h5 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
          Your Plans: Everything, including legal documents and credentials
        </h5>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.65, marginBottom: 14 }}>
          This version includes everything in the Standard Export, <em>plus</em> your vault-protected
          sections: your personal and legal documents, and your digital life credentials,
          fully decrypted and printed in the document.
        </p>

        {/* Sensitive data warning */}
        <div style={{
          background: '#FFF8E6',
          border: '1px solid #F0D070',
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 20,
          fontSize: '0.85rem',
          lineHeight: 1.6,
          color: '#5A4010',
        }}>
          <strong>⚠️ This document contains sensitive information</strong>
          <p style={{ marginBottom: 6, marginTop: 6 }}>
            The complete export includes passwords, account details, and legal document information
            that could be misused if it fell into the wrong hands.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Please only share this version with someone you absolutely trust.</strong>{' '}
            We recommend printing it rather than saving it digitally, and storing the physical
            copy in a secure, locked location, such as a safe or alongside your will.
          </p>
        </div>

        {/* Vault password input */}
        <Form.Group style={{ marginBottom: 16 }}>
          <Form.Label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--green-900)', marginBottom: 6 }}>
            Your vault password
          </Form.Label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            This is the password you created when you first set up your vault in Digital Life
            or Legal Documents.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 360 }}>
            <Form.Control
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your vault password"
              value={vaultPassword}
              onChange={e => { setVaultPassword(e.target.value); setVaultError('') }}
              onKeyDown={e => e.key === 'Enter' && handleFullExport()}
              isInvalid={!!vaultError}
              style={{ fontSize: '0.9rem' }}
            />
            <Button
              variant="outline-secondary"
              size="sm"
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              onClick={() => setShowPassword(p => !p)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </Button>
          </div>
          {vaultError && (
            <div style={{ color: '#B94040', fontSize: '0.83rem', marginTop: 6 }}>
              {vaultError}
            </div>
          )}
        </Form.Group>

        <Button
          onClick={handleFullExport}
          disabled={exportingFull}
          style={{
            background: '#8A6020', border: 'none',
            padding: '9px 24px', fontSize: '0.9rem', borderRadius: 8,
          }}
        >
          {exportingFull
            ? <><Spinner size="sm" animation="border" className="me-2" />Generating…</>
            : '⬇  Download Complete PDF'
          }
        </Button>
      </div>

      {/* ── General note ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--parchment)',
        borderRadius: 10,
        padding: '16px 20px',
        fontSize: '0.82rem',
        color: 'var(--text-muted)',
        lineHeight: 1.65,
        border: '1px solid var(--border)',
      }}>
        <strong style={{ color: 'var(--green-800)' }}>A note about this document</strong>
        <p style={{ marginTop: 6, marginBottom: 0 }}>
          This is a personal planning record, not a legal will or formal estate document. Please
          speak with a qualified legal professional for advice on wills, powers of attorney, and
          estate planning. We recommend reviewing and updating your PDF regularly as your
          circumstances change.
        </p>
      </div>

    </div>
  )
}
