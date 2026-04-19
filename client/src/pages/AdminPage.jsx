import { useState, useEffect, useRef } from 'react'
import { Form, Button, Alert, Spinner, Badge, Row, Col, Modal } from 'react-bootstrap'
import axios from 'axios'
import { applyTheme, applyFont } from '../App'
import { useBranding } from '../context/BrandingContext'

const API = import.meta.env.VITE_API_URL

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
    description: 'Familiar, universally recognised symbols',
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
  medical_wishes:      'Medical Wishes',
  people_to_notify:    'People to Notify',
  property_items:      'Property',
  personal_messages:   'Messages',
  songs_that_define_me:'Songs',
  life_wishes:         "My Bucket List",
}

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------
const TABS = ['Overview', 'Users', 'Activity', 'Appearance', 'Branding', 'Settings', 'App Blueprint']

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
  { id: 'infinity-heart',name: 'Infinity Heart',    desc: 'An infinity loop with a heart at its centre' },
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
  const [settings, setSettings] = useState({})
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
      setSettings(s)
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
1. Frontend: React 19 + Vite (port 5174 in dev)
2. Backend: Express 5 + Node.js (port 3001 in dev)
3. Database: SQLite via better-sqlite3. Stored on a Render.com persistent disk. No ORM.
4. File storage: Cloudflare R2 (S3-compatible, no egress fees). Used for uploaded documents, photos, and logo.
5. Authentication: JWT in localStorage (8-hour expiry) + bcryptjs for password hashing. No third-party auth provider.
6. Email: Resend API via native fetch (no SDK). Transactional emails only.
7. PDF generation: PDFKit, server-side, streamed to the client.
8. Deployment: Render.com. Frontend as a Static Site. Backend as a Web Service. Persistent disk for SQLite.
9. Mobile: Not included in this rebuild. Web only.
10. CSS framework: React Bootstrap (react-bootstrap) + custom CSS variables in index.css.

Once you have confirmed the stack, here is the full specification for what to build:

APPLICATION PURPOSE:
${appName} is a warm, end-of-life planning web application. Users document their wishes, assets, contacts, and messages so loved ones have clarity and comfort when the time comes.

TARGET AUDIENCE: Adults (primarily 40+) in Australia who want to prepare their affairs.

TONE: Warm, kind, reassuring. Never clinical. Australian English. No em-dashes anywhere in the application.

COLOUR PALETTE: Earthy, grounded, trustworthy. Forest green (primary), warm gold (accent), parchment backgrounds.

---

THE 14 SECTIONS (grouped into 4 dashboard groups):

YOUR LEGACY:
- How I'd Like to Be Remembered: life story, about me, what I want to be remembered for, a legacy message. Fields stored directly on the users table.
- Messages to Loved Ones: personal messages table. One message per recipient. Recipient name, relationship, message text, notes.
- Songs That Define Me: songs_that_define_me table. Integrated with Deezer search API (proxied through backend). Fields: deezer_id, title, artist, album, why_meaningful.
- My Bucket List: life_wishes table. Status field: dream, planning, or completed.

YOUR WISHES:
- Funeral and End-of-Life Wishes: single record per user. Covers burial preference, ceremony type/location, funeral home, pre-paid plan, music preferences, readings, flowers, donation charity, special requests. Also supports a portrait photo (funeral_main role) and up to 20 gallery photos (funeral_gallery role) via uploaded_documents table.
- Medical and Care Wishes: single record per user. Organ donation preference, advance care directive flag and location, DNR preference, GP details, hospital preference, current medications, medical conditions, notes.

YOUR PEOPLE:
- Key Contacts: emergency contact stored on the users table (name, phone, email). Trusted contacts in a separate trusted_contacts table (max 3 per user, with sequence 1/2/3). Trusted contacts get 72-hour access links to view permitted sections.
- People to Notify: people_to_notify table. People who should be contacted when the user passes. Name, relationship, email, phone, notified_by, notes.
- Children and Dependants: children_dependants table. Name, type (child/pet/other), DOB, special needs, preferred guardian, alternate guardian, notes.

YOUR AFFAIRS:
- Personal and Legal Documents: vault-protected (same vault as Digital Life). legal_documents table: document_type, title, held_by, location, notes. Up to 2 file attachments per item via R2.
- Property and Possessions: property_items table. Title, category, description, location, intended_recipient, notes.
- Financial Affairs: financial_items table. Category, institution, account_type, account_reference, contact_name, contact_phone, notes.
- Digital Life: vault-protected. digital_credentials table with AES-256-GCM encrypted fields (service, service_url, username, password, notes). Shares one vault password with Legal Documents.
- Practical Household Information: household_info table. Title, category, provider, account_reference, contact, notes.

---

VAULT ENCRYPTION:
- Algorithm: AES-256-GCM (authenticated encryption)
- Key derivation: scrypt (N=16384, r=8, p=1) from vault_password + userId. Salt = "igh-vault-v1-" + userId.
- Password NEVER stored: verified by decrypting a known constant ("in-good-hands-vault-verified") stored as check_enc in the digital_vault table.
- Each encrypted field stored as JSON: {ciphertext, iv, tag} all hex-encoded. Fresh random IV per field.
- Legal Documents and Digital Life share ONE vault and ONE password.
- Vault reset: requires account password. Permanently deletes all vault data. Irreversible.
- After 3 failed vault unlock attempts: force logout. After 5 failed attempts: permanent vault deletion. Each outcome sends a notification email.

---

TRUSTED CONTACTS SYSTEM:
- Up to 3 trusted contacts per user.
- Each contact has section-level permissions (which of the 14 sections they can view).
- Access via a 72-hour signed link emailed to the contact. No separate login required.
- Tokens stored in trusted_contact_tokens table (contact_id, token, expires_at).
- Digital credentials (vault) are NEVER accessible to trusted contacts.
- Inactivity timer: when the timer expires (user inactive for their chosen period), all trusted contacts with email addresses and section permissions are automatically emailed their access links.

---

INACTIVITY TIMER:
- Users set inactivity_period_months (options: 2, 3, 6, 12, 18, 24).
- last_active_at updated on every login.
- Daily cron at 8am checks all non-admin users with a timer set.
- Reminder emails sent at 14 days, 7 days, 3 days, 1 day remaining (throttled to avoid spam).
- On expiry (daysLeft < 0): trusted contacts are notified with 72-hour access links. Re-notification cooldown: 30 days. Cooldown resets on next login.

---

ADMIN PANEL:
- Accessible to users with is_admin=1 only.
- Tabs: Overview (stats), Users (search and manage), Activity (audit log), Appearance (theme/font/icon set), Branding (site name and logo), Settings (password reset method), App Blueprint (this documentation).
- 8 colour themes, 6 font choices, 3 icon sets. All stored in app_settings key-value table.
- Admin can upload a logo via Cloudflare R2 for white-labelling.
- Admin can change site name (white-label support via BrandingContext).

---

AUTH SYSTEM:
- JWT in localStorage, 8-hour expiry, signed with JWT_SECRET env var.
- bcryptjs for password hashing, salt rounds = 12.
- Rate limiting: 20 requests per 15 minutes on /api/auth routes.
- Password reset: two methods (admin-configurable): email link (Resend API) or date-of-birth verification.
- Audit log: every login_success, login_failed, logout, register, password_changed, password_reset stored in user_audit_logs table.
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
- Covers all 14 sections across 6 content pages.
- Reads site_theme and site_font from app_settings for styled output.

---

EMAIL TEMPLATES (all in server/lib/emailTemplates.js, sent via Resend):
- welcomeEmail: on registration
- passwordResetEmail: on forgot-password
- inactivityReminderEmail: days remaining warning
- inactivityContactNotificationEmail: sent to trusted contacts when timer expires
- contactAccessEmail: sent to trusted contact when user manually sends access link
- vaultAttemptEmail: sent to user on 3rd/5th vault failure
- Footer contact/feedback form: POST /api/contact sends admin notification

---

KEY CONSTRAINTS AND DECISIONS:
- No em-dashes anywhere in the application (UI, emails, PDFs, code comments, documentation).
- Australian English throughout (organised, recognised, etc.).
- Vault password never stored or recoverable. Loss = permanent data loss. This is communicated clearly to users.
- No admin panel on mobile (mobile app is user-facing only, not yet built in this version).
- Deezer search proxied through backend to avoid CORS.
- PDFKit pipes directly to HTTP response. No temp files.
- SQLite is synchronous (better-sqlite3). No connection pooling needed.
- Bootstrap --bs-primary overridden per theme so all Bootstrap components match the chosen palette.
- The site name ("${appName}") is stored in app_settings and displayed via BrandingContext throughout the app.

---

ENVIRONMENT VARIABLES NEEDED:
Server (Render Web Service):
  PORT, DB_PATH, JWT_SECRET, CLIENT_URL, RESEND_API_KEY,
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT

Client (Render Static Site):
  VITE_API_URL

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
              Complete specification for rebuilding or handing off this application. Last updated: April 2026.
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
                ['Primary users', 'Adults aged 40 and above in Australia who want to organise their affairs.'],
                ['Secondary users', 'Trusted contacts (family or close friends) who receive secure access to relevant sections when the time comes.'],
                ['Administrators', 'White-label operators who can customise the site name, logo, colour theme, and fonts through the admin panel.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="The 14 Sections at a Glance">
              <p className="text-muted small mb-3">Organised into four groups on the dashboard. Users fill in as much or as little as they choose.</p>
              {[
                { group: 'Your Legacy', color: '#C9A84C', icon: '✨', sections: [
                  { label: 'How I\'d Like to Be Remembered', desc: 'Your life story, what you want to be remembered for, and a final message.' },
                  { label: 'Messages to Loved Ones', desc: 'Personal letters and notes for specific people in your life.' },
                  { label: 'Songs That Define Me', desc: 'Music that has shaped who you are, with a search tool to find tracks easily.' },
                  { label: 'My Bucket List', desc: 'Dreams, plans, and things you have already accomplished.' },
                ]},
                { group: 'Your Wishes', color: '#5A9A5A', icon: '🕊️', sections: [
                  { label: 'Funeral and End-of-Life Wishes', desc: 'Burial or cremation preference, ceremony type, music, readings, photos, and more.' },
                  { label: 'Medical and Care Wishes', desc: 'Organ donation, advance care directive, DNR preference, GP details, and medical history.' },
                ]},
                { group: 'Your People', color: '#B87A50', icon: '🤝', sections: [
                  { label: 'Key Contacts', desc: 'An emergency contact and up to three trusted contacts who can securely view your plans.' },
                  { label: 'People to Notify', desc: 'A list of people who should be contacted when you pass, and who should contact them.' },
                  { label: 'Children and Dependants', desc: 'Details for children, pets, or other dependants including preferred guardians.' },
                ]},
                { group: 'Your Affairs', color: '#8A7A6A', icon: '📋', sections: [
                  { label: 'Personal and Legal Documents', desc: 'Where to find your will, power of attorney, and other important papers. Vault-protected.' },
                  { label: 'Property and Possessions', desc: 'Items of value and who you would like to receive them.' },
                  { label: 'Financial Affairs', desc: 'Bank accounts, investments, insurance, super, and other financial interests.' },
                  { label: 'Digital Life', desc: 'Usernames and passwords for your online accounts, encrypted so only you can read them.' },
                  { label: 'Practical Household Information', desc: 'Utility providers, subscriptions, memberships, and other practical details.' },
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
                ['Secure vault', 'Two sections (Legal Documents and Digital Life) are protected by a separate vault password that is never stored on the server. Only the user can unlock their vault.'],
                ['Trusted contact access', 'Users choose up to 3 trusted contacts and control exactly which sections each one can view. Contacts receive a secure 72-hour link (no login required).'],
                ['Inactivity timer', 'Users set a period of inactivity (2 to 24 months). If they have not logged in by then, their trusted contacts are automatically notified with access links.'],
                ['PDF export', 'Users can download a complete PDF summary of all their plans. A full export option includes vault contents if the vault password is provided at download time.'],
                ['File attachments', 'Upload photos, PDFs, and documents to relevant sections. Stored securely in Cloudflare R2.'],
                ['Admin panel', 'Operators can customise colours, fonts, site name, and logo. View all users, audit logs, and manage accounts.'],
                ['White-label ready', 'The site name and logo can be changed by the admin. All emails and the PDF use the configured name.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="What it is NOT">
              <BpTable rows={[
                ['Not a legal service', 'The application does not provide legal advice. It is a planning and document-organisation tool only.'],
                ['Not a will', 'Entries in this application do not replace a legally executed will or any other legal document.'],
                ['Not encrypted by default', 'Only the Digital Life and Legal Documents sections use encryption. Other sections are stored in plain text in the database, protected only by authentication.'],
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
                ['Dashboard', 'Shows 14 section cards grouped into 4 colour-coded groups. Each card shows completion status (Not started, In progress, Done). A progress bar shows overall completion.'],
                ['First visit', 'New users see a welcome card with four suggested starting sections. Returning users see "Welcome back".'],
                ['Filling sections', 'Each section has its own page with a form or list UI. Changes are saved immediately or via explicit Save buttons.'],
                ['Vault setup', 'The first time a user visits Digital Life or Legal Documents, they are prompted to create a vault password. This password is separate from their account password and is never stored.'],
                ['Trusted contacts', 'Set up in Key Contacts. User adds up to 3 contacts, assigns section permissions, and can send them a secure access link at any time.'],
                ['PDF export', 'Available at /export. Standard version excludes vault sections. Full version prompts for vault password.'],
                ['Inactivity timer', 'Set in My Profile settings. If the user does not log in within their chosen period, trusted contacts are emailed access links automatically.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Section Detail: Key Contacts">
              <p className="text-muted small mb-3">Two distinct subsystems within one section page.</p>
              <BpTable rows={[
                ['Emergency contact', 'A single person to call in an emergency. Stored on the users table (emergency_contact_name, emergency_contact_phone, emergency_contact_email). Does NOT receive plan access.'],
                ['Trusted contacts', 'Up to 3 people who can view the user\'s plans. Stored in trusted_contacts table with sequence 1, 2, or 3.'],
                ['Section permissions', 'For each trusted contact, the user selects which of the 14 sections that person can see. Stored in trusted_contact_permissions table.'],
                ['Access links', 'A 72-hour signed link is emailed to the contact. The link gives read-only access to permitted sections. No account or login needed.'],
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
                ['Failed attempts', '3 failed attempts: force logout, email notification to user. 5 failed attempts: all vault data permanently deleted, email notification sent.'],
                ['Reset vault', 'User can reset the vault by confirming their account (login) password. This permanently deletes all vault-protected data.'],
                ['Change password', 'User can change the vault password from My Profile. The server decrypts all fields with the old password and re-encrypts with the new one in a single transaction.'],
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
                ['On expiry', 'When daysLeft is negative, trusted contacts with email addresses and at least one section permission are emailed 72-hour access links.'],
                ['Re-notification', 'If the owner remains inactive, contacts are re-notified every 30 days. On next login, inactivity_contacts_notified_at is reset to NULL.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Section Detail: PDF Export">
              <BpTable rows={[
                ['Standard export', 'GET /api/export. No vault password needed. Vault sections show a "protected" notice.'],
                ['Full export', 'POST /api/export with vault_password in the request body. Vault sections fully included. A sensitive data warning box appears in the PDF.'],
                ['What is included', 'All 14 sections. Cover page with logo, user name, and date. Grouped logically across content pages.'],
                ['Layout', 'A4 two-column layout. Each item rendered as a card. Page breaks handled automatically.'],
                ['Branding', 'The current theme and font from app_settings are applied. Logo is fetched from R2 and embedded on the cover page.'],
                ['Download behaviour', 'The browser receives the PDF as a stream and downloads it as a file. No temp files are created on the server.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Admin Panel Capabilities">
              <BpTable rows={[
                ['Overview', 'Total users, new registrations this month, logins in the last 7 days, total entries across all section tables.'],
                ['User management', 'Search users by name or email. View full profile, section completion, and audit log for any user. Reset their password. Delete their account.'],
                ['Activity log', 'Recent actions across all users: logins, failures, registrations, password changes. Filterable by user.'],
                ['Appearance', '8 colour themes, 6 font choices, 3 icon sets. Changes apply live via CSS variables and are persisted in app_settings.'],
                ['Branding', 'Change the site name (stored in app_settings, displayed via BrandingContext throughout the app and in emails/PDF). Upload a custom logo (stored in R2). Choose from preset logo illustrations.'],
                ['Settings', 'Toggle password reset method between email link (Resend) and date-of-birth verification.'],
                ['App Blueprint', 'This three-level documentation system. Read-only. Downloadable as PDF and as a rebuild prompt text file.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Email Communications">
              <BpTable rows={[
                ['Welcome email', 'Sent on registration. Warm welcome, link to log in.'],
                ['Password reset', 'Sent on forgot-password request. Reset link valid 1 hour. Alternative: date-of-birth check (no email needed).'],
                ['Inactivity reminder', 'Sent to the user as their timer approaches expiry. Days remaining shown clearly. Includes a "reset my timer" CTA (just log in again).'],
                ['Inactivity notification', 'Sent to trusted contacts when the user\'s timer expires. Warm, gentle tone. Advises contacting the person directly first if possible. Includes the 72-hour access link.'],
                ['Contact access link', 'Sent to a trusted contact when the user manually clicks "Send access link". Tells them the owner has shared something important.'],
                ['Vault attempt warning', 'Sent to the user on 3rd failed vault attempt (warning of lockout) and on 5th failed attempt (vault deleted notice).'],
                ['Feedback/contact form', 'When a user submits the footer feedback form, an email is sent to the admin address.'],
              ]} />
            </BpSection>
          </div>

          <div style={card}>
            <BpSection title="Design Principles and Constraints">
              <BpTable rows={[
                ['No em-dashes', 'Never use em-dashes (—) anywhere: UI text, emails, PDF content, code comments, or documentation. Use commas, colons, or periods instead.'],
                ['Australian English', 'Organised, recognised, colour, favour, apologise. Date format: d MMMM YYYY. toLocaleDateString("en-AU").'],
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
            ['Target audience', 'Adults (primarily 40+) in Australia who want to prepare their affairs and communicate their wishes.'],
            ['Tone of voice', 'Warm, kind, reassuring, end-of-life-aware. Never clinical. No em-dashes anywhere.'],
            ['Language', 'Australian English. Uses "organised" not "organized", etc.'],
            ['Primary colour metaphor', 'Earthy, grounded, trustworthy. Forest green, warm gold, parchment backgrounds.'],
          ]} />
        </BpSection>
      </div>

      {/* 2. Tech stack */}
      <div style={card}>
        <BpSection title="2. Technology Stack">
          <BpTable rows={[
            ['Frontend', 'React 19 + Vite (client/), port 5174 in dev'],
            ['Backend', 'Express 5 + Node.js (server/), port 3001 in dev'],
            ['Database', 'SQLite via better-sqlite3. File: /data/sqlite-data/app_v2.db on Render, local in dev'],
            ['File storage', 'Cloudflare R2 (S3-compatible). No egress fees. Keys in R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET env vars.'],
            ['Auth', 'JWT (jsonwebtoken) stored in localStorage. 24h expiry. bcryptjs for password hashing. 15-min rate limit on auth routes.'],
            ['Email', 'Resend API via native fetch (no SDK). Key in RESEND_API_KEY env var.'],
            ['PDF generation', 'PDFKit 0.18. Two-column A4 layout. Generated server-side and streamed to client.'],
            ['Deployment', 'Render.com. Frontend: Static Site. Backend: Web Service (Starter $7/mo). Persistent disk for SQLite.'],
            ['Mobile', 'Expo / React Native (deferred, not yet built).'],
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
        DashboardPage.jsx    # 14 section cards, 4 groups, earthy colours
        ProfilePage.jsx      # Personal details, password, vault password
        TrustedContactsPage.jsx
        AccessPage.jsx       # Public trusted-contact read-only view
        ProfileViewPage.jsx
        AdminPage.jsx        # Full admin panel
        ExportPage.jsx       # Two-option PDF download page
        sections/            # One page per section (14 files)
      components/
        VaultGate.jsx        # Shared VaultSetupScreen + VaultLockScreen

  server/                    # Express 5 backend
    index.js                 # App entry, CORS, routes, error handler, cron
    db/database.js           # SQLite init + all schema migrations
    middleware/auth.js       # requireAuth JWT middleware
    lib/
      vault.js               # AES-256-GCM encryption helpers
      r2.js                  # Cloudflare R2 client (upload/download/delete/buffer)
      generatePdf.js         # Two-column PDFKit generator
      emailTemplates.js      # HTML email templates (welcome, reset, inactivity, access)
      sendEmail.js           # Resend API wrapper
      inactivityTimer.js     # Daily cron: checks last_active, sends reminder emails
    routes/
      auth.js                # /api/auth: login, register, logout, forgot/reset password
      users.js               # /api/users/me: profile, timer, emergency contact
      sections.js            # /api/sections: all 14 sections + vault endpoints + completion
      documents.js           # /api/documents: file upload/download/delete + photos
      export.js              # /api/export: GET (standard) + POST (with vault)
      admin.js               # /api/admin: stats, users, activity log
      settings.js            # /api/settings: app_settings key-value store
      trustedContacts.js     # /api/trusted-contacts: CRUD + send access link
      access.js              # /api/access/:token: public read-only trusted contact view
      billing.js             # /api/billing: stub (not yet implemented)
      contact.js             # /api/contact: user feedback form`}
          </BpCode>
        </BpSection>
      </div>

      {/* 4. Database schema */}
      <div style={card}>
        <BpSection title="4. Database Schema (SQLite)">
          <p className="text-muted small mb-3">All tables use INTEGER PRIMARY KEY autoincrement unless noted. created_at defaults to CURRENT_TIMESTAMP.</p>
          {[
            {
              table: 'users',
              fields: 'id, name, email (unique), password_hash, date_of_birth, life_story, about_me, remembered_for, legacy_message, emergency_contact_name, emergency_contact_phone, emergency_contact_email, is_admin (0/1), inactivity_period_months (default 6), last_active, reset_token, reset_token_expiry, created_at',
            },
            {
              table: 'legal_documents',
              fields: 'id, user_id, document_type, title, held_by, location, notes, created_at. Vault-protected (password required to list/create/update). Not field-encrypted; access controlled.',
            },
            {
              table: 'financial_items',
              fields: 'id, user_id, category, institution, account_type, account_reference, contact_name, contact_phone, notes, created_at',
            },
            {
              table: 'funeral_wishes',
              fields: 'id, user_id, burial_preference, ceremony_type, ceremony_location, funeral_home, pre_paid_plan (0/1), pre_paid_details, music_preferences, readings, flowers_preference, donation_charity, special_requests, notes. Single record per user (upsert).',
            },
            {
              table: 'medical_wishes',
              fields: 'id, user_id, organ_donation, organ_donation_details, advance_care_directive (0/1), directive_location, dnr_preference, gp_name, gp_phone, hospital_preference, current_medications, medical_conditions, notes. Single record per user.',
            },
            {
              table: 'people_to_notify',
              fields: 'id, user_id, name, relationship, email, phone, notified_by, notes, created_at',
            },
            {
              table: 'property_items',
              fields: 'id, user_id, title, category, description, location, intended_recipient, notes, created_at',
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
              fields: 'id, user_id, title, category, provider, account_reference, contact, notes, created_at',
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
              table: 'user_audit_log',
              fields: 'id, user_id, action (login_success/login_failed/logout/register/password_changed/password_reset), ip_address, created_at',
            },
            {
              table: 'app_settings',
              fields: 'id, key (unique), value. Keys: site_theme, site_font, site_icon_set, site_logo (R2 key), password_reset_method (email/dob)',
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

      {/* 5. The 14 sections */}
      <div style={card}>
        <BpSection title="5. The 14 User Sections">
          <p className="text-muted small mb-3">Grouped into 4 dashboard groups. Each section has its own route and full CRUD via /api/sections.</p>
          {[
            { group: 'Your Legacy', color: '#C9A84C', sections: [
              { id: 'how_to_be_remembered', label: "How I'd Like to Be Remembered", route: '/sections/how-to-be-remembered', note: 'Fields on users table: life_story, about_me, remembered_for, legacy_message' },
              { id: 'personal_messages', label: 'Messages to Loved Ones', route: '/sections/messages', note: 'personal_messages table. One message per recipient.' },
              { id: 'songs_that_define_me', label: 'Songs That Define Me', route: '/sections/songs-that-define-me', note: 'songs_that_define_me table. Deezer search via /api/deezer proxy.' },
              { id: 'life_wishes', label: 'My Bucket List', route: '/sections/lifes-wishes', note: 'life_wishes table. Status: dream/planning/completed.' },
            ]},
            { group: 'Your Wishes', color: '#5A9A5A', sections: [
              { id: 'funeral_wishes', label: 'Funeral & End-of-Life Wishes', route: '/sections/funeral-wishes', note: 'Single record per user. Also supports portrait photo (funeral_main) + up to 20 gallery photos (funeral_gallery) via uploaded_documents.' },
              { id: 'medical_wishes', label: 'Medical & Care Wishes', route: '/sections/medical-wishes', note: 'Single record per user. Includes DNR, organ donation, advance care directive.' },
            ]},
            { group: 'Your People', color: '#B87A50', sections: [
              { id: 'key_contacts', label: 'Key Contacts', route: '/sections/key-contacts', note: 'Emergency contact on users table. Trusted contacts in trusted_contacts table (max 3, sequence 1-3).' },
              { id: 'people_to_notify', label: 'People to Notify', route: '/sections/people-to-notify', note: 'people_to_notify table.' },
              { id: 'children-dependants', label: 'Children & Dependants', route: '/sections/children-dependants', note: 'children_dependants table.' },
            ]},
            { group: 'Your Affairs', color: '#8A7A6A', sections: [
              { id: 'legal_documents', label: 'Personal & Legal Documents', route: '/sections/legal-documents', note: 'Vault-protected. Uses shared vault (digital_vault). Fields not encrypted. Up to 2 file attachments per item via uploaded_documents.' },
              { id: 'property_items', label: 'Property & Possessions', route: '/sections/property-possessions', note: 'property_items table.' },
              { id: 'financial_items', label: 'Financial Affairs', route: '/sections/financial-affairs', note: 'financial_items table.' },
              { id: 'digital_credentials', label: 'Digital Life', route: '/sections/digital-life', note: 'Vault-protected. digital_credentials table. Fields AES-256-GCM encrypted. Shares vault with Legal Documents.' },
              { id: 'household-info', label: 'Practical Household Information', route: '/sections/household-info', note: 'household_info table.' },
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
            ['Encrypted fields', 'Each field stored as JSON: {ciphertext, iv, tag} all hex-encoded. Fresh random IV per field.'],
            ['Shared vault', 'Legal Documents and Digital Life share ONE vault. Same password, same digital_vault row.'],
            ['Vault setup', 'POST /api/sections/digital-life/vault. Creates check_enc. Only works once per user.'],
            ['Vault verify', 'POST /api/sections/digital-life/vault/verify. Returns 200/401. Used to unlock UI.'],
            ['Vault reset', 'DELETE /api/sections/digital-life/vault. Requires account password. Deletes all credentials, legal docs, and R2 files for legal section. Irreversible.'],
            ['Change password', 'POST /api/sections/digital-life/vault/change. Decrypts all fields with old key, re-encrypts with new key in a single transaction.'],
            ['PDF full export', 'POST /api/export with vault_password body param. Server decrypts credentials and includes in PDF. Vault password never appears in response.'],
            ['Helper file', 'server/lib/vault.js exports: deriveKey, encryptField, decryptField, createVaultCheck, verifyVaultPassword'],
          ]} />
        </BpSection>
      </div>

      {/* 7. Auth system */}
      <div style={card}>
        <BpSection title="7. Authentication & Security">
          <BpTable rows={[
            ['Auth method', 'JWT in localStorage. 8-hour expiry. Signed with JWT_SECRET env var.'],
            ['Password hashing', 'bcryptjs, salt rounds = 12'],
            ['Rate limiting', '15 requests per 15 minutes on /api/auth routes (express-rate-limit)'],
            ['CORS', 'Manual CORS implementation in server/index.js. Allows CLIENT_URL env var + localhost origins.'],
            ['Admin account', 'Seeded on startup: email="admin", password="admin". is_admin=1 flag on users table.'],
            ['Protected routes', 'requireAuth middleware in server/middleware/auth.js. Decodes JWT, attaches req.user.'],
            ['Audit log', 'user_audit_log table. Logs: login_success, login_failed, logout, register, password_changed, password_reset.'],
            ['Password reset', 'Two methods (admin-configurable): email link (via Resend) or date-of-birth verification. Token stored in users.reset_token + reset_token_expiry (1 hour).'],
          ]} />
        </BpSection>
      </div>

      {/* 8. File storage */}
      <div style={card}>
        <BpSection title="8. File Storage (Cloudflare R2)">
          <BpTable rows={[
            ['Library', '@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner. R2 is S3-compatible.'],
            ['Helper', 'server/lib/r2.js exports: uploadFile({key, buffer, mimeType}), getDownloadUrl(key), deleteFile(key), getFileBuffer(key)'],
            ['Key format', '{userId}/{sectionId}/{uuid}.{ext} for documents. {userId}/{sectionId}/photos/{uuid}.{ext} for photos.'],
            ['Signed URLs', '1-hour expiry. Generated fresh on each GET request. Never stored.'],
            ['File types', 'Documents: PDF, JPEG, PNG, HEIC, WebP, DOC, DOCX (max 20MB). Photos: JPEG, PNG, HEIC, WebP (max 15MB).'],
            ['Photo roles', 'funeral_main: 1 per user per section (old one deleted on upload). funeral_gallery: max 20 per section.'],
            ['Legal doc attachments', '1-2 files per legal_document item_id. item_id stored in uploaded_documents.'],
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
            ['Content pages', '6 pages covering all 14 sections grouped logically.'],
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
            ['Access link', 'POST /api/trusted-contacts/:id/send-access sends a 72-hour signed link via Resend email. access_token and token_expiry stored on record.'],
            ['Access page', 'GET /access/:token (public, no auth). Renders read-only view of permitted sections. Uses AccessPage.jsx.'],
            ['Digital credentials', 'Always excluded from trusted contact access (encrypted, no server-side key).'],
            ['Inactivity timer', 'Users set inactivity_period_months (2/3/6/12/18/24). Last login stored in users.last_active.'],
            ['Daily check', 'server/lib/inactivityTimer.js runs daily at 8am (node-cron). Checks days since last_active against period.'],
            ['Reminder emails', 'Sent when 30 days, 14 days, 7 days, 3 days, and 1 day remain. Uses inactivityReminderEmail template.'],
            ['On expiry', 'When daysLeft < 0, notifyTrustedContacts(user) is called. Emails all eligible contacts with 72-hour access links. inactivity_contacts_notified_at updated. Re-notification cooldown: 30 days. Reset on next login.'],
          ]} />
        </BpSection>
      </div>

      {/* 11. Admin panel */}
      <div style={card}>
        <BpSection title="11. Admin Panel">
          <BpTable rows={[
            ['Access', 'is_admin=1 users only. Redirects to /profile for regular users. Admin nav link shown in NavBar.'],
            ['Overview tab', 'Stats: total users, new this month, logins (7 days), total entries across all section tables.'],
            ['Users tab', 'Search users by name/email. Click user to open detail modal: all profile fields, section completion counts, audit log, send access link, reset password, delete account.'],
            ['Activity tab', 'Recent audit log with action labels, IP, and timestamps.'],
            ['Appearance tab', 'Choose colour theme (8 options), font (6 options), icon set (3 options). Changes apply live via CSS variables.'],
            ['Settings tab', 'Password reset method: email link or date-of-birth.'],
            ['App Blueprint tab', 'Three-level documentation: L1 Feature Overview, L2 Product Specification, L3 Technical Reference. PDF download and rebuild prompt download.'],
            ['Theme storage', 'app_settings table keys: site_theme, site_font, site_icon_set, site_logo.'],
            ['Themes available', 'Forest, Dusk, Terracotta, Ocean, Rose Garden, Midnight, High Contrast, Soft Mist.'],
            ['Fonts available', 'Georgia, Lora, Playfair Display, Merriweather, Inter, Open Sans.'],
            ['Icon sets', 'Classic, Heritage, Modern. Applied to dashboard section card icons.'],
          ]} />
        </BpSection>
      </div>

      {/* 12. API reference */}
      <div style={card}>
        <BpSection title="12. Key API Endpoints">
          <BpCode>{`AUTH          POST /api/auth/login, /register, /logout
              POST /api/auth/forgot-password, /reset-password
              GET  /api/auth/check (validate JWT)

USERS         GET/PUT /api/users/me (profile)
              PUT /api/users/me/timer (inactivity period)
              PUT /api/users/me/emergency-contact

SECTIONS      GET /api/sections/completion (counts per section)
              GET/POST/PUT/DELETE /api/sections/legal-documents
              POST /api/sections/legal-documents/list (vault auth)
              GET/POST/PUT/DELETE /api/sections/financial-items
              GET/PUT /api/sections/funeral-wishes
              GET/PUT /api/sections/medical-wishes
              GET/POST/PUT/DELETE /api/sections/people-to-notify
              GET/POST/PUT/DELETE /api/sections/property-items
              GET/POST/PUT/DELETE /api/sections/personal-messages
              GET/POST/PUT/DELETE /api/sections/songs-that-define-me
              GET/POST/PUT/DELETE /api/sections/life-wishes
              GET/POST/PUT/DELETE /api/sections/household-info
              GET/POST/PUT/DELETE /api/sections/children-dependants
              GET/POST/DELETE     /api/sections/key-contacts (trusted contacts)

VAULT         POST /api/sections/digital-life/vault (setup)
              POST /api/sections/digital-life/vault/verify
              POST /api/sections/digital-life/vault/change
              DELETE /api/sections/digital-life/vault (reset)
              GET/POST/PUT/DELETE /api/sections/digital-life/credentials

DOCUMENTS     POST /api/documents/upload (multipart: file, section_id, item_id)
              GET  /api/documents/:section_id (list)
              GET  /api/documents/download/:id (signed URL)
              DELETE /api/documents/:id
              POST /api/documents/photos/upload (photo_role required)
              GET  /api/documents/photos/:section_id

EXPORT        GET  /api/export (standard, no vault)
              POST /api/export {vault_password} (full, with vault)

TRUSTED       GET/POST/PUT/DELETE /api/trusted-contacts
              PUT  /api/trusted-contacts/:id/permissions
              POST /api/trusted-contacts/:id/access-link

ACCESS        GET  /api/access/:token (public)

ADMIN         GET  /api/admin/stats
              GET  /api/admin/users, GET /api/admin/users/:id
              GET  /api/admin/activity
              PUT  /api/admin/users/:id/password
              DELETE /api/admin/users/:id

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
            ['Provider', 'Resend API. Key in RESEND_API_KEY env var. From address: hello@ingoodhands.com.au'],
            ['Helper', 'server/lib/sendEmail.js. Silently skips if RESEND_API_KEY not set (dev mode).'],
            ['Templates', 'server/lib/emailTemplates.js. All HTML with inline styles.'],
            ['welcomeEmail', 'Sent on registration. Warm welcome, link to log in.'],
            ['passwordResetEmail', 'Sent on forgot-password request. Reset link valid 1 hour.'],
            ['inactivityReminderEmail', 'Sent by inactivity timer. Includes days remaining, reset-timer CTA.'],
            ['contactAccessEmail', 'Sent to trusted contact when user clicks "Send access link". 72-hour link.'],
            ['inactivityContactNotificationEmail', 'Sent to trusted contacts when the inactivity timer expires. Warm tone, advises reaching person directly first, includes 72-hour access link.'],
            ['vaultAttemptEmail', 'Sent to user on 3rd vault failure (lockout warning) and 5th failure (vault deletion notice).'],
            ['Footer contact form', `POST /api/contact sends admin notification email. Subject: "${appName}: {type}"`],
          ]} />
        </BpSection>
      </div>

      {/* 14. Env vars */}
      <div style={card}>
        <BpSection title="14. Environment Variables">
          <BpCode>{`SERVER (Render Web Service)
  PORT               3001 (default)
  DB_PATH            /data/sqlite-data/app_v2.db
  JWT_SECRET         [set in Render dashboard]
  CLIENT_URL         https://performance-client.onrender.com
  RESEND_API_KEY     [set in Render dashboard]
  R2_ACCOUNT_ID      Cloudflare account ID
  R2_ACCESS_KEY_ID   R2 API key
  R2_SECRET_ACCESS_KEY R2 API secret
  R2_BUCKET          Bucket name
  R2_ENDPOINT        https://{account_id}.r2.cloudflarestorage.com

CLIENT (Render Static Site)
  VITE_API_URL       https://performance-api-djuk.onrender.com/api`}
          </BpCode>
        </BpSection>
      </div>

      {/* 15. Key design decisions */}
      <div style={card}>
        <BpSection title="15. Key Design Decisions and Constraints">
          <BpTable rows={[
            ['No em-dashes', 'Never use em-dashes (—) anywhere in the application. Use commas, colons, or periods instead.'],
            ['Vault password not stored', 'The vault password is never stored or hashed on the server. Loss of the vault password means permanent loss of vault data. This is by design and communicated clearly to users.'],
            ['Shared vault', 'Legal Documents and Digital Life use one vault. One password protects both. Set up via the Digital Life section or Legal Documents section; managed in My Profile.'],
            ['Trusted contact access', 'Only a 72-hour one-time signed link is used. No separate trusted contact login credentials. Trusted contacts cannot access digital credentials (vault) ever.'],
            ['PDF streaming', 'PDFKit pipes directly to the HTTP response stream. No temp files. Vault password for full export comes as POST body, never in URL.'],
            ['SQLite on Render', 'Render persistent disk required for SQLite. No connection pooling needed (better-sqlite3 is synchronous).'],
            ['No admin panel in mobile', 'Admin features are web-only. Mobile app (Expo, not yet built) is user-facing only.'],
            ['Deezer music search', 'Proxied via /api/deezer to avoid CORS and hide any future API keys. Songs used for "Songs That Define Me" section, not funeral songs (different section).'],
            ['Australian English', 'All copy uses Australian spelling and date formats. Dates formatted with toLocaleDateString("en-AU").'],
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
  const [tab, setTab]           = useState('Overview')
  const [stats, setStats]       = useState(null)
  const [users, setUsers]       = useState([])
  const [query, setQuery]       = useState('')
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

  // Load users when switching to Users tab or searching
  useEffect(() => {
    if (tab !== 'Users') return
    setLoadingUsers(true)
    axios.get(`${API}/admin/users`, { params: { q: query || undefined } })
      .then(r => setUsers(r.data))
      .catch(() => showAlert('danger', "Couldn't load users."))
      .finally(() => setLoadingUsers(false))
  }, [tab, query])

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
      setStats(s => s ? { ...s, total_users: s.total_users - 1 } : s)
      showAlert('success', 'User deleted.')
    } catch {
      showAlert('danger', "Couldn't delete user.")
    }
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
      axios.get(`${API}/admin/users`, { params: { q } })
        .then(r => setActivityUsers(r.data))
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
    try { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) }
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

      {/* Tab bar */}
      <div className="d-flex gap-2 mb-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '6px 18px', borderRadius: 20, border: '1px solid',
              fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
              borderColor: tab === t ? 'var(--green-800)' : 'var(--border)',
              background: tab === t ? 'var(--green-800)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--text-muted)',
            }}>
            {t}
          </button>
        ))}
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
              onChange={e => setQuery(e.target.value)}
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
                                {row.created_at ? new Date(row.created_at).toLocaleString('en-AU', {
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
            <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Colour Theme</h6>
            <p className="text-muted small mb-4">Choose the colour palette used across the site. Changes apply immediately.</p>
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
        <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', border: '1px solid var(--border)' }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>Password Reset Method</h6>
          <p className="text-muted small mb-4">
            How users prove their identity when resetting their password.
          </p>
          <div className="d-flex gap-3 flex-wrap">
            {[
              { value: 'email', label: 'Email link', desc: 'A reset link is sent to the registered email address' },
              { value: 'dob',   label: 'Date of birth', desc: 'User must provide their date of birth to reset' },
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
      )}

      {/* ── User detail modal ───────────────────────────────────────────────── */}
      <Modal show={!!selectedUser || loadingUser} onHide={() => { setSelectedUser(null) }} size="lg" centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {selectedUser ? selectedUser.name : 'Loading...'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
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
              </Row>

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

              {/* Emergency contact */}
              {selectedUser.emergency_contact_name && (
                <div className="mb-4">
                  <h6 style={{ color: 'var(--green-900)', marginBottom: 8 }}>Emergency Contact</h6>
                  <p className="small mb-0">
                    {selectedUser.emergency_contact_name}
                    {selectedUser.emergency_contact_phone && ` · ${selectedUser.emergency_contact_phone}`}
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
            <Form.Control type="password" size="sm" placeholder="Min. 8 characters"
              value={resetPwValue} onChange={e => setResetPwValue(e.target.value)} autoFocus />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small">Confirm new password</Form.Label>
            <Form.Control type="password" size="sm" placeholder="Repeat password"
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
    </div>
  )
}
