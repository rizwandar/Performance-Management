import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function OrgBrandingBanner() {
  const [org, setOrg] = useState(null)

  useEffect(() => {
    axios.get(`${API}/users/me/org-branding`)
      .then(r => setOrg(r.data))
      .catch(() => setOrg(null))
  }, [])

  if (!org) return null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 24,
      }}
    >
      {org.logo_url && (
        <img src={org.logo_url} alt={org.name} width="44" height="44"
          style={{ borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: 3, flexShrink: 0 }} />
      )}
      <div>
        <div className="small text-muted" style={{ fontWeight: 600 }}>In partnership with {org.name}</div>
        {org.about && <div className="small text-muted">{org.about}</div>}
      </div>
    </div>
  )
}
