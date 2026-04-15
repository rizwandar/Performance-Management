const express = require('express');
const router = express.Router();
const db = require('../db/database');
const auth = require('../middleware/auth');

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Get all settings (public — needed for forgot-password page to know which method is active)
router.get('/', (req, res) => {
  const settings = db.prepare('SELECT key, value FROM app_settings').all();
  const obj = {};
  for (const s of settings) obj[s.key] = s.value;
  res.json(obj);
});

// Update a setting (admin only)
router.put('/:key', auth, adminOnly, (req, res) => {
  const { value } = req.body;
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(req.params.key, value);
  res.json({ success: true });
});

module.exports = router;
