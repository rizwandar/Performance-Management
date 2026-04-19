import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function NotFoundPage() {
  const { isTokenValid } = useAuth()

  return (
    <div style={{
      maxWidth: 520, margin: '60px auto 0', textAlign: 'center', padding: '0 24px',
    }}>
      <p style={{ fontSize: '3.5rem', marginBottom: 8 }}>404</p>
      <h2 style={{
        color: 'var(--green-900)', fontFamily: 'Georgia, serif',
        marginBottom: 12, fontSize: '1.6rem',
      }}>
        Page not found
      </h2>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 32 }}>
        The page you were looking for does not exist or may have moved.
        If you followed a link, it may be out of date.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link
          to={isTokenValid() ? '/profile' : '/'}
          style={{
            background: 'var(--green-800)', color: '#fff',
            padding: '10px 24px', borderRadius: 8,
            textDecoration: 'none', fontSize: '0.95rem',
          }}
        >
          {isTokenValid() ? 'Back to my plans' : 'Back to home'}
        </Link>
        <Link
          to="/login"
          style={{
            background: 'transparent', color: 'var(--green-800)',
            padding: '10px 24px', borderRadius: 8,
            border: '1px solid var(--green-800)',
            textDecoration: 'none', fontSize: '0.95rem',
          }}
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}
