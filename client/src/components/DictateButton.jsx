import { Button } from 'react-bootstrap'

// IDEA-01: pairs with useDictation() - a small "Dictate instead of typing"
// toggle. When the browser doesn't support the Web Speech API (feature-
// detected via the hook's `supported` flag), a user who never sees any
// button at all has no way to tell "not available here" apart from "this
// feature doesn't exist" - so instead of rendering nothing, show a disabled,
// greyed-out button with a "?" and an explanatory title tooltip (found via
// user report 2026-08-25: reproduced in Firefox, which has no Web Speech
// API support at all; Chrome/Edge/Safari are unaffected).
export default function DictateButton({ dictation, size = 'sm', label = 'Dictate instead of typing' }) {
  if (!dictation.supported) {
    return (
      <Button
        size={size}
        variant="outline-secondary"
        disabled
        title="Dictation isn't available in this browser. Try Chrome, Edge, or Safari instead."
      >
        🎤 {label} ❔
      </Button>
    )
  }
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
