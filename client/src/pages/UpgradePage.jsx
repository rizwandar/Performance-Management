import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useSubscription } from '../context/SubscriptionContext'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL || '/api'

const FREE_FEATURES = [
  'How I\'d Like to Be Remembered',
  'Messages to Loved Ones',
  'Unfinished Business',
  'Songs That Define Me',
  'My Bucket List',
  'Funeral and End-of-Life Wishes',
  'Doctors',
  'Medical Records',
  'Key Contacts',
  'People to Notify',
  'Your Loved Ones',
  'Pet Care',
  'Insurance',
  'Trusted contact access permissions',
]

const PREMIUM_FEATURES = [
  'All free sections',
  'Your Last Moments (a dedicated final recording or letter)',
  'Personal and Legal Documents',
  'Property and Possessions',
  'Financial Affairs',
  'Digital Life (vault-encrypted)',
  'Practical Household Information',
  'Donation Bank (vault-encrypted)',
  'Document and photo uploads',
  'Full PDF export (including vault)',
  'Inactivity timer and notifications',
]

function FeatureList({ items, color }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((f, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <span style={{ color, fontSize: '1rem', marginTop: 2, flexShrink: 0 }}>✓</span>
          <span style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.5 }}>{f}</span>
        </li>
      ))}
    </ul>
  )
}

function PlanCard({ title, price, period, note, features, highlight, badge, checkColor, cta }) {
  return (
    <div style={{
      flex: 1, minWidth: 260, maxWidth: 360,
      border: highlight ? '2px solid var(--green-600)' : '1px solid var(--border)',
      borderRadius: 'var(--card-radius, 16px)', overflow: 'hidden',
      boxShadow: highlight ? '0 4px 24px rgba(45,90,61,0.12)' : 'none',
    }}>
      {badge && (
        <div style={{
          background: 'var(--btn-cta-bg, var(--green-700))', color: 'var(--btn-cta-color, #fff)',
          textAlign: 'center', padding: '6px 0', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em',
        }}>
          {badge}
        </div>
      )}
      <div style={{ background: highlight ? 'var(--parchment)' : '#fff', padding: '28px 28px 24px' }}>
        <p style={{ fontFamily: 'Georgia, serif', color: 'var(--green-900)', fontSize: '1.25rem', fontWeight: 700, marginBottom: 6 }}>{title}</p>
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--green-800)' }}>{price}</span>
          {period && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}> {period}</span>}
          {note && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4, marginBottom: 0 }}>{note}</p>}
        </div>
        <FeatureList items={features} color={checkColor || 'var(--green-700)'} />
        <div style={{ marginTop: 24 }}>
          {cta}
        </div>
      </div>
    </div>
  )
}

function CheckoutButton({ label, planId, trialEligible }) {
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [skipTrial, setSkipTrial] = useState(false)

  const startCheckout = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await axios.post(`${API}/billing/create-checkout-session`, { plan: planId, skipTrial })
      window.location.href = r.data.url
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start checkout. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={startCheckout}
        disabled={loading}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: 'var(--btn-radius, 10px)', border: 'none',
          background: 'var(--btn-cta-bg, var(--green-700))', color: 'var(--btn-cta-color, #fff)',
          fontWeight: 600, fontSize: '0.95rem',
          cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Redirecting to checkout...' : (trialEligible && !skipTrial ? `${label} (start free trial)` : label)}
      </button>
      {trialEligible && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={skipTrial} onChange={e => setSkipTrial(e.target.checked)} disabled={loading} />
          Skip the free trial and pay now instead
        </label>
      )}
      {error && <p style={{ color: '#b3261e', fontSize: '0.82rem', marginTop: 8, marginBottom: 0 }}>{error}</p>}
    </div>
  )
}

export default function UpgradePage() {
  const { isPremium, plan } = useSubscription()
  const { user } = useAuth()
  const [subscription, setSubscription] = useState(null)
  // Only 'cancelled' ever lands here now - a successful checkout redirects to
  // My Profile instead (IDEA-11), so there's a bigger, better-placed
  // thank-you there rather than a small pill on the page just paid past.
  const [checkoutCancelled, setCheckoutCancelled] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'cancelled') {
      setCheckoutCancelled(true)
      window.history.replaceState({}, '', '/upgrade')
    }
  }, [])

  useEffect(() => {
    if (!user) return
    axios.get(`${API}/billing/subscription`)
      .then(r => setSubscription(r.data))
      .catch(() => {})
  }, [user, plan])

  // BIL-04: a 14-day card-required trial, once per account. subscription is
  // null until the request above resolves, so this defaults to eligible
  // rather than flashing "start free trial" and then hiding it.
  const trialEligible = !subscription?.trial_used

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', color: 'var(--heading-color, var(--green-900))', marginBottom: 12 }}>
          Choose Your Plan
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
          In Good Hands is free to start. Upgrade to unlock every section and keep everything your loved ones will need in one place.
        </p>

        {checkoutCancelled && (
          <div style={{
            display: 'inline-block', marginTop: 16,
            background: 'var(--parchment-dark)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 20px', color: 'var(--text-muted)', fontSize: '0.9rem',
          }}>
            Checkout was cancelled, no charge was made.
          </div>
        )}

        {isPremium && !checkoutCancelled && (
          <div style={{
            display: 'inline-block', marginTop: 16,
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 8, padding: '8px 20px', color: 'var(--green-800)', fontSize: '0.9rem',
          }}>
            You are currently on the <strong>Premium</strong> plan. Full access is active.
            {subscription?.provider === 'stripe' && (
              <>
                {' '}Manage your billing in{' '}
                <Link to="/profile/settings" style={{ color: 'var(--green-800)', fontWeight: 600 }}>My Profile</Link>.
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 48 }}>
        <PlanCard
          title="Free"
          price="$0"
          period="forever"
          features={FREE_FEATURES}
          checkColor="var(--text-muted)"
          cta={
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 0' }}>
              {plan === 'free' ? 'Your current plan' : 'Included in your Premium plan'}
            </div>
          }
        />
        <PlanCard
          title="Premium Monthly"
          price="$10"
          period="/ month"
          note={trialEligible ? '14-day free trial, cancel anytime' : undefined}
          features={PREMIUM_FEATURES}
          highlight
          badge="MOST POPULAR"
          cta={
            subscription?.plan_id === 'monthly'
              ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 0' }}>Your current plan</div>
              : <CheckoutButton label="Subscribe Monthly" planId="monthly" trialEligible={trialEligible} />
          }
        />
        <PlanCard
          title="Premium Annual"
          price="$100"
          period="/ year"
          note={trialEligible ? "That's just $8.33 per month, saving $20. 14-day free trial, cancel anytime." : "That's just $8.33 per month, saving $20"}
          features={PREMIUM_FEATURES}
          cta={
            subscription?.plan_id === 'annual'
              ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 0' }}>Your current plan</div>
              : <CheckoutButton label="Subscribe Annually" planId="annual" trialEligible={trialEligible} />
          }
        />
      </div>

      {trialEligible && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 560, margin: '-24px auto 0', lineHeight: 1.6 }}>
          Try everything free for 14 days. We'll email you 2 days before your trial ends, and your card
          won't be charged until then. Cancel anytime before that in one click, no charge at all.
        </p>
      )}
    </div>
  )
}
