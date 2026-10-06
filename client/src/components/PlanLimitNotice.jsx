import { useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { useSubscription } from '../context/SubscriptionContext'
import { PLAN_LIMITS } from '../constants/planLimits'

// Small, quiet "here is what your plan includes, upgrade if you want more"
// callout. This is the standard way of surfacing a per-section item-count
// limit.
//
// Deliberately plain text plus a button, not a bordered panel (2026-10-06, at
// the owner's request). It had a parchment background and a border, which read
// as a heavy block competing with the section's own content. It is a footnote,
// so it looks like one.
//
// Placement convention, also 2026-10-06: it belongs BELOW a section's recorded
// items, near the foot of the page, not above the add control. Above the list
// it pushed everything a reader came for further down the page, and the
// allowance only means something once they have seen what they already have.
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
// caller rather than the default, because an always-on upgrade note is only
// worth its noise where the allowance is small enough to matter.
//
// Opted in: Trusted Contacts, and the five vault sections as of 2026-10-04,
// where a free allowance of one or two items is reached almost immediately
// and is better stated than discovered. The remaining callers keep the
// original at-the-limit-only behaviour.
//
// `omitCount` drops the "your plan includes N" half and leaves only the
// invitation to upgrade. For a page whose own header already states the
// allowance, repeating it here is the duplication the copy is trying to lose.
// Explicit rather than inferred from `alwaysShow`: the two happen to travel
// together on Trusted Contacts today, but a page could want one without the
// other, and a silent coupling would be a trap later. A page that does NOT
// state the allowance itself must leave this off, or the reader is told to
// upgrade without being told from what.
export default function PlanLimitNotice({ limitKey, currentCount, alwaysShow = false, omitCount = false }) {
  const navigate = useNavigate()
  const { isPremium } = useSubscription()
  const entry = PLAN_LIMITS[limitKey]
  if (!entry) return null

  // Several caps are 1 (financial items, property, household info, donation
  // bank, your last moments, one voice clip per message), so a hardcoded
  // plural noun produced "your plan includes 1 items". Every count that
  // reaches the copy goes through here.
  const noun = (n) => (n === 1 ? entry.itemLabel : entry.itemLabelPlural)

  // null premium means unlimited, matching server/lib/planLimits.js's convention.
  const limit = isPremium ? (entry.premium ?? Infinity) : entry.free
  const atLimit = currentCount >= limit

  // A paid plan gets no upsell, only a plain statement of the ceiling once
  // they actually reach it. alwaysShow deliberately does not apply here:
  // someone holding 3 of 10 does not need to be told about 10.
  if (isPremium) {
    if (!atLimit) return null
    return (
      <Wrapper>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          You can add up to {entry.premium} {noun(entry.premium)}.
        </p>
      </Wrapper>
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

  // The over-limit case keeps its full wording even under omitCount: someone
  // holding more than their plan allows needs the reassurance that nothing is
  // being taken away, and that is not a restatement of the allowance.
  const message = overLimit
    ? `You have more ${entry.itemLabelPlural} than your plan includes. They are all safe and will stay. Upgrade your account if you would like to add more.`
    : omitCount
      ? 'Upgrade your account if you would like to add more.'
      // "You have added all 1 document" does not read, so an allowance of one
      // keeps the plain statement of the limit instead.
      : atLimit && limit > 1
        ? `You have added all ${limit} ${entry.itemLabelPlural} your plan includes. Upgrade your account if you would like to add more.`
        : `Your plan includes ${limit} ${noun(limit)}. Upgrade your account if you would like to add more.`

  return (
    <Wrapper>
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
    </Wrapper>
  )
}

// Spacing only. No background, no border: see the note at the top of the file.
function Wrapper({ children }) {
  return (
    <div style={{ marginTop: 4, marginBottom: 24 }}>
      {children}
    </div>
  )
}
