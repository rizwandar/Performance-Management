import { useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { useSubscription } from '../context/SubscriptionContext'
import { PLAN_LIMITS } from '../constants/planLimits'

// Small, persistent "you've hit the Free plan limit here, upgrade for more"
// callout. This is the standard way of surfacing a per-section item-count
// limit, and is the inline sibling to UpgradeModal.jsx's "this whole section
// is Premium-only" popup: same visual language (parchment background,
// green-900/green-700, --border, --text/--text-muted), but a persistent
// panel that sits next to the relevant "Add" control instead of a modal
// that interrupts. No animation, no dismiss button - it simply appears or
// disappears based on currentCount vs. the limit.
//
// `limitKey` indexes PLAN_LIMITS (client/src/constants/planLimits.js).
// `currentCount` is how many items the caller currently has in that area
// (for message_audio_clips, that's one specific message's own clip count,
// not the total across all messages).
export default function PlanLimitNotice({ limitKey, currentCount }) {
  const navigate = useNavigate()
  const { isPremium } = useSubscription()
  const entry = PLAN_LIMITS[limitKey]
  if (!entry) return null

  // null premium means unlimited, matching server/lib/planLimits.js's convention.
  const limit = isPremium ? (entry.premium ?? Infinity) : entry.free
  if (currentCount < limit) return null

  return (
    <div style={{
      background: 'var(--parchment)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--card-radius-sm, 12px)',
      padding: '14px 18px',
      marginBottom: 16,
    }}>
      {isPremium ? (
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
          You've reached the limit of {entry.premium} {entry.itemLabelPlural}.
        </p>
      ) : (
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <p style={{ color: 'var(--text)', margin: 0, fontSize: '0.9rem' }}>
            You've reached the Free plan limit of {entry.free} {entry.itemLabelPlural}. Upgrade to
            Premium for {entry.premium == null ? 'unlimited' : `up to ${entry.premium}`} {entry.itemLabelPlural}.
          </p>
          <Button
            onClick={() => navigate('/upgrade')}
            style={{ background: 'var(--green-700)', border: 'none', borderRadius: 8, padding: '6px 20px', fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}
          >
            See Premium plans
          </Button>
        </div>
      )}
    </div>
  )
}
