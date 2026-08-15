import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { VaultSetupScreen, VaultLockScreen } from '../../components/VaultGate'
import FileAttachments from '../../components/FileAttachments'
import SectionHero from '../../components/SectionHero'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'
import { useVaultSession } from '../../context/VaultSessionContext'

const API = import.meta.env.VITE_API_URL

const CATEGORIES = [
  { value: 'utility',      label: 'Utility (electricity, gas, water)' },
  { value: 'insurance',    label: 'Insurance' },
  { value: 'subscription', label: 'Subscription / streaming' },
  { value: 'regular_bill', label: 'Regular bill' },
  { value: 'access_code',  label: 'Access code / password' },
  { value: 'other',        label: 'Other' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

const CATEGORY_BADGES = {
  utility:      { bg: '#EFF6FF', color: '#1D4ED8' },
  insurance:    { bg: '#F0FDF4', color: '#15803D' },
  subscription: { bg: '#FDF4FF', color: '#7E22CE' },
  regular_bill: { bg: '#FFF7ED', color: '#C2410C' },
  access_code:  { bg: '#FEF9C3', color: '#854D0E' },
  other:        { bg: 'var(--parchment-dark)', color: 'var(--text-muted)' },
}

const empty = { category: '', title: '', provider: '', account_reference: '', contact: '', notes: '' }

export default function HouseholdInfoPage() {
  const navigate = useNavigate()

  // Vault unlock state (password + timers) now lives in the shared, app-wide
  // VaultSessionContext (SEC-15) instead of page-local state, so unlocking on
  // any of the five vault sections keeps the others unlocked too, for as long
  // as the 30-minute session lasts.
  const { vaultPassword, vaultUnlocked, unlockVault, lockVault } = useVaultSession()
  const [vaultExists, setVaultExists] = useState(null)  // null = still checking

  const [items, setItems]         = useState([])
  const [sectionDocs, setSectionDocs] = useState([])  // all uploaded_documents for this section
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)

  const [loadFailed, setLoadFailed] = useState(false)

  // Check if a vault exists on mount (independent of unlock state)
  useEffect(() => {
    axios.get(`${API}/sections/digital-life/vault`)
      .then(r => setVaultExists(!!r.data.exists))
      .catch(() => setVaultExists(true))
  }, [])

  const loadItems = useCallback((pw) => {
    setLoading(true)
    setLoadFailed(false)
    Promise.all([
      axios.post(`${API}/sections/household-info/list`, { vault_password: pw }),
      axios.post(`${API}/documents/household_info`, { vault_password: pw }),
    ])
      .then(([itemsRes, docsRes]) => {
        setItems(itemsRes.data)
        setSectionDocs(docsRes.data)
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }, [])

  // Arriving here with the vault already unlocked (from another vault
  // section, or still within the same 30-minute session) skips the lock
  // screen entirely and loads straight away. Losing the cached password
  // (timer expiry, manual lock, or a vault-specific failure elsewhere)
  // clears the items back out.
  useEffect(() => {
    if (vaultExists && vaultUnlocked && vaultPassword) {
      loadItems(vaultPassword)
    } else if (!vaultUnlocked) {
      setItems([])
      setSectionDocs([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultExists, vaultUnlocked])

  const handleUnlock = (pw) => {
    unlockVault(pw)
  }

  const handleVaultReset = () => {
    lockVault()
    setVaultExists(false)
  }

  // Derived from vault-existence (checked once here) and the shared unlock
  // session (shared across all five vault sections).
  const vaultState = vaultExists === null ? 'loading'
    : !vaultExists ? 'no-vault'
    : vaultUnlocked ? 'unlocked'
    : 'locked'

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditing(item)
    setForm({
      category:          item.category          || '',
      title:             item.title             || '',
      provider:          item.provider          || '',
      account_reference: item.account_reference || '',
      contact:           item.contact           || '',
      notes:             item.notes             || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return setError('Please add a title for this entry.')
    setError('')
    setSaving(true)
    try {
      const payload = { ...form, vault_password: vaultPassword }
      if (editing) {
        await axios.put(`${API}/sections/household-info/${editing.id}`, payload)
      } else {
        await axios.post(`${API}/sections/household-info`, payload)
      }
      setShowModal(false)
      setSuccess(editing ? 'Entry updated.' : 'Entry added.')
      loadItems(vaultPassword)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this entry?')) return
    try {
      await axios.delete(`${API}/sections/household-info/${id}`, { data: { vault_password: vaultPassword } })
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {
      setError("We couldn't remove this entry. Please try again.")
    }
  }

  // Group items by category for display
  const grouped = {}
  items.forEach(item => {
    const cat = item.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  })

  const backLink = (
    <div className="mb-4">
      <button className="btn btn-link p-0 mb-2"
        style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
        onClick={() => navigate('/profile')}>← Back to my plans</button>
    </div>
  )

  const hero = (
    <SectionHero
      eyebrow="Your Affairs"
      headline="The small things that keep a home running"
      highlight="a home running"
      subtext="Utility providers, insurance policies, regular bills, alarm codes, and the day-to-day details that keep your home running. This section is vault-protected, only you can access it with your vault password."
    />
  )

  const shareTrigger = <ShareSectionTrigger section="household_info" sectionLabel="Household Info" isVaultSection />

  if (vaultState === 'loading') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
      {hero}
        <div className="text-center py-5">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      </div>
    )
  }

  if (vaultState === 'no-vault') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
      {hero}
        <VaultSetupScreen onSetup={() => setVaultExists(true)} />
      </div>
    )
  }

  if (vaultState === 'locked') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
      {hero}
        <VaultLockScreen onUnlock={handleUnlock} onReset={handleVaultReset} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {backLink}
      {hero}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 8, padding: '10px 16px', marginBottom: 24,
      }}>
        <span style={{ color: 'var(--green-800)', fontSize: '0.9rem' }}>
          🔓 Vault unlocked. Entries are visible in this session only.
        </span>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--green-800)', fontSize: '0.85rem', textDecoration: 'none' }}
          onClick={lockVault}>
          Lock vault
        </button>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4 d-flex align-items-center gap-3 flex-wrap">
        <Button variant="primary" onClick={openAdd}>+ Add an entry</Button>
        {shareTrigger}
      </div>

      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : loadFailed ? (
        <div className="section-placeholder">
          <p className="text-muted small">Couldn't load your information right now. Please refresh the page.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🔑</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>Nothing recorded yet</p>
          <p className="text-muted small mb-0">
            Add utility providers, insurance policies, subscriptions, access codes, and other household details.
          </p>
        </div>
      ) : (
        <div>
          {Object.entries(grouped).map(([cat, catItems]) => {
            const badge = CATEGORY_BADGES[cat] || CATEGORY_BADGES.other
            return (
              <div key={cat} className="mb-4">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span style={{
                    padding: '3px 12px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600,
                    background: badge.bg, color: badge.color,
                  }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <span className="text-muted small">({catItems.length})</span>
                </div>
                {catItems.map(item => (
                  <div key={item.id} className="section-card">
                    <div className="d-flex justify-content-between align-items-start">
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 2 }}>{item.title}</p>
                        {item.provider && (
                          <p className="text-muted small mb-1">{item.provider}</p>
                        )}
                        {item.account_reference && (
                          <p className="small mb-1">
                            <span className="text-muted">Ref / code: </span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--green-900)' }}>{item.account_reference}</span>
                          </p>
                        )}
                        {item.contact && (
                          <p className="text-muted small mb-1">Contact: {item.contact}</p>
                        )}
                        {item.notes && (
                          <p className="text-muted small mb-0" style={{ fontStyle: 'italic' }}>{item.notes}</p>
                        )}
                        <FileAttachments
                          sectionId="household_info"
                          itemId={item.id}
                          sectionDocs={sectionDocs}
                          vaultPassword={vaultPassword}
                          onUpload={newDoc => setSectionDocs(prev => [newDoc, ...prev])}
                          onDelete={docId  => setSectionDocs(prev => prev.filter(d => d.id !== docId))}
                        />
                      </div>
                      <div className="d-flex gap-2 ms-3 flex-shrink-0">
                        <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                        <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Remove</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit entry' : 'Add household information'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Category</Form.Label>
                <Form.Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select a category…</option>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label>Title <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Electricity – Origin Energy, Home Alarm" autoFocus />
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Provider / Company</Form.Label>
                <Form.Control value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}
                  placeholder="e.g. Origin Energy, Allianz, Foxtel" />
              </Col>
              <Col md={6}>
                <Form.Label>Account number / Reference / Code</Form.Label>
                <Form.Control value={form.account_reference} onChange={e => setForm({ ...form, account_reference: e.target.value })}
                  placeholder="Account #, policy #, alarm code, etc." />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Contact phone or email</Form.Label>
              <Form.Control value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })}
                placeholder="e.g. 13 24 61 or support@provider.com" />
            </Form.Group>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional details, instructions, or reminders…" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add entry'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}

      <ShareSectionHistory section="household_info" />

      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
      </div>
    </div>
  )
}
