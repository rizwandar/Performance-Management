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
const { setAuthCookies, clearAuthCookies } = require('../lib/authCookies');

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

// Shown to an unknown email, or a known account that never set up a security
// question, so that the /forgot-password/question endpoint can't be used to
// enumerate which accounts exist or which ones have a question configured -
// it always returns *something* that looks like a real question. Picked
// deterministically per email (not randomly per request) so repeat requests
// for the same address see the same decoy, the way a real question would
// behave, rather than a new one that would itself be a tell.
const DECOY_SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What was the make and model of your first car?',
  'In what city did your parents meet?',
  'What was the name of your first school?',
  'What is your favorite childhood book?',
];
function decoyQuestionForEmail(email) {
  const hash = crypto.createHash('sha256').update(email).digest();
  return DECOY_SECURITY_QUESTIONS[hash[0] % DECOY_SECURITY_QUESTIONS.length];
}

function normalizeSecurityAnswer(answer) {
  return String(answer ?? '').trim().toLowerCase();
}

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

// Separate, more generous budget for just fetching the security-question
// prompt to display - it reveals no more than the (possibly decoy) question
// text either way, so it isn't a guess to throttle the way the actual
// forgot-password submission is. Sharing the strict 5/15min budget above
// would let a normal type-email-then-fetch-question flow exhaust it before
// the user ever gets to submit an answer.
const forgotPasswordQuestionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req.body?.email || '').toLowerCase().trim() || ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.json({ question: decoyQuestionForEmail((req.body?.email || '').toLowerCase().trim()) }),
});

// SEC-14: reset-password used to only inherit the shared per-IP authLimiter
// mounted on all of /api/auth/. Now that forgot-password/reset-password are
// exempted from that shared bucket (see server/index.js) so a login lockout
// can't also block recovery, this endpoint needs its own budget rather than
// none at all. It doesn't need to be as tight as the login/register limiter -
// the token itself is a 256-bit random value emailed only to the account
// owner, so brute-forcing it isn't a realistic threat this limiter is
// defending against. It's defense-in-depth against automated abuse of the
// endpoint generally (e.g. hammering it after a token leak).
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
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
  const { name, email, password, date_of_birth, country_code, privacy_consent, acquisition_source } = req.body;
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

    // MKT-02: optional free-text tag identifying which campaign landing page
    // (if any) this signup came from, e.g. "google_ads:adult-children". Only
    // the campaign pages ever send this; the regular app signup form doesn't,
    // so it stays null for normal registrations. Trusted only as reporting
    // metadata, not app logic - truncated defensively since it's unvalidated
    // client input.
    const acquisitionSource = typeof acquisition_source === 'string' && acquisition_source.trim()
      ? acquisition_source.trim().slice(0, 200)
      : null;

    // The single privacy_consent checkbox agrees to both the Privacy Policy
    // and Terms of Service at once (FEAT-04/05), so record which published
    // version of each was current at signup - null if neither has been
    // published yet (e.g. a fresh install before any admin publish action).
    const [privacyVersion, tosVersion] = await Promise.all([
      queryOne("SELECT version FROM policy_versions WHERE module = 'privacy' ORDER BY version DESC LIMIT 1"),
      queryOne("SELECT version FROM policy_versions WHERE module = 'tos' ORDER BY version DESC LIMIT 1"),
    ]);

    // Post-BIL-08: registration no longer auto-starts the 30-day no-card
    // vault trial. It's now an explicit opt-in, offered as an interstitial
    // after the user's first successful login (see /login below and
    // billing.js's /start-signup-trial, /decline-signup-trial) - nothing
    // here sets signup_trial_started_at anymore, it stays NULL until the
    // user actually accepts the offer (or self-serves it later from the
    // Upgrade page).
    const result = await query(`
      INSERT INTO users (name, email, password_hash, date_of_birth, country_code, privacy_consent,
                         privacy_consent_at, privacy_version_consented, tos_version_consented,
                         email_verified, email_verification_token, email_verification_expires_at,
                         acquisition_source)
      VALUES ($1, $2, $3, $4, $5, 1, NOW(), $6, $7, 0, $8, $9, $10)
      RETURNING id
    `, [name, email, hash, date_of_birth || null, country_code || null,
        privacyVersion?.version ?? null, tosVersion?.version ?? null, verifyToken, verifyExpiry,
        acquisitionSource]);

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
    // SEC-09: the cookie is what the web client actually relies on now - it
    // never reads or stores `token` from this body. Still returned in the
    // body unchanged for mobile, which has no browser cookie jar and keeps
    // using this exactly as before, storing it in expo-secure-store itself.
    // csrf_token is returned here for the same reason it wasn't reliable as
    // a client-read cookie in the first place (see authCookies.js) - the web
    // client stores this value in memory and echoes it back as a header.
    const csrfToken = setAuthCookies(res, token);
    res.status(201).json({
      id: newId,
      token,
      csrf_token: csrfToken,
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
  // vault_attempts is deliberately NOT reset here (it used to be, bundled in
  // with the other session-refresh fields below) - it's a security counter,
  // not session state, and account re-login is trivially available to
  // anyone who knows the account password. Resetting it on login meant the
  // 3-attempt forced-logout was toothless: log back in, get 3 more tries,
  // repeat indefinitely. It now only resets on a correct vault password
  // (see vaultAuth.js's resetVaultAttempts call) or a lockout naturally
  // expiring, matching what a security counter is supposed to guarantee.
  // Found live 2026-08-05 - the user hit exactly this loophole while testing.
  await query(`
    UPDATE users
    SET last_active_at = NOW(),
        last_reminder_sent_at = NULL,
        inactivity_contacts_notified_at = NULL
    WHERE id = $1
  `, [user.id]);

  // REV-13 fix: a false-alarm inactivity trigger (or a mistaken/malicious
  // Report a Passing submission) issues an executor token with expires_at =
  // NULL and allow_demise_confirm = true - a permanent, still-live "confirm
  // passing" link. Resetting the reminder/notified timestamps above did
  // nothing about that already-issued token, so it kept working forever even
  // after the owner demonstrably logged back in. Revoke only tokens tagged
  // with the automatic inactivity-timer / report-death sources here; the
  // owner's own deliberate ad-hoc shares ('manual_share') and the executor
  // designation preview link ('executor_preview') are untouched, since those
  // aren't tied to any inactivity/demise-confirmation trigger and logging in
  // is not a reason to revoke them. Deceased-flow tokens ('deceased_confirmed')
  // are also left alone: this account isn't marked deceased at this point
  // (see the org-deactivation check above), so none should exist, and undoing
  // a confirmed-deceased state is a separate concern this fix doesn't touch.
  await query(
    `DELETE FROM trusted_contact_tokens
     WHERE source IN ('inactivity_trigger', 'report_death')
       AND contact_id IN (SELECT id FROM trusted_contacts WHERE user_id = $1)`,
    [user.id]
  );

  auditLog(user.id, 'login_success', req);

  // Post-BIL-08: offer the opt-in 30-day no-card trial interstitial once,
  // right after this login, to a plain consumer account that has never been
  // asked (or already started a trial some other way, e.g. an old account
  // that predates this change and still has the auto-started
  // signup_trial_started_at from before). Never shown to an org-portal
  // account or an admin - both are outside the consumer freemium model this
  // trial exists for.
  const needsTrialOffer = !user.signup_trial_started_at
    && !user.signup_trial_offer_responded_at
    && !user.org_role
    && !user.is_admin;

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
  // See the matching comment in /register - cookie is authoritative for web,
  // the body's token field is kept only for mobile's benefit. csrf_token is
  // returned so the web client can store it in memory (see AuthContext.jsx).
  const csrfToken = setAuthCookies(res, token);
  res.json({
    token,
    csrf_token: csrfToken,
    // Transient, one-time signal for the login flow to act on - deliberately
    // a top-level response field, not part of `user` below, since `user` is
    // what AuthContext caches to localStorage and this shouldn't persist.
    needs_trial_offer: needsTrialOffer,
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

const emailOnlyRules = [
  body('email').trim().notEmpty().withMessage('Email is required.')
    .customSanitizer(v => v.toLowerCase()),
];
// Lets the forgot-password page display a question to answer, without ever
// revealing whether the account exists or has a question configured - a
// decoy is returned for both an unknown email and a known one that never set
// one up, so the response shape is identical in every case (SEC-05).
router.post('/forgot-password/question', forgotPasswordQuestionLimiter, emailOnlyRules, validate, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const user = await queryOne('SELECT security_question FROM users WHERE email = $1', [email]);
  res.json({ question: user?.security_question || decoyQuestionForEmail(email) });
});

const forgotRules = [
  body('email').trim().notEmpty().withMessage('Email is required.')
    .customSanitizer(v => v.toLowerCase()),
  body('date_of_birth').optional({ checkFalsy: true })
    .isDate().withMessage('Date of birth must be a valid date.'),
  body('security_answer').optional({ checkFalsy: true }).trim(),
];
// Date of birth or a security-question answer, when the site is configured to
// ask for one, is an ADDITIONAL check layered on top of the email link - never
// an alternate path to a token. A reset link is always and only delivered by
// email, the API never returns a token, and the response is identical whether
// the account exists, the additional check matched, or the request was
// rate-limited, so none of it is a signal an attacker can use to enumerate
// accounts or brute-force a date of birth / security answer (SEC-04, SEC-05).
router.post('/forgot-password', forgotPasswordLimiter, forgotRules, validate, async (req, res) => {
  const { email, date_of_birth, security_answer } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const setting = await queryOne("SELECT value FROM app_settings WHERE key = 'password_reset_method'");
  const method  = setting?.value || 'email';
  const requireDob             = method === 'dob';
  const requireSecurityAnswer  = method === 'security_question';
  if (requireDob && !date_of_birth) {
    return res.status(400).json({ error: 'Date of birth is required' });
  }
  if (requireSecurityAnswer && !security_answer) {
    return res.status(400).json({ error: 'An answer to your security question is required' });
  }

  const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  const dobMatches = !requireDob || (!!user && timingSafeStringEqual(user.date_of_birth, date_of_birth));
  // A user who never set up a security question can't satisfy this check no
  // matter what they type - same as a DOB mismatch, this falls through to the
  // generic "no match" branch below rather than revealing why.
  const securityAnswerMatches = !requireSecurityAnswer || (
    !!user && !!user.security_answer_hash &&
    bcrypt.compareSync(normalizeSecurityAnswer(security_answer), user.security_answer_hash)
  );

  if (user && dobMatches && securityAnswerMatches) {
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
    const reason = !user ? 'no_account' : !dobMatches ? 'dob_mismatch' : 'security_answer_mismatch';
    auditLog(user?.id || null, 'password_reset_denied', req, { reason });
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
router.post('/reset-password', resetPasswordLimiter, resetRules, validate, async (req, res) => {
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

// The web client only ever learns the CSRF value from a login/register/etc.
// response body (see the matching comment in authCookies.js for why it can't
// just read the cookie back) - that value lives in an in-memory JS variable,
// so a full page reload loses it even though the httpOnly session cookie
// itself survives fine. This lets AuthProvider re-fetch it on mount when a
// cached user looks logged in, without forcing a fresh login. GET, so it's
// exempt from the CSRF check itself (see middleware/auth.js) - nothing to
// bootstrap circularly here. Simply echoes back whatever the cookie already
// holds; the server-side value was never the broken half of this mechanism.
router.get('/csrf-token', auth, (req, res) => {
  res.json({ csrf_token: req.cookies?.csrf_token || null });
});

router.post('/logout', auth, (req, res) => {
  auditLog(req.user.id, 'logout', req);
  clearAuthCookies(res);
  res.json({ success: true });
});

module.exports = router;
