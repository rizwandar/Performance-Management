require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow R2 signed URLs
}));

// ---------------------------------------------------------------------------
// CORS — manual implementation, runs before everything else
// Sets headers on every response including errors and preflight
// Restricts to CLIENT_URL in production; allows any origin in development
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN = process.env.CLIENT_URL || null;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = !ALLOWED_ORIGIN || origin === ALLOWED_ORIGIN;
  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!ALLOWED_ORIGIN && origin) {
    // Development fallback: allow all origins
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '10kb' })); // prevent large payload attacks

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

// Strict limit on auth endpoints — prevents brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many attempts. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/deezer', require('./routes/deezer'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/trusted-contacts', require('./routes/trustedContacts'));
app.use('/api/sections', require('./routes/sections'));
app.use('/api/export', require('./routes/export'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/access', require('./routes/access'));
app.use('/api/contact', require('./routes/contact'));

app.get('/', (req, res) => res.json({ status: 'API running' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler — logs and returns JSON with CORS headers already set above
app.use((err, req, res, next) => {
  console.error('[error]', err.message, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Inactivity timer — runs daily at 8am
const cron = require('node-cron');
const { checkInactivity, cleanupExpiredTokens } = require('./lib/inactivityTimer');
cron.schedule('0 8 * * *', () => {
  console.log('[inactivity] Running daily check...');
  checkInactivity().catch(err => console.error('[inactivity] Check failed:', err.message));
  cleanupExpiredTokens();
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
