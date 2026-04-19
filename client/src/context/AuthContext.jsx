import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const parseJwt = (token) => {
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
    <AuthContext.Provider value={{ token, user, login, logout, isTokenValid }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
