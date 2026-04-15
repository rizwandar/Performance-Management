import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Form, Alert, Spinner, Badge, ProgressBar, Row, Col } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

// ── Song search ─────────────────────────────────────────────────────────────
function SongsSection({ songs, onAdd, onDelete }) {
  const [artistQuery, setArtistQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState('')
  const [adding, setAdding] = useState(false)
  const [searchError, setSearchError] = useState('')

  const search = async () => {
    if (!artistQuery.trim()) return
    setSearching(true)
    setResults([])
    setSelected('')
    setSearchError('')
    try {
      const res = await axios.get(`${API}/deezer/search`, { params: { artist: artistQuery } })
      if (res.data.length === 0) setSearchError('We couldn\'t find any songs for that artist. Please try a different name.')
      else setResults(res.data)
    } catch {
      setSearchError('The search didn\'t work. Please try again in a moment.')
    }
    setSearching(false)
  }

  const handleAdd = async () => {
    const track = results.find(t => t.deezer_id === selected)
    if (!track) return
    setAdding(true)
    await onAdd(track)
    setArtistQuery('')
    setResults([])
    setSelected('')
    setAdding(false)
  }

  return (
    <div>
      <p className="text-muted small mb-3">
        Search for an artist or band, then choose a song that is close to your heart.
      </p>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted small">Songs added</span>
        <Badge>{songs.length} / 20</Badge>
      </div>

      {songs.length > 0 && (
        <div className="mb-4">
          {songs.map(song => (
            <div key={song.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
              <div>
                <span className="fw-semibold">{song.title}</span>
                <span className="text-muted small ms-2">— {song.artist}</span>
                {song.album && <span className="text-muted small ms-2">({song.album})</span>}
              </div>
              <Button variant="outline-danger" size="sm" onClick={() => onDelete(song.id)}>Remove</Button>
            </div>
          ))}
        </div>
      )}

      {songs.length < 20 && (
        <>
          <div className="d-flex gap-2 mb-2">
            <Form.Control
              placeholder="Enter an artist or band name..."
              value={artistQuery}
              onChange={e => { setArtistQuery(e.target.value); setSearchError('') }}
              onKeyDown={e => e.key === 'Enter' && search()}
            />
            <Button variant="outline-primary" onClick={search} disabled={searching || !artistQuery.trim()}>
              {searching ? <Spinner size="sm" animation="border" /> : 'Search'}
            </Button>
          </div>
          {searchError && <p className="text-danger small mb-2">{searchError}</p>}
          {results.length > 0 && (
            <div className="d-flex gap-2">
              <Form.Select value={selected} onChange={e => setSelected(e.target.value)}>
                <option value="">— Choose a song —</option>
                {results.map(t => (
                  <option key={t.deezer_id} value={t.deezer_id}>{t.title} · {t.album}</option>
                ))}
              </Form.Select>
              <Button variant="success" onClick={handleAdd} disabled={!selected || adding}>
                {adding ? 'Adding...' : 'Add'}
              </Button>
            </div>
          )}
        </>
      )}
      {songs.length >= 20 && <p className="text-muted small mt-2">You've reached the limit of 20 songs. Remove one to add another.</p>}
    </div>
  )
}

// ── Bucket list ──────────────────────────────────────────────────────────────
function BucketListSection({ items, onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', planning: '' })
  const [adding, setAdding] = useState(false)

  const handleAdd = async (e) => {
    e.preventDefault()
    setAdding(true)
    await onAdd(form)
    setForm({ title: '', description: '', planning: '' })
    setShowForm(false)
    setAdding(false)
  }

  return (
    <div>
      <p className="text-muted small mb-3">
        Share the experiences and adventures you wish to have in your lifetime.
      </p>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted small">Wishes added</span>
        <Badge>{items.length} / 50</Badge>
      </div>

      {items.length > 0 && (
        <div className="mb-4">
          {items.map(item => (
            <div key={item.id} className="goal-card">
              <div className="d-flex justify-content-between align-items-start">
                <span className="fw-semibold">{item.title}</span>
                <Button variant="outline-danger" size="sm" onClick={() => onDelete(item.id)}>Remove</Button>
              </div>
              {item.description && <div className="text-muted small mt-1">{item.description}</div>}
              {item.planning && <div className="text-muted small mt-1"><strong>Steps taken:</strong> {item.planning}</div>}
            </div>
          ))}
        </div>
      )}

      {items.length < 50 && (
        !showForm ? (
          <Button variant="outline-primary" size="sm" onClick={() => setShowForm(true)}>+ Add a Wish</Button>
        ) : (
          <Form onSubmit={handleAdd} className="border rounded p-3" style={{ background: 'var(--purple-50)' }}>
            <Form.Group className="mb-2">
              <Form.Label className="small fw-semibold">My Wish *</Form.Label>
              <Form.Control
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="What would you love to do?"
                required
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label className="small fw-semibold">Tell us more</Form.Label>
              <Form.Control
                as="textarea" rows={2}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Describe this wish in a little more detail..."
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Steps I've taken</Form.Label>
              <Form.Control
                as="textarea" rows={2}
                value={form.planning}
                onChange={e => setForm({ ...form, planning: e.target.value })}
                placeholder="What have you done so far to make this happen?"
              />
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={adding}>
                {adding ? 'Saving...' : 'Save Wish'}
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Form>
        )
      )}
      {items.length >= 50 && <p className="text-muted small mt-2">You've added 50 wishes — what a wonderful life you've planned.</p>}
    </div>
  )
}

// ── Main edit page ───────────────────────────────────────────────────────────
export default function ProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [alert, setAlert] = useState(null)
  const [saving, setSaving] = useState(false)
  const alertTimer = useRef(null)

  const [basicForm, setBasicForm] = useState({
    name: '', email: '', date_of_birth: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_email: ''
  })
  const [aboutMe, setAboutMe] = useState('')
  const [legacyMessage, setLegacyMessage] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/users/me`)
      const p = res.data
      setProfile(p)
      setBasicForm({
        name: p.name || '',
        email: p.email || '',
        date_of_birth: p.date_of_birth || '',
        emergency_contact_name: p.emergency_contact_name || '',
        emergency_contact_phone: p.emergency_contact_phone || '',
        emergency_contact_email: p.emergency_contact_email || ''
      })
      setAboutMe(p.about_me || '')
      setLegacyMessage(p.legacy_message || '')
    } catch {
      showAlert('danger', 'We had trouble loading your profile. Please refresh the page.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const buildSteps = (p) => {
    if (!p) return []
    const s = [
      { key: 'basic',  title: 'Your Details' },
      { key: 'about',  title: 'Your Story' },
      { key: 'legacy', title: 'Your Message' },
    ]
    if (p.songs_enabled)       s.push({ key: 'songs',  title: 'Songs Close to Your Heart' })
    if (p.bucket_list_enabled) s.push({ key: 'bucket', title: "Life's Wishes" })
    return s
  }

  const steps = buildSteps(profile)
  const currentStep = steps[step]
  const progress = steps.length > 1 ? Math.round((step / (steps.length - 1)) * 100) : 100

  const showAlert = (type, msg) => {
    setAlert({ type, msg })
    clearTimeout(alertTimer.current)
    alertTimer.current = setTimeout(() => setAlert(null), 4000)
  }

  // Save all text fields — called on every step navigation and on Save button
  const saveAll = async (quiet = false) => {
    if (!basicForm.name) return // don't save if name not loaded yet
    setSaving(true)
    try {
      await axios.put(`${API}/users/me`, {
        ...basicForm,
        about_me: aboutMe,
        legacy_message: legacyMessage
      })
      if (!quiet) {
        showAlert('success', 'Your changes have been saved.')
        load()
      }
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'We couldn\'t save your changes. Please try again.')
    }
    setSaving(false)
  }

  // Auto-save before navigating between steps
  const goToStep = async (newStep) => {
    const textSteps = ['basic', 'about', 'legacy']
    if (textSteps.includes(currentStep?.key)) {
      await saveAll(true) // silent auto-save
    }
    setStep(newStep)
  }

  const addSong = async (track) => {
    try {
      await axios.post(`${API}/users/me/songs`, track)
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'We couldn\'t add that song. Please try again.')
    }
  }

  const deleteSong = async (songId) => {
    try {
      await axios.delete(`${API}/users/me/songs/${songId}`)
      load()
    } catch {
      showAlert('danger', 'We couldn\'t remove that song. Please try again.')
    }
  }

  const addBucketItem = async (form) => {
    try {
      await axios.post(`${API}/users/me/bucket-list`, form)
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'We couldn\'t save that wish. Please try again.')
    }
  }

  const deleteBucketItem = async (itemId) => {
    try {
      await axios.delete(`${API}/users/me/bucket-list/${itemId}`)
      load()
    } catch {
      showAlert('danger', 'We couldn\'t remove that item. Please try again.')
    }
  }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>
  if (!profile) return <Alert variant="danger">We couldn't load your profile. Please try refreshing.</Alert>

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h2 className="page-title mb-0">Edit My Story</h2>
        <Button variant="outline-secondary" size="sm" onClick={() => navigate('/profile')}>
          ← Back to Profile
        </Button>
      </div>

      {alert && (
        <Alert variant={alert.type} dismissible onClose={() => setAlert(null)}>{alert.msg}</Alert>
      )}

      {/* Step tabs */}
      <div className="mb-3">
        <ProgressBar now={progress} style={{ height: 6 }} className="mb-2" />
        <div className="d-flex gap-2 flex-wrap">
          {steps.map((s, i) => (
            <Button
              key={s.key}
              size="sm"
              variant={i === step ? 'primary' : 'outline-secondary'}
              onClick={() => goToStep(i)}
            >
              {i + 1}. {s.title}
            </Button>
          ))}
        </div>
      </div>

      {/* Step content */}
      <Card className="mb-4">
        <Card.Header>{currentStep?.title}</Card.Header>
        <Card.Body>

          {currentStep?.key === 'basic' && (
            <>
              <p className="text-muted small mb-3">Keep your details up to date so your story is always accurate.</p>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Label className="text-muted small">Full Name</Form.Label>
                  <Form.Control
                    value={basicForm.name}
                    onChange={e => setBasicForm({ ...basicForm, name: e.target.value })}
                  />
                </Col>
                <Col md={6}>
                  <Form.Label className="text-muted small">Email Address</Form.Label>
                  <Form.Control
                    type="email"
                    value={basicForm.email}
                    onChange={e => setBasicForm({ ...basicForm, email: e.target.value })}
                  />
                </Col>
                <Col md={6}>
                  <Form.Label className="text-muted small">Date of Birth</Form.Label>
                  <Form.Control
                    type="date"
                    value={basicForm.date_of_birth}
                    onChange={e => setBasicForm({ ...basicForm, date_of_birth: e.target.value })}
                  />
                </Col>
              </Row>

              <hr className="my-3" />
              <p className="text-muted small mb-3">
                Please share the details of someone we can contact on your behalf in an emergency.
              </p>
              <Row className="g-3">
                <Col md={4}>
                  <Form.Label className="text-muted small">Trusted Contact Name</Form.Label>
                  <Form.Control
                    value={basicForm.emergency_contact_name}
                    onChange={e => setBasicForm({ ...basicForm, emergency_contact_name: e.target.value })}
                    placeholder="e.g. Jane Smith"
                  />
                </Col>
                <Col md={4}>
                  <Form.Label className="text-muted small">Trusted Contact Phone</Form.Label>
                  <Form.Control
                    type="tel"
                    value={basicForm.emergency_contact_phone}
                    onChange={e => setBasicForm({ ...basicForm, emergency_contact_phone: e.target.value })}
                    placeholder="e.g. +44 7700 900000"
                  />
                </Col>
                <Col md={4}>
                  <Form.Label className="text-muted small">Trusted Contact Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={basicForm.emergency_contact_email}
                    onChange={e => setBasicForm({ ...basicForm, emergency_contact_email: e.target.value })}
                    placeholder="e.g. jane@email.com"
                  />
                </Col>
              </Row>
              <Button variant="primary" size="sm" className="mt-3" onClick={() => saveAll(false)} disabled={saving}>
                {saving ? 'Saving...' : 'Save Details'}
              </Button>
            </>
          )}

          {currentStep?.key === 'about' && (
            <>
              <p className="text-muted small mb-3">
                Share your story — who you are, what matters to you, and what you'd like others to know about you.
              </p>
              <Form.Label className="text-muted small">
                Your Story <span className="ms-1">({aboutMe.length} / 3000 characters)</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={10}
                maxLength={3000}
                value={aboutMe}
                onChange={e => setAboutMe(e.target.value)}
                placeholder="Begin your story here..."
              />
              <Button variant="primary" size="sm" className="mt-3" onClick={() => saveAll(false)} disabled={saving}>
                {saving ? 'Saving...' : 'Save My Story'}
              </Button>
            </>
          )}

          {currentStep?.key === 'legacy' && (
            <>
              <p className="text-muted small mb-3">
                This is a deeply personal space. Share the words you would like read at your funeral,
                or simply how you wish to be remembered by those you love.
              </p>
              <Form.Label className="text-muted small">
                Your Message <span className="ms-1">({legacyMessage.length} / 5000 characters)</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={12}
                maxLength={5000}
                value={legacyMessage}
                onChange={e => setLegacyMessage(e.target.value)}
                placeholder="Write your message here..."
              />
              <Button variant="primary" size="sm" className="mt-3" onClick={() => saveAll(false)} disabled={saving}>
                {saving ? 'Saving...' : 'Save My Message'}
              </Button>
            </>
          )}

          {currentStep?.key === 'songs' && (
            <SongsSection
              songs={profile.songs || []}
              onAdd={addSong}
              onDelete={deleteSong}
            />
          )}

          {currentStep?.key === 'bucket' && (
            <BucketListSection
              items={profile.bucket_list || []}
              onAdd={addBucketItem}
              onDelete={deleteBucketItem}
            />
          )}

        </Card.Body>
      </Card>

      {/* Prev / Next / Done */}
      <div className="d-flex justify-content-between mb-5">
        <Button
          variant="outline-secondary"
          disabled={step === 0}
          onClick={() => goToStep(step - 1)}
        >
          ← Previous
        </Button>
        {step < steps.length - 1 ? (
          <Button variant="primary" onClick={() => goToStep(step + 1)}>
            Next →
          </Button>
        ) : (
          <Button variant="success" onClick={async () => { await saveAll(true); navigate('/profile') }}>
            View My Profile ✓
          </Button>
        )}
      </div>
    </>
  )
}
