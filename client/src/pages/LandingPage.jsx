import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { useAuth } from '../context/AuthContext'

export default function LandingPage() {
  const { isTokenValid, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isTokenValid()) {
      navigate(user?.is_admin ? '/admin' : '/profile')
    }
  }, [])

  return (
    <div className="text-center py-5">
      <h1 className="mb-3">Welcome</h1>
      <p className="lead text-muted mb-4">Create your profile to get started.</p>
      <div className="d-flex justify-content-center gap-3">
        <Button variant="primary" size="lg" onClick={() => navigate('/register')}>
          Create Profile
        </Button>
        <Button variant="outline-primary" size="lg" onClick={() => navigate('/login')}>
          Login
        </Button>
      </div>
    </div>
  )
}
