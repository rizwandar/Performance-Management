import { useState, useEffect } from 'react'
import { Form, Button, Row, Col, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const MODULES = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'tos', label: 'Terms of Service' },
]

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Publishing a new version replaces what TermsPage.jsx/PrivacyPage.jsx render
// live for every visitor, and archives the previous wording permanently in
// policy_versions (FEAT-04/05) - there's no "draft" state, so review the
// content carefully before publishing.
export default function LegalPanel({ showAlert }) {
  const [module, setModule] = useState('privacy')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [publishing, setPublishing] = useState(false)

  const load = (m) => {
    setLoading(true)
    Promise.all([
      axios.get(`${API}/legal/${m}/current`).catch(() => ({ data: null })),
      axios.get(`${API}/legal/${m}/history`),
    ]).then(([currentRes, historyRes]) => {
      setCurrent(currentRes.data)
      setHistory(historyRes.data)
      setContent(currentRes.data?.content_html || '')
      setSummary('')
    }).catch(() => showAlert('danger', 'Could not load legal content.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(module) }, [module])

  const handlePublish = () => {
    if (!content.trim()) return showAlert('danger', 'Content cannot be empty.')
    if (!window.confirm(`Publish this as v${(current?.version || 0) + 1} of the ${MODULES.find(m => m.id === module).label}? This immediately replaces what every visitor sees.`)) {
      return
    }
    setPublishing(true)
    axios.post(`${API}/legal/${module}/publish`, { content_html: content, summary })
      .then(() => {
        showAlert('success', 'Published. Existing users will be prompted to review and re-consent.')
        load(module)
      })
      .catch(err => showAlert('danger', err.response?.data?.error || 'Could not publish.'))
      .finally(() => setPublishing(false))
  }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>

  return (
    <div>
      <p className="text-muted small mb-4">
        Publishing a new version here is what actually changes the live /privacy and /terms pages.
        Every published version is kept permanently, and users whose consent is behind the current
        version see a re-consent prompt on their next visit.
      </p>

      <Row className="g-2 mb-3">
        <Col xs={6} md={4}>
          <Form.Select size="sm" value={module} onChange={e => setModule(e.target.value)}>
            {MODULES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Form.Select>
        </Col>
      </Row>

      <div style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
        <p className="text-muted small mb-1">Currently published</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>
          {current ? `v${current.version}` : 'Nothing published yet'}
        </p>
        {current && <p className="text-muted small mb-0">Published {formatDate(current.published_at)}</p>}
      </div>

      <Form.Label className="small fw-semibold">Content (HTML)</Form.Label>
      <Form.Control
        as="textarea"
        rows={14}
        className="mb-2"
        style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      <Form.Control
        size="sm"
        className="mb-2"
        placeholder="Summary of what changed (optional, for the admin history list below)"
        value={summary}
        onChange={e => setSummary(e.target.value)}
      />
      <Button size="sm" variant="primary" onClick={handlePublish} disabled={publishing}>
        {publishing ? 'Publishing…' : `Publish as v${(current?.version || 0) + 1}`}
      </Button>

      <h6 style={{ color: 'var(--green-900)', marginTop: 28, marginBottom: 12 }}>Version history</h6>
      {history.length === 0 ? (
        <p className="text-muted small">No versions published yet.</p>
      ) : history.map(v => (
        <div key={v.version} className="mb-2 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="d-flex justify-content-between">
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--green-900)' }}>v{v.version}</span>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              {formatDate(v.published_at)}{v.published_by_name ? ` · ${v.published_by_name}` : ''}
            </span>
          </div>
          {v.summary && <p className="text-muted small mb-0">{v.summary}</p>}
        </div>
      ))}
    </div>
  )
}
