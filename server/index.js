require('dotenv').config();
require('./instrument');
const Sentry = require('@sentry/node');
const express = require('express');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const { init: initDb, queryOne } = require('./db/database');
const app = express();

// Render sits in front of the app behind exactly one reverse-proxy hop, so
// express-rate-limit (and req.ip generally) needs to trust that one hop's
// X-Forwarded-For to see the real client IP, rather than the proxy's IP.
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const ALLOWED_ORIGIN = process.env.CLIENT_URL || null;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = !ALLOWED_ORIGIN || origin === ALLOWED_ORIGIN;
  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!ALLOWED_ORIGIN && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '10kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/org-links/', authLimiter);
app.use('/api/org-register/', authLimiter);

app.use(async (req, res, next) => {
  const exemptPaths = ['/api/health', '/api/auth/login', '/api/auth/logout'];
  if (exemptPaths.includes(req.path)) return next();
  try {
    const setting = await queryOne("SELECT value FROM app_settings WHERE key = 'maintenance_mode'");
    if (setting?.value !== '1') return next();
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.is_admin) return next();
      } catch {}
    }
    res.status(503).json({ maintenance: true, error: 'The site is temporarily offline for maintenance. Please check back shortly.' });
  } catch {
    next();
  }
});

app.use('/api/auth',            require('./routes/auth'));
app.use('/api/users',           require('./routes/users'));
app.use('/api/admin/organizations', require('./routes/organizations'));
app.use('/api/org-portal',      require('./routes/orgPortal'));
app.use('/api/org-links',       require('./routes/orgPublic'));
app.use('/api/org-register',    require('./routes/orgRegister'));
app.use('/api/admin',           require('./routes/admin'));
app.use('/api/settings',        require('./routes/settings'));
app.use('/api/deezer',          require('./routes/deezer'));
app.use('/api/documents',       require('./routes/documents'));
app.use('/api/trusted-contacts',require('./routes/trustedContacts'));
app.use('/api/sections',        require('./routes/sections'));
app.use('/api/export',          require('./routes/export'));
app.use('/api/billing',         require('./routes/billing'));
app.use('/api/access',          require('./routes/access'));
app.use('/api/contact',         require('./routes/contact'));
app.use('/api/report-death',    require('./routes/reportDeath'));

app.get('/', (req, res) => res.json({ status: 'API running' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error('[error]', err.message, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const cron = require('node-cron');
const { checkInactivity, cleanupExpiredTokens } = require('./lib/inactivityTimer');
const { expireOrgPremiumGrants } = require('./lib/orgPremiumExpiry');
cron.schedule('0 8 * * *', () => {
  console.log('[inactivity] Running daily check...');
  checkInactivity().catch(err => console.error('[inactivity] Check failed:', err.message));
  cleanupExpiredTokens().catch(err => console.error('[cleanup] Failed:', err.message));
  expireOrgPremiumGrants().catch(err => console.error('[org-premium] Expiry sweep failed:', err.message));
});

const { runBackup } = require('./lib/backup');
cron.schedule('0 3 * * *', () => {
  console.log('[backup] Running daily database backup...');
  runBackup().catch(err => console.error('[backup] Daily backup failed:', err.message));
});

initDb()
  .then(() => {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('[db] Failed to initialize database:', err);
    process.exit(1);
  });
