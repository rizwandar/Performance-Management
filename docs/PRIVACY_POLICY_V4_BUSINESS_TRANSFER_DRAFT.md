# Privacy Policy v4 draft: business transfer / change of control

**Status: DRAFT, NOT PUBLISHED. Needs legal review before publishing.**
Raised 2026-10-03, after the owner confirmed the long-term plan is to build a
user base and potentially sell the application to another company (for example
a funeral home group).

Live policy at the time of writing: **v3, published 2026-09-01**. Publishing is
admin-only, via the admin panel's Legal panel (`POST /api/legal/privacy/publish`).

---

## Why this is needed now, not later

Publishing a new policy version sets `needs_reconsent` for every non-admin
user, because `GET /api/legal/status` compares each user's
`privacy_version_consented` against the current version. Every existing user
then sees the re-consent banner until they accept.

Today that costs nothing: production has no real users yet. After the marketing
push and 100K signups, the same change means putting a re-consent prompt in
front of every one of them, and any user who never returns to accept it leaves
the position ambiguous at exactly the moment the clause matters. **The cheapest
time to add a business-transfer clause is before the first real user consents.**

A privacy policy clause is also only one half of it: the Terms of Service
should carry a matching assignment clause. The ToS was not reviewed here.

---

## What v3 says today

Checked directly against the live production policy:

- **No business transfer, change of control, merger, acquisition or assignment
  clause exists anywhere in the policy.** This is the gap.
- Section 3 says the data is used "solely to" provide and operate the service,
  send transactional email, and so on. A transfer of the business is not in
  that list, and "solely" is a strong word to have written next to a closed
  list.
- The policy says "We do not sell or share your personal information with third
  parties for marketing purposes." That is narrower than it reads at a glance:
  it does not forbid a business transfer. But a user who read it as "they will
  never hand my data to anyone" would feel misled by a silent transfer, and
  that perception matters more than the literal wording for a product whose
  entire proposition is trust.

## Two adjacent gaps found while looking

Reporting these because they bear on the same question, not to expand scope:

1. **No lawful-basis section.** The words "legal basis" and "lawful basis" do
   not appear. The policy does assert GDPR applicability elsewhere ("For EU/UK
   users, this is a restricted transfer under GDPR"), so it claims a regime
   whose central requirement it does not address.
2. **No GDPR special-category treatment of health data.** The policy handles
   California's "sensitive personal information" definition explicitly and
   well, naming Medical Records and Donation Bank. It says nothing about the
   equivalent and stricter GDPR concept for health data. If EU/UK users are
   genuinely in scope, that is a larger question than a transfer clause, and it
   also constrains what an acquirer could lawfully do with the data afterwards.

**Open question for the owner:** is the EU/UK actually in scope? The app is
US-first. If EU/UK users are not a real audience, the cleaner fix may be to
narrow the policy's own GDPR claims rather than build out the machinery those
claims imply. If they are in scope, this needs a lawyer, not a text edit.

---

## Proposed new section

To sit as a new numbered section after "7. Security" and before "8. Cookies and
Tracking", with the following sections renumbered.

> ### 8. Business Transfers
>
> In Good Hands may one day be sold, merged with another company, or have its
> assets acquired. If that happens, the information described in this policy
> would transfer to the new owner as part of the business, because the service
> cannot continue to operate for you without it.
>
> We commit to the following if that ever happens:
>
> - **We will tell you before it takes effect.** You will receive notice by
>   email at least 30 days before your information transfers, not an
>   announcement afterwards.
> - **You can leave first.** During that period you can export everything you
>   have recorded and delete your account, and your information will not
>   transfer. Deletion works the same way it does today.
> - **The commitments travel with the data.** Any acquirer must honour this
>   policy for the information it receives until you are given notice of, and
>   agree to, a different one.
> - **Your vault stays unreadable.** The contents of your vault are encrypted
>   with a password we never store, so they cannot be read by us, and they
>   cannot be read by an acquirer either. A sale does not change that.
>
> Before any such transaction, a prospective buyer may need to review limited
> information about the business during due diligence. Where that includes
> personal information, it is restricted to what is genuinely necessary to
> evaluate the transaction, is covered by a confidentiality agreement, and must
> be returned or destroyed if the transaction does not complete.
>
> We do not sell your personal information as a product, to data brokers, to
> advertisers, or to anyone else. This section is about the business itself
> changing hands, which is a different thing.

### Consequential edit

Section 3's "We use your personal information solely to:" list needs a
cross-reference, or the new section contradicts it. Suggested: change the lead
line to "We use your personal information to:" and add a closing line after the
list reading "The only other circumstance in which your information may move is
described in Business Transfers below."

---

## Why the draft is written this way

- **30 days' notice and a deletion window** are deliberately stronger than the
  bare minimum. For this product the clause will be read by someone deciding
  whether to trust it with their medical records and their family's access
  instructions. A clause that reads as "we may transfer your data" with no
  recourse would do more commercial damage than the flexibility is worth.
- **Naming the vault explicitly** turns the architecture into a reassurance.
  It is also simply true: no server-held key exists, so an acquirer inherits
  ciphertext they cannot read.
- **The closing paragraph** exists because "we do not sell your data" and "the
  company may be sold" sit uncomfortably together in a reader's mind. Saying
  both plainly is better than letting the reader find the tension themselves.
- **The due-diligence paragraph** covers the stage before a sale completes,
  which is usually where data actually moves first and is usually the part a
  policy forgets.

---

## What needs a lawyer, not me

I am not a lawyer and this draft is not legal advice. Specifically:

- Whether a privacy-policy clause alone is a sufficient basis to transfer this
  data in the jurisdictions that actually apply, which depends on where the
  users are and what the regime requires. Canada's PIPEDA has specific
  business-transaction provisions; the policy already names PIPEDA.
- Whether health and financial records carry extra conditions on transfer
  beyond ordinary personal data. They very likely do.
- Whether 30 days' notice is the right period, or whether a shorter or longer
  one is required or customary.
- The matching ToS assignment clause, which was not reviewed here.
- Whether the policy's existing GDPR claims should be built out or narrowed.

**Recommendation: have this reviewed before publishing, while there are no real
users and nothing is urgent.** That is a much better position than discovering
the gap during a transaction, with a user base already consented to a policy
that is silent on it.

---

## How to publish once approved

1. Admin panel, Legal panel, Privacy Policy.
2. Paste the full amended policy HTML (v3's content plus the new section and
   the section 3 edit, with sections renumbered).
3. Give it a summary line, the way v3's summary describes its own changes.
4. Publishing auto-increments to v4, archives a copy to R2, and flags every
   non-admin user for re-consent.
