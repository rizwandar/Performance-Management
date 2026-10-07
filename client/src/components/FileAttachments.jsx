import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export const MAX_FILES_PER_ITEM = 2
// Must match the multer limit on POST /documents/upload (server/routes/documents.js) -
// there's no shared-constants file wiring this to the client build, so keep
// these two numbers in sync by hand if the server limit ever changes.
const MAX_FILE_SIZE_MB = 20

// The account-wide upload allowance, shared by every instance on the page.
//
// There are two separate ceilings on attaching a file and they are easy to
// confuse. MAX_FILES_PER_ITEM is a product decision about one item and is the
// same on every plan. The allowance tracked here is how many files the whole
// account may hold, which is a plan limit (uploaded_documents in
// server/lib/planLimits.js) and became visible to free users on 2026-10-04,
// when the vault sections stopped being Premium-only.
//
// A section page renders one of these per item, so each asking the server for
// the same account-wide total would mean a request per card. They share one
// in-flight promise instead, and it is dropped whenever an upload or a delete
// changes the number, so the next render asks again. Module scope rather than
// a context: the only consumers are the four owner section pages, and a
// provider for one integer would be more wiring than the problem deserves.
let usagePromise = null
const fetchUsage = () => {
  if (!usagePromise) {
    usagePromise = axios
      .get(`${API}/documents/usage`)
      .then(r => r.data)
      // A failed lookup must not block uploading: fall back to "no known
      // limit" and let the server be the one to refuse. Losing the heads-up
      // is a far smaller problem than a widget that will not open.
      .catch(() => ({ used: 0, limit: null }))
  }
  return usagePromise
}
const invalidateUsage = () => { usagePromise = null }

// Shared file-attachment widget for sections that let a user attach a scan or
// photo to an item (e.g. a policy document, a property deed). Files are stored
// in Cloudflare R2, access-controlled via short-lived signed URLs, but not
// additionally encrypted with the vault password - see the Security page for
// the full detail on that distinction.
export default function FileAttachments({ sectionId, itemId, sectionDocs, onUpload, onDelete, vaultPassword }) {
  const attached = sectionDocs.filter(d => d.item_id === itemId)
  const fileRef  = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [upError, setUpError]     = useState('')
  const [usage, setUsage]         = useState(null)

  // Re-read after any change this widget made to the count. The dependency is
  // the attachment count rather than a one-time mount, so uploading here also
  // corrects the figure shown by the other items on the page the next time
  // they render.
  useEffect(() => {
    let live = true
    fetchUsage().then(u => { if (live) setUsage(u) })
    return () => { live = false }
  }, [sectionDocs.length])

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUpError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('section_id', sectionId)
      fd.append('item_id', String(itemId))
      if (vaultPassword) fd.append('vault_password', vaultPassword)
      const r = await axios.post(`${API}/documents/upload`, fd)
      invalidateUsage()
      onUpload(r.data)
    } catch (err) {
      // A refusal on the account allowance is worth re-reading for: the
      // widget evidently thought there was room, so its figure is stale.
      invalidateUsage()
      setUpError(err.response?.data?.error || 'Upload failed. Please try again.')
    }
    setUploading(false)
    // Reset so same file can be re-selected if needed
    e.target.value = ''
  }

  const handleDelete = async (docId) => {
    if (!window.confirm('Remove this attachment?')) return
    try {
      await axios.delete(`${API}/documents/${docId}`, { data: { vault_password: vaultPassword } })
      invalidateUsage()
      onDelete(docId)
    } catch {
      // silently ignore — list will refresh on next load
    }
  }

  // Undecided until the lookup answers, and never a limit while it is null
  // (which is what an uncapped plan reports, matching planLimits.js).
  const accountFull = usage && usage.limit !== null && usage.used >= usage.limit
  const remaining   = usage && usage.limit !== null ? Math.max(0, usage.limit - usage.used) : null

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
                    const r = await axios.post(`${API}/documents/download/${doc.id}`, { vault_password: vaultPassword })
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

      {/* Out of account allowance. Said once here rather than left to the
          upload to refuse, and kept to one quiet line: this sits under an
          individual item, so the wording does not name the paid tier, the
          same restraint PlanLimitNotice uses. */}
      {canUpload && accountFull && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0' }}>
          You have used all {usage.limit} file upload{usage.limit === 1 ? '' : 's'} your plan includes.{' '}
          <Link to="/upgrade" style={{ color: 'var(--green-800)' }}>Upgrade your account</Link>{' '}
          if you would like to add more.
        </p>
      )}

      {canUpload && !accountFull && (
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
            {uploading
              ? 'Uploading...'
              : `+ Attach file${attached.length > 0 ? ` (${MAX_FILES_PER_ITEM - attached.length} remaining` : ` (up to ${MAX_FILES_PER_ITEM}`}, max ${MAX_FILE_SIZE_MB}MB each)`}
          </button>
          {/* The account allowance, shown only while it is the tighter of the
              two ceilings. Repeating it once there is plenty of room would be
              noise on every card in the section. */}
          {remaining !== null && remaining <= MAX_FILES_PER_ITEM && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>
              {remaining} of your {usage.limit} uploads remaining
            </span>
          )}
        </div>
      )}
    </div>
  )
}
