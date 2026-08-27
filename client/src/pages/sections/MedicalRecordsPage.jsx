import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'

const API = import.meta.env.VITE_API_URL

const empty = {
  advance_care_directive: false, directive_location: '', dnr_preference: '',
  current_medications: '', medical_conditions: '', notes: '',
}

// IDEA-32: Medical Records, split out of the old combined Medical & Care
// Wishes section along with Doctors and Donation Bank. Not vault-protected,
// same protection level (none) the old section had for these fields.
export default function MedicalRecordsPage() {
  const navigate = useNavigate()
  const [form, setForm]       = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    axios.get(`${API}/sections/medical-records`)
      .then(r => {
        const has = r.data && (
          r.data.advance_care_directive || r.data.directive_location || r.data.dnr_preference ||
          r.data.current_medications || r.data.medical_conditions || r.data.notes
        )
        if (has) {
          setHasData(true)
          setForm({
            advance_care_directive: !!r.data.advance_care_directive,
            directive_location:     r.data.directive_location     || '',
            dnr_preference:         r.data.dnr_preference         || '',
            current_medications:    r.data.current_medications    || '',
            medical_conditions:     r.data.medical_conditions     || '',
            notes:                  r.data.notes                 || '',
          })
        }
      })
      .catch(() => setError("We couldn't load your medical records. Please try again."))
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
      await axios.put(`${API}/sections/medical-records`, form)
      setSuccess('Your medical records have been saved.')
      setHasData(true)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
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
      </div>

      <SectionHero
        eyebrow="Your Wishes"
        headline="Care, on your terms"
        highlight="your terms"
        subtext="Your advance care directive, DNR preference, and medical history help ensure you receive the care you'd choose, and make things easier for your loved ones and medical team."
        secondaryAction={<ShareSectionTrigger section="medical_records" sectionLabel="Medical Records" />}
      />

      <div className="mb-4">
        {hasData && (
          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 8, padding: '10px 16px', fontSize: '0.9rem', color: 'var(--green-800)',
          }}>
            Your medical records are saved. Update them any time.
          </div>
        )}
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Form>
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
            {saving ? 'Saving...' : hasData ? 'Update my records' : 'Save my records'}
          </Button>
        </div>
        {success && <Alert variant="success" className="mt-3">{success}</Alert>}
        {error   && <Alert variant="danger"  className="mt-3">{error}</Alert>}
      </Form>

      <ShareSectionHistory section="medical_records" />

      <SectionFooterNav sectionId="medical_records" />
    </div>
  )
}
