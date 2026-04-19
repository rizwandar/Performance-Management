import axios from 'axios'
import { isTokenValid } from './auth.js'

/**
 * Creates a configured axios instance shared by web and mobile.
 *
 * @param {object} options
 * @param {string}   options.baseURL       - API base URL (from env)
 * @param {Function} options.getToken      - () => string|null — read stored token
 * @param {Function} options.onUnauthorized - () => void — called on 401 or expired token
 */
export function createApiClient({ baseURL, getToken, onUnauthorized }) {
  const client = axios.create({ baseURL })

  client.interceptors.request.use(config => {
    const token = getToken()
    if (token) {
      if (!isTokenValid(token)) {
        onUnauthorized()
        return Promise.reject(new Error('Session expired'))
      }
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  client.interceptors.response.use(
    res => res,
    err => {
      if (err.response?.status === 401) onUnauthorized()
      return Promise.reject(err)
    }
  )

  return client
}

// ---------------------------------------------------------------------------
// API call functions — accept a configured client instance
// Each returns the response data directly.
// ---------------------------------------------------------------------------

// Auth
export const authApi = (client) => ({
  login:         (email, password)        => client.post('/auth/login', { email, password }).then(r => r.data),
  register:      (data)                   => client.post('/auth/register', data).then(r => r.data),
  logout:        ()                       => client.post('/auth/logout').then(r => r.data),
  forgotPassword:(email, dob)             => client.post('/auth/forgot-password', { email, date_of_birth: dob }).then(r => r.data),
  resetPassword: (token, password)        => client.post('/auth/reset-password', { token, password }).then(r => r.data),
})

// Current user profile
export const userApi = (client) => ({
  getMe:              ()       => client.get('/users/me').then(r => r.data),
  updateMe:           (data)   => client.put('/users/me', data).then(r => r.data),
  getTimer:           ()       => client.get('/users/me/timer').then(r => r.data),
  updateTimer:        (months) => client.put('/users/me/timer', { inactivity_period_months: months }).then(r => r.data),
  addSong:            (data)   => client.post('/users/me/songs', data).then(r => r.data),
  deleteSong:         (id)     => client.delete(`/users/me/songs/${id}`).then(r => r.data),
  addBucketItem:      (data)   => client.post('/users/me/bucket-list', data).then(r => r.data),
  deleteBucketItem:   (id)     => client.delete(`/users/me/bucket-list/${id}`).then(r => r.data),
})

// Admin
export const adminApi = (client) => ({
  getStats:         ()           => client.get('/admin/stats').then(r => r.data),
  getUsers:         (q = '')     => client.get(`/admin/users?q=${q}`).then(r => r.data),
  getUser:          (id)         => client.get(`/admin/users/${id}`).then(r => r.data),
  updatePermissions:(id, data)   => client.put(`/admin/users/${id}/permissions`, data).then(r => r.data),
})

// App settings
export const settingsApi = (client) => ({
  getSettings:   ()          => client.get('/settings').then(r => r.data),
  updateSetting: (key, value)=> client.put(`/settings/${key}`, { value }).then(r => r.data),
})

// Trusted contacts
export const trustedContactsApi = (client) => ({
  getAll:            ()                        => client.get('/trusted-contacts').then(r => r.data),
  add:               (data)                    => client.post('/trusted-contacts', data).then(r => r.data),
  update:            (id, data)                => client.put(`/trusted-contacts/${id}`, data).then(r => r.data),
  updatePermissions: (id, visible_sections)    => client.put(`/trusted-contacts/${id}/permissions`, { visible_sections }).then(r => r.data),
  remove:            (id)                      => client.delete(`/trusted-contacts/${id}`).then(r => r.data),
})

// Document uploads
export const documentsApi = (client) => ({
  upload:      (formData)  => client.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data),
  list:        (sectionId) => client.get(`/documents/${sectionId}`).then(r => r.data),
  getDownload: (id)        => client.get(`/documents/download/${id}`).then(r => r.data),
  remove:      (id)        => client.delete(`/documents/${id}`).then(r => r.data),
})

// Deezer search (proxied)
export const deezerApi = (client) => ({
  search: (artist) => client.get(`/deezer/search?artist=${encodeURIComponent(artist)}`).then(r => r.data),
})

// PDF export — returns a blob URL the client can trigger as a download
export const exportApi = (client) => ({
  downloadPdf: () => client.get('/export', { responseType: 'blob' }).then(r => r.data),
})

// Billing & subscription
export const billingApi = (client) => ({
  getSubscription:     ()     => client.get('/billing/subscription').then(r => r.data),
  getPlans:            ()     => client.get('/billing/plans').then(r => r.data),
  getPaymentMethods:   ()     => client.get('/billing/payment-methods').then(r => r.data),
  subscribe:           (plan) => client.post('/billing/subscribe', { plan }).then(r => r.data),
  cancel:              ()     => client.post('/billing/cancel').then(r => r.data),
})
