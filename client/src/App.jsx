import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { Navbar, Container, Nav, Button } from 'react-bootstrap'
import { AuthProvider, useAuth } from './context/AuthContext'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ProfileViewPage from './pages/ProfileViewPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isTokenValid } = useAuth()
  if (!isTokenValid()) return <Navigate to="/login" replace />
  if (adminOnly && !user?.is_admin) return <Navigate to="/profile" replace />
  return children
}

function NavBar() {
  const { user, isTokenValid, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <Navbar bg="primary" variant="dark" expand="md" className="mb-4">
      <Container>
        <Navbar.Brand as={Link} to="/">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: 8, verticalAlign: 'middle'}}>
            <rect x="12" y="20" width="4" height="7" rx="1" fill="white" opacity="0.85"/>
            <polygon points="14,2 5,13 23,13" fill="white" opacity="0.9"/>
            <polygon points="14,6 4,18 24,18" fill="white" opacity="0.75"/>
            <circle cx="14" cy="9" r="2.2" fill="#C4B5FD" opacity="0.9"/>
          </svg>
          My Legacy
        </Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse>
          <Nav className="ms-auto align-items-center">
            {isTokenValid() ? (
              <>
                {!user?.is_admin && <Nav.Link as={Link} to="/profile">My Story</Nav.Link>}
                {user?.is_admin && <Nav.Link as={Link} to="/admin">Admin Panel</Nav.Link>}
                <Button variant="outline-light" size="sm" className="ms-2" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Nav.Link as={Link} to="/login">Login</Nav.Link>
                <Nav.Link as={Link} to="/register">Create Profile</Nav.Link>
              </>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}

function AppContent() {
  return (
    <>
      <NavBar />
      <Container>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfileViewPage /></ProtectedRoute>} />
          <Route path="/profile/edit" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
