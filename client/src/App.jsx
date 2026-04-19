import { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { Navbar, Container, Nav, Button } from 'react-bootstrap'
import axios from 'axios'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BrandingProvider, useBranding } from './context/BrandingContext'

import AccessPage             from './pages/AccessPage'
import LandingPage            from './pages/LandingPage'
import LoginPage              from './pages/LoginPage'
import RegisterPage           from './pages/RegisterPage'
import ForgotPasswordPage     from './pages/ForgotPasswordPage'
import ResetPasswordPage      from './pages/ResetPasswordPage'
import DashboardPage          from './pages/DashboardPage'
import ProfilePage            from './pages/ProfilePage'
import AdminPage              from './pages/AdminPage'
import ExportPage             from './pages/ExportPage'

import PrivacyPage            from './pages/PrivacyPage'
import TermsPage              from './pages/TermsPage'
import NotFoundPage           from './pages/NotFoundPage'
import LegalDocumentsPage     from './pages/sections/LegalDocumentsPage'
import FinancialAffairsPage   from './pages/sections/FinancialAffairsPage'
import DigitalLifePage        from './pages/sections/DigitalLifePage'
import FuneralWishesPage      from './pages/sections/FuneralWishesPage'
import MedicalWishesPage      from './pages/sections/MedicalWishesPage'
import PeopleToNotifyPage     from './pages/sections/PeopleToNotifyPage'
import PropertyPossessionsPage from './pages/sections/PropertyPossessionsPage'
import MessagesPage           from './pages/sections/MessagesPage'
import SongsThatDefineMePage      from './pages/sections/SongsThatDefineMePage'
import LifesWishesPage            from './pages/sections/LifesWishesPage'
import HouseholdInfoPage          from './pages/sections/HouseholdInfoPage'
import ChildrenDependantsPage     from './pages/sections/ChildrenDependantsPage'
import HowToBeRememberedPage      from './pages/sections/HowToBeRememberedPage'
import KeyContactsPage            from './pages/sections/KeyContactsPage'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Theme & font maps — applied by writing CSS variables onto <html>
// ---------------------------------------------------------------------------
const THEME_VARS = {
  forest: {
    '--green-900': '#1A3D28', '--green-800': '#2D5A3D', '--green-700': '#3D7A53',
    '--green-600': '#4D9466', '--green-100': '#D6E8DC', '--green-50': '#F0F7F2',
    '--gold': '#C9904A', '--gold-light': '#E8B97A', '--gold-50': '#FDF6EC',
    '--parchment': '#F7F5F0', '--parchment-dark': '#EDE9DF',
    '--bs-primary': '#2D5A3D', '--bs-primary-rgb': '45, 90, 61',
  },
  dusk: {
    '--green-900': '#1E2D4A', '--green-800': '#2A3F63', '--green-700': '#3A5280',
    '--green-600': '#4A659D', '--green-100': '#C8D5E8', '--green-50': '#EEF2F8',
    '--gold': '#B87333', '--gold-light': '#D4945A', '--gold-50': '#FBF2EA',
    '--parchment': '#F5F0E8', '--parchment-dark': '#E8E0D0',
    '--bs-primary': '#2A3F63', '--bs-primary-rgb': '42, 63, 99',
  },
  terracotta: {
    '--green-900': '#3D2315', '--green-800': '#5C3520', '--green-700': '#7A4A2E',
    '--green-600': '#9A6040', '--green-100': '#E0C8B8', '--green-50': '#F5EDE6',
    '--gold': '#D4842A', '--gold-light': '#E8A85A', '--gold-50': '#FDF5EA',
    '--parchment': '#FAF7F2', '--parchment-dark': '#F0EAE0',
    '--bs-primary': '#5C3520', '--bs-primary-rgb': '92, 53, 32',
  },
  // Three additional themes
  ocean: {
    '--green-900': '#0D3D56', '--green-800': '#175F7A', '--green-700': '#22809E',
    '--green-600': '#2DA0C2', '--green-100': '#BFE3EF', '--green-50': '#EAF6FA',
    '--gold': '#E6944A', '--gold-light': '#F0B47A', '--gold-50': '#FEF5EC',
    '--parchment': '#F5F9FA', '--parchment-dark': '#E0EDF2',
    '--bs-primary': '#175F7A', '--bs-primary-rgb': '23, 95, 122',
  },
  rosegarden: {
    '--green-900': '#5C2D3C', '--green-800': '#7A3F52', '--green-700': '#9A5568',
    '--green-600': '#B87080', '--green-100': '#E8C8D0', '--green-50': '#F7EEF1',
    '--gold': '#C4976A', '--gold-light': '#D9B48E', '--gold-50': '#FDF6EE',
    '--parchment': '#FAF5F6', '--parchment-dark': '#F0E4E8',
    '--bs-primary': '#7A3F52', '--bs-primary-rgb': '122, 63, 82',
  },
  midnight: {
    '--green-900': '#1A1A3E', '--green-800': '#2D2D6B', '--green-700': '#3D3D8A',
    '--green-600': '#5555A8', '--green-100': '#C8C8E8', '--green-50': '#EEEEF8',
    '--gold': '#B8963E', '--gold-light': '#D4B46A', '--gold-50': '#FBF6E8',
    '--parchment': '#F5F5FA', '--parchment-dark': '#E8E8F0',
    '--bs-primary': '#2D2D6B', '--bs-primary-rgb': '45, 45, 107',
  },
  highcontrast: {
    '--green-900': '#111111', '--green-800': '#222222', '--green-700': '#444444',
    '--green-600': '#666666', '--green-100': '#CCCCCC', '--green-50': '#F0F0F0',
    '--gold': '#C05000', '--gold-light': '#E07030', '--gold-50': '#FFF5EE',
    '--parchment': '#FFFFFF', '--parchment-dark': '#F0F0F0',
    '--bs-primary': '#222222', '--bs-primary-rgb': '34, 34, 34',
  },
  softmist: {
    '--green-900': '#4A5A65', '--green-800': '#6A7D8A', '--green-700': '#8A9DAA',
    '--green-600': '#AABBC8', '--green-100': '#D8E4EC', '--green-50': '#F0F4F7',
    '--gold': '#A89870', '--gold-light': '#C4B490', '--gold-50': '#F8F4EE',
    '--parchment': '#F8F9FA', '--parchment-dark': '#EEF1F4',
    '--bs-primary': '#6A7D8A', '--bs-primary-rgb': '106, 125, 138',
  },
}

const FONT_STACKS = {
  georgia:  "Georgia, 'Times New Roman', serif",
  lora:     "'Lora', Georgia, serif",
  inter:    "'Inter', system-ui, sans-serif",
  playfair: "'Playfair Display', Georgia, serif",
  merriweather: "'Merriweather', Georgia, serif",
  opensans: "'Open Sans', system-ui, sans-serif",
}

export function applyTheme(themeId) {
  const vars = THEME_VARS[themeId] || THEME_VARS.forest
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
}

export function applyFont(fontId) {
  document.documentElement.style.setProperty('--site-font', FONT_STACKS[fontId] || FONT_STACKS.georgia)
  document.body.style.fontFamily = FONT_STACKS[fontId] || FONT_STACKS.georgia
}

// ---------------------------------------------------------------------------
// Footer brand — uses branding context
// ---------------------------------------------------------------------------
function FooterBrand() {
  const { siteName, logoUrl } = useBranding()
  return (
    <div className="d-flex align-items-center gap-2 mb-3">
      <img src={logoUrl} alt={siteName} width="24" height="24" />
      <span style={{ fontWeight: 700, color: 'var(--green-900)', fontSize: '1rem' }}>{siteName}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function SiteFooter() {
  const [form, setForm]       = useState({ name: '', email: '', subject_type: 'feedback', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [footerError, setFooterError] = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setSending(true)
    setFooterError('')
    try {
      await axios.post(`${API}/contact`, form)
      setSent(true)
      setForm({ name: '', email: '', subject_type: 'feedback', message: '' })
    } catch (err) {
      setFooterError(err.response?.data?.error || 'Could not send your message. Please try again.')
    }
    setSending(false)
  }

  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--parchment)',
      marginTop: 40,
      padding: '48px 0 24px',
    }}>
      <div className="container" style={{ maxWidth: 960 }}>
        <div className="row g-5 mb-4">

          {/* Left column — about & legal links */}
          <div className="col-12 col-md-5">
            <FooterBrand />

            <p className="text-muted small mb-4" style={{ lineHeight: 1.7 }}>
              A secure, private space to document your wishes, record what matters,
              and leave the people you love with clarity and peace of mind.
            </p>

            <div className="mb-3">
              <p className="small mb-1" style={{ color: 'var(--green-900)', fontWeight: 600 }}>Security &amp; Privacy</p>
              <p className="text-muted small mb-0" style={{ lineHeight: 1.7 }}>
                Your information is encrypted at rest and in transit. We never sell your data.
                See our <a href="/privacy" style={{ color: 'var(--green-700)' }}>Privacy Policy</a> for details.
              </p>
            </div>

            <div className="mb-4">
              <p className="small mb-1" style={{ color: 'var(--green-900)', fontWeight: 600 }}>Privacy and Compliance</p>
              <p className="text-muted small mb-0" style={{ lineHeight: 1.7 }}>
                In Good Hands is committed to protecting your privacy in accordance with applicable
                laws, including GDPR (EU/UK), PIPEDA (Canada), the Australian Privacy Act, and
                applicable US state privacy laws. Your data is encrypted and never sold.
                See our <a href="/privacy" style={{ color: 'var(--green-700)' }}>Privacy Policy</a> for
                full details including your rights and data residency information.
              </p>
            </div>

            <div className="d-flex flex-wrap gap-3">
              {[
                { label: 'Privacy Policy',    href: '/privacy', internal: true },
                { label: 'Terms of Service',  href: '/terms' },
                { label: 'Accessibility',     href: '/accessibility' },
                { label: 'Security',          href: '/security' },
              ].map(link => (
                link.internal
                  ? <Link key={link.href} to={link.href}
                      style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textDecoration: 'none' }}>
                      {link.label}
                    </Link>
                  : <a key={link.href} href={link.href}
                      style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textDecoration: 'none' }}
                      onMouseEnter={e => e.target.style.color = 'var(--green-800)'}
                      onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}>
                      {link.label}
                    </a>
              ))}
            </div>
          </div>

          {/* Right column — contact / feedback form */}
          <div className="col-12 col-md-7">
            <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>Get in touch</p>
            <p className="text-muted small mb-3">
              Have a question, found an issue, or want to suggest an improvement? We'd love to hear from you.
            </p>

            {sent ? (
              <div style={{
                background: 'var(--green-50)', border: '1px solid var(--green-100)',
                borderRadius: 10, padding: '20px', textAlign: 'center',
              }}>
                <p style={{ fontSize: '1.5rem', marginBottom: 6 }}>✉️</p>
                <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4 }}>Message received. Thank you!</p>
                <p className="text-muted small mb-3">We aim to respond within 1–2 business days.</p>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setSent(false)}>
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {footerError && (
                  <div className="alert alert-danger py-2 small mb-3">{footerError}</div>
                )}
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <input className="form-control form-control-sm" placeholder="Your name *"
                      value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="col-6">
                    <input className="form-control form-control-sm" type="email" placeholder="Your email *"
                      value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                  </div>
                </div>
                <div className="mb-2">
                  <select className="form-select form-select-sm"
                    value={form.subject_type} onChange={e => setForm({ ...form, subject_type: e.target.value })}>
                    <option value="feedback">Feedback / suggestion</option>
                    <option value="support">Support request</option>
                    <option value="general">General enquiry</option>
                  </select>
                </div>
                <div className="mb-3">
                  <textarea className="form-control form-control-sm" rows={3}
                    placeholder="Your message *"
                    value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                    required />
                </div>
                <button type="submit" className="btn btn-sm btn-primary" disabled={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <p className="text-muted small mb-0">
            © {new Date().getFullYear()} In Good Hands. All rights reserved.
            &nbsp;·&nbsp;
            <a href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>Privacy Policy</a>
          </p>
          <p className="text-muted small mb-0" style={{ fontSize: '0.75rem' }}>
            Made with care in Canada 🇨🇦 &nbsp;·&nbsp; v{__APP_VERSION__} &nbsp;·&nbsp; Built {new Date(__BUILD_TIME__).toLocaleString('en-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isTokenValid } = useAuth()
  if (!isTokenValid()) return <Navigate to="/login" replace />
  if (adminOnly && !user?.is_admin) return <Navigate to="/profile" replace />
  return children
}

function NavBar() {
  const { user, isTokenValid, logout } = useAuth()
  const { siteName, logoUrl } = useBranding()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <Navbar expand="md" className="mb-4">
      <Container>
        <Navbar.Brand as={Link} to="/">
          <img src={logoUrl} alt={siteName} width="40" height="40"
            style={{ marginRight: 8, verticalAlign: 'middle' }} />
          {siteName}
        </Navbar.Brand>
        <Navbar.Toggle aria-label="Toggle navigation menu" />
        <Navbar.Collapse>
          <Nav className="ms-auto align-items-center">
            {isTokenValid() ? (
              <>
                {!user?.is_admin && (
                  <>
                    <Nav.Link as={Link} to="/profile">My Plans</Nav.Link>
                    <Nav.Link as={Link} to="/profile/settings">My Profile</Nav.Link>
                    <Nav.Link
                      as={Link}
                      to="/export"
                      title="Download your plans as PDF"
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <polyline points="9 15 12 18 15 15"/>
                      </svg>
                      Export PDF
                    </Nav.Link>
                  </>
                )}
                {user?.is_admin && <Nav.Link as={Link} to="/admin">Admin</Nav.Link>}
                {user?.is_admin && <Nav.Link as={Link} to="/profile">My Account</Nav.Link>}
                <Button variant="outline-light" size="sm" className="ms-2" onClick={handleLogout}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Nav.Link as={Link} to="/login">Sign in</Nav.Link>
                <Nav.Link as={Link} to="/register">Get started</Nav.Link>
              </>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}

function AppContent() {
  const { setBranding } = useBranding()

  // Load and apply theme, font, and branding from settings on app boot
  useEffect(() => {
    axios.get(`${API}/settings`).then(r => {
      if (r.data.site_theme) applyTheme(r.data.site_theme)
      if (r.data.site_font)  applyFont(r.data.site_font)
      setBranding({
        siteName: r.data.site_name  || 'In Good Hands',
        logoUrl:  r.data.site_logo_url || '/logos/hands-heart.svg',
      })
    }).catch(() => {})
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Skip to main content — visible on keyboard focus for screen reader / keyboard users */}
      <a
        href="#main-content"
        style={{
          position: 'absolute', top: -40, left: 8, zIndex: 9999,
          background: 'var(--green-900)', color: '#fff',
          padding: '8px 16px', borderRadius: 4, textDecoration: 'none',
          fontSize: '0.9rem', fontWeight: 600,
          transition: 'top 0.1s',
        }}
        onFocus={e => { e.target.style.top = '8px' }}
        onBlur={e => { e.target.style.top = '-40px' }}
      >
        Skip to main content
      </a>
      <NavBar />
      <Container id="main-content" className="py-4" style={{ flex: 1 }}>
        <Routes>
          <Route path="/"                  element={<LandingPage />} />
          <Route path="/privacy"           element={<PrivacyPage />} />
          <Route path="/terms"             element={<TermsPage />} />
          <Route path="/login"             element={<LoginPage />} />
          <Route path="/register"          element={<RegisterPage />} />
          <Route path="/forgot-password"   element={<ForgotPasswordPage />} />
          <Route path="/reset-password"    element={<ResetPasswordPage />} />

          {/* Dashboard */}
          <Route path="/profile" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

          {/* User profile / settings */}
          <Route path="/profile/settings" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          {/* Public access page — no auth required */}
          <Route path="/access/:token" element={<AccessPage />} />

          {/* Sections — Phase 1 */}
          <Route path="/sections/legal-documents"      element={<ProtectedRoute><LegalDocumentsPage /></ProtectedRoute>} />
          <Route path="/sections/financial-affairs"    element={<ProtectedRoute><FinancialAffairsPage /></ProtectedRoute>} />
          <Route path="/sections/digital-life"         element={<ProtectedRoute><DigitalLifePage /></ProtectedRoute>} />
          <Route path="/sections/funeral-wishes"       element={<ProtectedRoute><FuneralWishesPage /></ProtectedRoute>} />
          <Route path="/sections/medical-wishes"       element={<ProtectedRoute><MedicalWishesPage /></ProtectedRoute>} />
          <Route path="/sections/people-to-notify"     element={<ProtectedRoute><PeopleToNotifyPage /></ProtectedRoute>} />
          <Route path="/sections/property-possessions" element={<ProtectedRoute><PropertyPossessionsPage /></ProtectedRoute>} />
          <Route path="/sections/messages"             element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/sections/songs-that-define-me" element={<ProtectedRoute><SongsThatDefineMePage /></ProtectedRoute>} />
          <Route path="/sections/lifes-wishes"         element={<ProtectedRoute><LifesWishesPage /></ProtectedRoute>} />

          <Route path="/sections/household-info"        element={<ProtectedRoute><HouseholdInfoPage /></ProtectedRoute>} />
          <Route path="/sections/children-dependants"  element={<ProtectedRoute><ChildrenDependantsPage /></ProtectedRoute>} />
          <Route path="/sections/how-to-be-remembered" element={<ProtectedRoute><HowToBeRememberedPage /></ProtectedRoute>} />
          <Route path="/sections/key-contacts"         element={<ProtectedRoute><KeyContactsPage /></ProtectedRoute>} />

          {/* Export */}
          <Route path="/export" element={<ProtectedRoute><ExportPage /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Container>
      <SiteFooter />
    </div>
  )
}

export default function App() {
  return (
    <BrandingProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrandingProvider>
  )
}
