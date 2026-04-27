import { createContext, useContext, useEffect, useState } from 'react'
import { authApi, userApi, getToken, saveToken, removeToken, setUnauthorizedHandler } from '../lib/api'
import { syncPushToken, clearPushToken } from '../lib/notifications'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUnauthorizedHandler(signOut)
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const token = await getToken()
      if (token) {
        const data = await userApi.getMe()
        setUser(data)
        syncPushToken()
      }
    } catch {
      await removeToken()
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const data = await authApi.login(email, password)
    await saveToken(data.token)
    setUser(data.user)
    syncPushToken()
    return data
  }

  async function signOut() {
    await clearPushToken()
    await removeToken()
    setUser(null)
  }

  async function register(formData) {
    const data = await authApi.register(formData)
    await saveToken(data.token)
    setUser(data.user)
    syncPushToken()
    return data
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, register, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
