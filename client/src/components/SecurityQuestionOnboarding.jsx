import { useEffect, useState } from 'react'
import { Button, Form, Row, Col, Alert } from 'react-bootstrap'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { useLocation } from 'react-router-dom'
import { SECURITY_QUESTION_PRESETS, CUSTOM_QUESTION } from '../pages/ProfilePage'

const API = import.meta.env.VITE_API_URL

// One-time blocking step for accounts created after FEAT-06: every new
// signup must set at least one security question before using the app, since
// it's the only self-serve way back in if a password is ever forgotten (the
// vault password itself is deliberately excluded from this - it stays
// unrecoverable by design, see SecurityPage.jsx). Reuses the same
// PUT /users/me/security-question endpoint ProfilePage uses later to change
// it, so there is exactly one code path that can ever set the answer hash,
// and it still requires the account password (SEC-05's reauthentication
// rule applies here too, not just when changing an existing question).
// must_set_security_question resolves itself server-side the moment a
// question is set, so this simply stops rendering once /users/me reflects
// that - no separate "mark onboarding complete" call needed.
export default function SecurityQuestionOnboarding() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState({ current_password: '', questionChoice: SECURITY_QUESTION_PRESETS[0], customQuestion: '', answer: '', confirmAnswer: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user || user.is_admin) { setPending(false); return }
    axios.get(`${API}/users/me`)
      .then(r => setPending(!!r.data.must_set_security_question))
      .catch(() => setPending(false))
    // Re-checks on route change so a fresh login (which doesn't carry this
    // flag in the cached `user` object) still picks it up promptly.
  }, [user, location.pathname])

  if (!pending) return null

  const handleSave = async () => {
    setError('')
    const question = form.questionChoice === CUSTOM_QUESTION ? form.customQuestion.trim() : form.questionChoice
    if (!form.current_password) return setError('Please enter your account password to confirm.')
    if (!question) return setError('Please choose or write a question.')
    if (!form.answer.trim()) return setError('Please enter an answer.')
    if (form.answer !== form.confirmAnswer) return setError('Answers do not match.')
    setSaving(true)
    try {
      await axios.put(`${API}/users/me/security-question`, {
        current_password: form.current_password,
        question,
        answer: form.answer,
      })
      setPending(false)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(28, 25, 20, 0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--parchment, #fff)', borderRadius: 12, padding: '32px',
        maxWidth: 480, width: '100%', border: '1px solid var(--border, #ddd)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
      }}>
        <h5 style={{ color: 'var(--green-900)', marginBottom: 8 }}>🔑 One last step: set a security question</h5>
        <p className="text-muted small mb-4">
          Before you get started, please set up a security question. It's the only self-serve way
          back into your account if you ever forget your password. (Your vault password is separate
          and stays unrecoverable by design, so this won't affect that.)
        </p>

        {error && <Alert variant="danger">{error}</Alert>}

        <Form.Group className="mb-3">
          <Form.Label style={{ fontWeight: 600 }}>Your account password</Form.Label>
          <Form.Control type="password" autoComplete="current-password" value={form.current_password}
            onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
            placeholder="Confirms it's really you" />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Question</Form.Label>
          <Form.Select value={form.questionChoice}
            onChange={e => setForm(f => ({ ...f, questionChoice: e.target.value }))}>
            {SECURITY_QUESTION_PRESETS.map(q => <option key={q} value={q}>{q}</option>)}
          </Form.Select>
          {form.questionChoice === CUSTOM_QUESTION && (
            <Form.Control className="mt-2" value={form.customQuestion}
              onChange={e => setForm(f => ({ ...f, customQuestion: e.target.value }))}
              placeholder="Write your own question" />
          )}
        </Form.Group>
        <Row className="g-3">
          <Col md={6}>
            <Form.Label>Answer</Form.Label>
            <Form.Control value={form.answer}
              onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
              placeholder="Choose something only you would know" />
          </Col>
          <Col md={6}>
            <Form.Label>Confirm answer</Form.Label>
            <Form.Control value={form.confirmAnswer}
              onChange={e => setForm(f => ({ ...f, confirmAnswer: e.target.value }))} />
          </Col>
        </Row>
        <Form.Text className="text-muted">
          Avoid answers that are easy to look up (e.g. on social media). Not case-sensitive.
        </Form.Text>

        <div className="d-flex justify-content-between align-items-center mt-4">
          <button className="btn btn-link p-0" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }} onClick={logout}>
            Log out instead
          </button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save and continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}
