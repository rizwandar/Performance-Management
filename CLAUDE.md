# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**In Good Hands** is an end-of-life planning web and mobile app. Users record personal wishes, legal documents, financial details, medical preferences, funeral wishes, and more across 14 sections. Designated trusted contacts can access this information when the owner becomes inactive.

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

## Architecture

### Monorepo Workspaces
- `client/` — React 19 + Vite SPA
- `server/` — Express 5 REST API
- `mobile/` — Expo 54 / React Native (Expo Router)
- `shared/` — shared constants and helpers (`api.js`, `auth.js`, `constants.js`)

The client and mobile apps import from `@in-good-hands/shared`. The Vite config aliases this path; Expo resolves it via `metro.config.js`.

### Server (`server/`)

**Entry:** `server/index.js` — sets up Express, registers all route files, starts node-cron for the daily inactivity check (8am).

**Database:** PostgreSQL via `pg` (`server/db/database.js`, connected via the `DATABASE_URL` env var). Schema and all migrations live in the same file. There is no separate migration runner — migrations run inline at startup via `ALTER TABLE IF NOT EXISTS` guards.

**Routes** are in `server/routes/`. One file per domain: `auth.js`, `users.js`, `sections.js`, `trusted-contacts.js`, `documents.js`, `export.js`, `billing.js`, `admin.js`, `deezer.js`, `contact.js`.

**Key middleware:**
- `server/middleware/auth.js` — JWT verification (from an httpOnly cookie for web, or an `Authorization: Bearer` header for mobile, which has no browser cookie jar), attaches `req.user`. Also enforces CSRF (double-submit cookie) on mutating requests authenticated via cookie, and live-checks session_version/is_active/is_admin against the DB (SEC-04/SEC-10)
- `server/middleware/adminAuth.js` — requires `req.user.role === 'admin'`
- Rate limiting: 20 req/15 min on auth routes, 200 req/15 min on API routes

**Vault encryption:** `server/lib/vault.js` — AES-256-GCM encryption for digital credentials (Section 3). There is no server-side master key: the encryption key is derived per-request via scrypt from the user's own vault password plus their user ID (`SALT_PREFIX` + userId as the deterministic salt), so the vault password is never stored (not even hashed) and the server can only decrypt vault data while actively handling a request that carries the correct password. `render.yaml` deliberately provisions no `VAULT_KEY` secret for this reason.

**File uploads:** `server/lib/r2.js` — Cloudflare R2 via AWS S3 SDK. Env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

**Email:** Resend API via `server/lib/email.js`. Env var: `RESEND_API_KEY`.

**Admin seed:** On first run, an admin user is created: `admin@igh.local` / `Admin1234`.

### Client (`client/src/`)

**Routing:** React Router v6, all routes in `App.jsx`. Protected routes check `AuthContext`.

**Context:**
- `context/AuthContext.jsx` — login/logout, cached user state. The session JWT itself lives only in an httpOnly cookie set by the server (SEC-09); the client never reads or stores it, only a `csrf_token` cookie value it echoes back as an `X-CSRF-Token` header on mutating requests.
- `context/SubscriptionContext.jsx` — freemium plan state

**Section pages** follow a consistent pattern: fetch data on mount, render a list of `ItemCard` components, open a `FormModal` for create/edit. The 14 sections are: Legal Documents, Digital Vault, Financial, Medical, Property, Messages, Funeral Wishes, Obituary, Music, Pets, Charities, Biography, Bucket List, Trusted Contacts.

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
CLIENT_URL=http://localhost:5173
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
RESEND_API_KEY=
```

Optional: `ORG_PORTAL_ENABLED=true` registers the org/funeral-home portal routes (`organizations.js`, `orgPortal.js`, `orgPublic.js`, `orgRegister.js`). Unset or any other value keeps them unregistered entirely, not merely rejected (SEC-12) - this is the default in production since the org portal isn't part of the initial end-user launch. Set to `true` on staging/local dev to keep testing it.

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
