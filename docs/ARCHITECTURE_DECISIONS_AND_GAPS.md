# Architecture Decisions & Gaps — In Good Hands

## Confirmed decisions (clearly established in code)

- **PostgreSQL is the database**, accessed with raw SQL through `pg`, no ORM. Confirmed directly
  in `server/db/database.js`.
- **Auth is stateless JWT bearer-token**, not cookie/session-based. Confirmed in
  `server/middleware/auth.js` and every route requiring auth.
- **No API versioning** — a single unversioned `/api/*` surface shared by all clients.
- **Entitlement (Free/Premium) is resolved server-side, per-request, from a separate
  `subscriptions` table** — never trusted from a token claim or client state. Confirmed in
  `server/lib/subscription.js` and `middleware/requiresPremium.js`.
- **Vault encryption keys are derived from the user's own vault password**, never from a
  server-side secret. Confirmed in `server/lib/vault.js` and explicitly called out as dead config
  (`VAULT_KEY`) in `render.yaml`'s comments.
- **The org/funeral-home portal is fully implemented**, not merely conceptual. Confirmed across
  `organizations.js`, `orgPortal.js`, `orgPublic.js`, `orgRegister.js`, and the corresponding
  schema tables.
- **No test framework is configured** anywhere in the repo (client, server, or mobile). The only
  automated verification is `.github/workflows/smoke-test.yml` (client lint+build, three curl
  assertions against a running server).
- **`shared/` currently exports only `formatPhone()`** — no shared API client, auth helper, or
  constants module exists yet.

## Inferred decisions (appear intentional, not explicitly documented anywhere)

- **The 14-section split into 9 free + 5 vault-protected/premium sections** appears deliberate and
  consistent (matches both the middleware gates and the `billing.js` plan-description text
  exactly), but no single design document states *why* this particular split was chosen (e.g. why
  Household Info is premium but Medical Wishes is free). Treat the current split as the intended
  product design, not an accident, but note that its rationale is not written down anywhere found.
- **Email verification is deliberately non-blocking.** A user can fully use the app before
  verifying. This looks like an intentional choice to reduce registration friction rather than an
  oversight, given the polished banner UX around it, but is not stated as a decision anywhere.
- **The Stripe webhook is the source of truth for subscription state changes out-of-band** (e.g. a
  dashboard-initiated cancellation), while the `cancel`/`reinstate` routes also apply Stripe's
  response directly to avoid a race with the async webhook. This dual-write pattern is inferred
  from code comments in `billing.js`, not documented as an architectural principle elsewhere.
- **One executor maximum, chosen from the up-to-3 trusted contacts, gets escalated notification
  and demise-confirmation power** — this looks like a deliberate simplification of an
  "estate executor" concept into the product's trusted-contact model, but there's no product
  document explaining the choice to reuse trusted-contacts rather than build a separate concept.

## Rules vs. implementation discrepancies

The task brief asked for a `/rules` directory review. **No project-level `/rules` directory
exists in this repository** — searched exhaustively, the only `rules/` matches are inside
`node_modules/eslint/lib/rules/` (ESLint's internal rule implementations, unrelated to project
documentation). The closest analogues actually reviewed were the project's `CLAUDE.md` and this
session's project memory. Discrepancies found between those and the actual code:

| Documented (CLAUDE.md) | Actual implementation | Where confirmed |
|---|---|---|
| Database is "SQLite via `better-sqlite3`" | PostgreSQL via `pg` | `server/db/database.js:1` |
| `DB_PATH` env var configures the DB | `DATABASE_URL` is what's actually read; `DB_PATH` exists in `.env` but is unused by any code found | `server/db/database.js:4`, grep of `.env` keys |
| `CORS_ORIGIN` env var | Code reads `CLIENT_URL` | `server/index.js:19` |
| `VAULT_KEY` "Encryption key derived from `VAULT_KEY` env var" | Key is derived per-request from the user's vault password + userId (scrypt); no server-side key material at all | `server/lib/vault.js:33-40`, `render.yaml` comment |
| `shared/` "exports `api.js`, `auth.js`, `constants.js`" | Only `format.js` exists | `shared/package.json`, directory listing |
| 14 sections, no mention of a duplicate songs/bucket-list system | Two parallel implementations exist (`songs_that_define_me`/`life_wishes` proper sections vs. `favourite_songs`/`bucket_list_items` legacy profile-attached lists) | `server/routes/sections.js` vs. `server/routes/users.js` |
| No mention of a partial mobile app already existing | `mobile/` contains a substantial, partially-built Expo app including Premium-section screens and an Upgrade tab | `mobile/app/`, `mobile/src/` |

**Note on project memory vs. this worktree's CLAUDE.md:** per this session's project memory, the
PostgreSQL correction was already made on `origin/main`/`origin/staging` (PRs #87/#88,
2026-08-11); the specific worktree this documentation task ran from still has the pre-correction
CLAUDE.md text. This document reflects the actual code, which is the higher-confidence source
regardless of which branch's CLAUDE.md is being read.

## Unresolved architectural questions

These are decisions the user (not this documentation task, and not Codex unilaterally) should make
before Mobile MVP v1 implementation begins:

1. **Mobile token lifetime.** Keep the 8-hour JWT as-is (frequent re-login), give mobile a longer
   `expiresIn`, or build a refresh-token flow? See [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md).
2. **What to do with the existing `mobile/` code.** Prune the Premium/admin-adjacent parts of the
   existing skeleton and build v1 as a scoped-down version of it, or start clean and treat the
   existing code as reference only? See [MOBILE_INTEGRATION_READINESS.md](./MOBILE_INTEGRATION_READINESS.md).
3. **Which songs/bucket-list implementation is canonical.** The proper section tables
   (`songs_that_define_me`, `life_wishes`) or the legacy profile-attached ones (`favourite_songs`,
   `bucket_list_items`)? Building mobile against the wrong one risks a lasting UX/data split from
   web.
4. **Whether the free basic PDF export (`GET /api/export`) is in scope for v1.** It's technically
   free and unauthenticated-premium-wise, but PDF-on-mobile has its own UX considerations
   (in-app viewer vs. share-sheet download) not yet decided.
5. **Whether the Key Contacts / trusted-contacts sharing feature is in the v1 slice**, given its
   relative complexity (executor designation, per-section permission matrix, emailed access links)
   compared to the simpler CRUD sections.
6. **Mobile release/version tracking.** The existing `app_versions` table's `module` check
   constraint doesn't include `mobile` — worth a decision on whether to extend it or track mobile
   releases separately (e.g. purely through EAS/App Store Connect/Play Console, with no DB
   involvement).
7. **Production hosting details for the API mobile will call.** This document could not confirm
   production Render service names/regions or DNS management from checked-in config alone
   (`render.yaml` is staging-only) — verify directly in the Render dashboard before hardcoding any
   production URL into a mobile build.
