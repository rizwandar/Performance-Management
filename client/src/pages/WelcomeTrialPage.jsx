import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useSubscription } from '../context/SubscriptionContext'
import { FREE_FEATURES, PREMIUM_FEATURES } from '../constants/planFeatures'

const API = import.meta.env.VITE_API_URL || '/api'

// One column of the Free vs. Premium comparison below. `highlightFirst`
// pulls the list's first entry out as its own bold summary row instead of
// folding it into the grid - used for Premium's leading 'All free sections'
// entry (see constants/planFeatures.js), so "Premium is Free-plus-more"
// reads as a single clear statement rather than one bullet among many.
// The remaining items render in a responsive 1-2 column mini-grid (CSS
// auto-fill, no media query needed) so the full, unabridged feature lists
// still fit in a compact block rather than one long single-file column.
function PlanColumn({ title, badge, items, checkColor, highlightFirst }) {
  const summary = highlightFirst ? items[0] : null
  const rest = highlightFirst ? items.slice(1) : items
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <p style={{ fontFamily: 'Georgia, serif', color: 'var(--green-900)', fontWeight: 700, fontSize: '0.92rem', margin: 0 }}>
          {title}
        </p>
        {badge && (
          <span style={{
            background: 'var(--green-50)', color: 'var(--green-800)', fontSize: '0.62rem', fontWeight: 700,
            letterSpacing: '0.02em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999,
          }}>
            {badge}
          </span>
        )}
      </div>
      {summary && (
        <p style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8rem', fontWeight: 700, color: 'var(--green-800)', margin: '0 0 8px' }}>
          <span style={{ color: checkColor, flexShrink: 0 }}>✓</span> {summary}
        </p>
      )}
      <ul style={{
        listStyle: 'none', padding: 0, margin: 0, display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', columnGap: 16, rowGap: 5,
      }}>
        {rest.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ color: checkColor, fontSize: '0.75rem', marginTop: 3, flexShrink: 0 }}>✓</span>
            <span style={{ color: 'var(--text)', fontSize: '0.76rem', lineHeight: 1.4 }}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function WelcomeTrialPage() {
  const navigate = useNavigate()
  const { refresh } = useSubscription()
  const [loading, setLoading] = useState(null) // 'start' | 'decline' | null
  const [error, setError] = useState('')

  const respond = async (action) => {
    setLoading(action)
    setError('')
    try {
      await axios.post(`${API}/billing/${action === 'start' ? 'start-signup-trial' : 'decline-signup-trial'}`)
      await refresh()
      navigate('/profile')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  return (
    // Full-bleed band via .trial-hero (index.css), the same full-bleed
    // technique LandingPage.jsx uses for .landing-hero - this page renders
    // inside the identical NavBar + Container structure (see App.jsx), so
    // the same negative-margin math applies here too. --hero-bg is
    // transparent on the default theme (blends into the page background)
    // and a dark forest green on themes that set it (e.g. Heirloom).
    // Children below are not wrapped in an extra max-width container; each
    // sets its own max-width inline, matching how .landing-hero's own
    // children stay narrower than the full-bleed band itself.
    <div className="trial-hero">
      <p style={{
        color: 'var(--hero-heading-color, var(--green-900))', fontWeight: 700,
        fontSize: '0.8rem', letterSpacing: '0.04em', margin: '0 0 8px',
      }}>
        🌿 IN GOOD HANDS
      </p>
      <h1 style={{
        fontFamily: 'var(--heading-font, Georgia, serif)', color: 'var(--hero-heading-color, var(--green-900))',
        fontWeight: 700, fontSize: '1.3rem', lineHeight: 1.45, maxWidth: 520, margin: '0 auto 10px',
      }}>
        A gentle, private space to gather everything your loved ones will need, so that when the time comes, they are truly in good hands.
      </h1>

      <p style={{
        color: 'var(--hero-lead-color, var(--text-muted))', fontSize: '0.85rem', lineHeight: 1.6,
        maxWidth: 520, margin: '0 auto 22px', fontFamily: 'var(--body-font, inherit)',
      }}>
        For the next 30 days, you have full access to everything, including the sections that are
        normally Premium-only. No credit card required, nothing to cancel.
      </p>

      <div style={{
        background: '#fff', border: '1px solid var(--green-100)', borderRadius: 12,
        padding: '20px 22px 22px', textAlign: 'left', maxWidth: 600, margin: '0 auto',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px 28px', marginBottom: 18,
        }}>
          <PlanColumn title="Essentials" items={FREE_FEATURES} checkColor="var(--text-muted)" />
          <PlanColumn
            title="Premium" badge="Included free for 30 days"
            items={PREMIUM_FEATURES} checkColor="var(--green-700)" highlightFirst
          />
        </div>

        {error && (
          <p style={{ color: '#b3261e', fontSize: '0.85rem', margin: '0 0 12px' }}>{error}</p>
        )}

        <button
          type="button"
          onClick={() => respond('start')}
          disabled={loading !== null}
          style={{
            width: '100%', background: 'var(--btn-cta-bg, var(--green-800))', color: 'var(--btn-cta-color, #fff)',
            border: 'none', borderRadius: 'var(--btn-radius, 8px)', padding: '12px 20px',
            fontSize: '0.95rem', fontWeight: 600, cursor: loading !== null ? 'default' : 'pointer',
            opacity: loading !== null ? 0.75 : 1, fontFamily: 'var(--ui-font, inherit)',
          }}
        >
          {loading === 'start' ? 'Starting your trial...' : 'Start my free 30-day trial'}
        </button>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.5, textAlign: 'center', margin: '10px 0 0' }}>
          After 30 days, the Premium sections lock again, but nothing you recorded is ever lost, it's ready
          the moment you decide to upgrade.
        </p>
      </div>

      <button
        type="button"
        onClick={() => respond('decline')}
        disabled={loading !== null}
        style={{
          background: 'none', border: 'none', padding: '4px 8px', marginTop: 14,
          color: 'var(--hero-lead-color, var(--text-muted))', fontSize: '0.78rem', textDecoration: 'underline',
          cursor: loading !== null ? 'default' : 'pointer', opacity: loading !== null ? 0.75 : 1,
          fontFamily: 'var(--ui-font, inherit)',
        }}
      >
        {loading === 'decline' ? 'Saving...' : "No thanks, I'll stay on the Essentials plan"}
      </button>
    </div>
  )
}
