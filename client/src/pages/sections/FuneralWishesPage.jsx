import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const empty = {
  burial_preference: '', ceremony_type: '', ceremony_location: '', funeral_home: '',
  pre_paid_plan: false, pre_paid_details: '', music_preferences: '', readings: '',
  flowers_preference: '', donation_charity: '', special_requests: '', notes: '',
}

// Section card with a clear heading bar
function SectionCard({ title, children }) {
  return (
    <div style={{ marginBottom: 24, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{
        background: 'var(--green-800)', color: '#fff',
        padding: '10px 20px', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.02em',
      }}>
        {title}
      </div>
      <div style={{ background: 'var(--parchment)', padding: '20px 24px' }}>
        {children}
      </div>
    </div>
  )
}

// Field with label + optional hint
function FieldRow({ label, hint, children }) {
  return (
    <Form.Group className="mb-4">
      <Form.Label style={{ fontWeight: 600, color: 'var(--green-900)', fontSize: '0.9rem' }}>{label}</Form.Label>
      {hint && <p className="text-muted small mb-2" style={{ marginTop: -2 }}>{hint}</p>}
      {children}
    </Form.Group>
  )
}

export default function FuneralWishesPage() {
  const navigate = useNavigate()
  const [form, setForm]       = useState(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [hasData, setHasData] = useState(false)

  // Photos
  const [mainPhoto, setMainPhoto]         = useState(null)   // { id, signed_url, original_name }
  const [galleryPhotos, setGalleryPhotos] = useState([])     // [{ id, signed_url, ... }]
  const [uploadingMain, setUploadingMain] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [photoError, setPhotoError]       = useState('')
  const mainFileRef    = useRef(null)
  const galleryFileRef = useRef(null)

  const loadPhotos = () => {
    axios.get(`${API}/documents/photos/funeral_wishes`)
      .then(r => {
        setMainPhoto(r.data.find(p => p.photo_role === 'funeral_main') || null)
        setGalleryPhotos(r.data.filter(p => p.photo_role === 'funeral_gallery'))
      })
      .catch(() => {}) // non-fatal — photos are supplementary
  }

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/sections/funeral-wishes`),
    ]).then(([r]) => {
        if (r.data && r.data.burial_preference) {
          setHasData(true)
          setForm({
            burial_preference:  r.data.burial_preference  || '',
            ceremony_type:      r.data.ceremony_type      || '',
            ceremony_location:  r.data.ceremony_location  || '',
            funeral_home:       r.data.funeral_home        || '',
            pre_paid_plan:      !!r.data.pre_paid_plan,
            pre_paid_details:   r.data.pre_paid_details   || '',
            music_preferences:  r.data.music_preferences  || '',
            readings:           r.data.readings            || '',
            flowers_preference: r.data.flowers_preference || '',
            donation_charity:   r.data.donation_charity   || '',
            special_requests:   r.data.special_requests   || '',
            notes:              r.data.notes               || '',
          })
        }
      })
      .catch(() => setError("We couldn't load your wishes. Please try again."))
      .finally(() => setLoading(false))
    loadPhotos()
  }, [])

  const uploadPhoto = async (file, photoRole) => {
    if (!file) return
    const fd = new FormData()
    fd.append('photo', file)
    fd.append('section_id', 'funeral_wishes')
    fd.append('photo_role', photoRole)
    // Do NOT set Content-Type manually — axios sets it automatically with the
    // correct multipart boundary when given a FormData object.
    const r = await axios.post(`${API}/documents/photos/upload`, fd)
    return r.data
  }

  const handleMainPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingMain(true)
    setPhotoError('')
    try {
      const result = await uploadPhoto(file, 'funeral_main')
      setMainPhoto({ id: result.id, signed_url: result.signed_url, original_name: result.original_name })
    } catch (err) {
      setPhotoError(err.response?.data?.error || "Couldn't upload photo. Please try again.")
    }
    setUploadingMain(false)
    e.target.value = ''
  }

  const handleGalleryPhotoAdd = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (galleryPhotos.length + files.length > 20) {
      setPhotoError('You can add up to 20 gallery photos.')
      e.target.value = ''
      return
    }
    setUploadingGallery(true)
    setPhotoError('')
    try {
      const uploaded = []
      for (const file of files) {
        const result = await uploadPhoto(file, 'funeral_gallery')
        uploaded.push({ id: result.id, signed_url: result.signed_url, original_name: result.original_name, photo_role: 'funeral_gallery' })
      }
      setGalleryPhotos(prev => [...prev, ...uploaded])
    } catch (err) {
      setPhotoError(err.response?.data?.error || "Couldn't upload one or more photos. Please try again.")
    }
    setUploadingGallery(false)
    e.target.value = ''
  }

  const handleDeletePhoto = async (id, role) => {
    try {
      await axios.delete(`${API}/documents/${id}`)
      if (role === 'funeral_main') setMainPhoto(null)
      else setGalleryPhotos(prev => prev.filter(p => p.id !== id))
    } catch {
      setPhotoError("Couldn't remove photo. Please try again.")
    }
  }

  const set = (field) => (e) => setForm(f => ({
    ...f,
    [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }))

  const handleSave = async () => {
    if (!form.burial_preference) return setError('Please select a burial or cremation preference before saving.')
    setError('')
    setSaving(true)
    try {
      await axios.put(`${API}/sections/funeral-wishes`, form)
      setSuccess('Your wishes have been saved.')
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
        <h3 style={{ color: 'var(--green-900)' }}>🕊️ Funeral & End-of-Life Wishes</h3>
        <p className="text-muted">
          Recording your wishes here is one of the greatest gifts you can give the people you love.
          It removes the guesswork during an already difficult time.
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
        {/* Burial & Ceremony */}
        <SectionCard title="Burial & Ceremony">
          <FieldRow label="Burial or cremation preference">
            <div className="d-flex gap-3 flex-wrap">
              {['Burial', 'Cremation', 'Other'].map(opt => (
                <Form.Check key={opt} type="radio" id={`burial-${opt}`}
                  label={opt} name="burial_preference"
                  value={opt.toLowerCase()}
                  checked={form.burial_preference === opt.toLowerCase()}
                  onChange={set('burial_preference')}
                />
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Type of ceremony"
            hint="What kind of service would feel right to you?">
            <div className="d-flex gap-3 flex-wrap">
              {['Religious', 'Secular', 'No ceremony', 'Other'].map(opt => (
                <Form.Check key={opt} type="radio" id={`cer-${opt}`}
                  label={opt} name="ceremony_type"
                  value={opt.toLowerCase().replace(' ', '_')}
                  checked={form.ceremony_type === opt.toLowerCase().replace(' ', '_')}
                  onChange={set('ceremony_type')}
                />
              ))}
            </div>
          </FieldRow>

          <Row className="g-3">
            <Col md={6}>
              <Form.Label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--green-900)' }}>Ceremony location</Form.Label>
              <Form.Control value={form.ceremony_location} onChange={set('ceremony_location')}
                placeholder="e.g. St Mary's Church, local crematorium" />
            </Col>
            <Col md={6}>
              <Form.Label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--green-900)' }}>Preferred funeral home</Form.Label>
              <Form.Control value={form.funeral_home} onChange={set('funeral_home')}
                placeholder="e.g. Smith & Sons Funeral Directors" />
            </Col>
          </Row>
        </SectionCard>

        {/* Pre-paid Plan */}
        <SectionCard title="Pre-paid Plan">
          <Form.Check type="checkbox" id="pre_paid_plan" className="mb-3"
            label="I have a pre-paid funeral plan"
            checked={form.pre_paid_plan}
            onChange={set('pre_paid_plan')}
          />
          {form.pre_paid_plan && (
            <FieldRow label="Pre-paid plan details">
              <Form.Control as="textarea" rows={2} value={form.pre_paid_details} onChange={set('pre_paid_details')}
                placeholder="Provider, reference number, where the documents are kept..." />
            </FieldRow>
          )}
        </SectionCard>

        {/* Personal Wishes */}
        <SectionCard title="Personal Wishes">
          <FieldRow label="Music preferences">
            <Form.Control as="textarea" rows={2} value={form.music_preferences} onChange={set('music_preferences')}
              placeholder="Songs or music you'd like played at your service..." />
          </FieldRow>

          <FieldRow label="Readings or poems">
            <Form.Control as="textarea" rows={2} value={form.readings} onChange={set('readings')}
              placeholder="Any readings, poems, or passages that are meaningful to you..." />
          </FieldRow>

          <FieldRow label="Flowers or donations">
            <div className="d-flex gap-3 flex-wrap mb-2">
              {[
                { value: 'flowers',   label: 'Flowers welcome' },
                { value: 'donations', label: 'Donations preferred' },
                { value: 'both',      label: 'Both' },
                { value: 'none',      label: 'No preference' },
              ].map(opt => (
                <Form.Check key={opt.value} type="radio" id={`flowers-${opt.value}`}
                  label={opt.label} name="flowers_preference"
                  value={opt.value}
                  checked={form.flowers_preference === opt.value}
                  onChange={set('flowers_preference')}
                />
              ))}
            </div>
            {(form.flowers_preference === 'donations' || form.flowers_preference === 'both') && (
              <Form.Control value={form.donation_charity} onChange={set('donation_charity')}
                placeholder="Preferred charity for donations" />
            )}
          </FieldRow>

          <FieldRow label="Special requests">
            <Form.Control as="textarea" rows={2} value={form.special_requests} onChange={set('special_requests')}
              placeholder="Anything else you'd like your loved ones to know or arrange..." />
          </FieldRow>

          <FieldRow label="Additional notes">
            <Form.Control as="textarea" rows={2} value={form.notes} onChange={set('notes')}
              placeholder="Any other thoughts or wishes..." />
          </FieldRow>
        </SectionCard>

        <div className="d-flex align-items-center gap-3 flex-wrap mb-3">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : hasData ? 'Update my wishes' : 'Save my wishes'}
          </Button>
          <button className="btn btn-link p-0"
            style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
            onClick={() => navigate('/profile')}>
            ← Back to my plans
          </button>
        </div>
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}
        {error   && <Alert variant="danger"  className="mb-4">{error}</Alert>}
      </Form>

      {/* ── Photographs ────────────────────────────────────────────────────── */}
      <SectionCard title="Photographs">
        {photoError && <Alert variant="danger" className="mb-3">{photoError}</Alert>}

        {/* Main portrait */}
        <div className="mb-4">
          <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4 }}>Portrait photograph</p>
          <p className="text-muted small mb-3">
            Choose the photograph you'd like to be remembered by. This would typically be displayed
            at the service and used in any printed orders of service.
          </p>

          {mainPhoto ? (
            <div className="d-flex align-items-start gap-3 flex-wrap">
              <img
                src={mainPhoto.signed_url}
                alt="Main portrait"
                style={{
                  width: 160, height: 160, objectFit: 'cover',
                  borderRadius: 10, border: '2px solid var(--green-100)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                }}
              />
              <div>
                <p className="small mb-1" style={{ color: 'var(--green-900)', fontWeight: 600 }}>
                  {mainPhoto.original_name}
                </p>
                <p className="text-muted small mb-3">Current portrait photo</p>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-primary"
                    onClick={() => mainFileRef.current?.click()}
                    disabled={uploadingMain}>
                    {uploadingMain ? 'Uploading…' : 'Replace photo'}
                  </button>
                  <button className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDeletePhoto(mainPhoto.id, 'funeral_main')}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-outline-secondary"
              onClick={() => mainFileRef.current?.click()}
              disabled={uploadingMain}
              style={{ borderStyle: 'dashed' }}>
              {uploadingMain
                ? <><Spinner size="sm" animation="border" className="me-2" />Uploading…</>
                : '+ Upload portrait photo'}
            </button>
          )}
          <input
            ref={mainFileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            style={{ display: 'none' }}
            onChange={handleMainPhotoChange}
          />
        </div>

        <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

        {/* Gallery */}
        <div>
          <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4 }}>Photographs for the service</p>
          <p className="text-muted small mb-3">
            Add photographs you'd like displayed or shown at your funeral: moments, people, and places
            that define who you were. Up to 20 photos.
          </p>

          {galleryPhotos.length > 0 && (
            <div className="d-flex flex-wrap gap-3 mb-3">
              {galleryPhotos.map(photo => (
                <div key={photo.id} style={{ position: 'relative' }}>
                  <img
                    src={photo.signed_url}
                    alt={photo.original_name}
                    style={{
                      width: 110, height: 110, objectFit: 'cover',
                      borderRadius: 8, border: '1px solid var(--border)',
                    }}
                  />
                  <button
                    onClick={() => handleDeletePhoto(photo.id, 'funeral_gallery')}
                    style={{
                      position: 'absolute', top: -8, right: -8,
                      width: 22, height: 22, borderRadius: '50%',
                      border: 'none', background: '#DC2626', color: '#fff',
                      fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Remove photo">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {galleryPhotos.length < 20 && (
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => galleryFileRef.current?.click()}
              disabled={uploadingGallery}
              style={{ borderStyle: 'dashed' }}>
              {uploadingGallery
                ? <><Spinner size="sm" animation="border" className="me-1" />Uploading…</>
                : `+ Add photos (${galleryPhotos.length}/20)`}
            </button>
          )}
          <input
            ref={galleryFileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={handleGalleryPhotoAdd}
          />
        </div>
      </SectionCard>
    </div>
  )
}
