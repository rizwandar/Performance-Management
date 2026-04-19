import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

const CATEGORIES = [
  { value: 'bank_account',  label: 'Bank Account' },
  { value: 'investment',    label: 'Investment / Shares' },
  { value: 'insurance',     label: 'Insurance Policy' },
  { value: 'pension',       label: 'Pension / Superannuation' },
  { value: 'debt',          label: 'Debt / Loan' },
  { value: 'crypto',        label: 'Cryptocurrency' },
  { value: 'other',         label: 'Other' },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

const empty = {
  category: '', institution: '', account_type: '', account_reference: '',
  contact_name: '', contact_phone: '', notes: '',
}

export default function FinancialAffairsPage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(empty)

  const load = () => {
    setLoading(true)
    axios.get(`${API}/sections/financial-affairs`)
      .then(r => setItems(r.data))
      .catch(() => setError("We couldn't load your financial records. Please try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      category:          item.category || '',
      institution:       item.institution || '',
      account_type:      item.account_type || '',
      account_reference: item.account_reference || '',
      contact_name:      item.contact_name || '',
      contact_phone:     item.contact_phone || '',
      notes:             item.notes || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.institution.trim() && !form.category) return setError('Please add an institution or select a category.')
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await axios.put(`${API}/sections/financial-affairs/${editing.id}`, form)
      } else {
        await axios.post(`${API}/sections/financial-affairs`, form)
      }
      setShowModal(false)
      setSuccess(editing ? 'Record updated.' : 'Record added.')
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this financial record?')) return
    try {
      await axios.delete(`${API}/sections/financial-affairs/${id}`)
      load()
    } catch {
      setError("We couldn't remove this item. Please try again.")
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
        <h3 style={{ color: 'var(--green-900)' }}>💼 Financial Affairs</h3>
        <p className="text-muted">
          Record your bank accounts, investments, insurance, debts, and other financial interests.
          Your loved ones won't need to piece this together under pressure.
        </p>
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      <div className="mb-4">
        <Button variant="primary" onClick={openAdd}>+ Add a record</Button>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>💼</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No financial records yet</p>
          <p className="text-muted small mb-0">
            Add bank accounts, investments, insurance policies, and any debts.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-start">
                <div style={{ flex: 1 }}>
                  {item.category && (
                    <span style={{
                      background: 'var(--gold-50)', color: 'var(--gold)',
                      border: '1px solid var(--gold-light)',
                      borderRadius: 6, padding: '1px 8px', fontSize: '0.78rem', fontWeight: 600,
                      display: 'inline-block', marginBottom: 6,
                    }}>
                      {CATEGORY_LABELS[item.category] || item.category}
                    </span>
                  )}
                  <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 4 }}>
                    {item.institution || 'Not recorded'}
                  </p>
                  {item.account_type      && <p className="text-muted small mb-1">Type: {item.account_type}</p>}
                  {item.account_reference && <p className="text-muted small mb-1">Reference: {item.account_reference}</p>}
                  {item.contact_name      && <p className="text-muted small mb-1">Contact: {item.contact_name}{item.contact_phone ? `, ${item.contact_phone}` : ''}</p>}
                  {item.notes             && <p className="text-muted small mb-0" style={{ fontStyle: 'italic' }}>{item.notes}</p>}
                </div>
                <div className="d-flex gap-2 ms-3 flex-shrink-0">
                  <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                  <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Remove</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? 'Edit record' : 'Add a financial record'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Category</Form.Label>
                <Form.Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select a category</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label>Institution <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control
                  value={form.institution}
                  onChange={e => setForm({ ...form, institution: e.target.value })}
                  placeholder="e.g. ANZ Bank, AMP, ATO"
                />
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Account type</Form.Label>
                <Form.Control
                  value={form.account_type}
                  onChange={e => setForm({ ...form, account_type: e.target.value })}
                  placeholder="e.g. Savings, Term Deposit"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Account reference</Form.Label>
                <Form.Control
                  value={form.account_reference}
                  onChange={e => setForm({ ...form, account_reference: e.target.value })}
                  placeholder="Partial number or reference only"
                />
                <Form.Text className="text-muted">Do not record full account numbers here.</Form.Text>
              </Col>
            </Row>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Contact name</Form.Label>
                <Form.Control
                  value={form.contact_name}
                  onChange={e => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="e.g. Your financial adviser"
                />
              </Col>
              <Col md={6}>
                <Form.Label>Contact phone</Form.Label>
                <Form.Control
                  value={form.contact_phone}
                  onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="e.g. 1300 123 456"
                />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea" rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any details that would help your loved ones..."
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add record'}
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
