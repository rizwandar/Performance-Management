/**
 * Shared editor for vault-specific security recovery questions (up to 5, at
 * least 3 mandatory). Used both during first-time vault setup and later from
 * Profile > Vault Settings. Pure controlled UI - callers own the `questions`
 * state and do their own API call with the validated/normalized result.
 */
import { Form, Row, Col } from 'react-bootstrap'

export const VAULT_RECOVERY_CUSTOM = 'Other (write my own)'
export const VAULT_RECOVERY_PRESETS = [
  'What is the name of the street you grew up on?',
  'What was your childhood nickname?',
  'What is the title of the first book you remember reading?',
  'What was the make of your first bicycle or car?',
  'Who was your childhood best friend?',
  VAULT_RECOVERY_CUSTOM,
]

export function emptyRecoveryQuestion(isMandatory) {
  return { questionChoice: VAULT_RECOVERY_PRESETS[0], customQuestion: '', answer: '', confirmAnswer: '', is_mandatory: isMandatory }
}

export function defaultRecoveryQuestions() {
  return [emptyRecoveryQuestion(true), emptyRecoveryQuestion(true), emptyRecoveryQuestion(true)]
}

export function validateRecoveryQuestions(questions) {
  if (questions.length < 3) return 'Please set up at least 3 questions.'
  for (const q of questions) {
    const text = q.questionChoice === VAULT_RECOVERY_CUSTOM ? q.customQuestion.trim() : q.questionChoice
    if (!text) return 'Please choose or write every question.'
    if (!q.answer.trim()) return 'Please answer every question.'
    if (q.answer !== q.confirmAnswer) return 'Answers do not match for one or more questions.'
  }
  return null
}

export function toApiQuestions(questions) {
  return questions.map(q => ({
    text: q.questionChoice === VAULT_RECOVERY_CUSTOM ? q.customQuestion.trim() : q.questionChoice,
    answer: q.answer,
    is_mandatory: q.is_mandatory,
  }))
}

export default function VaultRecoveryQuestionsForm({ questions, setQuestions }) {
  const updateAt = (i, patch) => setQuestions(qs => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  const addQuestion = () => setQuestions(qs => (qs.length < 5 ? [...qs, emptyRecoveryQuestion(false)] : qs))
  const removeQuestion = (i) => setQuestions(qs => qs.filter((_, idx) => idx !== i))

  return (
    <div>
      {questions.map((q, i) => (
        <div key={i} style={{
          marginBottom: 16, paddingBottom: 16,
          borderBottom: i < questions.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <Form.Label style={{ fontWeight: 600, marginBottom: 0 }}>
              Question {i + 1}{' '}
              <span className="text-muted small">{q.is_mandatory ? '(required)' : '(optional)'}</span>
            </Form.Label>
            {!q.is_mandatory && (
              <button type="button" className="btn btn-link btn-sm p-0 text-danger" onClick={() => removeQuestion(i)}>
                Remove
              </button>
            )}
          </div>
          <Form.Select className="mb-2" value={q.questionChoice}
            onChange={e => updateAt(i, { questionChoice: e.target.value })}>
            {VAULT_RECOVERY_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
          </Form.Select>
          {q.questionChoice === VAULT_RECOVERY_CUSTOM && (
            <Form.Control className="mb-2" value={q.customQuestion}
              onChange={e => updateAt(i, { customQuestion: e.target.value })}
              placeholder="Write your own question" />
          )}
          <Row className="g-2">
            <Col md={6}>
              <Form.Control type="text" value={q.answer} autoComplete="off"
                onChange={e => updateAt(i, { answer: e.target.value })} placeholder="Answer" />
            </Col>
            <Col md={6}>
              <Form.Control type="text" value={q.confirmAnswer} autoComplete="off"
                onChange={e => updateAt(i, { confirmAnswer: e.target.value })} placeholder="Confirm answer" />
            </Col>
          </Row>
        </div>
      ))}
      {questions.length < 5 && (
        <button type="button" className="btn btn-link btn-sm p-0" onClick={addQuestion}>
          + Add another question (optional)
        </button>
      )}
    </div>
  )
}
