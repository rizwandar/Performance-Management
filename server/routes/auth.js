const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const { queryOne, query } = require('../db/database');
const { sendEmail } = require('../lib/sendEmail');
const { welcomeEmail, passwordResetEmail, emailVerificationEmail } = require('../lib/emailTemplates');
const { validate } = require('../middleware/validate');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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

    const token = jwt.sign({ id: newId, email, is_admin: 0 }, JWT_SECRET, { expiresIn: '8h' });
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
    { id: user.id, email: user.email, is_admin: user.is_admin },
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
    },
  });
});

const forgotRules = [
  body('email').trim().notEmpty().withMessage('Email is required.')
    .customSanitizer(v => v.toLowerCase()),
];
router.post('/forgot-password', forgotRules, validate, async (req, res) => {
  const { email, date_of_birth } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const setting = await queryOne("SELECT value FROM app_settings WHERE key = 'password_reset_method'");
  const method  = setting?.value || 'email';
  const user    = await queryOne('SELECT * FROM users WHERE email = $1', [email]);

  if (method === 'dob') {
    if (!date_of_birth) return res.status(400).json({ error: 'Date of birth is required' });
    if (!user || user.date_of_birth !== date_of_birth) {
      return res.status(404).json({ error: 'No account found with those details' });
    }
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await query('UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [token, expiry, user.id]);
    return res.json({ token });
  } else {
    if (user) {
      const token  = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await query('UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [token, expiry, user.id]);

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const resetLink = `${clientUrl}/reset-password?token=${token}`;

      let emailOk = false;
      try {
        await sendEmail({
          to:      user.email,
          subject: 'Reset your In Good Hands password',
          html:    passwordResetEmail({ name: user.name, resetLink }),
        });
        emailOk = true;
      } catch (e) {
        console.error('Password reset email failed:', e.message);
      }
      if (!emailOk) {
        console.warn('[auth] Password reset email failed. Reset link (server-side only):', resetLink);
      }
    }
    return res.json({ message: 'If that email is registered, a reset link has been sent.' });
  }
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

  const user = await queryOne('SELECT * FROM users WHERE reset_token = $1', [token]);
  if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const hash = bcrypt.hashSync(password, 10);
  await query('UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2', [hash, user.id]);
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
