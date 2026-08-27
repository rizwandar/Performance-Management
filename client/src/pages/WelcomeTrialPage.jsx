import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useSubscription } from '../context/SubscriptionContext'

const API = import.meta.env.VITE_API_URL || '/api'

// Post-BIL-08: the same vault-protected sections DashboardPage's
// PREMIUM_BOUNDARY_GROUP divider and UpgradePage's PREMIUM_FEATURES list,
// spelled out here rather than imported since neither of those exports the
// list as reusable data - kept in sync with both by hand.
const VAULT_SECTIONS = [
  'Personal & Legal Documents',
  'Digital Life',
  'Financial Affairs',
  'Property & Possessions',
  'Practical Household Information',
  'Donation Bank',
]

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
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '8px 0 40px' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--green-50), var(--gold-50))',
        border: '1px solid var(--green-100)',
        borderRadius: 'var(--card-radius, 16px)',
        padding: '40px 40px 32px',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: '2.4rem' }}>🌿</span>
        <h2 style={{
          fontFamily: 'var(--heading-font, Georgia, serif)', color: 'var(--heading-color, var(--green-900))',
          fontWeight: 700, fontSize: '1.8rem', margin: '14px 0 14px',
        }}>
          Welcome to In Good Hands
        </h2>
        <p style={{ color: 'var(--text)', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 8px', fontFamily: 'var(--body-font, inherit)' }}>
          For the next 30 days, you have full access to every section, including the sections that are
          normally Premium-only: your legal, financial, property, digital, and household records.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 20px', fontFamily: 'var(--body-font, inherit)' }}>
          No credit card required, nothing to cancel.
        </p>

        <ul style={{
          listStyle: 'none', padding: '18px 20px', margin: '0 auto 20px', maxWidth: 420, textAlign: 'left',
          background: '#fff', border: '1px solid var(--green-100)', borderRadius: 10,
        }}>
          {VAULT_SECTIONS.map(label => (
            <li key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, fontSize: '0.9rem', color: 'var(--text)' }}>
              <span style={{ color: 'var(--green-700)', flexShrink: 0 }}>✓</span>
              <span style={{ fontFamily: 'var(--body-font, inherit)' }}>{label}</span>
            </li>
          ))}
        </ul>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 8px', fontFamily: 'var(--body-font, inherit)' }}>
          After 30 days, those sections become Premium-only again, but nothing you record is ever lost.
          Everything stays exactly as you left it, ready the moment you decide to upgrade.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 28px', fontFamily: 'var(--body-font, inherit)' }}>
          You can start your trial whenever you're ready, today or later, from the Upgrade page.
        </p>

        {error && (
          <p style={{ color: '#b3261e', fontSize: '0.88rem', marginBottom: 16 }}>{error}</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => respond('start')}
            disabled={loading !== null}
            style={{
              background: 'var(--green-800)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '12px 28px', fontSize: '0.95rem', fontWeight: 600,
              cursor: loading !== null ? 'default' : 'pointer', opacity: loading !== null ? 0.75 : 1,
              fontFamily: 'var(--ui-font, inherit)', minWidth: 260,
            }}
          >
            {loading === 'start' ? 'Starting your trial...' : 'Start my free 30-day trial'}
          </button>
          <button
            type="button"
            onClick={() => respond('decline')}
            disabled={loading !== null}
            style={{
              background: 'none', border: 'none', padding: '4px 8px',
              color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'underline',
              cursor: loading !== null ? 'default' : 'pointer', opacity: loading !== null ? 0.75 : 1,
              fontFamily: 'var(--ui-font, inherit)',
            }}
          >
            {loading === 'decline' ? 'Saving...' : "No thanks, I'll stay on the Free plan"}
          </button>
        </div>
      </div>
    </div>
  )
}
