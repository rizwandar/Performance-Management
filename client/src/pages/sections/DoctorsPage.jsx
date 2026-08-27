import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import SectionFooterNav from '../../components/SectionFooterNav'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'

const API = import.meta.env.VITE_API_URL

const empty = { gp_name: '', gp_phone: '', hospital_preference: '' }

// IDEA-32: Doctors, split out of the old combined Medical & Care Wishes
// section along with Medical Records and Donation Bank. Not vault-protected,
// same protection level (none) the old section had for these fields.
export default function DoctorsPage() {
  const navigate = useNavigate()
  const [form, setForm]       = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    axios.get(`${API}/sections/doctors`)
      .then(r => {
        if (r.data && (r.data.gp_name || r.data.gp_phone || r.data.hospital_preference)) {
          setHasData(true)
          setForm({
            gp_name:             r.data.gp_name             || '',
            gp_phone:            r.data.gp_phone            || '',
            hospital_preference: r.data.hospital_preference || '',
          })
        }
      })
      .catch(() => setError("We couldn't load your doctors. Please try again."))
      .finally(() => setLoading(false))
  }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      await axios.put(`${API}/sections/doctors`, form)
      setSuccess('Your doctors have been saved.')
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
        headline="Your care team, easy to find"
        highlight="easy to find"
        subtext="Your GP, specialists, and preferred hospital, so your loved ones and any medical team can reach the right people quickly."
        secondaryAction={<ShareSectionTrigger section="doctors" sectionLabel="Doctors" />}
      />

      <div className="mb-4">
        {hasData && (
          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 8, padding: '10px 16px', fontSize: '0.9rem', color: 'var(--green-800)',
          }}>
            Your doctors are saved. Update them any time.
          </div>
        )}
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Form>
        <div style={{ background: 'var(--parchment)', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
          <h6 style={{ color: 'var(--green-900)', marginBottom: 16 }}>Medical Contacts</h6>

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

        <div className="d-flex align-items-center gap-3 flex-wrap">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : hasData ? 'Update my doctors' : 'Save my doctors'}
          </Button>
        </div>
        {success && <Alert variant="success" className="mt-3">{success}</Alert>}
        {error   && <Alert variant="danger"  className="mt-3">{error}</Alert>}
      </Form>

      <ShareSectionHistory section="doctors" />

      <SectionFooterNav sectionId="doctors" />
    </div>
  )
}
