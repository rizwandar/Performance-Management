// Shared signup logic for MKT-02 campaign landing pages. Each landing page
// calls initLandingSignupForm() with its own segment tag. This handles UTM
// capture, client-side validation matching RegisterPage.jsx's own rules,
// submission to the existing POST /api/auth/register endpoint, firing the
// Google Ads conversion event on success, and handing the new user straight
// into the app already signed in (mirrors AuthContext.login()'s localStorage
// shape so the SPA picks up the session immediately on load, no extra fetch).
//
// These pages are built as Vite entry points (see vite.config.js), not raw
// public/ files, specifically so import.meta.env.VITE_API_URL below resolves
// the same way it does everywhere else in the client - no hardcoded domain.

const API_BASE = import.meta.env.VITE_API_URL

function captureAcquisitionSource(segment) {
  const params = new URLSearchParams(window.location.search)
  const parts = [`variant:${segment}`]
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid']) {
    const val = params.get(key)
    if (val) parts.push(`${key}:${val}`)
  }
  return parts.join('|').slice(0, 200)
}

export function initLandingSignupForm({ formId, segment }) {
  const form = document.getElementById(formId)
  if (!form) return

  const errorEl = form.querySelector('[data-role="form-error"]')
  const submitBtn = form.querySelector('[data-role="submit-btn"]')
  const acquisitionSource = captureAcquisitionSource(segment)

  function showError(msg) {
    if (!errorEl) return
    errorEl.textContent = msg
    errorEl.hidden = false
  }
  function clearError() {
    if (!errorEl) return
    errorEl.textContent = ''
    errorEl.hidden = true
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearError()

    const name = form.elements.name.value.trim()
    const email = form.elements.email.value.trim()
    const password = form.elements.password.value
    const consent = form.elements.privacy_consent.checked

    if (!name) return showError('Please enter your full name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.')
    if (password.length < 8) return showError('Your password must be at least 8 characters long.')
    if (!/[A-Z]/.test(password)) return showError('Your password must contain at least one uppercase letter.')
    if (!/[0-9]/.test(password)) return showError('Your password must contain at least one number.')
    if (!consent) return showError('Please agree to the Privacy Policy and Terms of Service to continue.')

    submitBtn.disabled = true
    const originalLabel = submitBtn.textContent
    submitBtn.textContent = 'Creating your account…'

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name, email, password,
          country_code: 'US',
          privacy_consent: consent,
          acquisition_source: acquisitionSource,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 409) throw new Error('That email address is already registered. Try signing in instead.')
        if (res.status === 429) throw new Error('Too many attempts. Please wait a few minutes and try again.')
        throw new Error(data.error || 'Registration failed. Please check your details and try again.')
      }

      if (data.user) localStorage.setItem('user', JSON.stringify(data.user))

      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', {
          send_to: 'AW-18385614102/l4h8COmiuuAcEJbq-L5E',
        })
      }

      window.location.href = '/dashboard?welcome=1'
    } catch (err) {
      showError(err.message || "We couldn't reach the server. Please check your connection and try again.")
      submitBtn.disabled = false
      submitBtn.textContent = originalLabel
    }
  })
}
