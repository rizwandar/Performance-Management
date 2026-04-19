// App identity
export const APP_NAME = 'In Good Hands'
export const APP_TAGLINE = 'Everything they need to carry on, in good hands.'

// Theme colours — warm, grounded, secure
export const THEME = {
  primary:      '#2D5A3D',   // deep forest green — trustworthy, natural, grounded
  primaryDark:  '#1A3D28',   // darker green for hover/active states
  primaryLight: '#3D7A53',   // lighter green for accents
  accent:       '#C9904A',   // warm gold — warmth, value, legacy
  accentLight:  '#E8B97A',   // lighter gold for highlights
  background:   '#F7F5F0',   // warm parchment — dignified, clean
  surface:      '#FFFFFF',   // white for cards/panels
  text:         '#1A1A1A',   // near-black for body text
  textMuted:    '#6B6B5F',   // warm grey for secondary text
  border:       '#E0DDD5',   // warm light border
  danger:       '#B33A3A',   // warm red — not harsh
  success:      '#2D6B4A',   // deep forest green success
}

// Inactivity period options (in months)
export const INACTIVITY_PERIODS = [
  { label: '2 months',   value: 2  },
  { label: '3 months',   value: 3  },
  { label: '6 months',   value: 6  },
  { label: '12 months',  value: 12 },
  { label: '18 months',  value: 18 },
  { label: '24 months',  value: 24 },
]

// Sections
// phase: 1 = fully built in Phase 1, 2 = placeholder only in Phase 1
export const SECTIONS = [
  {
    id: 'legal_documents',
    number: 1,
    name: 'Personal & Legal Documents',
    description: 'Your will, power of attorney, certificates, and other important documents.',
    icon: 'file-text',
    phase: 1,
  },
  {
    id: 'financial_affairs',
    number: 2,
    name: 'Financial Affairs',
    description: 'Bank accounts, investments, insurance, debts, and digital assets.',
    icon: 'dollar-sign',
    phase: 1,
  },
  {
    id: 'digital_life',
    number: 3,
    name: 'Digital Life',
    description: 'Email, social media, subscriptions, and online accounts.',
    icon: 'monitor',
    phase: 2,
  },
  {
    id: 'funeral_wishes',
    number: 4,
    name: 'Funeral & End-of-Life Wishes',
    description: 'Your wishes for your funeral, burial or cremation, and ceremony.',
    icon: 'heart',
    phase: 1,
  },
  {
    id: 'medical_wishes',
    number: 5,
    name: 'Medical & Care Wishes',
    description: 'Advance care directives, organ donation, and medical preferences.',
    icon: 'activity',
    phase: 1,
  },
  {
    id: 'people_to_notify',
    number: 6,
    name: 'People to Notify',
    description: 'Who should be told, who is responsible for telling them, and their contact details.',
    icon: 'users',
    phase: 1,
  },
  {
    id: 'property_possessions',
    number: 7,
    name: 'Property & Possessions',
    description: 'Real estate, vehicles, sentimental items, and pets.',
    icon: 'home',
    phase: 1,
  },
  {
    id: 'messages',
    number: 8,
    name: 'Messages to Loved Ones',
    description: 'Personal letters or messages for the people who matter most to you.',
    icon: 'message-circle',
    phase: 1,
  },
  {
    id: 'household_info',
    number: 9,
    name: 'Practical Household Information',
    description: 'Utilities, alarm codes, bills, and day-to-day household details.',
    icon: 'tool',
    phase: 2,
  },
  {
    id: 'children_dependants',
    number: 10,
    name: 'Children & Dependants',
    description: 'Guardianship wishes and care instructions for those who depend on you.',
    icon: 'users',
    phase: 2,
  },
]

export const PHASE_1_SECTIONS = SECTIONS.filter(s => s.phase === 1)
export const PLACEHOLDER_SECTIONS = SECTIONS.filter(s => s.phase === 2)
