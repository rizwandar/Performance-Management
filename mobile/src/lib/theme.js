export const THEME = {
  primary:      '#2D5A3D',
  primaryDark:  '#1A3D28',
  primaryLight: '#3D7A53',
  accent:       '#C9904A',
  accentLight:  '#E8B97A',
  background:   '#F7F5F0',
  surface:      '#FFFFFF',
  text:         '#1A1A1A',
  textMuted:    '#6B6B5F',
  border:       '#E0DDD5',
  danger:       '#B33A3A',
  success:      '#2D6B4A',
}

export const GROUP_COLOURS = {
  legacy:  '#E8F0EB',
  wishes:  '#F0EBE3',
  people:  '#EBF0EE',
  affairs: '#F0EDE8',
}

// IDs must match the server's /sections/completion count keys
export const SECTIONS = [
  { id: 'how_to_be_remembered', name: 'How I\'d Like to Be Remembered',  group: 'legacy'  },
  { id: 'personal_messages',    name: 'Messages to Loved Ones',          group: 'legacy'  },
  { id: 'songs_that_define_me', name: 'Songs That Define Me',            group: 'legacy'  },
  { id: 'life_wishes',          name: 'My Bucket List',                  group: 'legacy'  },
  { id: 'funeral_wishes',       name: 'Funeral & End-of-Life Wishes',    group: 'wishes'  },
  { id: 'medical_wishes',       name: 'Medical & Care Wishes',           group: 'wishes'  },
  { id: 'key_contacts',         name: 'Key Contacts',                    group: 'people'  },
  { id: 'people_to_notify',     name: 'People to Notify',                group: 'people'  },
  { id: 'children-dependants',  name: 'Children & Dependants',           group: 'people'  },
  { id: 'legal_documents',      name: 'Personal & Legal Documents',      group: 'affairs' },
  { id: 'property_items',       name: 'Property & Possessions',          group: 'affairs' },
  { id: 'financial_items',      name: 'Financial Affairs',               group: 'affairs' },
  { id: 'digital_credentials',  name: 'Digital Life',                    group: 'affairs' },
  { id: 'household-info',       name: 'Practical Household Information', group: 'affairs' },
]

export const GROUPS = [
  { key: 'legacy',  label: 'Your Legacy',  colour: GROUP_COLOURS.legacy  },
  { key: 'wishes',  label: 'Your Wishes',  colour: GROUP_COLOURS.wishes  },
  { key: 'people',  label: 'Your People',  colour: GROUP_COLOURS.people  },
  { key: 'affairs', label: 'Your Affairs', colour: GROUP_COLOURS.affairs },
]
