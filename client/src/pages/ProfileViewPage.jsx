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

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>

  if (!profile) return (
    <Alert variant="danger">
      We were unable to load your profile. Please try refreshing the page.
    </Alert>
  )

  const Section = ({ title, children, show = true }) => {
    if (!show) return null
    return (
      <Card className="mb-4">
        <Card.Header>{title}</Card.Header>
        <Card.Body>{children}</Card.Body>
      </Card>
    )
  }

  const Field = ({ label, value }) => {
    if (!value) return null
    return (
      <div className="mb-2">
        <small className="text-muted d-block mb-1" style={{ fontWeight: 600 }}>{label}</small>
        <span>{value}</span>
      </div>
    )
  }

  const hasEmergencyContact = profile.emergency_contact_name || profile.emergency_contact_phone || profile.emergency_contact_email

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h2 className="page-title mb-0">{profile.name}</h2>
        <Button variant="primary" onClick={() => navigate('/profile/edit')}>
          Edit My Story
        </Button>
      </div>

      {/* ── Personal Details ── */}
      <Section title="Personal Details">
        <Row className="g-3">
          <Col md={6}><Field label="Email Address" value={profile.email} /></Col>
          <Col md={3}><Field label="Date of Birth" value={profile.date_of_birth} /></Col>
          <Col md={3}>
            <small className="text-muted d-block mb-1" style={{ fontWeight: 600 }}>Member Since</small>
            <span>{new Date(profile.created_at).toLocaleDateString()}</span>
          </Col>
        </Row>
      </Section>

      {/* ── Trusted Contact ── */}
      {hasEmergencyContact && (
        <Section title="My Trusted Contact">
          <Row className="g-3">
            <Col md={4}><Field label="Name" value={profile.emergency_contact_name} /></Col>
            <Col md={4}><Field label="Phone" value={profile.emergency_contact_phone} /></Col>
            <Col md={4}><Field label="Email" value={profile.emergency_contact_email} /></Col>
          </Row>
        </Section>
      )}

      {/* ── About Me ── */}
      {profile.about_me && (
        <Section title="My Story">
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }} className="mb-0">
            {profile.about_me}
          </p>
        </Section>
      )}

      {/* ── Legacy Message ── */}
      {profile.legacy_message && (
        <Section title="Words for Those I Leave Behind">
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontStyle: 'italic' }} className="mb-0">
            {profile.legacy_message}
          </p>
        </Section>
      )}

      {/* ── Songs ── */}
      {profile.songs_enabled && (
        <Section title={`Songs Close to My Heart  (${profile.songs?.length || 0} of 20)`}>
          {!profile.songs?.length ? (
            <p className="text-muted small mb-0">
              No songs added yet. <button className="btn btn-link btn-sm p-0" onClick={() => navigate('/profile/edit')}>Add some?</button>
            </p>
          ) : (
            profile.songs.map((song, i) => (
              <div key={song.id} className="d-flex align-items-center py-2 border-bottom">
                <span className="text-muted me-3" style={{ minWidth: 24, fontWeight: 600 }}>{i + 1}</span>
                <div>
                  <span className="fw-semibold">{song.title}</span>
                  <span className="text-muted ms-2 small">by {song.artist}</span>
                  {song.album && <span className="text-muted ms-2 small">· {song.album}</span>}
                </div>
              </div>
            ))
          )}
        </Section>
      )}

      {/* ── Bucket List ── */}
      {profile.bucket_list_enabled && (
        <Section title={`My Bucket List (${profile.bucket_list?.length || 0} of 50)`}>
          {!profile.bucket_list?.length ? (
            <p className="text-muted small mb-0">
              No wishes added yet. <button className="btn btn-link btn-sm p-0" onClick={() => navigate('/profile/edit')}>Add some?</button>
            </p>
          ) : (
            profile.bucket_list.map((item, i) => (
              <div key={item.id} className="goal-card">
                <div className="d-flex align-items-start gap-2">
                  <span className="text-muted" style={{ minWidth: 24, fontWeight: 600, marginTop: 1 }}>{i + 1}</span>
                  <div>
                    <div className="fw-semibold">{item.title}</div>
                    {item.description && <div className="text-muted small mt-1">{item.description}</div>}
                    {item.planning && (
                      <div className="text-muted small mt-1">
                        <strong>Steps taken:</strong> {item.planning}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </Section>
      )}

      {/* Prompt if profile is mostly empty */}
      {!profile.about_me && !profile.legacy_message && (
        <div className="text-center py-4 text-muted">
          <p>Your story is waiting to be told.</p>
          <Button variant="primary" onClick={() => navigate('/profile/edit')}>
            Complete My Story
          </Button>
        </div>
      )}
    </>
  )
}
