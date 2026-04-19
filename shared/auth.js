// Pure auth utilities — no platform-specific storage, works on web and mobile

/**
 * Decode a JWT payload without verifying the signature.
 * Returns the decoded object or null if invalid.
 */
export function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

/**
 * Returns true if the token exists and has not expired.
 */
export function isTokenValid(token) {
  if (!token) return false
  const decoded = parseJwt(token)
  if (!decoded) return false
  return decoded.exp * 1000 > Date.now()
}

/**
 * Returns milliseconds until the token expires, or 0 if already expired.
 */
export function msUntilExpiry(token) {
  const decoded = parseJwt(token)
  if (!decoded) return 0
  return Math.max(0, decoded.exp * 1000 - Date.now())
}
