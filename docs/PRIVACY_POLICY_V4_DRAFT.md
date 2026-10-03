# Privacy Policy v4: encryption promise, business transfer, and an EU/UK addendum

**Status: DRAFT, NOT PUBLISHED. Needs review by a qualified lawyer before publishing.**
Supersedes `PRIVACY_POLICY_V4_BUSINESS_TRANSFER_DRAFT.md`, which covered only
the transfer clause.

Live policy at the time of writing: **v3, published 2026-09-01**.
Raised 2026-10-03.

I am not a lawyer and nothing here is legal advice. It is drafted to be as
close to publishable as I can get it so that a lawyer is reviewing a real
document rather than starting from nothing. Section 6 lists what I believe
genuinely needs their judgement rather than mine.

---

## 1. The promise as proposed does not match the system

The proposal was to promise that **no data will be read by anyone**, except
the user's own contact details and those of their emergency and trusted
contacts, which are needed to reach out if the user stops responding.

**That promise is not true of the application as it stands today**, and it is
the kind of statement that is enforceable against you, would be found in any
acquirer's technical due diligence, and would be read closely by exactly the
users this product is for. It should not be published as written.

What is actually true:

### Genuinely unreadable by us (field-level AES-256-GCM, key derived from the
user's vault password via scrypt, never stored)

Per `server/lib/vaultFields.js`:

| Section | Encrypted fields |
|---|---|
| Legal Documents | document type, title, held by, location, notes |
| Financial Affairs | category, institution, account type, account reference, contact name, contact phone, notes |
| Property and Possessions | category, title, description, location, intended recipient, notes |
| Household Info | category, title, provider, account reference, contact, notes |
| Digital Life | credentials |
| Donation Bank | organ donation, organ donation details |

For these, the claim is strong and genuinely unusual: there is no server-held
key, so we cannot read them, a database breach yields ciphertext, and an
acquirer inherits data it cannot decrypt.

### Readable by us, stored as ordinary database rows

Everything else the user records, including:

- Messages to Loved Ones, and their voice clips
- Your Last Moments
- How I'd Like to Be Remembered, life story, legacy message
- Unfinished Business
- Funeral and End-of-Life Wishes
- **Medical Records**
- **Doctors**
- Insurance
- Pets and Pet Care
- Children and Dependants
- Songs That Define Me, My Bucket List
- Trusted Contacts, People to Notify, Emergency Contact

### Readable by us, and a specific gap worth knowing

**Uploaded files are not encrypted with the vault key.** For a vault section,
the *metadata* around a document is encrypted (its title, where it is held,
the notes), but the uploaded PDF or image itself is stored in Cloudflare R2
with access gated by a vault-password check at the API, not by encryption
tied to the user. Anyone holding the R2 credentials, which includes us and
would include an acquirer, can read the file bytes.

So today a user's actual will, uploaded as a PDF, is readable by the
operator, even though the note saying where the original is kept is not.

### Why this matters beyond accuracy

Two of the readable categories are **health data**: Medical Records and
Doctors. Under UK and EU law that is special-category data with stricter
conditions than ordinary personal data. A promise of "nobody can read it"
would, if true, substantially simplify that position. It is not true today,
so the position has to be handled properly instead.

---

## 2. The promise you can honestly make today

Proposed wording, which is still a strong claim and stronger than almost
anything comparable:

> **What we can and cannot see**
>
> Your vault is sealed with a password that only you know. We never store it,
> not even scrambled, and the key that unlocks your vault is rebuilt from
> that password each time you enter it. That means the contents of your
> Legal Documents, Financial Affairs, Property and Possessions, Household
> Info, Digital Life and Donation Bank sections cannot be read by us, by
> anyone who stole our database, or by any company that might one day buy
> this business. If you lose your vault password and your recovery options,
> we cannot recover that information for you either. That is the trade, and
> it is deliberate.
>
> The rest of what you record, such as your messages to loved ones, your
> funeral wishes, your medical records and your contacts, is stored on our
> systems in a form our systems can read. It is encrypted in transit and at
> rest, access is restricted and logged, and we do not read it as a matter of
> course. We access it only where we have to: to operate and fix the service,
> to deal with a security problem, to contact you or the people you have
> nominated when your plan says we should, or where the law requires it.
>
> We do not sell it. We do not use it to advertise to you. We do not use it
> to train AI systems.

The last line is only safe if it is true and intended to stay true. Confirm
before publishing.

### If you want the stronger promise to become true

It is achievable, and it would be a genuine differentiator worth more than
most features on the roadmap. It is two pieces of work, neither trivial:

1. **Extend field-level encryption to the remaining sections.** The machinery
   already exists and is proven; `vaultFields.js` is table-driven, so this is
   mostly adding tables to a map plus a migration path for existing rows.
   The hard part is not cryptography, it is that encrypted sections require
   the vault password to read, which changes the feel of the product for
   sections that are currently frictionless.
2. **Encrypt uploaded file bytes before they reach R2.** More invasive:
   downloads, the PDF export and trusted-contact access all read files
   server-side today.

There is a real product tension here, and it should be decided deliberately
rather than by default: the inactivity system and trusted-contact sharing
exist precisely so that someone else can read this material when the user
cannot. Data that nobody can read is data that cannot be delivered to a
grieving family through any path that does not involve the user's password.
Where exactly that line sits is a product decision, not a security one.

**Recommendation: publish the accurate promise now, and treat the stronger
one as a roadmap item with its own decision.** Do not publish the stronger
promise in anticipation of building it.

---

## 3. Business transfer clause

v3 contains no business transfer, change of control, merger, acquisition or
assignment clause at all. Section 3 also says data is used "solely to"
operate the service, next to a closed list that a sale is not on.

Proposed new section, to sit after "7. Security":

> ### 8. If This Business Is Sold
>
> In Good Hands may one day be sold, merged with another company, or have its
> assets acquired. If that happens, the information described in this policy
> would transfer to the new owner as part of the business, because the
> service cannot keep working for you without it.
>
> We commit to the following:
>
> - **We will tell you before it takes effect**, by email, at least 30 days
>   before your information transfers. Not an announcement afterwards.
> - **You can leave first.** During that period you can export everything you
>   have recorded and delete your account, and your information will not
>   transfer.
> - **The commitments travel with the data.** Any acquirer must honour this
>   policy for the information it receives until you are given notice of, and
>   agree to, a different one.
> - **Your vault stays sealed.** Vault contents are encrypted with a password
>   we never store. We cannot read them, and nor can an acquirer. A sale does
>   not change that.
>
> Before any such transaction, a prospective buyer may need to review limited
> information about the business during due diligence. Where that includes
> personal information, it is restricted to what is genuinely necessary to
> evaluate the transaction, is covered by a confidentiality agreement, and
> must be returned or destroyed if the transaction does not complete.
>
> We do not sell your personal information as a product, to data brokers, to
> advertisers, or to anyone else. This section is about the business itself
> changing hands, which is a different thing.

### Consequential edit

Section 3's "We use your personal information solely to:" needs to become
"We use your personal information to:", with a closing line after the list:
"The only other circumstance in which your information may move is described
in 'If This Business Is Sold' below."

---

## 4. The EU and UK question

The owner has confirmed EU and UK users are intended audience, now or later.
That raises the stakes considerably, because this product collects
special-category data (health) from users who would have full GDPR rights.

### Recommendation on structure: one policy with an EU/UK addendum, not two
### policies, and not geolocation-switched content

The instinct to serve a different policy automatically to UK and EU visitors
is understandable, but I would advise against it:

- **IP geolocation is unreliable and users travel.** A UK resident on holiday
  in the US would be served the wrong policy, and "we showed you the other
  one because of your IP address" is a weak answer to a regulator.
- **Residence, not location, is what matters**, and you cannot determine
  residence from an IP address.
- **Two policies drift.** The moment there are two, a change made to one gets
  forgotten in the other, which is exactly how v3's own section numbering and
  section names drifted before.
- **It reads badly if discovered.** A user who finds that different people
  are shown different privacy terms will assume the less protective one is
  the real one.

The standard and safer pattern is a single policy with a clearly headed
**"Additional rights for users in the UK and European Economic Area"**
section that applies to anyone it applies to, regardless of where they happen
to be browsing from. Everyone can read it, nothing is hidden, and there is
one document to keep accurate.

If you later want regional presentation, do it by letting the user tell you
where they live at signup, not by inferring it from an IP address.

### What the EU/UK addendum needs to cover

This is the part where a lawyer's judgement is genuinely required, because
these are determinations about your business, not facts about the code. The
headings below are what such a section normally has to establish:

1. **Who the controller is**, and whether an EU or UK representative is
   required. This depends on whether you are established in the EU/UK, and if
   not, whether you are targeting users there. Deliberately marketing to UK
   and EU users is exactly the kind of targeting that triggers the question.
2. **A lawful basis for each purpose.** v3 has no lawful-basis section at all,
   while elsewhere asserting GDPR applies. That gap needs closing regardless
   of the transfer clause.
3. **A condition for special-category data.** Health data (Medical Records,
   Doctors) needs more than an ordinary lawful basis. For a service like this
   the usual route is explicit consent, which has specific requirements about
   how it is obtained: it has to be a genuine, separate, affirmative choice,
   not bundled into a single signup checkbox. **Your current signup collects
   one combined privacy and terms consent**, which is unlikely to be
   sufficient for this if EU/UK users are in scope. This is a product change,
   not just a wording change, and it is the single most consequential item in
   this document.
4. **International transfer mechanism.** The policy already says data is
   processed in the United States and calls this a restricted transfer. It
   does not say what mechanism makes that lawful. Standard Contractual
   Clauses and the UK Addendum are the usual answer, plus a transfer risk
   assessment, plus confirming your processors (Render, Cloudflare, Resend,
   Stripe, Sentry, Infisical) are covered.
5. **Data subject rights**, including access, rectification, erasure,
   restriction, portability, objection, and the right to complain to a
   supervisory authority, naming the ICO for UK users. v3 has a "Your Rights"
   section; it needs checking against this list.
6. **Retention periods**, stated specifically rather than as "as long as
   necessary".
7. **How the business transfer clause interacts with all of the above.** A
   transfer clause in a privacy policy does not by itself create a lawful
   basis for transferring EU/UK personal data to an acquirer, and health data
   carries its own constraints on top. This is precisely the question to put
   to the lawyer rather than to me.

### The honest summary of the EU/UK position

If EU and UK users are genuinely in scope, the gap is larger than a transfer
clause. The policy currently claims a regime whose central requirements it
does not address, while the product collects health data behind a single
bundled consent checkbox. **That combination is worth fixing before marketing
spend starts, not after**, and it is cheap to fix now: publishing a new
policy version flags every existing user for re-consent, and today there are
no real users to re-consent.

A reasonable alternative, if EU/UK is aspirational rather than imminent, is
to narrow v3's own GDPR claims now and build this out when you actually
pursue those markets. That is a legitimate choice. What is not safe is
leaving the claims in while the requirements are unmet.

---

## 5. Publishing mechanics

1. Admin panel, Legal panel, Privacy Policy.
2. Paste the full amended HTML: v3's content plus the encryption-promise
   section, the business transfer section, the section 3 edit, the EU/UK
   addendum, and renumbering.
3. Add a summary line describing the changes, as v3's own summary does.
4. Publishing auto-increments to v4, archives a copy to R2, and sets
   `needs_reconsent` for every non-admin user.

The Terms of Service needs a matching assignment clause. Not reviewed here.

---

## 6. What needs the lawyer, specifically

Put these to them rather than the whole document:

1. Whether a privacy-policy clause is a sufficient basis to transfer this
   data on a sale, per jurisdiction. Canada's PIPEDA has specific
   business-transaction provisions and the policy already names PIPEDA.
2. Whether the health and financial records carry extra conditions on
   transfer. They very likely do.
3. **Whether the current single bundled signup consent is adequate for
   special-category health data under UK/EU law, and what the signup flow
   needs to look like if not.** Highest-impact item here.
4. Whether an EU or UK representative is required.
5. Which international transfer mechanism applies and what paperwork it needs.
6. Whether 30 days' notice before a transfer is right.
7. The matching ToS assignment clause.
8. Whether to build out or narrow v3's existing GDPR claims.
