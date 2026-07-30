import { useRef, useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export const MAX_FILES_PER_ITEM = 2

// Shared file-attachment widget for premium sections that let a user attach
// a scan/photo to an item (e.g. a policy document, a property deed). Files
// are stored in Cloudflare R2, access-controlled via short-lived signed
// URLs, but not additionally encrypted with the vault password - see the
// Security page for the full detail on that distinction.
export default function FileAttachments({ sectionId, itemId, sectionDocs, onUpload, onDelete, vaultPassword }) {
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
      fd.append('section_id', sectionId)
      fd.append('item_id', String(itemId))
      if (vaultPassword) fd.append('vault_password', vaultPassword)
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
      await axios.delete(`${API}/documents/${docId}`, { data: { vault_password: vaultPassword } })
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
