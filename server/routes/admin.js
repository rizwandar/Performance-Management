const express = require('express');
const router = express.Router();
const db = require('../db/database');
const auth = require('../middleware/auth');

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Stats
router.get('/stats', auth, adminOnly, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 0').get();
  res.json({ total_users: total.count });
});

// Search / list users
router.get('/users', auth, adminOnly, (req, res) => {
  const { q } = req.query;
  let users;
  if (q) {
    users = db.prepare(`
      SELECT id, name, email, date_of_birth, songs_enabled, bucket_list_enabled, created_at
      FROM users WHERE is_admin = 0 AND (name LIKE ? OR email LIKE ?)
      ORDER BY name
    `).all(`%${q}%`, `%${q}%`);
  } else {
    users = db.prepare(`
      SELECT id, name, email, date_of_birth, songs_enabled, bucket_list_enabled, created_at
      FROM users WHERE is_admin = 0 ORDER BY name
    `).all();
  }
  res.json(users);
});

// Get single user profile (admin view)
router.get('/users/:id', auth, adminOnly, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, date_of_birth, about_me, legacy_message,
           emergency_contact_name, emergency_contact_phone, emergency_contact_email,
           songs_enabled, bucket_list_enabled, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const songs = db.prepare('SELECT * FROM favourite_songs WHERE user_id = ?').all(user.id);
  const bucket_list = db.prepare('SELECT * FROM bucket_list_items WHERE user_id = ?').all(user.id);

  res.json({ ...user, songs, bucket_list });
});

// Update user permissions
router.put('/users/:id/permissions', auth, adminOnly, (req, res) => {
  const { songs_enabled, bucket_list_enabled } = req.body;
  db.prepare('UPDATE users SET songs_enabled = ?, bucket_list_enabled = ? WHERE id = ?')
    .run(songs_enabled ? 1 : 0, bucket_list_enabled ? 1 : 0, req.params.id);
  res.json({ success: true });
});

module.exports = router;
