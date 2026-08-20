import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Alert, Spinner, OverlayTrigger, Popover } from 'react-bootstrap'
import axios from 'axios'
import SectionHero from '../../components/SectionHero'
import ShareSectionTrigger from '../../components/ShareSectionTrigger'
import ShareSectionHistory from '../../components/ShareSectionHistory'
import DictateButton from '../../components/DictateButton'
import DictationDisclosure from '../../components/DictationDisclosure'
import { useDictation } from '../../hooks/useDictation'

const API = import.meta.env.VITE_API_URL

// The blank-page problem: these two fields ask something genuinely hard
// ("what did you stand for") with no structure to lean on, unlike a field
// that just asks for a name or date. A '?' icon opening a few starting
// angles is meant to unstick someone staring at an empty box, not replace
// the one-line description already under each heading. No tooltip/popover
// pattern existed anywhere in the app before this (IDEA-17) - kept local to
// this file since it's the only place using it so far; worth promoting to a
// shared component if a second field wants one later.
function HelpIcon({ title, children }) {
  return (
    <OverlayTrigger
      trigger={['click', 'focus']}
      placement="right"
      rootClose
      overlay={
        <Popover style={{ maxWidth: 320 }}>
          <Popover.Header as="h6">{title}</Popover.Header>
          <Popover.Body style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {children}
          </Popover.Body>
        </Popover>
      }
    >
      <button
        type="button"
        aria-label={`Help: ${title}`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--border)',
          background: 'var(--parchment-dark, #EDE9DF)', color: 'var(--text-muted)',
          fontSize: '0.72rem', fontWeight: 700, marginLeft: 6, cursor: 'pointer',
          verticalAlign: 'middle', lineHeight: 1, padding: 0,
        }}
      >
        ?
      </button>
    </OverlayTrigger>
  )
}

export default function HowToBeRememberedPage() {
  const navigate = useNavigate()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [form, setForm] = useState({
    life_story:     '',
    about_me:       '',
    remembered_for: '',
    legacy_message: '',
  })

  useEffect(() => {
    axios.get(`${API}/users/me`)
      .then(r => {
        const u = r.data
        setForm({
          life_story:     u.life_story     || '',
          about_me:       u.about_me       || '',
          remembered_for: u.remembered_for || '',
          legacy_message: u.legacy_message || '',
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  // One independent dictation instance per field, so dictating into one
  // doesn't affect (or need to remember) the state of any other.
  const lifeStoryDictation     = useDictation({ getValue: () => form.life_story,     setValue: v => setForm(f => ({ ...f, life_story: v })) })
  const guidingWordsDictation  = useDictation({ getValue: () => form.about_me,       setValue: v => setForm(f => ({ ...f, about_me: v })) })
  const rememberedForDictation = useDictation({ getValue: () => form.remembered_for, setValue: v => setForm(f => ({ ...f, remembered_for: v })) })
  const legacyMessageDictation = useDictation({ getValue: () => form.legacy_message, setValue: v => setForm(f => ({ ...f, legacy_message: v })) })

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await axios.put(`${API}/users/me`, form)
      setSuccess('Saved.')
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't save your changes. Please try again.")
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="text-center py-5">
      <Spinner animation="border" style={{ color: 'var(--green-800)' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="mb-4">
        <button className="btn btn-link p-0 mb-2"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>← Back to my plans</button>
      </div>

      <SectionHero
        eyebrow="Your Legacy"
        headline="Your story, in your own words"
        highlight="own words"
        subtext="The most personal part of your plans. These words will help the people you love understand who you were, what you stood for, and how you'd like to be remembered."
        secondaryAction={<ShareSectionTrigger section="how_to_be_remembered" sectionLabel="How I'd Like to Be Remembered" />}
      />

      {success && <Alert variant="success">{success}</Alert>}
      {error   && <Alert variant="danger">{error}</Alert>}

      {/* My Life Story */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 style={{ color: 'var(--green-900)', marginBottom: 0 }}>My Life Story</h6>
          <DictateButton dictation={lifeStoryDictation} />
        </div>
        <p className="text-muted small mb-3">
          A biography in your own words: where you grew up, what shaped you, the chapters of your life.
          Write as much or as little as you like.
        </p>
        <Form.Control
          as="textarea" rows={7}
          value={form.life_story}
          onChange={set('life_story')}
          placeholder="I was born in... I grew up... The things that shaped me most were..."
          style={{ lineHeight: 1.8 }}
        />
        {lifeStoryDictation.supported && <DictationDisclosure />}
      </div>

      {/* Life's motto */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 style={{ color: 'var(--green-900)', marginBottom: 0 }}>
            My Guiding Words
            <HelpIcon title="Not sure where to start?">
              Think about: a phrase your family always associated with you, words you'd want on a
              plaque, advice you gave often, or a lesson life taught you the hard way. It doesn't
              need to be original or polished, just true to you.
            </HelpIcon>
          </h6>
          <DictateButton dictation={guidingWordsDictation} />
        </div>
        <p className="text-muted small mb-3">
          A motto, a belief, a quote, or a few words that capture how you tried to live.
        </p>
        <Form.Control
          as="textarea" rows={2}
          value={form.about_me}
          onChange={set('about_me')}
          placeholder="e.g. 'Be kind, always.' or 'Live fully, love deeply, leave it better than you found it.'"
        />
        {guidingWordsDictation.supported && <DictationDisclosure />}
      </div>

      {/* How I'd like to be remembered */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 20, border: '1px solid var(--border)' }}>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 style={{ color: 'var(--green-900)', marginBottom: 0 }}>
            How I'd Like to Be Remembered
            <HelpIcon title="A few angles to consider">
              What impact did you have on the people around you? What would you want your
              grandchildren, or their grandchildren, to know about you? What's a moment you're most
              proud of, quietly or otherwise?
            </HelpIcon>
          </h6>
          <DictateButton dictation={rememberedForDictation} />
        </div>
        <p className="text-muted small mb-3">
          What do you hope people will say about you? What did you stand for? What are you proudest of?
        </p>
        <Form.Control
          as="textarea" rows={4}
          value={form.remembered_for}
          onChange={set('remembered_for')}
          placeholder="I hope people remember me as someone who... I'm proudest of... What I valued most was..."
          style={{ lineHeight: 1.8 }}
        />
        {rememberedForDictation.supported && <DictationDisclosure />}
      </div>

      {/* Message to leave behind */}
      <div style={{ background: 'var(--parchment)', borderRadius: 12, padding: '24px', marginBottom: 24, border: '1px solid var(--border)' }}>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 style={{ color: 'var(--green-900)', marginBottom: 0 }}>A Message to Leave Behind</h6>
          <DictateButton dictation={legacyMessageDictation} />
        </div>
        <p className="text-muted small mb-3">
          A final message to everyone you love. Write from the heart. There are no rules here.
        </p>
        <Form.Control
          as="textarea" rows={6}
          value={form.legacy_message}
          onChange={set('legacy_message')}
          placeholder="To everyone I love... Thank you for... I want you to know..."
          style={{ lineHeight: 1.8 }}
        />
        {legacyMessageDictation.supported && <DictationDisclosure />}
        <Form.Text className="text-muted d-block">This is included in your PDF export.</Form.Text>
      </div>

      <div className="d-flex align-items-center gap-3 flex-wrap">
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <button className="btn btn-link p-0"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}
          onClick={() => navigate('/profile')}>
          ← Back to my plans
        </button>
      </div>
      {success && <Alert variant="success" className="mt-3">{success}</Alert>}
      {error   && <Alert variant="danger"  className="mt-3">{error}</Alert>}

      <ShareSectionHistory section="how_to_be_remembered" />
    </div>
  )
}
