import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Row, Col, Alert, Modal, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'

const API = import.meta.env.VITE_API_URL

const empty = { recipient_name: '', relationship: '', message: '' }

// IDEA-01 -------------------------------------------------------------------
// Two additional ways to leave a message, alongside typing: dictate it (Web
// Speech API, converts speech to text in the textarea) and/or record an
// actual voice clip (MediaRecorder, uploaded to R2 via the server). Either,
// both, or neither - a message can be text-only, audio-only, or both.
const MAX_RECORDING_SECONDS = 300 // 5 minutes - keeps individual clips small; storage isn't premium-gated so this is the guardrail
const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

const speechSupported     = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
const recordingSupported  = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined'

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return RECORDER_MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

function audioExtension(mimeType) {
  const base = (mimeType || '').split(';')[0]
  if (base.includes('mp4')) return 'mp4'
  if (base.includes('ogg')) return 'ogg'
  if (base.includes('wav')) return 'wav'
  return 'webm'
}

function formatSeconds(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function MessagesPage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [pendingId, setPendingId] = useState(null) // id of a just-created row, so a failed audio step can retry without duplicating the text row
  const [form, setForm]           = useState(empty)
  const [expanded, setExpanded]   = useState(null) // id of message shown in full

  // Dictation state
  const [dictating, setDictating] = useState(false)
  const recognitionRef = useRef(null)

  // Voice message state
  const [recording, setRecording]                 = useState(false)
  const [recordSeconds, setRecordSeconds]          = useState(0)
  const [recordedBlob, setRecordedBlob]            = useState(null)
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState(null)
  const [existingAudioUrl, setExistingAudioUrl]    = useState(null)
  const [audioRemoved, setAudioRemoved]            = useState(false)
  const [recordError, setRecordError]              = useState('')
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const streamRef        = useRef(null)
  const timerRef         = useRef(null)
  const secondsRef       = useRef(0)

  const load = () => {
    setLoading(true)
    axios.get(`${API}/sections/messages`)
      .then(r => setItems(r.data))
      .catch(() => setError("We couldn't load your messages. Please try again."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Best-effort teardown if the page navigates away mid-recording/dictation.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    recognitionRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setRecording(false)
  }

  const startRecording = async () => {
    setRecordError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickRecorderMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
        setRecordedBlob(blob)
        setRecordedPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
        })
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      secondsRef.current = 0
      setRecordSeconds(0)
      setRecording(true)
      timerRef.current = setInterval(() => {
        secondsRef.current += 1
        setRecordSeconds(secondsRef.current)
        if (secondsRef.current >= MAX_RECORDING_SECONDS) stopRecording()
      }, 1000)
    } catch {
      setRecordError("We couldn't access your microphone. Please check your browser's permission settings.")
    }
  }

  const discardNewRecording = () => {
    setRecordedPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setRecordedBlob(null)
    setRecordSeconds(0)
    secondsRef.current = 0
  }

  const removeExistingAudio = () => {
    setExistingAudioUrl(null)
    setAudioRemoved(true)
  }

  const resetAudioState = () => {
    if (recording) stopRecording()
    setRecordedPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setRecordedBlob(null)
    setRecordSeconds(0)
    secondsRef.current = 0
    setRecordError('')
    setAudioRemoved(false)
    setExistingAudioUrl(null)
    setPendingId(null)
  }

  const toggleDictation = () => {
    if (dictating) {
      recognitionRef.current?.stop()
      return
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = navigator.language || 'en-US'
    recognition.onresult = (e) => {
      let finalText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript
      }
      if (finalText.trim()) {
        setForm(f => ({ ...f, message: (f.message ? f.message.trim() + ' ' : '') + finalText.trim() }))
      }
    }
    recognition.onerror = () => setDictating(false)
    recognition.onend = () => setDictating(false)
    recognitionRef.current = recognition
    recognition.start()
    setDictating(true)
  }

  const closeModal = () => {
    recognitionRef.current?.stop()
    setDictating(false)
    resetAudioState()
    setShowModal(false)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(empty)
    setError('')
    resetAudioState()
    setShowModal(true)
  }
  const openEdit = item => {
    setEditing(item)
    setForm({
      recipient_name: item.recipient_name || '',
      relationship:   item.relationship   || '',
      message:        item.message        || '',
    })
    setError('')
    resetAudioState()
    setExistingAudioUrl(item.audio_url || null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.recipient_name.trim()) return setError("Please enter the recipient's name.")
    setError('')
    setSaving(true)
    const isNew = !editing && !pendingId
    try {
      let id = editing?.id ?? pendingId
      if (id) {
        await axios.put(`${API}/sections/messages/${id}`, form)
      } else {
        const res = await axios.post(`${API}/sections/messages`, form)
        id = res.data.id
        setPendingId(id)
      }

      if (recordedBlob) {
        const fd = new FormData()
        fd.append('audio', recordedBlob, `recording.${audioExtension(recordedBlob.type)}`)
        fd.append('duration_seconds', String(recordSeconds))
        await axios.post(`${API}/sections/messages/${id}/audio`, fd)
      } else if (audioRemoved) {
        await axios.delete(`${API}/sections/messages/${id}/audio`)
      }

      setShowModal(false)
      setSuccess(isNew ? 'Message saved.' : 'Message updated.')
      resetAudioState()
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save this message. Please try again.")
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return
    try {
      await axios.delete(`${API}/sections/messages/${id}`)
      load()
    } catch {
      setError("We couldn't delete this message. Please try again.")
    }
  }

  const PREVIEW_LENGTH = 160

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
      </div>

      <SectionHero
        eyebrow="Your Legacy"
        headline="The words they'll hold onto"
        highlight="hold onto"
        subtext="Write, dictate, or record the words you want them to hear. These messages will be kept safely and passed on to the people who matter most to you."
        cta={{ label: '+ Write a message', onClick: openAdd }}
        secondaryAction={<ShareSectionTrigger section="personal_messages" sectionLabel="Messages to Loved Ones" />}
      />

      {success && <Alert variant="success">{success}</Alert>}
      {error && !showModal && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="section-placeholder">
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>💌</p>
          <p className="mb-1" style={{ fontWeight: 600 }}>No messages written yet</p>
          <p className="text-muted small mb-0">
            Write personal letters or notes for the people you love.
            They'll be kept safely until the time comes.
          </p>
        </div>
      ) : (
        <div>
          {items.map(item => {
            const isExpanded = expanded === item.id
            const isLong = item.message && item.message.length > PREVIEW_LENGTH
            return (
              <div key={item.id} className="section-card">
                <div className="d-flex justify-content-between align-items-start">
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, color: 'var(--green-900)', marginBottom: 2, fontSize: '1.05rem' }}>
                      To {item.recipient_name}
                      {item.relationship && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.9rem' }}>
                          ({item.relationship})
                        </span>
                      )}
                    </p>
                    {item.message && (
                      <div>
                        <p className="text-muted small mb-1" style={{ fontStyle: 'italic', lineHeight: 1.6 }}>
                          {isExpanded || !isLong
                            ? item.message
                            : item.message.slice(0, PREVIEW_LENGTH) + '…'}
                        </p>
                        {isLong && (
                          <button className="btn btn-link p-0"
                            style={{ fontSize: '0.8rem', color: 'var(--green-800)' }}
                            onClick={() => setExpanded(isExpanded ? null : item.id)}>
                            {isExpanded ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    )}
                    {item.audio_url && (
                      <div className="mt-2">
                        <p className="text-muted small mb-1">🎤 Voice message</p>
                        <audio controls src={item.audio_url} style={{ width: '100%', maxWidth: 360, height: 36 }} />
                      </div>
                    )}
                  </div>
                  <div className="d-flex gap-2 ms-3 flex-shrink-0">
                    <Button size="sm" variant="outline-primary" onClick={() => openEdit(item)}>Edit</Button>
                    <Button size="sm" variant="outline-danger" onClick={() => handleDelete(item.id)}>Delete</Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal show={showModal} onHide={closeModal} centered size="lg">
        <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
          <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
            {editing ? `Edit message to ${editing.recipient_name}` : 'Write a message'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>To <span style={{ color: 'var(--danger)' }}>*</span></Form.Label>
                <Form.Control value={form.recipient_name}
                  onChange={e => setForm({ ...form, recipient_name: e.target.value })}
                  placeholder="Name of the person this is for" />
              </Col>
              <Col md={6}>
                <Form.Label>Their relationship to you</Form.Label>
                <Form.Control value={form.relationship}
                  onChange={e => setForm({ ...form, relationship: e.target.value })}
                  placeholder="e.g. My daughter, my closest friend" />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <Form.Label className="mb-0">Your message</Form.Label>
                {speechSupported && (
                  <Button size="sm" variant={dictating ? 'danger' : 'outline-secondary'} onClick={toggleDictation}>
                    {dictating ? '⏹ Stop dictating' : '🎤 Dictate instead of typing'}
                  </Button>
                )}
              </div>
              <Form.Control
                as="textarea"
                rows={8}
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                placeholder="Write whatever is in your heart. There are no rules here."
                style={{ lineHeight: 1.7, fontSize: '0.95rem' }}
              />
              {speechSupported && (
                <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Dictation uses your browser's built-in speech recognition, which may send your voice to your browser or device vendor for processing.
                </Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                Voice message <span className="text-muted fw-normal small">(optional, in addition to or instead of writing)</span>
              </Form.Label>
              {recordError && <Alert variant="warning" className="py-2 small mb-2">{recordError}</Alert>}

              {!recordingSupported ? (
                <p className="text-muted small mb-0">Voice recording isn't supported in this browser.</p>
              ) : recording ? (
                <div className="d-flex align-items-center gap-2">
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc3545', display: 'inline-block' }} />
                  <span className="small">Recording… {formatSeconds(recordSeconds)}</span>
                  <Button size="sm" variant="outline-danger" onClick={stopRecording}>⏹ Stop</Button>
                </div>
              ) : recordedPreviewUrl ? (
                <div>
                  <audio controls src={recordedPreviewUrl} style={{ width: '100%', maxWidth: 360, height: 36 }} />
                  <div className="d-flex gap-2 mt-2">
                    <Button size="sm" variant="outline-secondary" onClick={() => { discardNewRecording(); startRecording(); }}>
                      🔁 Re-record
                    </Button>
                    <Button size="sm" variant="outline-danger" onClick={discardNewRecording}>🗑 Discard</Button>
                  </div>
                </div>
              ) : existingAudioUrl ? (
                <div>
                  <audio controls src={existingAudioUrl} style={{ width: '100%', maxWidth: 360, height: 36 }} />
                  <div className="d-flex gap-2 mt-2">
                    <Button size="sm" variant="outline-secondary" onClick={startRecording}>🔁 Re-record</Button>
                    <Button size="sm" variant="outline-danger" onClick={removeExistingAudio}>🗑 Remove</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline-secondary" onClick={startRecording}>🎙️ Record a voice message</Button>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="outline-secondary" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || recording}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Save message'}
          </Button>
        </Modal.Footer>
      </Modal>

      {success && <Alert variant="success" className="mt-4">{success}</Alert>}
      {error && !showModal && <Alert variant="danger" className="mt-4">{error}</Alert>}

      <ShareSectionHistory section="personal_messages" />

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
