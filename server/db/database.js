const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { PRIVACY_V1_HTML, TOS_V1_HTML } = require('./legalSeed');

const url = process.env.DATABASE_URL || '';
const ssl = url && !url.includes('localhost') && !url.includes('127.0.0.1')
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({ connectionString: url || undefined, ssl });

async function queryAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                              SERIAL PRIMARY KEY,
      name                            TEXT NOT NULL,
      email                           TEXT UNIQUE NOT NULL,
      password_hash                   TEXT NOT NULL,
      date_of_birth                   TEXT,
      is_admin                        INTEGER DEFAULT 0,
      reset_token                     TEXT, -- SHA-256 hash of the reset token, never the raw value (SEC-04)
      reset_token_expiry              TEXT,
      last_active_at                  TIMESTAMPTZ DEFAULT NOW(),
      inactivity_period_months        INTEGER DEFAULT 12,
      created_at                      TIMESTAMPTZ DEFAULT NOW(),
      about_me                        TEXT,
      legacy_message                  TEXT,
      songs_enabled                   INTEGER DEFAULT 1,
      bucket_list_enabled             INTEGER DEFAULT 1,
      emergency_contact_name          TEXT,
      emergency_contact_phone         TEXT,
      emergency_contact_email         TEXT,
      last_reminder_sent_at           TIMESTAMPTZ,
      life_story                      TEXT,
      remembered_for                  TEXT,
      country_code                    TEXT,
      privacy_consent                 INTEGER DEFAULT 0,
      privacy_consent_at              TIMESTAMPTZ,
      vault_attempts                  INTEGER DEFAULT 0,
      inactivity_contacts_notified_at TIMESTAMPTZ,
      email_verified                  INTEGER DEFAULT 0,
      email_verification_token        TEXT,
      email_verification_expires_at   TIMESTAMPTZ,
      expo_push_token                 TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trusted_contacts (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sequence     INTEGER NOT NULL CHECK (sequence IN (1,2,3)),
      name         TEXT NOT NULL,
      relationship TEXT,
      email        TEXT,
      phone        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, sequence)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trusted_contact_permissions (
      id         SERIAL PRIMARY KEY,
      contact_id INTEGER NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL,
      UNIQUE (contact_id, section_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS legal_documents (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_type TEXT,
      title         TEXT NOT NULL,
      held_by       TEXT,
      location      TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_items (
      id                SERIAL PRIMARY KEY,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category          TEXT,
      institution       TEXT,
      account_type      TEXT,
      account_reference TEXT,
      contact_name      TEXT,
      contact_phone     TEXT,
      notes             TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS funeral_wishes (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      burial_preference   TEXT,
      ceremony_type       TEXT,
      ceremony_location   TEXT,
      funeral_home        TEXT,
      pre_paid_plan       INTEGER DEFAULT 0,
      pre_paid_details    TEXT,
      music_preferences   TEXT,
      readings            TEXT,
      flowers_preference  TEXT,
      donation_charity    TEXT,
      special_requests    TEXT,
      notes               TEXT,
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medical_wishes (
      id                       SERIAL PRIMARY KEY,
      user_id                  INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organ_donation           TEXT,
      organ_donation_details   TEXT,
      advance_care_directive   INTEGER DEFAULT 0,
      directive_location       TEXT,
      dnr_preference           TEXT,
      gp_name                  TEXT,
      gp_phone                 TEXT,
      hospital_preference      TEXT,
      current_medications      TEXT,
      medical_conditions       TEXT,
      notes                    TEXT,
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS people_to_notify (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      relationship TEXT,
      email        TEXT,
      phone        TEXT,
      notified_by  TEXT,
      notes        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_items (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category           TEXT,
      title              TEXT NOT NULL,
      description        TEXT,
      location           TEXT,
      intended_recipient TEXT,
      notes              TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_messages (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_name TEXT NOT NULL,
      relationship   TEXT,
      message        TEXT,
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS songs_that_define_me (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deezer_id      TEXT,
      title          TEXT NOT NULL,
      artist         TEXT NOT NULL,
      album          TEXT,
      why_meaningful TEXT,
      added_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS life_wishes (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT,
      category    TEXT,
      status      TEXT DEFAULT 'dream',
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS household_info (
      id                SERIAL PRIMARY KEY,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category          TEXT,
      title             TEXT NOT NULL,
      provider          TEXT,
      account_reference TEXT,
      contact           TEXT,
      notes             TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS children_dependants (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name               TEXT NOT NULL,
      type               TEXT,
      date_of_birth      TEXT,
      special_needs      TEXT,
      preferred_guardian TEXT,
      guardian_contact   TEXT,
      alternate_guardian TEXT,
      alternate_contact  TEXT,
      notes              TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploaded_documents (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section_id    TEXT NOT NULL,
      item_id       INTEGER,
      original_name TEXT NOT NULL,
      r2_key        TEXT NOT NULL UNIQUE,
      size_bytes    INTEGER,
      mime_type     TEXT,
      uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
      photo_role    TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id    SERIAL PRIMARY KEY,
      key   TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS digital_vault (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      check_enc  TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS digital_credentials (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service      TEXT NOT NULL,
      service_url  TEXT,
      username_enc TEXT,
      password_enc TEXT,
      notes_enc    TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trusted_contact_tokens (
      id         SERIAL PRIMARY KEY,
      contact_id INTEGER NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
      token      TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_audit_logs (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action     TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata   TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                       SERIAL PRIMARY KEY,
      user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan                     TEXT NOT NULL DEFAULT 'free',
      status                   TEXT NOT NULL DEFAULT 'active',
      trial_ends_at            TIMESTAMPTZ,
      current_period_start     TIMESTAMPTZ,
      current_period_end       TIMESTAMPTZ,
      cancelled_at             TIMESTAMPTZ,
      provider                 TEXT,
      provider_customer_id     TEXT,
      provider_subscription_id TEXT,
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id)
    )
  `);

  // Migration: track which admin (if any) granted an honorary premium subscription.
  await pool.query(`
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS granted_by_admin_id INTEGER REFERENCES users(id)
  `);

  // Migration: the specific Stripe price the user is subscribed to, so the
  // UI can tell Monthly and Annual apart instead of only knowing "premium".
  await pool.query(`
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_price_id TEXT
  `);

  // Migration: replaces vault-deletion-on-5-failed-attempts with a temporary
  // lockout instead. NULL means not locked; a future timestamp means locked
  // until then.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_locked_until TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider           TEXT NOT NULL DEFAULT 'stripe',
      provider_method_id TEXT NOT NULL,
      card_brand         TEXT,
      card_last4         TEXT,
      card_exp_month     INTEGER,
      card_exp_year      INTEGER,
      is_default         INTEGER DEFAULT 0,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (provider, provider_method_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS favourite_songs (
      id        SERIAL PRIMARY KEY,
      user_id   INTEGER NOT NULL REFERENCES users(id),
      deezer_id TEXT,
      title     TEXT NOT NULL,
      artist    TEXT NOT NULL,
      album     TEXT,
      added_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bucket_list_items (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      title       TEXT NOT NULL,
      description TEXT,
      planning    TEXT,
      added_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Organization portal (funeral home white label)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id                        SERIAL PRIMARY KEY,
      name                      TEXT NOT NULL,
      business_categories       TEXT,
      logo_url                  TEXT,
      about                     TEXT,
      plan_tier                 TEXT NOT NULL DEFAULT 'starter',
      location_visibility_policy TEXT NOT NULL DEFAULT 'all_locations',
      created_at                TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_locations (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      address         TEXT,
      phone           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_contacts (
      id                 SERIAL PRIMARY KEY,
      organization_id    INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name               TEXT NOT NULL,
      designation        TEXT,
      email              TEXT,
      phone              TEXT,
      is_billing_contact INTEGER DEFAULT 0,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: org staff accounts (Org Admin / Org Staff). Regular customers and
  // the IGHP Administrator leave these columns null; is_admin is unrelated and untouched.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS org_role TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_location_id INTEGER REFERENCES organization_locations(id)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_customers (
      id                 SERIAL PRIMARY KEY,
      organization_id    INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
      invited_name       TEXT,
      invited_email      TEXT NOT NULL,
      location_id        INTEGER REFERENCES organization_locations(id),
      lifecycle_status   TEXT NOT NULL DEFAULT 'invited',
      view_consent       INTEGER DEFAULT 0,
      view_consent_at    TIMESTAMPTZ,
      edit_consent       INTEGER DEFAULT 0,
      edit_consent_at    TIMESTAMPTZ,
      premium_granted_at TIMESTAMPTZ,
      premium_expires_at TIMESTAMPTZ,
      deceased_at        TIMESTAMPTZ,
      archived_at        TIMESTAMPTZ,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // One organization per customer at a time: enforced once linked (user_id set).
  // Multiple still-invited rows (user_id IS NULL) are unaffected by this index.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS organization_customers_one_org_per_user
    ON organization_customers (user_id) WHERE user_id IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_customer_tokens (
      id                       SERIAL PRIMARY KEY,
      organization_customer_id INTEGER NOT NULL REFERENCES organization_customers(id) ON DELETE CASCADE,
      token_type               TEXT NOT NULL,
      token                    TEXT NOT NULL UNIQUE,
      expires_at               TIMESTAMPTZ NOT NULL,
      created_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: executor designation on an existing trusted contact (section 9 of the
  // org portal spec). A customer may have at most one executor among their 3 contacts.
  await pool.query(`ALTER TABLE trusted_contacts ADD COLUMN IF NOT EXISTS is_executor INTEGER DEFAULT 0`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS trusted_contacts_one_executor
    ON trusted_contacts (user_id) WHERE is_executor = 1
  `);

  // Migration: deceased status now lives on users directly, not just on
  // organization_customers, so the executor/demise-confirmation workflow applies
  // to direct signups too, not only funeral-home-managed customers.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deceased_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deceased_by TEXT`);
  // Testing-only override: when set, the inactivity timer uses this instead of
  // inactivity_period_months, expressed in minutes. Never exposed via PUT /me/timer.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_test_override_minutes INTEGER`);

  // Version log: tracks the client app, admin panel, and org/funeral-home portal
  // as three independently-versioned areas (semver), even though all three ship
  // in the same deploy. A row is added whenever a change to that area is pushed.
  // Displayed in the admin panel's Versions tab.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_versions (
      id          SERIAL PRIMARY KEY,
      module      TEXT NOT NULL CHECK (module IN ('client', 'admin', 'org_portal')),
      version     TEXT NOT NULL,
      summary     TEXT NOT NULL,
      released_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: track org-sponsored premium grants (1 year free on customer association),
  // parallel to the existing admin honorary-premium grant (granted_by_admin_id above).
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)`);

  // Organization self-registration: the invite token an applicant uses to become
  // the org's first Org Admin. Structurally parallel to organization_customer_tokens,
  // but scoped to the org directly since there's no customer involved here.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_admin_invites (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      email           TEXT NOT NULL,
      token           TEXT NOT NULL UNIQUE,
      expires_at      TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Billing event log: a simple record of plan changes (self-service upgrades or
  // the initial plan chosen at self-registration) so there's a paper trail of what
  // an org owes once real payments are switched on. No accruing balance math.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_billing_events (
      id                  SERIAL PRIMARY KEY,
      organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      old_plan_tier       TEXT,
      new_plan_tier       TEXT NOT NULL,
      rate_snapshot       TEXT,
      changed_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: the FK above originally had no ON DELETE action, which blocked
  // account deletion for anyone who ever triggered a billing event (the delete
  // would fail after their uploaded files were already removed). Widen it to
  // SET NULL, the ledger entry itself is still meaningful without the actor.
  await pool.query(`
    ALTER TABLE organization_billing_events
    DROP CONSTRAINT IF EXISTS organization_billing_events_changed_by_user_id_fkey
  `);
  await pool.query(`
    ALTER TABLE organization_billing_events
    ADD CONSTRAINT organization_billing_events_changed_by_user_id_fkey
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  `);

  // Marital status + spouse/partner details, captured on the customer profile.
  // Spouse fields mirror the existing emergency_contact_* shape (name/phone/email)
  // rather than a separate table, since it's a single record per user.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marital_status TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS spouse_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS spouse_phone TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS spouse_email TEXT`);

  // Bumped whenever a password is changed or reset (self-service, forgot-password,
  // or admin-initiated) so JWTs issued before that point stop being accepted by
  // requireAuth - closes the gap where a stolen session survived a password reset.
  // Tokens minted before this migration carry no session-version claim at all, so
  // requireAuth skips the check for them rather than mass-logging-out everyone.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1`);

  // Optional additional password-recovery signal (SEC-05, built on SEC-04's
  // "additional check, never an independent path" design). security_question is
  // the plain question text (not sensitive); security_answer_hash is a bcrypt
  // hash of the normalized (trimmed, lowercased) answer - the raw answer is
  // never stored anywhere, mirroring password_hash.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash TEXT`);

  // Legal content versioning (FEAT-04/05): Privacy Policy and Terms of Service
  // are now admin-published, versioned records instead of hardcoded page
  // content, so there is a permanent record of exactly what was in effect at
  // any point in time. Mirrors the app_versions module convention above.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_versions (
      id                     SERIAL PRIMARY KEY,
      module                 TEXT NOT NULL CHECK (module IN ('privacy', 'tos')),
      version                INTEGER NOT NULL,
      content_html           TEXT NOT NULL,
      summary                TEXT,
      published_by_admin_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      published_at           TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (module, version)
    )
  `);

  // Which version of each policy this user last consented to. Privacy and ToS
  // consent is a single combined action (one checkbox agrees to both), so
  // these two columns are always written together, never independently.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version_consented INTEGER`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_version_consented INTEGER`);

  // Seed version 1 of each policy from the content that used to be hardcoded
  // in TermsPage.jsx/PrivacyPage.jsx, so existing installs get a real v1
  // record instead of starting from an empty history.
  const existingPrivacyVersion = await queryOne("SELECT id FROM policy_versions WHERE module = 'privacy' LIMIT 1");
  if (!existingPrivacyVersion) {
    await pool.query(
      `INSERT INTO policy_versions (module, version, content_html, summary) VALUES ('privacy', 1, $1, 'Initial recorded version.')`,
      [PRIVACY_V1_HTML]
    );
  }
  const existingTosVersion = await queryOne("SELECT id FROM policy_versions WHERE module = 'tos' LIMIT 1");
  if (!existingTosVersion) {
    await pool.query(
      `INSERT INTO policy_versions (module, version, content_html, summary) VALUES ('tos', 1, $1, 'Initial recorded version.')`,
      [TOS_V1_HTML]
    );
  }

  // Backfill: anyone who already consented before version tracking existed is
  // treated as having consented to v1 of both, so this migration doesn't
  // retroactively flag every existing user for re-consent.
  await pool.query(`
    UPDATE users SET privacy_version_consented = 1, tos_version_consented = 1
    WHERE privacy_consent = 1 AND privacy_version_consented IS NULL
  `);

  // Security findings log: a persistent record of security review results
  // (audits, pen-test-style probes, infra reviews) that survives past the
  // chat session that produced them - readable from the admin panel's
  // Security tab in any environment (dev, staging, prod) the server is
  // pointed at, and re-readable by a future Claude Code session via
  // GET /api/admin/security-findings without needing the original
  // conversation history. Mirrors the app_versions/policy_versions
  // convention above.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_findings (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      category      TEXT NOT NULL CHECK (category IN ('authorization', 'injection', 'xss', 'secrets', 'infrastructure', 'session', 'documentation', 'ci-cd', 'other')),
      severity      TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
      status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'monitoring', 'resolved', 'accepted_risk')),
      summary       TEXT NOT NULL,
      details       TEXT,
      source        TEXT,
      related_link  TEXT,
      discovered_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at   TIMESTAMPTZ
    )
  `);

  // Backfill the findings from the 2026-08-02..05 security review (DB/infra
  // screenshots, Sentry 403 triage, the secrets-manager/vault-key/RLS
  // discussion, and the authz/SQLi/XSS audit) so the log isn't empty on
  // first load. Guarded on the table being empty rather than per-row, same
  // spirit as the admin-user seed above - this is a one-time backfill, not
  // something meant to re-run or be duplicated.
  const anyFinding = await queryOne('SELECT id FROM security_findings LIMIT 1');
  if (!anyFinding) {
    const seedSource = 'Claude Code security review, 2026-08-02..05';
    const findings = [
      ['Postgres staging DB (in-good-hands-db-staging) open to 0.0.0.0/0', 'infrastructure', 'high', 'open',
       'Render Networking tab has a single inbound IP rule of 0.0.0.0/0 ("everywhere") - the database is reachable from any IP on the internet, protected only by username/password.',
       'Also paired with rejectUnauthorized: false for TLS in server/db/database.js, so there is no cert-pinning fallback either. Action needed in the Render dashboard, not in code: restrict inbound IPs to Render\'s private network / specific known IPs.',
       'https://github.com/rizwandar/Performance-Management/issues/15'],
      ['Verify CLIENT_URL (not CORS_ORIGIN) is actually set on Render', 'documentation', 'high', 'open',
       'CLAUDE.md previously documented the env var as CORS_ORIGIN and DB_PATH; the code only ever reads CLIENT_URL and DATABASE_URL. If Render was configured from the old docs, CORS silently reflects any origin and every password-reset/verify/access-link email points at localhost.',
       'CLAUDE.md has been corrected. Still needs a human to check the actual Render service env vars, since that can\'t be verified from the repo.',
       'https://github.com/rizwandar/Performance-Management/issues/16'],
      ['Sentry AxiosError 403 in production (in-good-hands-client)', 'session', 'medium', 'open',
       'A 403 fired ~100 minutes after the SEC-09 cookie/CSRF migration merged to main. Leading hypothesis: the CSRF double-submit check, possibly hitting the case where a browser blocks the cross-site csrf_token cookie (client and API are on different *.onrender.com subdomains, treated as cross-site by the Public Suffix List).',
       'Needs the actual Sentry issue\'s Request URL/breadcrumbs (the forwarded alert email was cut off before that section) to confirm root cause.',
       'https://github.com/rizwandar/Performance-Management/issues/17'],
      ['in-good-hands-db-staging (Free tier) auto-deletes 2026-08-23 unless upgraded', 'infrastructure', 'medium', 'open',
       'Render Free Postgres has no automated backups/HA and a hard expiry date. This is the staging DB specifically; production is documented as already on a paid plan.',
       'Recommendation: upgrade to the cheapest paid tier before the expiry date, mainly to stop the auto-delete clock and get Render-native daily backups as a second safety net alongside the app\'s own nightly cron backup.',
       'https://github.com/rizwandar/Performance-Management/issues/18'],
      ['Hardcoded JWT fallback secret duplicated across 8 files', 'secrets', 'medium', 'open',
       "process.env.JWT_SECRET || 'dev-secret-change-in-production' is copy-pasted in 8 route/middleware files. Only middleware/auth.js has a startup guard that throws if JWT_SECRET is unset and NODE_ENV is exactly 'production'.",
       'Should be centralized to one shared constant/module so the safety net can\'t silently miss a new file, or an environment where NODE_ENV isn\'t the literal string "production".',
       null],
      ['Two hardcoded seed accounts ship to every environment', 'secrets', 'medium', 'open',
       "admin@igh.local/Admin1234 (documented) and demo.orgadmin@igh.local/DemoOrgAdmin1234 (undocumented until this review) are seeded on first boot, including production, with fixed passwords.",
       'Real, working, guessable credentials in the codebase. Should be rotated/disabled after first login, or generated randomly at first boot instead of hardcoded.',
       null],
      ['Authorization probe: IDOR, admin-gating, JWT tampering - 9/9 blocked', 'authorization', 'info', 'monitoring',
       "Live-tested against a real local instance: cross-user read/edit/delete by guessed id, non-admin hitting /api/admin routes, a tampered JWT payload, and an alg:none downgrade attempt. All correctly blocked (404s / 401s), with a positive control confirming the real admin path does work.",
       'Now a permanent CI regression check: server/scripts/authz-probe.mjs, run by .github/workflows/authz-probe.yml on every push/PR.',
       'https://github.com/rizwandar/Performance-Management/blob/main/server/scripts/authz-probe.mjs'],
      ['SQL injection audit: no injectable string interpolation found', 'injection', 'info', 'resolved',
       'All 4 places the server builds SQL via template-literal interpolation (sections.js, backup.js, vaultFields.js) were traced to hardcoded table/field names from an internal constant (TABLE_FIELDS) or the DB catalog, never from a request. Every user-supplied value goes through $1-style parameterized queries.',
       null, null],
      ['Stored XSS: admin-authored Terms/Privacy HTML rendered unsanitized', 'xss', 'medium', 'open',
       'server/routes/legal.js stores content_html with no sanitization; TermsPage.jsx/PrivacyPage.jsx render it via dangerouslySetInnerHTML to every visitor. Admin-gated, so not directly exploitable by a regular user, but a real stored-XSS vector if an admin account is ever compromised.',
       'Fix: sanitize content_html server-side (sanitize-html or DOMPurify+jsdom) before the INSERT.',
       'https://github.com/rizwandar/Performance-Management/issues/26'],
      ['No Postgres Row-Level Security (RLS) - relies on consistent app-layer scoping', 'authorization', 'low', 'accepted_risk',
       "264 occurrences of the WHERE ... = req.user.id pattern across the routes layer, no CREATE POLICY/ROW LEVEL SECURITY anywhere. This works only as long as every query remembers the filter.",
       "Decision (2026-08-05): not pursuing RLS for now. The app's legitimate cross-user paths (admin, org-portal view-as, trusted-contact access tokens) are numerous enough that encoding them correctly as SQL policies would be its own error-prone project. Chose to expand the authz-probe CI check instead, which directly tests the thing that matters on every commit.",
       null],
      ['CI security automation added: CodeQL, TruffleHog OSS, Dependabot, authz-probe', 'ci-cd', 'info', 'resolved',
       'Continuous scanning wired into GitHub Actions so security review is not a one-time audit: CodeQL (security-extended queries, weekly + push/PR), TruffleHog OSS secret scanning (push/PR), Dependabot (weekly, all 5 npm workspaces + github-actions), and the authz-probe regression test above.',
       null, 'https://github.com/rizwandar/Performance-Management/pull/1'],
      ['CLAUDE.md documented SQLite instead of the actual PostgreSQL database', 'documentation', 'low', 'resolved',
       'Stack line and the Database section both claimed better-sqlite3; the app has run PostgreSQL via pg for a while. Corrected.', null, null],
      ['CLAUDE.md documented a VAULT_KEY env var that does not exist', 'documentation', 'low', 'resolved',
       'Vault encryption actually derives its key per-request from the user\'s own vault password + userId (scrypt) - there is no server-side master key. render.yaml already had a comment confirming this was intentional; CLAUDE.md just hadn\'t caught up. Corrected, and VAULT_KEY removed from the required env vars list.', null, null],
    ];
    for (const [title, category, severity, status, summary, details, related_link] of findings) {
      await pool.query(
        `INSERT INTO security_findings (title, category, severity, status, summary, details, source, related_link, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $4 = 'resolved' THEN NOW() ELSE NULL END)`,
        [title, category, severity, status, summary, details, seedSource, related_link]
      );
    }
  }

  // Seed default settings
  for (const [key, value] of [
    ['password_reset_method', 'email'],
    ['site_theme',            'forest'],
    ['site_font',             'georgia'],
    ['site_logo',             ''],
  ]) {
    await pool.query(
      'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }

  // Seed admin user
  const adminUser = await queryOne('SELECT id FROM users WHERE email = $1', ['admin@igh.local']);
  if (!adminUser) {
    const hash = bcrypt.hashSync('Admin1234', 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, is_admin, email_verified)
       VALUES ($1, $2, $3, 1, 1)`,
      ['Administrator', 'admin@igh.local', hash]
    );
  }

  // Seed a demo organization with sample customers across every lifecycle status,
  // so the org portal can be showcased in sales meetings without exposing real
  // customer data (org portal spec, section 13).
  const demoOrg = await queryOne("SELECT id FROM organizations WHERE name = 'Demo Funeral Home'");
  if (!demoOrg) {
    const orgResult = await pool.query(
      `INSERT INTO organizations (name, business_categories, about, plan_tier)
       VALUES ($1, $2, $3, 'professional') RETURNING id`,
      ['Demo Funeral Home', JSON.stringify(['Funeral Home', 'Cremation Services']),
       'A demonstration organization used to showcase the In Good Hands organization portal. No real customer data is stored here.']
    );
    const orgId = orgResult.rows[0].id;

    const loc1 = await pool.query(
      "INSERT INTO organization_locations (organization_id, name, address, phone) VALUES ($1, 'Downtown Chapel', '100 Main St', '555-0100') RETURNING id",
      [orgId]
    );
    const loc2 = await pool.query(
      "INSERT INTO organization_locations (organization_id, name, address, phone) VALUES ($1, 'Riverside Chapel', '200 River Rd', '555-0200') RETURNING id",
      [orgId]
    );

    await pool.query(
      `INSERT INTO organization_contacts (organization_id, name, designation, email, phone, is_billing_contact)
       VALUES ($1, 'Pat Reynolds', 'Office Manager', 'demo.contact@igh.local', '555-0150', 1)`,
      [orgId]
    );

    const demoAdminHash = bcrypt.hashSync('DemoOrgAdmin1234', 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, is_admin, email_verified, org_role, organization_id)
       VALUES ('Demo Org Admin', 'demo.orgadmin@igh.local', $1, 0, 1, 'org_admin', $2)`,
      [demoAdminHash, orgId]
    );

    const demoCustomerHash = bcrypt.hashSync('DemoCustomer1234', 10);
    async function seedDemoCustomer({ name, email, status, locationId, viewConsent, editConsent, deceased, archived }) {
      let userId = null;
      if (email) {
        const userResult = await pool.query(
          `INSERT INTO users (name, email, password_hash, email_verified) VALUES ($1, $2, $3, 1) RETURNING id`,
          [name, email, demoCustomerHash]
        );
        userId = userResult.rows[0].id;
        await pool.query(
          "INSERT INTO subscriptions (user_id, plan, status, provider, organization_id) VALUES ($1, 'premium', 'active', 'org_grant', $2) ON CONFLICT (user_id) DO NOTHING",
          [userId, orgId]
        );
      }
      await pool.query(
        `INSERT INTO organization_customers
           (organization_id, user_id, invited_name, invited_email, location_id, lifecycle_status,
            view_consent, view_consent_at, edit_consent, edit_consent_at, deceased_at, archived_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 = 1 THEN NOW() ELSE NULL END,
                 $8, CASE WHEN $8 = 1 THEN NOW() ELSE NULL END,
                 CASE WHEN $9 THEN NOW() ELSE NULL END, CASE WHEN $10 THEN NOW() ELSE NULL END)`,
        [orgId, userId, name, email || `${name.toLowerCase().replace(/\s+/g, '.')}@example-invited.igh.local`,
         locationId, status, viewConsent ? 1 : 0, editConsent ? 1 : 0, !!deceased, !!archived]
      );
    }

    await seedDemoCustomer({ name: 'Sarah Mitchell', email: null, status: 'invited', locationId: loc1.rows[0].id });
    await seedDemoCustomer({ name: 'James Chen', email: 'demo.james.chen@igh.local', status: 'signed_up', locationId: loc1.rows[0].id, viewConsent: true });
    await seedDemoCustomer({ name: 'Maria Garcia', email: 'demo.maria.garcia@igh.local', status: 'plan_in_progress', locationId: loc2.rows[0].id, viewConsent: true, editConsent: true });
    await seedDemoCustomer({ name: 'Robert Taylor', email: 'demo.robert.taylor@igh.local', status: 'plan_completed', locationId: loc1.rows[0].id, viewConsent: true });
    await seedDemoCustomer({ name: 'Eleanor Brooks', email: 'demo.eleanor.brooks@igh.local', status: 'deceased', locationId: loc2.rows[0].id, viewConsent: true, deceased: true });
    await seedDemoCustomer({ name: 'David Kim', email: 'demo.david.kim@igh.local', status: 'archived', locationId: loc1.rows[0].id, viewConsent: true, archived: true });
  }

  // Backfill: mark users without a verification token as verified
  await pool.query(
    'UPDATE users SET email_verified = 1 WHERE email_verification_token IS NULL AND email_verified = 0'
  );

  // One-time cutover: honor the "open access" promise made to everyone who
  // signed up before real billing existed, by grandfathering them premium
  // forever. Gated on app_settings so this only ever fires once - unlike the
  // unconditional backfill it replaces, it must NOT re-grant premium to users
  // who sign up after this point, or the Stripe paywall would be meaningless.
  const grandfatherDone = await pool.query(
    "SELECT 1 FROM app_settings WHERE key = 'premium_grandfather_cutoff_done'"
  );
  if (grandfatherDone.rows.length === 0) {
    await pool.query(`
      INSERT INTO subscriptions (user_id, plan, status, provider)
      SELECT id, 'premium', 'active', 'grandfathered' FROM users
      ON CONFLICT (user_id) DO NOTHING
    `);
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ('premium_grandfather_cutoff_done', NOW()::text) ON CONFLICT (key) DO NOTHING"
    );
    console.log('[db] Premium grandfather cutover applied (one-time)');
  }

  // Migration (SEC-03): field-level encryption for the vault-protected
  // section tables, matching the pattern already used for digital_credentials
  // (see vault.js). Additive only - existing plaintext columns stay in the
  // schema and keep any not-yet-migrated data readable; server/lib/vaultFields.js
  // migrates each row to its _enc column the next time it's read or written
  // with the owner's vault password, since the server never has that
  // password outside of a live request and so can't batch-migrate for users
  // who never revisit these sections.
  await pool.query(`
    ALTER TABLE legal_documents
      ADD COLUMN IF NOT EXISTS document_type_enc TEXT,
      ADD COLUMN IF NOT EXISTS title_enc         TEXT,
      ADD COLUMN IF NOT EXISTS held_by_enc       TEXT,
      ADD COLUMN IF NOT EXISTS location_enc      TEXT,
      ADD COLUMN IF NOT EXISTS notes_enc         TEXT
  `);
  await pool.query(`
    ALTER TABLE financial_items
      ADD COLUMN IF NOT EXISTS category_enc          TEXT,
      ADD COLUMN IF NOT EXISTS institution_enc        TEXT,
      ADD COLUMN IF NOT EXISTS account_type_enc       TEXT,
      ADD COLUMN IF NOT EXISTS account_reference_enc  TEXT,
      ADD COLUMN IF NOT EXISTS contact_name_enc       TEXT,
      ADD COLUMN IF NOT EXISTS contact_phone_enc      TEXT,
      ADD COLUMN IF NOT EXISTS notes_enc              TEXT
  `);
  await pool.query(`
    ALTER TABLE property_items
      ADD COLUMN IF NOT EXISTS category_enc           TEXT,
      ADD COLUMN IF NOT EXISTS title_enc              TEXT,
      ADD COLUMN IF NOT EXISTS description_enc        TEXT,
      ADD COLUMN IF NOT EXISTS location_enc           TEXT,
      ADD COLUMN IF NOT EXISTS intended_recipient_enc  TEXT,
      ADD COLUMN IF NOT EXISTS notes_enc              TEXT
  `);
  await pool.query(`
    ALTER TABLE household_info
      ADD COLUMN IF NOT EXISTS category_enc           TEXT,
      ADD COLUMN IF NOT EXISTS title_enc              TEXT,
      ADD COLUMN IF NOT EXISTS provider_enc           TEXT,
      ADD COLUMN IF NOT EXISTS account_reference_enc  TEXT,
      ADD COLUMN IF NOT EXISTS contact_enc            TEXT,
      ADD COLUMN IF NOT EXISTS notes_enc              TEXT
  `);
  // New rows now write title only to title_enc, leaving the plaintext column
  // NULL - these 3 tables' original NOT NULL constraint on title predates
  // that and would otherwise reject every new insert. Loosening a
  // constraint isn't dropping or renaming a column, so this stays within
  // the "never drop/rename columns" convention.
  await pool.query(`ALTER TABLE legal_documents  ALTER COLUMN title DROP NOT NULL`);
  await pool.query(`ALTER TABLE property_items   ALTER COLUMN title DROP NOT NULL`);
  await pool.query(`ALTER TABLE household_info   ALTER COLUMN title DROP NOT NULL`);

  console.log('[db] PostgreSQL schema ready');
}

module.exports = { pool, query, queryOne, queryAll, transaction, init };
