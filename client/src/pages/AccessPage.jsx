import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Spinner, Alert, Badge } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

// ---------------------------------------------------------------------------
// Section renderers — read-only display of each permitted section
// ---------------------------------------------------------------------------

function SectionBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h5 style={{ color: 'var(--green-900)', borderBottom: '2px solid var(--gold)', paddingBottom: 8, marginBottom: 16 }}>
        {title}
      </h5>
      {children}
    </div>
  )
}

function FieldRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ minWidth: 180, fontWeight: 600, color: 'var(--green-900)', fontSize: '0.9rem' }}>{label}</span>
      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.9rem' }}>{value}</span>
    </div>
  )
}

function ItemCard({ children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
      {children}
    </div>
  )
}

// ── Individual section renderers ───────────────────────────────────────────

function LegalDocuments({ data }) {
  if (!data?.length) return <p className="text-muted small">No legal documents recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>{d.title}</p>
      <FieldRow label="Document type" value={d.document_type} />
      <FieldRow label="Held by"       value={d.held_by} />
      <FieldRow label="Location"      value={d.location} />
      <FieldRow label="Notes"         value={d.notes} />
    </ItemCard>
  ))
}

function FinancialItems({ data }) {
  if (!data?.length) return <p className="text-muted small">No financial details recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.institution || 'Unnamed'}</span>
        {d.category && <Badge style={{ background: 'var(--green-100)', color: 'var(--green-900)', fontWeight: 500 }}>{d.category.replace('_', ' ')}</Badge>}
      </div>
      <FieldRow label="Account type"      value={d.account_type} />
      <FieldRow label="Account reference" value={d.account_reference} />
      <FieldRow label="Contact name"      value={d.contact_name} />
      <FieldRow label="Contact phone"     value={d.contact_phone} />
      <FieldRow label="Notes"             value={d.notes} />
    </ItemCard>
  ))
}

function FuneralWishes({ data }) {
  if (!data) return <p className="text-muted small">No funeral wishes recorded.</p>
  return (
    <ItemCard>
      <FieldRow label="Burial preference"  value={data.burial_preference} />
      <FieldRow label="Ceremony type"      value={data.ceremony_type} />
      <FieldRow label="Ceremony location"  value={data.ceremony_location} />
      <FieldRow label="Funeral home"       value={data.funeral_home} />
      <FieldRow label="Pre-paid plan"      value={data.pre_paid_plan ? 'Yes' : 'No'} />
      <FieldRow label="Pre-paid details"   value={data.pre_paid_details} />
      <FieldRow label="Music preferences"  value={data.music_preferences} />
      <FieldRow label="Readings"           value={data.readings} />
      <FieldRow label="Flowers / donations" value={data.flowers_preference} />
      <FieldRow label="Donation charity"   value={data.donation_charity} />
      <FieldRow label="Special requests"   value={data.special_requests} />
      <FieldRow label="Additional notes"   value={data.notes} />
    </ItemCard>
  )
}

function MedicalWishes({ data }) {
  if (!data) return <p className="text-muted small">No medical wishes recorded.</p>
  return (
    <ItemCard>
      <FieldRow label="Organ donation"          value={data.organ_donation} />
      <FieldRow label="Organ donation details"  value={data.organ_donation_details} />
      <FieldRow label="Advance care directive"  value={data.advance_care_directive ? 'Yes' : 'No'} />
      <FieldRow label="Directive location"      value={data.directive_location} />
      <FieldRow label="DNR preference"          value={data.dnr_preference} />
      <FieldRow label="GP name"                 value={data.gp_name} />
      <FieldRow label="GP phone"                value={data.gp_phone} />
      <FieldRow label="Hospital preference"     value={data.hospital_preference} />
      <FieldRow label="Current medications"     value={data.current_medications} />
      <FieldRow label="Medical conditions"      value={data.medical_conditions} />
      <FieldRow label="Notes"                   value={data.notes} />
    </ItemCard>
  )
}

function PeopleToNotify({ data }) {
  if (!data?.length) return <p className="text-muted small">No people to notify recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>{d.name}</p>
      <FieldRow label="Relationship"  value={d.relationship} />
      <FieldRow label="Email"         value={d.email} />
      <FieldRow label="Phone"         value={d.phone} />
      <FieldRow label="Notified by"   value={d.notified_by} />
      <FieldRow label="Notes"         value={d.notes} />
    </ItemCard>
  ))
}

function PropertyItems({ data }) {
  if (!data?.length) return <p className="text-muted small">No property or possessions recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.title}</span>
        {d.category && <Badge style={{ background: 'var(--green-100)', color: 'var(--green-900)', fontWeight: 500 }}>{d.category.replace('_', ' ')}</Badge>}
      </div>
      <FieldRow label="Description"        value={d.description} />
      <FieldRow label="Location"           value={d.location} />
      <FieldRow label="Intended recipient" value={d.intended_recipient} />
      <FieldRow label="Notes"              value={d.notes} />
    </ItemCard>
  ))
}

function PersonalMessages({ data }) {
  if (!data?.length) return <p className="text-muted small">No messages recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 2 }}>
        To: {d.recipient_name}
        {d.relationship && <span className="text-muted fw-normal small ms-2">({d.relationship})</span>}
      </p>
      {d.message && (
        <p style={{ fontStyle: 'italic', color: 'var(--text)', margin: '8px 0', lineHeight: 1.7,
          borderLeft: '3px solid var(--gold)', paddingLeft: 12 }}>
          "{d.message}"
        </p>
      )}
      <FieldRow label="Notes" value={d.notes} />
    </ItemCard>
  ))
}

function SongsThatDefineMe({ data }) {
  if (!data?.length) return <p className="text-muted small">No songs recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 2 }}>{d.title}</p>
      <p className="text-muted small mb-1">{d.artist}{d.album ? ` · ${d.album}` : ''}</p>
      {d.why_meaningful && (
        <p style={{ fontStyle: 'italic', color: 'var(--text)', margin: '6px 0 0',
          borderLeft: '3px solid var(--gold)', paddingLeft: 10, fontSize: '0.9rem' }}>
          "{d.why_meaningful}"
        </p>
      )}
    </ItemCard>
  ))
}

function LifeWishes({ data }) {
  if (!data?.length) return <p className="text-muted small">No wishes recorded.</p>
  const STATUS_COLORS = { dream: '#7c6a4e', planning: '#2D5A3D', completed: '#1A3D28' }
  return data.map(d => (
    <ItemCard key={d.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.title}</span>
        {d.status && (
          <Badge style={{ background: STATUS_COLORS[d.status] || '#888', color: '#fff', fontWeight: 500, textTransform: 'capitalize' }}>
            {d.status}
          </Badge>
        )}
      </div>
      <FieldRow label="Description" value={d.description} />
      <FieldRow label="Category"    value={d.category} />
      <FieldRow label="Notes"       value={d.notes} />
    </ItemCard>
  ))
}

// ---------------------------------------------------------------------------
// Section label map
// ---------------------------------------------------------------------------
const SECTION_CONFIG = {
  legal_documents:   { label: 'Legal Documents',         Component: LegalDocuments,   dataKey: 'legal_documents' },
  financial_items:   { label: 'Financial Affairs',       Component: FinancialItems,   dataKey: 'financial_items' },
  funeral_wishes:    { label: 'Funeral Wishes',          Component: FuneralWishes,    dataKey: 'funeral_wishes' },
  medical_wishes:    { label: 'Medical Wishes',          Component: MedicalWishes,    dataKey: 'medical_wishes' },
  people_to_notify:  { label: 'People to Notify',        Component: PeopleToNotify,   dataKey: 'people_to_notify' },
  property_items:    { label: 'Property & Possessions',  Component: PropertyItems,    dataKey: 'property_items' },
  personal_messages: { label: 'Messages to Loved Ones',  Component: PersonalMessages, dataKey: 'personal_messages' },
  songs_that_define_me: { label: 'Songs That Define Me', Component: SongsThatDefineMe, dataKey: 'songs_that_define_me' },
  life_wishes:       { label: "My Bucket List",          Component: LifeWishes,       dataKey: 'life_wishes' },
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AccessPage() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    axios.get(`${API}/access/${token}`)
      .then(r => setPayload(r.data))
      .catch(err => setError(err.response?.data?.error || 'This link is no longer valid.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  if (error) return (
    <div style={{ maxWidth: 540, margin: '60px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src="/logo.svg" alt="In Good Hands" width="48" height="48" style={{ marginBottom: 12 }} />
        <h4 style={{ color: 'var(--green-900)' }}>In Good Hands</h4>
      </div>
      <Alert variant="danger">{error}</Alert>
    </div>
  )

  const { owner, contact_name, expires_at, visible_sections, data } = payload

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 60px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <img src="/logo.svg" alt="In Good Hands" width="48" height="48" style={{ marginBottom: 10 }} />
        <h3 style={{ color: 'var(--green-900)', marginBottom: 4 }}>In Good Hands</h3>
        <p className="text-muted small">
          Shared information from <strong>{owner.name}</strong>, for <strong>{contact_name}</strong>
        </p>
        <p className="text-muted" style={{ fontSize: '0.78rem' }}>
          This link expires {new Date(expires_at).toLocaleString()}
        </p>
      </div>

      {/* Owner's basic info if present */}
      {(owner.about_me || owner.legacy_message) && (
        <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 10, padding: '16px 20px', marginBottom: 32 }}>
          <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 10 }}>{owner.name}</p>
          {owner.date_of_birth && <FieldRow label="Date of birth" value={owner.date_of_birth} />}
          {owner.about_me && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--green-900)' }}>About me</span>
              <p style={{ marginTop: 4, color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.7 }}>{owner.about_me}</p>
            </div>
          )}
          {owner.legacy_message && (
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--green-900)' }}>A message to you all</span>
              <p style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.7, borderLeft: '3px solid var(--gold)', paddingLeft: 12 }}>
                "{owner.legacy_message}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sections */}
      {visible_sections.map(sectionId => {
        const config = SECTION_CONFIG[sectionId]
        if (!config) return null
        const { label, Component, dataKey } = config
        return (
          <SectionBlock key={sectionId} title={label}>
            <Component data={data[dataKey]} />
          </SectionBlock>
        )
      })}

      <div style={{ textAlign: 'center', marginTop: 48, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <p className="text-muted small">
          This information was shared privately via <strong>In Good Hands</strong>.<br/>
          Please treat it with care and confidentiality.
        </p>
      </div>
    </div>
  )
}
