# Business Logic Map — In Good Hands

Identifies where the platform's actual domain rules live, so a mobile client reuses rather than
re-derives them. "Authoritative Location" is always a server-side file — nothing in this list
should ever be reimplemented purely client-side.

| Business Rule / Calculation | Current Implementation | Authoritative Location | Mobile Should Reuse? |
|---|---|---|---|
| Section completion / "is this section started" | Counts rows per section table; "How to be Remembered" counted started if any of 4 profile fields is non-empty | `GET /api/sections/completion` (`server/routes/sections.js:53-97`) | **Yes** — call the endpoint, never recompute counts from raw section data client-side |
| Free vs. Premium entitlement | `subscriptions.plan` valid only when `status` is `active`/`trialing`, else treated as free | `server/lib/subscription.js` (`getUserPlan`, `isPremium`), enforced by `middleware/requiresPremium.js` | **Yes, absolutely** — never infer premium from any client-cached value |
| Which sections require the vault password | Static set of 5 section IDs | `server/lib/vaultSections.js` (`VAULT_PROTECTED_SECTIONS`) | Not directly needed by Mobile v1 (it never touches vault sections), but if it ever does, reuse this list rather than hardcoding section IDs again |
| Vault password verification & lockout | scrypt key derivation + AES-GCM check-ciphertext; 5 wrong attempts → 15-minute lockout; 3 wrong attempts → forced logout | `server/lib/vault.js`, `server/lib/vaultAuth.js`, `server/lib/vaultAttempts.js` | N/A for Mobile v1 (no vault features), but the algorithm/thresholds must never be reimplemented elsewhere if mobile ever adds vault support |
| Inactivity timer expiry calculation | `last_active_at + inactivity_period_months` (or a QA-only minute-based override) | `server/lib/inactivityTimer.js` (`computeExpiresAt`) | Yes if mobile shows the timer — call `GET /api/users/me/timer`, which already returns the computed `expires_at`/`days_left`; don't recompute the date math client-side |
| Reminder email/push cadence | Reminders at ≤14 days left, backing off at 7/3/1-day thresholds; re-notification of lapsed accounts throttled to 30 days | `server/lib/inactivityTimer.js` (`checkInactivity`), daily 8am cron | Server-only; mobile's only touchpoint is registering a push token so it can *receive* these, via `POST /api/users/me/device-token` |
| Executor vs. general-trusted-contact notification on lapse | If an executor is designated, only they're notified (with demise-confirmation power); otherwise all trusted contacts are notified (view-only) | `server/lib/inactivityTimer.js` (`notifyExecutor` / `notifyTrustedContacts`) | N/A for Mobile v1 (not a free-plan MVP feature), but never re-derive "who gets notified" client-side if built later |
| Marking a user deceased (single entry point) | One function, called from the executor's public access-link flow and org-portal staff flow; locks all further edits (`checkPlanLock`) | `server/lib/deceased.js` (`markUserDeceased`) | N/A for Mobile v1 |
| Plan lock after deceased status | Blocks all non-GET requests to any section route, including via org view-as | `server/routes/sections.js` (`checkPlanLock`, applied via `router.use`) | Indirectly relevant — a mobile client should handle a `403` from any write request gracefully (this is one possible cause), not assume all 403s mean "upgrade required" |
| Password reset session invalidation | `session_version` bump on any password change signs out every other issued JWT | `server/routes/auth.js`, `server/routes/users.js`, `server/routes/admin.js` (three call sites, same pattern) | Yes — mobile must treat a `401 { session_expired: true }` response as "force re-login," matching the web client's interceptor pattern |
| Song/bucket-list item caps | 20 favourite songs, 50 bucket-list items (legacy tables); 50 songs, no stated cap on life-wishes (proper section tables) | `server/routes/users.js` (`/me/songs`, `/me/bucket-list`), `server/routes/sections.js` (`songs-that-define-me`) | Yes, whichever pair mobile ends up using — enforce by relying on the server's `400` response, not a client-side count check alone |
| Trusted contact cap (max 3) + one executor max | Enforced via a `COUNT(*) >= 3` check and a partial unique DB index respectively | `server/routes/trustedContacts.js`, DB constraint in `database.js` | Yes if mobile builds this feature — surface the server's `400`/constraint-violation message rather than guessing the limit |
| PDF export scope (free vs. full) | `GET /api/export` = free-tier data only; `POST /api/export` = full export, requires premium + vault password | `server/routes/export.js`, `server/lib/generatePdf.js` | Trigger only, never re-render — if mobile offers "download my plan," it should call `GET /api/export` and let the server produce the file |
| Org-sponsored premium expiry | Daily sweep expires `subscriptions` rows whose org-grant window has lapsed | `server/lib/orgPremiumExpiry.js`, daily 8am cron | N/A for Mobile v1 |
| Registration requires explicit privacy consent | Blocks account creation without `privacy_consent: true` | `server/routes/auth.js` (`POST /register`) | Yes — mobile's registration screen must collect and send the same field; this is a legal/compliance requirement, not a UI nicety |
| Password complexity rule | ≥8 chars, ≤128 chars, ≥1 uppercase, ≥1 digit | `express-validator` rules in `server/routes/auth.js`, duplicated as manual checks in `users.js` change-password | Yes — mirror the same rule client-side for UX, but the server is still the enforcement point |

## Where mobile must not recreate logic independently

The strongest examples in this codebase of "logic that must stay centralized":

1. **Entitlement resolution** (`getUserPlan`) — it is deliberately *not* embedded in the JWT so it
   stays live/revocable; a mobile client caching plan status beyond a single session risks showing
   stale premium access after a cancellation.
2. **Vault cryptography** — architecturally impossible to duplicate correctly on a mobile client
   without either shipping the vault password insecurely or reimplementing scrypt/AES-GCM
   key-derivation parameters exactly; not a Mobile v1 concern since vault features are excluded,
   but a hard rule for any future phase.
3. **Section-completion counting** — trivial to get subtly wrong (e.g. what counts as "started"
   for a single-record section like Funeral Wishes) if recomputed from raw list data instead of
   calling the endpoint.
4. **Deceased/plan-lock status** — this is an account-wide state that can change from a channel
   the mobile app has no visibility into (an executor's web-based confirmation); mobile must treat
   the API's response as ground truth on every request, not cache "is this account locked" beyond
   the current session.
