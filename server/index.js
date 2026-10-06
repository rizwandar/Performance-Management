require('dotenv').config();
require('./instrument');
// Required early: refuses to start if JWT_SECRET is missing on anything
// that is not a local development machine. See lib/jwtSecret.js.
const { JWT_SECRET, isLocalDevelopment } = require('./lib/jwtSecret');
const Sentry = require('@sentry/node');
const express = require('express');
const helmet  = require('helmet');
const cookieParser = require('cookie-parser');
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
// Reflecting an arbitrary Origin back together with Allow-Credentials lets ANY
// website make authenticated, cookie-carrying requests to this API. That is
// precisely what the old `!ALLOWED_ORIGIN` fallback did, on every environment
// where CLIENT_URL happened to be unset, which is fail-open on the exact axis
// SEC-09's httpOnly cookie sessions depend on.
//
// The reflection is now confined to a local development machine, using the same
// positive identification the JWT_SECRET guard uses (lib/jwtSecret.js) rather
// than a second, separately-drifting notion of "is this production". A deployed
// environment that loses CLIENT_URL now sends no CORS headers at all: its
// frontend breaks loudly instead of the API quietly opening to every origin.
const ALLOW_ORIGIN_REFLECTION = !ALLOWED_ORIGIN && isLocalDevelopment();
if (!ALLOWED_ORIGIN && !ALLOW_ORIGIN_REFLECTION) {
  console.warn(
    '[cors] CLIENT_URL is not set on what looks like a deployed environment.\n' +
    '       No CORS headers will be sent, so browser clients on another origin\n' +
    '       will be blocked. Set CLIENT_URL to the site origin.'
  );
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin === ALLOWED_ORIGIN || ALLOW_ORIGIN_REFLECTION)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-CSRF-Token');
  // Retry-After isn't on the CORS default-exposed response-header list, so
  // without this the browser silently hides it from client JS on a 429 -
  // the dynamic wait-time countdown (SEC-14) needs it to actually read.
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Mounted before express.json() - Stripe webhook signature verification needs
// the raw request body, not JSON-parsed.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./routes/stripeWebhook').handler);

// 10kb (the original default here) turned out too tight for sections that
// deliberately invite long free-text - Your Last Moments ("a single,
// weightier recording or letter") was designed for exactly that and had no
// client-side length limit to warn a user before Save silently 413'd,
// surfacing only as the generic catch-all error below. 256kb comfortably
// covers even a very long multi-page letter (well over 250,000 characters)
// while still bounding the worst case; per-section UI limits (see
// LastMomentsPage.jsx) are the real guardrail that should trip first in
// normal use, this is just a sane outer bound for the whole API.
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  // SEC-14: forgot-password and reset-password are exempted from this shared
  // IP bucket - they used to share it with /login, so a login lockout also
  // blocked the exact recovery path a locked-out user needs. Both already
  // have their own dedicated limiters downstream (forgotPasswordLimiter,
  // forgotPasswordQuestionLimiter and resetPasswordLimiter in auth.js), so
  // this isn't removing a check, it's removing a redundant one that was
  // causing collateral lockouts. req.path is relative to this middleware's
  // '/api/auth/' mount point (e.g. '/login', '/forgot-password').
  //
  // 2026-08-27: same collateral-lockout pattern found for /csrf-token and
  // /logout. Neither is a credential-guessing attack surface (both require an
  // already-valid session - see auth middleware on those routes in auth.js),
  // but both were sharing this bucket with /login. AuthContext.jsx
  // re-fetches a fresh CSRF token on every hard page reload while a cached
  // session exists, so an ordinary busy admin session (several page loads,
  // some logout/login cycling) can exhaust the 20-request budget on
  // legitimate traffic alone, then have the next real login attempt get
  // blocked - reported live: one conscious login attempt got a 429 after an
  // otherwise normal admin session of browsing, deleting a few accounts, and
  // logging out. Excluding these two removes collateral lockouts the same
  // way SEC-14 did, without weakening the limiter's actual purpose (slowing
  // down repeated /login and /register attempts).
  skip: (req) => req.path.startsWith('/forgot-password') || req.path === '/reset-password'
    || req.path === '/csrf-token' || req.path === '/logout',
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
app.use('/api/sections/digital-life/recovery/', authLimiter);
// Same treatment as recovery directly above, and for the same reason: every
// mutating route under here takes the vault password, so it is a
// vault-password guessing surface and must not sit on the looser 200/15min
// API budget.
//
// GET is exempt, though. /release/status takes no password, so it is not part
// of the surface this limiter exists to slow, and it is read on every Profile
// and Trusted Contacts page load - so counting it against a 20-per-15-minutes
// budget shared with the real guessing routes produces exactly the collateral
// lockout SEC-14 and the /csrf-token fix (PR #213) already had to undo twice:
// ordinary browsing exhausts the budget, and then a legitimate attempt to
// arm or re-issue gets a 429. Caught by the end-to-end test for this feature,
// which locked itself out at request 21. GETs are still covered by the
// 200/15min apiLimiter above.
app.use('/api/sections/digital-life/release/', (req, res, next) => (
  req.method === 'GET' ? next() : authLimiter(req, res, next)
));

app.use(async (req, res, next) => {
  const exemptPaths = ['/api/health', '/api/auth/login', '/api/auth/logout'];
  if (exemptPaths.includes(req.path)) return next();
  // The "I am here" link from a vault release challenge email
  // (routes/vaultReleaseCancel.js). Exempt for the same reason /auth/login
  // is: it is a safety valve, and it is the cheapest way for someone who has
  // been falsely declared dead to stop their vault being handed over. A
  // maintenance window must not be the reason that link does nothing. The
  // path carries a secret token, so this is prefix-matched rather than listed
  // above. It is cheap either way: the GET reads one row by token and renders
  // a confirmation page, and the POST behind that page's button is one
  // conditional UPDATE.
  if (req.path.startsWith('/api/vault-release/cancel/')) return next();
  try {
    const setting = await queryOne("SELECT value FROM app_settings WHERE key = 'maintenance_mode'");
    if (setting?.value !== '1') return next();
    const jwt = require('jsonwebtoken');
    // SEC-09: web no longer sends an Authorization header at all - the admin
    // bypass here needs the same cookie-first, header-fallback lookup
    // middleware/auth.js uses, or a logged-in admin's own cookie-based
    // session would never be recognized here and everyone would see the
    // maintenance page, admins included.
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // A view-as token carries the org staffer's own id but deliberately
        // claims is_admin: false (routes/orgPortal.js). Never let one bypass,
        // regardless of what the underlying account is in the database.
        if (!decoded.viewAs) {
          // Re-read admin status live rather than trusting the token's claim.
          // Every other admin path re-checks per request (middleware/auth.js,
          // SEC-04/SEC-10); this one did not, so a demoted or deactivated
          // admin kept bypassing maintenance mode until their token expired.
          // Same deactivation semantics as requireAuth: an org_role account
          // with is_active = 0. A throw here falls to the 503 below, so a
          // database error denies the bypass rather than granting it.
          const row = await queryOne(
            'SELECT is_admin, is_active, org_role FROM users WHERE id = $1',
            [decoded.id]
          );
          const deactivated = row?.org_role && row.is_active === 0;
          if (row?.is_admin && !deactivated) return next();
        }
      } catch {}
    }
    res.status(503).json({ maintenance: true, error: 'The site is temporarily offline for maintenance. Please check back shortly.' });
  } catch {
    next();
  }
});

// The organization/funeral-home portal is not part of this launch. Gated by
// deploy config, defaulting to OFF - a service with no ORG_PORTAL_ENABLED set
// at all (the current state of production) gets the safe behavior automatically,
// rather than requiring someone to remember to disable it before launch. When
// off, these routers aren't registered at all (not merely rejected), so there's
// no code path to reach regardless of what the client UI shows or hides -
// hiding navigation is not access control (SEC-12). Flip ORG_PORTAL_ENABLED=true
// to bring the subsystem back, e.g. for continued testing on staging.
const ORG_PORTAL_ENABLED = process.env.ORG_PORTAL_ENABLED === 'true';
const ORG_PORTAL_ROUTE_PREFIXES = ['/api/admin/organizations', '/api/org-portal', '/api/org-links', '/api/org-register'];

app.use('/api/auth',            require('./routes/auth'));
app.use('/api/users',           require('./routes/users'));
if (ORG_PORTAL_ENABLED) {
  app.use('/api/admin/organizations', require('./routes/organizations'));
  app.use('/api/org-portal',      require('./routes/orgPortal'));
  app.use('/api/org-links',       require('./routes/orgPublic'));
  app.use('/api/org-register',    require('./routes/orgRegister'));
} else {
  app.use(ORG_PORTAL_ROUTE_PREFIXES, (req, res) => res.status(404).json({ error: 'Not found.' }));
}
app.use('/api/admin',           require('./routes/admin'));
app.use('/api/settings',        require('./routes/settings'));
app.use('/api/deezer',          require('./routes/deezer'));
app.use('/api/documents',       require('./routes/documents'));
app.use('/api/trusted-contacts',require('./routes/trustedContacts'));
app.use('/api/sections/digital-life/recovery', require('./routes/vaultRecovery'));
// Registered before '/api/sections' for the same reason recovery is: the
// generic '/digital-life/:id' routes in sections.js would otherwise swallow
// these paths.
app.use('/api/sections/digital-life/release', require('./routes/vaultRelease'));
// Deliberately NOT under the owner-facing release prefix above. Everything
// there requires a session and most of it requires the vault password; this
// is the one release route that must work with neither, because someone being
// falsely declared dead may not be able to sign in quickly. Its own top-level
// prefix also keeps the URL short enough to survive being copied out of an
// email by hand.
app.use('/api/vault-release',   require('./routes/vaultReleaseCancel'));
app.use('/api/sections',        require('./routes/sections'));
app.use('/api/export',          require('./routes/export'));
app.use('/api/billing',         require('./routes/billing'));
app.use('/api/access',          require('./routes/access'));
app.use('/api/section-shares',  require('./routes/sectionShares'));
app.use('/api/contact',         require('./routes/contact'));
app.use('/api/report-death',    require('./routes/reportDeath'));
app.use('/api/legal',           require('./routes/legal'));

app.get('/', (req, res) => res.json({ status: 'API running' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error('[error]', err.message, err.stack);
  // err.message can carry raw DB/driver detail (SQL fragments, table/column
  // names, file paths) that reaches this handler precisely because it wasn't
  // a route-level validation error the handler expected - every route that
  // wants to show the client something specific already sends its own
  // res.json() before an error would ever get here. NODE_ENV is 'production'
  // on both the staging and production Render services (see instrument.js),
  // so this only stays verbose in true local development.
  if (process.env.NODE_ENV !== 'production') {
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
  res.status(err.status || 500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' });
});

const cron = require('node-cron');
const { checkInactivity, cleanupExpiredTokens } = require('./lib/inactivityTimer');
const { expireOrgPremiumGrants } = require('./lib/orgPremiumExpiry');
const { sendTrialReminders } = require('./lib/trialReminder');
const { sendCardExpiryReminders } = require('./lib/cardExpiryReminder');
const { sendSignupTrialReminders } = require('./lib/signupTrialReminder');
const { SIGNUP_TRIAL_ENABLED } = require('./lib/subscription');
const { sendUnfinishedSectionsNudges } = require('./lib/unfinishedSectionsNudge');
const { deleteExpiredAuditLogs } = require('./lib/auditLogRetention');
const { runVaultReleaseChallenges } = require('./lib/releaseChallenge');
cron.schedule('0 8 * * *', () => {
  console.log('[inactivity] Running daily check...');
  checkInactivity().catch(err => console.error('[inactivity] Check failed:', err.message));
  // The challenge window for vault release on confirmed death
  // (docs/VAULT_RELEASE_ON_DEATH_SPEC.md sections 3.3 and 8.5). Sits next to
  // the inactivity check because it is the vault-shaped sibling of it: both
  // are daily sweeps whose job is to give a living owner every chance to say
  // "I am here" before anything is handed to anybody. Re-challenges owners
  // with a pending release, tells their trusted contacts a declaration was
  // made, cancels when the owner has been active, and moves a window that
  // closed uncancelled to 'released'. Idempotent, so a re-run after a
  // partial failure only does what is still outstanding.
  runVaultReleaseChallenges().catch(err => console.error('[vault-release] Challenge sweep failed:', err.message));
  cleanupExpiredTokens().catch(err => console.error('[cleanup] Failed:', err.message));
  expireOrgPremiumGrants().catch(err => console.error('[org-premium] Expiry sweep failed:', err.message));
  sendTrialReminders().catch(err => console.error('[billing] Trial reminder sweep failed:', err.message));
  sendCardExpiryReminders().catch(err => console.error('[billing] Card-expiry reminder sweep failed:', err.message));
  // BIL-08: day-25/day-28 reminders for the no-card 30-day vault trial.
  // Skipped entirely while the trial is retired (SIGNUP_TRIAL_ENABLED in
  // lib/subscription.js): with no trial running there is nothing to remind
  // anyone about, and an account still carrying an old
  // signup_trial_started_at must not receive "your trial ends soon" for a
  // trial that no longer grants anything.
  if (SIGNUP_TRIAL_ENABLED) {
    sendSignupTrialReminders().catch(err => console.error('[billing] Signup trial reminder sweep failed:', err.message));
  }
  // IDEA-02: one-time "unfinished sections" nudge - see
  // lib/unfinishedSectionsNudge.js for the eligibility rules and the
  // trigger/cadence/audience defaults assumed for this feature.
  sendUnfinishedSectionsNudges().catch(err => console.error('[nudge] Unfinished-sections nudge sweep failed:', err.message));
  // REV-23: enforces the Privacy Policy's 12-month audit-log retention promise
  // (server/db/legalSeed.js, Data Retention section) by deleting expired rows
  // from user_audit_logs.
  deleteExpiredAuditLogs()
    .then(count => { if (count > 0) console.log(`[audit-log-retention] Deleted ${count} expired user_audit_logs row(s).`); })
    .catch(err => console.error('[audit-log-retention] Sweep failed:', err.message));
});

const { runBackup } = require('./lib/backup');
cron.schedule('0 3 * * *', () => {
  console.log('[backup] Running daily database backup...');
  runBackup().catch(err => {
    console.error('[backup] Daily backup failed:', err.message);
    // A failed backup is silent by nature: nothing user-facing breaks and the
    // next request still succeeds, so without this it surfaces only to whoever
    // happens to read the logs. A missing or malformed BACKUP_ENCRYPTION_KEY
    // would stop backups every night until someone noticed.
    Sentry.captureException(err, { tags: { job: 'daily-backup' } });
  });
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
