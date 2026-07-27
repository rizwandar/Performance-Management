import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, Form, Button, Alert, Row, Col } from 'react-bootstrap'
import axios from 'axios'

// ISO 3166-1 alpha-2 country list with compliance regime tags
// regime: gdpr | pipeda | privacy_act | nz | ccpa | general | restricted
const COUNTRIES = [
  // Canada
  { code: 'CA', name: 'Canada',                        regime: 'pipeda' },
  // USA
  { code: 'US', name: 'United States',                 regime: 'ccpa' },
  // Australia / NZ
  { code: 'AU', name: 'Australia',                     regime: 'privacy_act' },
  { code: 'NZ', name: 'New Zealand',                   regime: 'nz' },
  // EU member states (GDPR)
  { code: 'AT', name: 'Austria',                       regime: 'gdpr' },
  { code: 'BE', name: 'Belgium',                       regime: 'gdpr' },
  { code: 'BG', name: 'Bulgaria',                      regime: 'gdpr' },
  { code: 'HR', name: 'Croatia',                       regime: 'gdpr' },
  { code: 'CY', name: 'Cyprus',                        regime: 'gdpr' },
  { code: 'CZ', name: 'Czech Republic',                regime: 'gdpr' },
  { code: 'DK', name: 'Denmark',                       regime: 'gdpr' },
  { code: 'EE', name: 'Estonia',                       regime: 'gdpr' },
  { code: 'FI', name: 'Finland',                       regime: 'gdpr' },
  { code: 'FR', name: 'France',                        regime: 'gdpr' },
  { code: 'DE', name: 'Germany',                       regime: 'gdpr' },
  { code: 'GR', name: 'Greece',                        regime: 'gdpr' },
  { code: 'HU', name: 'Hungary',                       regime: 'gdpr' },
  { code: 'IE', name: 'Ireland',                       regime: 'gdpr' },
  { code: 'IT', name: 'Italy',                         regime: 'gdpr' },
  { code: 'LV', name: 'Latvia',                        regime: 'gdpr' },
  { code: 'LT', name: 'Lithuania',                     regime: 'gdpr' },
  { code: 'LU', name: 'Luxembourg',                    regime: 'gdpr' },
  { code: 'MT', name: 'Malta',                         regime: 'gdpr' },
  { code: 'NL', name: 'Netherlands',                   regime: 'gdpr' },
  { code: 'PL', name: 'Poland',                        regime: 'gdpr' },
  { code: 'PT', name: 'Portugal',                      regime: 'gdpr' },
  { code: 'RO', name: 'Romania',                       regime: 'gdpr' },
  { code: 'SK', name: 'Slovakia',                      regime: 'gdpr' },
  { code: 'SI', name: 'Slovenia',                      regime: 'gdpr' },
  { code: 'ES', name: 'Spain',                         regime: 'gdpr' },
  { code: 'SE', name: 'Sweden',                        regime: 'gdpr' },
  // EEA + UK + Switzerland (GDPR-equivalent)
  { code: 'GB', name: 'United Kingdom',                regime: 'gdpr' },
  { code: 'NO', name: 'Norway',                        regime: 'gdpr' },
  { code: 'IS', name: 'Iceland',                       regime: 'gdpr' },
  { code: 'LI', name: 'Liechtenstein',                 regime: 'gdpr' },
  { code: 'CH', name: 'Switzerland',                   regime: 'gdpr' },
  // Asia-Pacific
  { code: 'SG', name: 'Singapore',                     regime: 'general' },
  { code: 'JP', name: 'Japan',                         regime: 'general' },
  { code: 'KR', name: 'South Korea',                   regime: 'general' },
  { code: 'IN', name: 'India',                         regime: 'general' },
  { code: 'MY', name: 'Malaysia',                      regime: 'general' },
  { code: 'PH', name: 'Philippines',                   regime: 'general' },
  // Middle East & Africa
  { code: 'ZA', name: 'South Africa',                  regime: 'general' },
  { code: 'AE', name: 'United Arab Emirates',          regime: 'general' },
  { code: 'IL', name: 'Israel',                        regime: 'general' },
  // Americas
  { code: 'MX', name: 'Mexico',                        regime: 'general' },
  { code: 'BR', name: 'Brazil',                        regime: 'general' },
  { code: 'AR', name: 'Argentina',                     regime: 'general' },
  // Countries with strict data localisation — registration allowed but flagged
  { code: 'RU', name: 'Russia',                        regime: 'restricted' },
  { code: 'CN', name: 'China',                         regime: 'restricted' },
  // Other
  { code: 'OTHER', name: 'Other country (not listed)', regime: 'general' },
].sort((a, b) => {
  // Sort: CA, US, AU first, then alphabetical
  const priority = { CA: 0, US: 1, AU: 2, NZ: 3 }
  const pa = priority[a.code] ?? 99
  const pb = priority[b.code] ?? 99
  if (pa !== pb) return pa - pb
  return a.name.localeCompare(b.name)
})

const REGIME_NOTES = {
  gdpr:        { label: 'GDPR applies', color: '#1E40AF', bg: '#EFF6FF' },
  pipeda:      { label: 'PIPEDA applies', color: '#065F46', bg: '#ECFDF5' },
  privacy_act: { label: 'Australian Privacy Act applies', color: '#065F46', bg: '#ECFDF5' },
  nz:          { label: 'NZ Privacy Act applies', color: '#065F46', bg: '#ECFDF5' },
  ccpa:        { label: 'US privacy laws apply', color: '#92400E', bg: '#FFFBEB' },
  general:     { label: 'International privacy principles apply', color: '#4B5563', bg: '#F9FAFB' },
  restricted:  { label: 'Note: your country has data localisation laws. Your data may be stored outside your country.', color: '#991B1B', bg: '#FEF2F2' },
}

function PasswordRequirements({ password }) {
  const checks = [
    { label: 'At least 8 characters',    met: password.length >= 8 },
    { label: 'One uppercase letter',      met: /[A-Z]/.test(password) },
    { label: 'One number',               met: /[0-9]/.test(password) },
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

const API = import.meta.env.VITE_API_URL

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm_password: '', date_of_birth: '',
    country_code: '', privacy_consent: false, gdpr_age_consent: false,
  })
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [detectingCountry, setDetectingCountry] = useState(true)

  // Auto-detect country on mount
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        const detected = data.country_code
        const match = COUNTRIES.find(c => c.code === detected)
        if (match) setForm(f => ({ ...f, country_code: match.code }))
      })
      .catch(() => {})
      .finally(() => setDetectingCountry(false))
  }, [])

  const selectedCountry = COUNTRIES.find(c => c.code === form.country_code)
  const regime = selectedCountry?.regime

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) return setError('Please enter your full name.')
    if (!form.email.trim()) return setError('Please enter your email address.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Please enter a valid email address.')
    if (form.password.length < 8) return setError('Your password must be at least 8 characters long.')
    if (!/[A-Z]/.test(form.password)) return setError('Your password must contain at least one uppercase letter.')
    if (!/[0-9]/.test(form.password)) return setError('Your password must contain at least one number.')
    if (form.password !== form.confirm_password) return setError('Passwords do not match.')
    if (!form.country_code) return setError('Please select your country.')
    if (!form.privacy_consent) return setError('Please read and agree to the Privacy Policy and Terms of Service to continue.')

    setSaving(true)
    try {
      await axios.post(`${API}/auth/register`, {
        name:            form.name,
        email:           form.email,
        password:        form.password,
        date_of_birth:   form.date_of_birth || null,
        country_code:    form.country_code,
        privacy_consent: form.privacy_consent,
      })
      navigate('/login', { state: { registered: true } })
    } catch (err) {
      if (!err.response) {
        setError("We couldn't reach the server. Please check your connection and try again.")
      } else if (err.response.status === 409) {
        setError('That email address is already registered. Try signing in instead, or use the forgot password link.')
      } else if (err.response.status === 429) {
        setError('Too many attempts. Please wait a moment and try again.')
      } else {
        setError(err.response?.data?.error || 'Registration failed. Please check your details and try again.')
      }
    }
    setSaving(false)
  }

  return (
    <div className="d-flex justify-content-center pt-4">
      <Card style={{ width: '100%', maxWidth: 540 }}>
        <Card.Header><h5 className="mb-0">Begin your journey</h5></Card.Header>
        <Card.Body>
          <p className="text-muted small mb-3">
            Create your account to start gathering everything your loved ones will need.
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>

            <Form.Group className="mb-3">
              <Form.Label>Full Name</Form.Label>
              <Form.Control
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Your full name"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Email Address</Form.Label>
              <Form.Control
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
                placeholder="your@email.com"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Country of Residence</Form.Label>
              <Form.Select
                value={form.country_code}
                onChange={e => setForm({ ...form, country_code: e.target.value })}
                required
                disabled={detectingCountry}
              >
                <option value="">{detectingCountry ? 'Detecting your location…' : 'Select your country'}</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </Form.Select>
              {selectedCountry && regime && REGIME_NOTES[regime] && (
                <div style={{
                  marginTop: 6, padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem',
                  background: REGIME_NOTES[regime].bg, color: REGIME_NOTES[regime].color,
                  border: `1px solid ${REGIME_NOTES[regime].color}30`,
                }}>
                  {REGIME_NOTES[regime].label}
                </div>
              )}
              {regime === 'pipeda' && (
                <p className="text-muted small mt-2 mb-0">
                  Your data may be stored on servers outside Canada (Cloudflare R2 and Render.com infrastructure).
                  Under PIPEDA, you have the right to access, correct, and request deletion of your personal information.
                </p>
              )}
              {regime === 'gdpr' && (
                <p className="text-muted small mt-2 mb-0">
                  Your data may be processed outside the EEA. We apply GDPR-standard protections regardless of
                  where data is stored. You have rights to access, rectification, erasure, portability, and to lodge a
                  complaint with your supervisory authority.
                </p>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                Date of Birth <span className="text-muted small">(optional, used for password recovery)</span>
              </Form.Label>
              <Form.Control
                type="date"
                value={form.date_of_birth}
                onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </Form.Group>

            <Row className="g-3 mb-4">
              <Col md={6}>
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                  autoComplete="new-password"
                />
                <PasswordRequirements password={form.password} />
              </Col>
              <Col md={6}>
                <Form.Label>Confirm Password</Form.Label>
                <Form.Control
                  type="password"
                  value={form.confirm_password}
                  onChange={e => setForm({ ...form, confirm_password: e.target.value })}
                  required
                  autoComplete="new-password"
                />
              </Col>
            </Row>

            {/* Consent */}
            <div style={{
              background: 'var(--parchment)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '14px 16px', marginBottom: 16,
            }}>
              <Form.Check
                type="checkbox"
                id="privacy-consent"
                checked={form.privacy_consent}
                onChange={e => setForm({ ...form, privacy_consent: e.target.checked })}
                label={
                  <span style={{ fontSize: '0.87rem' }}>
                    I have read and agree to the{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--green-700)' }}>Privacy Policy</a>
                    {' '}and{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--green-700)' }}>Terms of Service</a>.
                    I understand that my data may be stored and processed in accordance with
                    applicable privacy laws.
                  </span>
                }
              />
              {(regime === 'gdpr') && (
                <Form.Check
                  type="checkbox"
                  id="gdpr-age"
                  className="mt-2"
                  checked={form.gdpr_age_consent}
                  onChange={e => setForm({ ...form, gdpr_age_consent: e.target.checked })}
                  label={<span style={{ fontSize: '0.87rem' }}>I confirm that I am 16 years of age or older (required under GDPR).</span>}
                />
              )}
            </div>

            <Button type="submit" variant="primary" className="w-100"
              disabled={saving || !form.privacy_consent || (regime === 'gdpr' && !form.gdpr_age_consent)}>
              {saving ? 'Creating your account…' : 'Create my account'}
            </Button>
          </Form>

          <div className="text-center mt-3">
            <small className="text-muted">
              Already have an account? <Link to="/login">Sign in</Link>
            </small>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
