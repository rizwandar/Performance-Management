# Trusted Access System — OPS-14 + IDEA-04 + SEC-24 Technical Spec

Status: **Draft, pending final sign-off before implementation.** Scoped 2026-08-27, revised 2026-09-15 to fold in SEC-24 (vault-inheritance gap) as a capability on the same system, and to reverse the original Premium-only billing gate.

## What this replaces / doesn't replace

- **Replaces:** nothing existing is removed. The current token-link access flow (`server/lib/inactivityTimer.js`'s `generateAccessLink`, `trusted_contact_tokens`) keeps working exactly as today for owners who don't opt in to this.
- **Does not touch:** IDEA-20's link-based section sharing (one-time snapshot links, used for vault-protected sections specifically) stays completely separate and unmodified.
- **Net new:** an opt-in, per-trusted-contact login system, plus an optional edit-permission layer on top of it (IDEA-04's "Helper" concept).

## What this is now, in one paragraph (2026-09-15 revision)

One trusted-access login system, three capabilities that can each be granted independently per relationship: **read-only access to non-vault sections** (the original OPS-14), **edit rights on specific sections** (IDEA-04's Helper), and **read-only access to vault-protected sections too** (SEC-24's Designated Person). All three are Free-plan eligible now (see Billing below) - the original Premium-only gate is reversed. The trusted-contact **count** cap is unchanged and separate (IDEA-43: 2 on Free, 10 on Premium); what's newly capped is how many of those contacts can be granted the *login* capability at all - see Billing.

## Core architecture

A single new account/session type, structurally separate from the main `users` table and main login system:

- **New login surface:** its own route/page (e.g. `/trusted-access/login`), its own session cookie/token, its own auth middleware. Cannot authenticate into the main app, cannot touch billing, cannot edit anything outside what's explicitly granted.
- **Keyed by contact email, not by relationship.** One trusted-access identity per email address. If the same person is invited by multiple In Good Hands owners (e.g. trusted contact for two aging parents), they get ONE login showing a list of every owner who has shared something with them — not multiple separate accounts. This deliberately avoids colliding with, or requiring switching in/out of, that same person's own separate personal In Good Hands account if they happen to have one under the same email — the two systems never interact.
- **New tables (exact names TBD at implementation time):**
  - A trusted-access identity table: `email`, hashed password (set at invite-acceptance), verification/creation state.
  - A per-owner-per-contact grant table: links an existing `trusted_contacts` row to a trusted-access identity, tracks `status` (`invited` / `active` / `disabled` / `deleted`), which sections are granted read access, which sections (if any) are granted edit access (IDEA-04), and timestamps.
  - An audit log table for Helper edits: who (which trusted-access identity), which owner's data, which section/record, what changed, when.

## OPS-14: read-only trusted-contact login

**Where it's granted:** on the existing Trusted Contact create/edit form, alongside name/email — an opt-in checkbox, off by default. Copy must clearly state this grants **read-only access to non-vault sections only**; vault-protected content is never reachable through this flow.

**On check:**
1. Owner sees a confirmation explaining the contact will get an invite email to create an In Good Hands trusted-access account.
2. Invite email sent to the contact's email with a registration link (invite-token-gated, not open signup).
3. Contact completes registration (sets a password), lands on their trusted-access login, sees the owner's granted non-vault sections, read-only.

**Activation timing:** immediate, while the owner is alive — not gated to the existing inactivity/death trigger. (This is a deliberate, explicit product decision: it's a *different* mechanism from the existing post-death access-link flow, which is untouched and still fires on inactivity/death as today, independent of whether a contact also has trusted-access login.)

**Three account states and their triggers:**
| Owner action | Resulting state | What the contact sees |
|---|---|---|
| Checks the box | `invited` → `active` once they register | Invite email, then normal read-only access |
| Unchecks the box (access already active) | `disabled` | Login attempt shows: "The user has disabled this account, contact them directly." Account is NOT deleted — can be re-enabled later. |
| Deletes the Trusted Contact entirely | `deleted` | Email: "The user has removed you as a trusted contact; your access has been permanently removed." Login is permanently rejected. |

**Scope of granted access:** exactly the sections the owner has already assigned to that trusted contact via the existing per-contact permission system (`trusted_contact_permissions`) — same mechanism the current token-link flow already uses, just surfaced through a persistent login instead of a resend-only link. Executor's broader default access (if applicable) carries over the same way it does today.

## IDEA-04: optional "Helper" edit rights, layered on the same system

**Not a separate account type.** A Helper is simply an existing trusted-access relationship (from OPS-14) additionally granted **write** permission on specific sections, on top of (or instead of) read access. One relationship, two permission levels:
- Read-only (default, if the owner only checked the OPS-14 box)
- Read + Edit on specific sections (if the owner additionally designates those sections as Helper-editable)

**Scope constraint:** never includes vault-protected sections, matching OPS-14's own scope — a Helper cannot see or edit anything behind the vault password, full stop. This is a hard boundary, not a default that can be toggled on.

**Audit trail (required, not optional):** every write a Helper makes must be logged — who, which owner's section/record, what changed, when. The owner does not need a dedicated UI to review this at launch (the data should exist before the viewer does, per standing practice on this project), but the schema must capture it from day one so a review UI can be added later without a data-migration problem.

## SEC-24: Designated Person - read-only vault access

**What it is:** a third capability on the same trusted-access relationship (alongside base read-only and Helper edit-rights): the login can also see vault-protected sections (Legal Documents, Digital Life, Financial Affairs, Property & Possessions, Household Info, Donation Bank), read-only, never edit.

**Gated on:** the owner's explicit, informed consent at designation time - a checkbox stating the designated person will be able to read everything the owner has recorded, including vault content, once they accept. No death/inactivity trigger at all - access starts as soon as the designated person's account is active, same as base OPS-14 access. This is a deliberate scope decision: SEC-24 started as "what happens to my vault after I die" but the resolved design is closer to "someone I trust can always read everything I've shared with them" - a live co-access grant, not a posthumous-only unlock. Flagged here explicitly since it's a meaningfully more permissive stance than the original SEC-24 framing.

**How they actually see decrypted vault content (no new cryptography):** the designated person enters the vault password themselves, the same prompt the owner sees today (`VaultGate.jsx`'s pattern), the first time they open a vault-protected section from their own login. The owner is expected to communicate the vault password to them directly, out-of-band - the app does not store, escrow, or derive it on their behalf. This was a deliberate simplification over the escrow-based alternatives considered (encrypting the vault key under a share only the designated person's own account password can unwrap, or a Shamir-style split reusing SEC-13's combinatorial escrow pattern) - those stay documented as a fallback if the "owner has to tell them the password" model proves too much friction in practice, but nothing about this decision requires touching `server/lib/vault.js` or `vaultRecovery.js` at all.

**Billing:** Free-eligible, same as base OPS-14 access (see Billing below) - matches the same accessibility/safety reasoning as moving Helper to Free.

## Post-login experience: one consolidated read-only page, not app navigation

User-requested 2026-09-15: a trusted-access login (base, Helper, or Designated Person) should not need to click through the app's own per-section pages to see what's been shared with them. Reuse the existing pattern already built for this exact purpose - `AccessPage.jsx`, today's token-link landing page for executor/trusted-contact email links - which already renders every granted section's content on one scrollable read-only page, no site navigation, no per-section routing. The trusted-access login's post-login view should be this same rendering, adapted to a persistent authenticated session instead of a one-time token: one page, everything the relationship has been granted (including vault sections for a Designated Person, once they've entered the vault password once per session), nothing to browse to. This also means the new login surface doesn't need to replicate all 21 section pages' UI at all - a real scope reduction on the build, not just a UX preference. Applying this to Helper too needs one more decision: an edit-capable view can't be pure read-only rendering the way `AccessPage.jsx` is today, so Helper likely needs its own lightweight per-section edit affordance layered onto (or reachable from) the same consolidated page - not fully scoped here, worth a dedicated pass when Helper's own build is scoped.

## Billing (revised 2026-09-15, reverses the original decision 5 below)

**All three capabilities (base read-only, Helper edit-rights, Designated Person vault access) are Free-plan eligible.** Reasoning given: trusted-contact access, and especially a Helper for someone who needs one (e.g. a disability-related basic need), is safety-critical utility, not a premium upsell - gating it behind payment works against the product's actual purpose. This directly reverses the original decision 5 below, which is left in place further down for history rather than deleted.

**What's actually capped instead:** not the capability's existence, but *how many* of the owner's trusted contacts can be granted the login capability at all - separate from, and smaller than, the existing IDEA-43 trusted-contact-count cap (2 on Free, 10 on Premium):
- **Free: 1 contact** can be granted trusted-access login (any mix of the three capabilities on that one relationship - e.g. that one contact could be both Helper and Designated Person at once, still counts as the one allowed login).
- **Premium:** more than 1 - exact ceiling not yet set, reasonable to mirror the trusted-contacts premium ceiling (10) or set independently; a product call for whoever scopes the actual build, not decided here.
- Access already granted **persists through a downgrade** from Premium to Free (resolves the original "pandora's box" open question) - a downgraded owner just can't grant a *new* login beyond their Free allotment until they either remove an existing one or re-upgrade.

## Resolved decisions (finalized 2026-08-27, no longer open)

1. **Helper edit granularity:** one grant list per section, not two. Each granted section gets a read-only vs. read+edit toggle, rather than maintaining a separate list of editable sections from scratch.
2. **Trusted Contact cap interaction:** purely additive. The existing trusted-contact-count cap (2 on Free, 10 on Premium as of IDEA-43 - was a flat 3 when this decision was first written) remains about how many Trusted Contact relationships exist at all; trusted-access login/Helper/Designated Person rights are a capability you can turn on for any of those existing slots, subject to the separate login-capacity cap above (decision 10), not the contact-count cap itself.
3. **Password reset:** reuses the main app's existing Resend-based flow (email templates, rate limiting, token expiry) rather than a second bespoke mechanism.
4. **Disabled/deleted account login attempt:** an inline error state on the same trusted-access login form ("This account has been disabled/removed — contact [owner name] directly"), not a separate dedicated page.
5. ~~**Billing gating:** Premium only. The owner must be on a Premium plan to enable trusted-access/Helper for any contact.~~ **SUPERSEDED 2026-09-15 - see the Billing section above.** All three capabilities are now Free-eligible, gated instead by a 1-contact (Free) / more (Premium) cap on how many contacts can be granted login at all. Left here, struck through rather than deleted, so the history of the decision is visible. The contact's own trusted-access account remains free regardless of the owner's plan (unchanged from the original note).

## Resolved decisions (finalized 2026-09-15)

6. **SEC-24 folds into this system** as a third per-relationship capability (Designated Person, vault-read access) rather than a separate mechanism - see the dedicated section above.
7. **Designated Person access is immediate, not death/inactivity-gated** - consent at designation time is the only requirement.
8. **Vault content reaches the designated person via the same password-entry UX the owner uses**, communicated out-of-band by the owner - no escrow, no new cryptography, no change to `vault.js`/`vaultRecovery.js`.
9. **Post-login view is one consolidated read-only page** (reusing `AccessPage.jsx`'s existing rendering), not navigation through the app's own section pages - see the dedicated section above. Still open: how Helper's edit capability layers onto this same page (not a pure read-only render once edit is possible).
10. **Login-capacity cap:** 1 contact free, more via Premium - separate from and smaller than the existing IDEA-43 trusted-contact-count cap. Exact Premium ceiling not yet set.

## Suggested next step

Scoping is far enough along to write real implementation tickets, but two things are still open before a build dispatch: the exact Premium login-capacity ceiling (decision 10), and how Helper's edit UI sits on the consolidated read-only page (decision 9). Once those are picked, this is sized for a dedicated multi-agent build effort (likely Opus-tier for the core account/session/permission plumbing - new login surface, new tables, audit logging, the vault-password-entry-on-someone-else's-login flow - with smaller Sonnet/Haiku-tier agents for the UI/email-copy pieces and the `AccessPage.jsx`-reuse consolidated view), not a single dispatch.
