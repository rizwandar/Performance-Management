import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { useAuth, onVaultSessionInvalidated } from './AuthContext'

// SEC-15: vault unlock session.
//
// Every page that shows vault-protected data (Digital Life, Legal Documents,
// Financial Affairs, Property & Possessions, Household Information) already
// caches the vault password the user types into VaultLockScreen, purely in
// memory, for as long as that one page stays mounted (see VaultGate.jsx's
// "It stays in memory only" copy). The gap this closes: that cache was
// page-scoped, so navigating from one vault section to another re-prompted
// for the same password. Lifting it here to a single app-wide React Context
// makes the cache shared across all five sections (and the Export page),
// still purely in memory, still never persisted, still sent on each API call
// exactly as before - this is not a new grant/bypass mechanism, just a wider
// scope and a bounded lifetime for the same cache.
//
// Fixed 30-minute session, not sliding/idle-based: a warning to extend fires
// 2 minutes before expiry (minute 28). Extending resets to a fresh 30/2 pair
// rather than incrementally bumping the existing timers. Declining, or
// letting the warning go unanswered, lets the session lapse at 30 minutes.
// Independent per browser tab by construction (in-memory React state is
// naturally tab-local) - lost on tab close/reload, which is correct.
//
// Timer mechanics mirror AuthContext's existing view-as timer (startViewAs /
// viewAsTimerRef / clearViewAsTimer): a ref-held setTimeout pair, armed on
// unlock/extend and cleared on lock/unmount. No new audit-log rows, no
// per-user configurability - hardcoded 30/2 minutes for v1, same simplicity
// as the view-as timer.
const SESSION_DURATION_MS = 30 * 60 * 1000
const WARNING_LEAD_MS     = 2 * 60 * 1000 // warn 2 minutes before expiry (i.e. at minute 28)

const VaultSessionContext = createContext(null)

export function VaultSessionProvider({ children }) {
  const { user } = useAuth()

  const [vaultPassword, setVaultPassword]     = useState('')   // memory-only, never persisted
  const [vaultUnlocked, setVaultUnlocked]     = useState(false)
  const [showExtendPrompt, setShowExtendPrompt] = useState(false)

  const warningTimerRef = useRef(null)
  const expiryTimerRef  = useRef(null)

  const clearTimers = () => {
    if (warningTimerRef.current) { clearTimeout(warningTimerRef.current); warningTimerRef.current = null }
    if (expiryTimerRef.current)  { clearTimeout(expiryTimerRef.current);  expiryTimerRef.current  = null }
  }

  // Re-lock: clears the cached password and both timers, and hides the
  // extend prompt if it happened to be showing. Used for manual "Lock
  // vault", timer expiry, declining the extend prompt, a server-reported
  // vault-specific failure, and (via the effect below) a real app logout.
  const lockVault = useCallback(() => {
    clearTimers()
    setVaultPassword('')
    setVaultUnlocked(false)
    setShowExtendPrompt(false)
  }, [])

  const armTimers = useCallback(() => {
    clearTimers()
    warningTimerRef.current = setTimeout(() => setShowExtendPrompt(true), SESSION_DURATION_MS - WARNING_LEAD_MS)
    expiryTimerRef.current  = setTimeout(() => lockVault(), SESSION_DURATION_MS)
  }, [lockVault])

  const unlockVault = useCallback((pw) => {
    setVaultPassword(pw)
    setVaultUnlocked(true)
    setShowExtendPrompt(false)
    armTimers()
  }, [armTimers])

  // "Extend" resets to a fresh 30/2-minute pair, not an incremental bump.
  const extendVaultSession = useCallback(() => {
    setShowExtendPrompt(false)
    armTimers()
  }, [armTimers])

  // A real logout ends the vault session immediately, even though it stays
  // logged in through a mere vault-timer expiry. AuthContext's `user` also
  // goes null on the session-expired-via-401 path (its response interceptor
  // calls the same logout()), so this one check covers both.
  useEffect(() => {
    if (!user) lockVault()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // A vault-specific failure response (temporary lockout, or the vault being
  // destroyed / the account force-logged-out after too many incorrect
  // attempts) re-locks the vault session so every vault page falls back to
  // its VaultLockScreen instead of silently continuing to retry a cached
  // password the server has already rejected. See AuthContext's response
  // interceptor for what triggers this.
  useEffect(() => onVaultSessionInvalidated(lockVault), [lockVault])

  useEffect(() => () => clearTimers(), [])

  return (
    <VaultSessionContext.Provider value={{
      vaultPassword, vaultUnlocked, showExtendPrompt,
      unlockVault, extendVaultSession, lockVault,
    }}>
      {children}
    </VaultSessionContext.Provider>
  )
}

export const useVaultSession = () => useContext(VaultSessionContext)
