import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState('loading') // 'loading' | 'success' | 'already' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('No verification token found in this link. Please check your email and try again.')
      return
    }
    axios.get(`${API}/auth/verify-email/${token}`)
      .then(r => setStatus(r.data.already ? 'already' : 'success'))
      .catch(err => {
        setStatus('error')
        setErrorMsg(err.response?.data?.error || 'We could not verify your email. Please try again or request a new link.')
      })
  }, [token])

  return (
    <div className="d-flex justify-content-center pt-5">
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        {status === 'loading' && (
          <>
            <Spinner animation="border" style={{ color: 'var(--green-800)' }} className="mb-3" />
            <p className="text-muted">Verifying your email address…</p>
          </>
        )}

        {status === 'success' && (
          <div style={{
            background: 'var(--parchment)', border: '1px solid var(--green-100)',
            borderRadius: 16, padding: '40px 32px',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
            <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
              Email verified
            </h4>
            <p className="text-muted mb-4">
              Your email address has been confirmed. Your account is now fully active.
              We've also sent you a welcome email.
            </p>
            <Link to="/login" className="btn btn-primary">
              Sign in to your account
            </Link>
          </div>
        )}

        {status === 'already' && (
          <div style={{
            background: 'var(--parchment)', border: '1px solid var(--green-100)',
            borderRadius: 16, padding: '40px 32px',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✓</div>
            <h4 style={{ color: 'var(--green-900)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
              Already verified
            </h4>
            <p className="text-muted mb-4">
              Your email address is already verified. You can sign in to continue.
            </p>
            <Link to="/login" className="btn btn-primary">
              Sign in
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 16, padding: '40px 32px',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✉️</div>
            <h4 style={{ color: '#991B1B', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
              Verification failed
            </h4>
            <p style={{ color: '#7F1D1D', marginBottom: 24 }}>{errorMsg}</p>
            <p className="text-muted small mb-4">
              If you're already signed in, you can request a new verification link from the
              banner at the top of your account.
            </p>
            <Link to="/login" className="btn btn-outline-secondary">
              Back to sign in
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
