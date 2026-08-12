/**
 * Shared "answer security questions to recover a forgotten vault password"
 * form. Used both from VaultGate's locked-out screen and from Profile's
 * Change Vault Password entry point (SEC-13) - same flow and validation,
 * different surrounding chrome/copy/cancel behavior, owned by the caller.
 */
import { useState } from 'react'
import { Button, Form, Alert } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function VaultRecoverForm({ questions, onRecovered, onCancel }) {
  const [answers, setAnswers]           = useState({})
  const [newPw, setNewPw]               = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [recovering, setRecovering]     = useState(false)
  const [error, setError]               = useState('')

  const handleRecover = async () => {
    setError('')
    const answered = Object.values(answers).filter(a => a && a.trim()).length
    if (answered < 3) return setError('Please answer at least 3 questions.')
    if (!newPw || newPw.length < 8) return setError('New vault password must be at least 8 characters.')
    if (newPw !== newPwConfirm) return setError('New passwords do not match.')
    setRecovering(true)
    try {
      await axios.post(`${API}/sections/digital-life/recovery/recover`, {
        answers, new_password: newPw,
      })
      onRecovered(newPw)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't verify at least 3 correct answers. Please try again.")
    }
    setRecovering(false)
  }

  return (
    <>
      {error && <Alert variant="danger">{error}</Alert>}

      {questions.map(q => (
        <Form.Group className="mb-3" key={q.question_index}>
          <Form.Label>{q.question_text}</Form.Label>
          <Form.Control
            type="text"
            autoComplete="off"
            value={answers[q.question_index] || ''}
            onChange={e => setAnswers(a => ({ ...a, [q.question_index]: e.target.value }))}
            placeholder="Leave blank if you don't remember"
          />
        </Form.Group>
      ))}

      <hr />

      <Form.Group className="mb-3">
        <Form.Label style={{ fontWeight: 600 }}>New vault password</Form.Label>
        <Form.Control type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
          placeholder="At least 8 characters" />
      </Form.Group>
      <Form.Group className="mb-4">
        <Form.Label style={{ fontWeight: 600 }}>Confirm new password</Form.Label>
        <Form.Control type="password" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)}
          placeholder="Type it again" />
      </Form.Group>

      <Button variant="primary" className="w-100 mb-3" onClick={handleRecover} disabled={recovering}>
        {recovering ? 'Recovering...' : 'Recover my vault'}
      </Button>
      {onCancel && (
        <button className="btn btn-link w-100 p-0"
          style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}
          onClick={onCancel}>
          Go back
        </button>
      )}
    </>
  )
}
