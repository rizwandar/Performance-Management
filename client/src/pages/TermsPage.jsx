import { useState, useEffect } from 'react'
import axios from 'axios'
import { Spinner } from 'react-bootstrap'

const API = import.meta.env.VITE_API_URL

// Content is admin-published and versioned (FEAT-04/05) rather than hardcoded
// here, so there's a permanent record of exactly what terms were in effect
// at any point in time. See server/routes/legal.js and .legal-doc in
// index.css for the styling this HTML relies on.
export default function TermsPage() {
  const [html, setHtml] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    axios.get(`${API}/legal/tos/current`)
      .then(r => setHtml(r.data.content_html))
      .catch(() => setError(true))
  }, [])

  if (error) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto' }} className="text-center text-muted py-5">
        Could not load the Terms of Service right now. Please try again shortly.
      </div>
    )
  }

  if (!html) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
      </div>
    )
  }

  return <div className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />
}
