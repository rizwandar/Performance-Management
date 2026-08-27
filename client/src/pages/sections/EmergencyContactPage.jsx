import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'
import DictateButton from '../../components/DictateButton'
import DictationDisclosure from '../../components/DictationDisclosure'
import { useDictation } from '../../hooks/useDictation'

const API = import.meta.env.VITE_API_URL

export default function EmergencyContactPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError]     = useState('')
  const [form, setForm] = useState({
    emergency_contact_name:         '',
    emergency_contact_relationship: '',
    emergency_contact_phone:        '',
    emergency_contact_email:        '',
    emergency_contact_notes:        '',
  })

  useEffect(() => {
    axios.get(`${API}/users/me`)
      .then(r => setForm({
        emergency_contact_name:         r.data.emergency_contact_name         || '',
        emergency_contact_relationship: r.data.emergency_contact_relationship || '',
        emergency_contact_phone:        r.data.emergency_contact_phone        || '',
        emergency_contact_email:        r.data.emergency_contact_email        || '',
        emergency_contact_notes:        r.data.emergency_contact_notes        || '',
      }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const setField = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const notesDictation = useDictation({ getValue: () => form.emergency_contact_notes, setValue: v => setForm(f => ({ ...f, emergency_contact_notes: v })) })

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await axios.put(`${API}/users/me`, form)
      setSuccess('Emergency contact saved.')
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError("We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
      </div>

      <SectionHero
        eyebrow="Your People"
        headline="The person to call on"
        highlight="call on"
        subtext="The first person to call if you are in an emergency and unable to speak for yourself. This is typically a partner, close family member, or trusted friend who is always reachable."
      />

      <div style={{ background: 'var(--parchment)', borderRadius: 'var(--card-radius-sm, 12px)', padding: '24px', border: '1px solid var(--border)' }}>
        <p className="text-muted small mb-4" style={{ fontStyle: 'italic' }}>
          Unlike trusted contacts, your emergency contact does not receive access to your plans. They are simply someone to call in a crisis.
        </p>

        {success && <Alert variant="success" className="py-2">{success}</Alert>}
        {error   && <Alert variant="danger"  className="py-2">{error}</Alert>}

        {loading ? (
          <Spinner animation="border" size="sm" style={{ color: 'var(--green-800)' }} />
        ) : (
          <>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Name</Form.Label>
                <Form.Control value={form.emergency_contact_name} onChange={setField('emergency_contact_name')}
                  placeholder="Full name" />
              </Col>
              <Col md={6}>
                <Form.Label>Relationship</Form.Label>
                <Form.Control value={form.emergency_contact_relationship} onChange={setField('emergency_contact_relationship')}
                  placeholder="e.g. Spouse, Sister, Friend" />
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Phone</Form.Label>
                <Form.Control value={form.emergency_contact_phone} onChange={setField('emergency_contact_phone')}
                  placeholder="e.g. 0400 123 456" />
              </Col>
              <Col md={6}>
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={form.emergency_contact_email} onChange={setField('emergency_contact_email')}
                  placeholder="email@example.com" />
              </Col>
            </Row>
            <Form.Group className="mb-4">
              <div className="d-flex justify-content-between align-items-center">
                <Form.Label className="mb-0">Notes</Form.Label>
                <DictateButton dictation={notesDictation} />
              </div>
              <Form.Control as="textarea" rows={3} value={form.emergency_contact_notes} onChange={setField('emergency_contact_notes')}
                placeholder="Anything a first responder or loved one should know, e.g. best times to reach them, a backup number." />
              {notesDictation.supported && <DictationDisclosure />}
            </Form.Group>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save emergency contact'}
            </Button>
          </>
        )}
      </div>

      <SectionFooterNav sectionId="emergency_contact" />
    </div>
  )
}
