# Authentication Architecture — In Good Hands

This is the most important document for mobile planning: the future mobile app must eventually
authenticate against the same accounts as the website.

## Current state

### Mechanism

- **JWT bearer tokens**, signed HS256 via `jsonwebtoken`, secret from `process.env.JWT_SECRET`.
  There is **no cookie-based session** anywhere in the consumer auth flow — the client stores the
  token itself and sends `Authorization: Bearer <token>` on every request.
  (`server/middleware/auth.js`, `client/src/context/AuthContext.jsx`)
- `middleware/auth.js` throws a fatal startup error if `JWT_SECRET` is unset **and**
  `NODE_ENV === 'production'`; otherwise it falls back to a hardcoded dev secret
  (`'dev-secret-change-in-production'`) — fine for local dev, would be a serious bug in any
  production-like environment if the real secret were ever missing (it can't be, staging/prod
  both set it per `render.yaml`).
- Token payload (`server/routes/auth.js:117,160-169`): `{ id, email, is_admin, org_role?,
  organization_id?, organization_location_id?, sv }`. `sv` is the "session version" claim (see
  below). No `scope`/`aud`/`iss` claims are used.
- **Token lifetime: 8 hours** (`expiresIn: '8h'`), fixed, not configurable per client. No refresh
  token, no rotation. When it expires, the web client force-logs-out; there is no silent renewal.

### Registration flow

`POST /api/auth/register` (`server/routes/auth.js:81-129`):
1. Validates name/email/password/date_of_birth via `express-validator` (`registerRules`).
   Password must be ≥8 chars, ≤128 chars, contain an uppercase letter and a digit.
2. Requires `privacy_consent: true` in the request body (blocks registration otherwise).
3. Hashes password with `bcrypt` (cost factor 10).
4. Creates the `users` row plus a `subscriptions` row with `plan='free', status='active'`.
5. Generates a 24-hour email-verification token (not blocking — see below) and sends a
   verification email via Resend, fire-and-forget (doesn't block the response).
6. Returns `{ id, token, user }` immediately — **the user is fully logged in before verifying
   their email.**
7. Audit-logs the `register` action.

### Login flow

`POST /api/auth/login` (`server/routes/auth.js:136-186`):
1. Looks up user by email, compares password with `bcrypt.compareSync`.
2. Rejects deactivated org-staff accounts (`org_role` set + `is_active = 0`) — irrelevant to
   individual consumer accounts.
3. On success: updates `last_active_at` (drives the inactivity timer), clears
   `last_reminder_sent_at`/`inactivity_contacts_notified_at`/`vault_attempts`.
4. Issues a fresh JWT with current `session_version` embedded as `sv`.
5. Audit-logs `login_success` or `login_failed`.

No account lockout on repeated failed logins (only the separate vault-password lockout exists,
see [DATABASE_MODEL.md](./DATABASE_MODEL.md)). Auth routes overall are throttled by the 20
req/15min `authLimiter` in `index.js`.

### Logout

`POST /api/auth/logout` (auth required) — purely an audit-log write (`logout` action). The JWT
itself is **not** invalidated server-side; logout is effectively client-side (delete the stored
token). A stolen token remains valid until it naturally expires (8h) or the user's
`session_version` is bumped by a password change/reset.

### Password reset

`POST /api/auth/forgot-password` → `POST /api/auth/reset-password`:
- Always returns the same generic message regardless of whether the account exists — prevents
  account enumeration (SEC-04).
- Optionally requires date-of-birth as a second factor, controlled by the
  `app_settings.password_reset_method` toggle (`'email'` vs `'dob'`), admin-configurable.
  DOB comparison uses `crypto.timingSafeEqual` to resist timing side-channels.
- Rate-limited **by email** (not just IP) at 5 requests/15min, so guessing one account's DOB
  can't be brute-forced by rotating IPs.
- Reset token: 32 random bytes, **SHA-256 hashed before storage** (the DB never holds the raw
  token — only what was emailed does), 30-minute expiry.
- On successful reset: **`session_version` is incremented**, which immediately invalidates every
  other JWT already issued for that account (see below) — closes the "stolen session survives a
  password reset" gap (SEC-04).

### Email verification

- Token generated at registration (24h expiry), verified via `GET /api/auth/verify-email/:token`
  (no auth required — the token itself is the credential).
- **Non-blocking**: an unverified user can log in and use the app immediately; the client shows a
  dismissible-but-persistent banner (`UnverifiedEmailBanner` in `App.jsx`) rather than hard-gating
  any feature.
- `POST /api/auth/resend-verification` (auth required) issues a new token.
- Admins can force-verify via `POST /api/admin/users/:id/verify-email`.

### Session invalidation (`session_version`)

- `users.session_version` (default `1`), bumped whenever a password is changed (self-service,
  forgot-password, or admin-initiated).
- Every JWT minted after this migration carries the current value as `sv`.
- `middleware/auth.js` checks `sv` against the live DB value on every request that has the claim;
  a mismatch → `401 { session_expired: true }`, forcing re-login.
- Tokens minted **before** this migration (or by a couple of org-flow token issuers not yet
  updated, per the code comment) have no `sv` claim and skip the check entirely — a soft-migration
  compromise, not a hard security boundary for very old tokens.

### Cookies

**None are used for consumer authentication.** The only cookie-adjacent concept anywhere in the
codebase is a project-memory note ("CSRF lesson") about an unrelated in-app fetch quirk, not an
actual session cookie. This is a genuinely favorable starting point for mobile: there is no
cookie-jar/CSRF-token machinery to reconcile with a native HTTP client.

### Authorization checks

Layered, not a single "role" field:

1. `req.user` from the JWT (`is_admin`, `org_role`, `organization_id`, plan is **not** in the
   token — it's fetched separately).
2. `is_admin` (integer 0/1 on `users`) — admin-only routes check this directly
   (`adminOnly` inline middleware repeated per route file).
3. `org_role` (`'org_admin' | 'org_staff' | null`) + `organization_id` — checked by
   `middleware/orgAuth.js`'s `requireOrgUser`/`requireOrgAdmin`.
4. Plan/entitlement (`requirePremium` middleware) — a **separate axis entirely**, resolved live
   from the `subscriptions` table on every gated request, never trusted from the JWT. See
   [USER_ACCESS_MODEL.md](./USER_ACCESS_MODEL.md).
5. Record ownership — every section route filters `WHERE user_id = $1` using `req.user.id` from
   the verified token; there is no separate ACL table for personal data.

### CORS

`server/index.js:19-34` implements CORS by hand: reflects the request's `Origin` header only when
it exactly equals `process.env.CLIENT_URL` (or allows any origin if `CLIENT_URL` is unset, e.g.
local dev), sets `Access-Control-Allow-Credentials: true`. This is a **browser-only** mechanism —
it does not apply to a native mobile HTTP client (React Native's networking stack doesn't enforce
CORS), so it is not a blocker for mobile, but it also means **it provides mobile no protection
either** — any authenticated request with a valid bearer token is accepted regardless of origin.

## Can the current implementation be safely consumed by a native/mobile client?

**Yes, largely as-is**, and this is already proven: the existing `mobile/` skeleton (see
[MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md)) already calls
`POST /api/auth/login` and `/register` directly with axios and stores the resulting JWT in
`expo-secure-store` — which is actually a **better** storage choice than the web client's
`localStorage` (OS-level keychain/keystore vs. an XSS-readable browser store).

What already works for mobile without change:
- Bearer-token login/register/forgot-password/reset-password endpoints.
- No cookie/CORS entanglement to work around.
- `expo-secure-store` is a sound token store.

## Potential mobile requirements (not yet built — decisions, not implementations)

| Gap | Why it matters for mobile | Recommendation strength |
|---|---|---|
| **8-hour fixed token expiry, no refresh** | Mobile users expect to stay signed in for days/weeks without re-entering a password. Forcing re-login every 8 hours is a poor mobile UX. | High — needs a decision before broad mobile rollout: either a longer mobile-specific `expiresIn`, or a real refresh-token flow. Currently undecided; **do not silently implement one client-side.** |
| **No device/session registry** | There's no way today to see or revoke "this phone's" session independent of "this browser's" session — a stolen phone can't be signed out remotely without changing the account password (which also signs out the web session). | Medium — acceptable for an MVP, worth flagging as a future gap. |
| **No biometric/passcode unlock layer** | Standard mobile-app expectation once local data or a secure token is on-device. Nothing in the current API needs to change for this — it's purely client-side (Expo has `expo-local-authentication`), gating access to the already-stored token. | Low priority for v1, but a fast, non-backend-touching addition later. |
| **Push-token binding assumes one token per user** | `users.expo_push_token` is a single column, not a table — a user signed in on two devices only gets push on whichever registered most recently. Fine for MVP (one device per user is a reasonable v1 assumption) but a known ceiling. | Low priority now; documented trigger for a future `user_devices` table if multi-device push matters. |
| **`CLIENT_URL`-based CORS assumes one web origin** | Not a mobile blocker (CORS doesn't apply to native clients) but worth knowing: adding a mobile-specific web-based flow (e.g. an in-app browser OAuth-style redirect) would need CORS reconsidered. | Not currently relevant — no such flow exists. |

## Explicit non-recommendation

Do **not** introduce a second, parallel auth system for mobile (e.g. a mobile-only API key, a
different token format, or a separate `mobile_users` table). The account, password hash, and
`subscriptions` row must remain single-sourced in the existing `users`/`subscriptions` tables so a
user can register or plan on the website and immediately use the same login on mobile, per the
product requirement that both surfaces share identity.
