import { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Navbar, Container, Nav, Button } from 'react-bootstrap'
import axios from 'axios'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BrandingProvider, useBranding } from './context/BrandingContext'
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext'
import { VaultSessionProvider } from './context/VaultSessionContext'
import VaultSessionExtendPrompt from './components/VaultSessionExtendPrompt'

import AccessPage             from './pages/AccessPage'
import SharedSectionPage      from './pages/SharedSectionPage'
import VerifyEmailPage        from './pages/VerifyEmailPage'
import LandingPage            from './pages/LandingPage'
import LoginPage              from './pages/LoginPage'
import RegisterPage           from './pages/RegisterPage'
import RegisterOrganizationPage from './pages/RegisterOrganizationPage'
import OrgAdminInviteCompletePage from './pages/OrgAdminInviteCompletePage'
import ForgotPasswordPage     from './pages/ForgotPasswordPage'
import ResetPasswordPage      from './pages/ResetPasswordPage'
import ReportDeathPage        from './pages/ReportDeathPage'
import DashboardPage          from './pages/DashboardPage'
import ProfilePage            from './pages/ProfilePage'
import AdminPage              from './pages/AdminPage'
import ExportPage             from './pages/ExportPage'

import PrivacyPage            from './pages/PrivacyPage'
import DeleteAccountPage      from './pages/DeleteAccountPage'
import TermsPage              from './pages/TermsPage'
import AccessibilityPage      from './pages/AccessibilityPage'
import PricingPage            from './pages/PricingPage'
import OrgDashboardPage       from './pages/org/OrgDashboardPage'
import OrgCustomersPage       from './pages/org/OrgCustomersPage'
import OrgStaffPage           from './pages/org/OrgStaffPage'
import OrgSettingsPage        from './pages/org/OrgSettingsPage'
import OrgTokenPage           from './pages/org/OrgTokenPage'
import ViewAsBanner           from './components/ViewAsBanner'
import SecurityPage           from './pages/SecurityPage'
import FaqPage                from './pages/FaqPage'
import NotFoundPage           from './pages/NotFoundPage'
import LegalDocumentsPage     from './pages/sections/LegalDocumentsPage'
import FinancialAffairsPage   from './pages/sections/FinancialAffairsPage'
import DigitalLifePage        from './pages/sections/DigitalLifePage'
import FuneralWishesPage      from './pages/sections/FuneralWishesPage'
import DoctorsPage            from './pages/sections/DoctorsPage'
import MedicalRecordsPage     from './pages/sections/MedicalRecordsPage'
import DonationBankPage       from './pages/sections/DonationBankPage'
import InsurancePage          from './pages/sections/InsurancePage'
import UnfinishedBusinessPage from './pages/sections/UnfinishedBusinessPage'
import LastMomentsPage        from './pages/sections/LastMomentsPage'
import PeopleToNotifyPage     from './pages/sections/PeopleToNotifyPage'
import PropertyPossessionsPage from './pages/sections/PropertyPossessionsPage'
import MessagesPage           from './pages/sections/MessagesPage'
import SongsThatDefineMePage      from './pages/sections/SongsThatDefineMePage'
import LifesWishesPage            from './pages/sections/LifesWishesPage'
import HouseholdInfoPage          from './pages/sections/HouseholdInfoPage'
import ChildrenDependantsPage     from './pages/sections/ChildrenDependantsPage'
import PetCarePage                from './pages/sections/PetCarePage'
import HowToBeRememberedPage      from './pages/sections/HowToBeRememberedPage'
import EmergencyContactPage       from './pages/sections/EmergencyContactPage'
import TrustedContactsPage        from './pages/sections/TrustedContactsPage'
import UpgradePage                from './pages/UpgradePage'
import WelcomeTrialPage           from './pages/WelcomeTrialPage'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Theme & font maps — applied by writing CSS variables onto <html>
// ---------------------------------------------------------------------------
// Card radius/border tokens: all existing themes get today's literal look
// (14px/10px, solid, neutral grey) explicitly, so switching between themes
// can't leave a previous theme's radius/border stuck (applyTheme only sets
// properties present in the incoming theme object, it doesn't clear ones a
// prior theme set - every theme must carry every key it might need to reset).
const DEFAULT_CARD_TOKENS = {
  '--card-radius': '14px', '--card-radius-sm': '10px',
  '--card-border-style': 'solid', '--card-border-color': '#E0DDD5',
  '--hero-fold-size': '0px',
  // Buttons/progress default to today's look: small radius, dark-ink fill.
  '--btn-radius': '6px',
  '--btn-cta-bg': 'var(--green-800)', '--btn-cta-color': '#fff', '--btn-cta-hover-bg': 'var(--green-900)',
  '--progress-fill': 'linear-gradient(90deg, var(--green-800), var(--green-600))',
  '--input-radius': '6px',
  // Dashboard group-card tints: today's colour-coded-by-category look.
  '--group-people-bg': '#F7EDE7', '--group-people-border': '#E4C8B4', '--group-people-icon': '#EDD8C8', '--group-people-pill': '#B87A50',
  '--group-legacy-bg': '#FBF5E4', '--group-legacy-border': '#E8D8A8', '--group-legacy-icon': '#F5EAC8', '--group-legacy-pill': '#C9A84C',
  '--group-wishes-bg': '#EEF4EE', '--group-wishes-border': '#C4DCC4', '--group-wishes-icon': '#D8ECD8', '--group-wishes-pill': '#5A9A5A',
  '--group-affairs-bg': '#EEEAE5', '--group-affairs-border': '#D4CCC4', '--group-affairs-icon': '#E0D8D0', '--group-affairs-pill': '#8A7A6A',
  '--group-pill-text': '#ffffff',
  // Landing-page hero tokens: default to today's exact look (transparent hero
  // panel, headings/lead/outline-button taking their normal colour from the
  // rest of the theme) via indirection to each element's existing default
  // variable, rather than a hardcoded hex, so every theme automatically
  // tracks its own green-900/green-800/text-muted. Explicit on every theme
  // (same reasoning as the card tokens above) so a theme switch can't leave
  // a previous theme's hero override stuck via applyTheme's additive
  // Object.entries().forEach.
  '--hero-bg': 'transparent',
  '--hero-heading-color': 'var(--green-900)',
  '--hero-outline-color': 'var(--green-800)',
  '--hero-lead-color': 'var(--text-muted)',
  // Heading display style (e.g. italic) — 'normal' everywhere except themes
  // that opt in.
  '--heading-style': 'normal',
  // Major page/section-title heading colour (SectionHero.jsx, DashboardPage's
  // hero heading, etc). Defaults to today's --green-900 for every existing
  // theme so this is a no-op visual change for them; only heirloom overrides
  // it below with a brighter mid-green.
  '--heading-color': 'var(--green-900)',
  // Per-theme typeface overrides for the Dashboard's headline/body/UI-chrome
  // text (used by the Storybook theme to pair Playfair Display/Lora/Inter).
  // Default to exactly what the Dashboard already renders today: headings
  // hardcode Georgia inline (unaffected by the separate admin font picker),
  // while body copy and UI chrome have no explicit font-family and simply
  // inherit body's --site-font. Explicit here (not left to a var() fallback)
  // so a theme switch away from Storybook can't leave its font choice stuck
  // (applyTheme only sets properties present in the incoming theme object).
  '--heading-font': "Georgia, 'Times New Roman', serif",
  '--body-font': 'inherit',
  '--ui-font': 'inherit',
}

const FONT_STACKS = {
  georgia:  "Georgia, 'Times New Roman', serif",
  lora:     "'Lora', Georgia, serif",
  inter:    "'Inter', system-ui, sans-serif",
  playfair: "'Playfair Display', Georgia, serif",
  merriweather: "'Merriweather', Georgia, serif",
  opensans: "'Open Sans', system-ui, sans-serif",
}

const THEME_VARS = {
  forest: {
    '--green-900': '#1A3D28', '--green-800': '#2D5A3D', '--green-700': '#3D7A53',
    '--green-600': '#4D9466', '--green-100': '#D6E8DC', '--green-50': '#F0F7F2',
    '--gold': '#C9904A', '--gold-light': '#E8B97A', '--gold-50': '#FDF6EC',
    '--parchment': '#F7F5F0', '--parchment-dark': '#EDE9DF',
    '--bs-primary': '#2D5A3D', '--bs-primary-rgb': '45, 90, 61',
    ...DEFAULT_CARD_TOKENS,
  },
  dusk: {
    '--green-900': '#1E2D4A', '--green-800': '#2A3F63', '--green-700': '#3A5280',
    '--green-600': '#4A659D', '--green-100': '#C8D5E8', '--green-50': '#EEF2F8',
    '--gold': '#B87333', '--gold-light': '#D4945A', '--gold-50': '#FBF2EA',
    '--parchment': '#F5F0E8', '--parchment-dark': '#E8E0D0',
    '--bs-primary': '#2A3F63', '--bs-primary-rgb': '42, 63, 99',
    ...DEFAULT_CARD_TOKENS,
  },
  terracotta: {
    '--green-900': '#3D2315', '--green-800': '#5C3520', '--green-700': '#7A4A2E',
    '--green-600': '#9A6040', '--green-100': '#E0C8B8', '--green-50': '#F5EDE6',
    '--gold': '#D4842A', '--gold-light': '#E8A85A', '--gold-50': '#FDF5EA',
    '--parchment': '#FAF7F2', '--parchment-dark': '#F0EAE0',
    '--bs-primary': '#5C3520', '--bs-primary-rgb': '92, 53, 32',
    ...DEFAULT_CARD_TOKENS,
  },
  // Three additional themes
  ocean: {
    '--green-900': '#0D3D56', '--green-800': '#175F7A', '--green-700': '#22809E',
    '--green-600': '#2DA0C2', '--green-100': '#BFE3EF', '--green-50': '#EAF6FA',
    '--gold': '#E6944A', '--gold-light': '#F0B47A', '--gold-50': '#FEF5EC',
    '--parchment': '#F5F9FA', '--parchment-dark': '#E0EDF2',
    '--bs-primary': '#175F7A', '--bs-primary-rgb': '23, 95, 122',
    ...DEFAULT_CARD_TOKENS,
  },
  rosegarden: {
    '--green-900': '#5C2D3C', '--green-800': '#7A3F52', '--green-700': '#9A5568',
    '--green-600': '#B87080', '--green-100': '#E8C8D0', '--green-50': '#F7EEF1',
    '--gold': '#C4976A', '--gold-light': '#D9B48E', '--gold-50': '#FDF6EE',
    '--parchment': '#FAF5F6', '--parchment-dark': '#F0E4E8',
    '--bs-primary': '#7A3F52', '--bs-primary-rgb': '122, 63, 82',
    ...DEFAULT_CARD_TOKENS,
  },
  midnight: {
    '--green-900': '#1A1A3E', '--green-800': '#2D2D6B', '--green-700': '#3D3D8A',
    '--green-600': '#5555A8', '--green-100': '#C8C8E8', '--green-50': '#EEEEF8',
    '--gold': '#B8963E', '--gold-light': '#D4B46A', '--gold-50': '#FBF6E8',
    '--parchment': '#F5F5FA', '--parchment-dark': '#E8E8F0',
    '--bs-primary': '#2D2D6B', '--bs-primary-rgb': '45, 45, 107',
    ...DEFAULT_CARD_TOKENS,
  },
  highcontrast: {
    '--green-900': '#111111', '--green-800': '#222222', '--green-700': '#444444',
    '--green-600': '#666666', '--green-100': '#CCCCCC', '--green-50': '#F0F0F0',
    '--gold': '#C05000', '--gold-light': '#E07030', '--gold-50': '#FFF5EE',
    '--parchment': '#FFFFFF', '--parchment-dark': '#F0F0F0',
    '--bs-primary': '#222222', '--bs-primary-rgb': '34, 34, 34',
    ...DEFAULT_CARD_TOKENS,
  },
  softmist: {
    '--green-900': '#4A5A65', '--green-800': '#6A7D8A', '--green-700': '#8A9DAA',
    '--green-600': '#AABBC8', '--green-100': '#D8E4EC', '--green-50': '#F0F4F7',
    '--gold': '#A89870', '--gold-light': '#C4B490', '--gold-50': '#F8F4EE',
    '--parchment': '#F8F9FA', '--parchment-dark': '#EEF1F4',
    '--bs-primary': '#6A7D8A', '--bs-primary-rgb': '106, 125, 138',
    ...DEFAULT_CARD_TOKENS,
  },
  // Keepsake — cream/walnut/marigold, matching the "Keepsake" style guide concept.
  // Card radius is larger and dashed rather than solid; see index.css's .card rule.
  keepsake: {
    '--green-900': '#2E2419', '--green-800': '#3A2E22', '--green-700': '#6b5a45',
    '--green-600': '#8a7560', '--green-100': '#E8DCC8', '--green-50': '#FAF3E8',
    '--gold': '#E0A438', '--gold-light': '#EBBE6A', '--gold-50': '#FDF3E0',
    '--parchment': '#FAF3E8', '--parchment-dark': '#F0E4D0',
    '--bs-primary': '#3A2E22', '--bs-primary-rgb': '58, 46, 34',
    '--card-radius': '26px', '--card-radius-sm': '16px',
    '--card-border-style': 'dashed', '--card-border-color': '#E8DCC8',
    '--hero-fold-size': '32px',
    '--terracotta': '#C97A56',
    '--btn-radius': '999px',
    '--btn-cta-bg': '#E0A438', '--btn-cta-color': '#3A2E22', '--btn-cta-hover-bg': '#C68A2E',
    '--progress-fill': '#C97A56',
    '--input-radius': '14px',
    // Keepsake style guide: every dashboard group card is plain white with the
    // same dashed cream border and a neutral icon circle, not colour-coded by category.
    '--group-people-bg': '#fff', '--group-people-border': '#E8DCC8', '--group-people-icon': '#F0EAE0', '--group-people-pill': '#EDE6D8',
    '--group-legacy-bg': '#fff', '--group-legacy-border': '#E8DCC8', '--group-legacy-icon': '#F0EAE0', '--group-legacy-pill': '#EDE6D8',
    '--group-wishes-bg': '#fff', '--group-wishes-border': '#E8DCC8', '--group-wishes-icon': '#F0EAE0', '--group-wishes-pill': '#EDE6D8',
    '--group-affairs-bg': '#fff', '--group-affairs-border': '#E8DCC8', '--group-affairs-icon': '#F0EAE0', '--group-affairs-pill': '#EDE6D8',
    '--group-pill-text': '#3A2E22',
    // Keepsake doesn't spread DEFAULT_CARD_TOKENS, so it needs its own
    // explicit resets for the hero/heading tokens too (see the comment on
    // DEFAULT_CARD_TOKENS above).
    '--hero-bg': 'transparent',
    '--hero-heading-color': 'var(--green-900)',
    '--hero-outline-color': 'var(--green-800)',
    '--hero-lead-color': 'var(--text-muted)',
    '--heading-style': 'normal',
    '--heading-color': 'var(--green-900)',
    // Keepsake doesn't spread DEFAULT_CARD_TOKENS, so (like the hero/heading
    // tokens above) it needs its own explicit reset for these too.
    '--heading-font': "Georgia, 'Times New Roman', serif",
    '--body-font': 'inherit',
    '--ui-font': 'inherit',
  },
  // Heirloom — dark forest-green landing hero with cream text, cream/parchment
  // dashboard with italic dark-green headings, and plain white group cards
  // with a subtle border and only a slight radius (deliberately NOT
  // Keepsake's dashed/26px treatment).
  heirloom: {
    '--green-900': '#14301F', '--green-800': '#1F4A30', '--green-700': '#2C6242',
    '--green-600': '#3D7C57', '--green-100': '#D9E6DC', '--green-50': '#F1F6F1',
    '--gold': '#B8863E', '--gold-light': '#D4A968', '--gold-50': '#FBF3E4',
    '--parchment': '#F1EAD9', '--parchment-dark': '#E4DAC0',
    '--bs-primary': '#14301F', '--bs-primary-rgb': '20, 48, 31',
    ...DEFAULT_CARD_TOKENS,
    // Plan/section cards: white, subtle warm border, only slightly rounded.
    '--card-radius': '8px', '--card-radius-sm': '6px',
    '--card-border-style': 'solid', '--card-border-color': '#E4DAC0',
    // Dashboard group cards: uniform white (not colour-coded by category),
    // same subtle border as the generic card style above.
    '--group-people-bg': '#fff', '--group-people-border': '#E4DAC0', '--group-people-icon': '#F1EAD9', '--group-people-pill': '#14301F',
    '--group-legacy-bg': '#fff', '--group-legacy-border': '#E4DAC0', '--group-legacy-icon': '#F1EAD9', '--group-legacy-pill': '#14301F',
    '--group-wishes-bg': '#fff', '--group-wishes-border': '#E4DAC0', '--group-wishes-icon': '#F1EAD9', '--group-wishes-pill': '#14301F',
    '--group-affairs-bg': '#fff', '--group-affairs-border': '#E4DAC0', '--group-affairs-icon': '#F1EAD9', '--group-affairs-pill': '#14301F',
    '--group-pill-text': '#ffffff',
    // Landing hero: dark forest-green background, light cream text, scoped
    // to LandingPage.jsx's .landing-hero only (see index.css).
    '--hero-bg': '#14301F',
    '--hero-heading-color': '#F1EAD9',
    '--hero-outline-color': '#F1EAD9',
    '--hero-lead-color': '#F1EAD9',
    // Section/group headings and page titles rendered in italic (they
    // already inherit the selected FONT and use var(--green-900) for
    // colour, so italic is the only new treatment needed here).
    '--heading-style': 'italic',
    // Major page/section-title headings: --green-900 (#14301F) reads as
    // near-black rather than clearly green at this darkness, so heirloom
    // uses its own --green-700 (a richer mid-green) for headings specifically
    // instead of the shared default above.
    '--heading-color': '#2C6242',
  },
  // Storybook — the Dashboard-interior half of "The Keepsake Direction"
  // storyboard (IDEA-10): deep forest ink on parchment, a muted brass accent
  // (not a brighter gold), and a wine/burgundy accent used sparingly - only
  // on "Your People" - for the one thing the storyboard calls out as
  // genuinely different in kind (an emergency contact, a recorded voice),
  // rather than spreading it across every card. Also the first theme to pair
  // three distinct typefaces on the Dashboard - Playfair Display for
  // headline-level text, Lora for body/descriptive copy, Inter for UI chrome
  // - via the --heading-font/--body-font/--ui-font tokens above, reusing the
  // app's existing FONT_STACKS entries rather than hardcoding new font
  // strings. This is independent of whatever single font the separate admin
  // font picker has selected (see DEFAULT_CARD_TOKENS's reset of the same
  // three keys, so switching away from Storybook can't leave a stuck font).
  storybook: {
    '--green-900': '#14301F', '--green-800': '#1F4A30', '--green-700': '#2F5A3C',
    '--green-600': '#3D7050', '--green-100': '#D9E6DC', '--green-50': '#F1F6F1',
    '--gold': '#A47C3E', '--gold-light': '#C4A06C', '--gold-50': '#FBF3E4',
    '--parchment': '#F1EAD9', '--parchment-dark': '#E4DAC0',
    '--bs-primary': '#1F4A30', '--bs-primary-rgb': '31, 74, 48',
    ...DEFAULT_CARD_TOKENS,
    '--wine': '#6B2A38',
    '--card-radius': '10px', '--card-radius-sm': '8px',
    '--card-border-style': 'solid', '--card-border-color': '#E4DAC0',
    '--btn-radius': '3px',
    '--btn-cta-bg': '#A47C3E', '--btn-cta-color': '#14301F', '--btn-cta-hover-bg': '#8C6530',
    '--progress-fill': 'linear-gradient(90deg, #A47C3E, #2F5A3C)',
    '--input-radius': '6px',
    // Dashboard group cards: plain white with the storyboard's warm
    // parchment-dark border, matching every group - except "Your People",
    // which alone gets the wine accent described above.
    '--group-legacy-bg': '#fff', '--group-legacy-border': '#E4DAC0', '--group-legacy-icon': '#F3E9D4', '--group-legacy-pill': '#A47C3E',
    '--group-people-bg': '#fff', '--group-people-border': '#E4DAC0', '--group-people-icon': '#F3E3E6', '--group-people-pill': '#6B2A38',
    '--group-wishes-bg': '#fff', '--group-wishes-border': '#E4DAC0', '--group-wishes-icon': '#E4EDE6', '--group-wishes-pill': '#2F5A3C',
    '--group-affairs-bg': '#fff', '--group-affairs-border': '#E4DAC0', '--group-affairs-icon': '#EDEAE0', '--group-affairs-pill': '#14301F',
    '--group-pill-text': '#ffffff',
    '--hero-bg': 'transparent',
    '--hero-heading-color': 'var(--green-900)',
    '--hero-outline-color': 'var(--green-800)',
    '--hero-lead-color': 'var(--text-muted)',
    '--heading-style': 'italic',
    '--heading-font': FONT_STACKS.playfair,
    '--body-font': FONT_STACKS.lora,
    '--ui-font': FONT_STACKS.inter,
  },
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
                { label: 'Terms of Service',  href: '/terms', internal: true },
                { label: 'Accessibility',     href: '/accessibility', internal: true },
                { label: 'Security',          href: '/security', internal: true },
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

            <div className="mt-3">
              <Link to="/report-passing"
                  style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--green-800)', textDecoration: 'underline' }}>
                Need to report a passing?
              </Link>
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
function ProtectedRoute({ children, adminOnly = false, allowRoles = null }) {
  const { user, isLoggedIn } = useAuth()
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  if (adminOnly && !user?.is_admin) return <Navigate to="/profile" replace />
  if (allowRoles && !allowRoles.includes(user?.org_role)) return <Navigate to="/profile" replace />
  return children
}

function NavBar() {
  const { user, isLoggedIn, isViewAs, logout, sessionVerified } = useAuth()
  const { siteName, logoUrl } = useBranding()
  const { isPremium } = useSubscription()
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
            {/* Wait on sessionVerified before rendering the logged-in nav at
                all: a cached `user` object can be stale (a dead session left
                over from an earlier tab/login that never called logout()),
                and rendering Premium/admin nav items off it before the
                mount-time session check resolves produces a brief flash of
                privileged-looking UI that then disappears once corrected.
                Route access itself (ProtectedRoute) is unaffected - it still
                uses the un-gated isLoggedIn() so a real logged-in user is
                never bounced to /login while this resolves. */}
            {isLoggedIn() && sessionVerified ? (
              <>
                {!user?.is_admin && !user?.org_role && (
                  <>
                    <Nav.Link as={Link} to="/profile">My Plans</Nav.Link>
                    {!isViewAs && <Nav.Link as={Link} to="/profile/settings">My Profile</Nav.Link>}
                    {!isViewAs && !isPremium && (
                      <span
                        title="You're on the free plan, upgrade for full access to every section"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em',
                          color: '#fff', background: 'rgba(255,255,255,0.18)',
                          borderRadius: 12, padding: '4px 11px', marginRight: 4,
                        }}
                      >
                        FREE PLAN
                      </span>
                    )}
                    {!isViewAs && !isPremium && (
                      <Nav.Link as={Link} to="/upgrade" style={{ fontWeight: 600, color: 'var(--gold)' }}>
                        Upgrade
                      </Nav.Link>
                    )}
                    {!isViewAs && isPremium && (
                      <span
                        title="You have full access to every section"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em',
                          color: 'var(--green-900)', background: 'var(--gold-light, #E8B97A)',
                          borderRadius: 12, padding: '4px 11px', marginRight: 4,
                        }}
                      >
                        ✨ PREMIUM
                      </span>
                    )}
                    {!isViewAs && (
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
                    )}
                  </>
                )}
                {!!user?.org_role && !user?.is_admin && (
                  <>
                    <Nav.Link as={Link} to="/org">Dashboard</Nav.Link>
                    <Nav.Link as={Link} to="/org/customers">Customers</Nav.Link>
                    {user.org_role === 'org_admin' && <Nav.Link as={Link} to="/org/staff">Staff</Nav.Link>}
                    <Nav.Link as={Link} to="/org/settings">Settings</Nav.Link>
                  </>
                )}
                {!!user?.is_admin && <Nav.Link as={Link} to="/admin">Admin</Nav.Link>}
                {!!user?.is_admin && <Nav.Link as={Link} to="/profile">My Account</Nav.Link>}
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

// ---------------------------------------------------------------------------
// Unverified email banner — shown to logged-in users who haven't verified yet
// ---------------------------------------------------------------------------
function UnverifiedEmailBanner() {
  const { user } = useAuth()
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [resendError, setResendError] = useState('')

  if (!user || user.is_admin || user.email_verified !== 0) return null

  const handleResend = async () => {
    setSending(true)
    setResendError('')
    try {
      await axios.post(`${API}/auth/resend-verification`)
      setSent(true)
    } catch (err) {
      setResendError(err.response?.data?.error || 'Could not resend. Please try again shortly.')
    }
    setSending(false)
  }

  return (
    <div style={{
      background: '#FFF7ED', borderBottom: '1px solid #FED7AA',
      padding: '10px 0', fontSize: '0.88rem',
    }}>
      <div className="container" style={{ maxWidth: 960, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: '#92400E' }}>
          📧 Please verify your email address <strong>({user.email})</strong> to fully activate your account.
        </span>
        {sent ? (
          <span style={{ color: '#065F46', fontWeight: 600 }}>Verification email sent. Please check your inbox.</span>
        ) : (
          <button
            className="btn btn-sm"
            style={{ background: '#C9904A', color: '#fff', border: 'none', padding: '3px 12px', fontSize: '0.82rem' }}
            onClick={handleResend}
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Resend verification email'}
          </button>
        )}
        {resendError && <span style={{ color: '#991B1B', fontSize: '0.82rem' }}>{resendError}</span>}
      </div>
    </div>
  )
}

// Persistent, non-blocking nudge for whichever additional recovery signal the
// site's forgot-password flow actually requires (date of birth or a security
// question) but this specific user hasn't set up - without it they'd be
// silently unable to self-serve a password reset (SEC-05, follows from
// SEC-04's "always email + an optional additional check" design). Derived
// entirely from this user's own /users/me + the public /settings - no new
// server endpoint, so there's no way for it to expose anyone else's status.
// Re-checks on every route change so it clears the moment the gap is fixed,
// without needing a dismiss button that could hide a real gap indefinitely.
function RecoveryCompletionBanner() {
  const { user } = useAuth()
  const location = useLocation()
  const [gap, setGap] = useState(null) // 'dob' | 'security_question' | null

  useEffect(() => {
    if (!user || user.is_admin) return
    Promise.all([
      axios.get(`${API}/settings`),
      axios.get(`${API}/users/me`),
    ]).then(([settingsRes, meRes]) => {
      const method = settingsRes.data.password_reset_method || 'email'
      if (method === 'dob' && !meRes.data.date_of_birth) setGap('dob')
      else if (method === 'security_question' && !meRes.data.has_security_question) setGap('security_question')
      else setGap(null)
    }).catch(() => setGap(null))
  }, [user, location.pathname])

  if (!user || user.is_admin || !gap) return null

  const message = gap === 'dob'
    ? "This site's password reset also asks for your date of birth, but yours isn't on file."
    : "This site's password reset also asks for your security question, but you haven't set one up."

  return (
    <div style={{
      background: '#FFF7ED', borderBottom: '1px solid #FED7AA',
      padding: '10px 0', fontSize: '0.88rem',
    }}>
      <div className="container" style={{ maxWidth: 960, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: '#92400E' }}>
          🔑 {message} Without it, you could be locked out if you ever forget your password.
        </span>
        <Link to="/profile/settings"
          className="btn btn-sm"
          style={{ background: '#C9904A', color: '#fff', border: 'none', padding: '3px 12px', fontSize: '0.82rem', textDecoration: 'none' }}>
          Complete my profile
        </Link>
      </div>
    </div>
  )
}

// Non-blocking nudge shown when the admin has published a newer Privacy
// Policy or Terms of Service version than this user last consented to
// (FEAT-04/05 item 4). Re-checks on every route change, same pattern as
// RecoveryCompletionBanner above, and clears itself the moment /legal/consent
// succeeds rather than needing a dismiss button that could hide a real
// outstanding re-consent indefinitely.
function LegalReconsentBanner() {
  const { user } = useAuth()
  const location = useLocation()
  const [needsReconsent, setNeedsReconsent] = useState(false)
  const [agreeing, setAgreeing] = useState(false)
  const [error, setError] = useState('')

  const checkStatus = () => {
    if (!user) return
    axios.get(`${API}/legal/status`)
      .then(r => setNeedsReconsent(!!r.data.needs_reconsent))
      .catch(() => setNeedsReconsent(false))
  }

  useEffect(checkStatus, [user, location.pathname])

  if (!user || !needsReconsent) return null

  // Previously had no .catch() at all - a failed request left the banner
  // stuck forever with zero feedback, indistinguishable from the button
  // doing nothing (OPS-09). needsReconsent is only ever cleared on a
  // confirmed server success, never optimistically.
  const handleAgree = () => {
    setAgreeing(true)
    setError('')
    axios.post(`${API}/legal/consent`)
      .then(() => setNeedsReconsent(false))
      .catch(err => setError(err.response?.data?.error || "Couldn't save your agreement. Please try again."))
      .finally(() => setAgreeing(false))
  }

  return (
    <div style={{
      background: '#FFF7ED', borderBottom: '1px solid #FED7AA',
      padding: '10px 0', fontSize: '0.88rem',
    }}>
      <div className="container" style={{ maxWidth: 960, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: '#92400E' }}>
          📄 We've updated our <Link to="/privacy" style={{ color: '#92400E', fontWeight: 600 }}>Privacy Policy</Link> and/or <Link to="/terms" style={{ color: '#92400E', fontWeight: 600 }}>Terms of Service</Link>. Please review and re-confirm your agreement.
        </span>
        <button
          className="btn btn-sm"
          style={{ background: '#C9904A', color: '#fff', border: 'none', padding: '3px 12px', fontSize: '0.82rem' }}
          onClick={handleAgree}
          disabled={agreeing}
        >
          {agreeing ? 'Saving…' : 'I agree'}
        </button>
        {error && <span style={{ color: '#B91C1C', fontSize: '0.82rem' }}>{error}</span>}
      </div>
    </div>
  )
}

function AppContent() {
  const { setBranding } = useBranding()
  const [maintenance, setMaintenance] = useState(false)

  // Global axios interceptor — catches maintenance mode 503 from the API
  useEffect(() => {
    const id = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 503 && err.response?.data?.maintenance) {
          setMaintenance(true)
        }
        return Promise.reject(err)
      }
    )
    return () => axios.interceptors.response.eject(id)
  }, [])

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

  if (maintenance) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--parchment)', padding: 24,
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔧</div>
        <h2 style={{ color: 'var(--heading-color, var(--green-900))', fontFamily: 'Georgia, serif', marginBottom: 12 }}>
          We'll be back shortly
        </h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
          In Good Hands is temporarily offline for maintenance.
          We're working to make things better for you and will be back very soon.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          If you need to reach us, contact us at{' '}
          <a href="mailto:support@ingoodhands.ca" style={{ color: 'var(--green-800)' }}>
            support@ingoodhands.ca
          </a>
        </p>
      </div>
    </div>
  )

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
      <ViewAsBanner />
      <VaultSessionExtendPrompt />
      <UnverifiedEmailBanner />
      <RecoveryCompletionBanner />
      <LegalReconsentBanner />
      <Container id="main-content" className="py-4" style={{ flex: 1 }}>
        <Routes>
          <Route path="/"                  element={<LandingPage />} />
          <Route path="/privacy"           element={<PrivacyPage />} />
          <Route path="/delete-account"    element={<DeleteAccountPage />} />
          <Route path="/terms"             element={<TermsPage />} />
          <Route path="/accessibility"     element={<AccessibilityPage />} />
          <Route path="/security"          element={<SecurityPage />} />
          <Route path="/faq"               element={<FaqPage />} />
          <Route path="/pricing"           element={<PricingPage />} />
          <Route path="/login"             element={<LoginPage />} />
          <Route path="/register"          element={<RegisterPage />} />
          <Route path="/register/organization" element={<RegisterOrganizationPage />} />
          <Route path="/register/organization/complete/:token" element={<OrgAdminInviteCompletePage />} />
          <Route path="/forgot-password"   element={<ForgotPasswordPage />} />
          <Route path="/reset-password"    element={<ResetPasswordPage />} />
          <Route path="/report-passing"    element={<ReportDeathPage />} />
          <Route path="/verify-email"      element={<VerifyEmailPage />} />

          {/* Dashboard */}
          <Route path="/profile" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

          {/* User profile / settings */}
          <Route path="/profile/settings" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          {/* Public access page — no auth required */}
          <Route path="/access/:token" element={<AccessPage />} />
          {/* Public ad-hoc section-share view — no auth required */}
          <Route path="/shared/:token" element={<SharedSectionPage />} />

          {/* Sections — Phase 1 */}
          <Route path="/sections/legal-documents"      element={<ProtectedRoute><LegalDocumentsPage /></ProtectedRoute>} />
          <Route path="/sections/financial-affairs"    element={<ProtectedRoute><FinancialAffairsPage /></ProtectedRoute>} />
          <Route path="/sections/digital-life"         element={<ProtectedRoute><DigitalLifePage /></ProtectedRoute>} />
          <Route path="/sections/funeral-wishes"       element={<ProtectedRoute><FuneralWishesPage /></ProtectedRoute>} />
          <Route path="/sections/doctors"              element={<ProtectedRoute><DoctorsPage /></ProtectedRoute>} />
          <Route path="/sections/medical-records"      element={<ProtectedRoute><MedicalRecordsPage /></ProtectedRoute>} />
          <Route path="/sections/donation-bank"        element={<ProtectedRoute><DonationBankPage /></ProtectedRoute>} />
          <Route path="/sections/people-to-notify"     element={<ProtectedRoute><PeopleToNotifyPage /></ProtectedRoute>} />
          <Route path="/sections/property-possessions" element={<ProtectedRoute><PropertyPossessionsPage /></ProtectedRoute>} />
          <Route path="/sections/messages"             element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/sections/songs-that-define-me" element={<ProtectedRoute><SongsThatDefineMePage /></ProtectedRoute>} />
          <Route path="/sections/lifes-wishes"         element={<ProtectedRoute><LifesWishesPage /></ProtectedRoute>} />
          <Route path="/sections/unfinished-business"  element={<ProtectedRoute><UnfinishedBusinessPage /></ProtectedRoute>} />
          <Route path="/sections/insurance"            element={<ProtectedRoute><InsurancePage /></ProtectedRoute>} />
          <Route path="/sections/last-moments"         element={<ProtectedRoute><LastMomentsPage /></ProtectedRoute>} />

          <Route path="/sections/household-info"        element={<ProtectedRoute><HouseholdInfoPage /></ProtectedRoute>} />
          <Route path="/sections/children-dependants"  element={<ProtectedRoute><ChildrenDependantsPage /></ProtectedRoute>} />
          <Route path="/sections/pet-care"             element={<ProtectedRoute><PetCarePage /></ProtectedRoute>} />
          <Route path="/sections/how-to-be-remembered" element={<ProtectedRoute><HowToBeRememberedPage /></ProtectedRoute>} />
          <Route path="/sections/emergency-contact"    element={<ProtectedRoute><EmergencyContactPage /></ProtectedRoute>} />
          <Route path="/sections/trusted-contacts"     element={<ProtectedRoute><TrustedContactsPage /></ProtectedRoute>} />

          {/* Export */}
          <Route path="/export" element={<ProtectedRoute><ExportPage /></ProtectedRoute>} />

          {/* Upgrade */}
          <Route path="/upgrade" element={<ProtectedRoute><UpgradePage /></ProtectedRoute>} />
          <Route path="/welcome-trial" element={<ProtectedRoute><WelcomeTrialPage /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />

          {/* Organization portal */}
          <Route path="/org"           element={<ProtectedRoute allowRoles={['org_admin', 'org_staff']}><OrgDashboardPage /></ProtectedRoute>} />
          <Route path="/org/customers" element={<ProtectedRoute allowRoles={['org_admin', 'org_staff']}><OrgCustomersPage /></ProtectedRoute>} />
          <Route path="/org/staff"     element={<ProtectedRoute allowRoles={['org_admin']}><OrgStaffPage /></ProtectedRoute>} />
          <Route path="/org/settings"  element={<ProtectedRoute allowRoles={['org_admin', 'org_staff']}><OrgSettingsPage /></ProtectedRoute>} />
          <Route path="/org/link/:token" element={<OrgTokenPage />} />

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
        <VaultSessionProvider>
          <SubscriptionProvider>
            <AppContent />
          </SubscriptionProvider>
        </VaultSessionProvider>
      </AuthProvider>
    </BrandingProvider>
  )
}
