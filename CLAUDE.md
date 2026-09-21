# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**In Good Hands** is an end-of-life planning web and mobile app. Users record personal wishes, legal documents, financial details, medical preferences, funeral wishes, and more across 21 sections. Designated trusted contacts can access this information when the owner becomes inactive.

<!-- NOTE: section count reconciled to 21 after IDEA-19 (Unfinished Business),
     IDEA-30 (Your Last Moments), and IDEA-32 (Medical split into Doctors/
     Medical Records/Donation Bank, net +2) all landed off the same staging
     base (17 baseline + 2 + 2). Verify against DashboardPage.jsx's SECTIONS
     array length before trusting this number if another section-adding
     branch lands concurrently. -->

Stack: React (web) + Expo/React Native (mobile) + Express (API) + PostgreSQL (database) + Cloudflare R2 (file storage).

## Commands

All commands run from the repo root unless noted.

```bash
# Install all workspaces
npm install

# Development (run concurrently)
npm run dev:web        # Vite on :5173
npm run dev:server     # Express on :3001 (node --watch)
npm run dev:mobile     # Expo (iOS/Android)

# Production build (client)
npm run build

# Lint (client only)
cd client && npm run lint
```

No test framework is configured.

## Production Safety Gate

**Before promoting any code to production** (merging a PR into `main`, or any other action that pushes changes into the live production branch/environment), run an adversarial security review of the changes being promoted first:

1. Run the `/security-review` skill against the full diff going into production (compare against `main`, not just the latest commit — a promotion can carry forward several commits).
2. Review adversarially: actively look for ways a real attacker could hack, leak, or corrupt user data, not just style or correctness issues. Pay particular attention to authorization/access-control bypasses, cross-user data leakage (IDOR), injection, unvalidated/unsanitized input, insecure file uploads, secrets or vault-protected data leaking into logs/responses/error messages, and any change touching auth, vault encryption, billing, or the org portal.
3. Severity gate: low/informational findings can be noted and the promotion can proceed. Any finding at **medium severity or above must pause the promotion** — report it and get explicit user sign-off before merging or deploying, do not resolve that judgment call unilaterally.
4. **This review gate applies to every PR merged into `main`, regardless of whether it went through staging first.** Staging validation (below) is an additional step for higher-risk changes, not a substitute for this review.

### Staging usage (reinstated 2026-08-27)

`staging` was reset to exactly match `main` on 2026-08-27, after drifting significantly following an earlier 8-phase reconciliation project — do not let it drift again; treat any large `main`/`staging` diff as a problem to fix, not a normal state. The staging web service now runs on Render's Starter tier (no cold-start spin-down) and has a verified sending domain configured, so it is a reliable environment to actually test against.

**Route a change through staging first, before `main`, when it touches:**
- a database schema/migration change
- authentication, sessions, or the vault encryption path
- billing/Stripe (checkout, webhooks, subscription state)
- the org/funeral-home portal (when that work resumes)

For those: branch → PR into `staging` → verify the deployed behavior on staging directly → PR `staging` → `main` (still gated by the adversarial review above) → verify again on production after merge.

**Everything else** (copy changes, UI/dashboard tweaks, small bug fixes, non-schema housekeeping) can go straight to a `main` PR as before — the adversarial review is the gate, not a staging hop. Don't add staging as ceremony for changes that don't need it; that's exactly the kind of unnecessary process cost that let staging drift out of sync last time.

**Keep `staging` synced with `main` after every merge (reinforced 2026-09-15, after `staging` drifted 53 commits / 91 files behind `main` again in under three weeks — the same pattern that caused the 2026-08-27 reset):** the routing rule above is about *order* for risky changes (verify on staging before main); it is not a license to let `staging` sit behind `main` once something has merged. Regardless of which path a change took, immediately fast-forward `staging` to match `main`'s new tip right after the merge:

1. `git fetch origin main staging`
2. Confirm it's a clean fast-forward first: `git merge-base origin/staging origin/main` must equal `git rev-parse origin/staging` (staging has no commits of its own that aren't already on main). If it doesn't match, stop and flag the divergence to the user rather than force-syncing over unique work.
3. `git push origin origin/main:staging`
4. Verify the redeploy actually landed, not just that the git push succeeded — check for a fresh `last-modified` on the staging client response (or equivalent) before considering the sync done.

Do this proactively as a standing habit after any merge to `main`, not just when asked or when reconciling a large drift after the fact.

**When `staging` is legitimately *ahead* of `main`, none of the above applies.** Staging-first changes awaiting promotion are the system working as intended, not drift: step 2's check will show `staging` has commits of its own, and the correct response is to leave it completely alone. Do not fast-forward, do not force-push, and do not "reconcile" it. Land docs-only changes on `staging` in that state and let them ride along with the pending promotion, rather than opening a competing `main` PR that would put the same file on two divergent paths.

## Architecture

### Monorepo Workspaces
- `client/` — React 19 + Vite SPA
- `server/` — Express 5 REST API
- `mobile/` — Expo 54 / React Native (Expo Router)
- `shared/` — shared helpers. Currently just `format.js` (the package's only export, `./format`), not the `api.js`/`auth.js`/`constants.js` trio this file used to claim.

The client and mobile apps import from `@in-good-hands/shared`. The Vite config aliases this path; Expo resolves it via `metro.config.js`. In practice the only thing imported today is `formatPhone` from `@in-good-hands/shared/format`. Anything server-only (for example the plan limits below) has no home here yet, which is why those get hand-mirrored instead.

### Server (`server/`)

**Entry:** `server/index.js` — sets up Express, registers all route files, starts node-cron for the daily inactivity check (8am).

**Database:** PostgreSQL via `pg` (node-postgres), using the `Pool` implementation in `server/db/database.js`, connected through the `DATABASE_URL` env var. Schema initialization and migrations remain inline at application startup, via patterns such as `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. There is currently no separate migration runner.

**Routes** are in `server/routes/`. One file per domain, camelCase where a name has more than one word: `auth.js`, `users.js`, `sections.js`, `trustedContacts.js`, `documents.js`, `export.js`, `billing.js`, `admin.js`, `deezer.js`, `contact.js`. That list is not exhaustive; `ls server/routes/` is the reliable check.

**Key middleware:**
- `server/middleware/auth.js` — JWT verification (from an httpOnly cookie for web, or an `Authorization: Bearer` header for mobile, which has no browser cookie jar), attaches `req.user`. Also enforces CSRF (double-submit cookie) on mutating requests authenticated via cookie, and live-checks session_version/is_active/is_admin against the DB (SEC-04/SEC-10)
- `server/middleware/adminAuth.js` — requires `req.user.role === 'admin'`
- Rate limiting: 20 req/15 min on auth routes, 200 req/15 min on API routes

**Vault encryption:** `server/lib/vault.js` — AES-256-GCM encryption for digital credentials (Section 3). No server-held key: each encryption key is derived on the fly via scrypt from the user's own vault password (never stored) plus their userId. There is no `VAULT_KEY` env var.

**File uploads:** `server/lib/r2.js` — Cloudflare R2 via AWS S3 SDK. Env vars: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. The endpoint var is `R2_ENDPOINT`; `R2_ACCOUNT_ID` is read by no server code.

**Email:** Resend API via `server/lib/sendEmail.js`. Env vars: `RESEND_API_KEY`, `FROM_EMAIL`.

**Admin seed:** On first run, an admin user `admin@igh.local` is created with a randomly generated password, printed once to the server log at creation time and not recoverable afterwards. Sign in and change it immediately. It was previously the fixed string `Admin1234`, which shipped to every environment including production and is published in this repository's history. The demo organization and its six fixed-password accounts (`demo.orgadmin@igh.local` plus five demo customers) now seed only when `ORG_PORTAL_ENABLED` is `true`, so they no longer reach production at all.

### Client (`client/src/`)

**Routing:** React Router v6, all routes in `App.jsx`. Protected routes check `AuthContext`.

**Context:**
- `context/AuthContext.jsx` — login/logout, cached user state. The session JWT itself lives only in an httpOnly cookie set by the server (SEC-09); the client never reads or stores it, only a `csrf_token` cookie value it echoes back as an `X-CSRF-Token` header on mutating requests.
- `context/SubscriptionContext.jsx` — freemium plan state

**Section pages** follow a consistent pattern: fetch data on mount, render a list of `ItemCard` components, open a `FormModal` for create/edit. The sections include: Legal Documents, Digital Vault, Financial, Doctors, Medical Records, Donation Bank (since IDEA-32, split out of a formerly combined Medical & Care Wishes section - Donation Bank is vault-protected, Doctors and Medical Records are not), Property, Messages, Funeral Wishes, Obituary, Music, Pets, Charities, Biography, Bucket List, Trusted Contacts, Pet Care (its own standalone section since IDEA-18), Emergency Contact (since IDEA-27, split out of what was previously a combined "Key Contacts" page), Insurance (since IDEA-29), Unfinished Business (since IDEA-19, reconciliation/apologies/loose-ends, deliberately distinct from Bucket List and Messages to Loved Ones), and Your Last Moments (since IDEA-30, a single dedicated final recording/letter, distinct from the Messages section). This list has drifted from the actual dashboard before; verify against `client/src/pages/DashboardPage.jsx`'s `SECTIONS` array rather than trusting this sentence.

**Admin panel** (`pages/AdminPage.jsx`) — theme/font switcher (11 color themes, 6 fonts stored in `app_settings` table), logo upload for white-labelling, user management, security findings log, maintenance tools.

### Mobile (`mobile/`)

Expo Router with file-based routing in `mobile/app/`. Bottom tab navigation mirrors the main sections. Uses `expo-secure-store` for token storage and `expo-notifications` for push notifications. Build config: `app.json` (bundle ID `com.ingoodhands.app`).

### Freemium Model

Free users have limited section capacity. Premium users are unlocked. All users who registered before the freemium launch were auto-granted premium. Subscription state is checked via `SubscriptionContext` on the client and enforced in `server/routes/billing.js`.

There are two distinct kinds of limit, and they are easy to confuse:

1. **Whole-section gating** (is this entire section available on Free at all), enforced per route by the `requirePremium` middleware.
2. **Per-item count caps within a section that Free users can already use** (IDEA-43, shipped 2026-09-15). These live in `server/lib/planLimits.js`, which is the source of truth: `PLAN_LIMITS` plus a `getLimit(key, plan)` helper returning `Infinity` for an uncapped Premium value. Current caps (Free / Premium): trusted contacts 2/10, messages to loved ones 2/unlimited, unfinished business 2/unlimited, people to notify 2/unlimited, funeral gallery photos 5/50, voice clips per message 1/3.

`client/src/constants/planLimits.js` mirrors those numbers for the `PlanLimitNotice` upgrade prompt. It is display copy only, the server is the enforcement point, and the two files are kept in sync **by hand** because `shared/` has no home for server-only values. Change one, change the other in the same commit.

A `signup_trial_active` user (BIL-08's 30-day no-card vault trial) already reads as `plan: 'premium'` from `getUserPlan()`, so these caps compose with the trial with no extra code.

### Inactivity System

A node-cron job runs daily at 8am. It checks `users.last_active` against each user's configured inactivity period. When triggered, it emails the user a warning, then (after a grace period) notifies trusted contacts with time-limited access tokens.

## Environment Variables (Server)

`server/.env.example` is the authoritative list, kept next to the code that
reads each var. Copy it to `server/.env` and fill in real values. The summary
below must stay in sync with it.

Required (the server is broken or unsafe without these):

```
DATABASE_URL=
JWT_SECRET=
CLIENT_URL=http://localhost:5173
```

Required for file uploads, all read in `server/lib/r2.js`:

```
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

Note `R2_ENDPOINT`, not `R2_ACCOUNT_ID`. This file previously listed
`R2_ACCOUNT_ID`, which no server code reads, while omitting `R2_ENDPOINT`,
which `server/lib/r2.js` actually requires. `render.yaml` still sets
`R2_ACCOUNT_ID` too; it is inert, not load-bearing.

Optional, features degrade rather than fail:

```
RESEND_API_KEY=                 # lib/sendEmail.js; email skipped with a warning if unset
FROM_EMAIL=                     # lib/sendEmail.js; falls back to onboarding@resend.dev
ADMIN_EMAIL=                    # routes/contact.js; falls back to admin@igh.local
SENTRY_DSN=                     # instrument.js; Sentry disabled if unset
PORT=3001                       # index.js; defaults to 3001
NODE_ENV=development
```

Optional, only needed to exercise billing:

```
STRIPE_SECRET_KEY=              # lib/stripe.js; throws when a billing path is hit
STRIPE_WEBHOOK_SECRET=          # routes/stripeWebhook.js
STRIPE_PRICE_MONTHLY=           # lib/stripe.js
STRIPE_PRICE_ANNUAL=            # lib/stripe.js
STRIPE_ORG_PRICE_PROFESSIONAL=  # lib/orgPlanLimits.js, org portal only
STRIPE_ORG_PRICE_GROWTH=        # lib/orgPlanLimits.js, org portal only
```

`RENDER_SERVICE_NAME` is injected by Render and read in `instrument.js` and
`lib/backup.js` to label the environment. Do not set it locally.

`JWT_SECRET` is resolved once, in `server/lib/jwtSecret.js`, and imported from
there by every route and middleware that signs or verifies a token. The server
**refuses to start** without it on anything it cannot positively identify as a
local development machine: it is exempt only when no platform signal is present
(`RENDER`, `RENDER_SERVICE_NAME`, `RENDER_EXTERNAL_URL`, `CI`) and `NODE_ENV` is
neither `production` nor `staging`. The check fails closed, so a new deployment
target that nobody thought to add to that list is required to set the secret
rather than quietly exempted from it. On a local machine it falls back to a
shared development value and warns loudly.

Note that `NODE_ENV` alone is not a reliable environment signal here: Render
sets it to `production` on every web service, staging included, which is why
`instrument.js` and `lib/backup.js` both use `RENDER_SERVICE_NAME` instead.

`CLIENT_URL` is the only var controlling CORS (`server/index.js`) - if it's unset at runtime, the CORS middleware falls back to reflecting whatever `Origin` header the request sends with `Access-Control-Allow-Credentials: true`, which allows any site to make authenticated, cookie-carrying requests to the API. This file previously (incorrectly) documented this var as `CORS_ORIGIN`, which the code never reads - verify the actual deployed value is named `CLIENT_URL` wherever this service is hosted, not just in this list.

Optional: `ORG_PORTAL_ENABLED=true` registers the org/funeral-home portal routes (`organizations.js`, `orgPortal.js`, `orgPublic.js`, `orgRegister.js`). Unset or any other value keeps them unregistered entirely, not merely rejected (SEC-12) - this is the default in production since the org portal isn't part of the initial end-user launch. Set to `true` on staging/local dev to keep testing it.

### Client and mobile

**Client:** `VITE_API_URL` (required; `client/.env.development` is committed
and supplies the local value) and `VITE_SENTRY_DSN` (optional). Production
values come from `render.yaml`, not a local file.

**Mobile:** no `.env` file at all. The API base URL is hardcoded in
`mobile/src/lib/api.js` and `mobile/src/lib/notifications.js`, and the EAS
project ID lives in `mobile/app.json`.

### Secrets management (Infisical)

Decided 2026-08-05, and complete for all three environments as of 2026-08-15: secrets moved from plaintext `.env` files / manually-pasted Render dashboard values to [Infisical](https://infisical.com), managed cloud tier. A real Infisical project now holds dev/staging/production environments, each with its own independent values (rotated/de-duplicated 2026-08-13 - `JWT_SECRET` and `RESEND_API_KEY` no longer share values across environments, and dead legacy entries like `DB_PATH`/`SECRET_WEBHOOK_SECRET` have been removed). `server/.env` still works as a local fallback (dotenv doesn't override already-set env vars, so it composes fine with the CLI below) - it isn't being ripped out, just superseded.

- **Local dev:** `npm run dev:server:infisical` (root `package.json`) runs `infisical run --env=dev -- npm run dev --workspace=server`, which injects secrets from the Infisical `dev` environment as process env vars - nothing is written to disk. Requires the Infisical CLI (`npm install -g @infisical/cli`) and `infisical login` once per machine. `.infisical.json` (project ID + default environment slug, no secret values, safe to commit) lives at the repo root once `infisical init` has been run against the real project - currently only present on one machine, not yet committed.
- **Staging/production: synced automatically since 2026-08-14 (SEC-17).** Infisical's native Render Secret Sync is connected for both services (one sync per service: `staging-secrets-sync` to `in-good-hands-api-staging`, `in-good-hands-production-secrets-sync` to `performance-api`), with Auto-Sync, Auto-Redeploy and Secret Deletion Protection enabled on each. **Infisical is now the live source of truth: change a staging or production secret in Infisical, not in Render's dashboard**, or the next sync will overwrite the hand-edit. Both syncs were created with "Import Destination Secrets - Prioritize Render Values" on first run, deliberately, so the then-unverified live Render values were preserved rather than being overwritten by a possibly-stale Infisical copy. Before this, Render's dashboard was the real source of truth and Infisical was a hand-maintained shadow copy, which is exactly how `JWT_SECRET` and `RESEND_API_KEY` drifted into duplication unnoticed before the 2026-08-13 rotation.
- **R2 buckets are separated per environment since 2026-08-15 (SEC-16).** Each environment has its own bucket (`in-good-hands-docs-dev` / `-staging` / `-production`) and its own scoped Cloudflare Account API token (Object Read & Write, applied to exactly one bucket each). Isolation was verified directly: each environment's credentials can list its own bucket and get AccessDenied against the old shared one. The two original shared-bucket tokens have been revoked. The old `in-good-hands-docs` bucket still exists but no live credential can reach it; it is retained as a passive rollback safety net pending an eventual deletion decision. Keep new environments on this pattern: one bucket, one scoped token, never a shared credential.
- **CI:** no workflow currently needs a real secret (`smoke-test.yml` and `authz-probe.yml` both boot the server with safe, hardcoded CI-only values). If one ever does, the pattern is `Infisical/secrets-action` with OIDC auth and a machine identity scoped to that one project/environment - see [Infisical's GitHub Actions docs](https://infisical.com/docs/integrations/cicd/githubactions) - not a long-lived token sitting in GitHub secrets.
- **Why Infisical over Doppler:** both were free at this project's team size (2 seats); Infisical was chosen for the free self-hosting fallback (MIT-licensed) if ever needed later, and because Doppler has no self-hosted option at all.

## Key Conventions

- **No TypeScript** — the entire project is plain JavaScript.
- **No em-dashes** anywhere in UI text, emails, PDFs, or code comments. Use commas, colons, or periods instead.
- The `shared/` package exports are imported by subpath, currently only `@in-good-hands/shared/format`. Do not use relative paths to reach shared code from client or mobile. Adding a new shared module means adding it to `shared/package.json`'s `exports` map too, or the import will not resolve.
- Database schema changes must be backwards-compatible. Add columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `database.js`; never drop or rename existing columns.
- Section data endpoints follow the pattern `GET/POST/PUT/DELETE /api/sections/:sectionName`.

### Version tracking

The client app, admin panel, and org/funeral-home portal are tracked as three independently-versioned areas (semver `MAJOR.MINOR.PATCH`), even though all three ship in the same deploy. History lives in the `app_versions` table and is visible in the admin panel's **Versions** tab (`GET/POST /api/admin/versions`).

Whenever a change is pushed that touches one of these areas, add a version entry for it (bump only the area(s) actually touched):

| Module    | Covers                                                                 |
|-----------|-------------------------------------------------------------------------|
| `client`  | Anything in `client/src` outside `pages/AdminPage.jsx` and the org portal pages |
| `admin`   | `client/src/pages/AdminPage.jsx` and `server/routes/admin.js`          |
| `org_portal` | Org/funeral-home portal pages, `server/routes/orgPortal.js`, `server/routes/organizations.js` |

Bump PATCH for fixes, MINOR for new backwards-compatible features, MAJOR for breaking changes. Insert via a one-off script (`query('INSERT INTO app_versions (module, version, summary) VALUES ($1, $2, $3)', [...])`) or the admin UI form.

### Security findings log

Security review results (audits, authorization/IDOR probes, infra reviews, secrets/session/vault-handling decisions) are logged to the `security_findings` table, not just left in chat history — the whole point is that they survive past whatever session produced them and are readable in dev, staging, and production alike. Visible in the admin panel's **Security** tab (`GET/POST/PUT /api/admin/security-findings`, admin-only).

**When to check it:** at the start of a security-related task, `GET /api/admin/security-findings` (or query the table directly) before re-deriving findings from scratch — a prior review may already cover it.

**When to add to it:** after any nontrivial security review, decision, or fix — not just vulnerabilities found, but "checked X, it's clean" results and explicit decisions (e.g. "not pursuing RLS, relying on the authz-probe CI check instead") are worth logging too, so a future review doesn't re-litigate the same question from zero.

Each row has: `title`, `category` (`authorization` / `injection` / `xss` / `secrets` / `infrastructure` / `session` / `documentation` / `ci-cd` / `other`), `severity` (`info` / `low` / `medium` / `high` / `critical`), `status` (`open` / `monitoring` / `resolved` / `accepted_risk`), `summary`, optional `details`, optional `source` (e.g. `"Claude Code security review, 2026-08-05"`), optional `related_link` (e.g. a GitHub issue URL), `discovered_at`, `resolved_at`.
