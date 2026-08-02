import { createContext, useContext, useState, useEffect, useRef } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

// SEC-09: the session credential itself is no longer readable by client JS at
// all - it lives only in an httpOnly cookie the browser sends automatically.
// axios needs to be told to actually include cookies on cross-site requests
// (client and API are on different subdomains), and the server's CORS layer
// already echoes back an exact origin + Access-Control-Allow-Credentials for
// exactly this reason.
axios.defaults.withCredentials = true

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

// Registered once at module load, not inside a component effect - same
// reasoning as before: a hard reload could fire a page's data request before
// AuthProvider has mounted, and this needs to be listening regardless.
let authStateHandlers = []

// Double-submit CSRF defense: csrf_token is a second, non-httpOnly cookie set
// alongside the session cookie. A cross-site attacker's page can make the
// browser attach cookies automatically, but same-origin policy stops it
// reading this cookie's value to also put in a custom header, so a forged
// request fails the server's check even though the session cookie rode along.
// Only mutating requests carry it - GET/HEAD/OPTIONS don't change state.
axios.interceptors.request.use(config => {
  const method = (config.method || 'get').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCookie('csrf_token')
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

axios.interceptors.response.use(
  res => res,
  err => {
    // Only a genuinely invalid/missing/expired session should force a logout.
    // Plenty of authenticated routes also return 401 for "you typed the
    // wrong password" (vault unlock, vault password change, account
    // deletion confirmation, etc.) — those must NOT log the user out,
    // the calling component shows its own inline error instead.
    if (err.response?.status === 401 && err.response?.data?.session_expired) {
      authStateHandlers.forEach(fn => fn('logout'))
    }
    return Promise.reject(err)
  }
)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })
  const [isViewAs, setIsViewAs] = useState(() => localStorage.getItem('viewAsActive') === '1')
  const viewAsTimerRef = useRef(null)

  const clearViewAsTimer = () => {
    if (viewAsTimerRef.current) {
      clearTimeout(viewAsTimerRef.current)
      viewAsTimerRef.current = null
    }
  }

  const logout = () => {
    // Fire-and-forget: tell the server so the logout is audit-logged and the
    // session cookie is cleared server-side. Guarded on `user` since there's
    // no cookie visibility to check client-side anymore.
    if (user) {
      axios.post(`${import.meta.env.VITE_API_URL}/auth/logout`)
        .catch(() => {/* best-effort — never block the client logout */})
    }
    clearViewAsTimer()
    localStorage.removeItem('user')
    localStorage.removeItem('viewAsCustomerName')
    localStorage.removeItem('viewAsActive')
    setUser(null)
    setIsViewAs(false)
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

  useEffect(() => {
    const handler = (action) => {
      if (action === 'logout') logout()
    }
    authStateHandlers.push(handler)
    return () => {
      authStateHandlers = authStateHandlers.filter(h => h !== handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  // The view-as JWT is minted and set as the session cookie entirely
  // server-side now (SEC-09) - this just updates the cached display state and
  // arms a proactive exit a little before the server-side cookie's 45-minute
  // expiry, so it falls back to the real session gracefully instead of the
  // cookie just expiring out from under an open tab with no client-held token
  // to notice the countdown from.
  const startViewAs = (customerName, editAllowed) => {
    localStorage.setItem('viewAsCustomerName', customerName || 'this customer')
    localStorage.setItem('viewAsActive', '1')
    const viewAsUser = { id: null, name: customerName, is_admin: 0, editAllowed: !!editAllowed }
    localStorage.setItem('user', JSON.stringify(viewAsUser))
    setUser(viewAsUser)
    setIsViewAs(true)
    clearViewAsTimer()
    viewAsTimerRef.current = setTimeout(() => { exitViewAs() }, 44 * 60 * 1000)
  }

  const exitViewAs = async () => {
    clearViewAsTimer()
    localStorage.removeItem('viewAsCustomerName')
    localStorage.removeItem('viewAsActive')
    setIsViewAs(false)
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/org-portal/view-as/end`)
      if (res.data?.user) {
        localStorage.setItem('user', JSON.stringify(res.data.user))
        setUser(res.data.user)
        return
      }
    } catch {
      // The view-as cookie may have already expired server-side (e.g. this
      // tab was asleep past 45 minutes) - nothing left to gracefully restore
      // to, fall back to a full logout below rather than leaving stale state.
    }
    logout()
  }

  const isLoggedIn = () => !!user

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoggedIn, isViewAs, startViewAs, exitViewAs }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
