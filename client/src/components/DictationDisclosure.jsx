import { Form } from 'react-bootstrap'

// Shared copy for every dictation-capable field - kept in one place so the
// wording (and any future legal/privacy revision to it) doesn't drift
// between the growing number of fields that use useDictation()/DictateButton.
export default function DictationDisclosure() {
  return (
    <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
      Dictation uses your browser's built-in speech recognition, which may send your voice to your browser or device vendor for processing.
    </Form.Text>
  )
}
