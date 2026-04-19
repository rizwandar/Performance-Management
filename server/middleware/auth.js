const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable must be set in production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
