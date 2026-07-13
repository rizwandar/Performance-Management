const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();
const { queryOne, queryAll, query } = require('../db/database');
const requireAuth = require('../middleware/auth');
const { uploadFile, getDownloadUrl, deleteFile } = require('../lib/r2');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/heic', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'doc', 'docx']);
const PHOTO_MIME_TYPES   = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);
const PHOTO_EXTENSIONS   = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
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
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!PHOTO_MIME_TYPES.has(file.mimetype) || !PHOTO_EXTENSIONS.has(ext)) {
      return cb(new Error('Only image files are allowed (JPEG, PNG, HEIC, WebP).'));
    }
    cb(null, true);
  },
});

router.post('/upload', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { section_id, item_id } = req.body;
    const userId = req.user.id;

    if (!req.file)   return res.status(400).json({ error: 'No file provided.' });
    if (!section_id) return res.status(400).json({ error: 'section_id is required.' });

    const ext    = req.file.originalname.split('.').pop();
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '');
    const key    = `${userId}/${section_id}/${uuidv4()}.${safeExt}`;

    await uploadFile({ key, buffer: req.file.buffer, mimeType: req.file.mimetype });

    const result = await query(`
      INSERT INTO uploaded_documents (user_id, section_id, item_id, original_name, r2_key, size_bytes, mime_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [userId, section_id, item_id || null, req.file.originalname, key, req.file.size, req.file.mimetype]);

    res.json({
      id:            result.rows[0].id,
      original_name: req.file.originalname,
      section_id,
      item_id:       item_id ? Number(item_id) : null,
      size_bytes:    req.file.size,
      mime_type:     req.file.mimetype,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: "We couldn't upload your document. Please try again." });
  }
});

router.get('/:section_id', requireAuth, async (req, res) => {
  const docs = await queryAll(`
    SELECT id, section_id, item_id, original_name, size_bytes, mime_type, uploaded_at
    FROM uploaded_documents
    WHERE user_id = $1 AND section_id = $2
    ORDER BY uploaded_at DESC
  `, [req.user.id, req.params.section_id]);
  res.json(docs);
});

router.get('/download/:id', requireAuth, async (req, res) => {
  try {
    const doc = await queryOne(
      'SELECT * FROM uploaded_documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const url = await getDownloadUrl(doc.r2_key);
    res.json({ url, original_name: doc.original_name });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: "We couldn't retrieve your document. Please try again." });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await queryOne(
      'SELECT * FROM uploaded_documents WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    await deleteFile(doc.r2_key);
    await query('DELETE FROM uploaded_documents WHERE id = $1', [doc.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: "We couldn't remove your document. Please try again." });
  }
});

router.post('/photos/upload', requireAuth, (req, res, next) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { section_id, photo_role } = req.body;
    const userId = req.user.id;

    if (!req.file)   return res.status(400).json({ error: 'No photo provided.' });
    if (!section_id) return res.status(400).json({ error: 'section_id is required.' });
    if (!photo_role) return res.status(400).json({ error: 'photo_role is required.' });

    if (photo_role === 'funeral_main') {
      const existing = await queryAll(
        `SELECT id, r2_key FROM uploaded_documents WHERE user_id = $1 AND section_id = $2 AND photo_role = 'funeral_main'`,
        [userId, section_id]
      );
      for (const doc of existing) {
        await deleteFile(doc.r2_key).catch(() => {});
        await query('DELETE FROM uploaded_documents WHERE id = $1', [doc.id]);
      }
    }

    if (photo_role === 'funeral_gallery') {
      const count = await queryOne(
        `SELECT COUNT(*)::int as c FROM uploaded_documents WHERE user_id = $1 AND section_id = $2 AND photo_role = 'funeral_gallery'`,
        [userId, section_id]
      );
      if (count.c >= 20) {
        return res.status(400).json({ error: 'You can add up to 20 gallery photos.' });
      }
    }

    const ext     = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '');
    const key     = `${userId}/${section_id}/photos/${uuidv4()}.${safeExt}`;

    await uploadFile({ key, buffer: req.file.buffer, mimeType: req.file.mimetype });

    const result = await query(`
      INSERT INTO uploaded_documents (user_id, section_id, item_id, original_name, r2_key, size_bytes, mime_type, photo_role)
      VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)
      RETURNING id
    `, [userId, section_id, req.file.originalname, key, req.file.size, req.file.mimetype, photo_role]);

    const signedUrl = await getDownloadUrl(key);
    res.json({
      id:            result.rows[0].id,
      photo_role,
      original_name: req.file.originalname,
      signed_url:    signedUrl,
    });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: "We couldn't upload your photo. Please try again." });
  }
});

router.get('/photos/:section_id', requireAuth, async (req, res) => {
  try {
    const docs = await queryAll(`
      SELECT id, photo_role, original_name, size_bytes, mime_type, r2_key, uploaded_at
      FROM uploaded_documents
      WHERE user_id = $1 AND section_id = $2 AND photo_role IS NOT NULL
      ORDER BY photo_role DESC, uploaded_at ASC
    `, [req.user.id, req.params.section_id]);

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
