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

**Before promoting any code to production** (merging a `staging` → `main` PR, or any other action that pushes changes into the live production branch/environment), run an adversarial security review of the changes being promoted first:

1. Run the `/security-review` skill against the full diff going into production (compare against `main`, not just the latest commit — a promotion can carry forward several commits).
2. Review adversarially: actively look for ways a real attacker could hack, leak, or corrupt user data, not just style or correctness issues. Pay particular attention to authorization/access-control bypasses, cross-user data leakage (IDOR), injection, unvalidated/unsanitized input, insecure file uploads, secrets or vault-protected data leaking into logs/responses/error messages, and any change touching auth, vault encryption, billing, or the org portal.
3. Severity gate: low/informational findings can be noted and the promotion can proceed. Any finding at **medium severity or above must pause the promotion** — report it and get explicit user sign-off before merging or deploying, do not resolve that judgment call unilaterally.
4. This gate applies specifically to production promotions. It is not required for every regular commit on a feature/dev branch.

## Architecture

### Monorepo Workspaces
- `client/` — React 19 + Vite SPA
- `server/` — Express 5 REST API
- `mobile/` — Expo 54 / React Native (Expo Router)
- `shared/` — shared constants and helpers (`api.js`, `auth.js`, `constants.js`)

The client and mobile apps import from `@in-good-hands/shared`. The Vite config aliases this path; Expo resolves it via `metro.config.js`.

### Server (`server/`)

**Entry:** `server/index.js` — sets up Express, registers all route files, starts node-cron for the daily inactivity check (8am).

**Database:** PostgreSQL via `pg` (node-postgres), using the `Pool` implementation in `server/db/database.js`, connected through the `DATABASE_URL` env var. Schema initialization and migrations remain inline at application startup, via patterns such as `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. There is currently no separate migration runner.

**Routes** are in `server/routes/`. One file per domain: `auth.js`, `users.js`, `sections.js`, `trusted-contacts.js`, `documents.js`, `export.js`, `billing.js`, `admin.js`, `deezer.js`, `contact.js`.

**Key middleware:**
- `server/middleware/auth.js` — JWT verification (from an httpOnly cookie for web, or an `Authorization: Bearer` header for mobile, which has no browser cookie jar), attaches `req.user`. Also enforces CSRF (double-submit cookie) on mutating requests authenticated via cookie, and live-checks session_version/is_active/is_admin against the DB (SEC-04/SEC-10)
- `server/middleware/adminAuth.js` — requires `req.user.role === 'admin'`
- Rate limiting: 20 req/15 min on auth routes, 200 req/15 min on API routes

**Vault encryption:** `server/lib/vault.js` — AES-256-GCM encryption for digital credentials (Section 3). No server-held key: each encryption key is derived on the fly via scrypt from the user's own vault password (never stored) plus their userId. There is no `VAULT_KEY` env var.

**File uploads:** `server/lib/r2.js` — Cloudflare R2 via AWS S3 SDK. Env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

**Email:** Resend API via `server/lib/email.js`. Env var: `RESEND_API_KEY`.

**Admin seed:** On first run, an admin user is created: `admin@igh.local` / `Admin1234`.

### Client (`client/src/`)

**Routing:** React Router v6, all routes in `App.jsx`. Protected routes check `AuthContext`.

**Context:**
- `context/AuthContext.jsx` — login/logout, cached user state. The session JWT itself lives only in an httpOnly cookie set by the server (SEC-09); the client never reads or stores it, only a `csrf_token` cookie value it echoes back as an `X-CSRF-Token` header on mutating requests.
- `context/SubscriptionContext.jsx` — freemium plan state

**Section pages** follow a consistent pattern: fetch data on mount, render a list of `ItemCard` components, open a `FormModal` for create/edit. The sections include: Legal Documents, Digital Vault, Financial, Doctors, Medical Records, Donation Bank (since IDEA-32, split out of a formerly combined Medical & Care Wishes section - Donation Bank is vault-protected, Doctors and Medical Records are not), Property, Messages, Funeral Wishes, Obituary, Music, Pets, Charities, Biography, Bucket List, Trusted Contacts, Pet Care (its own standalone section since IDEA-18), Emergency Contact (since IDEA-27, split out of what was previously a combined "Key Contacts" page), Insurance (since IDEA-29), Unfinished Business (since IDEA-19, reconciliation/apologies/loose-ends, deliberately distinct from Bucket List and Messages to Loved Ones), and Your Last Moments (since IDEA-30, a single dedicated final recording/letter, distinct from the Messages section). This list has drifted from the actual dashboard before; verify against `client/src/pages/DashboardPage.jsx`'s `SECTIONS` array rather than trusting this sentence.

**Admin panel** (`pages/Admin.jsx`) — theme/font switcher (3 warm themes, 3 fonts stored in `app_settings` table), logo upload for white-labelling, user management, maintenance tools.

### Mobile (`mobile/`)

Expo Router with file-based routing in `mobile/app/`. Bottom tab navigation mirrors the main sections. Uses `expo-secure-store` for token storage and `expo-notifications` for push notifications. Build config: `app.json` (bundle ID `com.ingoodhands.app`).

### Freemium Model

Free users have limited section capacity. Premium users are unlocked. All users who registered before the freemium launch were auto-granted premium. Subscription state is checked via `SubscriptionContext` on the client and enforced in `server/routes/billing.js`.

### Inactivity System

A node-cron job runs daily at 8am. It checks `users.last_active` against each user's configured inactivity period. When triggered, it emails the user a warning, then (after a grace period) notifies trusted contacts with time-limited access tokens.

## Environment Variables (Server)

Required in `server/.env`:

```
JWT_SECRET=
DATABASE_URL=
CORS_ORIGIN=http://localhost:5173
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
RESEND_API_KEY=
```

Optional: `ORG_PORTAL_ENABLED=true` registers the org/funeral-home portal routes (`organizations.js`, `orgPortal.js`, `orgPublic.js`, `orgRegister.js`). Unset or any other value keeps them unregistered entirely, not merely rejected (SEC-12) - this is the default in production since the org portal isn't part of the initial end-user launch. Set to `true` on staging/local dev to keep testing it.

### Secrets management (Infisical)

Decided 2026-08-05: secrets are moving from plaintext `.env` files / manually-pasted Render dashboard values to [Infisical](https://infisical.com), managed cloud tier. A real Infisical project now holds dev/staging/production environments, each with its own independent values (rotated/de-duplicated 2026-08-13 - `JWT_SECRET` and `RESEND_API_KEY` no longer share values across environments, and dead legacy entries like `DB_PATH`/`SECRET_WEBHOOK_SECRET` have been removed). `server/.env` still works as a local fallback (dotenv doesn't override already-set env vars, so it composes fine with the CLI below) - it isn't being ripped out, just superseded.

- **Local dev:** `npm run dev:server:infisical` (root `package.json`) runs `infisical run --env=dev -- npm run dev --workspace=server`, which injects secrets from the Infisical `dev` environment as process env vars - nothing is written to disk. Requires the Infisical CLI (`npm install -g @infisical/cli`) and `infisical login` once per machine. `.infisical.json` (project ID + default environment slug, no secret values, safe to commit) lives at the repo root once `infisical init` has been run against the real project - currently only present on one machine, not yet committed.
- **Staging/production: NOT yet synced automatically.** Render's own dashboard env vars are still the actual live source of truth for the running services - Infisical holds a separate copy of the same values that currently has to be updated by hand, alongside Render, every time a secret changes (this bit both JWT_SECRET and RESEND_API_KEY during the 2026-08-13 rotation - Infisical's copy and Render's live copy had drifted apart before that). The planned fix is Infisical's native Render Secret Sync integration (Project > Integrations > Secret Syncs > Render, one sync per Render service, connected with a Render API key entered directly in Infisical's UI), which would make Infisical the actual source of truth instead of a shadow copy - not connected yet.
- **Known gap, tracked separately:** dev/staging/production currently share one Cloudflare R2 bucket (and staging/production share R2 credentials too) - not yet split into separate buckets/credentials per environment.
- **CI:** no workflow currently needs a real secret (`smoke-test.yml` and `authz-probe.yml` both boot the server with safe, hardcoded CI-only values). If one ever does, the pattern is `Infisical/secrets-action` with OIDC auth and a machine identity scoped to that one project/environment - see [Infisical's GitHub Actions docs](https://infisical.com/docs/integrations/cicd/githubactions) - not a long-lived token sitting in GitHub secrets.
- **Why Infisical over Doppler:** both were free at this project's team size (2 seats); Infisical was chosen for the free self-hosting fallback (MIT-licensed) if ever needed later, and because Doppler has no self-hosted option at all.

## Key Conventions

- **No TypeScript** — the entire project is plain JavaScript.
- **No em-dashes** anywhere in UI text, emails, PDFs, or code comments. Use commas, colons, or periods instead.
- The `shared/` package exports are imported as `@in-good-hands/shared/api`, etc. Do not use relative paths to reach shared code from client or mobile.
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
