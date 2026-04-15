const express = require('express');
const router = express.Router();
const db = require('../db/database');
const auth = require('../middleware/auth');

// Get own profile
router.get('/me', auth, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, date_of_birth, about_me, legacy_message,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email,
           songs_enabled, bucket_list_enabled, is_admin, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const songs = db.prepare('SELECT * FROM favourite_songs WHERE user_id = ? ORDER BY added_at').all(user.id);
  const bucket_list = db.prepare('SELECT * FROM bucket_list_items WHERE user_id = ? ORDER BY added_at').all(user.id);

  res.json({ ...user, songs, bucket_list });
});

// Update own profile
router.put('/me', auth, (req, res) => {
  const { name, email, date_of_birth, about_me, legacy_message,
          emergency_contact_name, emergency_contact_phone, emergency_contact_email } = req.body;
  try {
    db.prepare(`
      UPDATE users SET name=?, email=?, date_of_birth=?, about_me=?, legacy_message=?,
        emergency_contact_name=?, emergency_contact_phone=?, emergency_contact_email=? WHERE id=?
    `).run(name, email, date_of_birth || null, about_me || null, legacy_message || null,
           emergency_contact_name || null, emergency_contact_phone || null,
           emergency_contact_email || null, req.user.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Add song
router.post('/me/songs', auth, (req, res) => {
  const { deezer_id, title, artist, album } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'title and artist are required' });

  const user = db.prepare('SELECT songs_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user.songs_enabled) return res.status(403).json({ error: 'Songs feature is not enabled for your account' });

  const count = db.prepare('SELECT COUNT(*) as count FROM favourite_songs WHERE user_id = ?').get(req.user.id);
  if (count.count >= 20) return res.status(400).json({ error: 'Maximum 20 songs allowed' });

  const result = db.prepare(
    'INSERT INTO favourite_songs (user_id, deezer_id, title, artist, album) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, deezer_id || null, title, artist, album || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete song
router.delete('/me/songs/:songId', auth, (req, res) => {
  db.prepare('DELETE FROM favourite_songs WHERE id = ? AND user_id = ?').run(req.params.songId, req.user.id);
  res.json({ success: true });
});

// Add bucket list item
router.post('/me/bucket-list', auth, (req, res) => {
  const { title, description, planning } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const user = db.prepare('SELECT bucket_list_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user.bucket_list_enabled) return res.status(403).json({ error: 'Bucket list feature is not enabled for your account' });

  const count = db.prepare('SELECT COUNT(*) as count FROM bucket_list_items WHERE user_id = ?').get(req.user.id);
  if (count.count >= 50) return res.status(400).json({ error: 'Maximum 50 bucket list items allowed' });

  const result = db.prepare(
    'INSERT INTO bucket_list_items (user_id, title, description, planning) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, title, description || null, planning || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete bucket list item
router.delete('/me/bucket-list/:itemId', auth, (req, res) => {
  db.prepare('DELETE FROM bucket_list_items WHERE id = ? AND user_id = ?').run(req.params.itemId, req.user.id);
  res.json({ success: true });
});

module.exports = router;
