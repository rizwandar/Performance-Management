# External Services & Infrastructure — In Good Hands

No secret values are included below — only service names, purposes, and environment variable
**names**.

## Hosting

| Service | Role | Notes |
|---|---|---|
| **Render** | Hosts both web services (API, client static site) and managed PostgreSQL, for staging (per checked-in `render.yaml`) and presumably production (services named `performance-api`/`performance-client`/`in-good-hands-db` per the file's own comment; not captured in a checked-in Blueprint — **assumption, verify in the Render dashboard**) | Client deploys as a static site with an SPA rewrite rule; API deploys as a Node web service |
| **Domain / DNS** | `ingoodhandsplan.com` is the production custom domain (per project memory, not verifiable from this repo's checked-in config) | Unknown / requires clarification exactly how DNS is managed (Render-managed vs. external registrar) |

## Database

| Service | Role | Env vars |
|---|---|---|
| **Render managed PostgreSQL** | Primary datastore, single instance per environment | `DATABASE_URL` |

## Source control / CI

| Service | Role |
|---|---|
| **GitHub** | Source control; `gh` CLI referenced in project workflow conventions |
| **GitHub Actions** | CI — `.github/workflows/smoke-test.yml`: client lint + build, and a Postgres-backed server smoke test (health check, bad-login-returns-400, unauthenticated-route-returns-401). Runs on push/PR to `main` and `staging`. No deploy step in this workflow — deploys are Render's own auto-deploy-on-push (inferred from `render.yaml`'s Blueprint model; not confirmed against an actual Render service config in this pass) |

## Email

| Service | Role | Env vars |
|---|---|---|
| **Resend** | Transactional email (verification, password reset, trusted-contact access links, inactivity reminders, executor notifications, account-deletion confirmation) | `RESEND_API_KEY`, `FROM_EMAIL` (optional; falls back to Resend's shared test domain, which can only deliver to the account owner's own address until a verified domain + `FROM_EMAIL` are set) |

Mobile relevance: **indirect only** — all email is server-triggered; mobile never calls Resend
directly and needs no Resend credentials.

## Payments

| Service | Role | Env vars |
|---|---|---|
| **Stripe** | Consumer subscription billing (Checkout Sessions, webhooks) and org billing | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_ORG_PRICE_GROWTH`, `STRIPE_ORG_PRICE_PROFESSIONAL` |

Mobile relevance: **indirect only, and should stay that way for v1.** Mobile should never embed
Stripe Checkout or hold Stripe keys; if the user wants to upgrade, the recommended pattern is
directing them to `ingoodhandsplan.com` in a browser, per the product brief.

## File / object storage

| Service | Role | Env vars |
|---|---|---|
| **Cloudflare R2** (S3-compatible) | All uploaded documents/photos and the custom site logo | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` |

Mobile relevance: **indirect only** — mobile uploads go through the API's `multer`-backed upload
routes, and downloads use short-lived signed URLs the API generates; no R2 credentials should ever
reach a client (web or mobile).

## Error tracking / observability

| Service | Role | Env vars |
|---|---|---|
| **Sentry** | Server error tracking (`@sentry/node`, initialized in `server/instrument.js`) and client error tracking (`@sentry/react`) | `SENTRY_DSN` (server), a client-side equivalent referenced in `render.yaml` as `VITE_SENTRY_DSN` for the web build |

Mobile relevance: **direct, if desired** — a mobile Sentry SDK (`@sentry/react-native`) would be
an independent integration; nothing here blocks or requires it, and none of the existing DSNs
should be reused without registering a distinct Sentry project/environment for mobile (mirroring
how staging keeps its own DSN separate from production, per `render.yaml`).

## Push notifications

| Service | Role |
|---|---|
| **Expo Push API** (`exp.host`) | Server calls this directly via `fetch` (no SDK) to deliver push notifications, using each user's `users.expo_push_token` | Already wired end-to-end: mobile registers via `POST /api/users/me/device-token`, server sends via `server/lib/inactivityTimer.js`'s `sendPushNotification` |

## Third-party data

| Service | Role | Env vars |
|---|---|---|
| **Deezer** | Song search/metadata for "Songs That Define Me," proxied through `server/routes/deezer.js` so no Deezer credentials reach the client | Unknown / requires clarification — no Deezer-specific env var name was found in `server/.env`'s key list in this pass; verify whether the current implementation uses an unauthenticated public Deezer endpoint or a key not yet inventoried |

## Secrets / configuration management

- All secrets live in `server/.env` (gitignored) locally, and as Render environment variables in
  staging/production — no secrets manager (Vault, AWS Secrets Manager, etc.) is in use.
- `render.yaml` marks sensitive values `sync: false` (must be set manually in the Render
  dashboard, never committed) and non-sensitive values (e.g. `CLIENT_URL`, Stripe *price IDs* —
  not secret keys) as plain `value:` entries checked into the Blueprint.
- Confirmed **dead/unused** env var: `VAULT_KEY` — referenced in project CLAUDE.md and
  historically in server env-var lists, but not read anywhere in `server/lib/vault.js` or any
  other file found in this pass; `render.yaml`'s own comment confirms this. Do not provision it
  for a new (e.g. mobile-backend) environment.
- Env var naming discrepancy: project CLAUDE.md lists `CORS_ORIGIN`; the actual code
  (`server/index.js`) reads `process.env.CLIENT_URL` for the same purpose. Use `CLIENT_URL`.

## Full server environment variable inventory (names only, from `server/.env`)

`CLIENT_URL`, `CLIENT_URL_ALT`, `DATABASE_URL`, `DB_PATH` *(present in `.env` but confirmed unused
by `server/db/database.js`, which reads only `DATABASE_URL` — likely leftover from the pre-Postgres
SQLite era)*, `JWT_SECRET`, `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ENDPOINT`,
`R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`, `STRIPE_ORG_PRICE_GROWTH`,
`STRIPE_ORG_PRICE_PROFESSIONAL`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PRICE_MONTHLY`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

## Services a future mobile app would interact with directly vs. indirectly

| Direct (mobile talks to it itself) | Indirect (only via the API) |
|---|---|
| The In Good Hands API itself (Render-hosted) | PostgreSQL |
| Expo's own infrastructure (push delivery to the device, EAS build service — already configured, `mobile/app.json`) | Cloudflare R2 |
| Optionally, its own Sentry project | Resend |
| | Stripe |
| | Deezer |
