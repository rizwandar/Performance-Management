import { Modal, Button } from 'react-bootstrap'
import { useVaultSession } from '../context/VaultSessionContext'

// SEC-15: rendered once at the app root. Shows 2 minutes before the shared
// vault unlock session expires (minute 28 of the fixed 30-minute session).
// Extending resets to a fresh 30/2-minute pair. Declining, or letting it go
// unanswered, lets the session lapse: the vault re-locks and the next visit
// to any vault-protected section re-prompts for the vault password. This
// never signs the user out of the rest of the app.
export default function VaultSessionExtendPrompt() {
  const { showExtendPrompt, extendVaultSession, lockVault } = useVaultSession()

  return (
    <Modal show={showExtendPrompt} onHide={lockVault} centered backdrop="static">
      <Modal.Header closeButton style={{ background: 'var(--green-50)', borderBottom: '1px solid var(--green-100)' }}>
        <Modal.Title style={{ color: 'var(--green-900)', fontSize: '1.1rem' }}>
          Your vault session is about to expire
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ marginBottom: 0 }}>
          For your security, your unlocked vault sections (Digital Life, Legal Documents,
          Financial Affairs, Property &amp; Possessions, and Household Information) will
          lock again in about 2 minutes. Would you like to stay unlocked?
        </p>
      </Modal.Body>
      <Modal.Footer style={{ borderTop: '1px solid var(--border)' }}>
        <Button variant="outline-secondary" onClick={lockVault}>Lock now</Button>
        <Button variant="primary" onClick={extendVaultSession}>Stay unlocked</Button>
      </Modal.Footer>
    </Modal>
  )
}
