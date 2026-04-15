import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Form, Alert, Spinner, Badge, ProgressBar, Row, Col } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

// ── Song search section ─────────────────────────────────────────────────────
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
      if (res.data.length === 0) setSearchError('No songs found for that artist or band.')
      else setResults(res.data)
    } catch {
      setSearchError('Search failed. Please try again.')
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
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted small">Your favourite songs to play on your birthday.</span>
        <Badge bg="secondary">{songs.length} / 20</Badge>
      </div>

      {songs.length === 0 ? (
        <p className="text-muted small">No songs added yet.</p>
      ) : (
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
              placeholder="Type an artist or band name..."
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
                <option value="">— Select a song —</option>
                {results.map(t => (
                  <option key={t.deezer_id} value={t.deezer_id}>{t.title} ({t.album})</option>
                ))}
              </Form.Select>
              <Button variant="success" onClick={handleAdd} disabled={!selected || adding}>
                {adding ? 'Adding...' : 'Add'}
              </Button>
            </div>
          )}
        </>
      )}
      {songs.length >= 20 && <p className="text-muted small mt-2">Maximum of 20 songs reached.</p>}
    </div>
  )
}

// ── Bucket list section ─────────────────────────────────────────────────────
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
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted small">Things you want to do in your life.</span>
        <Badge bg="secondary">{items.length} / 50</Badge>
      </div>

      {items.length === 0 ? (
        <p className="text-muted small">No items added yet.</p>
      ) : (
        <div className="mb-4">
          {items.map(item => (
            <div key={item.id} className="goal-card mb-3">
              <div className="d-flex justify-content-between align-items-start">
                <span className="fw-semibold">{item.title}</span>
                <Button variant="outline-danger" size="sm" onClick={() => onDelete(item.id)}>Remove</Button>
              </div>
              {item.description && <div className="text-muted small mt-1">{item.description}</div>}
              {item.planning && (
                <div className="text-muted small mt-1">
                  <strong>Planning:</strong> {item.planning}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length < 50 && (
        !showForm ? (
          <Button variant="outline-primary" size="sm" onClick={() => setShowForm(true)}>+ Add Item</Button>
        ) : (
          <Form onSubmit={handleAdd} className="border rounded p-3 bg-light">
            <Form.Group className="mb-2">
              <Form.Label className="small fw-semibold">Bucket List Item *</Form.Label>
              <Form.Control
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="What do you want to do?"
                required
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label className="small fw-semibold">Description</Form.Label>
              <Form.Control
                as="textarea" rows={2}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Tell us more..."
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Planning</Form.Label>
              <Form.Control
                as="textarea" rows={2}
                value={form.planning}
                onChange={e => setForm({ ...form, planning: e.target.value })}
                placeholder="What steps have you taken to make this happen?"
              />
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={adding}>
                {adding ? 'Adding...' : 'Add Item'}
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Form>
        )
      )}
      {items.length >= 50 && <p className="text-muted small mt-2">Maximum of 50 items reached.</p>}
    </div>
  )
}

// ── Main profile page ───────────────────────────────────────────────────────
export default function ProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [alert, setAlert] = useState(null)
  const [saving, setSaving] = useState(false)

  const [basicForm, setBasicForm] = useState({
    name: '', email: '', date_of_birth: '',
    emergency_contact_name: '', emergency_contact_phone: ''
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
        name: p.name,
        email: p.email,
        date_of_birth: p.date_of_birth || '',
        emergency_contact_name: p.emergency_contact_name || '',
        emergency_contact_phone: p.emergency_contact_phone || ''
      })
      setAboutMe(p.about_me || '')
      setLegacyMessage(p.legacy_message || '')
    } catch {
      setAlert({ type: 'danger', msg: 'Failed to load profile' })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const buildSteps = (p) => {
    if (!p) return []
    const s = [
      { key: 'basic', title: 'Basic Info' },
      { key: 'about', title: 'About Me' },
      { key: 'legacy', title: 'My Message' },
    ]
    if (p.songs_enabled) s.push({ key: 'songs', title: 'Favourite Songs' })
    if (p.bucket_list_enabled) s.push({ key: 'bucket', title: 'Bucket List' })
    return s
  }

  const steps = buildSteps(profile)
  const currentStep = steps[step]
  const progress = steps.length > 1 ? Math.round((step / (steps.length - 1)) * 100) : 100

  const showAlert = (type, msg) => {
    setAlert({ type, msg })
    setTimeout(() => setAlert(null), 3000)
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      await axios.put(`${API}/users/me`, {
        ...basicForm,
        about_me: aboutMe,
        legacy_message: legacyMessage
      })
      showAlert('success', 'Saved!')
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Save failed')
    }
    setSaving(false)
  }

  const addSong = async (track) => {
    try {
      await axios.post(`${API}/users/me/songs`, track)
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Failed to add song')
    }
  }

  const deleteSong = async (songId) => {
    try {
      await axios.delete(`${API}/users/me/songs/${songId}`)
      load()
    } catch {
      showAlert('danger', 'Failed to remove song')
    }
  }

  const addBucketItem = async (form) => {
    try {
      await axios.post(`${API}/users/me/bucket-list`, form)
      load()
    } catch (err) {
      showAlert('danger', err.response?.data?.error || 'Failed to add item')
    }
  }

  const deleteBucketItem = async (itemId) => {
    try {
      await axios.delete(`${API}/users/me/bucket-list/${itemId}`)
      load()
    } catch {
      showAlert('danger', 'Failed to remove item')
    }
  }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
  if (!profile) return <Alert variant="danger">Failed to load profile.</Alert>

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h2 className="page-title mb-0">{profile.name}'s Profile</h2>
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
              onClick={() => setStep(i)}
            >
              {i + 1}. {s.title}
            </Button>
          ))}
        </div>
      </div>

      {/* Step content */}
      <Card className="mb-4">
        <Card.Header className="fw-bold">{currentStep?.title}</Card.Header>
        <Card.Body>

          {currentStep?.key === 'basic' && (
            <>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Label className="text-muted small">Full Name</Form.Label>
                  <Form.Control
                    value={basicForm.name}
                    onChange={e => setBasicForm({ ...basicForm, name: e.target.value })}
                  />
                </Col>
                <Col md={6}>
                  <Form.Label className="text-muted small">Email</Form.Label>
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
                <Col md={6}>
                  <Form.Label className="text-muted small">Emergency Contact Name</Form.Label>
                  <Form.Control
                    value={basicForm.emergency_contact_name}
                    onChange={e => setBasicForm({ ...basicForm, emergency_contact_name: e.target.value })}
                    placeholder="e.g. Jane Smith"
                  />
                </Col>
                <Col md={6}>
                  <Form.Label className="text-muted small">Emergency Contact Phone</Form.Label>
                  <Form.Control
                    type="tel"
                    value={basicForm.emergency_contact_phone}
                    onChange={e => setBasicForm({ ...basicForm, emergency_contact_phone: e.target.value })}
                    placeholder="e.g. +44 7700 900000"
                  />
                </Col>
              </Row>
              <Button variant="primary" size="sm" className="mt-3" onClick={saveAll} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}

          {currentStep?.key === 'about' && (
            <>
              <Form.Label className="text-muted small">
                Tell us about yourself&nbsp;
                <span className="text-muted">({aboutMe.length} / 3000)</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={9}
                maxLength={3000}
                value={aboutMe}
                onChange={e => setAboutMe(e.target.value)}
                placeholder="Share something about yourself..."
              />
              <Button variant="primary" size="sm" className="mt-3" onClick={saveAll} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}

          {currentStep?.key === 'legacy' && (
            <>
              <Form.Label className="text-muted small">
                How would you like to be remembered?&nbsp;
                <span className="text-muted">({legacyMessage.length} / 5000)</span>
              </Form.Label>
              <p className="text-muted small mb-2">
                A personal message for those you leave behind — what you'd like read at your funeral or how you want to be remembered.
              </p>
              <Form.Control
                as="textarea"
                rows={12}
                maxLength={5000}
                value={legacyMessage}
                onChange={e => setLegacyMessage(e.target.value)}
                placeholder="Your message..."
              />
              <Button variant="primary" size="sm" className="mt-3" onClick={saveAll} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
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

      {/* Prev / Next */}
      <div className="d-flex justify-content-between mb-5">
        <Button variant="outline-secondary" disabled={step === 0} onClick={() => setStep(s => s - 1)}>
          ← Previous
        </Button>
        {step < steps.length - 1 ? (
          <Button variant="primary" onClick={() => setStep(s => s + 1)}>
            Next →
          </Button>
        ) : (
          <Button variant="success" onClick={() => navigate('/profile')}>
            View My Profile ✓
          </Button>
        )}
      </div>
    </>
  )
}
