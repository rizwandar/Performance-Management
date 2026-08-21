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

const SubscriptionContext = createContext({
  isPremium: true, plan: 'premium', loading: false, signupTrialExpired: false, refresh: () => {},
})

export function SubscriptionProvider({ children }) {
  const { user }               = useAuth()
  const [plan, setPlan]       = useState('premium')
  // BIL-08: whether the free no-card signup trial has already ended for this
  // account (and no real subscription has replaced it) - lets locked-section
  // UI say "your trial has ended" instead of the generic Premium-section copy.
  const [signupTrialExpired, setSignupTrialExpired] = useState(false)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) { setPlan('free'); setSignupTrialExpired(false); return }
    setLoading(true)
    try {
      const r = await axios.get(`${API}/billing/access`)
      setPlan(r.data.plan)
      setSignupTrialExpired(!!r.data.signup_trial_expired)
    } catch {
      setPlan('premium') // fail open so existing users are not locked out
    }
    setLoading(false)
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  return (
    <SubscriptionContext.Provider value={{ isPremium: plan === 'premium', plan, loading, signupTrialExpired, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() { return useContext(SubscriptionContext) }
export { FREE_SECTION_ROUTES }
