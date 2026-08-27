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
    answer: "Today, no one but you can ever access anything protected by your vault password, not your Legacy Contact, not an admin, no one. Your vault password is never stored anywhere, even in encrypted form, so there is no way for In Good Hands itself to grant access to anyone else, including after you're gone or after a long period of inactivity. The vault protects your Legal Documents, Digital Life credentials, Financial Affairs, Property & Possessions, Household Info, and Donation Bank sections. If you want someone to have access to your vault after you're gone, the only way to do that today is to tell them your vault password yourself, outside of the app.",
  },
  {
    id: 'legacy-contact-vs-trusted-contact',
    category: 'Trusted Contacts & Legacy Contact',
    question: "What's the difference between a Trusted Contact and a Legacy Contact?",
    answer: "A Trusted Contact is one of up to three people you choose to give access to specific sections of your plans, on your own timeline: you send them a secure link yourself, and it's valid for 72 hours. A Legacy Contact is a role one of those three trusted contacts can also hold. They're the person notified first if you stop logging in, they get a link that never expires, and they can see everything you've recorded except your vault. They're the one who confirms what's happened, and only after they confirm are your other trusted contacts and the people you've listed to notify actually informed.",
  },
  {
    id: 'stop-logging-in',
    category: 'Trusted Contacts & Legacy Contact',
    question: 'What happens if I stop logging in?',
    answer: "Nothing happens right away. Your account has an inactivity period you choose (12 months by default, adjustable in your profile). Once you're within 14 days of that period lapsing, we start sending you reminder emails, more often as the deadline gets closer, asking you to log back in. If the full period passes without you logging in, here's what happens next: if you've designated a Legacy Contact, they're notified first. They receive a link that never expires, giving them read-only access to everything you've recorded except your vault, and they're the one who confirms what's happened. Only once they confirm are your other trusted contacts and the people you've listed to notify actually informed. If you haven't designated a Legacy Contact, all of your trusted contacts are notified directly instead, each receiving a 72-hour link to whichever sections you assigned them.",
  },
]

export default faqEntries
