import { Link } from 'react-router-dom'

const TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'Free',
    detail: null,
    customers: 'Up to 5 active customers',
    admins: '1 Org Admin',
    staff: '1 Org Staff',
    features: ['Logo branding', 'Lifecycle tracking'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$99',
    detail: '/month',
    customers: 'Up to 50 active customers',
    admins: '3 Org Admins',
    staff: '3 Org Staff',
    features: ['Multiple locations', 'View-as mode', 'Edit-on-behalf', 'Dashboard'],
    highlight: true,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$199',
    detail: '/month + $3 per active customer beyond 100',
    customers: 'Unlimited active customers',
    admins: '5 Org Admins',
    staff: '10 Org Staff',
    features: ['Everything included'],
  },
]

export default function PricingPage() {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
          Organization Pricing
        </h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: 640, margin: '0 auto' }}>
          For funeral homes, cremation services, cemeteries, and life management companies who want to
          help their customers complete an end-of-life plan on In Good Hands.
        </p>
      </div>

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '14px 20px', marginBottom: 32,
        textAlign: 'center', fontWeight: 600, color: 'var(--green-900)',
      }}>
        Currently free during our launch period.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
        {TIERS.map(tier => (
          <div
            key={tier.id}
            style={{
              background: 'var(--parchment)',
              border: tier.highlight ? '2px solid var(--green-800)' : '1px solid var(--border)',
              borderRadius: 12,
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 4 }}>
              {tier.name}
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--green-900)' }}>{tier.price}</span>
              {tier.detail && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> {tier.detail}</span>}
            </div>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: 4 }}>{tier.customers}</div>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: 4 }}>{tier.admins}</div>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: 16 }}>{tier.staff}</div>
            <ul style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.9, paddingLeft: 18, marginBottom: 0 }}>
              {tier.features.map(f => <li key={f}>{f}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="text-center" style={{ marginTop: 32 }}>
        <Link to="/register/organization" className="btn" style={{ background: 'var(--green-800)', color: '#fff', border: 'none', padding: '10px 28px' }}>
          Register Your Organization
        </Link>
      </div>

      <div style={{
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '18px 22px', marginTop: 24,
        fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        Customers signed up through an organization receive Premium features free for one year from
        association. Payments are not yet being collected. Interested in bringing In Good Hands to your
        organization's customers? Reach out using the contact form at the bottom of any page.
      </div>
    </div>
  )
}
