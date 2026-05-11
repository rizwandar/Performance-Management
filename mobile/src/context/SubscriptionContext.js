import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { billingApi } from '../lib/api'
import { getToken } from '../lib/api'

const SubscriptionContext = createContext({ isPremium: true, plan: 'premium', loading: false, refresh: () => {} })

export function SubscriptionProvider({ children }) {
  const [plan, setPlan]       = useState('premium')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const token = await getToken()
    if (!token) { setPlan('free'); return }
    setLoading(true)
    try {
      const data = await billingApi.getAccess()
      setPlan(data.plan)
    } catch {
      setPlan('premium') // fail open so existing users aren't locked out
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <SubscriptionContext.Provider value={{ isPremium: plan === 'premium', plan, loading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() { return useContext(SubscriptionContext) }
