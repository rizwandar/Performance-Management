# Codex Handoff — In Good Hands

Welcome. This document assumes you (Codex, or any coding agent) have never seen this repository.
Read this first, then follow the pointers below into the deeper documents only as each task
requires — don't load everything at once.

## 1. What In Good Hands is

An end-of-life planning web application. Individual users record wishes, legal/financial
information, medical preferences, funeral wishes, and more, across 14 planning "sections." They
can designate up to 3 trusted contacts who gain read access (and, for one designated executor,
a demise-confirmation action) if the owner becomes inactive for a configured period, or the owner
shares access directly. Funeral homes can white-label an organization portal on top of the same
platform. The company also runs an admin panel for internal operations.

## 2. Current product boundaries

Three surfaces exist in the current codebase, all sharing one backend and one deploy:

1. **Consumer app** (individual users, Free or Premium plan) — the only surface Mobile v1 targets.
2. **Admin panel** — internal-only, `is_admin`-gated. Out of mobile scope entirely.
3. **Organization/funeral-home portal** — fully implemented, `org_role`-gated B2B2C surface,
   currently deprioritized in product roadmap but not "unbuilt." Out of mobile scope entirely.

**Mobile v1 direction (stated by the product owner, treat as authoritative):**

> Mobile v1 is an individual-user Free Plan companion application. It should provide genuine
> standalone value and should not expose locked Premium sections. When appropriate, users may be
> informed that additional capabilities are available through ingoodhandsplan.com using the same
> In Good Hands account. Admin, Premium mobile functionality, funeral homes, and organization
> functionality are outside Mobile v1 scope.

## 3. Current website architecture (one paragraph)

React 19 SPA (`client/`) talks to an Express 5 REST API (`server/`) over JSON, authenticated with
JWT bearer tokens (no cookies, no CORS entanglement for a native client). PostgreSQL is the
database, accessed with raw SQL (no ORM). Files go to Cloudflare R2, email via Resend, payments
via Stripe, errors via Sentry, push notifications via the Expo Push API. Hosted on Render. Full
detail: [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md).

## 4. Where the important documentation is

All in this `docs/` directory, each scoped to one concern:

| Document | Read when you need to... |
|---|---|
| [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | Understand the system end-to-end |
| [REPOSITORY_MAP.md](./REPOSITORY_MAP.md) | Find where something lives before searching blind |
| [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md) | Build or touch login/register/tokens |
| [USER_ACCESS_MODEL.md](./USER_ACCESS_MODEL.md) | Determine what a given user can/can't do |
| [DATABASE_MODEL.md](./DATABASE_MODEL.md) | Understand what data exists and how it relates |
| [API_AND_SERVICE_MAP.md](./API_AND_SERVICE_MAP.md) | Find the exact endpoint to call for a feature |
| [FREE_PLAN_FEATURES.md](./FREE_PLAN_FEATURES.md) | Decide what belongs in Mobile v1 |
| [BUSINESS_LOGIC_MAP.md](./BUSINESS_LOGIC_MAP.md) | Avoid re-implementing a rule that must stay server-side |
| [EXTERNAL_SERVICES_AND_INFRASTRUCTURE.md](./EXTERNAL_SERVICES_AND_INFRASTRUCTURE.md) | Understand third-party dependencies |
| [MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md) | **Read before writing any mobile code** — includes the vertical-slice recommendation |
| [ARCHITECTURE_DECISIONS_AND_GAPS.md](./ARCHITECTURE_DECISIONS_AND_GAPS.md) | See open questions that need a human decision before you proceed |

## 5. Which files/directories to examine first

In order, if starting fresh:

1. `server/db/database.js` — the entire real schema, in one file.
2. `server/routes/sections.js` — the core CRUD pattern every planning section follows; once you
   understand one section route, you understand all of them.
3. `server/middleware/auth.js` and `server/routes/auth.js` — auth end to end.
4. `server/lib/subscription.js` + `server/middleware/requiresPremium.js` — entitlement.
5. `mobile/` (all of it) — the existing partial mobile app. **Read
   [MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md) before deciding what to do
   with this code** — it already contains Premium-section screens and an Upgrade tab that conflict
   with the v1 scope above, and a hardcoded production API URL.

## 6. Authentication fundamentals

- `POST /api/auth/register` / `POST /api/auth/login` return `{ token, user }`. Store the token
  (mobile: `expo-secure-store`, already correctly used in the existing `mobile/src/context/AuthContext.js`).
- Every authenticated request needs `Authorization: Bearer <token>`.
- Token expires in 8 hours, fixed, no refresh mechanism today — this is an open decision, see
  [ARCHITECTURE_DECISIONS_AND_GAPS.md](./ARCHITECTURE_DECISIONS_AND_GAPS.md) item 1.
- A `401` with `{ session_expired: true }` in the body means "force logout, re-login required" —
  distinguish this from a `401` that's just "wrong vault password" (which must NOT log the user
  out). The web client's axios interceptor pattern (`client/src/context/AuthContext.jsx`) shows
  exactly how to make this distinction.
- Full detail: [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md).

## 7. Database fundamentals

- PostgreSQL, no ORM. You will never write raw SQL from a mobile client — always go through the
  API. This point is purely so you understand what the API is backed by.
- One `users` table for every account type (consumer, admin, org staff) — distinguished by
  `is_admin` and `org_role` columns, not separate tables.
- Plan/entitlement lives in a **separate** `subscriptions` table, not on `users`.
- Full detail: [DATABASE_MODEL.md](./DATABASE_MODEL.md).

## 8. Free Plan fundamentals

Free, server-enforced (no `requirePremium` gate) sections: How I'd Like to Be Remembered,
Messages to Loved Ones, Songs That Define Me, Funeral & End-of-Life Wishes, Medical & Care Wishes,
Key Contacts (+ trusted-contacts sharing), People to Notify, Children & Dependants, Life's Wishes.
Premium-gated: Legal Documents, Financial Affairs, Property & Possessions, Household Info, Digital
Life (vault). Full detail with routes and caveats:
[FREE_PLAN_FEATURES.md](./FREE_PLAN_FEATURES.md) — **read this before choosing your first
feature to build**, it also flags a legacy duplicate songs/bucket-list implementation you should
not accidentally build against.

## 9. What the first mobile app is intended to be

A free-only companion app for existing/new individual users. Recommended first vertical slice
(reasoning in [MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md)): **Funeral &
End-of-Life Wishes**, including its photo gallery — it's unambiguously free, self-contained, and
exercises both authenticated CRUD and real file upload early.

## 10. Explicit mobile v1 exclusions

- No Premium sections or any UI that previews/teases locked Premium content.
- No in-app purchase/checkout flow — at most, a message pointing the user to
  `ingoodhandsplan.com` to sign in with the same account and upgrade there.
- No admin functionality.
- No funeral-home/organization functionality.
- No vault/Digital Life feature (this is also Premium-gated, so excluded on both grounds).
- No PDF export UI beyond, at most, triggering the existing free `GET /api/export` download —
  never re-implement PDF rendering client-side.

## 11. Which systems must remain authoritative (server-side, never duplicated)

- Entitlement resolution (`server/lib/subscription.js`).
- All vault cryptography (`server/lib/vault.js`) — not applicable to v1's feature set, but never
  to be touched regardless.
- Section-completion counting (`GET /api/sections/completion`).
- Inactivity timer math and notification fan-out (`server/lib/inactivityTimer.js`).
- Deceased/plan-lock status (`server/lib/deceased.js`, `checkPlanLock` in `sections.js`).
- PDF generation (`server/lib/generatePdf.js`).

Full rationale: [BUSINESS_LOGIC_MAP.md](./BUSINESS_LOGIC_MAP.md).

## 12. Development/environment cautions

- **No test framework exists** in this repo (client, server, or mobile). Don't assume test
  infrastructure you can extend — if tests are wanted for new mobile work, that's a new decision,
  not a convention to follow.
- **`shared/` is nearly empty** (`formatPhone()` only) — don't assume shared API-client or
  constants code exists to import; it doesn't yet.
- **The existing `mobile/` app hardcodes a production API URL** with no environment switching —
  fix this before doing real development against staging/local, per
  [MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md).
- **This repository's primary worktree may carry uncommitted, unrelated stray changes** at any
  given time (a known, previously-flagged condition in project memory) — check `git status`
  before assuming a clean starting point, and never discard unexplained changes without asking.
- **Do not commit secrets.** All required env vars are documented by name (not value) in
  [EXTERNAL_SERVICES_AND_INFRASTRUCTURE.md](./EXTERNAL_SERVICES_AND_INFRASTRUCTURE.md).
- Per project convention (CLAUDE.md): no em-dashes in any UI text, emails, or code comments; use
  commas, colons, or periods instead. This applies to mobile UI copy too.

## 13. Known unresolved questions (do not resolve unilaterally — ask)

See [ARCHITECTURE_DECISIONS_AND_GAPS.md](./ARCHITECTURE_DECISIONS_AND_GAPS.md) for the full list
with reasoning. Headline items:

1. Mobile token lifetime/refresh strategy — undecided.
2. What to do with the existing `mobile/` code's out-of-scope Premium/Upgrade screens — prune vs.
   restart clean.
3. Which of the two parallel songs/bucket-list implementations is canonical.
4. Whether free PDF export and/or Key Contacts sharing are in the v1 slice.
5. Exact production Render service configuration (not fully verifiable from checked-in files
   alone — confirm in the Render dashboard before hardcoding a production URL anywhere).
