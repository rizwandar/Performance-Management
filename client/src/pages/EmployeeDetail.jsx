import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Row, Col, Badge, Button, Form, Alert, Spinner, Modal } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const MONTHS = [
  '', 'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

export default function EmployeeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)

  // Employee edit form
  const [editForm, setEditForm] = useState({})
  const [savingProfile, setSavingProfile] = useState(false)

  // Review modal
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewType, setReviewType] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [activeCycleId, setActiveCycleId] = useState(null)
  const [savingReview, setSavingReview] = useState(false)

  // Songs
  const [songs, setSongs] = useState([])
  const [artistQuery, setArtistQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [selectedTrack, setSelectedTrack] = useState('')
  const [addingSong, setAddingSong] = useState(false)
  const [searchError, setSearchError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/employees/${id}`)
      setEmployee(res.data)
      setEditForm({
        name: res.data.name,
        email: res.data.email,
        department: res.data.department,
        job_title: res.data.job_title,
        date_of_birth: res.data.date_of_birth || ''
      })
      setSongs(res.data.songs || [])
    } catch {
      setEmployee(null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // --- Profile save ---
  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await axios.put(`${API}/employees/${id}`, editForm)
      setAlert({ type: 'success', msg: 'Profile saved!' })
      load()
    } catch {
      setAlert({ type: 'danger', msg: 'Failed to save profile' })
    }
    setSavingProfile(false)
  }

  // --- Review modal ---
  const openReview = (cycleId, type, existing) => {
    setActiveCycleId(cycleId)
    setReviewType(type)
    setReviewComment(existing || '')
    setShowReviewModal(true)
  }

  const saveReview = async () => {
    setSavingReview(true)
    try {
      await axios.put(`${API}/cycles/${activeCycleId}/reviews/${reviewType}`, {
        comments: reviewComment
      })
      setShowReviewModal(false)
      setAlert({ type: 'success', msg: 'Review saved!' })
      load()
    } catch {
      setAlert({ type: 'danger', msg: 'Failed to save review' })
    }
    setSavingReview(false)
  }

  // --- Deezer search ---
  const searchArtist = async () => {
    if (!artistQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    setSelectedTrack('')
    setSearchError('')
    try {
      const res = await axios.get(`${API}/deezer/search`, { params: { artist: artistQuery } })
      if (res.data.length === 0) {
        setSearchError('No songs found for that artist / band.')
      } else {
        setSearchResults(res.data)
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    }
    setSearching(false)
  }

  const addSong = async () => {
    if (!selectedTrack) return
    const track = searchResults.find(t => t.deezer_id === selectedTrack)
    if (!track) return
    setAddingSong(true)
    try {
      await axios.post(`${API}/employees/${id}/songs`, track)
      setSongs(prev => [...prev, { ...track, id: Date.now() }])
      setArtistQuery('')
      setSearchResults([])
      setSelectedTrack('')
      load()
    } catch (err) {
      setAlert({ type: 'danger', msg: err.response?.data?.error || 'Failed to add song' })
    }
    setAddingSong(false)
  }

  const deleteSong = async (songId) => {
    try {
      await axios.delete(`${API}/employees/${id}/songs/${songId}`)
      setSongs(prev => prev.filter(s => s.id !== songId))
    } catch {
      setAlert({ type: 'danger', msg: 'Failed to remove song' })
    }
  }

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
  if (!employee) return <Alert variant="danger">Employee not found.</Alert>

  const cycle = employee.cycles?.[0]
  const getMidyear = (c) => c?.reviews?.find(r => r.type === 'midyear')
  const getFinal = (c) => c?.reviews?.find(r => r.type === 'final')

  return (
    <>
      <div className="d-flex align-items-center gap-3 mb-4">
        <Button variant="outline-secondary" size="sm" onClick={() => navigate('/')}>← Back</Button>
        <h2 className="page-title mb-0">{employee.name}</h2>
      </div>

      {alert && <Alert variant={alert.type} dismissible onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* Editable Profile */}
      <Card className="mb-4">
        <Card.Header>Employee Information</Card.Header>
        <Card.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Label className="text-muted small">Full Name</Form.Label>
              <Form.Control
                value={editForm.name || ''}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              />
            </Col>
            <Col md={6}>
              <Form.Label className="text-muted small">Email</Form.Label>
              <Form.Control
                type="email"
                value={editForm.email || ''}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
              />
            </Col>
            <Col md={4}>
              <Form.Label className="text-muted small">Department</Form.Label>
              <Form.Control
                value={editForm.department || ''}
                onChange={e => setEditForm({ ...editForm, department: e.target.value })}
              />
            </Col>
            <Col md={4}>
              <Form.Label className="text-muted small">Job Title</Form.Label>
              <Form.Control
                value={editForm.job_title || ''}
                onChange={e => setEditForm({ ...editForm, job_title: e.target.value })}
              />
            </Col>
            <Col md={4}>
              <Form.Label className="text-muted small">Date of Birth</Form.Label>
              <Form.Control
                type="date"
                value={editForm.date_of_birth || ''}
                onChange={e => setEditForm({ ...editForm, date_of_birth: e.target.value })}
              />
            </Col>
          </Row>
          <div className="mt-3">
            <Button variant="primary" size="sm" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Favourite Songs */}
      <Card className="mb-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span>Favourite Songs</span>
          <Badge bg="secondary">{songs.length} / 20</Badge>
        </Card.Header>
        <Card.Body>
          {/* Current songs list */}
          {songs.length === 0 ? (
            <p className="text-muted small mb-3">No songs added yet.</p>
          ) : (
            <div className="mb-3">
              {songs.map((song, i) => (
                <div key={song.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                  <div>
                    <span className="fw-semibold">{song.title}</span>
                    <span className="text-muted small ms-2">— {song.artist}</span>
                    {song.album && <span className="text-muted small ms-2">({song.album})</span>}
                  </div>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => deleteSong(song.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add song */}
          {songs.length < 20 && (
            <>
              <div className="d-flex gap-2 mb-2">
                <Form.Control
                  placeholder="Type an artist or band name..."
                  value={artistQuery}
                  onChange={e => { setArtistQuery(e.target.value); setSearchError('') }}
                  onKeyDown={e => e.key === 'Enter' && searchArtist()}
                />
                <Button variant="outline-primary" onClick={searchArtist} disabled={searching || !artistQuery.trim()}>
                  {searching ? <Spinner size="sm" animation="border" /> : 'Search'}
                </Button>
              </div>

              {searchError && <p className="text-danger small mb-2">{searchError}</p>}

              {searchResults.length > 0 && (
                <div className="d-flex gap-2">
                  <Form.Select
                    value={selectedTrack}
                    onChange={e => setSelectedTrack(e.target.value)}
                  >
                    <option value="">— Select a song —</option>
                    {searchResults.map(t => (
                      <option key={t.deezer_id} value={t.deezer_id}>
                        {t.title} ({t.album})
                      </option>
                    ))}
                  </Form.Select>
                  <Button
                    variant="success"
                    onClick={addSong}
                    disabled={!selectedTrack || addingSong}
                  >
                    {addingSong ? 'Adding...' : 'Add'}
                  </Button>
                </div>
              )}
            </>
          )}

          {songs.length >= 20 && (
            <p className="text-muted small mt-2">Maximum of 20 songs reached.</p>
          )}
        </Card.Body>
      </Card>

      {/* Review Cycle */}
      {cycle ? (
        <>
          <Card className="mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Review Cycle — {cycle.year}</span>
              <Badge bg="secondary">Starts {MONTHS[cycle.start_month]} {cycle.year}</Badge>
            </Card.Header>
            <Card.Body>
              <h6 className="fw-bold mb-3">Goals</h6>
              {cycle.goals?.length === 0 ? (
                <p className="text-muted">No goals set.</p>
              ) : (
                cycle.goals.map(g => (
                  <div key={g.id} className="goal-card">
                    <div className="fw-semibold">Goal {g.goal_number}: {g.title}</div>
                    {g.description && <div className="text-muted small mt-1">{g.description}</div>}
                  </div>
                ))
              )}
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Mid-Year Review</span>
              <Button size="sm" variant="outline-warning"
                onClick={() => openReview(cycle.id, 'midyear', getMidyear(cycle)?.comments)}>
                {getMidyear(cycle) ? 'Edit' : 'Add'} Comments
              </Button>
            </Card.Header>
            <Card.Body>
              {getMidyear(cycle) ? (
                <div className="review-section">
                  <small className="text-muted d-block mb-1">
                    Reviewed: {new Date(getMidyear(cycle).reviewed_at).toLocaleDateString()}
                  </small>
                  <p className="mb-0">{getMidyear(cycle).comments}</p>
                </div>
              ) : (
                <p className="text-muted">No mid-year review submitted yet.</p>
              )}
            </Card.Body>
          </Card>

          <Card className="mb-5">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Final Review (December)</span>
              <Button size="sm" variant="outline-success"
                onClick={() => openReview(cycle.id, 'final', getFinal(cycle)?.comments)}>
                {getFinal(cycle) ? 'Edit' : 'Add'} Comments
              </Button>
            </Card.Header>
            <Card.Body>
              {getFinal(cycle) ? (
                <div className="review-section final">
                  <small className="text-muted d-block mb-1">
                    Reviewed: {new Date(getFinal(cycle).reviewed_at).toLocaleDateString()}
                  </small>
                  <p className="mb-0">{getFinal(cycle).comments}</p>
                </div>
              ) : (
                <p className="text-muted">No final review submitted yet.</p>
              )}
            </Card.Body>
          </Card>
        </>
      ) : (
        <Alert variant="info">No review cycle found for this employee.</Alert>
      )}

      {/* Review Modal */}
      <Modal show={showReviewModal} onHide={() => setShowReviewModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{reviewType === 'midyear' ? 'Mid-Year' : 'Final'} Review</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>Your Comments</Form.Label>
          <Form.Control
            as="textarea" rows={5}
            value={reviewComment}
            onChange={e => setReviewComment(e.target.value)}
            placeholder="Enter your review comments here..."
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowReviewModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={saveReview} disabled={savingReview}>
            {savingReview ? 'Saving...' : 'Save Review'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
