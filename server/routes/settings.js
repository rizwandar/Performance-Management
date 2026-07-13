const express = require('express');
const router = express.Router();
const { queryAll, query } = require('../db/database');
const auth = require('../middleware/auth');
const { getDownloadUrl } = require('../lib/r2');

const adminOnly = (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

router.get('/', async (req, res) => {
  const rows = await queryAll('SELECT key, value FROM app_settings');
  const obj  = {};
  for (const s of rows) obj[s.key] = s.value;

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

router.put('/:key', auth, adminOnly, async (req, res) => {
  const { value } = req.body;
  await query(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [req.params.key, value]
  );
  res.json({ success: true });
});

module.exports = router;
