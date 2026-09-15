# Mobile Integration Readiness — In Good Hands

This is the primary handoff assessment for Codex. It does not design or build the mobile app —
it assesses how ready the existing website/backend is to support one, and flags what already
exists that Codex should know about before writing a single line of mobile code.

## Important: a partial mobile app already exists

Before anything else — **`mobile/` is not an empty scaffold.** It's a working-in-progress Expo
app with:

- Full Expo Router navigation (`(auth)` stack, `(tabs)` bottom nav, dynamic `section/[id]`).
- Auth (`mobile/src/context/AuthContext.js`) and Subscription (`SubscriptionContext.js`) contexts
  that already correctly call the real API and store the token in `expo-secure-store`.
- An API client (`mobile/src/lib/api.js`) with methods for **every** section, including all four
  Premium sections (`legalApi`, `financialApi`, `propertyApi`, `householdApi`) and the vault
  (`digitalApi`).
- Screens for every section, including `LegalDocumentsScreen.js`, `FinancialScreen.js`,
  `PropertyScreen.js`, `HouseholdScreen.js`, `DigitalLifeScreen.js`.
- A dedicated `upgrade` tab (`mobile/app/(tabs)/upgrade.js` → `UpgradeScreen.js`) in the main tab
  bar, alongside "My Plans" and "Profile."
- Push notification registration already wired to the real device-token endpoint.
- `app.json` with production bundle identifiers already set (`com.ingoodhands.app`, both iOS and
  Android) and an EAS project ID already provisioned.

**This directly conflicts with the stated Mobile v1 scope** ("NOT include Premium features,
locked premium screens... admin... organization functionality"). The existing code is not a clean
starting point for a from-scratch free-only build — it's a superset that includes exactly the
things v1 should exclude.

**Recommendation:** treat `mobile/` as a reference implementation of *patterns* (how auth/token
storage/API calls are structured — these are sound) rather than a codebase to build directly on
top of. Before extending it, explicitly strip or gate out: the `upgrade` tab, all Premium-section
screens/API methods, and decide whether the hardcoded production API URL
(`https://performance-api-djuk.onrender.com/api` in `mobile/src/lib/api.js:4`, no env-based
config, no localhost/staging option) is acceptable or needs environment-awareness added. This is
a decision for the user/Codex, not something to silently fix.

## Current reusable assets

| Asset | Location | Why it's reusable as-is |
|---|---|---|
| JWT bearer-token auth | `server/routes/auth.js`, `middleware/auth.js` | Already proven to work from a non-browser client; no cookie/CORS entanglement |
| Full Free-tier REST API | `server/routes/sections.js`, `trustedContacts.js`, `users.js` (profile parts) | Generic JSON, no HTML/web-only response shapes |
| Entitlement check | `GET /api/billing/access`, `server/lib/subscription.js` | Single source of truth, safe to poll from mobile |
| Business logic (completion counts, timer math, validation rules) | Various `server/lib/*.js` and inline route validation | Server-enforced regardless of client |
| Public branding settings | `GET /api/settings` | Already consumed correctly by the existing mobile skeleton |
| Push notification plumbing | `server/lib/inactivityTimer.js`, `POST /api/users/me/device-token` | Expo-specific and already working |
| Secure token storage pattern | `mobile/src/context/AuthContext.js` (uses `expo-secure-store`) | Correct choice, better than the web client's `localStorage` |
| Deezer search proxy | `server/routes/deezer.js` | Keeps third-party credentials off the client |
| `formatPhone()` | `shared/format.js` | Genuinely shared, works in RN |

## Web-specific implementation (cannot / should not be reused directly)

| Item | Why it's web-only |
|---|---|
| React Router-based routing, Bootstrap UI (`client/src/App.jsx`) | Web SPA-specific; React Native uses Expo Router + native components instead (already the right choice in `mobile/`) |
| `localStorage` token storage (`client/src/context/AuthContext.jsx`) | Not available/appropriate in React Native; mobile already correctly uses `expo-secure-store` instead |
| Hand-rolled CORS middleware (`server/index.js`) | Browser-only concept; irrelevant to native HTTP calls, don't try to "configure" it for mobile |
| CSS-variable theming (9 palettes) | Web-rendering-specific; a mobile theme would need its own token mapping, not a port of this file |
| Stripe Checkout redirect flow | Browser-redirect-based; not appropriate to embed in-app for v1 per product direction |
| PDF generation (`server/lib/generatePdf.js`, `pdfkit`) | Server-side only regardless of client — correct as-is, nothing to change |
| Admin panel, org portal (client and server) | Entirely separate product surfaces, explicitly out of scope |
| Vault cryptography (`server/lib/vault.js`) | Must never run on a client, web or mobile |

## Gaps for Mobile MVP

| Gap | Detail | Suggested owner of the decision |
|---|---|---|
| **Token lifetime for mobile** | 8h fixed expiry, no refresh token. Needs a decision: longer mobile-specific expiry vs. a real refresh flow vs. accept re-login. | Product/security decision — see [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md) |
| **Mobile API base URL configuration** | Existing `mobile/src/lib/api.js` hardcodes production. Needs env-based config (dev/staging/prod) before real development starts, mirroring how the web client uses `VITE_API_URL`. | Straightforward engineering fix, but flagging because the existing code doesn't do it |
| **Pruning existing Premium/upgrade/admin surface from `mobile/`** | Screens and API methods for all 4 Premium sections plus an Upgrade tab already exist and are wired into navigation. | Explicit scoping decision before Codex writes code — don't silently delete working code without confirming the plan |
| **Multipart upload from a real device, unverified** | `documents.js` upload routes accept `multipart/form-data` via `multer`; React Native's `FormData` should work but has not been exercised end-to-end in this codebase. | Verify early if the Funeral Wishes photo gallery is in the v1 slice |
| **Songs/bucket-list duplication** | Two parallel implementations of similar features (see [BUSINESS_LOGIC_MAP.md](./BUSINESS_LOGIC_MAP.md)); building against the wrong one risks a confusing UX split from web. | Needs a product decision on which is canonical |
| **No app-store-facing account-deletion flow verified on mobile** | `DELETE /api/users/me` exists and works, but Apple/Google app-review guidelines require an accessible in-app account-deletion path — not yet wired into the mobile UI. | Compliance requirement, flag for Codex |
| **No mobile entry in `app_versions`** | The version-tracking table's `module` column is `CHECK`-constrained to `client`/`admin`/`org_portal`. A mobile release-tracking convention would need a schema change (additive, per existing migration style) or a separate tracking mechanism. | Low priority, flag as a known gap |

## Recommended ownership boundary

Keep the mobile app as a **separate `ingoodhands-mobile` repository** (or, at minimum, a clearly
separated concern within this monorepo — `mobile/` already exists as an npm workspace) that:

- **Owns:** UI, navigation, on-device state (token storage, offline caching if any), push-token
  registration, and its own release/build pipeline (Expo/EAS).
- **Never owns:** business rules, entitlement logic, vault cryptography, PDF rendering, email
  sending, or the database schema. All of these stay in `server/`, consumed via the existing REST
  API.
- **Talks to the same backend** as the website — no separate mobile-only backend, no separate
  user store. The existing `server/` API is the single backend for both clients.
- If mobile-specific API needs emerge (e.g. a leaner payload for a dashboard widget), extend
  existing endpoints with optional query params or add narrowly-scoped new endpoints in the same
  `server/routes/` files — do not fork the API.

## Risks

| Risk | Mitigation |
|---|---|
| Duplicated business logic (e.g. re-deriving "is this premium" or completion counts client-side) | Always call the existing endpoints; never re-derive server-owned logic (see [BUSINESS_LOGIC_MAP.md](./BUSINESS_LOGIC_MAP.md)) |
| Inconsistent Free Plan rules between web and mobile | Both clients must call the same `requirePremium`-gated endpoints; the server is the only enforcement point, so this is structurally hard to get wrong **as long as mobile never tries to implement a premium feature client-side** |
| Duplicate/incompatible user stores | Not a risk here — there is only ever one `users` table; mobile and web share it by construction as long as mobile keeps using `/api/auth/*` |
| Direct database access from mobile | No mechanism for this exists (no exposed DB port, no service key), so this isn't currently possible even by mistake — keep it that way |
| Exposing secrets in mobile app code | The existing `mobile/src/lib/api.js` has no secrets (correct), but a future integration (e.g. a mobile-specific analytics SDK) must not embed R2, Stripe, or Resend keys — those never belong in a mobile bundle |
| Shipping the existing Premium/admin-adjacent mobile code accidentally | The existing `mobile/` app already includes an Upgrade tab and Premium screens; if left in place and shipped, it directly violates the stated v1 product boundary |
| Push notifications assuming one device per user | `users.expo_push_token` is a single column; a user on two devices will only receive push on the most-recently-registered one — acceptable for v1, a known future-scaling item |

## Suggested first mobile vertical slice

**Funeral & End-of-Life Wishes**, end-to-end: view/edit the single-record section
(`GET/PUT /api/sections/funeral-wishes`), plus its photo gallery
(`POST /api/documents/photos/upload`, `POST /api/documents/photos/:section_id`). Reasoning:

- It's unambiguously Free (no `requirePremium` anywhere in its path).
- It's a genuinely complete, standalone feature (not a fragment of a larger flow), satisfying the
  product requirement that Mobile v1 "provide genuine standalone value."
- It exercises the two hardest technical unknowns early: authenticated CRUD **and** a real
  multipart file upload from a device — if photo upload works here, it's proven for any other
  section later.
- It has no dependency on the Deezer proxy (unlike Songs That Define Me) or on the
  trusted-contacts sharing subsystem (unlike Key Contacts), so it isolates cleanly as a true first
  slice.

A close second choice, if photo upload is deferred, is **Messages to Loved Ones** — pure text
CRUD, zero external dependencies, zero file handling, the simplest possible "prove the whole stack
works" slice.
