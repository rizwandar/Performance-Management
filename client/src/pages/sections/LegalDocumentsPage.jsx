import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import { VaultSetupScreen, VaultLockScreen } from '../../components/VaultGate'

const API = import.meta.env.VITE_API_URL

const DOCUMENT_TYPES = [
  'Will / Last Testament',
  'Power of Attorney',
  'Advance Care Directive',
  'Birth Certificate',
  'Marriage Certificate',
  'Divorce Certificate',
  'Passport',
  'Property Deed / Title',
  'Trust Document',
  'Insurance Policy',
  'Tax Records',
  'Other',
]

const empty = { document_type: '', title: '', held_by: '', location: '', notes: '' }

const MAX_FILES_PER_ITEM = 2

function FileAttachments({ itemId, sectionDocs, onUpload, onDelete }) {
  const attached = sectionDocs.filter(d => d.item_id === itemId)
  const fileRef  = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [upError, setUpError]     = useState('')

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUpError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('section_id', 'legal_documents')
      fd.append('item_id', String(itemId))
      const r = await axios.post(`${API}/documents/upload`, fd)
      onUpload(r.data)
    } catch (err) {
      setUpError(err.response?.data?.error || 'Upload failed. Please try again.')
    }
    setUploading(false)
    // Reset so same file can be re-selected if needed
    e.target.value = ''
  }

  const handleDelete = async (docId) => {
    if (!window.confirm('Remove this attachment?')) return
    try {
      await axios.delete(`${API}/documents/${docId}`)
      onDelete(docId)
    } catch {
      // silently ignore — list will refresh on next load
    }
  }

  const canUpload = attached.length < MAX_FILES_PER_ITEM

  return (
    <div style={{ marginTop: 8 }}>
      {attached.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {attached.map(doc => (
            <div key={doc.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--green-50)', border: '1px solid var(--green-100)',
              borderRadius: 6, padding: '3px 8px', fontSize: '0.8rem',
            }}>
              <span>📎</span>
              <a
                href="#"
                style={{ color: 'var(--green-800)', textDecoration: 'none' }}
                onClick={async e => {
                  e.preventDefault()
                  try {
                    const r = await axios.get(`${API}/documents/download/${doc.id}`)
                    window.open(r.data.url, '_blank')
                  } catch {
                    alert("Couldn't open the file. Please try again.")
                  }
                }}
              >
                {doc.original_name}
              </a>
              <button
                onClick={() => handleDelete(doc.id)}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}
                title="Remove attachment"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {upError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '4px 0' }}>{upError}</p>}

      {canUpload && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            className="btn btn-link p-0"
            style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : `+ Attach file${attached.length > 0 ? ` (${MAX_FILES_PER_ITEM - attached.length} remaining)` : ' (up to 2)'}`}
          </button>
        </div>
      )}
    </div>
  )
}

export default function LegalDocumentsPage() {
  const navigate = useNavigate()

  // Vault state: 'loading' | 'no-vault' | 'locked' | 'unlocked'
  const [vaultState, setVaultState]     = useState('loading')
  const [vaultPassword, setVaultPassword] = useState('')

  const [items, setItems]         = useState([])
  const [sectionDocs, setSectionDocs] = useState([])  // all uploaded_documents for this section
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)

  // Check vault on mount
  useEffect(() => {
    axios.get(`${API}/sections/digital-life/vault`)
      .then(r => setVaultState(r.data.exists ? 'locked' : 'no-vault'))
      .catch(() => setVaultState('locked'))
  }, [])

  const loadItems = useCallback((pw) => {
    setLoading(true)
    Promise.all([
      axios.post(`${API}/sections/legal-documents/list`, { vault_password: pw }),
      axios.get(`${API}/documents/legal_documents`),
    ])
      .then(([itemsRes, docsRes]) => {
        setItems(itemsRes.data)
        setSectionDocs(docsRes.data)
      })
      .catch(() => setError("We couldn't load your documents. Please try locking and unlocking again."))
      .finally(() => setLoading(false))
  }, [])

  const handleUnlock = (pw) => {
    setVaultPassword(pw)
    setVaultState('unlocked')
    loadItems(pw)
  }

  const handleVaultReset = () => {
    setVaultState('no-vault')
    setVaultPassword('')
    setItems([])
    setSectionDocs([])
  }

  const openAdd = () => {
    setEditing(null)
    setForm(empty)
    setError('')
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      document_type: item.document_type || '',
      title:         item.title || '',
      held_by:       item.held_by || '',
      location:      item.location || '',
      notes:         item.notes || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return setError('Please add a title or description.')
    setError('')
    setSaving(true)
    try {
      const payload = { ...form, vault_password: vaultPassword }
      if (editing) {
        await axios.put(`${API}/sections/legal-documents/${editing.id}`, payload)
      } else {
        await axios.post(`${API}/sections/legal-documents`, payload)
      }
      setShowModal(false)
      setSuccess(editing ? 'Document updated.' : 'Document added.')
      loadItems(vaultPassword)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this document record and any attached files?')) return
    try {
      await axios.delete(`${API}/sections/legal-documents/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
      setSectionDocs(prev => prev.filter(d => d.item_id !== id))
    } catch {
      setError("We couldn't remove this item. Please try again.")
    }
  }

  // ── Back link ──────────────────────────────────────────────────────────────
  const backLink = (
    <div className="mb-4">
      <button className="btn btn-link p-0 mb-2"
        style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
        onClick={() => navigate('/profile')}>
        ← Back to my plans
      </button>
      <h3 style={{ color: 'var(--green-900)' }}>📄 Personal & Legal Documents</h3>
      <p className="text-muted">
        Record where your important documents are kept and who holds them.
        This section is vault-protected. Only you can access it with your vault password.
      </p>
    </div>
  )

  // ── Vault states ───────────────────────────────────────────────────────────
  if (vaultState === 'loading') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
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
        <VaultSetupScreen onSetup={() => setVaultState('locked')} />
      </div>
    )
  }

  if (vaultState === 'locked') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {backLink}
        <VaultLockScreen onUnlock={handleUnlock} onReset={handleVaultReset} />
      </div>
    )
  }

  // ── Unlocked ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {backLink}

      {/* Vault status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--green-50)', border: '1px solid var(--green-100)',
        borderRadius: 8, padding: '10px 16px', marginBottom: 24,
      }}>
        <span style={{ color: 'var(--green-800)', fontSize: '0.9rem' }}>
          🔓 Vault unlocked. Documents are visible in this session only.
        </span>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--green-800)', fontSize: '0.85rem', textDecoration: 'none' }}
          onClick={() => { setVaultPassword(''); setItems([]); setSectionDocs([]); setVaultState('locked') }}>
          Lock vault
        </button>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add a document</Button>
      </div>

      {/* Items */}
      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>📄</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No documents recorded yet</p>
          <p className="text-muted small mb-0">
            Add your will, power of attorney, certificates, and other important documents.
            You can attach up to 2 files per item.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    {item.document_type && (
                      <span style={{
                        background: 'var(--gold-50)', color: 'var(--gold)',
                        border: '1px solid var(--gold-light)',
                        borderRadius: 6, padding: '1px 8px', fontSize: '0.78rem', fontWeight: 600,
                      }}>
                        {item.document_type}
                      </span>
                    )}
                  </div>
                  <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4 }}>{item.title}</p>
                  {item.held_by  && <p className="text-muted small mb-1">Held by: {item.held_by}</p>}
                  {item.location && <p className="text-muted small mb-1">Location: {item.location}</p>}
                  {item.notes    && <p className="text-muted small mb-1" style={{ fontStyle: 'italic' }}>{item.notes}</p>}

                  <FileAttachments
                    itemId={item.id}
                    sectionDocs={sectionDocs}
                    onUpload={newDoc => setSectionDocs(prev => [newDoc, ...prev])}
                    onDelete={docId  => setSectionDocs(prev => prev.filter(d => d.id !== docId))}
                  />
                </div>
                <div className="d-flex gap-2 ms-3 flex-shrink-0">
                  <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                  <Button size="sm" variant="outline-danger"  onClick={() => handleDelete(item.id)}>Remove</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit document' : 'Add a document'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Document type</Form.Label>
              <Form.Select value={form.document_type} onChange={e => setForm({ ...form, document_type: e.target.value })}>
                <option value="">Select a type (optional)</option>
                {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Title or description <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
              <Form.Control
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. My Last Will and Testament"
              />
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Held by</Form.Label>
                <Form.Control
                  value={form.held_by}
                  onChange={e => setForm({ ...form, held_by: e.target.value })}
                  placeholder="e.g. Smith & Jones Solicitors"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Location</Form.Label>
                <Form.Control
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Filing cabinet, top drawer"
                />
              </Col>
            </Row>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea" rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional details that might help your loved ones..."
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add document'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}
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
