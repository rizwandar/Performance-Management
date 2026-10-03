import { useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { useSubscription } from '../context/SubscriptionContext'
import { PLAN_LIMITS } from '../constants/planLimits'

// Small, quiet "here is what your plan includes, upgrade if you want more"
// callout. This is the standard way of surfacing a per-section item-count
// limit, and is the inline sibling to UpgradeModal.jsx's "this whole section
// is Premium-only" popup: same visual language (parchment background,
// green-900/green-700, --border, --text/--text-muted), but a persistent
// panel that sits next to the relevant "Add" control instead of a modal
// that interrupts. No animation, no dismiss button.
//
// Deliberately never says "Premium" or "Free plan" (2026-10-03). Naming the
// tier in a nudge reads as a sales pitch at the exact moment someone is
// trying to record something; the upgrade page itself is where the plan and
// its benefits are explained, which is where the button goes.
//
// `limitKey` indexes PLAN_LIMITS (client/src/constants/planLimits.js).
// `currentCount` is how many items the caller currently has in that area
// (for message_audio_clips, that's one specific message's own clip count,
// not the total across all messages).
//
// `alwaysShow` keeps the note visible before the cap is reached, so the
// limit is known up front rather than discovered as a wall. It is opt-in per
// caller rather than the default: on six capped areas at once, an always-on
// upgrade note would read as nagging. Trusted Contacts opts in; the other
// five keep the original at-the-limit-only behaviour until each is looked at
// on its own terms.
export default function PlanLimitNotice({ limitKey, currentCount, alwaysShow = false }) {
  const navigate = useNavigate()
  const { isPremium } = useSubscription()
  const entry = PLAN_LIMITS[limitKey]
  if (!entry) return null

  // null premium means unlimited, matching server/lib/planLimits.js's convention.
  const limit = isPremium ? (entry.premium ?? Infinity) : entry.free
  const atLimit = currentCount >= limit

  // A paid plan gets no upsell, only a plain statement of the ceiling once
  // they actually reach it. alwaysShow deliberately does not apply here:
  // someone holding 3 of 10 does not need to be told about 10.
  if (isPremium) {
    if (!atLimit) return null
    return (
      <Panel>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          You can add up to {entry.premium} {entry.itemLabelPlural}.
        </p>
      </Panel>
    )
  }

  if (!atLimit && !alwaysShow) return null

  // Over the cap, not merely at it. Reachable for real: an account that held
  // more items while on a paid plan (or during the signup trial) keeps every
  // one of them when it returns to the free plan - the server caps *adding*,
  // it never deletes. Telling that person their plan "includes 2" while they
  // can see 10 of their own would read as a threat to the data, so this case
  // gets its own reassuring copy.
  const overLimit = currentCount > limit

  const message = overLimit
    ? `You have more ${entry.itemLabelPlural} than your plan includes. They are all safe and will stay. Upgrade your account if you would like to add more.`
    : atLimit
      ? `You have added all ${limit} ${entry.itemLabelPlural} your plan includes. Upgrade your account if you would like to add more.`
      : `Your plan includes ${limit} ${entry.itemLabelPlural}. Upgrade your account if you would like to add more.`

  return (
    <Panel>
      <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <p style={{ color: atLimit ? 'var(--text)' : 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          {message}
        </p>
        <Button
          onClick={() => navigate('/upgrade')}
          // Solid once they have actually run out, quiet outline while the
          // note is purely informational - the nudge should not compete with
          // the section's own "Add" control for attention.
          variant={atLimit ? undefined : 'outline-success'}
          style={{
            borderRadius: 8,
            padding: '5px 16px',
            fontSize: '0.8rem',
            fontWeight: 600,
            flexShrink: 0,
            ...(atLimit ? { background: 'var(--green-700)', border: 'none' } : {}),
          }}
        >
          Upgrade Your Account
        </Button>
      </div>
    </Panel>
  )
}

function Panel({ children }) {
  return (
    <div style={{
      background: 'var(--parchment)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--card-radius-sm, 12px)',
      padding: '11px 16px',
      marginBottom: 16,
    }}>
      {children}
    </div>
  )
}
