import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export const parseJwt = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  useEffect(() => {
    const reqInterceptor = axios.interceptors.request.use(config => {
      const t = localStorage.getItem('token')
      if (t) {
        const decoded = parseJwt(t)
        if (decoded && decoded.exp * 1000 < Date.now()) {
          // A view-as session expiring should fall back to the org user's own
          // session, not force a full logout — they were never signed out.
          const realToken = decoded.viewAs && localStorage.getItem('realToken')
          if (realToken) {
            const realUser = localStorage.getItem('realUser')
            localStorage.removeItem('realToken')
            localStorage.removeItem('realUser')
            localStorage.removeItem('viewAsCustomerName')
            localStorage.setItem('token', realToken)
            if (realUser) localStorage.setItem('user', realUser)
            setToken(realToken)
            setUser(realUser ? JSON.parse(realUser) : null)
            config.headers.Authorization = `Bearer ${realToken}`
            return config
          }
          logout()
          return Promise.reject(new Error('Session expired'))
        }
        config.headers.Authorization = `Bearer ${t}`
      }
      return config
    })

    const resInterceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) logout()
        return Promise.reject(err)
      }
    )

    return () => {
      axios.interceptors.request.eject(reqInterceptor)
      axios.interceptors.response.eject(resInterceptor)
    }
  }, [])

  const login = (tokenStr, userData) => {
    localStorage.setItem('token', tokenStr)
    localStorage.setItem('user', JSON.stringify(userData))
    setToken(tokenStr)
    setUser(userData)
  }

  // Stashes the org user's real session and swaps in a short-lived, scoped
  // view-as token. The view-as token's own JWT payload carries a `viewAs`
  // claim, which is how the rest of the app (ViewAsBanner, NavBar) detects
  // that a view-as session is active, without needing a separate flag.
  const startViewAs = (viewAsToken, customerName) => {
    localStorage.setItem('realToken', localStorage.getItem('token'))
    localStorage.setItem('realUser', localStorage.getItem('user'))
    localStorage.setItem('viewAsCustomerName', customerName || 'this customer')
    const viewAsUser = { id: null, name: customerName, is_admin: 0 }
    localStorage.setItem('token', viewAsToken)
    localStorage.setItem('user', JSON.stringify(viewAsUser))
    setToken(viewAsToken)
    setUser(viewAsUser)
  }

  const exitViewAs = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/org-portal/view-as/end`)
    } catch {
      // best-effort — the view-as token also just expires on its own after 45 minutes
    }
    const realToken = localStorage.getItem('realToken')
    const realUser  = localStorage.getItem('realUser')
    localStorage.removeItem('realToken')
    localStorage.removeItem('realUser')
    localStorage.removeItem('viewAsCustomerName')
    if (realToken) {
      localStorage.setItem('token', realToken)
      if (realUser) localStorage.setItem('user', realUser)
      setToken(realToken)
      setUser(realUser ? JSON.parse(realUser) : null)
    } else {
      logout()
    }
  }

  const logout = () => {
    // Fire-and-forget: tell the server so the logout is audit-logged.
    // Do this before clearing state so the interceptor can still attach the token.
    const t = localStorage.getItem('token')
    if (t) {
      axios.post(`${import.meta.env.VITE_API_URL}/auth/logout`)
        .catch(() => {/* best-effort — never block the client logout */})
    }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  const isTokenValid = () => {
    if (!token) return false
    const decoded = parseJwt(token)
    if (!decoded) return false
    return decoded.exp * 1000 > Date.now()
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isTokenValid, startViewAs, exitViewAs }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
