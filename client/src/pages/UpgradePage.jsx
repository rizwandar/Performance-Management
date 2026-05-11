import { useSubscription } from '../context/SubscriptionContext'

const FREE_FEATURES = [
  'How I\'d Like to Be Remembered',
  'Messages to Loved Ones',
  'Songs That Define Me',
  'My Bucket List',
]

const PREMIUM_FEATURES = [
  'All 4 free sections',
  'Funeral and End-of-Life Wishes',
  'Medical and Care Wishes',
  'Key Contacts',
  'People to Notify',
  'Children and Dependants',
  'Personal and Legal Documents',
  'Property and Possessions',
  'Financial Affairs',
  'Digital Life (vault-encrypted)',
  'Practical Household Information',
  'Trusted contact access permissions',
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
      borderRadius: 16, overflow: 'hidden',
      boxShadow: highlight ? '0 4px 24px rgba(45,90,61,0.12)' : 'none',
    }}>
      {badge && (
        <div style={{ background: 'var(--green-700)', color: '#fff', textAlign: 'center', padding: '6px 0', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em' }}>
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

export default function UpgradePage() {
  const { isPremium, plan } = useSubscription()

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', color: 'var(--green-900)', marginBottom: 12 }}>
          Choose Your Plan
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
          In Good Hands is free to start. Upgrade to unlock every section and keep everything your loved ones will need in one place.
        </p>
        {isPremium && (
          <div style={{
            display: 'inline-block', marginTop: 16,
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 8, padding: '8px 20px', color: 'var(--green-800)', fontSize: '0.9rem',
          }}>
            You are currently on the <strong>Premium</strong> plan. Full access is active.
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
          price="$4.99"
          period="/ month"
          features={PREMIUM_FEATURES}
          highlight
          badge="MOST POPULAR"
          cta={
            <div style={{
              background: 'var(--green-100)', border: '1px solid var(--green-200)',
              borderRadius: 10, padding: '14px 16px', textAlign: 'center',
            }}>
              <p style={{ color: 'var(--green-800)', fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>Coming soon</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 0, lineHeight: 1.5 }}>
                Online payment is in development. In the meantime, all accounts have full Premium access.
              </p>
            </div>
          }
        />
        <PlanCard
          title="Premium Annual"
          price="$29.99"
          period="/ year"
          note="That's just $2.50 per month, saving $30"
          features={PREMIUM_FEATURES}
          cta={
            <div style={{
              background: 'var(--parchment-dark)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px', textAlign: 'center',
            }}>
              <p style={{ color: 'var(--green-800)', fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>Coming soon</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 0, lineHeight: 1.5 }}>
                Annual billing will be available when online payment launches.
              </p>
            </div>
          }
        />
      </div>

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 12, padding: '20px 24px', textAlign: 'center',
        color: 'var(--green-800)', fontSize: '0.9rem', lineHeight: 1.7,
      }}>
        <strong>Currently in open access:</strong> While payment processing is being set up, every account has full Premium access at no charge. We will notify you by email before any billing begins.
      </div>
    </div>
  )
}
