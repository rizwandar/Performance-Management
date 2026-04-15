import { Routes, Route, Link } from 'react-router-dom'
import { Navbar, Container, Nav } from 'react-bootstrap'
import SearchPage from './pages/SearchPage'
import EmployeeDetail from './pages/EmployeeDetail'
import AddEmployee from './pages/AddEmployee'

function App() {
  return (
    <>
      <Navbar bg="primary" variant="dark" expand="md" className="mb-4">
        <Container>
          <Navbar.Brand as={Link} to="/">📊 Performance Manager</Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse>
            <Nav className="ms-auto">
              <Nav.Link as={Link} to="/">Search</Nav.Link>
              <Nav.Link as={Link} to="/add">Add Employee</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/employee/:id" element={<EmployeeDetail />} />
          <Route path="/add" element={<AddEmployee />} />
        </Routes>
      </Container>
    </>
  )
}

export default App
