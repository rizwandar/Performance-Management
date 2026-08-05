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

// CORRECTED 2026-08-05 (was: reading a second, non-httpOnly csrf_token
// cookie via document.cookie). That never actually worked: document.cookie
// only ever exposes cookies belonging to the CURRENT page's own origin, and
// the csrf_token cookie is set by the API on a different registrable domain.
// The client's document.cookie call was silently returning null on every
// request, forever - not something Chrome's later CHIPS enforcement broke,
// it never worked at all. The server still sets and reads that cookie itself
// (see server/lib/authCookies.js) since its own read of it was never the
// broken half; the fix is that the web client now gets its own readable copy
// of the same value directly in the login/register/etc. response body
// instead, and holds it here in memory rather than trying to re-derive it
// from a cookie it structurally cannot see. Deliberately not persisted to
// localStorage (same reasoning as SEC-09 not persisting the session token
// there) - lost on a hard reload, which is why csrfToken gets re-fetched
// from GET /auth/csrf-token below whenever a cached user exists at boot.
let inMemoryCsrfToken = null
function setCsrfToken(value) {
  inMemoryCsrfToken = value || null
}

// Registered once at module load, not inside a component effect - same
// reasoning as before: a hard reload could fire a page's data request before
// AuthProvider has mounted, and this needs to be listening regardless.
let authStateHandlers = []

// Double-submit CSRF defense: the client echoes the csrf value (held in
// memory, see above) back as a header on every mutating request. A forged
// cross-site request can make the browser attach the session cookie
// automatically, but has no way to obtain this value at all - it's never
// exposed to any page except via a same-origin-to-the-API response body this
// app's own login/etc. calls receive, which an attacker's page can't read
// (CORS blocks that regardless of cookies riding along). Only mutating
// requests carry it - GET/HEAD/OPTIONS don't change state.
axios.interceptors.request.use(config => {
  const method = (config.method || 'get').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (inMemoryCsrfToken) config.headers['X-CSRF-Token'] = inMemoryCsrfToken
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
    setCsrfToken(null)
    localStorage.removeItem('user')
    localStorage.removeItem('viewAsCustomerName')
    localStorage.removeItem('viewAsActive')
    setUser(null)
    setIsViewAs(false)
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

  // A hard reload loses the in-memory csrfToken even though the httpOnly
  // session cookie itself survives - re-fetch it once at boot whenever a
  // cached user looks logged in, so the very next mutating request after a
  // refresh doesn't fail CSRF for no reason the user did anything wrong.
  // Best-effort: if the session actually did expire, this 401s harmlessly
  // and the existing response interceptor above handles that separately.
  useEffect(() => {
    if (!user) return
    axios.get(`${import.meta.env.VITE_API_URL}/auth/csrf-token`)
      .then(r => setCsrfToken(r.data?.csrf_token))
      .catch(() => {/* left null - the interceptor's session_expired handling covers a truly dead session */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // csrfToken is only touched when a caller actually passes one - login()
  // also gets called from places like ProfilePage just to refresh the cached
  // display object after an edit, not to re-authenticate, and that must not
  // wipe out an otherwise-still-valid in-memory csrf value.
  const login = (userData, csrfToken) => {
    if (csrfToken !== undefined) setCsrfToken(csrfToken)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  // The view-as JWT is minted and set as the session cookie entirely
  // server-side now (SEC-09) - this just updates the cached display state and
  // arms a proactive exit a little before the server-side cookie's 45-minute
  // expiry, so it falls back to the real session gracefully instead of the
  // cookie just expiring out from under an open tab with no client-held token
  // to notice the countdown from.
  const startViewAs = (customerName, editAllowed, csrfToken) => {
    setCsrfToken(csrfToken)
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
        setCsrfToken(res.data?.csrf_token)
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
