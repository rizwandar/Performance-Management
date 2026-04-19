import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Alert, Spinner, InputGroup, Form } from 'react-bootstrap'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function SongsThatDefineMePage() {
  const navigate = useNavigate()
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [success, setSuccess] = useState('')

  // Search state (shown inline on the page, not in a modal)
  const [query, setQuery]                   = useState('')
  const [searching, setSearching]           = useState(false)
  const [artistResults, setArtistResults]   = useState([])
  const [selectedArtist, setSelectedArtist] = useState(null)
  const [artistTracks, setArtistTracks]     = useState([])
  const [loadingTracks, setLoadingTracks]   = useState(false)
  const [searchError, setSearchError]       = useState('')
  const [saving, setSaving]                 = useState(false)

  const searchTimeout = useRef(null)

  const load = () => {
    setLoading(true)
    setLoadError(false)
    axios.get(`${API}/sections/songs-that-define-me`)
      .then(r => setItems(r.data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // ── Artist search (debounced) ────────────────────────────────────────────────
  const handleQueryChange = (val) => {
    setQuery(val)
    setSearchError('')
    setArtistResults([])
    setSelectedArtist(null)
    setArtistTracks([])
    clearTimeout(searchTimeout.current)
    if (!val.trim()) return
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await axios.get(`${API}/deezer/artists?q=${encodeURIComponent(val)}`)
        setArtistResults(r.data)
        if (!r.data.length) setSearchError('No artists found. Try a different name.')
      } catch {
        setSearchError('Search failed. Please check your connection and try again.')
      }
      setSearching(false)
    }, 400)
  }

  const selectArtist = async (artist) => {
    setSelectedArtist(artist)
    setArtistResults([])
    setArtistTracks([])
    setLoadingTracks(true)
    setSearchError('')
    try {
      const r = await axios.get(`${API}/deezer/artist/${artist.id}/tracks`)
      setArtistTracks(r.data)
      if (!r.data.length) setSearchError('No tracks found for this artist.')
    } catch {
      setSearchError("Couldn't load songs for this artist. Please try again.")
    }
    setLoadingTracks(false)
  }

  const addSong = async (track) => {
    if (items.length >= 60) return
    // Prevent duplicates
    if (items.some(i => i.deezer_id === track.deezer_id)) {
      setSearchError(`"${track.title}" is already in your list.`)
      return
    }
    setSaving(true)
    setSearchError('')
    try {
      await axios.post(`${API}/sections/songs-that-define-me`, {
        deezer_id: track.deezer_id,
        title:     track.title,
        artist:    track.artist,
        album:     track.album,
      })
      setSuccess(`"${track.title}" added.`)
      setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (err) {
      setSearchError(err.response?.data?.error || "Couldn't add this song. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this song from your list?')) return
    try {
      await axios.delete(`${API}/sections/songs-that-define-me/${id}`)
      load()
    } catch {
      setSearchError("Couldn't remove this song. Please try again.")
    }
  }

  const clearSearch = () => {
    setQuery('')
    setArtistResults([])
    setSelectedArtist(null)
    setArtistTracks([])
    setSearchError('')
    clearTimeout(searchTimeout.current)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
        <h3 style={{ color: 'var(--green-900)' }}>🎵 Songs That Define Me</h3>
        <p className="text-muted">
          Music tells a story words can't always reach. Search for an artist or band below
          and pick the songs that have shaped who you are. Up to 60 songs.
        </p>
      </div>

      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

      {/* ── Search panel ────────────────────────────────────────────────────── */}
      {items.length < 60 && (
        <div style={{
          background: 'var(--parchment)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 28,
        }}>
          <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 12 }}>
            Search for an artist or band
          </p>

          <InputGroup className="mb-2">
            <Form.Control
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="e.g. Queen, The Beatles, Adele, Coldplay…"
              style={{ borderRadius: '6px 0 0 6px' }}
            />
            {searching && (
              <InputGroup.Text><Spinner size="sm" animation="border" /></InputGroup.Text>
            )}
            {query && !searching && (
              <Button variant="outline-secondary" onClick={clearSearch}>✕</Button>
            )}
          </InputGroup>

          {searchError && <p className="text-danger small mb-2">{searchError}</p>}

          {/* Artist results */}
          {artistResults.length > 0 && !selectedArtist && (
            <div style={{
              border: '1px solid var(--border)', borderRadius: 8,
              background: '#fff', overflow: 'hidden', marginBottom: 8,
            }}>
              <p className="text-muted small px-3 pt-2 mb-1">Select an artist:</p>
              {artistResults.map(a => (
                <div key={a.id} onClick={() => selectArtist(a)}
                  style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--green-50)'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  {a.picture_small && (
                    <img src={a.picture_small} alt={a.name}
                      style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600 }}>{a.name}</span>
                  {a.nb_album > 0 && <span className="text-muted small ms-1">· {a.nb_album} albums</span>}
                </div>
              ))}
            </div>
          )}

          {/* Selected artist + their tracks */}
          {selectedArtist && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {selectedArtist.picture_small && (
                  <img src={selectedArtist.picture_small} alt={selectedArtist.name}
                    style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                )}
                <span style={{ fontWeight: 700, color: 'var(--green-900)', fontSize: '1rem' }}>{selectedArtist.name}</span>
                <button className="btn btn-link btn-sm p-0 ms-auto"
                  style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                  onClick={clearSearch}>
                  ✕ Change artist
                </button>
              </div>

              {loadingTracks ? (
                <div className="text-center py-3">
                  <Spinner size="sm" animation="border" style={{ color: 'var(--green-800)' }} />
                  <span className="text-muted small ms-2">Loading tracks…</span>
                </div>
              ) : artistTracks.length > 0 ? (
                <>
                  <p className="text-muted small mb-1">{artistTracks.length} songs, A to Z. Click to add:</p>
                  <div style={{
                    maxHeight: 280, overflowY: 'auto',
                    border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
                  }}>
                    {artistTracks.map(t => {
                      const alreadyAdded = items.some(i => i.deezer_id === t.deezer_id)
                      return (
                        <div key={t.deezer_id}
                          onClick={() => !alreadyAdded && !saving && addSong(t)}
                          style={{
                            padding: '9px 14px', borderBottom: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            cursor: alreadyAdded ? 'default' : 'pointer',
                            opacity: alreadyAdded ? 0.5 : 1,
                          }}
                          onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = 'var(--green-50)' }}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <div>
                            <span style={{ fontWeight: 500, fontSize: '0.92rem' }}>{t.title}</span>
                            {t.album && <span className="text-muted small ms-2">· {t.album}</span>}
                          </div>
                          {alreadyAdded
                            ? <span style={{ fontSize: '0.78rem', color: 'var(--green-700)' }}>✓ Added</span>
                            : <span style={{ fontSize: '0.78rem', color: 'var(--green-700)' }}>+ Add</span>
                          }
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ── Song list ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-4"><Spinner animation="border" style={{ color: 'var(--green-800)' }} /></div>
      ) : loadError ? (
        <div className="section-placeholder">
          <p className="text-muted small">Couldn't load your songs right now. Please refresh the page.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🎵</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No songs added yet</p>
          <p className="text-muted small mb-0">Search for an artist above and click any song to add it to your list.</p>
        </div>
      ) : (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 style={{ color: 'var(--green-900)', margin: 0 }}>Your songs</h6>
            <span className="text-muted small">{items.length} / 60</span>
          </div>
          {items.map(item => (
            <div key={item.id} className="section-card">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--green-900)', marginBottom: 1 }}>{item.title}</p>
                  <p className="text-muted small mb-0">
                    {item.artist}{item.album ? ` · ${item.album}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      )}

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
