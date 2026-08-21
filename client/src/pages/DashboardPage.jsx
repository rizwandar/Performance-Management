import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Badge, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { useSubscription } from '../context/SubscriptionContext'
import UpgradeModal from '../components/UpgradeModal'
import OrgBrandingBanner from '../components/OrgBrandingBanner'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Icon sets (per admin theme)
// ---------------------------------------------------------------------------
const ICON_SETS = {
  classic: {
    how_to_be_remembered: '🕯️',
    emergency_contact:    '📞',
    trusted_contacts:     '🤝',
    legal_documents:      '📄',
    financial_items:      '💼',
    digital_credentials:  '💻',
    funeral_wishes:       '🕊️',
    medical_wishes:       '🏥',
    people_to_notify:     '👥',
    property_items:       '🏡',
    personal_messages:    '💌',
    songs_that_define_me: '🎵',
    life_wishes:          '✨',
    'household-info':     '🔑',
    'children-dependants':'👶',
    'pet-care':            '🐾',
    insurance_items:      '🛡️',
    unfinished_business:  '🕊️',
  },
  heritage: {
    how_to_be_remembered: '🕯️',
    emergency_contact:    '📞',
    trusted_contacts:     '🤝',
    legal_documents:      '📜',
    financial_items:      '🪙',
    digital_credentials:  '🔐',
    funeral_wishes:       '🕯️',
    medical_wishes:       '🌿',
    people_to_notify:     '🤝',
    property_items:       '🗝️',
    personal_messages:    '✉️',
    songs_that_define_me: '🎼',
    life_wishes:          '🌟',
    'household-info':     '🏠',
    'children-dependants':'👨‍👩‍👧',
    'pet-care':            '🐕',
    insurance_items:      '☂️',
    unfinished_business:  '🕊️',
  },
  modern: {
    how_to_be_remembered: '🕯️',
    emergency_contact:    '📞',
    trusted_contacts:     '🤝',
    legal_documents:      '📋',
    financial_items:      '💳',
    digital_credentials:  '📱',
    funeral_wishes:       '🕊️',
    medical_wishes:       '💊',
    people_to_notify:     '👨‍👩‍👧‍👦',
    property_items:       '🏘️',
    personal_messages:    '💬',
    songs_that_define_me: '🎸',
    life_wishes:          '🎯',
    'household-info':     '⚙️',
    'children-dependants':'🎒',
    'pet-care':            '🐶',
    insurance_items:      '📑',
    unfinished_business:  '🕊️',
  },
}

// ---------------------------------------------------------------------------
// Section groups — logical groupings with earthy color palette
// ---------------------------------------------------------------------------
const GROUPS = [
  {
    id:          'legacy',
    label:       'Your Legacy',
    description: 'Who you are, what you love, and what you want to leave behind.',
    cardBg:      'var(--group-legacy-bg, #FBF5E4)',
    cardBorder:  'var(--group-legacy-border, #E8D8A8)',
    startedBorder: 'var(--group-legacy-pill, #C9A84C)',
    iconBg:      'var(--group-legacy-icon, #F5EAC8)',
  },
  {
    id:          'people',
    label:       'Your People',
    description: 'The important people in your life and who should be involved.',
    cardBg:      'var(--group-people-bg, #F7EDE7)',
    cardBorder:  'var(--group-people-border, #E4C8B4)',
    startedBorder: 'var(--group-people-pill, #B87A50)',
    iconBg:      'var(--group-people-icon, #EDD8C8)',
  },
  {
    id:          'wishes',
    label:       'Your Wishes',
    description: "How you'd like to be cared for and farewelled.",
    cardBg:      'var(--group-wishes-bg, #EEF4EE)',
    cardBorder:  'var(--group-wishes-border, #C4DCC4)',
    startedBorder: 'var(--group-wishes-pill, #5A9A5A)',
    iconBg:      'var(--group-wishes-icon, #D8ECD8)',
  },
  {
    id:          'affairs',
    label:       'Your Affairs',
    description: 'Your documents, assets, finances, and practical matters.',
    cardBg:      'var(--group-affairs-bg, #EEEAE5)',
    cardBorder:  'var(--group-affairs-border, #D4CCC4)',
    startedBorder: 'var(--group-affairs-pill, #8A7A6A)',
    iconBg:      'var(--group-affairs-icon, #E0D8D0)',
  },
]

const FREE_ROUTES = new Set([
  '/sections/how-to-be-remembered',
  '/sections/messages',
  '/sections/unfinished-business',
  '/sections/songs-that-define-me',
  '/sections/lifes-wishes',
  '/sections/funeral-wishes',
  '/sections/medical-wishes',
  '/sections/emergency-contact',
  '/sections/trusted-contacts',
  '/sections/people-to-notify',
  '/sections/children-dependants',
  '/sections/pet-care',
  // IDEA-29: Insurance is not vault-protected (unlike the other sections in
  // its 'affairs' dashboard group below), so it's free-plan accessible too,
  // consistent with the server not gating it behind requirePremium.
  '/sections/insurance',
])

// First group id after which all remaining sections are premium-only.
const PREMIUM_BOUNDARY_GROUP = 'affairs'

// ---------------------------------------------------------------------------
// Sections — each assigned to a group, with a warm description
// ---------------------------------------------------------------------------
const SECTIONS = [
  // ── Your Legacy ────────────────────────────────────────────────────────────
  {
    id: 'personal_messages', label: 'Messages to Loved Ones',
    icon: '💌', route: '/sections/messages', group: 'legacy',
    description: 'Write heartfelt letters to the people who matter most. Words they can hold onto long after you\'re gone.',
  },
  {
    id: 'how_to_be_remembered', label: "How I'd Like to Be Remembered",
    icon: '🕯️', route: '/sections/how-to-be-remembered', group: 'legacy',
    description: 'Share your values, your story, and the things that define you, so those you love will always know who you were.',
  },
  {
    id: 'unfinished_business', label: 'Unfinished Business',
    icon: '🕊️', route: '/sections/unfinished-business', group: 'legacy',
    description: 'Reconciliation, apologies, and the relationships or matters you\'d still like to set right.',
  },
  {
    id: 'songs_that_define_me', label: 'Songs That Define Me',
    icon: '🎵', route: '/sections/songs-that-define-me', group: 'legacy',
    description: 'The music that moves you, marks your milestones, and speaks to who you truly are.',
  },
  {
    id: 'life_wishes', label: 'My Bucket List',
    icon: '✨', route: '/sections/lifes-wishes', group: 'legacy',
    description: "The dreams you're still chasing, the places you want to see, and the experiences that light you up.",
  },

  // ── Your People ────────────────────────────────────────────────────────────
  {
    id: 'children-dependants', label: 'Your Loved Ones',
    icon: '👶', route: '/sections/children-dependants', group: 'people',
    description: 'Everything your loved ones need to know about caring for your children and those who depend on you.',
  },
  {
    id: 'pet-care', label: 'Pet Care',
    icon: '🐾', route: '/sections/pet-care', group: 'people',
    description: 'Feeding routines, vet details, and caretaker wishes so your pets are looked after too.',
  },
  {
    id: 'emergency_contact', label: 'Emergency Contact',
    icon: '📞', route: '/sections/emergency-contact', group: 'people',
    description: 'The first person to call in an emergency: always reachable, and ready to act on your behalf.',
  },
  {
    id: 'trusted_contacts', label: 'Trusted Contacts',
    icon: '🤝', route: '/sections/trusted-contacts', group: 'people',
    description: 'The people who should be given access to your plans when the time comes, and what each of them can see.',
  },
  {
    id: 'people_to_notify', label: 'People to Notify',
    icon: '👥', route: '/sections/people-to-notify', group: 'people',
    description: 'The friends, family, and colleagues who should hear the news directly and with care.',
  },

  // ── Your Wishes ────────────────────────────────────────────────────────────
  {
    id: 'medical_wishes', label: 'Medical & Care Wishes',
    icon: '🏥', route: '/sections/medical-wishes', group: 'wishes',
    description: 'Your preferences for care and treatment, giving those who love you the clarity to act on your behalf.',
  },
  {
    id: 'funeral_wishes', label: 'Funeral & End-of-Life Wishes',
    icon: '🕊️', route: '/sections/funeral-wishes', group: 'wishes',
    description: 'Your gentle guidance for the farewell that truly reflects who you are and what you believe.',
  },

  // ── Your Affairs ───────────────────────────────────────────────────────────
  {
    id: 'property_items', label: 'Property & Possessions',
    icon: '🏡', route: '/sections/property-possessions', group: 'affairs',
    description: 'A clear record of your home, vehicles, valuables, and the possessions that matter most.',
  },
  {
    id: 'household-info', label: 'Practical Household Information',
    icon: '🔑', route: '/sections/household-info', group: 'affairs',
    description: 'Practical details about utilities, subscriptions, and services that keep everyday life running smoothly.',
  },
  {
    id: 'financial_items', label: 'Financial Affairs',
    icon: '💼', route: '/sections/financial-affairs', group: 'affairs',
    description: 'Your accounts, investments, insurance policies, and financial affairs, all in one place.',
  },
  {
    id: 'legal_documents', label: 'Personal & Legal Documents',
    icon: '📄', route: '/sections/legal-documents', group: 'affairs',
    description: 'Your will, powers of attorney, and identity documents, safely organized and easy to locate.',
  },
  {
    id: 'digital_credentials', label: 'Digital Life',
    icon: '💻', route: '/sections/digital-life', group: 'affairs',
    description: 'Your online accounts and passwords, secured by your vault password and accessible when needed.',
  },
  {
    id: 'insurance_items', label: 'Insurance',
    icon: '🛡️', route: '/sections/insurance', group: 'affairs',
    description: 'Your life, health, home, auto, and other insurance policies, with who to contact and who benefits.',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { user }       = useAuth()
  const { isPremium, signupTrialExpired } = useSubscription()
  const navigate       = useNavigate()
  const [completion, setCompletion]   = useState({})
  const [loading, setLoading]         = useState(true)
  const [iconSet, setIconSet]         = useState('classic')
  const [upgradeModal, setUpgradeModal] = useState(null)
  // Groups the user has manually re-expanded after they collapsed to a
  // finished summary row. Session-only: resets on reload, never persisted.
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())

  useEffect(() => {
    axios.get(`${API}/sections/completion`)
      .then(r => setCompletion(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
    axios.get(`${API}/settings`)
      .then(r => { if (r.data.site_icon_set) setIconSet(r.data.site_icon_set) })
      .catch(() => {})
  }, [])

  const isStarted = s => (completion[s.id] ?? 0) > 0
  const count     = s => completion[s.id] ?? null
  const icons     = ICON_SETS[iconSet] || ICON_SETS.classic

  const startedCount = SECTIONS.filter(isStarted).length
  const isNewUser    = startedCount === 0
  const nextSection   = SECTIONS.find(s => !isStarted(s)) || SECTIONS[0]
  const progressPct   = Math.round((startedCount / SECTIONS.length) * 100)

  // "Continue where you left off": walk sections in the order they actually
  // appear on the page (group by group, in GROUPS order; within a group, in
  // SECTIONS order) and suggest the first one that hasn't been started yet.
  // Deliberately re-derived from the live GROUPS/SECTIONS arrays rather than
  // hardcoding a section, so an independent reordering of either array (e.g.
  // by "warmth") is picked up automatically.
  const nextIncompleteSection = GROUPS
    .flatMap(group => SECTIONS.filter(s => s.group === group.id))
    .find(s => !isStarted(s))

  if (loading) return (
    <div className="text-center py-5">
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="hero-panel mb-4">
        <div className="d-flex align-items-center gap-2 flex-wrap" style={{ marginBottom: 8 }}>
          <span style={{
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--green-700)',
          }}>
            {isNewUser ? `Welcome, ${user?.name?.split(' ')[0]}` : `Welcome back, ${user?.name?.split(' ')[0]}`}
          </span>
          {isPremium && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em',
              color: 'var(--green-900)', background: 'var(--gold-light, #E8B97A)',
              borderRadius: 12, padding: '4px 11px',
            }}>
              ✨ PREMIUM
            </span>
          )}
        </div>
        <h2 style={{
          color: 'var(--green-900)', fontFamily: 'Georgia, serif', fontWeight: 700,
          fontSize: '2rem', lineHeight: 1.25, margin: '0 0 12px', maxWidth: '22ch',
        }}>
          Your <mark>story</mark> is waiting to be told
        </h2>
        <p className="text-muted mb-3" style={{ maxWidth: 540, lineHeight: 1.65 }}>
          You have {SECTIONS.length} sections to work through, at whatever pace feels right for you.
          There is no right order, and no rush.
        </p>

        {/* ── Overall plan progress ───────────────────────────────────────── */}
        <div style={{ maxWidth: 420, marginBottom: 22 }}>
          <div className="d-flex align-items-baseline justify-content-between" style={{ marginBottom: 6 }}>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--green-700)',
            }}>
              Your plan so far
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--green-800)' }}>
              {progressPct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={startedCount}
            aria-valuemin={0}
            aria-valuemax={SECTIONS.length}
            aria-label={`${startedCount} of ${SECTIONS.length} sections started, ${progressPct} percent`}
            style={{ height: 10, borderRadius: 8, background: 'var(--green-100)', overflow: 'hidden' }}
          >
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'var(--progress-fill, var(--green-800))', borderRadius: 8,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 6, marginBottom: 0 }}>
            {startedCount} of {SECTIONS.length} sections started
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" style={{ fontWeight: 600, padding: '10px 22px' }}
            onClick={() => navigate(nextSection.route)}>
            Continue my plans →
          </button>
          <button type="button" className="btn btn-outline-primary" style={{ fontWeight: 600, padding: '10px 22px' }}
            onClick={() => navigate('/export')}>
            Export as PDF
          </button>
        </div>
      </div>

      <OrgBrandingBanner />

      {/* ── Onboarding welcome (shown only when no sections started) ───────── */}
      {isNewUser && (
        <div style={{
          background: 'linear-gradient(135deg, var(--green-50), var(--gold-50))',
          border: '1px solid var(--green-100)',
          borderRadius: 12, padding: '28px 32px', marginBottom: 28,
        }}>
          <h5 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
            A few good places to begin
          </h5>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20, maxWidth: 560 }}>
            Most people start with what feels most urgent or most personal to them.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'How I\'d Like to Be Remembered', route: '/sections/how-to-be-remembered' },
              { label: 'Funeral and End-of-Life Wishes',  route: '/sections/funeral-wishes' },
              { label: 'Emergency Contact',               route: '/sections/emergency-contact' },
              { label: 'Messages to Loved Ones',          route: '/sections/messages' },
            ].map(s => (
              <button
                key={s.route}
                onClick={() => navigate(s.route)}
                style={{
                  background: '#fff', border: '1px solid var(--green-100)',
                  borderRadius: 8, padding: '8px 16px',
                  color: 'var(--green-800)', fontSize: '0.88rem',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 0 }}>
            Or simply scroll down and click any section that calls to you.
          </p>
        </div>
      )}

      {/* ── Continue where you left off ──────────────────────────────────── */}
      {nextIncompleteSection && (
        <p style={{
          fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 18px',
        }}>
          Next:{' '}
          <button
            type="button"
            onClick={() => navigate(nextIncompleteSection.route)}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--green-800)', fontWeight: 700, textDecoration: 'underline',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
            }}
          >
            {nextIncompleteSection.label}
          </button>
        </p>
      )}

      {/* ── Section groups ─────────────────────────────────────────────────── */}
      {GROUPS.map((group, gi) => {
        const groupSections = SECTIONS.filter(s => s.group === group.id)
        const groupStarted  = groupSections.filter(isStarted).length
        // A group only collapses once every section in it has at least one
        // entry, the same "started" signal the overall progress bar uses.
        // A brand-new account (nothing started anywhere) never sees this.
        const groupComplete = groupSections.length > 0 && groupStarted === groupSections.length
        const groupCollapsed = groupComplete && !expandedGroups.has(group.id)
        const expandGroup = () => setExpandedGroups(prev => {
          const next = new Set(prev)
          next.add(group.id)
          return next
        })

        return (
          <div key={group.id} style={{ marginBottom: gi < GROUPS.length - 1 ? 36 : 0 }}>

            {/* Premium boundary divider */}
            {group.id === PREMIUM_BOUNDARY_GROUP && (
              <div style={{
                margin: '4px 0 28px',
                padding: '20px 24px',
                background: 'linear-gradient(135deg, var(--gold-50, #FBF3E4), var(--green-50, #EEF4EE))',
                border: '1px solid var(--gold-light, #E8D8A8)',
                borderRadius: 12,
                textAlign: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--gold-light, #E8D8A8)' }} />
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--green-800)', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    🔒 Premium sections
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--gold-light, #E8D8A8)' }} />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, maxWidth: 540, margin: '0 auto' }}>
                  {isPremium
                    ? 'The sections below are part of your Premium plan: your legal, financial, property, digital, and household records.'
                    : signupTrialExpired
                      ? "Your 30-day free trial has ended. Everything above is still free, forever, but the sections below, your legal, financial, property, digital, and household records, are now Premium-only. Nothing you recorded during your trial was lost."
                      : 'Everything above is free, forever. The sections below, your legal, financial, property, digital, and household records, require a Premium plan to add or edit.'}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.6, maxWidth: 540, margin: '8px auto 0', fontStyle: 'italic' }}>
                  🔐 Your Personal &amp; Legal Documents and Digital Life sections hold your most sensitive
                  information, so they're protected by a separate vault password, on top of your regular
                  sign-in, that only you know and that is never stored on our servers.
                </p>
                {!isPremium && (
                  <button
                    onClick={() => navigate('/upgrade')}
                    style={{
                      marginTop: 14, background: 'var(--green-800)', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '8px 20px', fontSize: '0.85rem', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    See Premium plans
                  </button>
                )}
              </div>
            )}

            {groupCollapsed ? (
              /* Finished group: collapsed to a single summary row */
              <button
                type="button"
                onClick={expandGroup}
                aria-expanded={false}
                aria-label={`${group.label}, all ${groupSections.length} sections started. Expand to view.`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', gap: 12,
                  background: group.cardBg,
                  border: `1px var(--card-border-style, solid) ${group.cardBorder}`,
                  borderRadius: 12, padding: '14px 20px',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <span className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: group.startedBorder, color: 'var(--group-pill-text, #ffffff)',
                    fontSize: '0.82rem', fontWeight: 700,
                  }}>
                    ✓
                  </span>
                  <h5 style={{
                    color: 'var(--green-900)', marginBottom: 0,
                    fontFamily: 'Georgia, serif', fontSize: '1.15rem',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {group.label}
                  </h5>
                </span>
                <span style={{
                  fontSize: '0.8rem', fontWeight: 700, color: group.startedBorder, flexShrink: 0,
                }}>
                  {groupStarted} of {groupSections.length}
                </span>
              </button>
            ) : (
              <>
                {/* Group heading */}
                <div style={{ marginBottom: 14 }}>
                  <div className="d-flex align-items-baseline gap-2 flex-wrap">
                    <h5 style={{
                      color: 'var(--green-900)', marginBottom: 0,
                      fontFamily: 'Georgia, serif', fontSize: '1.25rem',
                    }}>
                      {group.label}
                    </h5>
                    <span
                      aria-label={`${groupStarted} of ${groupSections.length} sections done in ${group.label}`}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: group.startedBorder,
                        background: group.iconBg,
                        border: `1px solid ${group.cardBorder}`,
                        borderRadius: 10,
                        padding: '1px 8px',
                        lineHeight: 1.6,
                      }}
                    >
                      {groupStarted} of {groupSections.length} done
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 0, marginTop: 2 }}>
                    {group.description}
                  </p>
                </div>

                {/* Cards */}
                <Row className="g-3">
                  {groupSections.map(section => {
                const started  = isStarted(section)
                const cnt      = count(section)
                const locked   = !isPremium && !FREE_ROUTES.has(section.route)
                const handleClick = () => {
                  if (locked) setUpgradeModal(section)
                  else navigate(section.route)
                }
                return (
                  <Col key={section.id} xs={12} sm={6} lg={4}>
                    <Card
                      className="h-100"
                      role="button"
                      tabIndex={0}
                      aria-label={`${section.label}${locked ? ', Premium section' : started ? `, ${count(section)} items recorded` : ', not started'}`}
                      style={{
                        cursor: 'pointer',
                        background: group.cardBg,
                        border: `1px var(--card-border-style, solid) ${group.cardBorder}`,
                        transition: 'box-shadow 0.15s, transform 0.1s',
                        boxShadow: 'none',
                        opacity: locked ? 0.8 : 1,
                      }}
                      onClick={handleClick}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleClick()}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = 'none'
                        e.currentTarget.style.transform = ''
                      }}
                    >
                      <Card.Body className="d-flex flex-column" style={{ padding: '16px' }}>

                        {/* Title */}
                        <p style={{
                          fontWeight: 600,
                          color: 'var(--green-900)',
                          marginBottom: 6,
                          fontSize: '0.88rem',
                          lineHeight: 1.35,
                        }}>
                          {section.label}
                        </p>

                        {/* Description */}
                        <p style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.55,
                          marginBottom: 0,
                          flex: 1,
                        }}>
                          {section.description}
                        </p>

                        {/* Bottom: status left, icon right */}
                        <div className="d-flex justify-content-between align-items-end mt-3">
                          <div>
                            {locked && (
                              <Badge bg={null} style={{
                                fontSize: '0.67rem', background: '#8A7A6A',
                                color: '#ffffff', fontWeight: 600, border: 'none', padding: '3px 8px',
                              }}>
                                🔒 Premium
                              </Badge>
                            )}
                            {!locked && !started && (
                              <Badge bg={null} style={{
                                fontSize: '0.67rem',
                                background: group.startedBorder,
                                color: 'var(--group-pill-text, #ffffff)',
                                fontWeight: 600,
                                border: 'none',
                                padding: '3px 8px',
                              }}>
                                Not started
                              </Badge>
                            )}
                            {!locked && cnt !== null && cnt > 0 && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--green-800)' }}>
                                {cnt} {cnt === 1 ? 'item' : 'items'}
                              </span>
                            )}
                          </div>
                          <span style={{
                            fontSize: '2.6rem', lineHeight: 1, flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: '3.2rem', height: '3.2rem', borderRadius: '50%',
                            background: group.iconBg,
                          }}>
                            {icons[section.id] || section.icon}
                          </span>
                        </div>

                      </Card.Body>
                    </Card>
                  </Col>
                )
              })}
                </Row>
              </>
            )}
          </div>
        )
      })}

      <UpgradeModal
        show={!!upgradeModal}
        onHide={() => setUpgradeModal(null)}
        sectionName={upgradeModal?.label || ''}
      />
    </div>
  )
}
