import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Button, Alert, Row, Col } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

export default function AddEmployee() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()

  const [form, setForm] = useState({
    name: '', email: '', department: '', job_title: ''
  })
  const [cycleYear, setCycleYear] = useState(currentYear)
  const [startMonth, setStartMonth] = useState(1)
  const [goals, setGoals] = useState([
    { title: '', description: '' },
    { title: '', description: '' },
    { title: '', description: '' }
  ])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleField = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleGoal = (i, field, value) => {
    const updated = [...goals]
    updated[i] = { ...updated[i], [field]: value }
    setGoals(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      // 1. Create employee
      const empRes = await axios.post(`${API}/employees`, form)
      const employeeId = empRes.data.id

      // 2. Create review cycle
      const cycleRes = await axios.post(`${API}/cycles`, {
        employee_id: employeeId,
        year: cycleYear,
        start_month: startMonth
      })
      const cycleId = cycleRes.data.id

      // 3. Save goals (only ones with a title)
      const filledGoals = goals
        .map((g, i) => ({ ...g, goal_number: i + 1 }))
        .filter(g => g.title.trim())

      if (filledGoals.length > 0) {
        await axios.put(`${API}/cycles/${cycleId}/goals`, { goals: filledGoals })
      }

      navigate(`/employee/${employeeId}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    }
    setSaving(false)
  }

  return (
    <>
      <h2 className="page-title mb-4">Add New Employee</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      <Form onSubmit={handleSubmit}>
        {/* Employee Info */}
        <Card className="mb-4">
          <Card.Header>Employee Information</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label>Full Name</Form.Label>
                <Form.Control name="name" value={form.name} onChange={handleField} required placeholder="e.g. Jane Smith" />
              </Col>
              <Col md={6}>
                <Form.Label>Email</Form.Label>
                <Form.Control name="email" type="email" value={form.email} onChange={handleField} required placeholder="jane@company.com" />
              </Col>
              <Col md={6}>
                <Form.Label>Department</Form.Label>
                <Form.Control name="department" value={form.department} onChange={handleField} required placeholder="e.g. Engineering" />
              </Col>
              <Col md={6}>
                <Form.Label>Job Title</Form.Label>
                <Form.Control name="job_title" value={form.job_title} onChange={handleField} required placeholder="e.g. Software Developer" />
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Review Cycle */}
        <Card className="mb-4">
          <Card.Header>Review Cycle</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label>Year</Form.Label>
                <Form.Control
                  type="number"
                  value={cycleYear}
                  min={2020} max={2099}
                  onChange={e => setCycleYear(Number(e.target.value))}
                />
              </Col>
              <Col md={6}>
                <Form.Label>Cycle Start Month</Form.Label>
                <Form.Select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => (
                    <option key={i+1} value={i+1}>{m}</option>
                  ))}
                </Form.Select>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Goals */}
        <Card className="mb-4">
          <Card.Header>Goals (up to 3)</Card.Header>
          <Card.Body>
            {goals.map((g, i) => (
              <div key={i} className="goal-card mb-3">
                <Form.Label className="fw-semibold">Goal {i + 1}</Form.Label>
                <Form.Control
                  className="mb-2"
                  placeholder="Goal title"
                  value={g.title}
                  onChange={e => handleGoal(i, 'title', e.target.value)}
                />
                <Form.Control
                  as="textarea" rows={2}
                  placeholder="Description (optional)"
                  value={g.description}
                  onChange={e => handleGoal(i, 'description', e.target.value)}
                />
              </div>
            ))}
          </Card.Body>
        </Card>

        <div className="d-flex gap-2 mb-5">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Employee'}
          </Button>
          <Button variant="outline-secondary" onClick={() => navigate('/')}>Cancel</Button>
        </div>
      </Form>
    </>
  )
}
