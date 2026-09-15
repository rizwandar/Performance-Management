# Repository Map — In Good Hands

Explains what each major directory/file is for, whether mobile development needs to understand
it, and whether its logic is web-specific or shareable. Not an exhaustive file listing — see
[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) for the architectural narrative.

## Top level

| Path | Purpose | Mobile needs to read? | Web-specific or shareable? |
|---|---|---|---|
| `package.json` | npm workspaces root: `shared`, `client`, `server`, `mobile` | Yes — confirms mobile is already a workspace member | N/A |
| `render.yaml` | Render staging deployment Blueprint | No | Web/infra-specific |
| `.github/workflows/smoke-test.yml` | CI: client lint+build, server smoke test | No (no mobile CI exists yet) | Web-specific today |
| `CLAUDE.md` | Project instructions for Claude Code | Background context only | N/A — **has known stale sections**, see [ARCHITECTURE_DECISIONS_AND_GAPS.md](./ARCHITECTURE_DECISIONS_AND_GAPS.md) |
| `docs/` | This documentation package | Yes — start here | N/A |

## `server/` — the API a mobile app will actually talk to

| Path | Contains | Mobile relevance | Notes |
|---|---|---|---|
| `server/index.js` | Express bootstrap, middleware chain, route mounting, cron schedule | High — defines every mount path and global behavior (rate limits, CORS, maintenance mode) | CORS middleware is browser-only; irrelevant to native HTTP calls |
| `server/db/database.js` | Postgres pool, `query`/`queryOne`/`queryAll`/`transaction`, **entire schema + migrations** | High for understanding data shapes; not called directly by any client | No ORM — read this file to know the real column names, since no schema/types file exists elsewhere |
| `server/routes/` | One file per domain — see [API_AND_SERVICE_MAP.md](./API_AND_SERVICE_MAP.md) for the full endpoint table | High | Owns all request validation, auth checks, and response shaping |
| `server/middleware/auth.js` | JWT verification, `req.user` attachment, view-as session handling | High — read before building mobile auth | View-as logic is org-portal-only; safe to ignore for Mobile v1 |
| `server/middleware/requiresPremium.js` | Single gate for premium-only routes | High — the authoritative "is this free or premium" check | Never re-implement this logic client-side |
| `server/middleware/orgAuth.js` | Org-role gates | No | Org portal only |
| `server/middleware/validate.js` | `express-validator` error formatter | No | Server-internal |
| `server/lib/vault.js` | AES-256-GCM vault crypto (server-side only) | Low — mobile only ever sends a vault password string, never touches crypto directly | Must never be ported to a client |
| `server/lib/subscription.js` | `getUserPlan`/`isPremium` — authoritative plan resolution | Medium — mirrors what `GET /api/billing/access` returns | Reference for expected response shape |
| `server/lib/r2.js` | Cloudflare R2 upload/download/signed-URL helpers | Low — mobile calls the upload/download **routes**, never R2 directly | Credentials never leave the server |
| `server/lib/sendEmail.js`, `emailTemplates.js` | Resend transactional email | No | Server-internal |
| `server/lib/inactivityTimer.js` | Inactivity cron logic, reminder emails, Expo push sends, executor notification | Medium — mobile should register a push token (`POST /users/me/device-token`) so this logic can reach it, but the logic itself stays server-side | Authoritative for the inactivity business rule |
| `server/lib/deceased.js` | Single entry point for marking a user deceased | Low for Mobile v1 (not a free-plan MVP feature) | Authoritative — never duplicate |
| `server/lib/vaultSections.js` | `VAULT_PROTECTED_SECTIONS` set — which section IDs require the vault password | High — defines exactly which sections are premium/vault-gated | Single source of truth, reuse the same section-ID strings |
| `server/lib/vaultAttempts.js` | Vault lockout/attempt-counter logic | Low | Server-internal |
| `server/lib/backup.js` | Daily DB backup job | No | Ops-only |
| `server/lib/generatePdf.js` | `pdfkit`-based PDF rendering | No | Web/export-specific, premium-gated |
| `server/lib/stripe.js` | Stripe SDK init + price-ID map | No | Server-internal; mobile never talks to Stripe directly |
| `server/instrument.js` | Sentry init (referenced by `index.js`, not separately read in this pass) | No | Server-internal |

## `client/` — the web SPA (reference, not to be ported wholesale)

| Path | Contains | Mobile relevance | Notes |
|---|---|---|---|
| `client/src/App.jsx` | All routes, theming, nav, footer | Reference only — shows every route mobile might need an equivalent for | Contains web-only concerns (Bootstrap nav, CSS theme variables) that don't translate to React Native |
| `client/src/context/AuthContext.jsx` | Token storage (`localStorage`), axios interceptors, view-as swap | Reference for the auth *contract* (what `/api/auth/login` returns, how expiry is checked) | Storage mechanism itself (`localStorage`) is **not** appropriate for mobile — mobile already correctly uses `expo-secure-store` instead (see `mobile/src/context/AuthContext.js`) |
| `client/src/context/SubscriptionContext.jsx` | Plan/premium state, "fail open" pattern | Reference — mobile's own `SubscriptionContext.js` already mirrors this exactly | Good pattern to keep consistent across clients |
| `client/src/pages/sections/*.jsx` | One page per section (Legal Documents, Financial Affairs, …) | Reference for what fields/flows each section needs | Premium sections here should **not** be mirrored in Mobile v1 |
| `client/src/pages/AdminPage.jsx`, `pages/admin/*` | Admin panel | None | Explicitly out of mobile scope |
| `client/src/pages/org/*` | Org/funeral-home portal pages | None | Explicitly out of mobile scope |
| `client/src/pages/AccessPage.jsx` | Public trusted-contact access-link viewer (no login) | Low for v1 | Interesting future pattern (token-based, no-auth read view) but not part of the free individual-user MVP |

## `shared/` — intended cross-platform code, currently minimal

| Path | Contains | Mobile relevance |
|---|---|---|
| `shared/format.js` | `formatPhone()` — display-only phone formatting via `libphonenumber-js` | Import as `@in-good-hands/shared/format`; genuinely reusable as-is |
| `shared/package.json` | Declares the one export above | N/A |

This is the **only** code in `shared/` today. CLAUDE.md's description of `api.js`/`auth.js`/
`constants.js` living here does not match the repository — see
[ARCHITECTURE_DECISIONS_AND_GAPS.md](./ARCHITECTURE_DECISIONS_AND_GAPS.md). Any future shared
API-client or shared validation/constants module would need to be created here from scratch.

## `mobile/` — the existing partial Expo app

See [MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md) for a full assessment.
Summary of structure:

| Path | Contains |
|---|---|
| `mobile/app/` | Expo Router file-based routes: `(auth)/` (login/register/forgot-password), `(tabs)/` (dashboard/profile/**upgrade**), `section/[id].js` |
| `mobile/src/screens/` | One screen per section — **includes premium sections** (`LegalDocumentsScreen.js`, `FinancialScreen.js`, `PropertyScreen.js`, `HouseholdScreen.js`, `DigitalLifeScreen.js`) and an `UpgradeScreen.js` |
| `mobile/src/context/AuthContext.js`, `SubscriptionContext.js` | Mirrors the web contexts; correctly uses `expo-secure-store` instead of `localStorage` |
| `mobile/src/lib/api.js` | Axios client with a **hardcoded production API URL** (`https://performance-api-djuk.onrender.com/api`), no env-based config |
| `mobile/src/lib/notifications.js` | Expo push token registration, calls `POST /users/me/device-token` |
| `mobile/app.json` | Expo config — bundle ID `com.ingoodhands.app` for both iOS and Android, EAS project ID already provisioned |

**This existing code includes premium/upgrade screens that conflict with the stated Mobile v1
scope (free-only, no upgrade UI).** Flagged in detail in
[MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md).

## Directories not present

The task brief's generic list (`/app`, `/components`, `/api`, `/lib`, `/services`, `/database`,
`/rules`, `/tests`) doesn't map 1:1 onto this repo's actual layout. Specifically:

- **No project-level `/rules` directory exists** in this repository (only `node_modules/**/rules`
  from ESLint's internals, which is unrelated tooling, not project documentation). The
  user's global Claude configuration has its own `rules/` directory, but that is outside this
  repository and was already reviewed as part of standing instructions, not project-specific
  documentation.
- **No `/tests` directory / test framework** — CLAUDE.md confirms "No test framework is
  configured," and no test files were found in `client/`, `server/`, or `mobile/`. The only
  automated check is the CI smoke test (three `curl` assertions against a running server) and
  the client lint/build step. See [ARCHITECTURE_DECISIONS_AND_GAPS.md](./ARCHITECTURE_DECISIONS_AND_GAPS.md).
