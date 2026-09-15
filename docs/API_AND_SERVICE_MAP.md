# API & Service Map — In Good Hands

All endpoints are REST, mounted under `/api` in `server/index.js`. No GraphQL, no RPC framework.
Request validation is a mix of `express-validator` (auth routes only) and manual `if (!field)`
checks in most other routes. Response pattern is consistently `res.json({...})` on success and
`res.status(code).json({ error: '...' })` on failure; the global error handler
(`index.js:109-122`) is the only catch-all, and it hides internal error detail in production
(SEC-08). There is no API versioning prefix (`/api/v1`) — web and any future mobile client share
the exact same, unversioned surface.

"Auth Required" values: **None** (public), **JWT** (any logged-in user), **JWT+Premium**
(logged-in + `requirePremium`), **JWT+Admin**, **JWT+OrgUser/OrgAdmin**, **Token** (a
non-JWT, single-use/expiring URL token — trusted-contact or org-invite links).

## Auth — `server/routes/auth.js`, mounted at `/api/auth`

| Endpoint | Purpose | Auth | Used by | Mobile relevance |
|---|---|---|---|---|
| `POST /register` | Create account, issue JWT | None | Web, existing mobile skeleton | **Yes — core** |
| `POST /login` | Authenticate, issue JWT | None | Web, existing mobile skeleton | **Yes — core** |
| `POST /forgot-password` | Request reset email | None (rate-limited) | Web, existing mobile skeleton | **Yes — core** |
| `POST /reset-password` | Consume reset token | None | Web | **Yes — core** |
| `GET /verify-email/:token` | Confirm email | None (token is credential) | Web (link opened from email) | Yes — mobile should support opening this link (deep link) or an in-app equivalent |
| `POST /resend-verification` | Re-issue verification email | JWT | Web | Yes |
| `POST /logout` | Audit-log logout | JWT | Web, existing mobile skeleton | Yes (client-side token clear either way) |

## Users / profile — `server/routes/users.js`, mounted at `/api/users`

| Endpoint | Purpose | Auth | Used by | Mobile relevance |
|---|---|---|---|---|
| `GET /me` | Full profile incl. legacy `songs`/`bucket_list` | JWT | Web, mobile | **Yes — core** |
| `PUT /me` | Update profile fields | JWT | Web, mobile | **Yes — core** |
| `POST /me/change-password` | Change password (bumps `session_version`) | JWT | Web | Yes |
| `GET /me/org-consent` | Org link consent status | JWT | Web | Low (only if user happens to be org-linked) |
| `PUT /me/org-consent/revoke-view` | Revoke org view consent | JWT | Web | Low |
| `PUT /me/org-consent/revoke-edit` | Revoke org edit consent | JWT | Web | Low |
| `GET /me/org-branding` | Org logo/about for linked customers | JWT | Web | Low |
| `GET /me/timer` | Inactivity timer status | JWT | Web | Medium — nice-to-have mobile display |
| `PUT /me/timer` | Change inactivity period | JWT | Web | Medium |
| `POST /me/songs` / `DELETE /me/songs/:id` | Legacy favourite-songs list | JWT | Web | **Caution — see duplication note in BUSINESS_LOGIC_MAP.md** |
| `POST /me/bucket-list` / `DELETE /me/bucket-list/:id` | Legacy bucket-list | JWT | Web | **Caution — see duplication note** |
| `DELETE /me` | Delete account (password + vault password if set) | JWT | Web | Yes, eventually — high-risk flow, get product sign-off before building |
| `POST /me/device-token` | Register Expo push token | JWT | Existing mobile skeleton | **Yes — core, already wired for Expo** |

## Sections — `server/routes/sections.js`, mounted at `/api/sections`

| Endpoint pattern | Section | Auth | Mobile relevance |
|---|---|---|---|
| `GET /completion` | Completion counts, all sections | JWT | **Yes — core** (drives dashboard) |
| `GET/PUT /funeral-wishes` | Funeral & End-of-Life Wishes | JWT | **Yes — Free** |
| `GET/PUT /medical-wishes` | Medical & Care Wishes | JWT | **Yes — Free** |
| `GET/POST/PUT/DELETE /people-to-notify` | People to Notify | JWT | **Yes — Free** |
| `GET/POST/PUT/DELETE /messages` | Messages to Loved Ones | JWT | **Yes — Free** |
| `GET/POST/PUT/DELETE /songs-that-define-me` | Songs That Define Me | JWT | **Yes — Free** (max 50 items) |
| `GET/POST/PUT/DELETE /lifes-wishes` | Life's Wishes | JWT | **Yes — Free** |
| `GET/POST/PUT/DELETE /children-dependants` | Children & Dependants | JWT | **Yes — Free** |
| `POST /legal-documents/list`, `POST/PUT/DELETE /legal-documents` | Legal Documents | JWT (+Premium for writes; vault password for list) | **No — Premium** |
| `POST /financial-affairs/list`, `POST/PUT/DELETE /financial-affairs` | Financial Affairs | JWT (+Premium; vault) | **No — Premium** |
| `POST /property-possessions/list`, `POST/PUT/DELETE /property-possessions` | Property & Possessions | JWT (+Premium; vault) | **No — Premium** |
| `POST /household-info/list`, `POST/PUT/DELETE /household-info` | Household Info | JWT (+Premium; vault) | **No — Premium** |
| `GET/POST/PUT/DELETE /digital-life/vault*`, `/digital-life*` | Digital Life (vault + credentials) | JWT (+Premium for setup/writes) | **No — Premium** |

## Trusted contacts — `server/routes/trustedContacts.js`, mounted at `/api/trusted-contacts`

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `GET /` | List owner's contacts + permissions | JWT | **Yes — Free** |
| `POST /` | Add contact (max 3) | JWT | **Yes — Free** |
| `PUT /:id` | Edit contact | JWT | **Yes — Free** |
| `PUT /:id/permissions` | Set which sections a contact can see | JWT | **Yes — Free** |
| `PUT /:id/executor` | Designate/clear executor | JWT | Yes, though a secondary action |
| `DELETE /:id` | Remove contact | JWT | **Yes — Free** |
| `POST /:id/access-link` | Email a 72h access link to the contact | JWT | **Yes — Free** |

## Public access link — `server/routes/access.js`, mounted at `/api/access`

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `GET /:token` | Trusted contact views shared sections (no login) | Token | **No — web-only recipient flow**, opened from an email link, not an app session |
| `POST /:token/mark-demised` | Executor confirms owner has passed | Token | No — not part of a free individual-user MVP |

## Documents / files — `server/routes/documents.js`, mounted at `/api/documents`

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `POST /upload` | Upload a document (PDF/Word/image, 20MB) | JWT (+vault check if section is vault-protected) | Yes for Free sections that use documents (e.g. Funeral Wishes attachments), no for Premium sections |
| `POST /:section_id` | List documents for a section | JWT (+vault check as above) | Same as above |
| `POST /download/:id` | Get a short-lived signed download URL | JWT (+vault check) | Yes, for Free-section documents |
| `DELETE /:id` | Delete a document | JWT (+vault check) | Yes, for Free-section documents |
| `POST /photos/upload` | Upload a photo (image only, 15MB, role-tagged) | JWT (+vault check) | **Yes — Funeral Wishes gallery is Free** |
| `POST /photos/:section_id` | List photos for a section | JWT (+vault check) | Yes |

## Billing — `server/routes/billing.js`, mounted at `/api/billing`

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `GET /subscription` | Full subscription detail | JWT | Low — mobile only needs `/access` |
| `GET /access` | `{ plan, is_premium }` — the entitlement check | JWT | **Yes — core**, mobile must call this to know its own plan, but never to gate premium *UI it hasn't built* |
| `GET /plans` | Static plan/feature descriptions | None | Yes — good source for an "upgrade on the website" message's feature list |
| `POST /create-checkout-session` | Start Stripe Checkout | JWT | **No** — checkout should stay a website (browser) flow; do not embed Stripe Checkout in-app for v1 |
| `POST /cancel` / `POST /reinstate` | Manage subscription | JWT | No — website concern for v1 |
| `GET /payment-methods` / `DELETE /payment-methods/:id` | Payment method display (delete unimplemented) | JWT | No |

## Export (PDF) — `server/routes/export.js`, mounted at `/api/export`

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `GET /` | Generate & stream a PDF of **non-vault (free-tier)** data | JWT | Possible — a "download my plan" free feature, but PDF generation/rendering should stay server-side; mobile would just trigger the download |
| `POST /` | Generate the **full** PDF including vault sections (requires `vault_password`) | JWT+Premium | **No — Premium** |

## Settings (public) — `server/routes/settings.js`, mounted at `/api/settings`

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `GET /` | Site name/logo/theme/font, public settings | None | Yes — mobile should fetch this for branding parity (already done in the existing mobile skeleton) |
| `PUT /:key` | Update a setting | JWT+Admin | No |

## Deezer proxy — `server/routes/deezer.js`, mounted at `/api/deezer`

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `GET /search`, `GET /artists`, `GET /artist/:id/tracks` | Song search for Songs That Define Me | None | Yes — needed to support that Free section fully |

## Contact / report-death — public forms

| Endpoint | Purpose | Auth | Mobile relevance |
|---|---|---|---|
| `POST /api/contact` | Site contact/feedback form | None | Low — nice-to-have, not core |
| `POST /api/report-death` | Public "report a passing" form | None | No — not a free individual-user MVP feature |

## Admin — `server/routes/admin.js`, mounted at `/api/admin` (all `JWT+Admin`)

Not itemized here — **entirely out of Mobile v1 scope.** Covers user management, stats, version
log, branding, backups, manual inactivity-check trigger. See
[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md).

## Organization portal — `organizations.js`, `orgPortal.js`, `orgPublic.js`, `orgRegister.js`

Not itemized here — **entirely out of Mobile v1 scope.** ~30 endpoints covering org CRUD, staff
management, customer lifecycle, view-as, org self-registration. See
[USER_ACCESS_MODEL.md](./USER_ACCESS_MODEL.md) for the parts relevant to understanding consumer
accounts that happen to be org-linked.

## Where web bypasses the API

None found. Every client-facing data operation in `client/src/` goes through an `/api/*` fetch
(via `axios`); there is no server-rendered page or direct-to-database client code. This means the
existing API surface is already the complete contract a mobile client would need — there is no
hidden server-side-only capability that mobile would be missing infrastructure to reach.

## Summary: can mobile consume existing services, or are new mobile-friendly APIs needed?

**Mostly consume as-is.** The Free-tier section endpoints, auth endpoints, trusted-contacts
endpoints, and `billing/access`/`billing/plans` are already generic REST/JSON with no
web-specific coupling (no HTML rendering, no cookie dependency, no CORS dependency for a native
client). The gaps are less about needing new endpoints and more about needing:
1. A decision on mobile token lifetime (see [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md)).
2. A mobile-appropriate document/photo upload flow using the existing upload endpoints (they
   already accept `multipart/form-data` via `multer`, which React Native's `FormData` supports
   natively — no server change anticipated, but unverified against a real device end-to-end).
3. Confirming which of the duplicated songs/bucket-list endpoint pairs to build against (see
   [BUSINESS_LOGIC_MAP.md](./BUSINESS_LOGIC_MAP.md)).
