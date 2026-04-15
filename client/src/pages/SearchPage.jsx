import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Badge, Form, InputGroup, Button, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function SearchPage() {
  const [employees, setEmployees] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const fetchEmployees = async (q = '') => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/employees`, { params: { q } })
      setEmployees(res.data)
    } catch {
      setEmployees([])
    }
    setLoading(false)
  }

  useEffect(() => { fetchEmployees() }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchEmployees(query)
  }

  return (
    <>
      <h2 className="page-title mb-4">Employee Search</h2>

      <Form onSubmit={handleSearch} className="mb-4">
        <InputGroup>
          <Form.Control
            className="search-box"
            placeholder="Search by name, department, job title or email..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <Button type="submit" variant="primary">Search</Button>
          {query && (
            <Button variant="outline-secondary" onClick={() => { setQuery(''); fetchEmployees() }}>
              Clear
            </Button>
          )}
        </InputGroup>
      </Form>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : employees.length === 0 ? (
        <div className="text-center text-muted py-5">
          <p>No employees found. <a href="/add">Add one?</a></p>
        </div>
      ) : (
        <Row xs={1} md={2} lg={3} className="g-3">
          {employees.map(emp => (
            <Col key={emp.id}>
              <Card className="employee-card h-100" onClick={() => navigate(`/employee/${emp.id}`)}>
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <Card.Title className="mb-0 fs-6 fw-bold">{emp.name}</Card.Title>
                    <Badge className="badge-dept">{emp.department}</Badge>
                  </div>
                  <Card.Subtitle className="text-muted small mb-2">{emp.job_title}</Card.Subtitle>
                  <Card.Text className="small text-muted">{emp.email}</Card.Text>
                </Card.Body>
                <Card.Footer className="text-end small text-primary">View details →</Card.Footer>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  )
}
