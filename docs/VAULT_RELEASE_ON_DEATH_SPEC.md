# Vault release on confirmed death

**Status: SPEC, NOT BUILT.** Written 2026-10-04 at the owner's request, to be
settled on paper before any code is written.

**The problem in one sentence:** the vault is encrypted with a password the
server never stores, so if nobody alive knows that password, the six
vault-protected sections die with the user, which is precisely the opposite of
what this product is for.

---

## 1. What is true today

Verified against the code, not assumed.

**Death is already confirmed without proof, and without the owner's
involvement.** `markUserDeceased` (`server/lib/deceased.js`) can be called by:

- the Legacy Contact, from their own access link (`routes/access.js`)
- organization staff, from the org portal (`routes/orgPortal.js`)
- the inactivity timer's direct-notify fallback

No document is uploaded. Nobody reviews anything. **This is correct and should
not change.** The owner does not want to be adjudicating death certificates,
and a product that required that would not work.

**Confirmation is already immediate.** The moment a passing is confirmed, every
trusted contact and everyone on the People to Notify list is notified. The
inactivity timer (default 12 months) is only the fallback for when nobody tells
the app anything. The common belief that "the Legacy Contact has to wait a
year" is false.

**The vault is the sole exception, and it is mathematics rather than policy.**
`server/lib/vault.js` derives the key with scrypt from the user's vault
password plus their user id, per request. Nothing is stored. There is no key to
release, so no amount of confirmation can release it.

**A usable primitive already exists.** `server/lib/vaultRecovery.js` implements
"any 3 of N" combinatorial escrow for security-question recovery: for every
3-question combination it stores the vault key encrypted under a key derived
from those three answers. The server holds ciphertext only, never the vault key
and never the answers. **This spec is a variation on that mechanism rather than
new cryptography**, which is the single most important fact in this document.

---

## 2. Design principle: prove life, not death

Asking for evidence of death is the wrong shape of problem. It needs documents,
a reviewer, and a judgement call, and it puts the owner in the loop.

Invert it. **Only a living person can object to being declared dead.** So the
trigger is a declaration, and the safeguard is a challenge window in which the
owner can say "I am here". A living user defends themselves; a dead one cannot.
Nobody has to prove anything, and nothing needs reviewing.

---

## 3. The flow

### 3.1 While alive: the user sets it up

Opt-in, never default. In their profile, the user:

1. Enables vault release and names which Legacy Contact receives it (it must be
   a trusted contact already marked `is_executor`).
2. Supplies their vault password once, so the key can be escrowed. This is the
   only moment the server can do this, exactly as with security-question
   recovery today.
3. Chooses the challenge window. Proposed defaults: **7 days** for a
   declaration by a Legacy Contact, **48 hours** when an organization attests.
4. Receives a **release code** to give their Legacy Contact, by hand, in a
   sealed letter, however they choose. It is shown once and never again.

The server stores the vault key encrypted under a key derived from that release
code. It holds the ciphertext and nothing else. **The "we cannot read your
vault" promise is preserved exactly**, which also means the privacy policy
wording drafted in `PRIVACY_POLICY_V4_DRAFT.md` stays true and does not need
weakening.

### 3.2 A passing is declared

Unchanged from today. Everything that is not vault-protected releases
immediately. Only the vault behaves differently.

### 3.3 The challenge window opens

The vault enters a `pending_release` state. During the window:

- The owner is contacted **on every channel held**, email and phone, repeatedly
  rather than once: *"Someone has reported that you have died. If you are
  reading this, press here."* One press cancels everything and logs it.
- **Any successful login by the owner cancels it automatically.** Passive,
  requires no action, and is the strongest available evidence of life.
- **Every trusted contact is notified that a declaration has been made**, not
  only the person who made it. Cheap, and it means one bad actor cannot do this
  quietly.
- The Legacy Contact sees a plain countdown rather than silence.

### 3.4 Release

If the window closes with no cancellation, the Legacy Contact is given the
stored ciphertext and enters their release code. The vault decrypts in their
browser session. **The server never holds both halves at any point.**

### 3.5 If the user never set it up

Nothing changes: the vault stays sealed forever. That outcome must be stated
plainly in the UI rather than discovered by a grieving family.

---

## 4. Threat model

Written adversarially, as the project's security gate expects.

| Attack | Mitigation |
|---|---|
| Legacy Contact falsely declares death to raid the vault | Challenge window; owner cancels by replying or simply logging in; all contacts told, so it is not quiet |
| Attacker controls the owner's email and suppresses the challenge | Second channel (SMS); all-contacts notification; login-cancels works even if mail is lost |
| Attacker compromises the server | Server holds ciphertext only. No release code, no vault key, no password. Unchanged from today |
| Legacy Contact loses the release code | Vault unrecoverable. Must be stated at setup. The user can reissue while alive, which invalidates the old code |
| Owner is alive but incapacitated and cannot respond | **The genuine residual risk.** The window expires and the vault releases to the person they chose. Accepted deliberately: the alternative is that it never releases, which defeats the feature |
| Replay or brute force of the release code | Rate-limit and lock attempts, reusing `vault_attempts` patterns already in the codebase |
| Declaration made while the plan is locked or in org view-as | Must be blocked, mirroring the existing view-as and `checkPlanLock` guards on every other vault route |

---

## 5. Build shape

Roughly ordered. Each is small on its own; the risk is in the interactions.

1. **Schema**, additive only per project rules: escrow ciphertext, release
   state, declaration timestamp, who declared, window length, cancellation
   record.
2. **Escrow library**, a sibling of `vaultRecovery.js`, reusing the same
   AES-256-GCM and scrypt primitives. Version the salt prefix, as that file
   does whenever derivation shape changes.
3. **Setup flow** in the profile: enable, choose contact, enter vault password
   once, show the release code once, confirm it has been saved.
4. **Declaration hook** in `markUserDeceased`: open the window rather than
   release.
5. **Challenge job**: repeated owner contact, and cancellation on login, which
   is a hook in the auth path.
6. **Release endpoint** for the Legacy Contact, with attempt limiting.
7. **Copy**, in the profile, on Trusted Contacts, in the FAQ, and in the
   privacy policy. The Trusted Contacts foot-of-page panel currently says the
   vault can never be opened by anyone. **That paragraph becomes false the day
   this ships and must change in the same release.** There is a comment in the
   code saying so.

---

## 6. Open questions for the owner

1. **Window lengths.** 7 days and 48 hours are proposals, not research.
2. **Is SMS worth adding?** It is the main defence against a compromised
   mailbox, and there is no SMS capability in the product today. Without it the
   challenge rests entirely on email plus login.
3. **Release code delivery.** Shown once at setup is simplest and safest. A
   printable sealed sheet is friendlier and likelier to survive, and is how
   people actually handle this.
4. **Can the Legacy Contact be told a release is pending before the window
   closes?** Kinder, but tells an attacker their declaration worked.
5. **Does this replace the Confidant idea entirely?** Largely, but not for
   users who decline to enable it. Both can coexist.
6. **Org portal interaction.** A funeral home attesting gets a shorter window.
   Org work is paused, so this may be deferred, but the schema should allow for
   it now.

---

## 7. Why this is worth building

It closes the one gap that makes the product incomplete. Everything else here
assumes that recording information means the right person eventually receives
it. The vault is the only place where that is not true, and it holds the
material that matters most: legal documents, financial accounts, credentials.

It is also a differentiator that is hard to copy honestly. Most competitors
either hold the key themselves, meaning they can read everything, or they do
not offer encryption worth the name. This design releases the vault without the
operator ever being able to read it.
