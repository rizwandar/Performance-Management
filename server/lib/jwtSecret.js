/**
 * Single source of truth for the JWT signing secret.
 *
 * Previously `process.env.JWT_SECRET || 'dev-secret-change-in-production'` was
 * copy-pasted across 9 route/middleware files, with one startup guard in
 * middleware/auth.js that only threw when NODE_ENV was exactly 'production'.
 * That was enough on Render, which defaults NODE_ENV to 'production' on every
 * web service (see instrument.js), but it failed open everywhere else: any
 * host that does not set NODE_ENV would boot happily and sign real sessions
 * with a secret that is published in this repo's git history.
 *
 * This module inverts the rule. The secret is REQUIRED unless we can
 * affirmatively identify a local development machine. Anything we cannot
 * positively identify as local dev is treated as a deployed environment and
 * must supply its own secret.
 */

// The well-known fallback. Only ever reachable on a local dev machine, and
// deliberately kept stable there so sessions survive a `node --watch` restart.
const LOCAL_DEV_FALLBACK = 'dev-secret-change-in-production';

// Env vars that prove we are NOT on a developer's machine. RENDER and
// RENDER_SERVICE_NAME are injected automatically by Render on every service;
// CI is set by GitHub Actions. Add to this list when deploying somewhere new,
// but note that the check below fails closed, so forgetting to is safe: an
// unrecognized deployed environment is required to set JWT_SECRET, not
// exempted from it.
const PLATFORM_ENV_SIGNALS = [
  'RENDER',
  'RENDER_SERVICE_NAME',
  'RENDER_EXTERNAL_URL',
  'CI',
];

// Allowlist rather than denylist. Naming the deployed environments would mean
// a typo or an unanticipated value (NODE_ENV=prod, NODE_ENV=stage) silently
// counts as local dev. Only these values, and an unset NODE_ENV, are local.
const LOCAL_NODE_ENVS = ['', 'development', 'dev', 'test', 'local'];

function isLocalDevelopment() {
  if (PLATFORM_ENV_SIGNALS.some((key) => process.env[key])) return false;

  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  return LOCAL_NODE_ENVS.includes(nodeEnv);
}

function resolveJwtSecret() {
  const configured = process.env.JWT_SECRET;
  if (configured) return configured;

  if (!isLocalDevelopment()) {
    throw new Error(
      'FATAL: JWT_SECRET is not set.\n' +
      '\n' +
      'This looks like a deployed environment, so the server will not start\n' +
      'without its own signing secret. Falling back to the shared development\n' +
      'secret here would let anyone who has read this repository forge a\n' +
      'session cookie for any account, including an admin one.\n' +
      '\n' +
      'Set JWT_SECRET to a long random value, unique to this environment:\n' +
      '  - Render: dashboard > the service > Environment > Add Environment Variable\n' +
      '  - Local:  copy server/.env.example to server/.env and fill it in\n' +
      '\n' +
      'Do not reuse another environment\'s value. See CLAUDE.md, Environment Variables.'
    );
  }

  console.warn(
    '[auth] JWT_SECRET is not set. Using the shared local development secret.\n' +
    '       Sessions signed with it are NOT secure and this will refuse to\n' +
    '       start on any deployed environment. Set JWT_SECRET in server/.env.'
  );
  return LOCAL_DEV_FALLBACK;
}

const JWT_SECRET = resolveJwtSecret();

module.exports = { JWT_SECRET, isLocalDevelopment };
