import { useState, useEffect } from 'react'

// Shared helpers for express-rate-limit 429 responses (SEC-14). The server
// sends an accurate `Retry-After` header (seconds until the window resets)
// on every 429 it issues, but a static "please wait 15 minutes" message was
// shown regardless of how far into the window the block actually landed.
// These helpers read the real value so Login, Register, Forgot Password and
// Reset Password can all show the same accurate, ticking countdown instead.

export function getRetryAfterSeconds(err) {
  const header = err?.response?.headers?.['retry-after']
  const seconds = parseInt(header, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function formatWaitTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

// Same message pattern everywhere a 429 can surface, so the wording isn't
// specific to whichever form happened to hit the limiter.
export function rateLimitMessage(seconds) {
  return seconds != null
    ? `Too many attempts. Please try again in ${formatWaitTime(seconds)}.`
    : 'Too many attempts. Please wait a few minutes and try again.'
}

// Ticks a seconds value down to 0 once per second, for a live "try again in
// mm:ss" countdown rather than a number that's frozen (and increasingly
// wrong) at the moment the 429 was received.
export function useCountdown(initialSeconds) {
  const [seconds, setSeconds] = useState(initialSeconds)

  useEffect(() => {
    setSeconds(initialSeconds)
    if (!initialSeconds) return
    const interval = setInterval(() => {
      setSeconds(s => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [initialSeconds])

  return seconds
}
