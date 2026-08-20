import { useRef, useState } from 'react'

// IDEA-01: dictate any single text field via the browser's built-in Web
// Speech API instead of typing. Originally built inline for Messages to
// Loved Ones; pulled out here so the same behavior can be reused across
// every other free-text field that wants it, without copy-pasting the
// recognizer wiring into each page.
export const speechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)

// `getValue`/`setValue` read and write the field this dictation instance is
// bound to - kept as functions (not a raw value/setter pair) so callers with
// a single shared `form` object can point multiple independent dictation
// instances at different keys of the same state without them stepping on
// each other's base text.
export function useDictation({ getValue, setValue }) {
  const [dictating, setDictating] = useState(false)
  const recognitionRef = useRef(null)
  // Whatever was already in the field when dictation started (typed text, or
  // text left over from a previous dictation session) - re-prepended on
  // every result event below, not appended to, since e.results/live interim
  // results represent the FULL transcript-so-far, not an incremental delta.
  const baseRef = useRef('')

  const toggleDictation = () => {
    if (dictating) {
      recognitionRef.current?.stop()
      return
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true // live transcription as the user speaks, not just after they stop
    recognition.lang = navigator.language || 'en-US'
    const current = getValue() || ''
    baseRef.current = current.trim() ? current.trim() + ' ' : ''
    recognition.onresult = (e) => {
      // e.results accumulates for the whole session (not just this event),
      // so walking it from the start every time and overwriting the field
      // is simpler and safer than trying to append incrementally - interim
      // entries keep changing in place as the recognizer firms up its
      // guess, right up until each one's isFinal flips true.
      let finalTranscript = '', interimTranscript = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript
        else interimTranscript += e.results[i][0].transcript
      }
      setValue(baseRef.current + finalTranscript + interimTranscript)
    }
    recognition.onerror = () => setDictating(false)
    recognition.onend = () => setDictating(false)
    recognitionRef.current = recognition
    recognition.start()
    setDictating(true)
  }

  const stopDictation = () => recognitionRef.current?.stop()

  return { dictating, toggleDictation, stopDictation, supported: speechSupported }
}
