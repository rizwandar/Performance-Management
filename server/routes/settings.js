const express = require('express');
const router = express.Router();
const db = require('../db/database');
const auth = require('../middleware/auth');
const { getDownloadUrl } = require('../lib/r2');

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Get all settings (public — needed for forgot-password page and branding)
router.get('/', async (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const obj = {};
  for (const s of rows) obj[s.key] = s.value;

  // Resolve the active logo URL
  if (obj.site_logo_type === 'custom' && obj.site_logo_custom_key) {
    try {
      obj.site_logo_url = await getDownloadUrl(obj.site_logo_custom_key);
    } catch {
      obj.site_logo_url = `/logos/${obj.site_logo_preset || 'hands-heart'}.svg`;
    }
  } else {
    obj.site_logo_url = `/logos/${obj.site_logo_preset || 'hands-heart'}.svg`;
  }

  if (!obj.site_name) obj.site_name = 'In Good Hands';

  res.json(obj);
});

// Update a setting (admin only)
router.put('/:key', auth, adminOnly, (req, res) => {
  const { value } = req.body;
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(req.params.key, value);
  res.json({ success: true });
});

module.exports = router;
