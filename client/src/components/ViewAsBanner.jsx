import { useNavigate } from 'react-router-dom'
import { useAuth, parseJwt } from '../context/AuthContext'

export default function ViewAsBanner() {
  const { token, exitViewAs } = useAuth()
  const navigate = useNavigate()

  const decoded = token ? parseJwt(token) : null
  if (!decoded?.viewAs) return null

  const customerName = localStorage.getItem('viewAsCustomerName') || 'this customer'

  const handleExit = async () => {
    await exitViewAs()
    navigate('/org/customers')
  }

  return (
    <div
      style={{
        background: '#B45309', color: '#fff', textAlign: 'center',
        padding: '10px 16px', fontWeight: 600, fontSize: '0.9rem',
        position: 'sticky', top: 0, zIndex: 1050,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
      }}
    >
      <span>You are viewing as {customerName}.</span>
      <button
        onClick={handleExit}
        style={{
          background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: 6, padding: '3px 12px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
        }}
      >
        Exit view-as
      </button>
    </div>
  )
}
