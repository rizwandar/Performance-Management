import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Spinner, Alert, Badge, Button, Modal } from 'react-bootstrap'
import axios from 'axios'
import { formatPhone } from '@in-good-hands/shared/format'

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

// OPS-29: read-only list of uploaded files (a scanned will, a property deed,
// a photo, etc.) attached to a section or a specific item within it. Mirrors
// the pill style FileAttachments.jsx uses on the owner's own section pages,
// minus the upload/delete controls this access-link view has no business
// offering.
function DocumentList({ documents }) {
  if (!documents?.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {documents.map(doc => (
        <a
          key={doc.id}
          href={doc.download_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 6, padding: '3px 8px', fontSize: '0.8rem',
            color: 'var(--green-800)', textDecoration: 'none',
          }}
        >
          <span>📎</span>{doc.original_name}
        </a>
      ))}
    </div>
  )
}

// ── Individual section renderers ───────────────────────────────────────────

// `documents` (OPS-29) is the flat, section-level array attached by the
// server as `data['<section_id>_documents']` - each entry carries the id of
// the item it belongs to, so it's filtered per item here. Never present for
// vault-protected sections (legal_documents, financial_items, property_items).
function itemDocuments(documents, itemId) {
  return documents?.filter(doc => doc.item_id === itemId)
}

function LegalDocuments({ data, documents }) {
  if (!data?.length) return <p className="text-muted small">No legal documents recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>{d.title}</p>
      <FieldRow label="Document type" value={d.document_type} />
      <FieldRow label="Held by"       value={d.held_by} />
      <FieldRow label="Location"      value={d.location} />
      <FieldRow label="Notes"         value={d.notes} />
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

function FinancialItems({ data, documents, countryCode }) {
  if (!data?.length) return <p className="text-muted small">No financial details recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.institution || 'Unnamed'}</span>
        {d.category && <Badge bg={null} style={{ background: 'var(--green-100)', color: 'var(--green-900)', fontWeight: 500 }}>{d.category.replace('_', ' ')}</Badge>}
      </div>
      <FieldRow label="Account type"      value={d.account_type} />
      <FieldRow label="Account reference" value={d.account_reference} />
      <FieldRow label="Contact name"      value={d.contact_name} />
      <FieldRow label="Contact phone"     value={formatPhone(d.contact_phone, countryCode)} />
      <FieldRow label="Notes"             value={d.notes} />
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

function FuneralWishes({ data, documents }) {
  if (!data) return <p className="text-muted small">No funeral wishes recorded.</p>
  return (
    <ItemCard>
      <FieldRow label="Burial preference"  value={data.burial_preference} />
      <FieldRow label="Ceremony type"      value={data.ceremony_type} />
      <FieldRow label="Ceremony location"  value={data.ceremony_location} />
      <FieldRow label="Funeral home"       value={data.funeral_home} />
      <FieldRow label="Pre-paid plan"      value={data.pre_paid_plan ? 'Yes' : 'No'} />
      <FieldRow label="Pre-paid details"   value={data.pre_paid_details} />
      <FieldRow label="Readings"           value={data.readings} />
      <FieldRow label="Flowers / donations" value={data.flowers_preference} />
      <FieldRow label="Donation charity"   value={data.donation_charity} />
      <FieldRow label="Special requests"   value={data.special_requests} />
      <FieldRow label="Additional notes"   value={data.notes} />
      <DocumentList documents={documents} />
    </ItemCard>
  )
}

function MedicalWishes({ data, documents, countryCode }) {
  if (!data) return <p className="text-muted small">No medical wishes recorded.</p>
  return (
    <ItemCard>
      <FieldRow label="Organ donation"          value={data.organ_donation} />
      <FieldRow label="Organ donation details"  value={data.organ_donation_details} />
      <FieldRow label="Advance care directive"  value={data.advance_care_directive ? 'Yes' : 'No'} />
      <FieldRow label="Directive location"      value={data.directive_location} />
      <FieldRow label="DNR preference"          value={data.dnr_preference} />
      <FieldRow label="GP name"                 value={data.gp_name} />
      <FieldRow label="GP phone"                value={formatPhone(data.gp_phone, countryCode)} />
      <FieldRow label="Hospital preference"     value={data.hospital_preference} />
      <FieldRow label="Current medications"     value={data.current_medications} />
      <FieldRow label="Medical conditions"      value={data.medical_conditions} />
      <FieldRow label="Notes"                   value={data.notes} />
      <DocumentList documents={documents} />
    </ItemCard>
  )
}

function PeopleToNotify({ data, documents, countryCode }) {
  if (!data?.length) return <p className="text-muted small">No people to notify recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>{d.name}</p>
      <FieldRow label="Relationship"  value={d.relationship} />
      <FieldRow label="Email"         value={d.email} />
      <FieldRow label="Phone"         value={formatPhone(d.phone, countryCode)} />
      <FieldRow label="Notified by"   value={d.notified_by} />
      <FieldRow label="Notes"         value={d.notes} />
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

function PropertyItems({ data, documents }) {
  if (!data?.length) return <p className="text-muted small">No property or possessions recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.title}</span>
        {d.category && <Badge bg={null} style={{ background: 'var(--green-100)', color: 'var(--green-900)', fontWeight: 500 }}>{d.category.replace('_', ' ')}</Badge>}
      </div>
      <FieldRow label="Description"        value={d.description} />
      <FieldRow label="Location"           value={d.location} />
      <FieldRow label="Intended recipient" value={d.intended_recipient} />
      <FieldRow label="Notes"              value={d.notes} />
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

function PersonalMessages({ data, documents }) {
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
      {d.audio_url && (
        <div style={{ margin: '8px 0' }}>
          <p className="text-muted small mb-1">🎤 Voice message</p>
          <audio controls src={d.audio_url} style={{ width: '100%', maxWidth: 360, height: 36 }} />
        </div>
      )}
      <FieldRow label="Notes" value={d.notes} />
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

function SongsThatDefineMe({ data, documents }) {
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
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

function LifeWishes({ data, documents }) {
  if (!data?.length) return <p className="text-muted small">No wishes recorded.</p>
  const STATUS_COLORS = { dream: '#7c6a4e', planning: '#2D5A3D', completed: '#1A3D28' }
  return data.map(d => (
    <ItemCard key={d.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.title}</span>
        {d.status && (
          <Badge bg={null} style={{ background: STATUS_COLORS[d.status] || '#888', color: '#fff', fontWeight: 500, textTransform: 'capitalize' }}>
            {d.status}
          </Badge>
        )}
      </div>
      <FieldRow label="Description" value={d.description} />
      <FieldRow label="Category"    value={d.category} />
      <FieldRow label="Notes"       value={d.notes} />
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

const DEPENDANT_TYPE_LABELS = {
  child: 'Child', elderly_parent: 'Elderly parent / relative', other: 'Other dependant',
}

function ChildrenDependants({ data, documents }) {
  if (!data?.length) return <p className="text-muted small">No children or dependants recorded.</p>
  return data.map(d => (
    <ItemCard key={d.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--green-900)' }}>{d.name}</span>
        {d.type && (
          <Badge bg={null} style={{ background: 'var(--green-100)', color: 'var(--green-900)', fontWeight: 500 }}>
            {DEPENDANT_TYPE_LABELS[d.type] || d.type}
          </Badge>
        )}
      </div>
      <FieldRow label="Date of birth"          value={d.date_of_birth} />
      <FieldRow label="Special needs / care"    value={d.special_needs} />
      <FieldRow label="Preferred guardian"      value={d.preferred_guardian} />
      <FieldRow label="Their contact details"   value={d.guardian_contact} />
      <FieldRow label="Alternate guardian"      value={d.alternate_guardian} />
      <FieldRow label="Their contact details"   value={d.alternate_contact} />
      <FieldRow label="Notes"                   value={d.notes} />
      <DocumentList documents={itemDocuments(documents, d.id)} />
    </ItemCard>
  ))
}

// ---------------------------------------------------------------------------
// Executor task checklist (IDEA-06) — general starting points shown once an
// executor has confirmed the passing, not legal advice, and not tracked or
// saved anywhere (no backend for this yet, just a reference list to help
// someone who may be doing this for the first time and isn't sure where to
// start). Ordered roughly by urgency.
// ---------------------------------------------------------------------------
const EXECUTOR_CHECKLIST = [
  {
    group: 'In the first few days',
    items: [
      'Request several certified copies of the death certificate. Most institutions below will each need their own copy.',
      'Secure the home and any vehicles, and check on pets or dependants using the Care Instructions and People to Notify sections above.',
      'Contact the funeral home or provider named under Funeral Wishes above, if one was already arranged.',
      'Notify close family and the people listed under People to Notify, if you have not already.',
    ],
  },
  {
    group: 'Within the first couple of weeks',
    items: [
      'Contact the banks, financial institutions, and account holders listed under Financial Affairs above to inform them and ask about next steps.',
      'Notify any insurance providers (life, home, auto) to begin a claim or update the policy.',
      'Redirect or pause mail, and cancel or transfer subscriptions and utility accounts where relevant.',
      'Locate the will and any documents listed under Legal Documents above, and contact the lawyer or firm holding them if one is named.',
    ],
  },
  {
    group: 'When you are ready',
    items: [
      'Ask a lawyer or the local probate court whether formal probate is required. This depends on where they lived and what they owned, and this list is not a substitute for that advice.',
      'Notify government agencies (tax, benefits, motor vehicle registration) as required in your area.',
      'Settle outstanding debts and close remaining accounts once you are authorized to do so.',
    ],
  },
]

function ExecutorChecklist() {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--green-100)', borderRadius: 10, padding: '18px 20px', marginTop: 16 }}>
      <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 4 }}>Getting started as Legacy Contact</p>
      <p className="text-muted small mb-3">
        General starting points for someone acting as Legacy Contact, not legal advice specific to your
        situation. Everything referenced below is available in the sections shared with you further
        down this page.
      </p>
      {EXECUTOR_CHECKLIST.map(({ group, items }) => (
        <div key={group} className="mb-3">
          <p className="small mb-2" style={{ fontWeight: 600, color: 'var(--green-900)' }}>{group}</p>
          <ul className="small mb-0" style={{ paddingLeft: 20, color: 'var(--text)', lineHeight: 1.7 }}>
            {items.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
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
  children_dependants: { label: 'Children & Dependants', Component: ChildrenDependants, dataKey: 'children_dependants' },
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AccessPage() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [payload, setPayload] = useState(null)

  const [showConfirm, setShowConfirm] = useState(false)
  const [confirming, setConfirming]   = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [markedDemised, setMarkedDemised] = useState(false)

  useEffect(() => {
    axios.get(`${API}/access/${token}`)
      .then(r => {
        setPayload(r.data)
        // An executor may revisit this link over several days (funerals often
        // happen within days of the confirmation), so a fresh page load should
        // still show the thank-you state and checklist rather than prompting
        // them to reconfirm something already done.
        if (r.data.owner?.is_deceased) setMarkedDemised(true)
      })
      .catch(err => setError(err.response?.data?.error || 'This link is no longer valid.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleConfirmDemised = async () => {
    setConfirming(true)
    setConfirmError('')
    try {
      await axios.post(`${API}/access/${token}/mark-demised`, { confirm: true })
      setMarkedDemised(true)
      setShowConfirm(false)
    } catch (err) {
      setConfirmError(err.response?.data?.error || "We couldn't complete this. Please try again.")
    }
    setConfirming(false)
  }

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

  const { owner, contact_name, expires_at, visible_sections, data, is_executor, can_confirm_demise } = payload

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
          {expires_at
            ? `This link expires ${new Date(expires_at).toLocaleString()}`
            : 'This link does not expire.'}
        </p>
      </div>

      {is_executor && (
        <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-800)', borderRadius: 10, padding: '18px 20px', marginBottom: 32 }}>
          {!can_confirm_demise ? (
            <>
              <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 6 }}>
                You are {owner.name}'s Legacy Contact
              </p>
              <p className="text-muted small mb-0">
                This is a preview link so you have what you need on hand, for funeral and other
                practical arrangements, without waiting. You can see everything {owner.name}{' '}
                recorded here, except their private vault credentials, which are never shared
                this way. This link is for your reference only and can't be used to report a
                passing. If {owner.name} doesn't log in for their configured period, or if
                someone lets us know they've passed away, you'll receive a separate link that
                also lets you confirm what's happened.
              </p>
            </>
          ) : markedDemised ? (
            <>
              <Alert variant="success" className="mb-0">
                Thank you. We've let {owner.name}'s other trusted contacts and the people they
                asked to be told know. This link will remain available to you.
              </Alert>
              <ExecutorChecklist />
            </>
          ) : (
            <>
              <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 6 }}>
                You are {owner.name}'s Legacy Contact
              </p>
              <p className="text-muted small mb-3">
                You can see everything {owner.name} recorded here, except their private vault
                credentials, which are never shared this way. If you have confirmed that
                {' '}{owner.name} has passed away, use the button below to let us know. This will
                notify their other trusted contacts and the people they asked to be told,
                according to their wishes.
              </p>
              {confirmError && <Alert variant="danger" className="py-2">{confirmError}</Alert>}
              <Button variant="danger" size="sm" onClick={() => setShowConfirm(true)}>
                Mark as demised
              </Button>
            </>
          )}
        </div>
      )}

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
            <Component
              data={data[dataKey]}
              documents={data[`${sectionId}_documents`]}
              countryCode={owner.country_code}
            />
          </SectionBlock>
        )
      })}

      <div style={{ textAlign: 'center', marginTop: 48, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <p className="text-muted small">
          This information was shared privately via <strong>In Good Hands</strong>.<br/>
          Please treat it with care and confidentiality.
        </p>
      </div>

      <Modal show={showConfirm} onHide={() => setShowConfirm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>Confirm: mark {owner.name} as deceased</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            This will notify {owner.name}'s other trusted contacts (giving them access to the
            sections shared with them) and send a notice to the people they asked to be told.
            This cannot be undone by you once confirmed.
          </p>
          {confirmError && <Alert variant="danger" className="mb-0">{confirmError}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmDemised} disabled={confirming}>
            {confirming ? 'Confirming…' : 'Yes, mark as demised'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
