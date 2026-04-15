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
  const [saving, setSaving] = useState('')
  const [alert, setAlert] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewType, setReviewType] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [activeCycleId, setActiveCycleId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/employees/${id}`)
      setEmployee(res.data)
    } catch {
      setEmployee(null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const openReview = (cycleId, type, existing) => {
    setActiveCycleId(cycleId)
    setReviewType(type)
    setReviewComment(existing || '')
    setShowReviewModal(true)
  }

  const saveReview = async () => {
    setSaving('review')
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
    setSaving('')
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

      {/* Basic Info */}
      <Card className="mb-4">
        <Card.Header>Employee Information</Card.Header>
        <Card.Body>
          <Row className="g-2">
            <Col md={6}>
              <small className="text-muted d-block">Email</small>
              <span>{employee.email}</span>
            </Col>
            <Col md={3}>
              <small className="text-muted d-block">Department</small>
              <Badge className="badge-dept">{employee.department}</Badge>
            </Col>
            <Col md={3}>
              <small className="text-muted d-block">Job Title</small>
              <span>{employee.job_title}</span>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {cycle ? (
        <>
          {/* Cycle Info */}
          <Card className="mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span>Review Cycle — {cycle.year}</span>
              <Badge bg="secondary">Starts {MONTHS[cycle.start_month]} {cycle.year}</Badge>
            </Card.Header>

            {/* Goals */}
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

          {/* Mid-year Review */}
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

          {/* Final Review */}
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
          <Button variant="primary" onClick={saveReview} disabled={saving === 'review'}>
            {saving === 'review' ? 'Saving...' : 'Save Review'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
