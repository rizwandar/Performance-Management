import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from './AuthContext'

const API = import.meta.env.VITE_API_URL || '/api'

const FREE_SECTION_ROUTES = new Set([
  '/sections/messages',
  '/sections/songs-that-define-me',
  '/sections/lifes-wishes',
  '/sections/how-to-be-remembered',
])

const SubscriptionContext = createContext({ isPremium: true, plan: 'premium', loading: false, refresh: () => {} })

export function SubscriptionProvider({ children }) {
  const { token }              = useAuth()
  const [plan, setPlan]       = useState('premium')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) { setPlan('free'); return }
    setLoading(true)
    try {
      const r = await axios.get(`${API}/billing/access`, { headers: { Authorization: `Bearer ${token}` } })
      setPlan(r.data.plan)
    } catch {
      setPlan('premium') // fail open so existing users are not locked out
    }
    setLoading(false)
  }, [token])

  useEffect(() => { refresh() }, [refresh])

  return (
    <SubscriptionContext.Provider value={{ isPremium: plan === 'premium', plan, loading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() { return useContext(SubscriptionContext) }
export { FREE_SECTION_ROUTES }
