// Tiny pub/sub so ShareSectionTrigger (top of page) and ShareSectionHistory
// (bottom of page) can stay two independent components with their own data
// fetching, yet still have the history list refresh itself the moment a new
// share is created or revoked elsewhere on the same page. No shared state /
// context needed, since both components already know which `section` they
// care about.
const EVENT = 'igh:section-share-changed'

export function emitSectionShareChanged(section) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { section } }))
}

// Returns an unsubscribe function, meant to be called from a useEffect cleanup.
export function onSectionShareChanged(section, handler) {
  const listener = (e) => { if (e.detail?.section === section) handler() }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
