import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = 'https://performance-api-djuk.onrender.com/api'
const TOKEN_KEY = 'igh_token'

export async function getToken() {
  return await SecureStore.getItemAsync(TOKEN_KEY)
}

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function removeToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

let _onUnauthorized = null

export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn
}

const client = axios.create({ baseURL: API_URL })

client.interceptors.request.use(async config => {
  const token = await getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && _onUnauthorized) {
      _onUnauthorized()
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login:          (email, password) => client.post('/auth/login', { email, password }).then(r => r.data),
  register:       (data)            => client.post('/auth/register', data).then(r => r.data),
  forgotPassword: (email, dob)      => client.post('/auth/forgot-password', { email, date_of_birth: dob }).then(r => r.data),
}

export const userApi = {
  getMe:           ()       => client.get('/users/me').then(r => r.data),
  updateMe:        (data)   => client.put('/users/me', data).then(r => r.data),
  changePassword:  (data)   => client.post('/users/me/change-password', data).then(r => r.data),
  getTimer:        ()       => client.get('/users/me/timer').then(r => r.data),
  updateTimer:     (months) => client.put('/users/me/timer', { inactivity_period_months: months }).then(r => r.data),
}

export const sectionsApi = {
  getCounts: () => client.get('/sections/completion').then(r => r.data),
}

// How I'd Like to Be Remembered (fields on the users record)
export const rememberedApi = {
  get:  () => client.get('/users/me').then(r => {
    const u = r.data
    return { about_me: u.about_me, legacy_message: u.legacy_message, life_story: u.life_story, remembered_for: u.remembered_for }
  }),
  save: (data) => client.put('/users/me', data).then(r => r.data),
}

// Messages to Loved Ones
export const messagesApi = {
  getAll: ()         => client.get('/sections/messages').then(r => r.data),
  add:    (data)     => client.post('/sections/messages', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/messages/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/messages/${id}`).then(r => r.data),
}

// Songs That Define Me
export const songsApi = {
  getAll: ()         => client.get('/sections/songs-that-define-me').then(r => r.data),
  add:    (data)     => client.post('/sections/songs-that-define-me', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/songs-that-define-me/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/songs-that-define-me/${id}`).then(r => r.data),
}

// Bucket List / Life's Wishes
export const wishesApi = {
  getAll: ()         => client.get('/sections/lifes-wishes').then(r => r.data),
  add:    (data)     => client.post('/sections/lifes-wishes', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/lifes-wishes/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/lifes-wishes/${id}`).then(r => r.data),
}

// Funeral Wishes (single record)
export const funeralApi = {
  get:  () => client.get('/sections/funeral-wishes').then(r => r.data),
  save: (data) => client.put('/sections/funeral-wishes', data).then(r => r.data),
}

// Medical Wishes (single record)
export const medicalApi = {
  get:  () => client.get('/sections/medical-wishes').then(r => r.data),
  save: (data) => client.put('/sections/medical-wishes', data).then(r => r.data),
}

// People to Notify
export const notifyApi = {
  getAll: ()         => client.get('/sections/people-to-notify').then(r => r.data),
  add:    (data)     => client.post('/sections/people-to-notify', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/people-to-notify/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/people-to-notify/${id}`).then(r => r.data),
}

// Property & Possessions
export const propertyApi = {
  getAll: ()         => client.get('/sections/property-possessions').then(r => r.data),
  add:    (data)     => client.post('/sections/property-possessions', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/property-possessions/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/property-possessions/${id}`).then(r => r.data),
}

// Financial Affairs
export const financialApi = {
  getAll: ()         => client.get('/sections/financial-affairs').then(r => r.data),
  add:    (data)     => client.post('/sections/financial-affairs', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/financial-affairs/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/financial-affairs/${id}`).then(r => r.data),
}

// Household Info
export const householdApi = {
  getAll: ()         => client.get('/sections/household-info').then(r => r.data),
  add:    (data)     => client.post('/sections/household-info', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/household-info/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/household-info/${id}`).then(r => r.data),
}

// Children & Dependants
export const childrenApi = {
  getAll: ()         => client.get('/sections/children-dependants').then(r => r.data),
  add:    (data)     => client.post('/sections/children-dependants', data).then(r => r.data),
  update: (id, data) => client.put(`/sections/children-dependants/${id}`, data).then(r => r.data),
  remove: (id)       => client.delete(`/sections/children-dependants/${id}`).then(r => r.data),
}

// Key Contacts — emergency contact (on users record) + trusted contacts list
export const keyContactsApi = {
  getEmergency:    ()     => client.get('/users/me').then(r => ({
    name:  r.data.emergency_contact_name,
    phone: r.data.emergency_contact_phone,
    email: r.data.emergency_contact_email,
  })),
  saveEmergency:   (data) => client.put('/users/me', {
    emergency_contact_name:  data.name,
    emergency_contact_phone: data.phone,
    emergency_contact_email: data.email,
  }).then(r => r.data),
  getTrusted:        ()                   => client.get('/trusted-contacts').then(r => r.data),
  addTrusted:        (data)               => client.post('/trusted-contacts', data).then(r => r.data),
  updateTrusted:     (id, data)           => client.put(`/trusted-contacts/${id}`, data).then(r => r.data),
  updatePermissions: (id, visible_sections) => client.put(`/trusted-contacts/${id}/permissions`, { visible_sections }).then(r => r.data),
  removeTrusted:     (id)                 => client.delete(`/trusted-contacts/${id}`).then(r => r.data),
}

// Legal Documents (vault-protected)
export const legalApi = {
  list:   (vault_password) => client.post('/sections/legal-documents/list', { vault_password }).then(r => r.data),
  add:    (data)           => client.post('/sections/legal-documents', data).then(r => r.data),
  update: (id, data)       => client.put(`/sections/legal-documents/${id}`, data).then(r => r.data),
  remove: (id)             => client.delete(`/sections/legal-documents/${id}`).then(r => r.data),
}

// Digital Life (vault-protected, encrypted credentials)
export const digitalApi = {
  checkVault:  ()       => client.get('/sections/digital-life/vault').then(r => r.data),
  setupVault:  (pw)     => client.post('/sections/digital-life/vault', { vault_password: pw }).then(r => r.data),
  verifyVault: (pw)     => client.post('/sections/digital-life/vault/verify', { vault_password: pw }).then(r => r.data),
  list:        (pw)     => client.post('/sections/digital-life/list', { vault_password: pw }).then(r => r.data),
  add:         (data)   => client.post('/sections/digital-life', data).then(r => r.data),
  update:      (id, data) => client.put(`/sections/digital-life/${id}`, data).then(r => r.data),
  remove:      (id, pw) => client.delete(`/sections/digital-life/${id}`, { data: { vault_password: pw } }).then(r => r.data),
}
