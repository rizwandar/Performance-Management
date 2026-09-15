# Free Plan Features — In Good Hands

Based entirely on server-side enforcement (`requirePremium` middleware presence/absence in
`server/routes/sections.js`, `documents.js`, `export.js`), cross-checked against the feature list
`GET /api/billing/plans` returns for the `free` plan (`server/routes/billing.js:32-82`). The two
sources agree, which gives confidence this list is accurate as of 2026-08-13.

## Free features (implemented, server-enforced)

| Free Feature | Current Web Route | Data / Service Dependencies | Mobile MVP Candidate | Notes |
|---|---|---|---|---|
| How I'd Like to Be Remembered | `/sections/how-to-be-remembered` | `users` table fields (`about_me`, `legacy_message`, `life_story`, `remembered_for`) via `GET/PUT /api/users/me` | **Yes** | No dedicated table — just profile fields |
| Messages to Loved Ones | `/sections/messages` | `personal_messages` table, `/api/sections/messages` | **Yes** | Straightforward CRUD |
| Songs That Define Me | `/sections/songs-that-define-me` | `songs_that_define_me` table, `/api/sections/songs-that-define-me`, Deezer proxy (`/api/deezer/*`) for search | **Yes** | Needs the Deezer proxy too; max 50 items server-enforced |
| Funeral & End-of-Life Wishes | `/sections/funeral-wishes` | `funeral_wishes` table (1:1), `/api/sections/funeral-wishes`; photo uploads via `documents.js` `photos/*` routes | **Yes** | Includes gallery photos (`funeral_gallery`, up to 20) and a main photo (`funeral_main`) — genuine standalone value, good vertical-slice candidate |
| Medical & Care Wishes | `/sections/medical-wishes` | `medical_wishes` table (1:1) | **Yes** | Straightforward |
| Key Contacts | `/sections/key-contacts` | `users.emergency_contact_*` fields + `trusted_contacts`/`trusted_contact_permissions` tables | **Yes** | Combines an emergency-contact field group with the up-to-3 trusted-contacts sharing feature |
| People to Notify | `/sections/people-to-notify` | `people_to_notify` table | **Yes** | Straightforward CRUD |
| Children and Dependants | `/sections/children-dependants` | `children_dependants` table | **Yes** | Straightforward CRUD |
| Trusted contacts with access permissions | `/sections/key-contacts` (same page) | `trusted_contacts`, `trusted_contact_permissions`, `/api/trusted-contacts/*` | **Yes**, owner-management side only | The link-recipient viewing page (`/access/:token`) is a separate, web-only, no-login surface — not part of this |
| Life's Wishes (section) | `/sections/lifes-wishes` | `life_wishes` table | **Yes**, but see duplication note below |
| Basic PDF export | `/export` (non-vault path) | `GET /api/export` → `server/lib/generatePdf.js` | Possible, as a "download/share my plan" action — but keep PDF **rendering** server-side; mobile just triggers/downloads | Not listed in `billing.js`'s free feature text explicitly, but the route itself has no `requirePremium` gate — confirmed free in code |

## Present in the web UI, gated by a *different* mechanism than plan (caution)

| Feature | Route/Endpoint | Gate | Notes |
|---|---|---|---|
| Favourite songs (profile) | `POST/DELETE /api/users/me/songs` | `users.songs_enabled` boolean | Overlaps with "Songs That Define Me" above — **confirm with the product owner which one the current web UI actually surfaces as the real feature** before mobile builds either; building both risks presenting two different "song lists" to the same user |
| Bucket list (profile) | `POST/DELETE /api/users/me/bucket-list` | `users.bucket_list_enabled` boolean | Overlaps with "Life's Wishes" above — same caution |

## Premium-only or non-mobile capabilities (do NOT build these into Mobile v1)

| Feature | Why excluded |
|---|---|
| Legal Documents, Financial Affairs, Property & Possessions, Practical Household Info | Premium-gated (`requirePremium` on all writes; list requires an existing vault) |
| Digital Life vault (encrypted credentials) | Premium-gated setup; also the most security-sensitive feature in the product — crypto must stay server-side regardless of plan |
| Full PDF export with vault sections | `POST /api/export` requires `requirePremium` |
| Document uploads for the four vault-protected sections | Tied to those sections' premium gate |
| Upgrade/checkout flow | Explicitly out of scope per product direction — Mobile v1 should, at most, show a message directing the user to `ingoodhandsplan.com` to sign in and upgrade, never embed Stripe Checkout or a locked-section preview |
| Admin panel | Entirely separate surface, `is_admin`-gated |
| Funeral home / organization portal | Entirely separate surface, `org_role`-gated |
| Inactivity timer configuration UI | Free-tier data (`GET/PUT /api/users/me/timer` has no premium gate) but is a secondary account-settings feature, not core planning content — reasonable to defer past v1 even though it's technically free |
| Trusted-contact recipient view (`/access/:token`) | Opened from an emailed link by a non-user, not an authenticated app session — a web-only surface by design |

## Dependencies mobile will need regardless of which Free features are prioritized

- Auth (`/api/auth/*`) and profile (`/api/users/me`) — foundation for everything.
- `GET /api/sections/completion` — dashboard/progress display, matches the web `DashboardPage`
  pattern (fetch counts, render a grouped list).
- `GET /api/settings` — branding/theme parity (already consumed by the existing mobile skeleton).
- `GET /api/billing/access` — to know the user's plan for the upsell nudge only.

## Reasons some free-looking data might still be harder to move to mobile

- **Songs That Define Me** depends on the Deezer proxy for search-as-you-type; if that proxy has
  any latency/rate-limit characteristics tuned for a browser experience, mobile should verify it
  feels acceptable on a cellular connection before treating it as a v1 must-have.
- **Funeral Wishes photo gallery** uses `multipart/form-data` uploads through `multer`
  (`documents.js`) — functionally compatible with React Native's `FormData`/`fetch`, but this has
  not been exercised from an actual device in this codebase yet; treat as unverified until tested.
- **Key Contacts / trusted-contacts sharing** is meaningfully more complex than a simple CRUD
  section (executor designation, permission-per-section matrices, emailed access links) — a
  reasonable candidate to simplify or defer within the free slice even though it's fully free
  server-side.
