import { Button } from 'react-bootstrap'

// IDEA-01: pairs with useDictation() - a small "Dictate instead of typing"
// toggle. Renders nothing at all if the browser doesn't support the Web
// Speech API (feature-detected via the hook's `supported` flag), rather than
// showing a button that would just silently do nothing when clicked.
export default function DictateButton({ dictation, size = 'sm', label = 'Dictate instead of typing' }) {
  if (!dictation.supported) return null
  return (
    <Button
      size={size}
      variant={dictation.dictating ? 'danger' : 'outline-secondary'}
      onClick={dictation.toggleDictation}
    >
      {dictation.dictating ? '⏹ Stop dictating' : `🎤 ${label}`}
    </Button>
  )
}
