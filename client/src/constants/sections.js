// Canonical list of the 21 plan sections, in the same group-by-group order
// they're laid out on the Dashboard (client/src/pages/DashboardPage.jsx).
// This flat array order is also what drives the sequential prev/next
// "journey" navigation on each section page (see SectionFooterNav.jsx) -
// since the array is already laid out group by group, walking it front to
// back naturally moves group by group too, without any special wrap logic.
export const SECTIONS = [
  // ── Your Legacy ────────────────────────────────────────────────────────────
  {
    id: 'personal_messages', label: 'Messages to Loved Ones',
    icon: '💌', route: '/sections/messages', group: 'legacy',
    description: 'Write heartfelt letters to the people who matter most. Words they can hold onto long after you\'re gone.',
  },
  {
    // IDEA-30: premium-only, unlike its "legacy" groupmates above - not in
    // FREE_ROUTES below, deliberately. See IDEA-30 memory notes for the
    // vault-protection default assumption flagged alongside this.
    id: 'last_moments', label: 'Your Last Moments',
    icon: '🎙️', route: '/sections/last-moments', group: 'legacy',
    description: 'One last, lasting recording or letter for the people you love most: separate from your other messages.',
  },
  {
    id: 'how_to_be_remembered', label: "How I'd Like to Be Remembered",
    icon: '🕯️', route: '/sections/how-to-be-remembered', group: 'legacy',
    description: 'Share your values, your story, and the things that define you, so those you love will always know who you were.',
  },
  {
    id: 'unfinished_business', label: 'Unfinished Business',
    icon: '🕊️', route: '/sections/unfinished-business', group: 'legacy',
    description: 'Reconciliation, apologies, and the relationships or matters you\'d still like to set right.',
  },
  {
    id: 'songs_that_define_me', label: 'Songs That Define Me',
    icon: '🎵', route: '/sections/songs-that-define-me', group: 'legacy',
    description: 'The music that moves you, marks your milestones, and speaks to who you truly are.',
  },
  {
    id: 'life_wishes', label: 'My Bucket List',
    icon: '✨', route: '/sections/lifes-wishes', group: 'legacy',
    description: "The dreams you're still chasing, the places you want to see, and the experiences that light you up.",
  },

  // ── Your People ────────────────────────────────────────────────────────────
  {
    id: 'children-dependants', label: 'Your Loved Ones',
    icon: '👶', route: '/sections/children-dependants', group: 'people',
    description: 'Everything your loved ones need to know about caring for your children and those who depend on you.',
  },
  {
    id: 'pet-care', label: 'Pet Care',
    icon: '🐾', route: '/sections/pet-care', group: 'people',
    description: 'Feeding routines, vet details, and caretaker wishes so your pets are looked after too.',
  },
  {
    id: 'emergency_contact', label: 'Emergency Contact',
    icon: '📞', route: '/sections/emergency-contact', group: 'people',
    description: 'The first person to call in an emergency: always reachable, and ready to act on your behalf.',
  },
  {
    id: 'trusted_contacts', label: 'Trusted Contacts',
    icon: '🤝', route: '/sections/trusted-contacts', group: 'people',
    description: 'The people who should be given access to your plans when the time comes, and what each of them can see.',
  },
  {
    id: 'people_to_notify', label: 'People to Notify',
    icon: '👥', route: '/sections/people-to-notify', group: 'people',
    description: 'The friends, family, and colleagues who should hear the news directly and with care.',
  },

  // ── Your Wishes ────────────────────────────────────────────────────────────
  {
    id: 'funeral_wishes', label: 'Funeral & End-of-Life Wishes',
    icon: '🕊️', route: '/sections/funeral-wishes', group: 'wishes',
    description: 'Your gentle guidance for the farewell that truly reflects who you are and what you believe.',
  },
  {
    id: 'medical_records', label: 'Medical Records',
    icon: '🏥', route: '/sections/medical-records', group: 'wishes',
    description: 'Your advance care directive, DNR preference, current medications, and conditions your carers should know.',
  },
  {
    id: 'doctors', label: 'Doctors',
    icon: '🩺', route: '/sections/doctors', group: 'wishes',
    description: 'Your GP, specialists, and preferred hospital, so your care team is easy to find in a hurry.',
  },

  // ── Your Affairs ───────────────────────────────────────────────────────────
  {
    id: 'property_items', label: 'Property & Possessions',
    icon: '🏡', route: '/sections/property-possessions', group: 'affairs',
    description: 'A clear record of your home, vehicles, valuables, and the possessions that matter most.',
  },
  {
    id: 'household-info', label: 'Practical Household Information',
    icon: '🔑', route: '/sections/household-info', group: 'affairs',
    description: 'Practical details about utilities, subscriptions, and services that keep everyday life running smoothly.',
  },
  {
    id: 'financial_items', label: 'Financial Affairs',
    icon: '💼', route: '/sections/financial-affairs', group: 'affairs',
    description: 'Your accounts, investments, insurance policies, and financial affairs, all in one place.',
  },
  {
    id: 'legal_documents', label: 'Personal & Legal Documents',
    icon: '📄', route: '/sections/legal-documents', group: 'affairs',
    description: 'Your will, powers of attorney, and identity documents, safely organized and easy to locate.',
  },
  {
    id: 'digital_credentials', label: 'Digital Life',
    icon: '💻', route: '/sections/digital-life', group: 'affairs',
    description: 'Your online accounts and passwords, secured by your vault password and accessible when needed.',
  },
  {
    id: 'insurance_items', label: 'Insurance',
    icon: '🛡️', route: '/sections/insurance', group: 'affairs',
    description: 'Your life, health, home, auto, and other insurance policies, with who to contact and who benefits.',
  },
  {
    id: 'donation_bank', label: 'Donation Bank',
    icon: '🩸', route: '/sections/donation-bank', group: 'affairs',
    description: 'Your organ, tissue, and body donation preferences, vault-protected like the rest of your most sensitive records.',
  },
]
