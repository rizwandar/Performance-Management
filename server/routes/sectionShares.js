const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { query, queryOne, queryAll } = require('../db/database');
const requireAuth = require('../middleware/auth');
const { checkVault } = require('../lib/vaultAuth');
const { deriveKey, encryptField, decryptField } = require('../lib/vault');
const { sendEmail } = require('../lib/sendEmail');
const { sectionSharedEmail } = require('../lib/emailTemplates');
const {
  SECTION_META, isValidSection, fetchRawSectionData, fetchSectionDocuments, buildSectionView, renderViewToEmailHtml,
} = require('../lib/sectionShareContent');

const CLIENT_URL   = process.env.CLIENT_URL || 'http://localhost:5173';
const EXPIRES_HOURS = 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Create a share: name + email + section, immediate email, secure link.
// Independent of Trusted Contacts — no slot limit, any number of shares.
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  const { section, recipient_name, recipient_email, vault_password } = req.body;

  if (!isValidSection(section)) return res.status(400).json({ error: 'Unknown section.' });
  if (!recipient_name?.trim())  return res.status(400).json({ error: 'Recipient name is required.' });
  if (!recipient_email?.trim() || !EMAIL_RE.test(recipient_email.trim())) {
    return res.status(400).json({ error: 'A valid recipient email is required.' });
  }

  const meta = SECTION_META[section];
  const owner = await queryOne('SELECT name FROM users WHERE id = $1', [req.user.id]);

  let view;
  let isVaultSection = false;
  let snapshotEnc = null;
  // Kept in memory only long enough to build the share link below — never
  // written to the database. See the security note in the isVault branch.
  let snapshotKeyHexForLink = null;

  if (meta.isVault) {
    // Vault password is never stored — this is a one-time decrypt at share
    // time, immediately re-encrypted with a fresh key generated just for
    // this share (never the owner's vault password or its derived key), so
    // the recipient can view it again within the 72-hour window without the
    // owner needing to be present. See lib/vault.js's own design notes.
    //
    // SECURITY: the snapshot key is deliberately NEVER written to the
    // database (snapshot_key_hex stays NULL for every share created from
    // here on). Storing a key next to the ciphertext it unlocks, in the same
    // row of the same table, would mean a DB-only compromise (SQL injection
    // elsewhere, a leaked backup, an over-privileged DB credential) could
    // decrypt every shared vault section ever created, including real
    // Digital Vault passwords — defeating the exact threat model vault.js
    // documents ("Database breach: encrypted blobs are unreadable without
    // the vault password"). Instead the key travels only in the share
    // link's URL fragment (#...), which browsers never send to any server on
    // a normal page load, and is submitted explicitly by the client only
    // when redeeming the link (see GET/POST .../access/:token below). A DB
    // breach alone, without also having intercepted the link itself, yields
    // only undecryptable ciphertext.
    if (!await checkVault(vault_password, req.user.id, res, req)) return;
    const vaultKey = deriveKey(vault_password, req.user.id);
    const raw = await fetchRawSectionData(section, req.user.id, vaultKey);
    view = buildSectionView(section, raw);

    isVaultSection = true;
    const snapshotKey = crypto.randomBytes(32);
    snapshotEnc = encryptField(JSON.stringify(view), snapshotKey);
    snapshotKeyHexForLink = snapshotKey.toString('hex');
  } else {
    const raw = await fetchRawSectionData(section, req.user.id, null);
    view = buildSectionView(section, raw);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();

  const result = await query(`
    INSERT INTO section_shares
      (user_id, section, recipient_name, recipient_email, token, is_vault_section, snapshot_enc, snapshot_key_hex, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, created_at
  `, [
    // snapshot_key_hex is always NULL here — the key lives only in the share
    // link's URL fragment, never in the database. See security note above.
    req.user.id, section, recipient_name.trim(), recipient_email.trim(),
    token, isVaultSection, snapshotEnc, null, expiresAt,
  ]);

  const viewLink = snapshotKeyHexForLink
    ? `${CLIENT_URL}/shared/${token}#${snapshotKeyHexForLink}`
    : `${CLIENT_URL}/shared/${token}`;
  // The share row (and, for vault sections, its snapshot) already exists at
  // this point - a delivery failure shouldn't undo that or fail the request,
  // same convention as the other owner-initiated share emails in this app
  // (see routes/trustedContacts.js). The link itself still works either way;
  // the owner can always resend by creating another share.
  try {
    await sendEmail({
      to:      recipient_email.trim(),
      subject: `${owner.name} shared their ${meta.label} on In Good Hands`,
      html:    sectionSharedEmail({
        recipientName: recipient_name.trim(),
        ownerName:     owner.name,
        sectionLabel:  meta.label,
        contentHtml:   isVaultSection ? null : renderViewToEmailHtml(view),
        viewLink,
      }),
    });
  } catch (err) {
    console.error('[section-shares] Email send failed:', err.message);
  }

  res.status(201).json({
    id: result.rows[0].id,
    section, recipient_name: recipient_name.trim(), recipient_email: recipient_email.trim(),
    created_at: result.rows[0].created_at, expires_at: expiresAt,
  });
});

// ---------------------------------------------------------------------------
// List an owner's shares, optionally filtered to one section — for the
// "Shared with" history list on each section page.
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  const { section } = req.query;
  const rows = section
    ? await queryAll(
        `SELECT id, section, recipient_name, recipient_email, expires_at, created_at, accessed_at, revoked_at
         FROM section_shares WHERE user_id = $1 AND section = $2 ORDER BY created_at DESC`,
        [req.user.id, section]
      )
    : await queryAll(
        `SELECT id, section, recipient_name, recipient_email, expires_at, created_at, accessed_at, revoked_at
         FROM section_shares WHERE user_id = $1 ORDER BY created_at DESC`,
        [req.user.id]
      );
  res.json(rows);
});

// ---------------------------------------------------------------------------
// Revoke a share. Non-vault shares are read live, so revoking just stops the
// token resolving; vault shares also stop resolving, and their snapshot is
// blanked out immediately rather than left sitting encrypted-at-rest for no
// reason once access is withdrawn.
// ---------------------------------------------------------------------------
router.post('/:id/revoke', requireAuth, async (req, res) => {
  const row = await queryOne('SELECT id FROM section_shares WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Share not found or already revoked.' });
  await query(
    `UPDATE section_shares SET revoked_at = NOW(), snapshot_enc = NULL, snapshot_key_hex = NULL WHERE id = $1`,
    [req.params.id]
  );
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Public guest view — no auth. Non-vault sections are re-fetched live (so a
// recipient always sees current data within the window); vault sections
// return the one-time snapshot taken at share creation.
//
// POST, not GET: for a vault section the client must submit the decryption
// key it read out of the link's URL fragment (see the security note in
// POST '/' above and SharedSectionPage.jsx). A GET with the key as a query
// string would risk it landing in server access logs, browser history, or
// a Referer header on an outbound link — a POST body avoids all three.
// ---------------------------------------------------------------------------
router.post('/access/:token', async (req, res) => {
  const share = await queryOne(
    `SELECT ss.*, u.name AS owner_name FROM section_shares ss
     JOIN users u ON u.id = ss.user_id
     WHERE ss.token = $1 AND ss.expires_at > NOW() AND ss.revoked_at IS NULL`,
    [req.params.token]
  );
  if (!share) {
    return res.status(404).json({ error: 'This link is invalid, has expired, or has been revoked. Please ask the account holder to share it again.' });
  }

  const meta = SECTION_META[share.section];
  let view;
  if (share.is_vault_section) {
    // snapshot_key_hex on the row itself is only ever populated for shares
    // created before this fix landed; every new share carries the key only
    // in the link, submitted here by the client.
    const keyHex = req.body?.key || share.snapshot_key_hex;
    if (!keyHex) {
      return res.status(400).json({ error: 'This link is missing part of its address. Please use the complete link from the invitation email, not a partial copy.' });
    }
    let key, json;
    try {
      key = Buffer.from(keyHex, 'hex');
      json = decryptField(share.snapshot_enc, key);
    } catch {
      json = null;
    }
    if (json === null) {
      return res.status(400).json({ error: 'This link appears to be incomplete or corrupted. Please use the complete link from the invitation email.' });
    }
    view = JSON.parse(json);
  } else {
    // Fetched live on every guest visit, same as the section's own data, so a
    // freshly signed download URL is generated on every access rather than
    // ever being persisted (see fetchSectionDocuments in sectionShareContent.js).
    const [raw, documents] = await Promise.all([
      fetchRawSectionData(share.section, share.user_id, null),
      fetchSectionDocuments(share.section, share.user_id),
    ]);
    view = buildSectionView(share.section, raw, documents);
  }

  await query(`UPDATE section_shares SET accessed_at = COALESCE(accessed_at, NOW()) WHERE id = $1`, [share.id]);

  res.json({
    owner_name:     share.owner_name,
    section:        share.section,
    section_label:  meta.label,
    recipient_name: share.recipient_name,
    expires_at:     share.expires_at,
    view,
  });
});

module.exports = router;
