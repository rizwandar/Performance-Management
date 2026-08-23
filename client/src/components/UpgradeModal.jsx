import { Modal, Button } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { useSubscription } from '../context/SubscriptionContext'

export default function UpgradeModal({ show, onHide, sectionName }) {
  const navigate = useNavigate()
  // BIL-08: distinguishes "your free 30-day trial ended" from the generic
  // "this section is part of the Premium plan" copy shown to someone who
  // never had a trial (e.g. it already ran out before this feature existed).
  const { signupTrialExpired } = useSubscription()

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton style={{ borderBottom: '1px solid var(--border)', background: 'var(--parchment)' }}>
        <Modal.Title style={{ fontFamily: 'Georgia, serif', color: 'var(--green-900)', fontSize: '1.2rem' }}>
          {signupTrialExpired ? 'Your Free Trial Has Ended' : 'Premium Section'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ background: 'var(--parchment)', padding: '28px 28px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: '2.8rem' }}>🔒</span>
        </div>
        <p style={{ color: 'var(--text)', lineHeight: 1.7, marginBottom: 12, textAlign: 'center' }}>
          {signupTrialExpired
            ? <>Your 30-day free trial has ended, so <strong style={{ color: 'var(--green-900)' }}>{sectionName}</strong> is now Premium-only.</>
            : <><strong style={{ color: 'var(--green-900)' }}>{sectionName}</strong> is part of the Premium plan.</>}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.7, textAlign: 'center', marginBottom: 0 }}>
          {signupTrialExpired
            ? "Nothing you've recorded was lost, it's still all there. Subscribe to unlock all 21 sections again, document uploads, trusted contacts, and the full PDF export."
            : 'Upgrade to unlock all 21 sections, document uploads, trusted contacts, and the full PDF export.'}
        </p>
      </Modal.Body>
      <Modal.Footer style={{ background: 'var(--parchment)', borderTop: '1px solid var(--border)', justifyContent: 'center', gap: 12 }}>
        <Button variant="outline-secondary" onClick={onHide} style={{ borderRadius: 8 }}>
          Maybe later
        </Button>
        <Button
          onClick={() => { onHide(); navigate('/upgrade') }}
          style={{ background: 'var(--green-700)', border: 'none', borderRadius: 8, padding: '8px 24px' }}
        >
          See Premium plans
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
