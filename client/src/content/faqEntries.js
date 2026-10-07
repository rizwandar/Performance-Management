// FAQ content for the /faq page (client/src/pages/FaqPage.jsx).
//
// This is meant to grow over time as real questions come in (support
// requests, the contact form, user testing) - add new entries here rather
// than hardcoding copy into FaqPage.jsx itself. Keep it small and accurate:
// it's better to leave a topic out than to guess at an answer.
//
// Each entry:
//   id       - stable, URL-safe anchor id. Other pages can deep-link to a
//              specific question with /faq#id (see the "Learn more" link on
//              TrustedContactsPage.jsx for a real example). Once something
//              links to an id, don't change it, add a new entry instead if
//              the topic needs to be reworded from scratch.
//   category - groups entries under one heading on the page. Entries with
//              the same category string render together, in the order they
//              appear in this array. Reuse an existing category string to
//              add to that group, or introduce a new one to start a group.
//   question - the FAQ question, shown as the entry's clickable summary.
//   answer   - the FAQ answer, plain text (a single paragraph).
//
// Keep answers accurate to the current behavior of the app. If the
// underlying feature changes, update the answer here rather than letting it
// go stale.
const faqEntries = [
  {
    id: 'vault-access',
    category: 'Your Vault',
    question: "Who can access my vault after I'm gone?",
    // Rewritten 2026-10-06. This answer still said that nobody but the owner
    // could ever open the vault and that telling someone the password was the
    // only way to change that. Vault release shipped on 2026-10-05, so that
    // was false for anyone who has set it up, and this is the page the Legacy
    // Contact section links to for the detail. Mechanics here are taken from
    // docs/VAULT_RELEASE_ON_DEATH_SPEC.md and the live copy on the profile's
    // Vault Release panel, deliberately rather than freshly worded: nothing in
    // this answer may promise behavior the code does not have.
    answer: "By default, no one but you. Your vault password is never stored anywhere, even in encrypted form, so neither we nor an admin can open your vault or hand it to anyone, no matter how much time passes. The vault protects your Personal & Legal Documents, Digital Life, Financial Affairs, Property & Possessions, Household Information, and Donation Bank sections. If you want your Legacy Contact to be able to open it once you are gone, you can set up vault release in your profile: we seal a copy of your vault key in an envelope that only one release code opens, we keep the envelope, and you hand the code to them yourself. We never send the code. If your passing is later declared, that code does not open anything straight away. A waiting period begins first, 7 days unless yours is set differently, we try to reach you on every contact detail we hold throughout it, and logging in at any point during that wait cancels it. If you never set vault release up, your vault stays sealed and what is inside it cannot be recovered by anyone, including us.",
  },
  {
    id: 'legacy-contact-vs-trusted-contact',
    category: 'Trusted Contacts & Legacy Contact',
    question: "What's the difference between a Trusted Contact and a Legacy Contact?",
    // Reworded 2026-10-04 when the Legacy Contact became its own section and
    // its own free allowance. Two things here had gone stale: the Legacy
    // Contact is no longer necessarily one of your trusted contacts, and the
    // old "up to three people" is not a number this copy should state at all,
    // since how many trusted contacts an account may hold depends on its plan.
    answer: "A Trusted Contact is someone you choose to give access to specific sections of your plans, on your own timeline: you send them a secure link yourself, and it's valid for 72 hours. A Legacy Contact is a single, separate role, and naming one does not use up one of your trusted contact places. It can be one of your trusted contacts or someone who isn't on that list at all. They're the person notified first if you stop logging in, they get a link that never expires, and they can see everything you've recorded except your vault. They're the one who confirms what's happened, and only after they confirm are your other trusted contacts and the people you've listed to notify actually informed.",
  },
  {
    id: 'stop-logging-in',
    category: 'Trusted Contacts & Legacy Contact',
    question: 'What happens if I stop logging in?',
    answer: "Nothing happens right away. Your account has an inactivity period you choose (12 months by default, adjustable in your profile). Once you're within 14 days of that period lapsing, we start sending you reminder emails, more often as the deadline gets closer, asking you to log back in. If the full period passes without you logging in, here's what happens next: if you've designated a Legacy Contact, they're notified first. They receive a link that never expires, giving them read-only access to everything you've recorded except your vault, and they're the one who confirms what's happened. Only once they confirm are your other trusted contacts and the people you've listed to notify actually informed. If you haven't designated a Legacy Contact, all of your trusted contacts are notified directly instead, each receiving a 72-hour link to whichever sections you assigned them.",
  },
]

export default faqEntries
