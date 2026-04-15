const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Register
router.post('/register', (req, res) => {
  const { name, email, password, date_of_birth } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, date_of_birth)
      VALUES (?, ?, ?, ?)
    `).run(name, email, hash, date_of_birth || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin,
      songs_enabled: user.songs_enabled,
      bucket_list_enabled: user.bucket_list_enabled
    }
  });
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  const { email, date_of_birth } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const setting = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('password_reset_method');
  const method = setting?.value || 'email';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (method === 'dob') {
    if (!date_of_birth) return res.status(400).json({ error: 'Date of birth is required' });
    if (!user || user.date_of_birth !== date_of_birth) {
      return res.status(404).json({ error: 'No account found with those details' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?').run(token, expiry, user.id);
    return res.json({ token });
  } else {
    // Email method — don't reveal if user exists
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?').run(token, expiry, user.id);

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const resetLink = `${clientUrl}/reset-password?token=${token}`;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'onboarding@resend.dev',
            to: [user.email],
            subject: 'Reset your password',
            html: `<p>Hi ${user.name},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetLink}">Reset Password</a></p><p>If you did not request this, ignore this email.</p>`
          })
        });
      } catch (e) {
        console.error('Email send failed:', e.message);
      }
    }
    return res.json({ message: 'If that email is registered, a reset link has been sent.' });
  }
});

// Reset password
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?').run(hash, user.id);
  res.json({ success: true });
});

module.exports = router;
