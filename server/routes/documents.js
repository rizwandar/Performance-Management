const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();
const db      = require('../db/database');
const requireAuth = require('../middleware/auth');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');

// Allowed MIME types for uploaded documents
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'doc', 'docx']);

// Image-only mime types and extensions (for photo uploads)
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp']);

// Store file in memory (buffer) — we stream it straight to R2
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Only PDF, Word, and image files are allowed.'));
    }
    cb(null, true);
  },
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max per photo
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!PHOTO_MIME_TYPES.has(file.mimetype) || !PHOTO_EXTENSIONS.has(ext)) {
      return cb(new Error('Only image files are allowed (JPEG, PNG, HEIC, WebP).'));
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// POST /api/documents/upload
// Body: multipart/form-data — file, section_id, item_id (optional)
// ---------------------------------------------------------------------------
router.post('/upload', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { section_id, item_id } = req.body;
    const userId = req.user.id;

    if (!req.file)      return res.status(400).json({ error: 'No file provided.' });
    if (!section_id)    return res.status(400).json({ error: 'section_id is required.' });

    // Build a unique key: userId/sectionId/uuid-originalname
    const ext       = req.file.originalname.split('.').pop();
    const safeExt   = ext.replace(/[^a-zA-Z0-9]/g, '');
    const key       = `${userId}/${section_id}/${uuidv4()}.${safeExt}`;

    await uploadFile({
      key,
      buffer:   req.file.buffer,
      mimeType: req.file.mimetype,
    });

    const result = db.prepare(`
      INSERT INTO uploaded_documents (user_id, section_id, item_id, original_name, r2_key, size_bytes, mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, section_id, item_id || null, req.file.originalname, key, req.file.size, req.file.mimetype);

    res.json({
      id:            result.lastInsertRowid,
      original_name: req.file.originalname,
      section_id,
      item_id:       item_id ? Number(item_id) : null,
      size_bytes:    req.file.size,
      mime_type:     req.file.mimetype,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'We couldn\'t upload your document. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:section_id
// List all documents for the current user in a section
// ---------------------------------------------------------------------------
router.get('/:section_id', requireAuth, (req, res) => {
  const docs = db.prepare(`
    SELECT id, section_id, item_id, original_name, size_bytes, mime_type, uploaded_at
    FROM uploaded_documents
    WHERE user_id = ? AND section_id = ?
    ORDER BY uploaded_at DESC
  `).all(req.user.id, req.params.section_id);

  res.json(docs);
});

// ---------------------------------------------------------------------------
// GET /api/documents/download/:id
// Returns a signed URL valid for 1 hour
// ---------------------------------------------------------------------------
router.get('/download/:id', requireAuth, async (req, res) => {
  try {
    const doc = db.prepare(`
      SELECT * FROM uploaded_documents WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const url = await getDownloadUrl(doc.r2_key);
    res.json({ url, original_name: doc.original_name });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'We couldn\'t retrieve your document. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/documents/:id
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const doc = db.prepare(`
      SELECT * FROM uploaded_documents WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    await deleteFile(doc.r2_key);
    db.prepare('DELETE FROM uploaded_documents WHERE id = ?').run(doc.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'We couldn\'t remove your document. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/documents/photos/upload
// Photo-specific upload — images only, with a photo_role field.
// photo_role values: 'funeral_main' | 'funeral_gallery'
// If photo_role is 'funeral_main', the existing main photo is deleted first.
// ---------------------------------------------------------------------------
router.post('/photos/upload', requireAuth, (req, res, next) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { section_id, photo_role } = req.body;
    const userId = req.user.id;

    if (!req.file)    return res.status(400).json({ error: 'No photo provided.' });
    if (!section_id)  return res.status(400).json({ error: 'section_id is required.' });
    if (!photo_role)  return res.status(400).json({ error: 'photo_role is required.' });

    // For the main portrait: remove any existing main photo for this section
    if (photo_role === 'funeral_main') {
      const existing = db.prepare(
        `SELECT id, r2_key FROM uploaded_documents
         WHERE user_id = ? AND section_id = ? AND photo_role = 'funeral_main'`
      ).all(userId, section_id);
      for (const doc of existing) {
        await deleteFile(doc.r2_key).catch(() => {});
        db.prepare('DELETE FROM uploaded_documents WHERE id = ?').run(doc.id);
      }
    }

    // Limit gallery photos to 20
    if (photo_role === 'funeral_gallery') {
      const count = db.prepare(
        `SELECT COUNT(*) as c FROM uploaded_documents
         WHERE user_id = ? AND section_id = ? AND photo_role = 'funeral_gallery'`
      ).get(userId, section_id);
      if (count.c >= 20) {
        return res.status(400).json({ error: 'You can add up to 20 gallery photos.' });
      }
    }

    const ext     = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '');
    const key     = `${userId}/${section_id}/photos/${uuidv4()}.${safeExt}`;

    await uploadFile({ key, buffer: req.file.buffer, mimeType: req.file.mimetype });

    const result = db.prepare(`
      INSERT INTO uploaded_documents (user_id, section_id, item_id, original_name, r2_key, size_bytes, mime_type, photo_role)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(userId, section_id, req.file.originalname, key, req.file.size, req.file.mimetype, photo_role);

    // Return with a fresh signed URL so the client can show preview immediately
    const signedUrl = await getDownloadUrl(key);
    res.json({
      id:            result.lastInsertRowid,
      photo_role,
      original_name: req.file.originalname,
      signed_url:    signedUrl,
    });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: "We couldn't upload your photo. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/photos/:section_id
// List all photos for a section, each with a fresh 1-hour signed URL.
// ---------------------------------------------------------------------------
router.get('/photos/:section_id', requireAuth, async (req, res) => {
  try {
    const docs = db.prepare(`
      SELECT id, photo_role, original_name, size_bytes, mime_type, r2_key, uploaded_at
      FROM uploaded_documents
      WHERE user_id = ? AND section_id = ? AND photo_role IS NOT NULL
      ORDER BY photo_role DESC, uploaded_at ASC
    `).all(req.user.id, req.params.section_id);

    const withUrls = await Promise.all(docs.map(async doc => ({
      id:            doc.id,
      photo_role:    doc.photo_role,
      original_name: doc.original_name,
      size_bytes:    doc.size_bytes,
      uploaded_at:   doc.uploaded_at,
      signed_url:    await getDownloadUrl(doc.r2_key),
    })));

    res.json(withUrls);
  } catch (err) {
    console.error('Photos list error:', err);
    res.status(500).json({ error: "We couldn't load your photos. Please try again." });
  }
});

module.exports = router;
