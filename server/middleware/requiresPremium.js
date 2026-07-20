const { isPremium } = require('../lib/subscription');

module.exports = async function requiresPremium(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.', session_expired: true });
  if (await isPremium(req.user.id)) return next();
  res.status(403).json({
    error: 'upgrade_required',
    message: 'This section is part of the Premium plan.',
  });
};
