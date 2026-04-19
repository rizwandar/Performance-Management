import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Badge, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Icon sets (per admin theme)
// ---------------------------------------------------------------------------
const ICON_SETS = {
  classic: {
    how_to_be_remembered: '🕯️',
    key_contacts:         '🤝',
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
  },
  heritage: {
    how_to_be_remembered: '🕯️',
    key_contacts:         '🤝',
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
  },
  modern: {
    how_to_be_remembered: '🕯️',
    key_contacts:         '🤝',
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
  },
}

// ---------------------------------------------------------------------------
// Section groups — logical groupings with earthy colour palette
// ---------------------------------------------------------------------------
const GROUPS = [
  {
    id:          'legacy',
    label:       'Your Legacy',
    description: 'Who you are, what you love, and what you want to leave behind.',
    cardBg:      '#FBF5E4',
    cardBorder:  '#E8D8A8',
    startedBorder: '#C9A84C',
    iconBg:      '#F5EAC8',
  },
  {
    id:          'wishes',
    label:       'Your Wishes',
    description: "How you'd like to be cared for and farewelled.",
    cardBg:      '#EEF4EE',
    cardBorder:  '#C4DCC4',
    startedBorder: '#5A9A5A',
    iconBg:      '#D8ECD8',
  },
  {
    id:          'people',
    label:       'Your People',
    description: 'The important people in your life and who should be involved.',
    cardBg:      '#F7EDE7',
    cardBorder:  '#E4C8B4',
    startedBorder: '#B87A50',
    iconBg:      '#EDD8C8',
  },
  {
    id:          'affairs',
    label:       'Your Affairs',
    description: 'Your documents, assets, finances, and practical matters.',
    cardBg:      '#EEEAE5',
    cardBorder:  '#D4CCC4',
    startedBorder: '#8A7A6A',
    iconBg:      '#E0D8D0',
  },
]

// ---------------------------------------------------------------------------
// Sections — each assigned to a group, with a warm description
// ---------------------------------------------------------------------------
const SECTIONS = [
  // ── Your Legacy ────────────────────────────────────────────────────────────
  {
    id: 'how_to_be_remembered', label: "How I'd Like to Be Remembered",
    icon: '🕯️', route: '/sections/how-to-be-remembered', group: 'legacy',
    description: 'Share your values, your story, and the things that define you, so those you love will always know who you were.',
  },
  {
    id: 'personal_messages', label: 'Messages to Loved Ones',
    icon: '💌', route: '/sections/messages', group: 'legacy',
    description: 'Write heartfelt letters to the people who matter most. Words they can hold onto long after you\'re gone.',
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

  // ── Your Wishes ────────────────────────────────────────────────────────────
  {
    id: 'funeral_wishes', label: 'Funeral & End-of-Life Wishes',
    icon: '🕊️', route: '/sections/funeral-wishes', group: 'wishes',
    description: 'Your gentle guidance for the farewell that truly reflects who you are and what you believe.',
  },
  {
    id: 'medical_wishes', label: 'Medical & Care Wishes',
    icon: '🏥', route: '/sections/medical-wishes', group: 'wishes',
    description: 'Your preferences for care and treatment, giving those who love you the clarity to act on your behalf.',
  },

  // ── Your People ────────────────────────────────────────────────────────────
  {
    id: 'key_contacts', label: 'Key Contacts',
    icon: '🤝', route: '/sections/key-contacts', group: 'people',
    description: 'The important people to call on: your lawyer, doctor, financial adviser, and trusted support.',
  },
  {
    id: 'people_to_notify', label: 'People to Notify',
    icon: '👥', route: '/sections/people-to-notify', group: 'people',
    description: 'The friends, family, and colleagues who should hear the news directly and with care.',
  },
  {
    id: 'children-dependants', label: 'Children & Dependants',
    icon: '👶', route: '/sections/children-dependants', group: 'people',
    description: 'Everything your loved ones need to know about caring for your children and those who depend on you.',
  },

  // ── Your Affairs ───────────────────────────────────────────────────────────
  {
    id: 'legal_documents', label: 'Personal & Legal Documents',
    icon: '📄', route: '/sections/legal-documents', group: 'affairs',
    description: 'Your will, powers of attorney, and identity documents, safely organised and easy to locate.',
  },
  {
    id: 'property_items', label: 'Property & Possessions',
    icon: '🏡', route: '/sections/property-possessions', group: 'affairs',
    description: 'A clear record of your home, vehicles, valuables, and the possessions that matter most.',
  },
  {
    id: 'financial_items', label: 'Financial Affairs',
    icon: '💼', route: '/sections/financial-affairs', group: 'affairs',
    description: 'Your accounts, investments, insurance policies, and financial affairs, all in one place.',
  },
  {
    id: 'digital_credentials', label: 'Digital Life',
    icon: '💻', route: '/sections/digital-life', group: 'affairs',
    description: 'Your online accounts and passwords, secured by your vault password and accessible when needed.',
  },
  {
    id: 'household-info', label: 'Practical Household Information',
    icon: '🔑', route: '/sections/household-info', group: 'affairs',
    description: 'Practical details about utilities, subscriptions, and services that keep everyday life running smoothly.',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [completion, setCompletion] = useState({})
  const [loading, setLoading]       = useState(true)
  const [iconSet, setIconSet]       = useState('classic')

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

  if (loading) return (
    <div className="text-center py-5">
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif' }}>
          {isNewUser ? `Welcome, ${user?.name?.split(' ')[0]}` : `Welcome back, ${user?.name?.split(' ')[0]}`}
        </h2>
        <p className="text-muted mb-0">
          Everything you record here will one day give your loved ones clarity and comfort.
        </p>
      </div>

      {/* ── Onboarding welcome (shown only when no sections started) ───────── */}
      {isNewUser && (
        <div style={{
          background: 'linear-gradient(135deg, var(--green-50), var(--gold-50))',
          border: '1px solid var(--green-100)',
          borderRadius: 12, padding: '28px 32px', marginBottom: 28,
        }}>
          <h5 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
            Your plans are waiting to be written
          </h5>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16, maxWidth: 560 }}>
            You have 14 sections to work through, at whatever pace feels right for you.
            There is no right order and no rush. Most people start with what feels most
            urgent or most personal to them.
          </p>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20, maxWidth: 560 }}>
            A few good places to begin:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'How I\'d Like to Be Remembered', route: '/sections/how-to-be-remembered' },
              { label: 'Funeral and End-of-Life Wishes',  route: '/sections/funeral-wishes' },
              { label: 'Key Contacts',                    route: '/sections/key-contacts' },
              { label: 'Messages to Loved Ones',          route: '/sections/messages' },
            ].map(s => (
              <button
                key={s.route}
                onClick={() => navigate(s.route)}
                style={{
                  background: '#fff', border: '1px solid var(--green-200, #A8C8B4)',
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

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 10, padding: '16px 20px',
        border: '1px solid var(--border)', marginBottom: 32,
      }}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span style={{ fontWeight: 600, color: 'var(--green-900)', fontSize: '0.9rem' }}>Your progress</span>
          <span className="text-muted small">{startedCount} of {SECTIONS.length} sections started</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={startedCount}
          aria-valuemin={0}
          aria-valuemax={SECTIONS.length}
          aria-label={`${startedCount} of ${SECTIONS.length} sections started`}
          style={{ height: 8, borderRadius: 8, background: 'var(--green-100)', overflow: 'hidden' }}
        >
          <div style={{
            height: '100%',
            width: `${(startedCount / SECTIONS.length) * 100}%`,
            background: 'var(--green-800)', borderRadius: 8,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* ── Section groups ─────────────────────────────────────────────────── */}
      {GROUPS.map((group, gi) => {
        const groupSections = SECTIONS.filter(s => s.group === group.id)
        const groupStarted  = groupSections.filter(isStarted).length

        return (
          <div key={group.id} style={{ marginBottom: gi < GROUPS.length - 1 ? 36 : 0 }}>
            {/* Group heading */}
            <div style={{ marginBottom: 14 }}>
              <div className="d-flex align-items-baseline gap-2 flex-wrap">
                <h5 style={{
                  color: 'var(--green-900)', marginBottom: 0,
                  fontFamily: 'Georgia, serif', fontSize: '1.25rem',
                }}>
                  {group.label}
                </h5>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {groupStarted}/{groupSections.length} started
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 0, marginTop: 2 }}>
                {group.description}
              </p>
            </div>

            {/* Cards */}
            <Row className="g-3">
              {groupSections.map(section => {
                const started = isStarted(section)
                const cnt     = count(section)
                return (
                  <Col key={section.id} xs={12} sm={6} lg={4}>
                    <Card
                      className="h-100"
                      role="button"
                      tabIndex={0}
                      aria-label={`${section.label}${started ? `, ${count(section)} items recorded` : ', not started'}`}
                      style={{
                        cursor: 'pointer',
                        background: group.cardBg,
                        border: `1px solid ${group.cardBorder}`,
                        transition: 'box-shadow 0.15s, transform 0.1s',
                        boxShadow: 'none',
                      }}
                      onClick={() => navigate(section.route)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate(section.route)}
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
                            {!started && (
                              <Badge style={{
                                fontSize: '0.67rem',
                                background: group.startedBorder,
                                color: '#ffffff',
                                fontWeight: 600,
                                border: 'none',
                                padding: '3px 8px',
                              }}>
                                Not started
                              </Badge>
                            )}
                            {cnt !== null && cnt > 0 && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--green-800)' }}>
                                {cnt} {cnt === 1 ? 'item' : 'items'}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>
                            {icons[section.id] || section.icon}
                          </span>
                        </div>

                      </Card.Body>
                    </Card>
                  </Col>
                )
              })}
            </Row>
          </div>
        )
      })}

    </div>
  )
}
