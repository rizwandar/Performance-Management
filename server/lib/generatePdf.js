const PDFDocument = require('pdfkit');

// ---------------------------------------------------------------------------
// Theme palettes
// ---------------------------------------------------------------------------
const THEME_PALETTES = {
  forest:      { dark: '#1A3D28', mid: '#2D5A3D', accent: '#C9904A', bg: '#F7F5F0' },
  dusk:        { dark: '#1E2D4A', mid: '#2A3F63', accent: '#B87333', bg: '#F5F0E8' },
  terracotta:  { dark: '#3D2315', mid: '#5C3520', accent: '#D4842A', bg: '#FAF7F2' },
  ocean:       { dark: '#0D3D56', mid: '#1A5C80', accent: '#E6944A', bg: '#F5F9FA' },
  rosegarden:  { dark: '#5C2D3C', mid: '#7A3D50', accent: '#C4976A', bg: '#FAF5F6' },
  midnight:    { dark: '#1A1A3E', mid: '#2D2D60', accent: '#B8963E', bg: '#F5F5FA' },
  highcontrast:{ dark: '#111111', mid: '#333333', accent: '#C05000', bg: '#FFFFFF' },
  softmist:    { dark: '#4A5A65', mid: '#6A7D8A', accent: '#A89870', bg: '#F8F9FA' },
};
const DEFAULT_THEME = THEME_PALETTES.forest;

const TEXT  = '#1A1A1A';
const MUTED = '#6B6B5F';
const RULE  = '#D4C9B0';

// ---------------------------------------------------------------------------
// Two-column layout constants  (A4 = 595.28 × 841.89 pt)
// ---------------------------------------------------------------------------
const PAGE_W  = 595.28;
const MARGIN  = 50;
const GUTTER  = 14;
const COL_W   = (PAGE_W - MARGIN * 2 - GUTTER) / 2;  // ≈ 240.6 pt
const LEFT_X  = MARGIN;
const RIGHT_X = MARGIN + COL_W + GUTTER;

// ---------------------------------------------------------------------------
// Font mapping  (PDFKit built-ins only)
// ---------------------------------------------------------------------------
function getFonts(fontId) {
  const serif = ['georgia', 'lora', 'playfair'].includes(fontId);
  return {
    regular:  serif ? 'Times-Roman'      : 'Helvetica',
    bold:     serif ? 'Times-Bold'       : 'Helvetica-Bold',
    italic:   serif ? 'Times-Italic'     : 'Helvetica-Oblique',
    boldItal: serif ? 'Times-BoldItalic' : 'Helvetica-BoldOblique',
  };
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------
const BRAND = {
  name:    'In Good Hands',
  tagline: 'Your story. Your wishes. In good hands.',
  phone:   '+61 2 9000 0000',
  email:   'hello@ingoodhands.com.au',
  website: 'www.ingoodhands.com.au',
  abn:     'ABN 00 000 000 000',
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function formatDate(str) {
  if (!str) return null;
  try { return new Date(str).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return str; }
}

function val(v) { return v || null; }

function bottomY(doc) {
  return doc.page.height - doc.page.margins.bottom;
}

function rule(doc) {
  const x1 = doc.page.margins.left;
  const x2 = doc.page.width - doc.page.margins.right;
  doc.moveTo(x1, doc.y).lineTo(x2, doc.y).strokeColor(RULE).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

// ---------------------------------------------------------------------------
// Section header — full width, gold accent bar + dark title
// ---------------------------------------------------------------------------
function sectionHeader(doc, title, palette, fonts) {
  if (doc.y > bottomY(doc) - 80) {
    doc.addPage();
  } else {
    doc.moveDown(0.8);
  }

  const y = doc.y;
  doc.rect(LEFT_X, y, 3, 16).fill(palette.accent);
  doc.font(fonts.bold).fontSize(11).fillColor(palette.dark)
     .text(title, LEFT_X + 10, y + 1, {
       width: PAGE_W - MARGIN * 2 - 10,
     });
  doc.moveDown(0.25);
  rule(doc);
  doc.fillColor(TEXT).font(fonts.regular).fontSize(9.5);
}

// ---------------------------------------------------------------------------
// Full-width text block  (narratives)
// ---------------------------------------------------------------------------
function textBlock(doc, label, text, palette, fonts) {
  if (!text) return;
  if (doc.y > bottomY(doc) - 40) doc.addPage();
  if (label) {
    doc.font(fonts.bold).fontSize(9.5).fillColor(palette.dark)
       .text(label, LEFT_X, doc.y, { width: PAGE_W - MARGIN * 2 }).moveDown(0.2);
  }
  doc.font(fonts.regular).fontSize(9.5).fillColor(TEXT)
     .text(text, LEFT_X, doc.y, { width: PAGE_W - MARGIN * 2, lineGap: 2 });
  doc.moveDown(0.5);
}

function noData(doc, fonts) {
  doc.font(fonts.italic).fontSize(9).fillColor(MUTED)
     .text('Nothing recorded in this section yet.', LEFT_X, doc.y, { width: PAGE_W - MARGIN * 2 })
     .moveDown(0.3);
  doc.fillColor(TEXT);
}

// ---------------------------------------------------------------------------
// Two-column field pairs
// e.g. renderFields(doc, [
//   ['Burial preference', 'Cremation'],  ['Ceremony type', 'Secular'],
//   ['Location', 'St Mary's'],           ['Funeral home', null],
// ], fonts)
// ---------------------------------------------------------------------------
function renderFields(doc, pairs, fonts) {
  const LABEL_W = 88;
  const VAL_W   = COL_W - LABEL_W - 4;

  for (let i = 0; i < pairs.length; i += 2) {
    const [ll, lv] = pairs[i];
    const rp = pairs[i + 1];
    const [rl, rv] = rp || [null, null];

    if (!lv && !rv) continue;
    if (doc.y > bottomY(doc) - 20) doc.addPage();

    const rowY = doc.y;
    let leftEndY  = rowY;
    let rightEndY = rowY;

    if (lv) {
      doc.font(fonts.bold).fontSize(7.5).fillColor(MUTED)
         .text(ll.toUpperCase() + ': ', LEFT_X, rowY, { continued: true, width: LABEL_W });
      doc.font(fonts.regular).fontSize(8.5).fillColor(TEXT)
         .text(String(lv), { width: VAL_W });
      leftEndY = doc.y;
    }

    if (rv) {
      doc.font(fonts.bold).fontSize(7.5).fillColor(MUTED)
         .text(rl.toUpperCase() + ': ', RIGHT_X, rowY, { continued: true, width: LABEL_W });
      doc.font(fonts.regular).fontSize(8.5).fillColor(TEXT)
         .text(String(rv), { width: VAL_W });
      rightEndY = doc.y;
    }

    doc.y = Math.max(leftEndY, rightEndY) + 3;
    doc.fillColor(TEXT);
  }
}

// ---------------------------------------------------------------------------
// Calculate card height (without rendering)
// ---------------------------------------------------------------------------
function calcCardHeight(lines) {
  const valid = lines.filter(l => l.value);
  if (!valid.length) return 0;
  return valid.length * 13 + 6 * 2;  // lineH=13, padV=6
}

// ---------------------------------------------------------------------------
// Render a single item card at an explicit (x, y) position
// Returns the height rendered.
// ---------------------------------------------------------------------------
function renderCardAt(doc, lines, palette, fonts, x, y, colWidth) {
  const valid = lines.filter(l => l.value);
  if (!valid.length) return 0;

  const lineH = 13;
  const padV  = 6;
  const cardH = valid.length * lineH + padV * 2;

  doc.rect(x, y, colWidth, cardH).fill('#FAF8F4');
  doc.rect(x, y, 2.5, cardH).fill(palette.accent);

  let cy = y + padV;
  valid.forEach((line, i) => {
    if (i === 0) {
      doc.font(fonts.bold).fontSize(9.5).fillColor(palette.dark)
         .text(line.value, x + 10, cy, { width: colWidth - 14 });
    } else {
      doc.font(fonts.bold).fontSize(7.5).fillColor(MUTED)
         .text(line.label.toUpperCase() + ': ', x + 10, cy, { continued: true, width: colWidth - 14 });
      doc.font(fonts.regular).fontSize(8.5).fillColor(TEXT).text(line.value);
    }
    cy += lineH;
  });

  return cardH;
}

// ---------------------------------------------------------------------------
// Render an array of item-card line-sets in a two-column grid
// ---------------------------------------------------------------------------
function renderCards(doc, cardLines, palette, fonts) {
  const GAP = 5;  // vertical gap between rows

  for (let i = 0; i < cardLines.length; i += 2) {
    const lLines = cardLines[i];
    const rLines = cardLines[i + 1] || null;

    const lH   = calcCardHeight(lLines);
    const rH   = rLines ? calcCardHeight(rLines) : 0;
    const rowH = Math.max(lH, rH);

    if (rowH === 0) continue;
    if (doc.y + rowH > bottomY(doc) - 8) doc.addPage();

    const startY = doc.y;
    renderCardAt(doc, lLines, palette, fonts, LEFT_X,  startY, COL_W);
    if (rLines) renderCardAt(doc, rLines, palette, fonts, RIGHT_X, startY, COL_W);

    doc.y = startY + rowH + GAP;
    doc.fillColor(TEXT).font(fonts.regular).fontSize(9.5);
  }
}

// ---------------------------------------------------------------------------
// Page footer
// ---------------------------------------------------------------------------
function addPageFooter(doc, pageNum, palette, fonts) {
  const savedY = doc.y;
  const bottom = doc.page.height - 30;
  const left   = doc.page.margins.left;
  const width  = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.page.margins.bottom = 0;
  doc.moveTo(left, bottom - 14).lineTo(left + width, bottom - 14)
     .strokeColor(RULE).lineWidth(0.5).stroke();

  doc.font(fonts.bold).fontSize(7).fillColor(palette.dark)
     .text(BRAND.name, left, bottom - 10, { continued: true, width: width * 0.6 });
  doc.font(fonts.regular).fillColor(MUTED)
     .text(`  |  ${BRAND.phone}  |  ${BRAND.email}  |  ${BRAND.website}`);

  doc.font(fonts.regular).fontSize(7).fillColor(MUTED)
     .text(`Page ${pageNum}`, left, bottom - 10, { align: 'right', width });

  doc.page.margins.bottom = 50;
  doc.y = savedY;
}

// ---------------------------------------------------------------------------
// Vault-locked section notice (full width)
// ---------------------------------------------------------------------------
function vaultLockedSection(doc, title, palette, fonts) {
  if (doc.y > bottomY(doc) - 70) doc.addPage();
  else doc.moveDown(0.8);

  const y     = doc.y;
  const width = PAGE_W - MARGIN * 2;

  doc.rect(LEFT_X, y, 3, 16).fill(MUTED);
  doc.font(fonts.bold).fontSize(11).fillColor(MUTED)
     .text(title, LEFT_X + 10, y + 1, { width: width - 10 });
  doc.moveDown(0.3);
  rule(doc);

  const boxY = doc.y;
  const boxH = 44;
  doc.rect(LEFT_X, boxY, width, boxH).fill('#F5F5F5').stroke('#E0DED8');
  doc.font(fonts.italic).fontSize(9).fillColor(MUTED)
     .text(
       'This section is vault-protected. The content is encrypted and can only be accessed ' +
       'on the In Good Hands website by entering your vault password.',
       LEFT_X + 12, boxY + 10, { width: width - 24, lineGap: 2 }
     );
  doc.y = boxY + boxH + 8;
  doc.fillColor(TEXT).font(fonts.regular).fontSize(9.5);
}

// ---------------------------------------------------------------------------
// Main PDF generator
// ---------------------------------------------------------------------------
function generatePdf(data, outputStream) {
  const {
    user, settings = {}, logoBuffer,
    legalDocs       = [],
    financialItems  = [],
    funeralWishes   = {},
    medicalWishes   = {},
    peopleToNotify  = [],
    propertyItems   = [],
    messages        = [],
    songsDefineMe   = [],
    lifeWishes      = [],
    trustedContacts = [],
    childrenDependants = [],
    householdInfo   = [],
    vaultData       = null,  // { legalDocs, credentials } — only in complete export
  } = data;

  const palette = THEME_PALETTES[settings.site_theme] || DEFAULT_THEME;
  const fonts   = getFonts(settings.site_font || 'georgia');

  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: false });
  doc.pipe(outputStream);

  let pageNum = 0;
  doc.on('pageAdded', () => { pageNum++; });

  // ── Cover page (single column) ────────────────────────────────────────────
  doc.addPage();

  doc.rect(0, 0, PAGE_W, 140).fill(palette.dark);

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, PAGE_W / 2 - 40, 14, { width: 80, height: 50, fit: [80, 50] });
      doc.fillColor('#ffffff').fontSize(18).font(fonts.bold)
         .text(BRAND.name, 0, 72, { align: 'center', width: PAGE_W });
    } catch {
      doc.fillColor('#ffffff').fontSize(26).font(fonts.bold)
         .text(BRAND.name, 0, 38, { align: 'center', width: PAGE_W });
    }
  } else {
    doc.fillColor('#ffffff').fontSize(26).font(fonts.bold)
       .text(BRAND.name, 0, 38, { align: 'center', width: PAGE_W });
  }

  doc.fontSize(11).font(fonts.italic).fillColor('#A8C5B0')
     .text(BRAND.tagline, 0, 76, { align: 'center', width: PAGE_W });

  doc.moveTo(PAGE_W / 2 - 60, 98).lineTo(PAGE_W / 2 + 60, 98)
     .strokeColor(palette.accent).lineWidth(1).stroke();
  doc.fontSize(8).font(fonts.regular).fillColor('#A8C5B0')
     .text(BRAND.website, 0, 106, { align: 'center', width: PAGE_W });

  doc.fillColor(TEXT).font(fonts.regular).fontSize(9.5);
  doc.y = 160;

  doc.font(fonts.bold).fontSize(14).fillColor(palette.dark)
     .text(user.name, LEFT_X, doc.y, { align: 'center', width: PAGE_W - MARGIN * 2 });
  doc.font(fonts.italic).fontSize(9.5).fillColor(MUTED)
     .text('Personal Planning Record', { align: 'center', width: PAGE_W - MARGIN * 2 });
  doc.moveDown(0.6);
  rule(doc);
  doc.moveDown(0.4);

  // Cover details — two columns
  renderFields(doc, [
    ['Full name',          user.name],
    ['Email',              user.email],
    ['Date of birth',      formatDate(user.date_of_birth)],
    ['Document generated', formatDate(new Date().toISOString())],
  ], fonts);

  doc.moveDown(0.6);
  rule(doc);

  doc.font(fonts.italic).fontSize(8).fillColor(MUTED)
     .text(
       'This document is a personal planning record generated by In Good Hands. ' +
       'It does not constitute a legal will or formal estate planning document. ' +
       'Please consult a qualified legal professional for advice on wills, powers of attorney, ' +
       'and estate planning. Keep this document in a safe place and share only with people you trust.',
       LEFT_X, doc.y, { width: PAGE_W - MARGIN * 2, lineGap: 2 }
     );

  addPageFooter(doc, pageNum, palette, fonts);

  // ── Page 2: How I'd Like to Be Remembered + Funeral + Medical ─────────────
  doc.addPage();

  sectionHeader(doc, "How I'd Like to Be Remembered", palette, fonts);
  const hasRemembered = user.life_story || user.about_me || user.remembered_for || user.legacy_message;
  if (!hasRemembered) {
    noData(doc, fonts);
  } else {
    textBlock(doc, 'My Life Story',                  user.life_story,     palette, fonts);
    textBlock(doc, 'My Guiding Words',               user.about_me,       palette, fonts);
    textBlock(doc, "How I'd Like to Be Remembered",  user.remembered_for, palette, fonts);
    textBlock(doc, 'A Message to Leave Behind',       user.legacy_message, palette, fonts);
  }

  sectionHeader(doc, 'Funeral & End-of-Life Wishes', palette, fonts);
  if (!funeralWishes?.burial_preference) {
    noData(doc, fonts);
  } else {
    renderFields(doc, [
      ['Burial preference',  funeralWishes.burial_preference],
      ['Ceremony type',      funeralWishes.ceremony_type],
      ['Ceremony location',  funeralWishes.ceremony_location],
      ['Funeral home',       funeralWishes.funeral_home],
      ['Pre-paid plan',      funeralWishes.pre_paid_plan ? 'Yes' : null],
      ['Pre-paid details',   funeralWishes.pre_paid_details],
      ['Music preferences',  funeralWishes.music_preferences],
      ['Readings',           funeralWishes.readings],
      ['Flowers preference', funeralWishes.flowers_preference],
      ['Donation charity',   funeralWishes.donation_charity],
      ['Special requests',   funeralWishes.special_requests],
      ['Notes',              funeralWishes.notes],
    ], fonts);
  }

  sectionHeader(doc, 'Medical & Care Wishes', palette, fonts);
  if (!medicalWishes?.organ_donation) {
    noData(doc, fonts);
  } else {
    renderFields(doc, [
      ['Organ donation',          medicalWishes.organ_donation],
      ['Organ donation details',  medicalWishes.organ_donation_details],
      ['Advance care directive',  medicalWishes.advance_care_directive ? 'Yes, document exists' : null],
      ['Directive location',      medicalWishes.directive_location],
      ['DNR preference',          medicalWishes.dnr_preference],
      ['GP name',                 medicalWishes.gp_name],
      ['GP phone',                medicalWishes.gp_phone],
      ['Hospital preference',     medicalWishes.hospital_preference],
      ['Current medications',     medicalWishes.current_medications],
      ['Medical conditions',      medicalWishes.medical_conditions],
      ['Notes',                   medicalWishes.notes],
    ], fonts);
  }

  addPageFooter(doc, pageNum, palette, fonts);

  // ── Page 3: Messages + Key Contacts + People to Notify ────────────────────
  doc.addPage();

  sectionHeader(doc, 'Messages to Loved Ones', palette, fonts);
  if (!messages.length) {
    noData(doc, fonts);
  } else {
    messages.forEach(item => {
      if (doc.y > bottomY(doc) - 50) doc.addPage();
      doc.font(fonts.bold).fontSize(10).fillColor(palette.dark)
         .text(`To ${item.recipient_name}${item.relationship ? ` (${item.relationship})` : ''}`,
               LEFT_X, doc.y, { width: PAGE_W - MARGIN * 2 });
      if (item.message) {
        doc.font(fonts.regular).fontSize(9).fillColor(TEXT)
           .text(item.message, LEFT_X, doc.y, { indent: 10, lineGap: 1, width: PAGE_W - MARGIN * 2 - 10 });
      }
      if (item.notes) {
        doc.font(fonts.italic).fontSize(8).fillColor(MUTED)
           .text(item.notes, LEFT_X, doc.y, { indent: 10, width: PAGE_W - MARGIN * 2 - 10 });
      }
      doc.moveDown(0.5).fillColor(TEXT);
    });
  }

  sectionHeader(doc, 'Key Contacts', palette, fonts);
  const hasEmergency = user.emergency_contact_name;
  if (!hasEmergency && !(trustedContacts?.length)) {
    noData(doc, fonts);
  } else {
    if (hasEmergency) {
      doc.font(fonts.bold).fontSize(9).fillColor(palette.dark)
         .text('Emergency Contact', LEFT_X, doc.y, { width: PAGE_W - MARGIN * 2 }).moveDown(0.2);
      renderFields(doc, [
        ['Name',  user.emergency_contact_name],
        ['Phone', user.emergency_contact_phone],
        ['Email', user.emergency_contact_email],
      ], fonts);
      doc.moveDown(0.3);
    }
    if (trustedContacts?.length) {
      doc.font(fonts.bold).fontSize(9).fillColor(palette.dark)
         .text('Trusted Contacts', LEFT_X, doc.y, { width: PAGE_W - MARGIN * 2 }).moveDown(0.2);
      renderCards(doc, trustedContacts.map(tc => [
        { label: '',             value: tc.name },
        { label: 'Relationship', value: tc.relationship },
        { label: 'Email',        value: tc.email },
        { label: 'Phone',        value: tc.phone },
      ]), palette, fonts);
    }
  }

  sectionHeader(doc, 'People to Notify', palette, fonts);
  if (!peopleToNotify.length) {
    noData(doc, fonts);
  } else {
    renderCards(doc, peopleToNotify.map(item => [
      { label: '',             value: item.name },
      { label: 'Relationship', value: item.relationship },
      { label: 'Email',        value: item.email },
      { label: 'Phone',        value: item.phone },
      { label: 'Notified by',  value: item.notified_by },
      { label: 'Notes',        value: item.notes },
    ]), palette, fonts);
  }

  addPageFooter(doc, pageNum, palette, fonts);

  // ── Page 4: Property + Songs + Bucket List ─────────────────────────────────
  doc.addPage();

  sectionHeader(doc, 'Property & Possessions', palette, fonts);
  if (!propertyItems.length) {
    noData(doc, fonts);
  } else {
    renderCards(doc, propertyItems.map(item => [
      { label: '',              value: item.title },
      { label: 'Category',      value: item.category },
      { label: 'Description',   value: item.description },
      { label: 'Location',      value: item.location },
      { label: 'Goes to',       value: item.intended_recipient },
      { label: 'Notes',         value: item.notes },
    ]), palette, fonts);
  }

  sectionHeader(doc, 'Songs That Define Me', palette, fonts);
  if (!songsDefineMe.length) {
    noData(doc, fonts);
  } else {
    renderCards(doc, songsDefineMe.map(item => [
      { label: '',               value: `${item.title} by ${item.artist}` },
      { label: 'Album',          value: item.album },
      { label: 'Why meaningful', value: item.why_meaningful },
    ]), palette, fonts);
  }

  sectionHeader(doc, 'My Bucket List', palette, fonts);
  if (!lifeWishes.length) {
    noData(doc, fonts);
  } else {
    renderCards(doc, lifeWishes.map(item => [
      { label: '',            value: item.title },
      { label: 'Category',   value: item.category },
      { label: 'Status',     value: item.status },
      { label: 'Description', value: item.description },
      { label: 'Notes',       value: item.notes },
    ]), palette, fonts);
  }

  addPageFooter(doc, pageNum, palette, fonts);

  // ── Page 5: Financial + Children + Household ──────────────────────────────
  doc.addPage();

  sectionHeader(doc, 'Financial Affairs', palette, fonts);
  if (!financialItems.length) {
    noData(doc, fonts);
  } else {
    renderCards(doc, financialItems.map(item => [
      { label: '',               value: item.institution || item.category },
      { label: 'Category',       value: item.category },
      { label: 'Institution',    value: item.institution },
      { label: 'Account type',   value: item.account_type },
      { label: 'Reference',      value: item.account_reference },
      { label: 'Contact',        value: item.contact_name },
      { label: 'Phone',          value: item.contact_phone },
      { label: 'Notes',          value: item.notes },
    ]), palette, fonts);
  }

  sectionHeader(doc, 'Children & Dependants', palette, fonts);
  if (!childrenDependants.length) {
    noData(doc, fonts);
  } else {
    renderCards(doc, childrenDependants.map(item => [
      { label: '',                   value: item.name },
      { label: 'Type',               value: item.type },
      { label: 'Date of birth',      value: formatDate(item.date_of_birth) },
      { label: 'Special needs',      value: item.special_needs },
      { label: 'Preferred guardian', value: item.preferred_guardian },
      { label: 'Guardian contact',   value: item.guardian_contact },
      { label: 'Alternate guardian', value: item.alternate_guardian },
      { label: 'Notes',              value: item.notes },
    ]), palette, fonts);
  }

  sectionHeader(doc, 'Practical Household Information', palette, fonts);
  if (!householdInfo.length) {
    noData(doc, fonts);
  } else {
    renderCards(doc, householdInfo.map(item => [
      { label: '',           value: item.title },
      { label: 'Category',  value: item.category },
      { label: 'Provider',  value: item.provider },
      { label: 'Reference', value: item.account_reference },
      { label: 'Contact',   value: item.contact },
      { label: 'Notes',     value: item.notes },
    ]), palette, fonts);
  }

  addPageFooter(doc, pageNum, palette, fonts);

  // ── Page 6: Vault sections ────────────────────────────────────────────────
  doc.addPage();

  const introW = PAGE_W - MARGIN * 2;

  if (vaultData) {
    // ── Complete export: render actual vault content ───────────────────────
    const warningH = 52;
    const warningY = doc.y;
    doc.rect(LEFT_X, warningY, introW, warningH).fill('#FFF8E6').stroke('#F0D070');
    doc.rect(LEFT_X, warningY, 3, warningH).fill(palette.accent);
    doc.font(fonts.bold).fontSize(8).fillColor('#7A5210')
       .text('⚠  SENSITIVE INFORMATION', LEFT_X + 12, warningY + 8, { width: introW - 24 });
    doc.font(fonts.regular).fontSize(7.5).fillColor('#7A5210')
       .text(
         'This section contains vault-protected information including passwords and legal documents. ' +
         'Keep this document in a secure location and share only with someone you absolutely trust.',
         LEFT_X + 12, warningY + 20, { width: introW - 24, lineGap: 1.5 }
       );
    doc.y = warningY + warningH + 10;
    doc.fillColor(TEXT).font(fonts.regular).fontSize(9.5);

    sectionHeader(doc, 'Personal & Legal Documents', palette, fonts);
    if (!vaultData.legalDocs?.length) {
      noData(doc, fonts);
    } else {
      renderCards(doc, vaultData.legalDocs.map(item => [
        { label: '',              value: item.title },
        { label: 'Type',          value: item.document_type },
        { label: 'Held by',       value: item.held_by },
        { label: 'Location',      value: item.location },
        { label: 'Notes',         value: item.notes },
      ]), palette, fonts);
    }

    sectionHeader(doc, 'Digital Life: Credentials and Accounts', palette, fonts);
    if (!vaultData.credentials?.length) {
      noData(doc, fonts);
    } else {
      renderCards(doc, vaultData.credentials.map(item => [
        { label: '',            value: item.service },
        { label: 'Website',     value: item.service_url },
        { label: 'Username',    value: item.username },
        { label: 'Password',    value: item.password },
        { label: 'Notes',       value: item.notes },
      ]), palette, fonts);
    }

  } else {
    // ── Standard export: show locked notices ──────────────────────────────
    doc.font(fonts.bold).fontSize(11).fillColor(palette.dark)
       .text('Vault-Protected Sections', LEFT_X, doc.y, { width: introW });
    doc.moveDown(0.3);
    doc.font(fonts.italic).fontSize(9).fillColor(MUTED)
       .text(
         'The following sections contain your most sensitive personal information. ' +
         'They are encrypted with your vault password and cannot be included in this document. ' +
         'To view or manage this information, sign in to In Good Hands and enter your vault password.',
         LEFT_X, doc.y, { width: introW, lineGap: 2 }
       );
    doc.moveDown(0.8);
    rule(doc);

    vaultLockedSection(doc, 'Personal & Legal Documents', palette, fonts);
    vaultLockedSection(doc, 'Digital Life: Credentials and Accounts', palette, fonts);
  }

  addPageFooter(doc, pageNum, palette, fonts);

  doc.end();
}

module.exports = { generatePdf };
