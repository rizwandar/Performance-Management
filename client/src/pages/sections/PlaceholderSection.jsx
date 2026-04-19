import { useNavigate } from 'react-router-dom'

export default function PlaceholderSection({ icon, title, description }) {
  const navigate = useNavigate()
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button
        className="btn btn-link p-0 mb-4"
        style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
        onClick={() => navigate('/profile')}
      >
        ← Back to my plans
      </button>
      <div className="section-placeholder py-5">
        <p style={{ fontSize: '3rem', marginBottom: 12 }}>{icon}</p>
        <h4 style={{ color: 'var(--green-900)', marginBottom: 8 }}>{title}</h4>
        <p className="text-muted mb-0" style={{ maxWidth: 420, margin: '0 auto' }}>
          {description}
        </p>
        <p className="mt-4" style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.9rem' }}>
          This section is coming soon.
        </p>
      </div>
    </div>
  )
}
