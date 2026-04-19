import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const empty = {
  organ_donation: '', organ_donation_details: '', advance_care_directive: false,
  directive_location: '', dnr_preference: '', gp_name: '', gp_phone: '',
  hospital_preference: '', current_medications: '', medical_conditions: '', notes: '',
}

export default function MedicalWishesPage() {
  const navigate = useNavigate()
  const [form, setForm]       = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    axios.get(`${API}/sections/medical-wishes`)
      .then(r => {
        if (r.data && r.data.organ_donation) {
          setHasData(true)
          setForm({
            organ_donation:          r.data.organ_donation           || '',
            organ_donation_details:  r.data.organ_donation_details   || '',
            advance_care_directive:  !!r.data.advance_care_directive,
            directive_location:      r.data.directive_location        || '',
            dnr_preference:          r.data.dnr_preference            || '',
            gp_name:                 r.data.gp_name                   || '',
            gp_phone:                r.data.gp_phone                  || '',
            hospital_preference:     r.data.hospital_preference       || '',
            current_medications:     r.data.current_medications       || '',
            medical_conditions:      r.data.medical_conditions        || '',
            notes:                   r.data.notes                     || '',
          })
        }
      })
      .catch(() => setError("We couldn't load your medical wishes. Please try again."))
      .finally(() => setLoading(false))
  }, [])

  const set = field => e => setForm(f => ({
    ...f,
    [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }))

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      await axios.put(`${API}/sections/medical-wishes`, form)
      setSuccess('Your medical wishes have been saved.')
      setHasData(true)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save your wishes. Please try again.")
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
        <h3 style={{ color: 'var(--green-900)' }}>🏥 Medical & Care Wishes</h3>
        <p className="text-muted">
          Your medical preferences and details help ensure you receive the care you'd choose,
          and make things easier for your loved ones and medical team.
        </p>
        {hasData && (
          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 8, padding: '10px 16px', fontSize: '0.9rem', color: 'var(--green-800)',
          }}>
            Your wishes are saved. Update them any time.
          </div>
        )}
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Form>
        {/* Organ donation */}
        <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 16 }}>Organ & Tissue Donation</h6>

          <Form.Group className="mb-3">
            <Form.Label style={{ fontWeight: 600 }}>Organ donation preference</Form.Label>
            <div className="d-flex gap-3 flex-wrap">
              {[
                { value: 'yes',    label: 'Yes, donate all' },
                { value: 'some',   label: 'Some organs only' },
                { value: 'no',     label: 'No' },
                { value: 'unsure', label: 'Not decided' },
              ].map(opt => (
                <Form.Check key={opt.value} type="radio" id={`od-${opt.value}`}
                  label={opt.label} name="organ_donation"
                  value={opt.value}
                  checked={form.organ_donation === opt.value}
                  onChange={set('organ_donation')}
                />
              ))}
            </div>
          </Form.Group>

          {(form.organ_donation === 'yes' || form.organ_donation === 'some') && (
            <Form.Group>
              <Form.Label>Details</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.organ_donation_details}
                onChange={set('organ_donation_details')}
                placeholder={form.organ_donation === 'some'
                  ? "Which organs or tissues you consent to donate..."
                  : "Any specific instructions or notes..."} />
            </Form.Group>
          )}
        </div>

        {/* Advance care directive */}
        <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 16 }}>Advance Care Directive</h6>

          <Form.Check type="checkbox" id="acd" className="mb-3"
            label="I have a completed Advance Care Directive"
            checked={form.advance_care_directive}
            onChange={set('advance_care_directive')}
          />
          {form.advance_care_directive && (
            <Form.Group className="mb-3">
              <Form.Label>Where is it kept?</Form.Label>
              <Form.Control value={form.directive_location} onChange={set('directive_location')}
                placeholder="e.g. With my GP, in my filing cabinet at home" />
            </Form.Group>
          )}

          <Form.Group>
            <Form.Label style={{ fontWeight: 600 }}>Do Not Resuscitate (DNR) preference</Form.Label>
            <p className="text-muted small mb-2">
              This is a guide only. A formal DNR order must be completed with your doctor.
            </p>
            <div className="d-flex gap-3 flex-wrap">
              {[
                { value: 'yes',     label: 'Yes, do not resuscitate' },
                { value: 'no',      label: 'No, attempt resuscitation' },
                { value: 'discuss', label: 'Discuss with family and doctors' },
              ].map(opt => (
                <Form.Check key={opt.value} type="radio" id={`dnr-${opt.value}`}
                  label={opt.label} name="dnr_preference"
                  value={opt.value}
                  checked={form.dnr_preference === opt.value}
                  onChange={set('dnr_preference')}
                />
              ))}
            </div>
          </Form.Group>
        </div>

        {/* GP & hospital */}
        <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 16 }}>Medical Contacts & Preferences</h6>

          <Row className="g-3 mb-3">
            <Col md={6}>
              <Form.Label>GP / Doctor name</Form.Label>
              <Form.Control value={form.gp_name} onChange={set('gp_name')}
                placeholder="e.g. Dr Jane Smith" />
            </Col>
            <Col md={6}>
              <Form.Label>GP phone</Form.Label>
              <Form.Control value={form.gp_phone} onChange={set('gp_phone')}
                placeholder="e.g. (03) 9123 4567" />
            </Col>
          </Row>

          <Form.Group>
            <Form.Label>Preferred hospital</Form.Label>
            <Form.Control value={form.hospital_preference} onChange={set('hospital_preference')}
              placeholder="e.g. Royal Melbourne Hospital" />
          </Form.Group>
        </div>

        {/* Medical information */}
        <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 16 }}>Medical Information</h6>
          <p className="text-muted small mb-3">
            This information helps carers and loved ones act quickly in an emergency.
          </p>

          <Form.Group className="mb-3">
            <Form.Label>Current medications</Form.Label>
            <Form.Control as="textarea" rows={3} value={form.current_medications}
              onChange={set('current_medications')}
              placeholder="List any regular medications, dosages, and prescribing doctors..." />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Medical conditions or allergies</Form.Label>
            <Form.Control as="textarea" rows={3} value={form.medical_conditions}
              onChange={set('medical_conditions')}
              placeholder="Significant medical history, conditions, or allergies to be aware of..." />
          </Form.Group>

          <Form.Group>
            <Form.Label>Additional notes</Form.Label>
            <Form.Control as="textarea" rows={2} value={form.notes} onChange={set('notes')}
              placeholder="Anything else your loved ones or carers should know..." />
          </Form.Group>
        </div>

        <div className="d-flex align-items-center gap-3 flex-wrap">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : hasData ? 'Update my wishes' : 'Save my wishes'}
          </Button>
          <button className="btn btn-link p-0"
            style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
            onClick={() => navigate('/profile')}>
            ← Back to my plans
          </button>
        </div>
        {success && <Alert variant="success" className="mt-3">{success}</Alert>}
        {error   && <Alert variant="danger"  className="mt-3">{error}</Alert>}
      </Form>
    </div>
  )
}
