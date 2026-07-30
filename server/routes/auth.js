const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { body } = require('express-validator');
const { queryOne, query } = require('../db/database');
const { sendEmail } = require('../lib/sendEmail');
const { welcomeEmail, passwordResetEmail, emailVerificationEmail } = require('../lib/emailTemplates');
const { validate } = require('../middleware/validate');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Reset tokens are high-entropy random values, so a fast hash is enough (unlike
// passwords, there's nothing to slow an attacker down against - the entropy is
// the defense). The DB only ever stores this hash, never the raw token; the raw
// value exists only in the emailed link.
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Cheap defense-in-depth against timing side-channels on the DOB comparison in
// forgot-password. DOB is low-entropy to begin with, so this isn't the primary
// defense - the per-email rate limiter below is.
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const GENERIC_RESET_RESPONSE = { message: 'If that email is registered, a reset link has been sent.' };

// Keyed by email (not just IP) so guessing a DOB against one known account can't
// be brute-forced by rotating IPs, and so it throttles independently of the
// broader per-IP authLimiter already applied to all of /api/auth/*. The handler
// returns the same generic response a normal request gets, so being throttled
// is itself indistinguishable from a normal "email sent" response.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req.body?.email || '').toLowerCase().trim() || ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.json(GENERIC_RESET_RESPONSE),
});

async function auditLog(userId, action, req, metadata) {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
              || req.socket?.remoteAddress
              || null;
    const ua = req.headers['user-agent'] || null;
    await query(
      'INSERT INTO user_audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
      [userId || null, action, ip, ua, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('[audit] Log failed:', err.message);
  }
}

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.').escape(),
  body('email').trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .customSanitizer(v => v.toLowerCase()),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .isLength({ max: 128 }).withMessage('Password is too long.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('date_of_birth').optional({ checkFalsy: true })
    .isDate().withMessage('Date of birth must be a valid date.'),
];
router.post('/register', registerRules, validate, async (req, res) => {
  const { name, email, password, date_of_birth, country_code, privacy_consent } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!privacy_consent) {
    return res.status(400).json({ error: 'You must agree to the Privacy Policy and Terms of Service to create an account.' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const verifyToken  = crypto.randomBytes(32).toString('hex');
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await query(`
      INSERT INTO users (name, email, password_hash, date_of_birth, country_code, privacy_consent,
                         privacy_consent_at, email_verified, email_verification_token, email_verification_expires_at)
      VALUES ($1, $2, $3, $4, $5, 1, NOW(), 0, $6, $7)
      RETURNING id
    `, [name, email, hash, date_of_birth || null, country_code || null, verifyToken, verifyExpiry]);

    const newId = result.rows[0].id;

    const clientUrl  = process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyLink = `${clientUrl}/verify-email?token=${verifyToken}`;
    sendEmail({
      to:      email,
      subject: 'Please verify your email address — In Good Hands',
      html:    emailVerificationEmail({ name, verifyLink }),
    }).catch(err => console.error('[auth] Verification email failed:', err.message));

    await query(
      "INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active') ON CONFLICT (user_id) DO NOTHING",
      [newId]
    );
    auditLog(newId, 'register', req);

    const token = jwt.sign({ id: newId, email, is_admin: 0, sv: 1 }, JWT_SECRET, { expiresIn: '8h' });
    res.status(201).json({
      id: newId,
      token,
      user: { id: newId, name, email, is_admin: 0, email_verified: 0, songs_enabled: 0, bucket_list_enabled: 0 },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: err.message });
  }
});

const loginRules = [
  body('email').trim().notEmpty().withMessage('Email is required.')
    .customSanitizer(v => v.toLowerCase()),
  body('password').notEmpty().withMessage('Password is required.'),
];
router.post('/login', loginRules, validate, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    auditLog(user?.id || null, 'login_failed', req, { email });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.org_role && user.is_active === 0) {
    auditLog(user.id, 'login_failed', req, { email, reason: 'deactivated' });
    return res.status(403).json({ error: 'This account has been deactivated. Contact your organization administrator.' });
  }
  await query(`
    UPDATE users
    SET last_active_at = NOW(),
        last_reminder_sent_at = NULL,
        inactivity_contacts_notified_at = NULL,
        vault_attempts = 0
    WHERE id = $1
  `, [user.id]);
  auditLog(user.id, 'login_success', req);

  const token = jwt.sign(
    {
      id: user.id, email: user.email, is_admin: user.is_admin,
      org_role: user.org_role || undefined, organization_id: user.organization_id || undefined,
      organization_location_id: user.organization_location_id || undefined,
      sv: user.session_version ?? 1,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({
    token,
    user: {
      id:                  user.id,
      name:                user.name,
      email:               user.email,
      is_admin:            user.is_admin,
      email_verified:      user.email_verified ?? 1,
      songs_enabled:       user.songs_enabled,
      bucket_list_enabled: user.bucket_list_enabled,
      country_code:        user.country_code || null,
      org_role:            user.org_role || null,
      organization_id:     user.organization_id || null,
      organization_location_id: user.organization_location_id || null,
    },
  });
});

const forgotRules = [
  body('email').trim().notEmpty().withMessage('Email is required.')
    .customSanitizer(v => v.toLowerCase()),
  body('date_of_birth').optional({ checkFalsy: true })
    .isDate().withMessage('Date of birth must be a valid date.'),
];
// Date of birth, when the site is configured to ask for it, is an ADDITIONAL
// check layered on top of the email link - never an alternate path to a token.
// A reset link is always and only delivered by email; the API never returns a
// token, and the response is identical whether the account exists, the DOB
// matched, or the request was rate-limited, so none of it is a signal an
// attacker can use to enumerate accounts or brute-force a date of birth (SEC-04).
router.post('/forgot-password', forgotPasswordLimiter, forgotRules, validate, async (req, res) => {
  const { email, date_of_birth } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const setting     = await queryOne("SELECT value FROM app_settings WHERE key = 'password_reset_method'");
  const requireDob   = setting?.value === 'dob';
  if (requireDob && !date_of_birth) {
    return res.status(400).json({ error: 'Date of birth is required' });
  }

  const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  const dobMatches = !requireDob || (!!user && timingSafeStringEqual(user.date_of_birth, date_of_birth));

  if (user && dobMatches) {
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiry    = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await query('UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [tokenHash, expiry, user.id]);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetLink = `${clientUrl}/reset-password?token=${rawToken}`;
    sendEmail({
      to:      user.email,
      subject: 'Reset your In Good Hands password',
      html:    passwordResetEmail({ name: user.name, resetLink }),
    }).catch(e => console.error('[auth] Password reset email failed for user', user.id, ':', e.message));
    auditLog(user.id, 'password_reset_requested', req);
  } else {
    auditLog(user?.id || null, 'password_reset_denied', req, { reason: !user ? 'no_account' : 'dob_mismatch' });
  }

  res.json(GENERIC_RESET_RESPONSE);
});

const resetRules = [
  body('token').trim().notEmpty().withMessage('Reset token is required.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .isLength({ max: 128 }).withMessage('Password is too long.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
];
router.post('/reset-password', resetRules, validate, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

  const tokenHash = hashResetToken(token);
  const user = await queryOne('SELECT * FROM users WHERE reset_token = $1', [tokenHash]);
  if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const hash = bcrypt.hashSync(password, 10);
  // session_version bump signs every other already-issued token out on their
  // next request - a stolen session shouldn't survive its owner reclaiming the
  // account (SEC-04's session-invalidation-on-reset requirement).
  await query(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, session_version = session_version + 1 WHERE id = $2',
    [hash, user.id]
  );
  auditLog(user.id, 'password_changed', req);
  res.json({ success: true });
});

router.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params;
  const user = await queryOne('SELECT * FROM users WHERE email_verification_token = $1', [token]);
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification link.' });
  if (user.email_verified) return res.json({ success: true, already: true });
  if (user.email_verification_expires_at && new Date(user.email_verification_expires_at) < new Date()) {
    return res.status(400).json({ error: 'This verification link has expired. Please request a new one from inside your account.' });
  }
  await query(
    'UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expires_at = NULL WHERE id = $1',
    [user.id]
  );
  sendEmail({
    to:      user.email,
    subject: 'Welcome to In Good Hands',
    html:    welcomeEmail({ name: user.name }),
  }).catch(err => console.error('[auth] Welcome email failed:', err.message));
  auditLog(user.id, 'email_verified', req);
  res.json({ success: true });
});

const auth = require('../middleware/auth');
router.post('/resend-verification', auth, async (req, res) => {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.email_verified) return res.json({ success: true, already: true });

  const token  = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await query(
    'UPDATE users SET email_verification_token = $1, email_verification_expires_at = $2 WHERE id = $3',
    [token, expiry, user.id]
  );

  const clientUrl  = process.env.CLIENT_URL || 'http://localhost:5173';
  const verifyLink = `${clientUrl}/verify-email?token=${token}`;
  try {
    await sendEmail({
      to:      user.email,
      subject: 'Verify your email address — In Good Hands',
      html:    emailVerificationEmail({ name: user.name, verifyLink }),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[auth] Resend verification email failed:', err.message);
    res.status(500).json({ error: 'Could not send verification email. Please try again shortly.' });
  }
});

router.post('/logout', auth, (req, res) => {
  auditLog(req.user.id, 'logout', req);
  res.json({ success: true });
});

module.exports = router;
