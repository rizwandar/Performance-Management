import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Badge, Button, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function ProfileViewPage() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    axios.get(`${API}/users/me`)
      .then(res => setProfile(res.data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
  if (!profile) return <Alert variant="danger">Failed to load profile.</Alert>

  const Field = ({ label, value }) => value ? (
    <div className="mb-3">
      <small className="text-muted d-block fw-semibold mb-1">{label}</small>
      <span>{value}</span>
    </div>
  ) : null

  const LongField = ({ label, value }) => value ? (
    <div className="mb-3">
      <small className="text-muted d-block fw-semibold mb-1">{label}</small>
      <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{value}</p>
    </div>
  ) : null

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h2 className="page-title mb-0">{profile.name}</h2>
        <Button variant="primary" onClick={() => navigate('/profile/edit')}>
          Edit Profile
        </Button>
      </div>

      {/* Basic Info */}
      <Card className="mb-4">
        <Card.Header className="fw-bold">Basic Information</Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}><Field label="Email" value={profile.email} /></Col>
            <Col md={3}><Field label="Date of Birth" value={profile.date_of_birth} /></Col>
            <Col md={3}><Field label="Member Since" value={new Date(profile.created_at).toLocaleDateString()} /></Col>
          </Row>
          {(profile.emergency_contact_name || profile.emergency_contact_phone) && (
            <Row className="mt-2">
              <Col md={6}><Field label="Emergency Contact" value={profile.emergency_contact_name} /></Col>
              <Col md={6}><Field label="Emergency Contact Phone" value={profile.emergency_contact_phone} /></Col>
            </Row>
          )}
        </Card.Body>
      </Card>

      {/* About Me */}
      {profile.about_me && (
        <Card className="mb-4">
          <Card.Header className="fw-bold">About Me</Card.Header>
          <Card.Body>
            <LongField value={profile.about_me} />
          </Card.Body>
        </Card>
      )}

      {/* Legacy Message */}
      {profile.legacy_message && (
        <Card className="mb-4">
          <Card.Header className="fw-bold">My Message</Card.Header>
          <Card.Body>
            <LongField value={profile.legacy_message} />
          </Card.Body>
        </Card>
      )}

      {/* Favourite Songs */}
      {profile.songs_enabled && (
        <Card className="mb-4">
          <Card.Header className="d-flex justify-content-between align-items-center fw-bold">
            <span>Favourite Songs</span>
            <Badge bg="secondary">{profile.songs?.length || 0} / 20</Badge>
          </Card.Header>
          <Card.Body>
            {!profile.songs?.length ? (
              <p className="text-muted small mb-0">No songs added yet.</p>
            ) : (
              profile.songs.map(song => (
                <div key={song.id} className="py-2 border-bottom">
                  <span className="fw-semibold">{song.title}</span>
                  <span className="text-muted small ms-2">— {song.artist}</span>
                  {song.album && <span className="text-muted small ms-2">({song.album})</span>}
                </div>
              ))
            )}
          </Card.Body>
        </Card>
      )}

      {/* Bucket List */}
      {profile.bucket_list_enabled && (
        <Card className="mb-5">
          <Card.Header className="d-flex justify-content-between align-items-center fw-bold">
            <span>Bucket List</span>
            <Badge bg="secondary">{profile.bucket_list?.length || 0} / 50</Badge>
          </Card.Header>
          <Card.Body>
            {!profile.bucket_list?.length ? (
              <p className="text-muted small mb-0">No items added yet.</p>
            ) : (
              profile.bucket_list.map(item => (
                <div key={item.id} className="py-2 border-bottom">
                  <div className="fw-semibold">{item.title}</div>
                  {item.description && <div className="text-muted small mt-1">{item.description}</div>}
                  {item.planning && (
                    <div className="text-muted small mt-1">
                      <strong>Planning:</strong> {item.planning}
                    </div>
                  )}
                </div>
              ))
            )}
          </Card.Body>
        </Card>
      )}
    </>
  )
}
