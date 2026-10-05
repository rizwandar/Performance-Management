import { useSubscription } from '../context/SubscriptionContext'
import { PLAN_LIMITS } from '../constants/planLimits'

// Answers "has this person run out of room in this section" so a page can
// stop offering an "Add" control it knows the server will refuse.
//
// Added 2026-10-04, when the vault sections stopped being Premium-only and
// became capped instead. Before that the question did not arise on those
// pages: a free user could not open them at all, so there was no partly-full
// state to reason about.
//
// PlanLimitNotice already reads PLAN_LIMITS and works out the same ceiling for
// its copy, but it does that privately and renders a panel. A page also needs
// the plain boolean, and the alternative was each page re-deriving it from
// PLAN_LIMITS and isPremium inline, five times, which is five chances for one
// of them to drift. The two deliberately share PLAN_LIMITS as their single
// source rather than this hook feeding the component: the component's copy
// needs itemLabelPlural and the over-limit distinction, which a caller asking
// "am I full" has no use for.
//
// Returns atLimit false for an unknown key, so a typo degrades into "no cap"
// rather than silently locking a section nobody can then add to.
export function usePlanLimit(limitKey, currentCount) {
  const { isPremium } = useSubscription()
  const entry = PLAN_LIMITS[limitKey]
  if (!entry) return { limit: Infinity, atLimit: false, overLimit: false }

  // null premium means unlimited, matching server/lib/planLimits.js.
  const limit = isPremium ? (entry.premium ?? Infinity) : entry.free

  return {
    limit,
    atLimit:   currentCount >= limit,
    // Reachable: an account that filled up on a paid plan keeps every item
    // when it returns to free. The server caps adding, it never deletes.
    overLimit: currentCount > limit,
  }
}
