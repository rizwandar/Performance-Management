import { useState, useEffect } from 'react'
import { Spinner } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'

const API = import.meta.env.VITE_API_URL

const STATUS_LABELS = {
  invited:          'Invited',
  signed_up:        'Signed Up',
  plan_in_progress: 'Plan In Progress',
  plan_completed:   'Plan Completed',
  deceased:         'Deceased',
  archived:         'Archived',
}

const card = { background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', textAlign: 'center' }

export default function OrgDashboardPage() {
  const { user } = useAuth()
  const [counts, setCounts]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/org-portal/dashboard`)
      .then(r => setCounts(r.data.counts))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  return (
    <div>
      <h2 style={{ color: 'var(--heading-color, var(--green-900))', fontFamily: 'Georgia, serif', marginBottom: 24 }}>
        Organization Dashboard
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 32 }}>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} style={card}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--green-900)' }}>{counts?.[key] ?? 0}</div>
            <div className="small text-muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="d-flex gap-3 flex-wrap">
        <Link to="/org/customers" className="btn btn-sm" style={{ background: 'var(--green-800)', color: '#fff', border: 'none' }}>
          Manage Customers
        </Link>
        {user?.org_role === 'org_admin' && (
          <Link to="/org/staff" className="btn btn-sm btn-outline-secondary">Manage Staff</Link>
        )}
        <Link to="/org/settings" className="btn btn-sm btn-outline-secondary">Settings</Link>
      </div>
    </div>
  )
}
