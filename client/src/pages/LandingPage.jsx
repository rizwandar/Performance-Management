import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'

export default function LandingPage() {
  const { isLoggedIn, user } = useAuth()
  const { siteName, logoUrl } = useBranding()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoggedIn()) {
      navigate(user?.is_admin ? '/admin' : '/profile')
    }
  }, [])

  return (
    <div className="landing-hero">
      <img src={logoUrl} alt={siteName} width="90" height="90" className="mb-4" />
      <h1 className="mb-3">{siteName}</h1>
      <p className="text-muted mb-3" style={{ fontSize: '0.92rem' }}>
        🔒 Your life's most important information, saved securely.
      </p>
      <p className="lead mb-5">
        A gentle, private space to gather everything your loved ones
        will need, so that when the time comes, they are truly in good hands.
      </p>
      <div className="d-flex justify-content-center gap-3 flex-wrap">
        <Button variant="primary" size="lg" onClick={() => navigate('/register')}>
          Begin my journey
        </Button>
        <Button variant="outline-primary" size="lg" onClick={() => navigate('/login')}>
          Sign in
        </Button>
      </div>
      <p className="mt-5 text-muted" style={{ fontSize: '0.9rem', maxWidth: 480, margin: '2rem auto 0' }}>
        Everything you record here is private and secure, protected with AES-256-GCM encryption,
        the same standard used for classified government information and required by law to
        protect medical records. Share it only with those you choose, and only when you're ready.{' '}
        <Link to="/security">Learn more about our security</Link>.
      </p>
    </div>
  )
}
