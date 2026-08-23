// Single source of truth for the ad-hoc "share this section" feature
// (section_shares table): which sections can be shared, how to fetch and
// shape their data, and how to render that shape into inline email HTML.
// The same shaped "view" object is also handed to the client as JSON so the
// guest-view page and the email always agree on what a share contains.
const { queryOne, queryAll } = require('../db/database');
const { decryptField } = require('./vault');
const { decryptRow } = require('./vaultFields');
const { getDownloadUrl } = require('./r2');

// Vault-protected sections (SEC-03) can't be decrypted on demand once the
// owner isn't present to supply the vault password (see vault.js — the
// password is never stored server-side). Those six instead get a one-time
// snapshot taken at share time; everything else stays live.
const SECTION_META = {
  legal_documents:      { label: 'Legal Documents',              isVault: true,  kind: 'list' },
  digital_credentials:  { label: 'Digital Vault',                 isVault: true,  kind: 'list' },
  financial_items:      { label: 'Financial Affairs',             isVault: true,  kind: 'list' },
  property_items:       { label: 'Property & Possessions',        isVault: true,  kind: 'list' },
  household_info:       { label: 'Household Info',                isVault: true,  kind: 'list' },
  funeral_wishes:       { label: 'Funeral Wishes',                isVault: false, kind: 'single' },
  // IDEA-32: doctors and medical_records replace the old medical_wishes
  // (split into 3 sections). donation_bank is the third - vault-protected,
  // like the four list-shaped vault sections above, but single-record.
  doctors:              { label: 'Doctors',                       isVault: false, kind: 'single' },
  medical_records:      { label: 'Medical Records',                isVault: false, kind: 'single' },
  donation_bank:        { label: 'Donation Bank',                  isVault: true,  kind: 'single' },
  people_to_notify:     { label: 'People to Notify',              isVault: false, kind: 'list' },
  personal_messages:    { label: 'Messages to Loved Ones',        isVault: false, kind: 'list' },
  songs_that_define_me: { label: 'Songs That Define Me',          isVault: false, kind: 'list' },
  life_wishes:          { label: 'Bucket List',                   isVault: false, kind: 'list' },
  children_dependants:  { label: 'Your Loved Ones',                isVault: false, kind: 'list' },
  pets:                 { label: 'Pet Care',                      isVault: false, kind: 'list' },
  how_to_be_remembered: { label: "How I'd Like to Be Remembered", isVault: false, kind: 'single' },
  insurance_items:      { label: 'Insurance',                     isVault: false, kind: 'list' },
  unfinished_business:  { label: 'Unfinished Business',           isVault: false, kind: 'list' },
  last_moments:         { label: 'Your Last Moments',              isVault: false, kind: 'single' },
};

function isValidSection(key) {
  return Object.hasOwn(SECTION_META, key);
}

const yn  = v => v ? 'Yes' : 'No';
const cap = v => v ? String(v).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : v;

// [dataKey, label, formatter?]
const SINGLE_FIELDS = {
  funeral_wishes: [
    ['burial_preference',  'Burial or cremation preference', cap],
    ['ceremony_type',      'Type of ceremony', cap],
    ['ceremony_location',  'Ceremony location'],
    ['funeral_home',       'Preferred funeral home'],
    ['pre_paid_plan',      'Pre-paid plan', yn],
    ['pre_paid_details',   'Pre-paid plan details'],
    ['readings',           'Readings or poems'],
    ['flowers_preference', 'Flowers or donations', cap],
    ['donation_charity',   'Donation charity'],
    ['special_requests',   'Special requests'],
    ['notes',              'Additional notes'],
  ],
  doctors: [
    ['gp_name',                'GP name'],
    ['gp_phone',                'GP phone'],
    ['hospital_preference',    'Hospital preference'],
  ],
  medical_records: [
    ['advance_care_directive', 'Advance care directive', yn],
    ['directive_location',     'Directive location'],
    ['dnr_preference',         'DNR preference', cap],
    ['current_medications',    'Current medications'],
    ['medical_conditions',     'Medical conditions'],
    ['notes',                  'Notes'],
  ],
  donation_bank: [
    ['organ_donation',         'Organ donation', cap],
    ['organ_donation_details', 'Organ donation details'],
  ],
  how_to_be_remembered: [
    ['about_me',        'About me'],
    ['life_story',      'My life story'],
    ['remembered_for',  'How I would like to be remembered'],
    ['legacy_message',  'A message to you all'],
  ],
  last_moments: [
    ['message',   'Your words'],
    ['audio_url', 'Voice recording', null, 'audio'],
    ['notes',     'Notes'],
  ],
};

// { titleKey, titleFallback?, titlePrefix?, fields: [[dataKey, label, formatter?]] }
const LIST_FIELDS = {
  legal_documents: {
    titleKey: 'title',
    fields: [
      ['document_type', 'Document type'], ['held_by', 'Held by'],
      ['location', 'Location'], ['notes', 'Notes'],
    ],
  },
  financial_items: {
    titleKey: 'institution', titleFallback: 'Unnamed',
    fields: [
      ['category', 'Category', cap], ['account_type', 'Account type'],
      ['account_reference', 'Account reference'], ['contact_name', 'Contact name'],
      ['contact_phone', 'Contact phone'], ['notes', 'Notes'],
    ],
  },
  property_items: {
    titleKey: 'title',
    fields: [
      ['category', 'Category', cap], ['description', 'Description'],
      ['location', 'Location'], ['intended_recipient', 'Intended recipient'], ['notes', 'Notes'],
    ],
  },
  household_info: {
    titleKey: 'title',
    fields: [
      ['category', 'Category', cap], ['provider', 'Provider'],
      ['account_reference', 'Account reference'], ['contact', 'Contact'], ['notes', 'Notes'],
    ],
  },
  digital_credentials: {
    titleKey: 'service',
    fields: [
      ['service_url', 'Website'], ['username', 'Username'],
      ['password', 'Password'], ['notes', 'Notes'],
    ],
  },
  people_to_notify: {
    titleKey: 'name',
    fields: [
      ['relationship', 'Relationship'], ['email', 'Email'],
      ['phone', 'Phone'], ['notified_by', 'Notified by'], ['notes', 'Notes'],
    ],
  },
  personal_messages: {
    titleKey: 'recipient_name', titlePrefix: 'To: ',
    fields: [
      ['relationship', 'Relationship'], ['message', 'Message'],
      ['audio_url', 'Voice message', null, 'audio'], ['notes', 'Notes'],
    ],
  },
  songs_that_define_me: {
    titleKey: 'title',
    fields: [['artist', 'Artist'], ['album', 'Album'], ['why_meaningful', 'Why it matters']],
  },
  life_wishes: {
    titleKey: 'title',
    fields: [
      ['description', 'Description'], ['category', 'Category', cap],
      ['status', 'Status', cap], ['notes', 'Notes'],
    ],
  },
  children_dependants: {
    titleKey: 'name',
    fields: [
      ['type', 'Type', cap], ['date_of_birth', 'Date of birth'], ['special_needs', 'Special needs'],
      ['preferred_guardian', 'Preferred guardian'], ['guardian_contact', 'Guardian contact'],
      ['alternate_guardian', 'Alternate guardian'], ['alternate_contact', 'Alternate contact'], ['notes', 'Notes'],
    ],
  },
  pets: {
    titleKey: 'name',
    fields: [
      ['age', 'Age'], ['special_needs', 'Special needs'], ['preferred_caretaker', 'Preferred caretaker'],
      ['caretaker_contact', 'Caretaker contact'], ['alternate_caretaker', 'Alternate caretaker'],
      ['alternate_contact', 'Alternate contact'], ['notes', 'Notes'],
    ],
  },
  insurance_items: {
    titleKey: 'provider', titleFallback: 'Unnamed policy',
    fields: [
      ['policy_type', 'Policy type'], ['policy_number', 'Policy number'],
      ['contact', 'Contact'], ['beneficiary', 'Beneficiary'], ['notes', 'Notes'],
    ],
  },
  unfinished_business: {
    titleKey: 'name',
    fields: [['description', 'Description'], ['notes', 'Notes']],
  },
};

// ---------------------------------------------------------------------------
// Fetch raw data for a section. `vaultKey` (a Buffer from vault.deriveKey) is
// required for isVault sections and ignored otherwise.
// ---------------------------------------------------------------------------
async function fetchRawSectionData(sectionKey, userId, vaultKey) {
  switch (sectionKey) {
    case 'funeral_wishes':
      return queryOne('SELECT * FROM funeral_wishes WHERE user_id = $1', [userId]);
    case 'doctors':
      return queryOne('SELECT * FROM doctors WHERE user_id = $1', [userId]);
    case 'medical_records':
      return queryOne('SELECT * FROM medical_records WHERE user_id = $1', [userId]);
    case 'donation_bank': {
      const row = await queryOne('SELECT * FROM donation_bank WHERE user_id = $1', [userId]);
      return row ? decryptRow('donation_bank', row, vaultKey).decrypted : null;
    }
    case 'how_to_be_remembered':
      return queryOne('SELECT about_me, life_story, remembered_for, legacy_message FROM users WHERE id = $1', [userId]);
    case 'people_to_notify':
      return queryAll('SELECT * FROM people_to_notify WHERE user_id = $1 ORDER BY created_at', [userId]);
    case 'personal_messages': {
      const rows = await queryAll('SELECT * FROM personal_messages WHERE user_id = $1 ORDER BY created_at', [userId]);
      // Signed URL generated fresh per request (this runs live on every guest
      // visit for a non-vault section), never persisted - IDEA-01.
      return Promise.all(rows.map(async ({ audio_r2_key, ...row }) => ({
        ...row,
        audio_url: audio_r2_key ? await getDownloadUrl(audio_r2_key) : null,
      })));
    }
    case 'songs_that_define_me':
      return queryAll('SELECT * FROM songs_that_define_me WHERE user_id = $1 ORDER BY added_at', [userId]);
    case 'life_wishes':
      return queryAll('SELECT * FROM life_wishes WHERE user_id = $1 ORDER BY created_at', [userId]);
    case 'children_dependants':
      return queryAll('SELECT * FROM children_dependants WHERE user_id = $1 ORDER BY created_at', [userId]);
    case 'pets':
      return queryAll('SELECT * FROM pets WHERE user_id = $1 ORDER BY created_at', [userId]);
    case 'insurance_items':
      return queryAll('SELECT * FROM insurance_items WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    case 'unfinished_business':
      return queryAll('SELECT * FROM unfinished_business WHERE user_id = $1 ORDER BY created_at', [userId]);
    case 'last_moments': {
      const row = await queryOne('SELECT * FROM last_moments WHERE user_id = $1', [userId]);
      if (!row) return null;
      // Signed URL generated fresh per request, same pattern as personal_messages above.
      const { audio_r2_key, ...rest } = row;
      return { ...rest, audio_url: audio_r2_key ? await getDownloadUrl(audio_r2_key) : null };
    }

    case 'legal_documents':
    case 'financial_items':
    case 'property_items':
    case 'household_info': {
      const rows = await queryAll(`SELECT * FROM ${sectionKey} WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
      return rows.map(row => decryptRow(sectionKey, row, vaultKey).decrypted);
    }
    case 'digital_credentials': {
      const rows = await queryAll(
        'SELECT id, service, service_url, username_enc, password_enc, notes_enc, created_at FROM digital_credentials WHERE user_id = $1 ORDER BY service',
        [userId]
      );
      return rows.map(row => ({
        id:          row.id,
        service:     row.service,
        service_url: row.service_url,
        username:    decryptField(row.username_enc, vaultKey),
        password:    decryptField(row.password_enc, vaultKey),
        notes:       decryptField(row.notes_enc, vaultKey),
      }));
    }
    default:
      throw new Error(`Unknown section: ${sectionKey}`);
  }
}

// ---------------------------------------------------------------------------
// OPS-29: files uploaded against a section (e.g. a scanned will, a property
// deed, an insurance policy) were previously invisible to a guest viewing an
// ad-hoc section share - only the item's text metadata was ever included.
// Deliberately excluded for any isVault section (legal_documents,
// digital_credentials, financial_items, property_items, household_info):
// a vault section's view is either a one-time encrypted snapshot taken at
// share time (a signed download URL baked in then would be long expired by
// the time it's opened) or, if ever re-fetched live, still has no vault
// password available to check against (see checkVault in lib/vaultAuth.js,
// which every authenticated document download normally goes through). A
// vault-protected file can never be safely surfaced through this flow.
// ---------------------------------------------------------------------------
async function fetchSectionDocuments(sectionKey, userId) {
  const meta = SECTION_META[sectionKey];
  if (!meta || meta.isVault) return [];

  const docs = await queryAll(
    `SELECT id, item_id, original_name, size_bytes, mime_type, r2_key
     FROM uploaded_documents WHERE user_id = $1 AND section_id = $2`,
    [userId, sectionKey]
  );
  if (!docs.length) return [];

  // Signed URL generated fresh per call, never stored - same pattern as the
  // personal_messages audio attachment above and the authenticated document
  // download route in routes/documents.js.
  return Promise.all(docs.map(async ({ r2_key, ...doc }) => ({
    ...doc,
    download_url: await getDownloadUrl(r2_key),
  })));
}

// ---------------------------------------------------------------------------
// Shape raw data into a display-agnostic view:
//   { kind: 'empty' }
//   { kind: 'single', fields: [{label, value, type}] }
//   { kind: 'list', items: [{ title, fields: [{label, value, type}] }] }
// `type` defaults to 'text'; 'audio' (IDEA-01) tells a JSON consumer (the
// guest-view page) to render an <audio> player instead of plain text. The
// email HTML renderer below deliberately does NOT turn an 'audio' value into
// a clickable link - see fieldRowHtml.
// ---------------------------------------------------------------------------
function shapeFields(fieldDefs, row) {
  return fieldDefs
    .map(([key, label, fmt, type]) => {
      const raw = row[key];
      if (raw === null || raw === undefined || raw === '') return null;
      return { label, value: fmt ? fmt(raw) : String(raw), type: type || 'text' };
    })
    .filter(Boolean);
}

// `documents` (OPS-29) is the array from fetchSectionDocuments above - always
// [] for isVault sections, and generally [] for any section with no uploaded
// files. Included as a flat, section-level list (each entry carries its own
// item_id) rather than nested inside individual items, since not every
// section here is item-shaped (funeral_wishes/doctors/medical_records/
// donation_bank/how_to_be_remembered are single objects with no item id to
// nest under) and this keeps one consistent shape across both. The guest-view
// page groups by item_id itself where that's meaningful.
function buildSectionView(sectionKey, raw, documents = []) {
  const meta = SECTION_META[sectionKey];
  if (!meta) throw new Error(`Unknown section: ${sectionKey}`);

  if (meta.kind === 'single') {
    if (!raw && !documents.length) return { kind: 'empty' };
    const fields = shapeFields(SINGLE_FIELDS[sectionKey], raw || {});
    if (!fields.length && !documents.length) return { kind: 'empty' };
    return { kind: 'single', fields, documents };
  }

  const rows = raw || [];
  if (!rows.length && !documents.length) return { kind: 'empty' };
  const { titleKey, titleFallback, titlePrefix, fields: fieldDefs } = LIST_FIELDS[sectionKey];
  const items = rows.map(row => ({
    id:     row.id,
    title:  (titlePrefix || '') + (row[titleKey] || titleFallback || 'Untitled'),
    fields: shapeFields(fieldDefs, row),
  }));
  return { kind: 'list', items, documents };
}

// ---------------------------------------------------------------------------
// Render a view into inline-styled HTML for embedding directly in the share
// email (non-vault sections only — vault sections never put their content in
// the email body, only a link, see routes/sectionShares.js).
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fieldRowHtml(f) {
  // Audio fields carry a signed R2 URL as their value - it's short-lived
  // (see r2.js's default TTL) so it's fit to hand to a page rendered right
  // now, but not fit to embed as a clickable link in an email that might sit
  // unread for days. Point to the (separately included, always-live) share
  // link instead of leaking a URL that will 404 once it expires.
  if (f.type === 'audio') {
    return `
      <tr>
        <td style="padding:4px 10px 4px 0; font-weight:600; color:#2D5A3D; font-size:14px; width:190px; vertical-align:top;">${escapeHtml(f.label)}</td>
        <td style="padding:4px 0; color:#1F2937; font-size:14px;">\u{1F3A4} Included &mdash; open the link above to listen (audio can't be played inside this email).</td>
      </tr>`;
  }
  return `
    <tr>
      <td style="padding:4px 10px 4px 0; font-weight:600; color:#2D5A3D; font-size:14px; width:190px; vertical-align:top;">${escapeHtml(f.label)}</td>
      <td style="padding:4px 0; color:#1F2937; font-size:14px;">${escapeHtml(f.value)}</td>
    </tr>`;
}

function renderViewToEmailHtml(view) {
  if (view.kind === 'empty') {
    return '<p style="color:#6B7280; font-size:14px;">Nothing has been recorded in this section yet.</p>';
  }
  if (view.kind === 'single') {
    return `<table style="width:100%; border-collapse:collapse;">${view.fields.map(fieldRowHtml).join('')}</table>`;
  }
  return view.items.map(item => `
    <div style="margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #E5DFC8;">
      <p style="font-weight:700; color:#1A3D28; margin:0 0 6px;">${escapeHtml(item.title)}</p>
      <table style="width:100%; border-collapse:collapse;">${item.fields.map(fieldRowHtml).join('')}</table>
    </div>
  `).join('');
}

module.exports = {
  SECTION_META,
  isValidSection,
  fetchRawSectionData,
  fetchSectionDocuments,
  buildSectionView,
  renderViewToEmailHtml,
};
