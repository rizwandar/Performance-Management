import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Alert, Spinner } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'
import DictateButton from '../../components/DictateButton'
import DictationDisclosure from '../../components/DictationDisclosure'
import { useDictation } from '../../hooks/useDictation'

const API = import.meta.env.VITE_API_URL

// IDEA-30: "Your Last Moments" - a single, weightier recording or letter to
// loved ones, distinct from (not a replacement for) the Messages to Loved
// Ones section, which stays a list of separate messages to different people.
// Reuses IDEA-01's exact recording pipeline (MediaRecorder -> R2 via the
// server) rather than a new one - see MessagesPage.jsx for the original.
const MAX_RECORDING_SECONDS = 300 // 5 minutes, same guardrail as Messages to Loved Ones
const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

// This page deliberately invites a long, "weightier" letter, but the save
// request is still a single JSON PUT - without a client-side ceiling, a long
// dictated or typed letter could exceed the server's request body limit
// (server/index.js) with no warning until Save fails. These limits are set
// with generous headroom under that server limit (256kb), comfortably more
// room than anyone would realistically write in a single letter or note.
const MAX_MESSAGE_CHARS = 20000 // roughly 3,000-4,000 words
const MAX_NOTES_CHARS = 2000

const recordingSupported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined'

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

export default function LastMomentsPage() {
  const navigate = useNavigate()
  const [form, setForm]       = useState({ message: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [hasData, setHasData] = useState(false)

  // Clamped here (not just via the textareas' maxLength below) because
  // dictation writes the field's value directly via setValue, bypassing the
  // native maxLength enforcement a browser only applies to typed/pasted input.
  const dictation = useDictation({
    getValue: () => form.message,
    setValue: v => setForm(f => ({ ...f, message: v.slice(0, MAX_MESSAGE_CHARS) })),
  })
  const notesDictation = useDictation({
    getValue: () => form.notes,
    setValue: v => setForm(f => ({ ...f, notes: v.slice(0, MAX_NOTES_CHARS) })),
  })

  // Voice recording state - same shape as MessagesPage.jsx
  const [recording, setRecording]                   = useState(false)
  const [recordSeconds, setRecordSeconds]            = useState(0)
  const [recordedBlob, setRecordedBlob]              = useState(null)
  const [recordedPreviewUrl, setRecordedPreviewUrl]  = useState(null)
  const [existingAudioUrl, setExistingAudioUrl]      = useState(null)
  const [audioRemoved, setAudioRemoved]              = useState(false)
  const [recordError, setRecordError]                = useState('')
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const streamRef        = useRef(null)
  const timerRef         = useRef(null)
  const secondsRef       = useRef(0)

  useEffect(() => {
    axios.get(`${API}/sections/last-moments`)
      .then(r => {
        if (r.data && (r.data.message || r.data.notes || r.data.audio_url)) {
          setHasData(true)
        }
        setForm({ message: r.data?.message || '', notes: r.data?.notes || '' })
        setExistingAudioUrl(r.data?.audio_url || null)
      })
      .catch(() => setError("We couldn't load this section. Please try again."))
      .finally(() => setLoading(false))
  }, [])

  // Best-effort teardown if the page navigates away mid-recording/dictation.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    dictation.stopDictation()
    notesDictation.stopDictation()
    if (timerRef.current) clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSave = async () => {
    if (!form.message.trim() && !form.notes.trim() && !recordedBlob && !existingAudioUrl) {
      return setError('Please write, dictate, or record something before saving.')
    }
    setError('')
    setSaving(true)
    try {
      await axios.put(`${API}/sections/last-moments`, form)

      if (recordedBlob) {
        const fd = new FormData()
        fd.append('audio', recordedBlob, `recording.${audioExtension(recordedBlob.type)}`)
        fd.append('duration_seconds', String(recordSeconds))
        await axios.post(`${API}/sections/last-moments/audio`, fd)
      } else if (audioRemoved) {
        await axios.delete(`${API}/sections/last-moments/audio`)
      }

      setSuccess('Saved.')
      setHasData(true)
      discardNewRecording()
      setAudioRemoved(false)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      const data = err.response?.data
      // requirePremium sends a stable `error: 'upgrade_required'` sentinel
      // (so callers like ExportPage can branch on it) plus a separate,
      // human-readable `message` - this page was showing the raw sentinel
      // string instead of that message for a non-Premium account.
      setError((data?.error === 'upgrade_required' ? data.message : data?.error) || "We couldn't save this. Please try again.")
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
      </div>
    )
  }

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
        headline="One last thing to say"
        highlight="last thing"
        subtext="A single, lasting recording or letter for the people you love most: the words you'd want them to have in your final moment. This is separate from your other Messages to Loved Ones."
        secondaryAction={<ShareSectionTrigger section="last_moments" sectionLabel="Your Last Moments" />}
      />

      <div className="mb-4">
        {hasData && (
          <div style={{
            background: 'var(--green-50)', border: '1px solid var(--green-100)',
            borderRadius: 8, padding: '10px 16px', fontSize: '0.9rem', color: 'var(--green-800)',
          }}>
            This is saved. Update it any time.
          </div>
        )}
      </div>

      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Form>
        <Form.Group className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <Form.Label className="mb-0" style={{ fontWeight: 600, color: 'var(--green-900)' }}>Your words</Form.Label>
            <DictateButton dictation={dictation} />
          </div>
          <Form.Control
            as="textarea"
            rows={10}
            maxLength={MAX_MESSAGE_CHARS}
            value={form.message}
            onChange={e => setForm({ ...form, message: e.target.value.slice(0, MAX_MESSAGE_CHARS) })}
            placeholder="Whatever you'd want them to hear, one last time."
            style={{ lineHeight: 1.7, fontSize: '0.95rem' }}
          />
          <div className="text-end">
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              {form.message.length.toLocaleString()} / {MAX_MESSAGE_CHARS.toLocaleString()}
            </span>
          </div>
          {dictation.supported && <DictationDisclosure />}
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label style={{ fontWeight: 600, color: 'var(--green-900)', fontSize: '0.9rem' }}>
            Voice recording <span className="text-muted fw-normal small">(optional, in addition to or instead of writing)</span>
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

        <Form.Group className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <Form.Label className="mb-0" style={{ fontWeight: 600, color: 'var(--green-900)', fontSize: '0.9rem' }}>Notes</Form.Label>
            <DictateButton dictation={notesDictation} />
          </div>
          <Form.Control
            as="textarea"
            rows={3}
            maxLength={MAX_NOTES_CHARS}
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value.slice(0, MAX_NOTES_CHARS) })}
            placeholder="Anything else you'd like noted alongside this (optional)"
          />
          <div className="text-end">
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              {form.notes.length.toLocaleString()} / {MAX_NOTES_CHARS.toLocaleString()}
            </span>
          </div>
          {notesDictation.supported && <DictationDisclosure />}
        </Form.Group>

        <div className="d-flex align-items-center gap-3 flex-wrap mb-3">
          <Button variant="primary" onClick={handleSave} disabled={saving || recording}>
            {saving ? 'Saving...' : hasData ? 'Update' : 'Save'}
          </Button>
          <button className="btn btn-link p-0"
            style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
            onClick={() => navigate('/profile')}>
            ← Back to my plans
          </button>
        </div>
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}
        {error   && <Alert variant="danger"  className="mb-4">{error}</Alert>}
      </Form>

      <ShareSectionHistory section="last_moments" />
    </div>
  )
}
