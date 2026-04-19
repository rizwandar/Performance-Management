import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'

export default function LandingPage() {
  const { isTokenValid, user } = useAuth()
  const { siteName, logoUrl } = useBranding()
  const navigate = useNavigate()

  useEffect(() => {
    if (isTokenValid()) {
      navigate(user?.is_admin ? '/admin' : '/profile')
    }
  }, [])

  return (
    <div className="landing-hero">
      <img src={logoUrl} alt={siteName} width="90" height="90" className="mb-4" />
      <h1 className="mb-3">{siteName}</h1>
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
        Everything you record here is private and secure.
        Share it only with those you choose, and only when you're ready.
      </p>
    </div>
  )
}
