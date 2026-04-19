import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function HowToBeRememberedPage() {
  const navigate = useNavigate()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [form, setForm] = useState({
    life_story:     '',
    about_me:       '',
    remembered_for: '',
    legacy_message: '',
  })

  useEffect(() => {
    axios.get(`${API}/users/me`)
      .then(r => {
        const u = r.data
        setForm({
          life_story:     u.life_story     || '',
          about_me:       u.about_me       || '',
          remembered_for: u.remembered_for || '',
          legacy_message: u.legacy_message || '',
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await axios.put(`${API}/users/me`, form)
      setSuccess('Saved.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save your changes. Please try again.")
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="text-center py-5">
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
        <h3 style={{ color: 'var(--green-900)' }}>🕯️ How I'd Like to Be Remembered</h3>
        <p className="text-muted">
          The most personal part of your plans. These words will help the people you love understand
          who you were, what you stood for, and how you'd like to be remembered.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error   && <Alert variant="danger">{error}</Alert>}

      {/* My Life Story */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>My Life Story</h6>
        <p className="text-muted small mb-3">
          A biography in your own words: where you grew up, what shaped you, the chapters of your life.
          Write as much or as little as you like.
        </p>
        <Form.Control
          as="textarea" rows={7}
          value={form.life_story}
          onChange={set('life_story')}
          placeholder="I was born in... I grew up... The things that shaped me most were..."
          style={{ lineHeight: 1.8 }}
        />
      </div>

      {/* Life's motto */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>My Guiding Words</h6>
        <p className="text-muted small mb-3">
          A motto, a belief, a quote, or a few words that capture how you tried to live.
        </p>
        <Form.Control
          as="textarea" rows={2}
          value={form.about_me}
          onChange={set('about_me')}
          placeholder="e.g. 'Be kind, always.' or 'Live fully, love deeply, leave it better than you found it.'"
        />
      </div>

      {/* How I'd like to be remembered */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>How I'd Like to Be Remembered</h6>
        <p className="text-muted small mb-3">
          What do you hope people will say about you? What did you stand for? What are you proudest of?
        </p>
        <Form.Control
          as="textarea" rows={4}
          value={form.remembered_for}
          onChange={set('remembered_for')}
          placeholder="I hope people remember me as someone who... I'm proudest of... What I valued most was..."
          style={{ lineHeight: 1.8 }}
        />
      </div>

      {/* Message to leave behind */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h6 style={{ color: 'var(--green-900)', marginBottom: 4 }}>A Message to Leave Behind</h6>
        <p className="text-muted small mb-3">
          A final message to everyone you love. Write from the heart. There are no rules here.
        </p>
        <Form.Control
          as="textarea" rows={6}
          value={form.legacy_message}
          onChange={set('legacy_message')}
          placeholder="To everyone I love... Thank you for... I want you to know..."
          style={{ lineHeight: 1.8 }}
        />
        <Form.Text className="text-muted">This is included in your PDF export.</Form.Text>
      </div>

      <div className="d-flex align-items-center gap-3 flex-wrap">
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
      </div>
      {success && <Alert variant="success" className="mt-3">{success}</Alert>}
      {error   && <Alert variant="danger"  className="mt-3">{error}</Alert>}
    </div>
  )
}
