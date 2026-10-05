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

### Decided

- **SMS: yes** (owner, 2026-10-04). The product has no SMS capability today, so
  this adds a provider, a verified sender, per-country number handling and cost
  per message. It is worth it: SMS is the main defence against a declaration made
  by someone who also controls the mailbox, and without it the challenge rests on
  email plus login alone. Testing will use the owner's own phone.
- **The Confidant section is not being built** (owner, 2026-10-04), so the
  question of whether this replaces it is closed. Encouraging users to tell
  someone their vault password stays as guidance in the copy, not as a feature.

### Still open

1. **Window lengths.** 7 days and 48 hours are proposals, not research.
2. **Release code delivery.** Shown once at setup is simplest and safest. A
   printable sealed sheet is friendlier and far likelier to survive, and is how
   people actually handle this. Loss of the code means the vault is unrecoverable,
   so this choice matters more than it looks.
3. **Can the Legacy Contact be told a release is pending before the window
   closes?** Kinder, but it also tells an attacker their declaration worked.
4. **Org portal interaction.** A funeral home attesting gets a shorter window.
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

---

## 8. Decisions of 2026-10-04 (second pass)

- **Challenge window: 2 days**, not 7. Owner's call.
- **The owner is challenged by email and SMS**, both.
- **The Legacy Contact can see that a release is pending**, with a countdown,
  rather than silence.
- **Funeral home attestation: deferred**, but the schema makes room for a
  per-declarer window length now, so it needs no migration later.

### 8.1 The release code is never sent by us. Ever.

The owner asked whether the access-link email should carry the release code.
**No, and this is the one point in the design that cannot bend.**

The security of the whole scheme rests on the two halves never meeting. We hold
the sealed envelope. If we also transmitted the code, then at that moment our
mail provider, our logs and the recipient's inbox would each hold both halves,
and a single compromised mailbox would be enough to open the vault. It would
also make the claim "we cannot read your vault" false in spirit, because we
would have handled everything needed to open it.

So: the code is generated, shown to the user once, and **never stored, never
logged, never emailed.** It reaches the Legacy Contact by the user's own hand.
That friction is the feature, not a rough edge to smooth off later.

The access-link email should say so explicitly, so the recipient is not left
waiting for a code that is never coming.

### 8.2 Is the Legacy Contact's secure link different?

Checked against the code. Same mechanism: both are rows in
`trusted_contact_tokens`, delivered the same way. Two differences, both of
which already exist today:

- A regular trusted contact's link expires after 72 hours
  (`EXPIRES_HOURS = 72` in `lib/inactivityTimer.js`). The Legacy Contact's
  never expires, because when it is finally needed the owner is not there to
  resend it.
- The Legacy Contact's token carries `allow_demise_confirm`, so only they can
  confirm a passing from it.

Vault release adds nothing to the link itself. The envelope is fetched
separately, after the window closes, and opened with the code.

### 8.3 Where the explanation goes

Five places, in order of how likely someone is to read them.

**1. The "Make Legacy Contact" confirmation modal.** The moment of decision,
and the most important of the five. Proposed copy:

> **Make {name} your Legacy Contact?**
>
> Your Legacy Contact is the one person who acts for you when you cannot.
>
> - They are told first if you stop logging in.
> - Their link never expires, unlike everyone else's.
> - They can see everything you have recorded, except your vault.
> - They can confirm your passing. When they do, everyone else on your lists is
>   told straight away.
>
> **Your vault is the exception.** It is locked with a password we never store,
> so nobody can open it, not even us. If you want {name} to be able to open it
> after you are gone, you can set that up now or later.
>
> Here is how it works. We seal a copy of your vault key inside an envelope
> that only one release code can open. We keep the envelope. You keep the code,
> and you give it to {name} yourself.
>
> **We never send the code.** It has to come from you, because that is the
> thing that keeps your vault yours. You can issue a new code whenever you
> like, and the old one stops working the moment you do.
>
> [Make Legacy Contact] · [Make Legacy Contact and set up vault release] ·
> [Cancel]

**2. The Legacy Contact's own card**, once assigned. This is where re-issuance
belongs, because it is where you look when you are thinking about that person.
One line, with an action:

> Vault release: not set up. **Set up**

or, once set up:

> Vault release: code issued 4 October 2026. **Issue a new code**

**3. The "Send access link" modal**, when the contact is the Legacy Contact.
One extra line:

> This link never expires, and it lets {name} confirm your passing.
>
> Your release code is not in this email, and never will be. Give it to {name}
> yourself, and ask them to keep it somewhere they will still find it years
> from now.

**4. The foot-of-page panel on Trusted Contacts**, as reference material. Added
after the existing vault paragraph:

> You can change that if you want to. Set up vault release and we will seal a
> copy of your vault key in an envelope that only your release code opens. We
> hold the envelope and cannot open it. Your Legacy Contact holds the code and
> has nothing to open it with, until you are gone and a short waiting period
> has passed. Neither half is any use on its own.

**5. The setup flow itself**, in the profile, at the moment the code is shown:

> **Keep this code safe. We cannot show it to you again.**
>
> This is the only thing that can open your vault after you are gone. We do not
> keep a copy, so if it is lost, what is in your vault is lost with it.
>
> Give it to {name} in a way that will still exist in ten years: written down
> and kept with your will, in a sealed envelope, in a safe. Not in a text
> message you will both delete.
>
> If you ever lose track of it, come back here and issue a new one. The old
> code stops working immediately.
>
> [Print this sheet] · [I have saved it]

### 8.4 Re-issuance

Available from the Legacy Contact's card and from profile security settings.

Re-issuing means re-encrypting the vault key under a new code, which
**requires the vault password again.** That is unavoidable, since the server
has no other way to reach the key, and it is worth saying up front rather than
surprising someone halfway through.

The old envelope is replaced, so the old code dies instantly. The UI must say
that plainly: a user who re-issues "just in case" and leaves their Legacy
Contact holding the old code has silently broken the very thing they set up.

**Open question remaining:** printed sheet versus on-screen only. The copy
above assumes a printable sheet, which is friendlier and far likelier to
survive a decade. Confirm before building.

### 8.5 What actually happens across the 2 days

The owner asked. In order:

1. Someone declares the passing. Everything not vault-protected releases
   immediately, exactly as today.
2. The vault enters pending release. A 2-day clock starts.
3. The owner is contacted by email and SMS, repeatedly rather than once:
   *"It has been reported that you have died. If you are reading this, press
   here."*
4. Every trusted contact is told a declaration was made, not only the person
   who made it.
5. The Legacy Contact sees a countdown, so they are not left wondering whether
   anything happened.
6. Any reply from the owner, or any successful login, cancels everything and
   logs it.
7. If the clock runs out with no cancellation, the Legacy Contact is emailed:
   the vault is now available, come and enter your code. Only at that point is
   the envelope handed over.

---

## 9. Final copy decisions, 2026-10-04

### 9.1 The "Make Legacy Contact" modal

The owner's own wording, which is tighter than the earlier draft and replaces
it. Two mechanical fixes applied: "optional vault access" promoted to a real
subheading, and the em-dash replaced per the project's no-em-dash rule.

> **Make {name} your Legacy Contact?**
>
> Your Legacy Contact is the person you choose to help carry out your wishes
> when you're gone.
>
> {name} will be notified first if you stop logging in and will have permanent,
> read-only access to everything except your vault. She can also confirm your
> passing, triggering notifications to the people on your notification list.
>
> **Optional vault access**
>
> You can give {name} access to your vault using a private release code, now or
> later. We securely store an encrypted copy of your vault key, but we never
> store or send the code. You must give it to {name} yourself.
>
> [Make Legacy Contact] · [Make Legacy Contact and set up vault access] ·
> [Cancel]

Pronouns must come from the contact's own record or be neutral. "She" above is
only correct because the example contact is Sarah; the shipped string needs
"they" unless the app starts collecting pronouns, which it does not today.

### 9.2 The challenge message

Owner's steer: say "passed away" rather than "died", and give an SMS reply
option as well as a link.

**Email:**

> Subject: Please confirm you are there
>
> It has been reported that you have passed away.
>
> If you are reading this, that report is wrong. Press the button below and
> nothing further will happen.
>
> [I am here]
>
> If we do not hear from you by {date and time}, the vault access you set up for
> {name} will go ahead as you arranged.

**SMS:**

> In Good Hands: it has been reported that you have passed away. If you are
> reading this, reply 1 and nothing further will happen. {short link}

### 9.3 One reply option, not two

The owner suggested "respond by 1 or 2". **Recommend a single action.**

The tempting second option is "2 to confirm the report is correct", letting
whoever holds the deceased's phone shorten the wait. That hands the power to
accelerate release to an unverified person who physically has the handset,
which is the one direction the design should never make easier. Cancelling is
safe because it errs toward not releasing; accelerating is not.

If a second option is still wanted, it must only ever delay, never speed up.
For example "2 to add another 7 days". Even then it is close to redundant, as
anyone able to press 2 could press 1.

### 9.4 Inbound SMS is a bigger ask than outbound

Worth flagging while SMS is being scoped. Sending one-way SMS needs a provider
and a sender. **Accepting a "reply 1" needs a two-way number, an inbound
webhook, reply parsing, and per-number rules that differ by country.** Canadian
and US long codes also carry carrier filtering and registration requirements
for application-to-person traffic.

If that proves slow to arrange, the fallback is SMS that carries only a short
link, with the link doing the cancelling. That keeps the second channel, which
is the actual security benefit, without needing inbound capability.

### 9.5 Release code delivery: both

Decided. The code is shown on screen so it can be written down, **and** offered
as a printable PDF sheet. The PDF is the one likely to survive a decade in a
safe or alongside a will, which is the horizon this feature has to work over.

The sheet should carry the code, the Legacy Contact's name, the date issued, a
one-line explanation of what it opens, and the warning that issuing a new code
voids it. It should not carry the account's email address or any vault content.

### 9.6 Re-issuance, confirmed

The user can issue a new code at any time while alive, so a lost code is not
fatal. Requires the vault password again, and the previous code stops working
immediately.

---

## 10. Dropping SMS, 2026-10-04

Owner's decision: no SMS for now. One reply option confirmed, and the second
option dropped.

### 10.1 What SMS was actually for

A single job: a second channel, so that a Legacy Contact who also controls the
owner's mailbox cannot both declare a death and silence the challenge. Nothing
else in the design depends on it.

So the question is not "how do we live without SMS", it is **"what else gives
us a path to the owner that does not run through their main inbox".**

### 10.2 Four substitutes, none needing new infrastructure

**1. A second email address, nominated by the owner.** The strongest and
cheapest of the four. At setup the owner adds a backup address used only for
this: a spouse's, a work address, an old account. It is one more send through
Resend. It defeats the exact attack SMS was there to defeat, because an
attacker would now need two mailboxes rather than one, and it costs a column
and a form field.

**2. A longer window when there is only one channel.** With SMS, 2 days was
reasonable. On email alone, 7 days is the safer default: more chances for the
owner to read mail, log in, or hear from someone. Costs nothing, since the
window length is already configurable per declarer.

**3. Every trusted contact is told a declaration was made.** Already in the
design, and worth recognising as a second channel in its own right. It routes
through other people rather than another device: if a Legacy Contact falsely
declares, the owner's other contacts are told, and one of them phones the
owner. For most users that is a faster alarm than any automated message.

**4. Login cancels, plus a full-width banner.** Already in the design. Any
successful login cancels the release. Adding an unmissable in-app banner during
a pending window means even a user who logs in for an unrelated reason cannot
miss it.

### 10.3 Recommended shape without SMS

- Challenge by email to the primary address **and** the nominated backup
  address.
- Default window **7 days** rather than 2, while email is the only automated
  channel. Revisit if SMS is ever added.
- All trusted contacts notified of the declaration.
- Cancel on login, plus a banner.
- **Build the challenge dispatcher channel-agnostic**: a list of channels to
  try, with email as the only implementation today. Adding SMS later should be
  one new channel, not a rewrite. This is the "prepare an extension point"
  call rather than "implement now" or "defer entirely".

### 10.4 Restricting to Canada, US and Australia

The owner raised this in the same breath as SMS. **It does not help with SMS**,
and the two should be decided separately.

It does, however, bear on something larger. Those three are exactly the three
regimes the existing privacy policy already addresses: PIPEDA, US state law
including CCPA and CPRA, and the Australian Privacy Act. Excluding the EU and
UK would remove the largest open item in `PRIVACY_POLICY_V4_DRAFT.md`, which
is that the product collects health data behind a single bundled signup consent
that is unlikely to satisfy UK and EU requirements for special-category data.
That is a product change to the signup flow, and dropping those markets makes
it unnecessary.

Set against that: the owner said on 2026-10-04 that EU and UK users are wanted
as an audience. This would reverse that, and reversing it later is harder than
holding it open now, because by then there are users.

**Honest caveat on enforceability.** A geographic restriction is a statement of
where the service is offered, not a wall. Nothing stops someone in Germany
signing up, and IP geolocation is unreliable and trivially bypassed. What it
genuinely buys is the right to say the service is not offered there, not to
market there, and not to claim compliance that is not in place. That is worth
having, but it is a positioning decision rather than a technical control.

**Recommendation: decide this on its own merits, not as a workaround for SMS.**
If the EU and UK are genuinely a near-term market, keep them and budget for the
consent work. If they are an aspiration for later, narrow the policy's claims
now, launch in the three named countries, and revisit when there is a reason
to.

---

## 11. Corrections, 2026-10-04, after building it

Three things in this document turned out to be wrong or silent once the code
existed. Left here as corrections rather than edited away, so the reasoning
survives.

### 11.1 Section 3.4 is wrong about where decryption happens

It says the vault "decrypts in their browser session" and that "the server
never holds both halves at any point". **That is not what was built, and it
should not be.** Decrypting in the browser means shipping the vault key to a
browser, which is strictly worse. What ships instead: the server opens the
envelope, decrypts server-side, zeroes the key in a `finally`, and returns
only the plaintext sections.

The property that actually matters is unchanged and still true: **the server
never holds the release code**, so it cannot open the envelope on its own, at
any time, for anyone. That is the claim the privacy policy rests on. The
"never holds both halves" phrasing was an imprecise way of saying it.

### 11.2 Section 8.2 is wrong about the Legacy Contact's link surviving

It says the link never expires "because when it is finally needed the owner is
not there to resend it". In fact the declaration itself rotates it:
`markUserDeceased`'s fan-out calls `generateAccessLink`, which deletes and
reissues. The contact is emailed the new one, so nothing breaks, but the claim
as written is false. Pre-existing behaviour, not introduced by this feature.

### 11.3 Four things the spec never said, decided during the build

- **Attachments are included** in what a Legacy Contact can read. Omitting
  them would have meant handing over a list of documents without the
  documents.
- **An envelope sealed for a contact who has since lost the Legacy Contact
  role does not open.** The envelope names a specific person, not a role.
- **Opening notifies nobody.** Arguable either way; revisit if it ever
  matters.
- **Repeat opens are allowed.** A grieving person will come back, and refusing
  them the second time would be gratuitous.

### 11.4 Two safeguards added that the spec had not thought of

Both found by building it, both now in the code:

- **A window cannot close unless at least one challenge actually reached the
  owner.** As specified, a server outage or an email failure spanning the
  window would have released the vault with every safeguard in section 3.3
  silently skipped. The clock now restarts instead.
- **A cancellation suspends the arrangement rather than re-arming it.** As
  specified, cancelling returned it to armed, so a Legacy Contact could
  declare, wait for the cancel, and declare again indefinitely until one
  window fell across a holiday. Now a false declaration costs them the whole
  arrangement and the owner turns it back on deliberately.
