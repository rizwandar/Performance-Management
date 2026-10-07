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
const { SIGNUP_TRIAL_ENABLED } = require('../lib/subscription');
const { regimeForCountry } = require('../lib/complianceRegime');
const { cancelPendingRelease } = require('../lib/releaseChallenge');
const { resolvePasswordResetMethod } = require('../lib/passwordResetMethod');

const { JWT_SECRET } = require('../lib/jwtSecret');

// Reset tokens are high-entropy random values, so a fast hash is enough (unlike
// passwords, there's nothing to slow an attacker down against - the entropy is
// the defense). The DB only ever stores this hash, never the raw token; the raw
// value exists only in the emailed link. Shared with the first-boot admin seed
// in db/database.js, so the two cannot drift apart.
const { hashResetToken } = require('../lib/resetToken');

// The timing-safe string comparison that used to live here existed only for
// the date-of-birth check in forgot-password, which is gone: see
// lib/passwordResetMethod.js for why 'dob' is no longer a reachable method.

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
  // country_code decides whether the GDPR age consent below is required, so
  // it cannot arrive unvalidated. Without this an object stringified to
  // "[OBJECT OBJECT]" and skipped the check entirely, while an array was
  // written to the column as a Postgres array literal, leaving a row whose
  // regime could never be re-derived. Validating the shape (two letters,
  // upper-cased) rather than membership of a full country list is
  // deliberate: the server only needs the gdpr/not-gdpr distinction, and
  // mirroring the client's whole COUNTRIES array here would be a second
  // hand-synced list to keep correct, for no security gain.
  body('country_code').optional({ checkFalsy: true })
    .customSanitizer(v => (typeof v === 'string' ? v.trim().toUpperCase() : v))
    .isAlpha().isLength({ min: 2, max: 2 }).withMessage('Please select a valid country.'),
  // Strict boolean. Anything truthy used to satisfy the gate, including an
  // empty array and the string "false", which then wrote a consent timestamp
  // for a consent nobody gave.
  body('gdpr_age_consent').optional().isBoolean({ strict: true })
    .withMessage('Invalid consent value.').toBoolean(),
  // Same strict-boolean treatment as gdpr_age_consent above, and for the
  // same reason: this gates a second, separate consent (health data is
  // special-category under GDPR/UK law and needs its own affirmative
  // choice, not a bundled checkbox), so it must not be satisfiable by a
  // truthy-but-not-true value either.
  body('health_data_consent').optional().isBoolean({ strict: true })
    .withMessage('Invalid consent value.').toBoolean(),
];
router.post('/register', registerRules, validate, async (req, res) => {
  const { name, email, password, date_of_birth, country_code, privacy_consent, gdpr_age_consent, health_data_consent, acquisition_source } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!privacy_consent) {
    return res.status(400).json({ error: 'You must agree to the Privacy Policy and Terms of Service to create an account.' });
  }
  // The GDPR age-of-consent checkbox is only enforced client-side by a
  // disabled submit button, which anyone can bypass by posting directly to
  // this endpoint. The regime is worked out here from the submitted
  // country_code rather than trusted from the client, so this check can't
  // be skipped by simply omitting it from the request body.
  const regime = regimeForCountry(country_code);
  if (regime === 'gdpr' && gdpr_age_consent !== true) {
    return res.status(400).json({ error: 'You must confirm that you are 16 years of age or older to create an account.' });
  }
  // Medical Records and Doctors store health data, which is special-category
  // under GDPR/UK law and needs its own genuine, separate consent rather than
  // riding along on privacy_consent above. Same server-side enforcement
  // reasoning as the age check: a disabled button is a UI nicety, not a
  // guarantee, so the regime is re-derived here rather than trusted from the
  // client.
  if (regime === 'gdpr' && health_data_consent !== true) {
    return res.status(400).json({ error: 'You must agree to the storage of health information to create an account.' });
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
    // gdpr_age_consent_at and health_data_consent_at record WHEN each consent
    // was given (NULL if the regime check above didn't require it, or GDPR
    // consent simply wasn't applicable) - see the ALTER TABLE comments in
    // db/database.js for why these are timestamps and not booleans.
    const result = await query(`
      INSERT INTO users (name, email, password_hash, date_of_birth, country_code, privacy_consent,
                         privacy_consent_at, privacy_version_consented, tos_version_consented,
                         email_verified, email_verification_token, email_verification_expires_at,
                         acquisition_source, gdpr_age_consent_at, health_data_consent_at)
      VALUES ($1, $2, $3, $4, $5, 1, NOW(), $6, $7, 0, $8, $9, $10, $11, $12)
      RETURNING id
    `, [name, email, hash, date_of_birth || null, country_code || null,
        privacyVersion?.version ?? null, tosVersion?.version ?? null, verifyToken, verifyExpiry,
        acquisitionSource, (regime === 'gdpr' && gdpr_age_consent === true) ? new Date().toISOString() : null,
        (regime === 'gdpr' && health_data_consent === true) ? new Date().toISOString() : null]);

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

  // A successful login is the strongest available evidence of life, and the
  // only one that needs no decision from the owner at all, so it cancels a
  // pending vault release outright (spec 3.3). Someone who has been falsely
  // declared dead and simply signs in as normal has already defended
  // themselves without knowing there was anything to defend.
  //
  // Awaited rather than fired and forgotten, so the row is back to 'armed'
  // before this response is sent and the dashboard cannot render a pending
  // banner for a release that this very request has just stopped.
  //
  // Errors are caught and logged rather than failing the login: being unable
  // to sign in would remove the very path that cancels, which is the worst
  // possible response to this write failing. The daily sweep is the backstop
  // either way - it re-checks users.last_active_at, stamped by the UPDATE
  // above, against the declaration time and cancels on its own if this did
  // not take (see processReleaseRow in lib/releaseChallenge.js).
  try {
    await cancelPendingRelease(user.id, 'owner_login', {
      ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null,
    });
  } catch (err) {
    console.error('[auth] Cancelling pending vault release on login failed:', err.message);
  }

  // Post-BIL-08: offer the opt-in 30-day no-card trial interstitial once,
  // right after this login, to a plain consumer account that has never been
  // asked (or already started a trial some other way, e.g. an old account
  // that predates this change and still has the auto-started
  // signup_trial_started_at from before). Never shown to an org-portal
  // account or an admin - both are outside the consumer freemium model this
  // trial exists for.
  // Always false while the trial is retired (SIGNUP_TRIAL_ENABLED in
  // lib/subscription.js). This single field is what sends the client to the
  // /welcome-trial interstitial, so switching it off removes the full-page
  // free-versus-premium comparison from the first-login flow without the
  // client needing to know the trial is gone.
  const needsTrialOffer = SIGNUP_TRIAL_ENABLED
    && !user.signup_trial_started_at
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
  body('security_answer').optional({ checkFalsy: true }).trim(),
];
// A security-question answer, when the site is configured to ask for one, is an
// ADDITIONAL check layered on top of the email link - never an alternate path
// to a token. A reset link is always and only delivered by email, the API never
// returns a token, and the response is identical whether the account exists,
// the additional check matched, or the request was rate-limited, so none of it
// is a signal an attacker can use to enumerate accounts or brute-force a
// security answer (SEC-04, SEC-05).
//
// Date of birth was a third option here. It is resolved away rather than
// honoured now, because registration no longer collects a date of birth and
// selecting that method would permanently lock every newer account out of
// self-serve reset. See lib/passwordResetMethod.js for the full reasoning.
router.post('/forgot-password', forgotPasswordLimiter, forgotRules, validate, async (req, res) => {
  const { email, security_answer } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const setting = await queryOne("SELECT value FROM app_settings WHERE key = 'password_reset_method'");
  const method  = resolvePasswordResetMethod(setting?.value);
  const requireSecurityAnswer  = method === 'security_question';
  if (requireSecurityAnswer && !security_answer) {
    return res.status(400).json({ error: 'An answer to your security question is required' });
  }

  const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  // A user who never set up a security question can't satisfy this check no
  // matter what they type - this falls through to the generic "no match" branch
  // below rather than revealing why.
  const securityAnswerMatches = !requireSecurityAnswer || (
    !!user && !!user.security_answer_hash &&
    bcrypt.compareSync(normalizeSecurityAnswer(security_answer), user.security_answer_hash)
  );

  if (user && securityAnswerMatches) {
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
    const reason = !user ? 'no_account' : 'security_answer_mismatch';
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

// Verification is deliberately idempotent, and the token is deliberately NOT
// cleared once it has been used.
//
// This URL points at the SPA (/verify-email?token=...), not at this route, so
// a link prefetcher that does not run JavaScript never reaches the API at all.
// But anything that does reach it used to consume the token: email_verified
// went to 1 and the token was set to NULL in the same statement. The owner's
// own click a moment later then matched no row and was told "Invalid or
// expired verification link" about an account that was in fact already
// verified. That is a dead end at the very first thing a new user does, and it
// invites a pointless resend loop. A mail client or security scanner that
// executes page JavaScript, a double click, and a restored browser tab all
// produce it; so does an admin verifying the account by hand first.
//
// Keeping the token is what lets this route recognise whose link it is on a
// second visit. NULLing it destroys the only link between the token and the
// user, after which an already-verified account is indistinguishable from a
// forged token, and the only honest answer left is a refusal.
//
// The tradeoff is that the token stays a valid lookup key for that account
// indefinitely, so it is replayable. That is acceptable here, for this flag
// and no other, because email_verified only ever moves in one direction and
// the replay path does nothing: it writes no row, sends no email, records no
// audit event, and answers with a flag the client renders as "Already
// verified". A replayed token grants nothing it did not already grant and
// discloses nothing about the account, not even its address. It would stop
// being acceptable the moment this route gained any further power, such as
// signing the visitor in, returning account details, or clearing some other
// flag, so do not add any of that here without first making the token single
// use again.
//
// What did not change: an unknown token is still refused, and a token that
// was never used still expires. Nothing here became a way to verify an
// address you do not control.
//
// The alternative considered was adding an email_verified_at column and
// matching on that. It was rejected because email_verified already answers
// "has this happened", auditLog below already records when it happened, and a
// new column would make this a schema change, which CLAUDE.md routes through
// staging first for a fix that otherwise needs no environment of its own.
router.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params;
  // Named columns rather than SELECT *, deliberately. This route is reachable
  // by anyone with no session at all, and a SELECT * pulls password_hash, the
  // reset token, the security answer hash and the vault release columns into
  // scope beside a response object. Nothing leaks them today, but the comment
  // above explains that the whole design rests on this route never gaining
  // further power, and `res.json(user)` is a one line mistake away when the
  // row in hand happens to contain everything. These five are all it uses.
  const user = await queryOne(
    `SELECT id, email, name, email_verified, email_verification_expires_at
     FROM users WHERE email_verification_token = $1`,
    [token]
  );
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification link.' });
  // Ahead of the expiry check on purpose. Once an account is verified, how old
  // its link is stops mattering, and "this link has expired" is the same
  // unhelpful dead end as "invalid link" to someone whose email is fine.
  if (user.email_verified) return res.json({ success: true, already: true });
  if (user.email_verification_expires_at && new Date(user.email_verification_expires_at) < new Date()) {
    return res.status(400).json({ error: 'This verification link has expired. Please request a new one from inside your account.' });
  }
  // Compare and set, so two requests arriving together cannot both win. The
  // read above and this write are separate statements, so without the
  // `AND email_verified = 0` both could pass the check above and both would go
  // on to send a welcome email and write an audit row. A rowCount of 0 means
  // another request got there first, which is the already-verified case rather
  // than a failure, and the loser must stay silent.
  const claimed = await query(
    'UPDATE users SET email_verified = 1 WHERE id = $1 AND email_verified = 0 RETURNING id',
    [user.id]
  );
  if (claimed.rowCount === 0) return res.json({ success: true, already: true });
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
