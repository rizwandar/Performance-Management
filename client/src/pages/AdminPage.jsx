import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Form, Button, Alert, Spinner, Badge, Row, Col, Modal, Dropdown, Table } from 'react-bootstrap'
import axios from 'axios'
import { applyTheme, applyFont } from '../App'
import { useBranding } from '../context/BrandingContext'
import PasswordInput from '../components/PasswordInput'
import OrganizationsPanel from './admin/OrganizationsPanel'
import LegalPanel from './admin/LegalPanel'
import VaultSecurityPanel from './admin/VaultSecurityPanel'
import { formatPhone } from '@in-good-hands/shared/format'

const API = import.meta.env.VITE_API_URL
const USERS_PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Theme & font definitions
// ---------------------------------------------------------------------------
const THEMES = [
  { id: 'forest',     name: 'Forest',      description: 'Warm forest green & gold',          swatch: ['#1A3D28', '#C9904A', '#F7F5F0'] },
  { id: 'dusk',       name: 'Dusk',        description: 'Navy blue & copper',                swatch: ['#1E2D4A', '#B87333', '#F5F0E8'] },
  { id: 'terracotta', name: 'Terracotta',  description: 'Warm brown & amber',                swatch: ['#3D2315', '#D4842A', '#FAF7F2'] },
  { id: 'ocean',      name: 'Ocean',       description: 'Deep teal & soft amber',            swatch: ['#0D3D56', '#E6944A', '#F5F9FA'] },
  { id: 'rosegarden', name: 'Rose Garden', description: 'Dusty rose & warm gold',            swatch: ['#5C2D3C', '#C4976A', '#FAF5F6'] },
  { id: 'midnight',    name: 'Midnight',       description: 'Deep indigo & antique gold',     swatch: ['#1A1A3E', '#B8963E', '#F5F5FA'] },
  { id: 'highcontrast', name: 'High Contrast', description: 'Maximum contrast, accessibility-first', swatch: ['#111111', '#C05000', '#FFFFFF'] },
  { id: 'softmist',    name: 'Soft Mist',      description: 'Very low contrast, gentle and calm',    swatch: ['#4A5A65', '#A89870', '#F8F9FA'] },
  { id: 'keepsake',    name: 'Keepsake',       description: 'Cream, walnut & marigold, like a treasured box of letters', swatch: ['#3A2E22', '#E0A438', '#FAF3E8'] },
  { id: 'heirloom',    name: 'Heirloom',       description: 'Dark forest-green landing page, cream dashboard with italic headings, and plain white bordered cards', swatch: ['#14301F', '#F1EAD9', '#E4DAC0'] },
  { id: 'storybook',   name: 'Storybook',      description: 'Deepened forest, muted brass & a wine accent, with Playfair Display headings and Lora body copy on the Dashboard', swatch: ['#14301F', '#A47C3E', '#6B2A38'] },
]

const FONTS = [
  { id: 'georgia',      name: 'Georgia',          description: 'Classic serif, warm and traditional',   sample: 'In Good Hands', stack: "Georgia, serif" },
  { id: 'lora',         name: 'Lora',             description: 'Literary serif, elegant and refined',   sample: 'In Good Hands', stack: "'Lora', Georgia, serif" },
  { id: 'playfair',     name: 'Playfair Display', description: 'Editorial serif, dramatic and refined', sample: 'In Good Hands', stack: "'Playfair Display', Georgia, serif" },
  { id: 'merriweather', name: 'Merriweather',     description: 'Warm serif, comfortable to read',       sample: 'In Good Hands', stack: "'Merriweather', Georgia, serif" },
  { id: 'inter',        name: 'Inter',            description: 'Modern sans-serif, clean and legible',  sample: 'In Good Hands', stack: "'Inter', sans-serif" },
  { id: 'opensans',     name: 'Open Sans',        description: 'Friendly sans-serif, approachable',     sample: 'In Good Hands', stack: "'Open Sans', sans-serif" },
]

const ICON_SETS = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Familiar, universally recognized symbols',
    preview: ['📄', '💼', '💻', '🕊️', '💌', '🎵'],
  },
  {
    id: 'heritage',
    name: 'Heritage',
    description: 'Traditional, warm and timeless feel',
    preview: ['📜', '🪙', '🔐', '🕯️', '✉️', '🎼'],
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Clean, contemporary icons',
    preview: ['📋', '💳', '📱', '🕊️', '💬', '🎸'],
  },
]

const SECTION_LABELS = {
  legal_documents:     'Personal & Legal',
  financial_items:     'Financial Affairs',
  digital_credentials: 'Digital Life',
  funeral_wishes:      'Funeral Wishes',
  doctors:             'Doctors',
  medical_records:     'Medical Records',
  people_to_notify:    'People to Notify',
  property_items:      'Property',
  personal_messages:   'Messages',
  songs_that_define_me:'Songs',
  life_wishes:         "My Bucket List",
}

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------
const TABS = ['Overview', 'Users', 'Activity', 'Vault Security', 'Appearance', 'Branding', 'Organizations', 'Settings', 'Legal', 'Marketing', 'Versions', 'Security', 'Contact', 'App Blueprint']
// Overview stays as its own pinned button; everything else lives in the "More sections" dropdown.
const DROPDOWN_TABS = TABS.filter(t => t !== 'Overview')

const FINDING_CATEGORIES = ['authorization', 'injection', 'xss', 'secrets', 'infrastructure', 'session', 'documentation', 'ci-cd', 'other']
const FINDING_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical']
const FINDING_STATUSES   = ['open', 'monitoring', 'resolved', 'accepted_risk']
const SEVERITY_COLOR = { info: 'secondary', low: 'success', medium: 'warning', high: 'danger', critical: 'dark' }
const STATUS_COLOR   = { open: 'danger', monitoring: 'warning', resolved: 'success', accepted_risk: 'secondary' }

const VERSION_MODULES = [
  { id: 'client',     label: 'Client App' },
  { id: 'admin',      label: 'Admin Panel' },
  { id: 'org_portal', label: 'Org / Funeral Home Portal' },
]

const ACTION_LABELS = {
  login_success:   { label: 'Login',           color: 'var(--green-800)' },
  login_failed:    { label: 'Failed login',     color: '#DC2626' },
  logout:          { label: 'Logout',           color: 'var(--text-muted)' },
  register:        { label: 'Registration',     color: 'var(--green-700)' },
  password_changed:{ label: 'Password changed', color: '#B45309' },
  password_reset:  { label: 'Password reset',   color: '#B45309' },
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Branding Panel
// ---------------------------------------------------------------------------
const PRESET_LOGOS = [
  { id: 'hands-heart',   name: 'Hands and Heart',  desc: 'Cupped hands holding a heart (default)' },
  { id: 'leaf-heart',    name: 'Leaf and Heart',    desc: 'A heart with a new leaf sprouting upward' },
  { id: 'shield-heart',  name: 'Shield and Heart',  desc: 'A protective shield carrying a heart' },
  { id: 'infinity-heart',name: 'Infinity Heart',    desc: 'An infinity loop with a heart at its center' },
  { id: 'tree',          name: 'Tree of Life',      desc: 'A tree with roots and a heart in the canopy' },
  { id: 'dove',          name: 'Dove',              desc: 'A gentle dove carrying a small heart' },
  { id: 'book',          name: 'Open Book',         desc: 'An open book, a life story above a heart' },
  { id: 'candle',        name: 'Candle Flame',      desc: 'A candle whose flame is heart-shaped' },
  { id: 'feather',       name: 'Feather',           desc: 'A graceful quill feather with a gold heart' },
  { id: 'circle-hearts', name: 'Circle of Hearts',  desc: 'Three hearts joined in a circle' },
]

const PRESET_NAMES = [
  'In Good Hands',
  'Forever Remembered',
  'My Legacy',
  'Lasting Wishes',
  'Gentle Farewell',
  'My Final Gift',
  'Cherished Plans',
  'Your Legacy',
  "Life's Chapter",
  'Peaceful Plans',
]

function BrandingPanel({ showAlert }) {
  const { setBranding } = useBranding()
  const [loading, setLoading]   = useState(true)

  // Name state
  const [selectedName, setSelectedName]   = useState('In Good Hands')
  const [customName, setCustomName]       = useState('')
  const [useCustomName, setUseCustomName] = useState(false)

  // Logo state
  const [selectedLogo, setSelectedLogo]   = useState('hands-heart')
  const [logoType, setLogoType]           = useState('preset')
  const [customLogoFile, setCustomLogoFile] = useState(null)
  const [customLogoPreview, setCustomLogoPreview] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving]               = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    axios.get(`${import.meta.env.VITE_API_URL}/settings`).then(r => {
      const s = r.data
      const name = s.site_name || 'In Good Hands'
      if (PRESET_NAMES.includes(name)) {
        setSelectedName(name)
        setUseCustomName(false)
      } else {
        setCustomName(name)
        setUseCustomName(true)
      }
      setSelectedLogo(s.site_logo_preset || 'hands-heart')
      setLogoType(s.site_logo_type || 'preset')
      if (s.site_logo_type === 'custom' && s.site_logo_url) {
        setCustomLogoPreview(s.site_logo_url)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCustomLogoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setCustomLogoPreview(ev.target.result)
    reader.readAsDataURL(file)
    setLogoType('custom')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const activeName = useCustomName ? customName.trim() : selectedName
      if (!activeName) { showAlert('danger', 'Please enter or select a site name.'); setSaving(false); return }

      // Upload custom logo first if a new file was selected
      let finalLogoType = logoType
      let finalLogoPreset = selectedLogo
      if (logoType === 'custom' && customLogoFile) {
        setUploadingLogo(true)
        const fd = new FormData()
        fd.append('logo', customLogoFile)
        const r = await axios.post(`${import.meta.env.VITE_API_URL}/admin/branding/logo`, fd)
        setCustomLogoPreview(r.data.logo_url)
        setCustomLogoFile(null)
        setUploadingLogo(false)
        finalLogoType = 'custom'
      }

      // Save name + logo preset/type
      await axios.post(`${import.meta.env.VITE_API_URL}/admin/branding`, {
        site_name:        activeName,
        site_logo_type:   finalLogoType,
        site_logo_preset: finalLogoPreset,
      })

      // Update BrandingContext so changes are visible immediately across the site
      const newLogoUrl = finalLogoType === 'custom'
        ? customLogoPreview
        : `/logos/${finalLogoPreset}.svg`

      setBranding({ siteName: activeName, logoUrl: newLogoUrl })
      showAlert('success', 'Branding saved. Changes are live across the site.')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Could not save branding.')
      setUploadingLogo(false)
    }
    setSaving(false)
  }

  const activeLogoUrl = logoType === 'custom' && customLogoPreview
    ? customLogoPreview
    : `/logos/${selectedLogo}.svg`

  const activeName = useCustomName ? (customName || 'In Good Hands') : selectedName

  const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 20 }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  return (
    <div>
      {/* Live preview */}
      <div style={{ ...card, background: 'var(--green-50)', border: '1px solid var(--green-100)', marginBottom: 24 }}>
        <p className="text-muted small mb-3" style={{ fontWeight: 600, color: 'var(--green-900)' }}>Live preview</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={activeLogoUrl} alt={activeName} width="52" height="52"
            style={{ borderRadius: 8, border: '1px solid var(--border)', padding: 4, background: '#fff' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--green-900)', fontFamily: 'Georgia, serif' }}>{activeName}</div>
            <div className="text-muted small">This is how your site name and logo appear in the navigation bar and throughout the site.</div>
          </div>
        </div>
      </div>

      {/* Site name */}
      <div style={card}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Site Name</h6>
        <p className="text-muted small mb-4">Choose a preset name or enter your own. This appears in the navigation, landing page, emails, and PDFs.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {PRESET_NAMES.map(name => (
            <button key={name}
              onClick={() => { setSelectedName(name); setUseCustomName(false) }}
              style={{
                padding: '7px 16px', borderRadius: 20, fontSize: '0.87rem', cursor: 'pointer',
                border: !useCustomName && selectedName === name ? '2px solid var(--green-800)' : '1px solid var(--border)',
                background: !useCustomName && selectedName === name ? 'var(--green-800)' : 'transparent',
                color: !useCustomName && selectedName === name ? '#fff' : 'var(--text)',
                fontFamily: 'inherit',
              }}>
              {name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', border: '2px solid',
            borderColor: useCustomName ? 'var(--green-800)' : 'var(--border)',
            background: useCustomName ? 'var(--green-800)' : 'transparent',
            cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setUseCustomName(true)}>
            {useCustomName && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
          </div>
          <span className="small" style={{ color: 'var(--text)', cursor: 'pointer' }} onClick={() => setUseCustomName(true)}>
            Use a custom name
          </span>
        </div>
        {useCustomName && (
          <Form.Control
            type="text"
            placeholder="Enter your custom site name"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            style={{ maxWidth: 360 }}
          />
        )}
      </div>

      {/* Logo selection */}
      <div style={card}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Site Logo</h6>
        <p className="text-muted small mb-4">
          Choose one of the 10 designed logos or upload your own. The logo appears in the navigation bar, landing page, and exported PDFs.
        </p>

        {/* Preset grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, marginBottom: 24 }}>
          {PRESET_LOGOS.map(logo => (
            <div key={logo.id}
              title={logo.desc}
              onClick={() => { setSelectedLogo(logo.id); setLogoType('preset') }}
              style={{
                border: logoType === 'preset' && selectedLogo === logo.id ? '2px solid var(--green-800)' : '2px solid var(--border)',
                borderRadius: 10, padding: '12px 8px', cursor: 'pointer', textAlign: 'center',
                background: logoType === 'preset' && selectedLogo === logo.id ? 'var(--green-50)' : '#fff',
                transition: 'border-color 0.15s, background 0.15s',
              }}>
              <img src={`/logos/${logo.id}.svg`} alt={logo.name} width="56" height="56"
                style={{ display: 'block', margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--green-900)', lineHeight: 1.3 }}>{logo.name}</div>
              {logoType === 'preset' && selectedLogo === logo.id && (
                <div style={{ fontSize: '0.7rem', color: 'var(--green-800)', marginTop: 4, fontWeight: 700 }}>Selected</div>
              )}
            </div>
          ))}
        </div>

        {/* Custom upload */}
        <div style={{
          border: logoType === 'custom' ? '2px solid var(--green-800)' : '2px dashed var(--border)',
          borderRadius: 10, padding: '20px', background: logoType === 'custom' ? 'var(--green-50)' : '#fff',
        }}>
          <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4, fontSize: '0.9rem' }}>Upload a custom logo</p>
          <p className="text-muted small mb-3" style={{ lineHeight: 1.6 }}>
            For best results, upload a square SVG or PNG with a transparent background.
            Recommended size: <strong>200 x 200 pixels minimum</strong>, ideally at <strong>400 x 400 px</strong> or higher for crisp display on high-resolution screens.
            Maximum file size: 2 MB. Accepted formats: SVG, PNG, JPEG, WebP.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {logoType === 'custom' && customLogoPreview && (
              <img src={customLogoPreview} alt="Custom logo preview" width="64" height="64"
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 4, background: '#fff', objectFit: 'contain' }} />
            )}
            <div>
              <input ref={fileInputRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp"
                style={{ display: 'none' }} onChange={handleFileChange} />
              <Button variant="outline-secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                {logoType === 'custom' && customLogoPreview ? 'Replace logo' : 'Choose file'}
              </Button>
              {customLogoFile && (
                <span className="text-muted small ms-2">{customLogoFile.name}</span>
              )}
            </div>
          </div>

          {logoType === 'custom' && !customLogoPreview && (
            <p className="text-muted small mt-2 mb-0">No custom logo uploaded yet. Choose a file above.</p>
          )}
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          onClick={handleSave}
          disabled={saving || uploadingLogo}
          style={{ background: 'var(--green-800)', border: 'none', padding: '10px 28px', borderRadius: 8 }}>
          {uploadingLogo ? 'Uploading logo…' : saving ? 'Saving…' : 'Save branding'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App Blueprint: full technical specification for LLM-assisted recreation
// ---------------------------------------------------------------------------
function BpSection({ title, accent = 'var(--green-800)', children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: accent, borderRadius: 2, flexShrink: 0 }} />
        <h6 style={{ color: 'var(--green-900)', marginBottom: 0, fontSize: '0.95rem', fontWeight: 700 }}>{title}</h6>
      </div>
      {children}
    </div>
  )
}

function BpTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '6px 12px 6px 0', fontWeight: 600, color: 'var(--green-900)', width: '30%', verticalAlign: 'top' }}>{label}</td>
            <td style={{ padding: '6px 0', color: 'var(--text)', lineHeight: 1.6 }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BpCode({ children }) {
  return (
    <code style={{
      display: 'block', background: '#F3F4F6', border: '1px solid #E5E7EB',
      borderRadius: 6, padding: '10px 14px', fontSize: '0.78rem',
      fontFamily: "'Courier New', monospace", lineHeight: 1.7, whiteSpace: 'pre-wrap',
      color: '#1F2937', marginTop: 8,
    }}>
      {children}
    </code>
  )
}

function BpTag({ children, color = 'var(--green-800)', bg = 'var(--green-50)' }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.72rem', fontWeight: 700,
      background: bg, color, border: `1px solid ${color}30`,
      borderRadius: 4, padding: '1px 7px', marginRight: 4, marginBottom: 4,
    }}>
      {children}
    </span>
  )
}

function AppBlueprint() {
  const { siteName } = useBranding()
  const appName = siteName || 'In Good Hands'
  const [bpTab, setBpTab] = useState('L1')

  const card = { background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginBottom: 20 }

  // ── Rebuild prompt text ──────────────────────────────────────────────────
  const REBUILD_PROMPT = `You are about to help me rebuild "${appName}", an end-of-life planning web application.

Before you start building anything, please confirm or adjust the following default stack choices. These are the defaults I used previously. Tell me if you would like to use alternatives, and I will decide which to keep.

DEFAULT STACK CHOICES (confirm or change each one before proceeding):
1. Frontend: React 19 + Vite (port 5173 in dev)
2. Backend: Express 5 + Node.js (port 3001 in dev)
3. Database: PostgreSQL via pg (node-postgres). Hosted on Render's managed Postgres (paid plan). No ORM.
4. File storage: Cloudflare R2 (S3-compatible, no egress fees). Used for uploaded documents, photos, logo, and database backups.
5. Authentication: JWT (8-hour expiry) + bcryptjs for password hashing. No third-party auth provider. Web carries the JWT in an httpOnly, SameSite=None, Secure cookie (never readable by client JS, SEC-09) with a double-submit CSRF cookie for mutating requests; mobile has no browser cookie jar and keeps using an Authorization Bearer header exactly as before, stored in expo-secure-store.
6. Email: Resend API via native fetch (no SDK). Transactional emails only.
7. PDF generation: PDFKit, server-side, streamed to the client.
8. Deployment: Render.com. Frontend as a Static Site (with a Redirects/Rewrites rule: /* to /index.html, Rewrite action, so client-side routing works on direct navigation). Backend as a Web Service.
9. Mobile: Not included in this rebuild. Web only.
10. CSS framework: React Bootstrap (react-bootstrap) + custom CSS variables in index.css.
11. Error monitoring: Sentry. @sentry/node on the backend (instrument.js loaded first, plus the Express error handler), @sentry/react on the frontend (ErrorBoundary with a friendly fallback UI).
12. Database backups: a daily cron job dumps every table to a gzipped JSON snapshot in R2, retaining the last 14 backups.
13. Billing: Stripe Checkout for Premium Monthly/Annual subscriptions, with a webhook (mounted before the JSON body parser, using express.raw() for signature verification) keeping a local subscriptions table in sync.
14. Workflow: a CI pipeline (lint + build + a real smoke test) on every push/PR to staging and main, and a dev -> staging -> main promotion flow (one feature branch per feature, merged via PR, never pushed directly to a shared branch).

Once you have confirmed the stack, here is the full specification for what to build:

APPLICATION PURPOSE:
${appName} is a warm, end-of-life planning web application. Users document their wishes, assets, contacts, and messages so loved ones have clarity and comfort when the time comes.

TARGET AUDIENCE: Adults (primarily 40+). Launch marketing targets the United States specifically (the Privacy Policy is written to lead with CCPA/CPRA), though registration itself stays open worldwide and the Privacy Policy also covers GDPR (EU/UK), PIPEDA (Canada), Quebec Law 25, the Australian Privacy Act, and the NZ Privacy Act for users in those regions.

TONE: Warm, kind, reassuring. Never clinical. UI copy uses American English spelling and en-US date formatting throughout (migrated 2026-08-05 from an earlier Australian English holdover that predated the US-first launch pivot - see OPS-02). No em-dashes anywhere in the application.

COLOR PALETTE: Earthy, grounded, trustworthy. Forest green (primary), warm gold (accent), parchment backgrounds.

---

THE 21 SECTIONS (grouped into 4 dashboard groups):
(Note: this count has drifted before - verify against DashboardPage.jsx's SECTIONS array if precision matters.)

YOUR LEGACY:
- How I'd Like to Be Remembered: life story, about me, what I want to be remembered for, a legacy message. Fields stored directly on the users table.
- Messages to Loved Ones: personal messages table. One message per recipient. Recipient name, relationship, message text, notes.
- Unfinished Business (IDEA-19): unfinished_business table. One entry per person/topic - reconciliation, apologies, loose ends. Fields: name, description, notes. Deliberately distinct from Messages to Loved Ones (final words per recipient) and My Bucket List (aspirational future goals). NOT vault-protected, free-plan accessible. Follows personal_messages' exact access model: included in the Trusted Contacts permission list, executor/access-link data, the ad-hoc section-share feature, and both PDF/standard export paths.
- Songs That Define Me: songs_that_define_me table. Integrated with Deezer search API (proxied through backend). Fields: deezer_id, title, artist, album, why_meaningful.
- My Bucket List: life_wishes table. Status field: dream, planning, or completed.

YOUR WISHES:
- Funeral and End-of-Life Wishes: single record per user. Covers burial preference, ceremony type/location, funeral home, pre-paid plan, music preferences, readings, flowers, donation charity, special requests. Also supports a portrait photo (funeral_main role) and up to 20 gallery photos (funeral_gallery role) via uploaded_documents table.
- Doctors (IDEA-32, split out of the old Medical & Care Wishes): single record per user. GP name, GP phone, hospital preference.
- Medical Records (IDEA-32, split out of the old Medical & Care Wishes): single record per user. Advance care directive flag and location, DNR preference, current medications, medical conditions, notes.

YOUR PEOPLE:
- Emergency Contact: a single person to call right away in a crisis, stored on the users table (name, relationship, phone, email, notes). Does NOT receive plan access. (IDEA-27, split out of the old combined "Key Contacts" section.)
- Trusted Contacts: up to 3 people in a separate trusted_contacts table (max 3 per user, with sequence 1/2/3), each with section-level view permissions. Trusted contacts get 72-hour access links to view permitted sections, except the designated Legacy Contact, whose link never expires. (IDEA-27, split out of the old combined "Key Contacts" section; the underlying trusted_contacts table and routes are unchanged.)
- People to Notify: people_to_notify table. People who should be contacted when the user passes. Name, relationship, email, phone, notified_by, notes.
- Your Loved Ones: children_dependants table. Name, type (child/elderly_parent/other), DOB, special needs, preferred guardian, alternate guardian, notes.
- Pet Care: pets table (IDEA-18, split out of Your Loved Ones). Name, age, special needs/care instructions, preferred caretaker + contact, alternate caretaker + contact, notes.

YOUR AFFAIRS:
- Personal and Legal Documents: vault-protected (shared vault). legal_documents table: document_type, title, held_by, location, notes. Up to 2 file attachments per item via R2.
- Property and Possessions: vault-protected (shared vault). property_items table. Title, category, description, location, intended_recipient, notes.
- Financial Affairs: vault-protected (shared vault). financial_items table. Category, institution, account_type, account_reference, contact_name, contact_phone, notes.
- Digital Life: vault-protected (shared vault). digital_credentials table with AES-256-GCM encrypted fields (service, service_url, username, password, notes).
- Practical Household Information: vault-protected (shared vault). household_info table. Title, category, provider, account_reference, contact, notes.
- Insurance (IDEA-29): NOT vault-protected, free-plan accessible. insurance_items table. Policy type (free text - already accommodates "Health" alongside Life/Home/Auto/etc, no schema change needed), provider, policy number, contact, beneficiary, notes. A flat list, not a rigid category enum. Wired into the ad-hoc section-share feature; not yet added to the Trusted Contacts permission list (see below), which was already missing Practical Household Information, Digital Life, and Pet Care before this section existed.
- Donation Bank (IDEA-32, split out of the old Medical & Care Wishes): vault-protected (shared vault) - NEW to the shared vault, unlike Doctors/Medical Records which stayed unprotected. donation_bank table. Organ donation preference and details, both field-encrypted like the other vault sections.

---

VAULT ENCRYPTION:
- Algorithm: AES-256-GCM (authenticated encryption)
- Key derivation: scrypt (N=16384, r=8, p=1) from vault_password + userId. Salt = "igh-vault-v1-" + userId.
- Password NEVER stored: verified by decrypting a known constant ("in-good-hands-vault-verified") stored as check_enc in the digital_vault table.
- Each encrypted field stored as JSON: {ciphertext, iv, tag} all hex-encoded. Fresh random IV per field.
- Legal Documents, Digital Life, Financial Affairs, Property & Possessions, Practical Household Information, and Donation Bank (IDEA-32) share ONE vault and ONE password, and every text field in all six is field-level encrypted (not just Digital Life).
- Vault reset: user-initiated, requires account password. Permanently deletes all vault data. Irreversible (there is no other way to recover data once the vault password is lost).
- Failed unlock attempts: after 5 (logout_after_attempts), force logout with a warning email. Every 5 (lockout_after_attempts), a 3-minute timed lockout (not deletion) with a notification email; it auto-reopens on its own, and the correct password unlocks immediately even mid-lockout. Nothing is deleted for a wrong attempt unless the user opted in.
- Opt-in auto-destroy (REV-22, 2026-08-26): digital_vault.destroy_after_attempts is NULL (disabled) for every vault unless the user explicitly turns on "maximum security" in Profile > Vault Settings, behind a confirmation dialog. Set to an integer 3-1000, cumulative wrong attempts reaching it permanently destroy all vault data. It used to be NOT NULL DEFAULT 100, i.e. silently armed on every account; the migration in database.js cleared every row still sitting on that untouched 100, once, guarded by the app_settings key rev22_destroy_default_cleared. lib/vaultAttempts.js must never resolve this column with a logical-OR fallback (NULL is falsy, so an OR fallback re-arms every disabled vault); it uses an explicit positive-integer check instead.
- Destructive vault operations (deleting a vault-protected record, resetting the vault, changing the vault password) all re-verify the vault password server-side immediately before acting, the same check used for list/create/update on the same routes.

---

TRUSTED CONTACTS SYSTEM:
- Up to 3 trusted contacts per user.
- Each contact has section-level permissions (which of the 21 sections they can view). Insurance and Pet Care are not yet wired into this list (a pre-existing gap - see the Insurance entry above); Unfinished Business (IDEA-19) and Your Last Moments (IDEA-30) ARE wired in, matching Messages to Loved Ones' access model exactly. Donation Bank (IDEA-32) is deliberately excluded, same as the other vault-protected sections.
- Access via a signed link emailed to the contact. No separate login required. Valid 72 hours for the two non-Legacy-Contact slots; the Legacy Contact's link never expires (found and fixed 2026-08-06: the owner, who'd normally resend an expired link, is by definition unreachable once the plan is actually triggered).
- Tokens stored in trusted_contact_tokens table (contact_id, token, expires_at). expires_at is NULL for a Legacy Contact's token, meaning it never expires.
- Digital credentials (vault) are NEVER accessible to trusted contacts, Legacy Contact included.
- Inactivity timer: when the timer expires (user inactive for their chosen period), all trusted contacts with email addresses and (for non-Legacy-Contacts) section permissions are automatically emailed their access links. A Legacy Contact doesn't need section permissions granted, they get full read access (minus the vault) regardless.

---

INACTIVITY TIMER:
- Users set inactivity_period_months (options: 2, 3, 6, 12, 18, 24).
- last_active_at updated on every login.
- Daily cron at 8am checks all non-admin users with a timer set.
- Reminder emails sent at 14 days, 7 days, 3 days, 1 day remaining (throttled to avoid spam).
- On expiry (daysLeft < 0): trusted contacts are notified with their access links (72-hour for non-Legacy-Contacts, non-expiring for the Legacy Contact). Re-notification cooldown: 30 days. Cooldown resets on next login.

---

ADMIN PANEL:
- Accessible to users with is_admin=1 only.
- Tabs: Overview (stats), Users (search and manage, including honorary premium grant/revoke), Activity (audit log), Vault Security (audit log of vault reset/destroy/recovery events), Appearance (theme/font/icon set), Branding (site name and logo), Organizations (funeral-home white-label portal management, gated behind ORG_PORTAL_ENABLED), Settings (password reset method), Marketing (campaign landing page list and acquisition_source signup breakdown), Versions (client/admin/org_portal semver change log), Security (security review findings log), Contact (contact-form submission inbox, persisted independently of the admin-notification email so a missed/failed email doesn't lose the message; mark read/unread, delete), App Blueprint (this documentation).
- 11 color themes (including Keepsake, Heirloom, and Storybook, each a fully tokenized theme with its own card radius, border style, button treatment, and - for Heirloom/Storybook - heading style, landing-hero colours, and dashboard group-card tints), 6 font choices, 3 icon sets. All stored in app_settings key-value table.
- Admin can upload a logo via Cloudflare R2 for white-labelling.
- Admin can change site name (white-label support via BrandingContext).

---

AUTH SYSTEM:
- JWT, 8-hour expiry, signed with JWT_SECRET env var. Web: httpOnly, Secure, SameSite=None cookie (client and API are on different subdomains, so this is a genuinely cross-site relationship, not just cross-origin) - client JS can never read it (SEC-09). Mobile: Authorization Bearer header from expo-secure-store, unchanged and unaffected by the cookie work since it has no browser cookie jar.
- CSRF: double-submit cookie. A second, non-httpOnly csrf_token cookie is set alongside the session cookie; the client echoes its value back as an X-CSRF-Token header on every mutating (non-GET/HEAD/OPTIONS) request, checked in server/middleware/auth.js. Only applies to cookie-authenticated requests - a Bearer-header request (mobile) is exempt, since CSRF is a browser/cookie phenomenon.
- bcryptjs for password hashing, salt rounds = 10.
- Rate limiting: 20 requests per 15 minutes on /api/auth routes, 200 requests per 15 minutes on general /api/ routes. forgot-password is additionally rate-limited per email address (5 per 15 minutes).
- Password reset: always by emailed link, single-use, expires in 30 minutes, stored server-side as a SHA-256 hash (never the raw token, never returned in any API response). Admin can optionally also require date of birth or a security question as an extra check before that email is sent - either is only ever an additional signal, never an alternate path to a reset link. Security question answers are stored as a bcrypt hash (users.security_answer_hash), same as passwords. A successful reset (or any password change) bumps users.session_version, which invalidates any other already-issued session token.
- Audit log: every login_success, login_failed, logout, register, password_changed, password_reset_requested, password_reset_denied stored in user_audit_logs table.
- Vault failure audit: every failed vault attempt logged with attempt count.

---

FILE STORAGE (Cloudflare R2):
- Key format: {userId}/{sectionId}/{uuid}.{ext} for documents.
- Signed URLs: 1-hour expiry, generated fresh on each GET.
- File types: PDF, JPEG, PNG, HEIC, WebP, DOC, DOCX (max 20MB for docs, 15MB for photos).
- Photo roles: funeral_main (1 per user, old one deleted on upload), funeral_gallery (max 20).
- Logo upload for white-labelling: stored as app_settings key=site_logo.

---

PDF EXPORT:
- PDFKit, A4 two-column layout, streamed to client.
- Standard export (GET): excludes vault sections (shown as locked notice).
- Full export (POST with vault_password): includes decrypted vault content. Sensitive data warning box shown.
- Covers all 15 sections across 6 content pages.
- Reads site_theme and site_font from app_settings for styled output.

---

EMAIL TEMPLATES (all in server/lib/emailTemplates.js, sent via Resend):
- welcomeEmail: on registration
- passwordResetEmail: on forgot-password
- inactivityReminderEmail: days remaining warning
- inactivityContactNotificationEmail: sent to trusted contacts when timer expires
- contactAccessEmail: sent to trusted contact when user manually sends access link
- vaultAttemptEmail: sent to user on every failed vault attempt; the extra security notice appears from the 5th (force logout, and a 3-minute lockout, not deletion)
- Footer contact/feedback form: POST /api/contact sends admin notification

---

KEY CONSTRAINTS AND DECISIONS:
- No em-dashes anywhere in the application (UI, emails, PDFs, code comments, documentation).
- American English throughout (organized, recognized, etc.) - migrated 2026-08-05 from an earlier Australian English holdover (OPS-02).
- Vault password never stored or recoverable. Loss = permanent data loss. This is communicated clearly to users.
- No admin panel on mobile (mobile app is user-facing only, not yet built in this version).
- Deezer search proxied through backend to avoid CORS.
- PDFKit pipes directly to HTTP response. No temp files.
- PostgreSQL access goes through a pg.Pool connection pool (server/db/database.js). SSL required for any non-localhost connection.
- Bootstrap --bs-primary overridden per theme so all Bootstrap components match the chosen palette.
- The site name ("${appName}") is stored in app_settings and displayed via BrandingContext throughout the app.

---

ENVIRONMENT VARIABLES NEEDED:
Server (Render Web Service):
  PORT, DATABASE_URL, JWT_SECRET, CLIENT_URL, RESEND_API_KEY, FROM_EMAIL (optional but important, see Email System),
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT, SENTRY_DSN (optional, enables error monitoring),
  STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, STRIPE_WEBHOOK_SECRET,
  ORG_PORTAL_ENABLED (optional, default off - set to "true" to register the org/funeral-home portal routes)

Client (Render Static Site, baked in at build time):
  VITE_API_URL, VITE_SENTRY_DSN (optional, enables error monitoring)

---

Please confirm the stack choices above (or tell me which to change), and then we can begin building.`

  const downloadRebuildPrompt = () => {
    const blob = new Blob([REBUILD_PROMPT], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${appName.replace(/\s+/g, '-').toLowerCase()}-rebuild-prompt.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printPdf = () => window.print()

  // ── Sub-tab styles ──────────────────────────────────────────────────────
  const subTabStyle = (active) => ({
    padding: '7px 18px',
    borderRadius: 6,
    border: '1px solid',
    borderColor: active ? 'var(--green-800)' : 'var(--border)',
    background: active ? 'var(--green-800)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    fontSize: '0.82rem',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  })

  return (
    <div>
      {/* Header */}
      <div style={{ ...card, background: 'var(--green-900)', color: '#fff', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h5 style={{ color: '#fff', marginBottom: 4, fontFamily: 'Georgia, serif' }}>{appName}: Application Blueprint</h5>
            <p style={{ color: '#A8C5B0', fontSize: '0.85rem', marginBottom: 0 }}>
              Complete specification for rebuilding or handing off this application. Last updated: July 2026.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <button onClick={printPdf} style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 6, color: '#fff', fontSize: '0.78rem', padding: '5px 12px', cursor: 'pointer',
            }}>
              Download as PDF
            </button>
            <button onClick={downloadRebuildPrompt} style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 6, color: '#fff', fontSize: '0.78rem', padding: '5px 12px', cursor: 'pointer',
            }}>
              Download rebuild prompt (.txt)
            </button>
          </div>
        </div>
        {/* Sub-tab navigation */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'L1', label: 'L1: Feature Overview' },
            { id: 'L2', label: 'L2: Product Specification' },
            { id: 'L3', label: 'L3: Technical Reference' },
          ].map(t => (
            <button key={t.id} style={subTabStyle(bpTab === t.id)} onClick={() => setBpTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── L1: Feature Overview ──────────────────────────────────────────────── */}
      {bpTab === 'L1' && (
        <div>
          <div style={card}>
            <BpSection title="What is this application?">
              <p style={{ fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text)', marginBottom: 12 }}>
                {appName} is a warm, private space for adults to document their wishes, affairs, and messages for the people they love.
                Think of it as a personal end-of-life planner: not morbid, but deeply practical and deeply kind.
              </p>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text)', marginBottom: 0 }}>
                When someone passes away, the people left behind often face confusion, paperwork, and unanswered questions.
                {appName} helps families navigate that period with more clarity and less distress.
              </p>
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Who is it for?">
              <BpTable rows={[
                ['Primary users', 'Adults aged 40 and above. Launch marketing targets the United States specifically; registration itself stays open worldwide.'],
                ['Secondary users', 'Trusted contacts (family or close friends) who receive secure access to relevant sections when the time comes.'],
                ['Administrators', 'White-label operators who can customize the site name, logo, color theme, and fonts through the admin panel.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="The 21 Sections at a Glance">
              <p className="text-muted small mb-3">Organized into four groups on the dashboard. Users fill in as much or as little as they choose.</p>
              {[
                { group: 'Your Legacy', color: '#C9A84C', icon: '✨', sections: [
                  { label: 'How I\'d Like to Be Remembered', desc: 'Your life story, what you want to be remembered for, and a final message.' },
                  { label: 'Messages to Loved Ones', desc: 'Personal letters and notes for specific people in your life.' },
                  { label: 'Unfinished Business', desc: 'Reconciliation, apologies, and relationships or matters you would still like to set right (IDEA-19).' },
                  { label: 'Songs That Define Me', desc: 'Music that has shaped who you are, with a search tool to find tracks easily.' },
                  { label: 'My Bucket List', desc: 'Dreams, plans, and things you have already accomplished.' },
                ]},
                { group: 'Your Wishes', color: '#5A9A5A', icon: '🕊️', sections: [
                  { label: 'Funeral and End-of-Life Wishes', desc: 'Burial or cremation preference, ceremony type, music, readings, photos, and more.' },
                  { label: 'Doctors', desc: 'GP details and preferred hospital, split out of the old Medical and Care Wishes (IDEA-32).' },
                  { label: 'Medical Records', desc: 'Advance care directive, DNR preference, and medical history, split out of the old Medical and Care Wishes (IDEA-32).' },
                ]},
                { group: 'Your People', color: '#B87A50', icon: '🤝', sections: [
                  { label: 'Emergency Contact', desc: 'The first person to call in an emergency. Does not receive access to your plans.' },
                  { label: 'Trusted Contacts', desc: 'Up to three people who can securely view your plans, with one optionally designated your Legacy Contact.' },
                  { label: 'People to Notify', desc: 'A list of people who should be contacted when you pass, and who should contact them.' },
                  { label: 'Your Loved Ones', desc: 'Details for children or other dependants including preferred guardians.' },
                  { label: 'Pet Care', desc: 'Feeding routines, vet details, and preferred caretakers for your pets.' },
                ]},
                { group: 'Your Affairs', color: '#8A7A6A', icon: '📋', sections: [
                  { label: 'Personal and Legal Documents', desc: 'Where to find your will, power of attorney, and other important papers. Vault-protected.' },
                  { label: 'Property and Possessions', desc: 'Items of value and who you would like to receive them.' },
                  { label: 'Financial Affairs', desc: 'Bank accounts, investments, insurance, super, and other financial interests.' },
                  { label: 'Digital Life', desc: 'Usernames and passwords for your online accounts, encrypted so only you can read them.' },
                  { label: 'Practical Household Information', desc: 'Utility providers, subscriptions, memberships, and other practical details.' },
                  { label: 'Insurance', desc: 'Life, health, home, auto, and other policies: provider, policy number, contact, and beneficiary. Not vault-protected.' },
                  { label: 'Donation Bank', desc: 'Organ and tissue donation preferences, split out of the old Medical and Care Wishes (IDEA-32). Vault-protected, unlike Doctors and Medical Records.' },
                ]},
              ].map(group => (
                <div key={group.group} style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: group.color, marginBottom: 8, borderBottom: `2px solid ${group.color}30`, paddingBottom: 4 }}>
                    {group.icon} {group.group}
                  </div>
                  {group.sections.map(s => (
                    <div key={s.label} style={{ display: 'flex', gap: 12, marginBottom: 8, paddingLeft: 10 }}>
                      <div style={{ minWidth: 220, fontSize: '0.82rem', fontWeight: 600, color: 'var(--green-900)', flexShrink: 0 }}>{s.label}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              ))}
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Key Capabilities">
              <BpTable rows={[
                ['Secure vault', 'Six sections (Legal Documents, Digital Life, Financial Affairs, Property & Possessions, Practical Household Information, Donation Bank) share one vault password that is never stored on the server. Only the user can unlock their vault, and every text field in all six sections is individually encrypted with a key derived from that password.'],
                ['Trusted contact access', 'Users choose up to 3 trusted contacts and control exactly which sections each one can view. Contacts receive a secure link (no login required); 72-hour validity for non-Legacy-Contact contacts, non-expiring for the designated Legacy Contact.'],
                ['Inactivity timer', 'Users set a period of inactivity (2 to 24 months). If they have not logged in by then, their trusted contacts are automatically notified with access links.'],
                ['PDF export', 'Users can download a complete PDF summary of all their plans. A full export option includes vault contents if the vault password is provided at download time.'],
                ['File attachments', 'Upload photos and documents (PDF, images, Word docs) to Legal Documents, Financial Affairs, Property & Possessions, and Practical Household Information. Stored securely in Cloudflare R2, access-controlled with short-lived signed URLs.'],
                ['Premium billing', 'Free plan covers 14 of the 21 sections. Premium ($10/month or $100/year via Stripe Checkout) unlocks the 6 vault-protected sections plus Your Last Moments, document uploads, full (vault-inclusive) PDF export, and the inactivity timer. Users manage or cancel/reinstate their subscription from My Profile; admins can also grant or revoke an honorary premium plan without a real Stripe subscription.'],
                ['Admin panel', 'Operators can customize colors, fonts, site name, and logo. View all users, audit logs, and manage accounts.'],
                ['White-label ready', 'The site name and logo can be changed by the admin. All emails and the PDF use the configured name.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="What it is NOT">
              <BpTable rows={[
                ['Not a legal service', 'The application does not provide legal advice. It is a planning and document-organization tool only.'],
                ['Not a will', 'Entries in this application do not replace a legally executed will or any other legal document.'],
                ['Files are not vault-key-encrypted', 'All six vault-protected sections (Legal Documents, Financial Affairs, Property & Possessions, Digital Life, Practical Household Information, Donation Bank) have their text fields encrypted with a vault-password-derived key. Uploaded files (attachments and photos) are access-controlled with short-lived signed URLs and encrypted at rest by Cloudflare R2 as a platform default, but are not additionally encrypted with the vault password. (Donation Bank has no file-upload capability of its own, so this applies to it only in the sense that no exception was carved out.)'],
                ['Not a backup service', 'Physical documents referenced in the app are stored by the user. Only the metadata (where to find them) is recorded here.'],
              ]} />
            </BpSection>
          </div>
        </div>
      )}

      {/* ── L2: Product Specification ─────────────────────────────────────────── */}
      {bpTab === 'L2' && (
        <div>
          <div style={card}>
            <BpSection title="User Journey">
              <BpTable rows={[
                ['Registration', 'User provides name, email, date of birth, and password. A welcome email is sent. They land on the dashboard.'],
                ['Dashboard', 'Shows 21 section cards grouped into 4 color-coded groups. Each card shows completion status (Not started, In progress, Done). A progress bar shows overall completion.'],
                ['First visit', 'New users see a welcome card with four suggested starting sections. Returning users see "Welcome back".'],
                ['Filling sections', 'Each section has its own page with a form or list UI. Changes are saved immediately or via explicit Save buttons.'],
                ['Vault setup', 'The first time a user visits Digital Life or Legal Documents, they are prompted to create a vault password. This password is separate from their account password and is never stored.'],
                ['Trusted contacts', 'Set up in the dedicated Trusted Contacts section. User adds up to 3 contacts, assigns section permissions, and can send them a secure access link at any time.'],
                ['PDF export', 'Available at /export. Standard version excludes vault sections. Full version prompts for vault password.'],
                ['Inactivity timer', 'Set in My Profile settings. If the user does not log in within their chosen period, trusted contacts are emailed access links automatically.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Section Detail: Emergency Contact & Trusted Contacts">
              <p className="text-muted small mb-3">
                Two distinct subsystems, previously combined on one "Key Contacts" page. Split into their own
                pages (IDEA-27) since they serve different purposes: Emergency Contact is a simple, always-on
                "call this person now" record; Trusted Contacts is tied to the app's access-grant and inactivity
                system. Each now has its own dashboard card and route, matching every other section's one-page-per-section pattern.
              </p>
              <BpTable rows={[
                ['Emergency contact', 'A single person to call in an emergency. Stored on the users table (emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email, emergency_contact_notes). Does NOT receive plan access. Route: /sections/emergency-contact.'],
                ['Trusted contacts', 'Up to 3 people who can view the user\'s plans. Stored in trusted_contacts table with sequence 1, 2, or 3, unchanged by the IDEA-27 page split. Route: /sections/trusted-contacts.'],
                ['Section permissions', 'For each trusted contact, the user selects which sections that person can see. Stored in trusted_contact_permissions table. Insurance (IDEA-29) and Pet Care are not yet included in this list. Unfinished Business (IDEA-19) IS included, matching Messages to Loved Ones exactly.'],
                ['Access links', 'A signed link is emailed to the contact, giving read-only access to permitted sections (or everything except the vault, for the Legacy Contact). No account or login needed. 72-hour validity for non-Legacy-Contact contacts, non-expiring for the Legacy Contact.'],
                ['Token storage', 'Tokens stored in trusted_contact_tokens table (contact_id, token, expires_at). Old token replaced when a new link is sent.'],
                ['Expired access', 'The access page checks token expiry and shows a friendly expired message if the link is too old.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Section Detail: Vault System">
              <BpTable rows={[
                ['Setup', 'User chooses a vault password (min 8 characters). A verification marker is encrypted and stored. The password itself is not stored anywhere.'],
                ['Unlocking', 'User enters their vault password. The server attempts to decrypt the verification marker. If it succeeds, the vault is considered unlocked for the session.'],
                ['Session', 'The vault password is held in React state (memory only). It is never written to localStorage or cookies. Locking the vault clears it from memory.'],
                ['Failed attempts', '5 failed attempts: force logout, email notification to user. Every 5 failed attempts: vault temporarily locked for 3 minutes, email notification sent. Nothing is deleted for incorrect attempts by default - the correct password unlocks immediately even mid-lockout.'],
                ['Opt-in auto-destroy', 'Off for every vault unless the user turns on "maximum security" in Profile > Vault Settings, behind a confirmation dialog, a tick box, and their vault password. When on, cumulative wrong attempts reaching the chosen threshold (3-1000) permanently delete all vault data. Was silently on at 100 for every account before REV-22 (2026-08-26); that legacy default was cleared by a one-time migration.'],
                ['Reset vault', 'User-initiated only, requires confirming their account (login) password. Permanently deletes all vault-protected data. This is distinct from the failed-attempt lockout above: it is the only path that still deletes data, since there is no other way to recover it once the vault password itself is lost.'],
                ['Change password', 'User can change the vault password from My Profile. The server decrypts all fields with the old password and re-encrypts with the new one in a single transaction.'],
                ['Destructive-op re-verification', 'Deleting a vault-protected record, resetting the vault, and changing the vault password all require the vault password to be re-sent and re-verified server-side on that specific request, not just relying on an earlier "unlocked" client state. Applies consistently across Legal Documents, Financial Affairs, Property & Possessions, Digital Life, and Household Info.'],
                ['Trusted contact exclusion', 'Vault sections are never shown to trusted contacts. The access page explicitly omits them.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Section Detail: Inactivity Timer">
              <BpTable rows={[
                ['Configuration', 'User selects a period: 2, 3, 6, 12, 18, or 24 months. Stored as inactivity_period_months on the users table.'],
                ['Last active tracking', 'last_active_at is updated on every successful login. Also reset when the user logs back in after inactivity contacts were notified.'],
                ['Daily check', 'A node-cron job runs at 8am daily. It queries all non-admin users with a timer set.'],
                ['Reminder emails', 'Sent at 14 days remaining. Throttled: no more than once every 7 days when more than 7 days remain, once every 3 days when 1-7 days remain, once per day when less than 1 day remains.'],
                ['On expiry', 'When daysLeft is negative, trusted contacts with email addresses are emailed their access links (non-Legacy-Contacts also need at least one section permission; the Legacy Contact doesn\'t). 72-hour validity for non-Legacy-Contact contacts, non-expiring for the Legacy Contact.'],
                ['Re-notification', 'If the owner remains inactive, contacts are re-notified every 30 days. On next login, inactivity_contacts_notified_at is reset to NULL.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Section Detail: PDF Export">
              <BpTable rows={[
                ['Standard export', 'GET /api/export. No vault password needed. Vault sections show a "protected" notice.'],
                ['Full export', 'POST /api/export with vault_password in the request body. Vault sections fully included. A sensitive data warning box appears in the PDF.'],
                ['What is included', 'All 21 sections. Cover page with logo, user name, and date. Grouped logically across content pages.'],
                ['Layout', 'A4 two-column layout. Each item rendered as a card. Page breaks handled automatically.'],
                ['Branding', 'The current theme and font from app_settings are applied. Logo is fetched from R2 and embedded on the cover page.'],
                ['Download behavior', 'The browser receives the PDF as a stream and downloads it as a file. No temp files are created on the server.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Section Detail: Premium Billing">
              <BpTable rows={[
                ['Plans', 'Free ($0): 9 non-vault sections plus trusted contacts. Premium Monthly ($10/month) and Premium Annual ($100/year, saves $20 vs monthly): everything in Free plus all 5 vault-protected sections, document uploads, full (vault-inclusive) PDF export, and the inactivity timer. GET /api/billing/plans returns this plan/feature copy for the Upgrade page.'],
                ['Checkout', 'POST /api/billing/create-checkout-session with {plan: "monthly"|"annual"} creates a Stripe Checkout session and returns its redirect URL. Reuses the caller\'s existing Stripe customer if a prior checkout attempt already created one, so repeat attempts do not create duplicate Stripe customers.'],
                ['Webhook sync', 'POST /api/billing/webhook is mounted directly in server/index.js with express.raw(), before the global JSON body parser, since Stripe signature verification needs the raw request body. Handles checkout.session.completed, customer.subscription.updated/deleted, and invoice.upcoming, keeping the local subscriptions row in sync via upsertFromSubscription().'],
                ['Cancel / reinstate', 'POST /api/billing/cancel sets cancel_at_period_end on the Stripe subscription (access continues until the paid period ends, not an immediate cutoff) and also updates the local row directly so a client re-fetch right after the call cannot race ahead of the async webhook. POST /api/billing/reinstate reverses cancel_at_period_end while the subscription is still active; if Stripe has already ended it, the user needs a fresh checkout instead. Both are surfaced on My Profile.'],
                ['Honorary premium', 'Admin-only alternative to a real Stripe subscription: POST /api/admin/users/:id/grant-premium / revoke-premium sets subscriptions.provider = "admin_grant" and granted_by_admin_id, with no Stripe customer or charge involved. Shown in the Users tab as "Honorary Premium".'],
                ['Access enforcement', 'server/lib/subscription.js\'s getUserPlan() is the single source of truth for free vs premium; server/middleware/requiresPremium.js gates the vault-protected section routes server-side, so the freemium boundary is not just a client-side UI restriction.'],
                ['Pricing history', 'Premium was originally $4.99/month and $29.99/year; both were raised to $10/month and $100/year before any live-mode Stripe Price existed, so no price migration for existing customers was needed.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Admin Panel Capabilities">
              <BpTable rows={[
                ['Overview', 'Total users, new registrations this month, logins in the last 7 days, total entries across all section tables.'],
                ['User management', 'Search users by name or email. View full profile, section completion, and audit log for any user. Reset their password. Delete their account.'],
                ['Activity log', 'Recent actions across all users: logins, failures, registrations, password changes. Filterable by user.'],
                ['Appearance', '11 color themes, 6 font choices, 3 icon sets. Changes apply live via CSS variables and are persisted in app_settings.'],
                ['Branding', 'Change the site name (stored in app_settings, displayed via BrandingContext throughout the app and in emails/PDF). Upload a custom logo (stored in R2). Choose from preset logo illustrations.'],
                ['Settings', 'Toggle whether password reset also requires date-of-birth or security-question confirmation in addition to the emailed link (Resend). The link itself is always required, never optional.'],
                ['Marketing', 'Lists the code-defined campaign landing pages (client/lp/*.html) with their live URLs, and a live breakdown of signups by acquisition_source pulled straight from the users table. No separate marketing database or A/B testing infrastructure yet.'],
                ['App Blueprint', 'This three-level documentation system. Read-only. Downloadable as PDF and as a rebuild prompt text file.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Email Communications">
              <BpTable rows={[
                ['Welcome email', 'Sent on registration. Warm welcome, link to log in.'],
                ['Password reset', 'Sent on forgot-password request, always by email, reset link valid 30 minutes. If the site is set to also require date of birth or a security question, that\'s only an additional check before this email is sent, never an alternative to it.'],
                ['Inactivity reminder', 'Sent to the user as their timer approaches expiry. Days remaining shown clearly. Includes a "reset my timer" CTA (just log in again).'],
                ['Inactivity notification', 'Sent to trusted contacts when the user\'s timer expires. Warm, gentle tone. Advises contacting the person directly first if possible. Includes the access link (72-hour for non-Legacy-Contacts, non-expiring for the Legacy Contact).'],
                ['Contact access link', 'Sent to a trusted contact when the user manually clicks "Send access link". Tells them the owner has shared something important.'],
                ['Vault attempt warning', 'Sent to the user on every failed vault attempt, with an added security notice from the 5th (force logout, plus a 3-minute lockout notice, not a deletion, and it auto-reopens on its own).'],
                ['Feedback/contact form', 'When a user submits the footer feedback form, an email is sent to the admin address.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Design Principles and Constraints">
              <BpTable rows={[
                ['No em-dashes', 'Never use em-dashes (—) anywhere: UI text, emails, PDF content, code comments, or documentation. Use commas, colons, or periods instead.'],
                ['American English', 'Organized, recognized, color, favor, apologize. Date format: toLocaleDateString("en-US"). Migrated 2026-08-05 from an earlier Australian English holdover (OPS-02).'],
                ['Warm tone', 'The app is used by people thinking about death and their legacy. Every word should feel kind, not clinical. Never alarming. Never transactional.'],
                ['Vault honesty', 'Users are told clearly at setup: if you forget your vault password, your data cannot be recovered. This is by design and cannot be changed without breaking the security model.'],
                ['Trusted contact simplicity', 'Contacts receive a link. They do not need to create an account. The experience is frictionless for someone who may be grieving.'],
                ['White-label first', 'The site name and logo are configurable. All user-facing text that mentions the app name should use the configured value, not a hardcoded string.'],
                ['Mobile (not yet built)', 'The Expo mobile app is planned but not implemented. Admin features are web-only. The mobile app will be user-facing only.'],
              ]} />
            </BpSection>
          </div>
        </div>
      )}

      {/* ── L3: Technical Reference ───────────────────────────────────────────── */}
      {bpTab === 'L3' && (
        <div>

      {/* 1. Overview */}
      <div style={card}>
        <BpSection title="1. Application Overview">
          <BpTable rows={[
            ['Product name', appName],
            ['Purpose', 'End-of-life planning web application. Users document their wishes, assets, contacts, and messages so loved ones have clarity and comfort when the time comes.'],
            ['Target audience', 'Adults (primarily 40+). Launch marketing targets the United States specifically (Privacy Policy leads with CCPA/CPRA); registration itself stays open worldwide.'],
            ['Tone of voice', 'Warm, kind, reassuring, end-of-life-aware. Never clinical. No em-dashes anywhere.'],
            ['Language', 'American English throughout the UI (organized, color, en-US date formatting), matching the US-first launch. Migrated 2026-08-05 from an earlier Australian English holdover (OPS-02).'],
            ['Primary color metaphor', 'Earthy, grounded, trustworthy. Forest green, warm gold, parchment backgrounds.'],
          ]} />
        </BpSection>
      </div>

      {/* 2. Tech stack */}
      <div style={card}>
        <BpSection title="2. Technology Stack">
          <BpTable rows={[
            ['Frontend', 'React 19 + Vite (client/), port 5173 in dev'],
            ['Backend', 'Express 5 + Node.js (server/), port 3001 in dev'],
            ['Database', 'PostgreSQL via pg (node-postgres). Render managed Postgres, paid Basic plan. Connection string in DATABASE_URL, SSL required outside localhost.'],
            ['File storage', 'Cloudflare R2 (S3-compatible). No egress fees. Keys in R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT env vars. Also stores nightly database backups.'],
            ['Auth', 'JWT (jsonwebtoken), 8h expiry. Web: httpOnly/Secure/SameSite=None cookie + double-submit CSRF cookie, client JS never sees the token. Mobile: Authorization Bearer header (expo-secure-store), unaffected. bcryptjs for password hashing (10 salt rounds). Rate limited: 20 req/15min on auth routes, 200 req/15min on general API routes.'],
            ['Email', 'Resend API via native fetch (no SDK). Key in RESEND_API_KEY env var.'],
            ['PDF generation', 'PDFKit 0.18. Two-column A4 layout. Generated server-side and streamed to client.'],
            ['Billing', 'Stripe (stripe npm package). Live-mode Checkout for Premium Monthly ($10/mo) and Annual ($100/yr). Keys/Price IDs in STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, STRIPE_WEBHOOK_SECRET.'],
            ['Error monitoring', 'Sentry. @sentry/node on the server (instrument.js + Express error handler), @sentry/react on the client (ErrorBoundary with fallback UI). DSNs in SENTRY_DSN / VITE_SENTRY_DSN.'],
            ['Backups', 'Daily cron (3am) dumps every table to a gzipped JSON snapshot in R2 (server/lib/backup.js). Retains the last 14 backups. Admin-only endpoints to list/trigger manually.'],
            ['Deployment', 'Render.com. Frontend: Static Site (needs a Redirects/Rewrites rule: /* to /index.html, action Rewrite, for client-side routing to work on direct navigation). Backend: Web Service. Separate staging and production services/databases, promoted dev -> staging -> main via PR, not pushed directly to production.'],
            ['CI', '.github/workflows/smoke-test.yml runs on push/PR to main and staging: client lint + build, plus a server smoke test (boots the app against a real Postgres service container and checks /api/health, a bad-request 400/401, and an unauthenticated 401). Report-only, not a hard merge block.'],
            ['Mobile', 'Expo / React Native (built, app store submission in progress).'],
            ['CSS framework', 'React Bootstrap (react-bootstrap) + custom CSS variables in index.css'],
          ]} />
        </BpSection>
      </div>

      {/* 3. File structure */}
      <div style={card}>
        <BpSection title="3. Repository Structure">
          <BpCode>{`performance-app/
  client/                    # React + Vite frontend
    src/
      App.jsx                # Routes, NavBar, SiteFooter, theme/font application
      index.css              # CSS variables, global styles
      context/AuthContext.jsx
      pages/
        LandingPage.jsx
        LoginPage.jsx, RegisterPage.jsx
        ForgotPasswordPage.jsx, ResetPasswordPage.jsx
        DashboardPage.jsx    # 21 section cards, 4 groups, earthy colors
        ProfilePage.jsx      # Personal details, password, vault password, billing management
        AccessPage.jsx       # Public trusted-contact read-only view
        AdminPage.jsx        # Full admin panel
        ExportPage.jsx       # Two-option PDF download page
        sections/            # One page per section (15 files)
        org/                 # Org/funeral-home portal pages (gated behind ORG_PORTAL_ENABLED)
        admin/OrganizationsPanel.jsx  # Admin tab for managing organizations
      components/
        VaultGate.jsx        # Shared VaultSetupScreen + VaultLockScreen
        FileAttachments.jsx  # Shared upload/list/download widget, parameterized by sectionId
        SectionHero.jsx      # Shared folded-corner hero panel used by all 21 section pages

  server/                    # Express 5 backend
    instrument.js            # Sentry init, required first (before any other import)
    index.js                 # App entry, CORS, routes, error handler, cron, ORG_PORTAL_ENABLED gate
    db/database.js           # PostgreSQL pool (pg) + all schema migrations
    middleware/
      auth.js                # requireAuth JWT middleware
      requiresPremium.js     # Gates vault-protected section routes to premium users
    lib/
      vault.js               # AES-256-GCM encryption helpers (deriveKey, encryptField, decryptField)
      vaultAuth.js           # checkVault() - shared per-request vault password re-verification
      vaultAttempts.js       # Failed-attempt tracking: force-logout at 5, 3-min lockout every 5, auto-destroy opt-in only
      stripe.js               # Stripe client + PRICE_IDS from env
      r2.js                  # Cloudflare R2 client (upload/download/delete/buffer/listKeys)
      backup.js              # Nightly cron: dumps all tables to gzipped JSON in R2, prunes old backups
      generatePdf.js         # Two-column PDFKit generator
      emailTemplates.js      # HTML email templates (welcome, reset, inactivity, access)
      sendEmail.js           # Resend API wrapper
      inactivityTimer.js     # Daily cron: checks last_active_at, sends reminder emails
    routes/
      auth.js                # /api/auth: login, register, logout, forgot/reset password
      users.js               # /api/users/me: profile, timer, emergency contact
      sections.js            # /api/sections: all 21 sections + vault endpoints + completion
      documents.js           # /api/documents: file upload/download/delete + photos
      export.js              # /api/export: GET (standard) + POST (with vault)
      admin.js               # /api/admin: stats, users, activity log, versions, backups list/trigger
      settings.js            # /api/settings: app_settings key-value store
      trustedContacts.js     # /api/trusted-contacts: CRUD + send access link
      access.js              # /api/access/:token: public read-only trusted contact view
      billing.js             # /api/billing: plans, checkout session, cancel/reinstate, subscription status
      stripeWebhook.js       # Stripe webhook handler, mounted separately with express.raw()
      contact.js             # /api/contact: user feedback form
      organizations.js, orgPortal.js, orgPublic.js, orgRegister.js
                             # Org/funeral-home white-label portal - only registered when
                             # ORG_PORTAL_ENABLED=true (SEC-12); not part of the initial launch`}
          </BpCode>
        </BpSection>
      </div>

      {/* 4. Database schema */}
      <div style={card}>
        <BpSection title="4. Database Schema (PostgreSQL)">
          <p className="text-muted small mb-3">All tables use SERIAL PRIMARY KEY unless noted. created_at defaults to NOW() (TIMESTAMPTZ).</p>
          {[
            {
              table: 'users',
              fields: 'id, name, email (unique), password_hash, date_of_birth, life_story, about_me, remembered_for, legacy_message, emergency_contact_name, emergency_contact_phone, emergency_contact_email, emergency_contact_relationship, emergency_contact_notes, marital_status, spouse_name, spouse_phone, spouse_email, is_admin (0/1), inactivity_period_months (default 12), last_active_at, reset_token (SHA-256 hash, not the raw token), reset_token_expiry, session_version (bumped on password change/reset, invalidates older JWTs), security_question (plain text, not sensitive), security_answer_hash (bcrypt, never returned to the client), vault_attempts, vault_locked_until (NULL = not locked, future timestamp = locked until then, replaces the old delete-on-5th-attempt behavior), created_at, plus email verification and privacy consent fields',
            },
            {
              table: 'legal_documents',
              fields: 'id, user_id, document_type_enc, title_enc, held_by_enc, location_enc, notes_enc, created_at. Vault-protected (password required to list/create/update/delete). Every text field is AES-256-GCM encrypted with the vault key (SEC-03), not just access-controlled.',
            },
            {
              table: 'financial_items',
              fields: 'id, user_id, category_enc, institution_enc, account_type_enc, account_reference_enc, contact_name_enc, contact_phone_enc, notes_enc, created_at. Vault-protected, all text fields field-encrypted (SEC-03), same pattern as legal_documents.',
            },
            {
              table: 'funeral_wishes',
              fields: 'id, user_id, burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan (0/1), pre_paid_details, readings, flowers_preference, donation_charity, special_requests, notes. Single record per user (upsert). music_preferences column still exists but is no longer read or written by the UI, superseded by Songs That Define Me.',
            },
            {
              table: 'medical_wishes',
              fields: 'DEPRECATED (IDEA-32): superseded by doctors, medical_records, and donation_bank below, which its existing rows were migrated into. The table itself is left in place, empty, per this project\'s non-destructive migration convention - no route reads or writes it any more.',
            },
            {
              table: 'doctors',
              fields: 'id, user_id, gp_name, gp_phone, hospital_preference, updated_at. Single record per user. Not vault-protected (IDEA-32, split out of medical_wishes).',
            },
            {
              table: 'medical_records',
              fields: 'id, user_id, advance_care_directive (0/1), directive_location, dnr_preference, current_medications, medical_conditions, notes, updated_at. Single record per user. Not vault-protected (IDEA-32, split out of medical_wishes).',
            },
            {
              table: 'donation_bank',
              fields: 'id, user_id, organ_donation_enc, organ_donation_details_enc, updated_at (plus legacy plaintext organ_donation/organ_donation_details columns, always NULL for rows created after the one-time migration). Single record per user. Vault-protected and field-encrypted (SEC-03 pattern) - NEW to the shared vault as of IDEA-32, unlike doctors/medical_records above.',
            },
            {
              table: 'people_to_notify',
              fields: 'id, user_id, name, relationship, email, phone, notified_by, notes, created_at',
            },
            {
              table: 'property_items',
              fields: 'id, user_id, category_enc, title_enc, description_enc, location_enc, intended_recipient_enc, notes_enc, created_at. Vault-protected, all text fields field-encrypted (SEC-03).',
            },
            {
              table: 'personal_messages',
              fields: 'id, user_id, recipient_name, relationship, message (text), notes, created_at',
            },
            {
              table: 'songs_that_define_me',
              fields: 'id, user_id, deezer_id, title, artist, album, why_meaningful, added_at',
            },
            {
              table: 'life_wishes',
              fields: 'id, user_id, title, category, status (dream/planning/completed), description, notes, created_at',
            },
            {
              table: 'household_info',
              fields: 'id, user_id, category_enc, title_enc, provider_enc, account_reference_enc, contact_enc, notes_enc, created_at. Vault-protected, all text fields field-encrypted (SEC-03).',
            },
            {
              table: 'children_dependants',
              fields: 'id, user_id, name, type, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, notes, created_at',
            },
            {
              table: 'digital_vault',
              fields: 'id, user_id (unique), check_enc (JSON {ciphertext,iv,tag} of known constant to verify password). Vault password NEVER stored. Key derived via scrypt from password+userId.',
            },
            {
              table: 'digital_credentials',
              fields: 'id, user_id, service, service_url, username_enc, password_enc, notes_enc (all JSON {ciphertext,iv,tag} AES-256-GCM), created_at, updated_at',
            },
            {
              table: 'trusted_contacts',
              fields: 'id, user_id, name, email, phone, relationship, sequence (1/2/3), section_permissions (JSON array of section_id strings), access_token, token_expiry, created_at',
            },
            {
              table: 'uploaded_documents',
              fields: 'id, user_id, section_id, item_id (nullable), original_name, r2_key, size_bytes, mime_type, photo_role (null/funeral_main/funeral_gallery), uploaded_at',
            },
            {
              table: 'user_audit_logs',
              fields: 'id, user_id, action (login_success/login_failed/logout/register/password_changed/password_reset), ip_address, created_at',
            },
            {
              table: 'app_settings',
              fields: 'id, key (unique), value. Keys: site_theme, site_font, site_icon_set, site_logo (R2 key), password_reset_method (email/dob/security_question)',
            },
            {
              table: 'subscriptions',
              fields: "id, user_id (unique), plan (free/premium), status (active/past_due/cancelled/etc, mirrors Stripe's subscription status), trial_ends_at, current_period_start, current_period_end, cancelled_at, provider ('stripe' or 'admin_grant'), provider_customer_id, provider_subscription_id, provider_price_id (which Stripe Price, monthly vs annual), granted_by_admin_id (set when an admin grants honorary premium instead of a real Stripe subscription), created_at, updated_at. Live Stripe billing (server/routes/billing.js, server/routes/stripeWebhook.js).",
            },
          ].map(t => (
            <div key={t.table} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--green-900)', marginBottom: 3 }}>
                <BpTag>{t.table}</BpTag>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.6, paddingLeft: 8 }}>{t.fields}</div>
            </div>
          ))}
        </BpSection>
      </div>

      {/* 5. The 21 sections */}
      <div style={card}>
        <BpSection title="5. The 21 User Sections">
          <p className="text-muted small mb-3">Grouped into 4 dashboard groups. Each section has its own route and full CRUD via /api/sections.</p>
          {[
            { group: 'Your Legacy', color: '#C9A84C', sections: [
              { id: 'how_to_be_remembered', label: "How I'd Like to Be Remembered", route: '/sections/how-to-be-remembered', note: 'Fields on users table: life_story, about_me, remembered_for, legacy_message' },
              { id: 'personal_messages', label: 'Messages to Loved Ones', route: '/sections/messages', note: 'personal_messages table. One message per recipient.' },
              { id: 'unfinished_business', label: 'Unfinished Business', route: '/sections/unfinished-business', note: 'unfinished_business table (IDEA-19). One entry per person/topic: name, description, notes. NOT vault-protected, free-plan accessible. Access/export model deliberately mirrors personal_messages exactly (Trusted Contacts permission list, executor access, ad-hoc section share, PDF/standard export).' },
              { id: 'songs_that_define_me', label: 'Songs That Define Me', route: '/sections/songs-that-define-me', note: 'songs_that_define_me table. Deezer search via /api/deezer proxy.' },
              { id: 'life_wishes', label: 'My Bucket List', route: '/sections/lifes-wishes', note: 'life_wishes table. Status: dream/planning/completed.' },
            ]},
            { group: 'Your Wishes', color: '#5A9A5A', sections: [
              { id: 'funeral_wishes', label: 'Funeral & End-of-Life Wishes', route: '/sections/funeral-wishes', note: 'Single record per user. Also supports portrait photo (funeral_main) + up to 20 gallery photos (funeral_gallery) via uploaded_documents.' },
              { id: 'doctors', label: 'Doctors', route: '/sections/doctors', note: 'Single record per user. GP name/phone, hospital preference. Not vault-protected (IDEA-32, split out of the old Medical & Care Wishes).' },
              { id: 'medical_records', label: 'Medical Records', route: '/sections/medical-records', note: 'Single record per user. Advance care directive, DNR preference, medications, conditions, notes. Not vault-protected (IDEA-32, split out of the old Medical & Care Wishes).' },
            ]},
            { group: 'Your People', color: '#B87A50', sections: [
              { id: 'emergency_contact', label: 'Emergency Contact', route: '/sections/emergency-contact', note: 'Fields on users table: emergency_contact_name/_relationship/_phone/_email/_notes. Saved via PUT /api/users/me, not /api/sections. Does not receive plan access.' },
              { id: 'trusted_contacts', label: 'Trusted Contacts', route: '/sections/trusted-contacts', note: 'trusted_contacts table (max 3, sequence 1-3), CRUD via /api/trusted-contacts, not /api/sections. Unchanged by the IDEA-27 page split.' },
              { id: 'people_to_notify', label: 'People to Notify', route: '/sections/people-to-notify', note: 'people_to_notify table.' },
              { id: 'children-dependants', label: 'Your Loved Ones', route: '/sections/children-dependants', note: 'children_dependants table.' },
              { id: 'pet-care', label: 'Pet Care', route: '/sections/pet-care', note: 'pets table (IDEA-18, split out of Your Loved Ones).' },
            ]},
            { group: 'Your Affairs', color: '#8A7A6A', sections: [
              { id: 'legal_documents', label: 'Personal & Legal Documents', route: '/sections/legal-documents', note: 'Vault-protected. Uses shared vault (digital_vault). Text fields AES-256-GCM encrypted with the vault key. Up to 2 file attachments per item via uploaded_documents (files themselves are access-controlled and R2-at-rest encrypted, not additionally vault-key encrypted).' },
              { id: 'property_items', label: 'Property & Possessions', route: '/sections/property-possessions', note: 'Vault-protected. Uses shared vault (digital_vault). Text fields AES-256-GCM encrypted with the vault key. property_items table. Up to 2 file attachments per item via uploaded_documents.' },
              { id: 'financial_items', label: 'Financial Affairs', route: '/sections/financial-affairs', note: 'Vault-protected. Uses shared vault (digital_vault). Text fields AES-256-GCM encrypted with the vault key. financial_items table. Up to 2 file attachments per item via uploaded_documents.' },
              { id: 'digital_credentials', label: 'Digital Life', route: '/sections/digital-life', note: 'Vault-protected. digital_credentials table. Fields AES-256-GCM encrypted. Shares vault with the other Your Affairs sections.' },
              { id: 'household-info', label: 'Practical Household Information', route: '/sections/household-info', note: 'Vault-protected. Uses shared vault (digital_vault). Text fields AES-256-GCM encrypted with the vault key. household_info table. Up to 2 file attachments per item via uploaded_documents.' },
              { id: 'insurance_items', label: 'Insurance', route: '/sections/insurance', note: 'NOT vault-protected, free-plan accessible (IDEA-29). insurance_items table: policy_type, provider, policy_number, contact, beneficiary, notes. No file attachments, no encryption.' },
              { id: 'donation_bank', label: 'Donation Bank', route: '/sections/donation-bank', note: 'Vault-protected (IDEA-32, split out of the old Medical & Care Wishes - NEW to the shared vault, unlike Doctors/Medical Records). donation_bank table: organ_donation, organ_donation_details, both field-encrypted. Single record per user, read/written via POST .../donation-bank/view + PUT .../donation-bank rather than the list routes the other vault sections use.' },
            ]},
          ].map(group => (
            <div key={group.group} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: group.color, marginBottom: 8, borderBottom: `2px solid ${group.color}30`, paddingBottom: 4 }}>
                {group.group}
              </div>
              {group.sections.map(s => (
                <div key={s.id} style={{ display: 'flex', gap: 12, marginBottom: 8, paddingLeft: 8 }}>
                  <div style={{ minWidth: 220, fontSize: '0.8rem', fontWeight: 600, color: 'var(--green-900)' }}>{s.label}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{s.note}</div>
                </div>
              ))}
            </div>
          ))}
        </BpSection>
      </div>

      {/* 6. Vault system */}
      <div style={card}>
        <BpSection title="6. Vault Encryption System">
          <BpTable rows={[
            ['Algorithm', 'AES-256-GCM (authenticated encryption)'],
            ['Key derivation', 'scrypt (N=16384, r=8, p=1) from vault_password + userId. Salt = "igh-vault-v1-" + userId. Produces 32-byte key.'],
            ['Password storage', 'NEVER stored. Not even hashed. Verified by decrypting a known constant (CHECK_CONSTANT = "in-good-hands-vault-verified") stored as check_enc in digital_vault.'],
            ['Encrypted fields', 'Each field stored as JSON: {ciphertext, iv, tag} all hex-encoded. Fresh random IV per field. Covers digital_credentials and, since SEC-03, every text field in legal_documents, financial_items, property_items, and household_info too - joined by donation_bank (IDEA-32).'],
            ['Shared vault', 'Legal Documents, Digital Life, Financial Affairs, Property & Possessions, Practical Household Information, and Donation Bank (IDEA-32) all share ONE vault. Same password, same digital_vault row.'],
            ['Vault setup', 'POST /api/sections/digital-life/vault. Creates check_enc. Only works once per user.'],
            ['Vault verify', 'POST /api/sections/digital-life/vault/verify. Returns 200/401. Used to unlock UI.'],
            ['Vault reset', 'DELETE /api/sections/digital-life/vault. Requires account password. Deletes digital_credentials, digital_vault, and every row (plus R2 file attachments) across all six vault-protected tables in one transaction. Irreversible.'],
            ['Change password', 'POST /api/sections/digital-life/vault/change. Decrypts all fields with old key, re-encrypts with new key in a single transaction.'],
            ['Destructive-op re-verification (SEC-06)', 'DELETE routes on legal-documents, financial-affairs, property-possessions, and household-info now call the same checkVault() helper used by list/create/update, matching the pattern digital-life delete already used. Fixed a gap where those four DELETE routes previously required no vault password at all.'],
            ['Standard export cannot leak vault data (SEC-02)', 'generatePdf() only ever renders financial_items/property_items/household_info/legal_documents/credentials from a vaultData object populated exclusively by the vault-checked complete-export path; the standard (GET) export never has access to it, so a future code change cannot accidentally render vault content into a standard export the way it once could.'],
            ['PDF full export', 'POST /api/export with vault_password body param. Server decrypts credentials and vault-protected section data and includes them in the PDF. Vault password never appears in the response. Both export responses send Cache-Control: no-store, private so the PDF is never cached by a browser, proxy, or CDN.'],
            ['Helper file', 'server/lib/vault.js exports: deriveKey, encryptField, decryptField, createVaultCheck, verifyVaultPassword. server/lib/vaultAuth.js exports the shared checkVault() request guard used across sections.js, documents.js, and export.js.'],
          ]} />
        </BpSection>
      </div>

      {/* 7. Auth system */}
      <div style={card}>
        <BpSection title="7. Authentication & Security">
          <BpTable rows={[
            ['Auth method', 'JWT, 8-hour expiry, signed with JWT_SECRET env var. Web: httpOnly/Secure/SameSite=None cookie, never readable by client JS. Mobile: Authorization Bearer header, unchanged. See "AUTH SYSTEM" in the L2 tab for the CSRF design that goes with the cookie.'],
            ['Password hashing', 'bcryptjs, salt rounds = 10'],
            ['Rate limiting', '20 requests per 15 minutes on /api/auth routes, 200 per 15 minutes on general /api/ routes (express-rate-limit)'],
            ['CORS', 'Manual CORS implementation in server/index.js. Allows CLIENT_URL env var + localhost origins.'],
            ['Admin account', 'Seeded on startup: email="admin@igh.local", password="Admin1234". is_admin=1 flag on users table.'],
            ['Protected routes', 'requireAuth middleware in server/middleware/auth.js. Reads the JWT from an httpOnly cookie first, falling back to an Authorization Bearer header (mobile). Decodes it, attaches req.user. For cookie-authenticated mutating requests, also requires a matching X-CSRF-Token header against the csrf_token cookie (double-submit, SEC-09) - Bearer-header requests are exempt. Also rejects a still-valid token immediately (not just at next login) if: its sv claim no longer matches users.session_version (password changed/reset since issued), the account no longer exists (hard delete), an org-role account has been deactivated (is_active=0) since the token was issued, or is_admin no longer matches the token (no promote/demote feature exists yet, but the check is already in place for when one does).'],
            ['Audit log', 'user_audit_logs table. Logs: login_success, login_failed, logout, register, password_changed, password_reset_requested, password_reset_denied.'],
            ['Error monitoring', 'Sentry (@sentry/node), initialised in instrument.js before any other import. Server errors reported automatically via the Express error handler.'],
            ['Error responses (SEC-08)', 'The global Express error handler (server/index.js) is gated on NODE_ENV: in production (set on both the staging and production Render services) it returns a generic {error: "Something went wrong...", code: "INTERNAL_ERROR"} instead of the raw err.message, since that could otherwise leak SQL fragments, table/column names, or other internal detail. Full detail is still logged server-side via console.error and reported to Sentry either way; only true local development sees the raw message.'],
            ['Org portal gating (SEC-12)', 'The org/funeral-home portal routes (organizations.js, orgPortal.js, orgPublic.js, orgRegister.js) are only require()\'d and registered at all when process.env.ORG_PORTAL_ENABLED === "true" (server/index.js). Unset in production, so those routes do not exist to be hit rather than merely being auth-rejected. Enabled on staging/local dev for continued testing.'],
            ['Password reset', 'Always emailed, single-use, expires in 30 minutes. Token stored in users.reset_token as a SHA-256 hash (not the raw value) + reset_token_expiry; never returned in an API response. Admin can optionally also require date of birth or a security question as an additional check before that email is sent, never as an alternate path (fixed under SEC-04, which closed a prior gap where DOB alone could issue a reset token). POST /api/auth/forgot-password/question always returns a question (real or a deterministic decoy) so it can\'t be used to enumerate accounts. Also rate-limited per email address (5 requests / 15 min) independent of the general per-IP auth limiter.'],
          ]} />
        </BpSection>
      </div>

      {/* 8. File storage */}
      <div style={card}>
        <BpSection title="8. File Storage (Cloudflare R2)">
          <BpTable rows={[
            ['Library', '@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner. R2 is S3-compatible.'],
            ['Helper', 'server/lib/r2.js exports: uploadFile({key, buffer, mimeType}), getDownloadUrl(key), deleteFile(key), getFileBuffer(key), listKeys(prefix)'],
            ['Backups', 'server/lib/backup.js uses listKeys("backups/") to enumerate and prune old database backups stored in the same bucket.'],
            ['Key format', '{userId}/{sectionId}/{uuid}.{ext} for documents. {userId}/{sectionId}/photos/{uuid}.{ext} for photos.'],
            ['Signed URLs', '1-hour expiry. Generated fresh on each GET request. Never stored.'],
            ['File types', 'Documents: PDF, JPEG, PNG, HEIC, WebP, DOC, DOCX (max 20MB). Photos: JPEG, PNG, HEIC, WebP (max 15MB).'],
            ['Photo roles', 'funeral_main: 1 per user per section (old one deleted on upload). funeral_gallery: max 20 per section.'],
            ['Item attachments', '1-2 files per item_id, optional. Available in Legal Documents, Financial Affairs, Property & Possessions, and Household Info (section_id = legal_documents / financial_items / property_items / household_info). item_id stored in uploaded_documents.'],
            ['Logo', 'Admin can upload logo via /api/documents/upload with section_id="site_logo". R2 key stored in app_settings key=site_logo.'],
          ]} />
        </BpSection>
      </div>

      {/* 9. PDF export */}
      <div style={card}>
        <BpSection title="9. PDF Export">
          <BpTable rows={[
            ['Library', 'PDFKit 0.18. Streamed directly to HTTP response.'],
            ['Format', 'A4 two-column layout. Margin=50pt, Gutter=14pt, ColW=(595.28-100-14)/2 = 240.64pt.'],
            ['Standard export', 'GET /api/export. Includes all non-vault sections. Vault sections shown as a locked notice at the end.'],
            ['Full export', 'POST /api/export with {vault_password}. Vault password verified, credentials decrypted, all sections included. Shows sensitive data warning box.'],
            ['Theme support', 'Reads site_theme and site_font from app_settings. THEME_PALETTES and getFonts() in generatePdf.js map to PDFKit built-in fonts (Times/Helvetica).'],
            ['Logo support', 'Reads site_logo from app_settings, fetches buffer via getFileBuffer(), embeds on cover page.'],
            ['Cover page', 'Dark header band, logo/brand name, user name, document date, legal disclaimer.'],
            ['Content pages', '6 pages covering all 21 sections grouped logically.'],
            ['Item cards', 'renderCardAt() renders a single item card at explicit (x,y). renderCards() places cards in 2-column grid with page-break logic.'],
            ['UI for export', 'ExportPage.jsx at /export. Two cards: standard and complete. Warm language and sensitive data warning.'],
          ]} />
        </BpSection>
      </div>

      {/* 10. Trusted contacts & inactivity */}
      <div style={card}>
        <BpSection title="10. Trusted Contacts and Inactivity Timer">
          <BpTable rows={[
            ['Trusted contacts', 'Up to 3 per user. Stored in trusted_contacts table with sequence 1/2/3.'],
            ['Section permissions', 'Per-contact JSON array of section_id strings. Admin of which sections each contact can view.'],
            ['Access link', 'POST /api/trusted-contacts/:id/access-link sends a signed link via Resend email. token and expires_at stored in trusted_contact_tokens. 72-hour expiry for non-Legacy-Contact contacts; expires_at is NULL (never expires) for the Legacy Contact.'],
            ['Access page', 'GET /access/:token (public, no auth). Renders read-only view of permitted sections. Uses AccessPage.jsx.'],
            ['Digital credentials', 'Always excluded from trusted contact access (encrypted, no server-side key).'],
            ['Inactivity timer', 'Users set inactivity_period_months (2/3/6/12/18/24). Last login stored in users.last_active_at.'],
            ['Daily check', 'server/lib/inactivityTimer.js runs daily at 8am (node-cron). Checks days since last_active_at against period.'],
            ['Reminder emails', 'Sent when 30 days, 14 days, 7 days, 3 days, and 1 day remain. Uses inactivityReminderEmail template.'],
            ['On expiry', 'When daysLeft < 0, notifyExecutor (if one is designated) or notifyTrustedContacts is called. Emails eligible contacts their access links: 72-hour for non-Legacy-Contacts, non-expiring for the Legacy Contact. inactivity_contacts_notified_at updated. Re-notification cooldown: 30 days. Reset on next login.'],
          ]} />
        </BpSection>
      </div>

      {/* 11. Admin panel */}
      <div style={card}>
        <BpSection title="11. Admin Panel">
          <BpTable rows={[
            ['Access', 'is_admin=1 users only. Redirects to /profile for regular users. Admin nav link shown in NavBar.'],
            ['Overview tab', 'Stats: total users, new this month, logins (7 days), total entries across all section tables.'],
            ['Users tab', 'Sorted newest signup first, paginated 20 per page with Previous/Next. Search by name/email resets to page 1. Click user to open detail modal: all profile fields, section completion counts, audit log, send access link, reset password, delete account.'],
            ['Activity tab', 'Recent audit log with action labels, IP, and timestamps.'],
            ['Appearance tab', 'Choose color theme (9 options), font (6 options), icon set (3 options). Changes apply live via CSS variables.'],
            ['Settings tab', 'Password reset method: email link, optionally plus a date-of-birth or security-question check before the link is sent.'],
            ['Marketing tab', 'GET /api/admin/marketing/campaigns returns a hardcoded list of the campaign landing pages (client/lp/*.html, one per Google Ads audience segment) plus a live GROUP BY acquisition_source query against the users table. acquisition_source is set only by the landing pages\' own signup form (server/routes/auth.js), never by the regular in-app registration flow.'],
            ['App Blueprint tab', 'Three-level documentation: L1 Feature Overview, L2 Product Specification, L3 Technical Reference. PDF download and rebuild prompt download.'],
            ['Theme storage', 'app_settings table keys: site_theme, site_font, site_icon_set, site_logo.'],
            ['Themes available', 'Forest, Dusk, Terracotta, Ocean, Rose Garden, Midnight, High Contrast, Soft Mist, Keepsake, Heirloom, Storybook.'],
            ['Fonts available', 'Georgia, Lora, Playfair Display, Merriweather, Inter, Open Sans.'],
            ['Icon sets', 'Classic, Heritage, Modern. Applied to dashboard section card icons.'],
            ['Design tokens', 'Card radius, card border style, button radius/CTA color, and progress-bar fill color are all CSS custom properties driven per theme (--card-radius, --card-border-style, --btn-radius, --btn-cta-bg, --progress-fill, etc.), rather than hardcoded per page. Keepsake is the first theme to use a non-default radius/border combination (dotted stitched-border cards, folded-corner hero panel).'],
            ['SectionHero component', 'client/src/components/SectionHero.jsx gives all 21 section pages (and the Dashboard) the same hero-panel treatment, so a theme like Keepsake can restyle every section consistently from one shared component.'],
          ]} />
        </BpSection>
      </div>

      {/* 12. API reference */}
      <div style={card}>
        <BpSection title="12. Key API Endpoints">
          <BpCode>{`AUTH          POST /api/auth/login, /register, /logout (login/register set the httpOnly session cookie + csrf_token cookie; logout clears both; the response body still includes the raw token too, for mobile only - web ignores it)
              POST /api/auth/forgot-password, /reset-password
              POST /api/auth/forgot-password/question (fetch the prompt for security-question mode; always returns a question, real or decoy)
              GET  /api/auth/check (validate JWT)

USERS         GET/PUT /api/users/me (profile)
              PUT /api/users/me/timer (inactivity period)
              PUT /api/users/me/emergency-contact
              PUT/DELETE /api/users/me/security-question (requires current_password to set/change/remove)

SECTIONS      GET /api/sections/completion (counts per section)
              POST/PUT/DELETE /api/sections/legal-documents
              POST /api/sections/legal-documents/list (vault auth, only way to read)
              POST/PUT/DELETE /api/sections/financial-affairs
              POST /api/sections/financial-affairs/list (vault auth, only way to read)
              GET/PUT /api/sections/funeral-wishes
              GET/PUT /api/sections/doctors
              GET/PUT /api/sections/medical-records
              PUT /api/sections/donation-bank (vault auth)
              POST /api/sections/donation-bank/view (vault auth, only way to read)
              GET/POST/PUT/DELETE /api/sections/people-to-notify
              POST/PUT/DELETE /api/sections/property-possessions
              POST /api/sections/property-possessions/list (vault auth, only way to read)
              GET/POST/PUT/DELETE /api/sections/personal-messages
              GET/POST/PUT/DELETE /api/sections/songs-that-define-me
              GET/POST/PUT/DELETE /api/sections/life-wishes
              POST/PUT/DELETE /api/sections/household-info
              POST /api/sections/household-info/list (vault auth, only way to read)
              GET/POST/PUT/DELETE /api/sections/children-dependants
              GET/PUT             /api/users/me (emergency contact fields)
              GET/POST/PUT/DELETE /api/trusted-contacts (trusted contacts)

VAULT         POST /api/sections/digital-life/vault (setup)
              POST /api/sections/digital-life/vault/verify
              POST /api/sections/digital-life/vault/change
              DELETE /api/sections/digital-life/vault (reset)
              GET/POST/PUT/DELETE /api/sections/digital-life/credentials

DOCUMENTS     POST /api/documents/upload (multipart: file, section_id, item_id, vault_password if protected)
              POST /api/documents/:section_id (list; vault_password in body if protected)
              POST /api/documents/download/:id (signed URL; vault_password in body if protected)
              DELETE /api/documents/:id (vault_password in body if protected)
              POST /api/documents/photos/upload (photo_role required, vault_password if protected)
              POST /api/documents/photos/:section_id (vault_password in body if protected)
              List/download/delete/photos routes use POST rather than GET wherever a
              vault_password may need to travel, so it never ends up in a query string.
              Which sections are "protected" is a single list in server/lib/vaultSections.js,
              derived from the document's own section_id server-side, never trusted from the
              client - see SEC-01 in the security backlog.

EXPORT        GET  /api/export (standard, no vault)
              POST /api/export {vault_password} (full, with vault)

TRUSTED       GET/POST/PUT/DELETE /api/trusted-contacts
              PUT  /api/trusted-contacts/:id/permissions
              POST /api/trusted-contacts/:id/access-link

ACCESS        GET  /api/access/:token (public)

BILLING       GET  /api/billing/plans (public, plan/feature copy for the Upgrade page)
              GET  /api/billing/subscription (current user's plan, status, period dates)
              GET  /api/billing/access (quick {plan, is_premium} check)
              POST /api/billing/create-checkout-session {plan: 'monthly'|'annual'}
              POST /api/billing/cancel (sets cancel_at_period_end, access continues to period end)
              POST /api/billing/reinstate (reverses cancel_at_period_end)
              GET/DELETE /api/billing/payment-methods
              POST /api/billing/webhook (Stripe webhook, mounted with express.raw() before
              the global JSON parser - see server/index.js)

ADMIN         GET  /api/admin/stats
              GET  /api/admin/users, GET /api/admin/users/:id
              GET  /api/admin/users/:id/activity
              POST /api/admin/users/:id/verify-email
              POST /api/admin/users/:id/reset-password
              POST /api/admin/users/:id/grant-premium (honorary premium, tagged provider='admin_grant')
              POST /api/admin/users/:id/revoke-premium
              DELETE /api/admin/users/:id
              GET  /api/admin/backups (list database backups in R2)
              POST /api/admin/backups/run (manually trigger a backup)
              GET/POST /api/admin/versions (client/admin/org_portal semver change log)

SETTINGS      GET  /api/settings (public)
              PUT  /api/settings (admin only)

CONTACT       POST /api/contact (footer feedback form)`}
          </BpCode>
        </BpSection>
      </div>

      {/* 13. Email templates */}
      <div style={card}>
        <BpSection title="13. Email System">
          <BpTable rows={[
            ['Provider', 'Resend API. Key in RESEND_API_KEY env var. From address: FROM_EMAIL env var. Known issue: if FROM_EMAIL is unset, it falls back to Resend\'s shared sandbox address, which only delivers to the Resend account owner\'s own inbox, silently dropping delivery to everyone else. A verified custom domain must be set up in Resend and FROM_EMAIL configured before email delivery works for real users.'],
            ['Helper', 'server/lib/sendEmail.js. Silently skips if RESEND_API_KEY not set (dev mode).'],
            ['Templates', 'server/lib/emailTemplates.js. All HTML with inline styles.'],
            ['welcomeEmail', 'Sent on registration. Warm welcome, link to log in.'],
            ['passwordResetEmail', 'Sent on forgot-password request. Reset link valid 30 minutes.'],
            ['inactivityReminderEmail', 'Sent by inactivity timer. Includes days remaining, reset-timer CTA.'],
            ['contactAccessEmail', 'Sent to a non-Legacy-Contact trusted contact when user clicks "Send access link". 72-hour link.'],
            ['inactivityContactNotificationEmail', 'Sent to trusted contacts when the inactivity timer expires. Warm tone, advises reaching person directly first, includes the access link (72-hour for non-Legacy-Contacts, non-expiring for the Legacy Contact).'],
            ['executorInviteEmail / executorReportedInviteEmail', 'Sent to the designated Legacy Contact when the inactivity timer expires, or when someone uses Report a Passing. Non-expiring access link.'],
            ['vaultAttemptEmail', 'Sent to user on every vault failure, with an added notice from the 5th (force-logout warning, and a 3-minute lockout notice, not deletion).'],
            ['Footer contact form', `POST /api/contact sends admin notification email. Subject: "${appName}: {type}"`],
          ]} />
        </BpSection>
      </div>

      {/* 14. Env vars */}
      <div style={card}>
        <BpSection title="14. Environment Variables">
          <BpCode>{`SERVER (Render Web Service)
  PORT               3001 (default)
  DATABASE_URL       PostgreSQL connection string (Render managed Postgres)
  JWT_SECRET         [set in Render dashboard]
  CLIENT_URL         https://performance-client.onrender.com
  RESEND_API_KEY     [set in Render dashboard]
  FROM_EMAIL         Verified sender address, e.g. "In Good Hands <noreply@yourdomain.com>"
                     (optional but important: falls back to a Resend sandbox address
                     that only delivers to the account owner if unset)
  R2_ACCESS_KEY_ID   R2 API key
  R2_SECRET_ACCESS_KEY R2 API secret
  R2_BUCKET_NAME     Bucket name
  R2_ENDPOINT        https://{account_id}.r2.cloudflarestorage.com
  SENTRY_DSN         [optional] Sentry project DSN, enables server error monitoring
  STRIPE_SECRET_KEY  Live-mode secret key
  STRIPE_PRICE_MONTHLY  Price ID for Premium Monthly ($10/mo)
  STRIPE_PRICE_ANNUAL   Price ID for Premium Annual ($100/yr)
  STRIPE_WEBHOOK_SECRET Signing secret for the /api/billing/webhook endpoint
  ORG_PORTAL_ENABLED [optional] "true" to register the org/funeral-home portal
                     routes; unset (default) in production, "true" on staging

CLIENT (Render Static Site, baked in at build time)
  VITE_API_URL       https://performance-api-djuk.onrender.com/api
  VITE_SENTRY_DSN    [optional] Sentry project DSN, enables client error monitoring`}
          </BpCode>
        </BpSection>
      </div>

      {/* 15. Key design decisions */}
      <div style={card}>
        <BpSection title="15. Key Design Decisions and Constraints">
          <BpTable rows={[
            ['No em-dashes', 'Never use em-dashes (—) anywhere in the application. Use commas, colons, or periods instead.'],
            ['Vault password not stored', 'The vault password is never stored or hashed on the server. Loss of the vault password means permanent loss of vault data. This is by design and communicated clearly to users.'],
            ['Shared vault', 'Legal Documents, Digital Life, Financial Affairs, Property & Possessions, Practical Household Information, and Donation Bank all use one vault. One password protects all six. Set up via the Digital Life section or Legal Documents section; managed in My Profile.'],
            ['Trusted contact access', 'Only a signed link is used, no separate trusted contact login credentials. 72-hour expiry for non-Legacy-Contact contacts; the designated Legacy Contact\'s link never expires. Trusted contacts cannot access digital credentials (vault) ever.'],
            ['PDF streaming', 'PDFKit pipes directly to the HTTP response stream. No temp files. Vault password for full export comes as POST body, never in URL.'],
            ['PostgreSQL on Render', 'Managed Postgres, paid Basic plan, connected via a pg.Pool connection pool. SSL required for any non-localhost connection.'],
            ['Database backups', 'Nightly cron (3am) dumps every table to a gzipped JSON snapshot in R2, retaining the last 14 backups. Manual trigger and listing available via admin-only endpoints.'],
            ['Error monitoring', 'Sentry on both server (@sentry/node) and client (@sentry/react with an ErrorBoundary). Optional: the app runs fine without SENTRY_DSN/VITE_SENTRY_DSN set, it just means errors go unreported.'],
            ['Static site direct navigation', 'Render static sites need an explicit Redirects/Rewrites rule (/* to /index.html, action Rewrite) in the dashboard. A _redirects file alone is not sufficient; without the dashboard rule, direct navigation to any client route 404s.'],
            ['No admin panel in mobile', 'Admin features are web-only. Mobile app (Expo) is user-facing only.'],
            ['Deezer music search', 'Proxied via /api/deezer to avoid CORS and hide any future API keys. Songs used for "Songs That Define Me" section, not funeral songs (different section).'],
            ['American English', 'All copy uses American spelling and en-US date formats (toLocaleDateString("en-US")). Migrated 2026-08-05 from an earlier Australian English holdover (OPS-02).'],
            ['Bootstrap primary', '--bs-primary and --bs-primary-rgb CSS vars overridden per theme so Bootstrap components (buttons, links) match the chosen palette.'],
          ]} />
        </BpSection>
      </div>

      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', paddingTop: 8, paddingBottom: 4 }}>
        {appName}: Application Blueprint v1.0. Generated for LLM-assisted recreation and handoff.
      </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTabRaw] = useState(() => {
    const fromUrl = searchParams.get('tab')
    return TABS.includes(fromUrl) ? fromUrl : 'Overview'
  })
  // Wraps the raw tab setter so the URL (?tab=Users) stays in sync, giving admins a
  // reloadable/shareable link to a specific section instead of always landing on Overview.
  const setTab = (t) => {
    setTabRaw(t)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (t === 'Overview') next.delete('tab')
      else next.set('tab', t)
      return next
    }, { replace: true })
  }
  const [stats, setStats]       = useState(null)
  const [users, setUsers]       = useState([])
  const [query, setQuery]       = useState('')
  const [usersOffset, setUsersOffset] = useState(0)
  const [usersTotal, setUsersTotal]   = useState(0)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [settings, setSettings] = useState({})
  const [alert, setAlert]       = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [loadingUser, setLoadingUser]   = useState(false)
  const [confirmDelete, setConfirmDelete]     = useState(null)
  const [resetPwUser, setResetPwUser]         = useState(null)
  const [resetPwValue, setResetPwValue]       = useState('')
  const [resetPwConfirm, setResetPwConfirm]   = useState('')
  const [resetPwSaving, setResetPwSaving]     = useState(false)
  const [resetPwError, setResetPwError]       = useState('')
  const [premiumSaving, setPremiumSaving]     = useState(false)
  const [verifyingEmail, setVerifyingEmail]   = useState(false)

  // Activity tab state
  const [activityQuery, setActivityQuery]   = useState('')
  const [activityUsers, setActivityUsers]   = useState([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [activityUser, setActivityUser]     = useState(null)
  const [activityLog, setActivityLog]       = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityFilter, setActivityFilter] = useState('')
  const [activityTotal, setActivityTotal]   = useState(0)
  const activityTimeout = useRef(null)

  // Versions tab state
  const [versions, setVersions]           = useState([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [marketingData, setMarketingData]     = useState(null)
  const [loadingMarketing, setLoadingMarketing] = useState(false)
  const [newVersion, setNewVersion]       = useState({ module: 'client', version: '', summary: '' })
  const [versionSaving, setVersionSaving] = useState(false)
  const [versionError, setVersionError]   = useState('')
  const [runningInactivityCheck, setRunningInactivityCheck] = useState(false)

  // Security tab state
  const [findings, setFindings]           = useState([])
  const [loadingFindings, setLoadingFindings] = useState(false)
  const [findingFilter, setFindingFilter] = useState('all')
  const [newFinding, setNewFinding]       = useState({ title: '', category: 'other', severity: 'medium', status: 'open', summary: '', details: '', source: '', related_link: '' })
  const [findingSaving, setFindingSaving] = useState(false)
  const [findingError, setFindingError]   = useState('')

  // Contact tab state (IDEA-09: contact-form submission inbox)
  const [submissions, setSubmissions]           = useState([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [submissionFilter, setSubmissionFilter] = useState('all')
  const [confirmDeleteSubmission, setConfirmDeleteSubmission] = useState(null)

  const runInactivityCheckNow = async () => {
    setRunningInactivityCheck(true)
    try {
      await axios.post(`${API}/admin/inactivity-check/run`)
      showAlert('success', 'Inactivity check complete. Any lapsed timers have been processed.')
    } catch {
      showAlert('danger', "Couldn't run the inactivity check.")
    }
    setRunningInactivityCheck(false)
  }

  const showAlert = (type, msg) => {
    setAlert({ type, msg })
    setTimeout(() => setAlert(null), 4000)
  }

  // Load stats + settings on mount
  useEffect(() => {
    Promise.all([
      axios.get(`${API}/admin/stats`),
      axios.get(`${API}/settings`),
    ]).then(([sr, settingsRes]) => {
      setStats(sr.data)
      setSettings(settingsRes.data)
    }).catch(() => showAlert('danger', "Couldn't load admin data."))
  }, [])

  // Load users when switching to Users tab, searching, or paging
  useEffect(() => {
    if (tab !== 'Users') return
    setLoadingUsers(true)
    axios.get(`${API}/admin/users`, {
      params: { q: query || undefined, limit: USERS_PAGE_SIZE, offset: usersOffset }
    })
      .then(r => { setUsers(r.data.users); setUsersTotal(r.data.total) })
      .catch(() => showAlert('danger', "Couldn't load users."))
      .finally(() => setLoadingUsers(false))
  }, [tab, query, usersOffset])

  // A new search should always land back on page 1.
  const updateUserSearch = (value) => {
    setQuery(value)
    setUsersOffset(0)
  }

  // Load version log when switching to Versions tab
  useEffect(() => {
    if (tab !== 'Versions') return
    setLoadingVersions(true)
    axios.get(`${API}/admin/versions`)
      .then(r => setVersions(r.data))
      .catch(() => showAlert('danger', "Couldn't load version history."))
      .finally(() => setLoadingVersions(false))
  }, [tab])

  // Load campaign/signup-source data when switching to Marketing tab
  useEffect(() => {
    if (tab !== 'Marketing') return
    setLoadingMarketing(true)
    axios.get(`${API}/admin/marketing/campaigns`)
      .then(r => setMarketingData(r.data))
      .catch(() => showAlert('danger', "Couldn't load marketing data."))
      .finally(() => setLoadingMarketing(false))
  }, [tab])

  // Load findings when switching to Security tab
  useEffect(() => {
    if (tab !== 'Security') return
    setLoadingFindings(true)
    axios.get(`${API}/admin/security-findings`)
      .then(r => setFindings(r.data))
      .catch(() => showAlert('danger', "Couldn't load security findings."))
      .finally(() => setLoadingFindings(false))
  }, [tab])

  // Load contact-form submissions when switching to Contact tab
  useEffect(() => {
    if (tab !== 'Contact') return
    setLoadingSubmissions(true)
    axios.get(`${API}/admin/contact-submissions`)
      .then(r => setSubmissions(r.data))
      .catch(() => showAlert('danger', "Couldn't load contact submissions."))
      .finally(() => setLoadingSubmissions(false))
  }, [tab])

  const addFinding = async () => {
    setFindingError('')
    if (!newFinding.title.trim()) return setFindingError('A title is required.')
    if (!newFinding.summary.trim()) return setFindingError('A short summary is required.')
    setFindingSaving(true)
    try {
      await axios.post(`${API}/admin/security-findings`, {
        ...newFinding,
        title: newFinding.title.trim(),
        summary: newFinding.summary.trim(),
        details: newFinding.details.trim() || null,
        source: newFinding.source.trim() || null,
        related_link: newFinding.related_link.trim() || null,
      })
      setNewFinding({ title: '', category: 'other', severity: 'medium', status: 'open', summary: '', details: '', source: '', related_link: '' })
      const r = await axios.get(`${API}/admin/security-findings`)
      setFindings(r.data)
      showAlert('success', 'Finding logged.')
    } catch (err) {
      setFindingError(err.response?.data?.error || "Couldn't save this finding.")
    }
    setFindingSaving(false)
  }

  const updateFindingStatus = async (id, status) => {
    try {
      await axios.put(`${API}/admin/security-findings/${id}`, { status })
      setFindings(fs => fs.map(f => f.id === id ? { ...f, status, resolved_at: status === 'resolved' ? new Date().toISOString() : f.resolved_at } : f))
    } catch {
      showAlert('danger', "Couldn't update this finding's status.")
    }
  }

  const markSubmissionStatus = async (id, status) => {
    try {
      await axios.put(`${API}/admin/contact-submissions/${id}`, { status })
      setSubmissions(s => s.map(x => x.id === id ? { ...x, status } : x))
    } catch {
      showAlert('danger', "Couldn't update this submission.")
    }
  }

  const deleteSubmission = async (id) => {
    try {
      await axios.delete(`${API}/admin/contact-submissions/${id}`)
      setConfirmDeleteSubmission(null)
      setSubmissions(s => s.filter(x => x.id !== id))
      showAlert('success', 'Submission deleted.')
    } catch {
      showAlert('danger', "Couldn't delete this submission.")
    }
  }

  const addVersion = async () => {
    setVersionError('')
    if (!/^\d+\.\d+\.\d+$/.test(newVersion.version.trim())) {
      return setVersionError('Version must be in MAJOR.MINOR.PATCH format, e.g. 1.4.2.')
    }
    if (!newVersion.summary.trim()) {
      return setVersionError('A short summary of the change is required.')
    }
    setVersionSaving(true)
    try {
      await axios.post(`${API}/admin/versions`, {
        module:  newVersion.module,
        version: newVersion.version.trim(),
        summary: newVersion.summary.trim(),
      })
      setNewVersion({ module: newVersion.module, version: '', summary: '' })
      const r = await axios.get(`${API}/admin/versions`)
      setVersions(r.data)
      showAlert('success', 'Version logged.')
    } catch (err) {
      setVersionError(err.response?.data?.error || "Couldn't save this version entry.")
    }
    setVersionSaving(false)
  }

  const openUser = async (id) => {
    setLoadingUser(true)
    setSelectedUser(null)
    try {
      const r = await axios.get(`${API}/admin/users/${id}`)
      setSelectedUser(r.data)
    } catch {
      showAlert('danger', "Couldn't load user details.")
    }
    setLoadingUser(false)
  }

  const deleteUser = async (id) => {
    try {
      await axios.delete(`${API}/admin/users/${id}`)
      setConfirmDelete(null)
      setSelectedUser(null)
      setUsers(u => u.filter(x => x.id !== id))
      setUsersTotal(t => Math.max(0, t - 1))
      setStats(s => s ? { ...s, total_users: s.total_users - 1 } : s)
      showAlert('success', 'User deleted.')
    } catch {
      showAlert('danger', "Couldn't delete user.")
    }
  }

  const grantPremium = async (id) => {
    setPremiumSaving(true)
    try {
      await axios.post(`${API}/admin/users/${id}/grant-premium`)
      const r = await axios.get(`${API}/admin/users/${id}`)
      setSelectedUser(r.data)
      setUsers(u => u.map(x => x.id === id ? { ...x, plan: 'premium', is_honorary: true } : x))
      showAlert('success', 'Honorary premium granted.')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || "Couldn't grant premium.")
    }
    setPremiumSaving(false)
  }

  const revokePremium = async (id) => {
    setPremiumSaving(true)
    try {
      await axios.post(`${API}/admin/users/${id}/revoke-premium`)
      const r = await axios.get(`${API}/admin/users/${id}`)
      setSelectedUser(r.data)
      setUsers(u => u.map(x => x.id === id ? { ...x, plan: 'free', is_honorary: false } : x))
      showAlert('success', 'Premium revoked.')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || "Couldn't revoke premium.")
    }
    setPremiumSaving(false)
  }

  const revertDeceased = async (id) => {
    setPremiumSaving(true)
    try {
      await axios.post(`${API}/admin/users/${id}/revert-deceased`)
      const r = await axios.get(`${API}/admin/users/${id}`)
      setSelectedUser(r.data)
      setUsers(u => u.map(x => x.id === id ? { ...x, is_deceased: false, deceased_at: null } : x))
      showAlert('success', 'Deceased status reverted.')
    } catch (err) {
      showAlert('danger', err.response?.data?.error || "Couldn't revert this.")
    }
    setPremiumSaving(false)
  }

  const saveSetting = async (key, value) => {
    try {
      await axios.put(`${API}/settings/${key}`, { value })
      setSettings(s => ({ ...s, [key]: value }))
      showAlert('success', 'Setting saved.')
      // For theme/font, apply immediately
      if (key === 'site_theme') applyTheme(value)
      if (key === 'site_font')  applyFont(value)
    } catch {
      showAlert('danger', "Couldn't save setting.")
    }
  }

  // Search users for Activity tab
  const searchActivityUsers = (q) => {
    setActivityQuery(q)
    clearTimeout(activityTimeout.current)
    if (!q.trim()) { setActivityUsers([]); return }
    activityTimeout.current = setTimeout(() => {
      setLoadingActivity(true)
      // High limit here: this is a quick-pick search, not the paginated
      // Users tab list, so it should keep showing every match at once.
      axios.get(`${API}/admin/users`, { params: { q, limit: 200 } })
        .then(r => setActivityUsers(r.data.users))
        .catch(() => {})
        .finally(() => setLoadingActivity(false))
    }, 300)
  }

  const loadActivityLog = async (user, filter = '') => {
    setActivityUser(user)
    setActivityFilter(filter)
    setActivityLoading(true)
    setActivityLog([])
    try {
      const r = await axios.get(`${API}/admin/users/${user.id}/activity`, {
        params: { limit: 100, ...(filter ? { action: filter } : {}) }
      })
      setActivityLog(r.data.rows)
      setActivityTotal(r.data.total)
    } catch {
      showAlert('danger', "Couldn't load activity log.")
    }
    setActivityLoading(false)
  }

  const handleResetPassword = async () => {
    if (resetPwValue.length < 8) return setResetPwError('Password must be at least 8 characters.')
    if (resetPwValue !== resetPwConfirm) return setResetPwError('Passwords do not match.')
    setResetPwError('')
    setResetPwSaving(true)
    try {
      await axios.post(`${API}/admin/users/${resetPwUser.id}/reset-password`, { new_password: resetPwValue })
      setResetPwUser(null)
      setResetPwValue('')
      setResetPwConfirm('')
      showAlert('success', `Password reset for ${resetPwUser.name}.`)
    } catch (err) {
      setResetPwError(err.response?.data?.error || "Couldn't reset password.")
    }
    setResetPwSaving(false)
  }

  const formatDate = iso => {
    if (!iso) return 'N/A'
    try {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    catch { return iso }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="mb-4">
        <h3 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif' }}>Admin Dashboard</h3>
      </div>

      {alert && (
        <Alert variant={alert.type} dismissible onClose={() => setAlert(null)} className="mb-4">
          {alert.msg}
        </Alert>
      )}

      {/* Tab bar: Overview stays a pinned button, every other section lives in the dropdown below. */}
      <div className="d-flex gap-2 mb-4 flex-wrap align-items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button onClick={() => setTab('Overview')}
          style={{
            padding: '6px 18px', borderRadius: 20, border: '1px solid',
            fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
            borderColor: tab === 'Overview' ? 'var(--green-800)' : 'var(--border)',
            background: tab === 'Overview' ? 'var(--green-800)' : 'transparent',
            color: tab === 'Overview' ? '#fff' : 'var(--text-muted)',
          }}>
          Overview
        </button>

        <Dropdown onSelect={(key) => key && setTab(key)}>
          <Dropdown.Toggle
            id="admin-section-dropdown"
            variant="outline-secondary"
            style={{
              padding: '6px 18px', borderRadius: 20, border: '1px solid',
              fontSize: '0.9rem', fontFamily: 'inherit',
              borderColor: tab !== 'Overview' ? 'var(--green-800)' : 'var(--border)',
              background: tab !== 'Overview' ? 'var(--green-800)' : 'transparent',
              color: tab !== 'Overview' ? '#fff' : 'var(--text-muted)',
            }}>
            {tab !== 'Overview' ? tab : 'More sections'}
          </Dropdown.Toggle>
          <Dropdown.Menu style={{ background: 'var(--parchment)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
            {DROPDOWN_TABS.map(t => (
              <Dropdown.Item key={t} eventKey={t} active={tab === t}
                style={{
                  fontSize: '0.9rem', fontFamily: 'inherit',
                  color: tab === t ? '#fff' : 'var(--green-900)',
                  background: tab === t ? 'var(--green-800)' : 'transparent',
                }}>
                {t}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {/* ── Overview ───────────────────────────────────────────────────────── */}
      {tab === 'Overview' && (
        <div>
          <Row className="g-3 mb-4">
            {[
              { label: 'Total users',     value: stats?.total_users     ?? 'N/A' },
              { label: 'New this month',  value: stats?.new_this_month  ?? 'N/A' },
              { label: 'Logins (7 days)', value: stats?.recent_logins   ?? 'N/A' },
              { label: 'Total entries',   value: stats?.total_entries   ?? 'N/A' },
            ].map(s => (
              <Col key={s.label} xs={6} md={3}>
                <div style={{
                  background: 'var(--parchment)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '18px 20px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--green-900)' }}>{s.value}</div>
                  <div className="text-muted small mt-1">{s.label}</div>
                </div>
              </Col>
            ))}
          </Row>
          <p className="text-muted small">
            Switch to the Users tab to search and manage individual accounts.
          </p>
        </div>
      )}

      {/* ── Users ──────────────────────────────────────────────────────────── */}
      {tab === 'Users' && (
        <div>
          <div className="mb-3" style={{ maxWidth: 360 }}>
            <Form.Control
              placeholder="Search by name or email..."
              value={query}
              onChange={e => updateUserSearch(e.target.value)}
            />
          </div>

          {loadingUsers ? (
            <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
          ) : users.length === 0 ? (
            <p className="text-muted">No users found.</p>
          ) : (
            <div>
              {users.map(u => (
                <div key={u.id} className="section-card" style={{ cursor: 'pointer' }}
                  onClick={() => openUser(u.id)}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{u.name}</span>
                      <span className="text-muted small ms-2">{u.email}</span>
                      {u.plan === 'premium' && (
                        <span className="ms-2" style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          background: u.is_honorary ? 'var(--gold-50, #FBF3E4)' : 'var(--green-50)',
                          border: `1px solid ${u.is_honorary ? 'var(--gold-light, #E8D8A8)' : 'var(--green-100)'}`,
                          color: u.is_honorary ? 'var(--gold-dark, #8A6A2A)' : 'var(--green-800)',
                        }}>
                          {u.is_honorary ? 'HONORARY PREMIUM' : 'PREMIUM'}
                        </span>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-3">
                      <span className="text-muted small">{u.total_entries} entries</span>
                      <span className="text-muted small">Joined {formatDate(u.created_at)}</span>
                      <span style={{ color: 'var(--green-700)', fontSize: '0.85rem' }}>View →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingUsers && usersTotal > USERS_PAGE_SIZE && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <span className="text-muted small">
                Showing {usersOffset + 1}-{Math.min(usersOffset + USERS_PAGE_SIZE, usersTotal)} of {usersTotal}
              </span>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={usersOffset === 0}
                  onClick={() => setUsersOffset(o => Math.max(0, o - USERS_PAGE_SIZE))}
                >
                  ← Previous
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={usersOffset + USERS_PAGE_SIZE >= usersTotal}
                  onClick={() => setUsersOffset(o => o + USERS_PAGE_SIZE)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Activity ───────────────────────────────────────────────────────── */}
      {tab === 'Activity' && (
        <div>
          <div className="mb-3" style={{ maxWidth: 400 }}>
            <Form.Control
              placeholder="Search for a user by name or email..."
              value={activityQuery}
              onChange={e => searchActivityUsers(e.target.value)}
              autoFocus
            />
          </div>

          {loadingActivity && (
            <div className="text-center py-3"><Spinner size="sm" animation="border" style={{ color: 'var(--green-800)' }} /></div>
          )}

          {/* User list from search */}
          {!activityUser && activityUsers.length > 0 && (
            <div className="mb-4">
              {activityUsers.map(u => (
                <div key={u.id} className="section-card" style={{ cursor: 'pointer' }}
                  onClick={() => loadActivityLog(u)}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{u.name}</span>
                      <span className="text-muted small ms-2">{u.email}</span>
                    </div>
                    <span style={{ color: 'var(--green-700)', fontSize: '0.85rem' }}>View activity →</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Activity log for selected user */}
          {activityUser && (
            <div>
              <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{activityUser.name}</span>
                  <span className="text-muted small ms-2">{activityUser.email}</span>
                </div>
                <button className="btn btn-link btn-sm p-0" style={{ color: 'var(--text-muted)' }}
                  onClick={() => { setActivityUser(null); setActivityLog([]); setActivityFilter('') }}>
                  ← Back to search
                </button>
                <div className="ms-auto d-flex gap-2 flex-wrap">
                  {['', 'login_success', 'login_failed', 'logout', 'password_changed'].map(f => (
                    <button key={f}
                      className={`btn btn-sm ${activityFilter === f ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => loadActivityLog(activityUser, f)}
                      style={{ fontSize: '0.8rem' }}>
                      {f === '' ? 'All' : (ACTION_LABELS[f]?.label || f.replace(/_/g, ' '))}
                    </button>
                  ))}
                </div>
              </div>

              {activityLoading ? (
                <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
              ) : activityLog.length === 0 ? (
                <p className="text-muted">No activity records found.</p>
              ) : (
                <>
                  <p className="text-muted small mb-2">{activityTotal} total events, showing last {activityLog.length}</p>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <table className="table table-hover mb-0" style={{ fontSize: '0.85rem' }}>
                      <thead style={{ background: 'var(--green-50)' }}>
                        <tr>
                          <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>Action</th>
                          <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>IP Address</th>
                          <th style={{ color: 'var(--green-900)', fontWeight: 600 }}>Date & Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityLog.map((row, i) => {
                          const conf = ACTION_LABELS[row.action] || {}
                          return (
                            <tr key={i}>
                              <td style={{ color: conf.color || 'var(--text)', fontWeight: 500 }}>
                                {conf.label || row.action.replace(/_/g, ' ')}
                              </td>
                              <td className="text-muted">{row.ip_address || 'N/A'}</td>
                              <td className="text-muted">
                                {row.created_at ? new Date(row.created_at).toLocaleString('en-US', {
                                  day: 'numeric', month: 'short', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                }) : 'N/A'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Appearance ─────────────────────────────────────────────────────── */}
      {tab === 'Appearance' && (
        <div>
          {/* Themes */}
          <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
            <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Color Theme</h6>
            <p className="text-muted small mb-4">Choose the color palette used across the site. Changes apply immediately.</p>
            <Row className="g-3">
              {THEMES.map(theme => (
                <Col key={theme.id} xs={12} md={4}>
                  <div
                    onClick={() => saveSetting('site_theme', theme.id)}
                    style={{
                      border: settings.site_theme === theme.id ? '2px solid var(--green-800)' : '2px solid var(--border)',
                      borderRadius: 10, padding: '16px', cursor: 'pointer',
                      background: settings.site_theme === theme.id ? 'var(--green-50)' : '#fff',
                      transition: 'border-color 0.15s',
                    }}>
                    {/* Swatch */}
                    <div className="d-flex gap-1 mb-3">
                      {theme.swatch.map((c, i) => (
                        <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                      ))}
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--green-900)' }}>{theme.name}</div>
                    <div className="text-muted small">{theme.description}</div>
                    {settings.site_theme === theme.id && (
                      <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--green-800)', fontWeight: 600 }}>
                        ✓ Active
                      </div>
                    )}
                  </div>
                </Col>
              ))}
            </Row>
          </div>

          {/* Fonts */}
          <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginBottom: 24 }}>
            <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Font Style</h6>
            <p className="text-muted small mb-4">Choose the typeface used across the site.</p>
            <Row className="g-3">
              {FONTS.map(font => (
                <Col key={font.id} xs={12} md={4}>
                  <div
                    onClick={() => saveSetting('site_font', font.id)}
                    style={{
                      border: settings.site_font === font.id ? '2px solid var(--green-800)' : '2px solid var(--border)',
                      borderRadius: 10, padding: '16px', cursor: 'pointer',
                      background: settings.site_font === font.id ? 'var(--green-50)' : '#fff',
                      transition: 'border-color 0.15s',
                    }}>
                    <div style={{
                      fontSize: '1.3rem', marginBottom: 8, color: 'var(--green-900)',
                      fontFamily: font.stack,
                    }}>
                      {font.sample}
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--green-900)' }}>{font.name}</div>
                    <div className="text-muted small">{font.description}</div>
                    {settings.site_font === font.id && (
                      <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--green-800)', fontWeight: 600 }}>
                        ✓ Active
                      </div>
                    )}
                  </div>
                </Col>
              ))}
            </Row>
          </div>

          {/* Icon Sets */}
          <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)' }}>
            <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Icon Set</h6>
            <p className="text-muted small mb-4">Choose the style of icons shown on the dashboard section cards.</p>
            <Row className="g-3">
              {ICON_SETS.map(set => (
                <Col key={set.id} xs={12} md={4}>
                  <div
                    onClick={() => saveSetting('site_icon_set', set.id)}
                    style={{
                      border: (settings.site_icon_set || 'classic') === set.id ? '2px solid var(--green-800)' : '2px solid var(--border)',
                      borderRadius: 10, padding: '16px', cursor: 'pointer',
                      background: (settings.site_icon_set || 'classic') === set.id ? 'var(--green-50)' : '#fff',
                      transition: 'border-color 0.15s',
                    }}>
                    <div className="d-flex gap-2 mb-3 flex-wrap">
                      {set.preview.map((icon, i) => (
                        <span key={i} style={{ fontSize: '1.5rem', lineHeight: 1 }}>{icon}</span>
                      ))}
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--green-900)' }}>{set.name}</div>
                    <div className="text-muted small">{set.description}</div>
                    {(settings.site_icon_set || 'classic') === set.id && (
                      <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--green-800)', fontWeight: 600 }}>
                        ✓ Active
                      </div>
                    )}
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        </div>
      )}

      {/* ── Settings ───────────────────────────────────────────────────────── */}
      {tab === 'Settings' && (
        <div>
        {/* Maintenance Mode */}
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginBottom: 24 }}>
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
              <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Maintenance Mode</h6>
              <p className="text-muted small mb-0">
                When enabled, the site shows a maintenance message to all users. You can still log in as admin.
              </p>
            </div>
            <div>
              {settings.maintenance_mode === '1' ? (
                <Button variant="success" onClick={() => saveSetting('maintenance_mode', '0')}>
                  Take site live
                </Button>
              ) : (
                <Button variant="outline-danger" onClick={() => saveSetting('maintenance_mode', '1')}>
                  Enable maintenance mode
                </Button>
              )}
            </div>
          </div>
          {settings.maintenance_mode === '1' && (
            <div style={{ marginTop: 16, background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, padding: '10px 14px', fontSize: '0.88rem', color: '#92400E' }}>
              Site is currently in maintenance mode. Regular users will see a maintenance message.
            </div>
          )}
        </div>

        {/* Inactivity check */}
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)', marginTop: 24 }}>
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
              <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Inactivity Check</h6>
              <p className="text-muted small mb-0">
                Normally runs automatically every day at 8am. Use this to run it immediately,
                for example to test the Legacy Contact/demise-confirmation flow without waiting.
              </p>
            </div>
            <Button variant="outline-primary" onClick={runInactivityCheckNow} disabled={runningInactivityCheck}>
              {runningInactivityCheck ? 'Running…' : 'Run inactivity check now'}
            </Button>
          </div>
        </div>

        {/* Password Reset Method */}
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)' }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Password Reset Method</h6>
          <p className="text-muted small mb-4">
            How users prove their identity when resetting their password. A reset link is always sent by
            email, never shown on screen or returned directly, no matter which option is selected below.
          </p>
          <div className="d-flex gap-3 flex-wrap">
            {[
              { value: 'email',            label: 'Email link', desc: 'A reset link is sent to the registered email address' },
              { value: 'dob',              label: 'Email link + date of birth', desc: 'User must also confirm their date of birth before the reset link is emailed' },
              { value: 'security_question', label: 'Email link + security question', desc: "User must also answer their security question before the reset link is emailed. Only works for users who've set one up in My Profile." },
            ].map(opt => (
              <div key={opt.value}
                onClick={() => saveSetting('password_reset_method', opt.value)}
                style={{
                  border: settings.password_reset_method === opt.value ? '2px solid var(--green-800)' : '2px solid var(--border)',
                  borderRadius: 10, padding: '14px 18px', cursor: 'pointer', minWidth: 220,
                  background: settings.password_reset_method === opt.value ? 'var(--green-50)' : '#fff',
                }}>
                <div style={{ fontWeight: 600, color: 'var(--green-900)' }}>{opt.label}</div>
                <div className="text-muted small">{opt.desc}</div>
                {settings.password_reset_method === opt.value && (
                  <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--green-800)', fontWeight: 600 }}>✓ Active</div>
                )}
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {/* ── User detail modal ───────────────────────────────────────────────── */}
      <Modal show={!!selectedUser || loadingUser} onHide={() => { setSelectedUser(null) }} size="lg" centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {selectedUser ? selectedUser.name : 'Loading...'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Actions taken from this modal (verify email, grant/revoke premium, revert
              deceased) call the same showAlert() as the rest of the page, but the page-level
              banner near the top renders behind this modal's backdrop, so it was never visible
              while the modal was open - clicking a button looked like it did nothing even when
              it succeeded or failed with a real error. Mirroring the alert here fixes that. */}
          {alert && (
            <Alert variant={alert.type} dismissible onClose={() => setAlert(null)} className="mb-3">
              {alert.msg}
            </Alert>
          )}
          {loadingUser && !selectedUser ? (
            <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
          ) : selectedUser ? (
            <div>
              {/* Basic info */}
              <Row className="g-3 mb-4">
                <Col md={6}>
                  <p className="text-muted small mb-1">Email</p>
                  <p style={{ fontWeight: 500 }}>{selectedUser.email}</p>
                </Col>
                <Col md={3}>
                  <p className="text-muted small mb-1">Date of birth</p>
                  <p style={{ fontWeight: 500 }}>{formatDate(selectedUser.date_of_birth)}</p>
                </Col>
                <Col md={3}>
                  <p className="text-muted small mb-1">Member since</p>
                  <p style={{ fontWeight: 500 }}>{formatDate(selectedUser.created_at)}</p>
                </Col>
                <Col md={3}>
                  <p className="text-muted small mb-1">Email status</p>
                  <p style={{ fontWeight: 500, color: selectedUser.email_verified ? 'var(--green-800)' : 'var(--text-muted)' }}>
                    {selectedUser.email_verified ? 'Verified' : 'Not verified'}
                  </p>
                </Col>
              </Row>

              {/* Subscription */}
              <div className="mb-4">
                <h6 style={{ color: 'var(--green-900)', marginBottom: 8 }}>Subscription</h6>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span style={{
                    fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                    background: selectedUser.plan === 'premium'
                      ? (selectedUser.is_honorary ? 'var(--gold-50, #FBF3E4)' : 'var(--green-50)')
                      : 'var(--parchment)',
                    border: `1px solid ${selectedUser.plan === 'premium'
                      ? (selectedUser.is_honorary ? 'var(--gold-light, #E8D8A8)' : 'var(--green-100)')
                      : 'var(--border)'}`,
                    color: selectedUser.plan === 'premium'
                      ? (selectedUser.is_honorary ? 'var(--gold-dark, #8A6A2A)' : 'var(--green-800)')
                      : 'var(--text-muted)',
                  }}>
                    {selectedUser.plan === 'premium'
                      ? (selectedUser.is_honorary ? 'Honorary Premium' : 'Premium')
                      : 'Free'}
                  </span>
                  {selectedUser.plan === 'premium' && selectedUser.is_honorary && selectedUser.granted_by_admin_name && (
                    <span className="text-muted small">
                      Granted by {selectedUser.granted_by_admin_name}
                      {selectedUser.plan_updated_at && ` on ${formatDate(selectedUser.plan_updated_at)}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Section completion */}
              <h6 style={{ color: 'var(--green-900)', marginBottom: 12 }}>Section Completion</h6>
              <div className="d-flex flex-wrap gap-2 mb-4">
                {Object.entries(selectedUser.completion || {}).map(([key, count]) => (
                  <span key={key} style={{
                    padding: '4px 10px', borderRadius: 12, fontSize: '0.8rem',
                    background: count > 0 ? 'var(--green-50)' : 'var(--parchment)',
                    border: `1px solid ${count > 0 ? 'var(--green-100)' : 'var(--border)'}`,
                    color: count > 0 ? 'var(--green-800)' : 'var(--text-muted)',
                  }}>
                    {SECTION_LABELS[key] || key}: {count}
                  </span>
                ))}
              </div>

              {/* Deceased status */}
              {selectedUser.is_deceased && (
                <div className="mb-4" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '12px 16px' }}>
                  <p className="small mb-0" style={{ color: '#991B1B' }}>
                    Marked deceased{selectedUser.deceased_at && ` on ${formatDate(selectedUser.deceased_at)}`}
                    {selectedUser.deceased_by && ` (by ${selectedUser.deceased_by.replace('_', ' ')})`}.
                    Their plan is locked from further edits.
                  </p>
                </div>
              )}

              {/* Emergency contact */}
              {selectedUser.emergency_contact_name && (
                <div className="mb-4">
                  <h6 style={{ color: 'var(--green-900)', marginBottom: 8 }}>Emergency Contact</h6>
                  <p className="small mb-0">
                    {selectedUser.emergency_contact_name}
                    {selectedUser.emergency_contact_relationship && ` (${selectedUser.emergency_contact_relationship})`}
                    {selectedUser.emergency_contact_phone && ` · ${formatPhone(selectedUser.emergency_contact_phone, selectedUser.country_code)}`}
                    {selectedUser.emergency_contact_email && ` · ${selectedUser.emergency_contact_email}`}
                  </p>
                </div>
              )}

              {/* Recent audit */}
              {selectedUser.recent_audit?.length > 0 && (
                <div>
                  <h6 style={{ color: 'var(--green-900)', marginBottom: 8 }}>Recent Activity</h6>
                  <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: '0.82rem' }}>
                    {selectedUser.recent_audit.map((a, i) => (
                      <div key={i} className="d-flex justify-content-between py-1"
                        style={{ borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: a.action.includes('fail') ? '#DC2626' : 'var(--text)' }}>
                          {a.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-muted">{a.ip_address || 'N/A'}</span>
                        <span className="text-muted">{formatDate(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </Modal.Body>
        {selectedUser && (
          <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="outline-danger" size="sm"
              onClick={() => setConfirmDelete(selectedUser)}>
              Delete user
            </Button>
            <Button variant="outline-warning" size="sm"
              onClick={() => { setResetPwUser(selectedUser); setResetPwValue(''); setResetPwConfirm(''); setResetPwError('') }}>
              Reset password
            </Button>
            {!selectedUser.email_verified && (
              <Button variant="outline-success" size="sm" disabled={verifyingEmail}
                onClick={async () => {
                  setVerifyingEmail(true)
                  try {
                    await axios.post(`${API}/admin/users/${selectedUser.id}/verify-email`)
                    const r = await axios.get(`${API}/admin/users/${selectedUser.id}`)
                    setSelectedUser(r.data)
                    setUsers(u => u.map(x => x.id === selectedUser.id ? { ...x, email_verified: true } : x))
                    showAlert('success', `Email verified for ${selectedUser.name}.`)
                  } catch (err) {
                    showAlert('danger', err.response?.data?.error || 'Could not verify email.')
                  }
                  setVerifyingEmail(false)
                }}>
                {verifyingEmail ? 'Verifying…' : 'Verify email'}
              </Button>
            )}
            {selectedUser.plan === 'premium' ? (
              // A paying customer (premium but not honorary) doesn't need
              // "Grant honorary premium" at all - they're already premium
              // via their own real subscription, and the button was
              // confusing/redundant there. Only honorary grants get a
              // reverse action; a real subscription is managed by the user
              // themselves (or via Stripe), not this admin toggle.
              selectedUser.is_honorary && (
                <Button variant="outline-warning" size="sm" disabled={premiumSaving}
                  onClick={() => revokePremium(selectedUser.id)}>
                  {premiumSaving ? 'Revoking…' : 'Revoke honorary premium'}
                </Button>
              )
            ) : (
              <Button variant="outline-primary" size="sm" disabled={premiumSaving}
                onClick={() => grantPremium(selectedUser.id)}>
                {premiumSaving ? 'Granting…' : 'Grant honorary premium'}
              </Button>
            )}
            {selectedUser.is_deceased && (
              <Button variant="outline-danger" size="sm" disabled={premiumSaving}
                onClick={() => revertDeceased(selectedUser.id)}>
                {premiumSaving ? 'Reverting…' : 'Revert deceased status'}
              </Button>
            )}
            <Button variant="outline-secondary" onClick={() => setSelectedUser(null)}>Close</Button>
          </Modal.Footer>
        )}
      </Modal>

      {/* ── Reset password ──────────────────────────────────────────────────── */}
      <Modal show={!!resetPwUser} onHide={() => setResetPwUser(null)} centered size="sm">
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ fontSize: '1rem', color: 'var(--green-900)' }}>Reset password</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted mb-3">
            Set a new password for <strong>{resetPwUser?.name}</strong>. They will need to use this to log in.
          </p>
          {resetPwError && <div className="alert alert-danger py-2 small">{resetPwError}</div>}
          <Form.Group className="mb-2">
            <Form.Label className="small">New password</Form.Label>
            <PasswordInput size="sm" placeholder="Min. 8 characters"
              value={resetPwValue} onChange={e => setResetPwValue(e.target.value)} autoFocus />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small">Confirm new password</Form.Label>
            <PasswordInput size="sm" placeholder="Repeat password"
              value={resetPwConfirm} onChange={e => setResetPwConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleResetPassword()} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setResetPwUser(null)}>Cancel</Button>
          <Button variant="warning" size="sm" onClick={handleResetPassword} disabled={resetPwSaving}>
            {resetPwSaving ? 'Saving…' : 'Set new password'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Branding ───────────────────────────────────────────────────────── */}
      {tab === 'Branding' && <BrandingPanel showAlert={showAlert} />}

      {/* ── Organizations ──────────────────────────────────────────────────── */}
      {tab === 'Vault Security' && <VaultSecurityPanel />}

      {tab === 'Organizations' && <OrganizationsPanel showAlert={showAlert} />}

      {tab === 'Legal' && <LegalPanel showAlert={showAlert} />}

      {/* ── Versions ───────────────────────────────────────────────────────── */}
      {tab === 'Marketing' && (
        <div>
          <p className="text-muted small mb-4">
            Where marketing data lives: campaign landing pages are static files
            (<code>client/lp/*.html</code>), not database-driven, so the list below is
            code-defined rather than editable here. Each page's embedded signup form tags
            the new account with an <code>acquisition_source</code> value (the campaign
            variant plus any UTM/gclid parameters from the ad click), stored directly on
            that user's row. There is no separate marketing/analytics table yet, and no
            formal A/B testing infrastructure, by design, at this traffic scale &mdash;
            each Ads campaign points at its own dedicated page, and performance is compared
            directly in the Google Ads dashboard rather than in-app.
          </p>

          {loadingMarketing && <Spinner animation="border" size="sm" style={{ color: 'var(--green-800)' }} />}

          {marketingData && (
            <>
              <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
                <h6 style={{ color: 'var(--green-900)', marginBottom: 12 }}>Campaign landing pages</h6>
                <div style={{ overflowX: 'auto' }}>
                  <Table size="sm" borderless className="mb-0">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="text-muted small">Audience</th>
                        <th className="text-muted small">Title</th>
                        <th className="text-muted small">URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketingData.landingPages.map(p => (
                        <tr key={p.segment}>
                          <td className="small">{p.audience}</td>
                          <td className="small">{p.title}</td>
                          <td className="small">
                            <a href={p.path} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green-700)' }}>
                              {p.path}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>

              <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Signups by campaign source</h6>
                <p className="text-muted small mb-3">
                  {marketingData.totalTrackedSignups} signup{marketingData.totalTrackedSignups === 1 ? '' : 's'} tagged
                  with a campaign source so far. Regular in-app signups (not from a landing page) aren't counted here.
                </p>
                {marketingData.acquisitionBreakdown.length === 0 ? (
                  <p className="text-muted small mb-0">No campaign-attributed signups yet.</p>
                ) : (
                  <Table size="sm" borderless className="mb-0">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="text-muted small">Source</th>
                        <th className="text-muted small">Signups</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketingData.acquisitionBreakdown.map(row => (
                        <tr key={row.acquisition_source}>
                          <td className="small" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.acquisition_source}</td>
                          <td className="small">{row.signups}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'Versions' && (
        <div>
          <p className="text-muted small mb-4">
            The client app, admin panel, and org/funeral-home portal are tracked as three
            separate areas, each on its own semantic version (MAJOR.MINOR.PATCH). A new entry
            is added whenever a change is shipped to that area.
          </p>

          <Row className="g-3 mb-4">
            {VERSION_MODULES.map(m => {
              const history = versions.filter(v => v.module === m.id)
              const current = history[0]
              return (
                <Col key={m.id} xs={12} md={4}>
                  <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', height: '100%' }}>
                    <p className="text-muted small mb-1">{m.label}</p>
                    <p style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>
                      {current ? `v${current.version}` : '—'}
                    </p>
                    {current && (
                      <p className="text-muted small mb-3">{formatDate(current.released_at)}</p>
                    )}
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {history.length === 0 ? (
                        <p className="text-muted small mb-0">No versions logged yet.</p>
                      ) : history.map((v, i) => (
                        <div key={i} className="mb-2 pb-2" style={{ borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div className="d-flex justify-content-between">
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--green-900)' }}>v{v.version}</span>
                            <span className="text-muted" style={{ fontSize: '0.78rem' }}>{formatDate(v.released_at)}</span>
                          </div>
                          <p className="text-muted small mb-0">{v.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Col>
              )
            })}
          </Row>

          {loadingVersions && <Spinner animation="border" size="sm" style={{ color: 'var(--green-800)' }} />}

          <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', maxWidth: 560 }}>
            <h6 style={{ color: 'var(--green-900)', marginBottom: 12 }}>Log a new version</h6>
            {versionError && <Alert variant="danger" className="py-2">{versionError}</Alert>}
            <Row className="g-2 mb-2">
              <Col xs={6}>
                <Form.Select size="sm" value={newVersion.module}
                  onChange={e => setNewVersion(v => ({ ...v, module: e.target.value }))}>
                  {VERSION_MODULES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </Form.Select>
              </Col>
              <Col xs={6}>
                <Form.Control size="sm" placeholder="1.4.2" value={newVersion.version}
                  onChange={e => setNewVersion(v => ({ ...v, version: e.target.value }))} />
              </Col>
            </Row>
            <Form.Control as="textarea" rows={2} size="sm" className="mb-2"
              placeholder="What changed in this version..."
              value={newVersion.summary}
              onChange={e => setNewVersion(v => ({ ...v, summary: e.target.value }))} />
            <Button size="sm" variant="primary" onClick={addVersion} disabled={versionSaving}>
              {versionSaving ? 'Saving…' : 'Add entry'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Security ───────────────────────────────────────────────────────── */}
      {tab === 'Security' && (
        <div>
          <p className="text-muted small mb-3">
            A running log of security review findings (audits, IDOR/authorization probes, infra
            reviews) so they survive past whatever conversation produced them - visible here in
            dev, staging, and production alike, and readable back by a future review without
            needing the original chat history.
          </p>

          <div className="d-flex gap-2 mb-3 flex-wrap">
            {['all', ...FINDING_STATUSES].map(s => (
              <Button key={s} size="sm"
                variant={findingFilter === s ? 'primary' : 'outline-secondary'}
                onClick={() => setFindingFilter(s)}>
                {s === 'all' ? 'All' : s.replace('_', ' ')}
                {s !== 'all' && ` (${findings.filter(f => f.status === s).length})`}
              </Button>
            ))}
          </div>

          {loadingFindings && <Spinner animation="border" size="sm" style={{ color: 'var(--green-800)' }} />}

          <div className="mb-4" style={{ maxHeight: 520, overflowY: 'auto' }}>
            {findings
              .filter(f => findingFilter === 'all' || f.status === findingFilter)
              .map(f => (
                <div key={f.id} style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                      <Badge bg={SEVERITY_COLOR[f.severity]} className="me-2">{f.severity}</Badge>
                      <Badge bg="light" text="dark" className="me-2" style={{ border: '1px solid var(--border)' }}>{f.category}</Badge>
                      <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{f.title}</span>
                    </div>
                    <Form.Select size="sm" style={{ width: 160 }} value={f.status}
                      onChange={e => updateFindingStatus(f.id, e.target.value)}>
                      {FINDING_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </Form.Select>
                  </div>
                  <p className="small mb-1 mt-2">{f.summary}</p>
                  {f.details && <p className="text-muted small mb-1">{f.details}</p>}
                  <div className="d-flex justify-content-between flex-wrap gap-2">
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                      {formatDate(f.discovered_at)}{f.source ? ` · ${f.source}` : ''}
                    </span>
                    {f.related_link && (
                      <a href={f.related_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem' }}>Related link</a>
                    )}
                  </div>
                </div>
              ))}
            {!loadingFindings && findings.filter(f => findingFilter === 'all' || f.status === findingFilter).length === 0 && (
              <p className="text-muted small">No findings logged{findingFilter === 'all' ? '' : ` with status "${findingFilter}"`}.</p>
            )}
          </div>

          <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', maxWidth: 640 }}>
            <h6 style={{ color: 'var(--green-900)', marginBottom: 12 }}>Log a new finding</h6>
            {findingError && <Alert variant="danger" className="py-2">{findingError}</Alert>}
            <Form.Control size="sm" className="mb-2" placeholder="Title"
              value={newFinding.title} onChange={e => setNewFinding(v => ({ ...v, title: e.target.value }))} />
            <Row className="g-2 mb-2">
              <Col xs={4}>
                <Form.Select size="sm" value={newFinding.category}
                  onChange={e => setNewFinding(v => ({ ...v, category: e.target.value }))}>
                  {FINDING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Form.Select>
              </Col>
              <Col xs={4}>
                <Form.Select size="sm" value={newFinding.severity}
                  onChange={e => setNewFinding(v => ({ ...v, severity: e.target.value }))}>
                  {FINDING_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </Form.Select>
              </Col>
              <Col xs={4}>
                <Form.Select size="sm" value={newFinding.status}
                  onChange={e => setNewFinding(v => ({ ...v, status: e.target.value }))}>
                  {FINDING_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </Form.Select>
              </Col>
            </Row>
            <Form.Control as="textarea" rows={2} size="sm" className="mb-2"
              placeholder="Short summary..."
              value={newFinding.summary} onChange={e => setNewFinding(v => ({ ...v, summary: e.target.value }))} />
            <Form.Control as="textarea" rows={2} size="sm" className="mb-2"
              placeholder="Details / evidence / recommendation (optional)"
              value={newFinding.details} onChange={e => setNewFinding(v => ({ ...v, details: e.target.value }))} />
            <Row className="g-2 mb-2">
              <Col xs={6}>
                <Form.Control size="sm" placeholder="Source (optional)"
                  value={newFinding.source} onChange={e => setNewFinding(v => ({ ...v, source: e.target.value }))} />
              </Col>
              <Col xs={6}>
                <Form.Control size="sm" placeholder="Related link (optional)"
                  value={newFinding.related_link} onChange={e => setNewFinding(v => ({ ...v, related_link: e.target.value }))} />
              </Col>
            </Row>
            <Button size="sm" variant="primary" onClick={addFinding} disabled={findingSaving}>
              {findingSaving ? 'Saving…' : 'Add finding'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Contact ────────────────────────────────────────────────────────── */}
      {tab === 'Contact' && (
        <div>
          <p className="text-muted small mb-3">
            Every contact-form submission (site footer / support page), persisted independently of
            the email notification sent to the admin inbox - so a missed or failed email doesn't
            mean the message is lost.
          </p>

          <div className="d-flex gap-2 mb-3 flex-wrap">
            {['all', 'new', 'read'].map(s => (
              <Button key={s} size="sm"
                variant={submissionFilter === s ? 'primary' : 'outline-secondary'}
                onClick={() => setSubmissionFilter(s)}>
                {s === 'all' ? 'All' : s}
                {s !== 'all' && ` (${submissions.filter(x => x.status === s).length})`}
              </Button>
            ))}
          </div>

          {loadingSubmissions && <Spinner animation="border" size="sm" style={{ color: 'var(--green-800)' }} />}

          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {submissions
              .filter(x => submissionFilter === 'all' || x.status === submissionFilter)
              .map(s => (
                <div key={s.id} style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                      <Badge bg={s.status === 'new' ? 'warning' : 'secondary'} className="me-2">{s.status}</Badge>
                      {s.subject_type && (
                        <Badge bg="light" text="dark" className="me-2" style={{ border: '1px solid var(--border)' }}>{s.subject_type}</Badge>
                      )}
                      <span style={{ fontWeight: 600, color: 'var(--green-900)' }}>{s.name}</span>
                      <span className="text-muted small ms-2">&lt;{s.email}&gt;</span>
                    </div>
                    <div className="d-flex gap-2">
                      {s.status === 'new'
                        ? <Button size="sm" variant="outline-secondary" onClick={() => markSubmissionStatus(s.id, 'read')}>Mark read</Button>
                        : <Button size="sm" variant="outline-secondary" onClick={() => markSubmissionStatus(s.id, 'new')}>Mark unread</Button>}
                      <Button size="sm" variant="outline-danger" onClick={() => setConfirmDeleteSubmission(s)}>Delete</Button>
                    </div>
                  </div>
                  <p className="small mb-1 mt-2" style={{ whiteSpace: 'pre-wrap' }}>{s.message}</p>
                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>{formatDate(s.created_at)}</span>
                </div>
              ))}
            {!loadingSubmissions && submissions.filter(x => submissionFilter === 'all' || x.status === submissionFilter).length === 0 && (
              <p className="text-muted small">No submissions{submissionFilter === 'all' ? '' : ` marked "${submissionFilter}"`}.</p>
            )}
          </div>
        </div>
      )}

      {/* ── App Blueprint ──────────────────────────────────────────────────── */}
      {tab === 'App Blueprint' && <AppBlueprint />}

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <Modal show={!!confirmDelete} onHide={() => setConfirmDelete(null)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem', color: 'var(--green-900)' }}>Delete user?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small mb-0">
            This will permanently delete <strong>{confirmDelete?.name}</strong> and all their data.
            This cannot be undone.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => deleteUser(confirmDelete.id)}>
            Yes, delete permanently
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Delete submission confirmation ──────────────────────────────────── */}
      <Modal show={!!confirmDeleteSubmission} onHide={() => setConfirmDeleteSubmission(null)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem', color: 'var(--green-900)' }}>Delete submission?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small mb-0">
            This will permanently delete the message from <strong>{confirmDeleteSubmission?.name}</strong>.
            This cannot be undone.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setConfirmDeleteSubmission(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => deleteSubmission(confirmDeleteSubmission.id)}>
            Yes, delete permanently
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
