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

  // Opt-in, per-vault forgot-password behavior: recovery_enabled turns on
  // security-question-based recovery (see vault_recovery_questions/shares
  // below); destroy_after_attempts is an independent safety setting - the
  // vault is auto-destroyed after this many consecutive wrong password
  // attempts, regardless of recovery mode, protecting against someone with
  // account access but not the vault password guessing indefinitely.
  await pool.query(`ALTER TABLE digital_vault ADD COLUMN IF NOT EXISTS recovery_enabled BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE digital_vault ADD COLUMN IF NOT EXISTS destroy_after_attempts INTEGER NOT NULL DEFAULT 100`);

  // Also configurable, matching destroy_after_attempts's pattern: logout_after_attempts
  // forces a sign-out once cumulative wrong attempts reach it (default 3);
  // lockout_after_attempts triggers a repeating 15-minute throttle every time the
  // attempt count is a multiple of it (default 5). Both independent of destroy_after_attempts
  // and of each other - see lib/vaultAttempts.js for how all three interact.
  await pool.query(`ALTER TABLE digital_vault ADD COLUMN IF NOT EXISTS logout_after_attempts INTEGER NOT NULL DEFAULT 3`);
  await pool.query(`ALTER TABLE digital_vault ADD COLUMN IF NOT EXISTS lockout_after_attempts INTEGER NOT NULL DEFAULT 5`);

  // The questions a user configured for vault-specific security-question
  // recovery. question_index is a stable 1..5 ordinal used to pair answers
  // with their escrowed shares below - it is NOT related to the account-level
  // security_question column on users, which stays fully separate.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vault_recovery_questions (
      id                SERIAL PRIMARY KEY,
      digital_vault_id  INTEGER NOT NULL REFERENCES digital_vault(id) ON DELETE CASCADE,
      question_index    INTEGER NOT NULL,
      question_text     TEXT NOT NULL,
      is_mandatory      BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(digital_vault_id, question_index)
    )
  `);

  // Combinatorial escrow: the vault key, encrypted under a key derived from
  // the answers to questions (index_a, index_b, index_c), for every 3-question
  // combination among the configured questions. Answering any 3 correctly
  // successfully decrypts exactly one row (AES-GCM auth tag only validates
  // for the right combination), which recovers the vault key without ever
  // storing the key or password unencrypted.
  // FK to digital_vault(id) with CASCADE so a vault reset (which deletes the
  // digital_vault row) automatically invalidates any old escrow - correct,
  // since the escrowed key no longer exists after a reset.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vault_recovery_shares (
      id                SERIAL PRIMARY KEY,
      digital_vault_id  INTEGER NOT NULL REFERENCES digital_vault(id) ON DELETE CASCADE,
      question_index_a  INTEGER NOT NULL,
      question_index_b  INTEGER NOT NULL,
      key_enc           TEXT NOT NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(digital_vault_id, question_index_a, question_index_b)
    )
  `);

  // v2: escrow moved from 2-question pairs to 3-question combinations (see
  // lib/vaultRecovery.js). question_index_c added additively - existing
  // columns are never dropped/renamed. The original 2-column UNIQUE above
  // now under-constrains real usage (two legitimate triples can share their
  // first two indices, e.g. (1,2,3) and (1,2,4)), so it's replaced with a
  // 4-column unique index; the old constraint is dropped by looking up its
  // actual name rather than assuming Postgres's auto-generated naming, since
  // that isn't guaranteed stable. Safe to run on every boot - this table has
  // never held real production data (feature never shipped past a dev branch).
  await pool.query(`ALTER TABLE vault_recovery_shares ADD COLUMN IF NOT EXISTS question_index_c INTEGER`);
  const staleConstraint = await pool.query(`
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'vault_recovery_shares' AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
    HAVING array_agg(kcu.column_name::text ORDER BY kcu.column_name) = ARRAY['digital_vault_id','question_index_a','question_index_b']::text[]
  `);
  for (const row of staleConstraint.rows) {
    await pool.query(`ALTER TABLE vault_recovery_shares DROP CONSTRAINT "${row.constraint_name}"`);
  }
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS vault_recovery_shares_combo_unique
    ON vault_recovery_shares (digital_vault_id, question_index_a, question_index_b, question_index_c)
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

  // Subscription lifecycle events (BIL-08): a lightweight ledger of billing
  // events that aren't a Stripe invoice, so the customer-facing billing
  // history can show more than "here's what you were charged". Populated
  // from server/routes/stripeWebhook.js at the same points those events
  // already trigger a confirmation email, logged independently of whether
  // that email send succeeds so a Resend outage never silently loses the
  // event. event_type is one of: 'cancelled', 'reinstated',
  // 'payment_succeeded', 'refunded', 'payment_failed' (IDEA-13). metadata is
  // a JSON string with whatever context is useful for that event type (amount, price, plan);
  // kept as TEXT rather than a typed JSON column to match the metadata
  // columns already used elsewhere in this file (user_audit_logs,
  // organization_billing_events).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_events (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      occurred_at TIMESTAMPTZ DEFAULT NOW(),
      metadata    TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS favourite_songs (
      id        SERIAL PRIMARY KEY,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT,
      planning    TEXT,
      added_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // favourite_songs/bucket_list_items originally had no ON DELETE action on
  // their user_id foreign key (every other user-data table has CASCADE) - a
  // real bug, not intentional: deleting a user who had ever added a song or
  // bucket-list item threw a foreign key violation and the whole delete
  // failed outright. CREATE TABLE IF NOT EXISTS above only fixes fresh
  // installs, so existing deployments need the constraint actually replaced.
  // Named to match Postgres's own auto-generated default name for a
  // single-column FK declared inline, so this only ever targets that FK.
  await pool.query(`ALTER TABLE favourite_songs DROP CONSTRAINT IF EXISTS favourite_songs_user_id_fkey`);
  await pool.query(`ALTER TABLE favourite_songs ADD CONSTRAINT favourite_songs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE bucket_list_items DROP CONSTRAINT IF EXISTS bucket_list_items_user_id_fkey`);
  await pool.query(`ALTER TABLE bucket_list_items ADD CONSTRAINT bucket_list_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`);

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

  // Org billing (server/routes/stripeWebhook.js upsertOrgFromSubscription,
  // server/routes/orgPortal.js) has referenced these three columns since org
  // billing was first added, but the migration adding them to the schema was
  // never included - a pre-existing gap, only surfaced now because
  // findConsumerUserByCustomerId's organization-exclusion check (also
  // pre-existing) queries stripe_customer_id unconditionally on every
  // consumer payment/refund/cancellation webhook event, regardless of
  // whether ORG_PORTAL_ENABLED is set.
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_status TEXT`);

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

  // BIL-07: card-on-file expiry reminders (14 and 7 days before the card's
  // exp_month/exp_year ends). card_expiry_reminder_exp_month/_year cache which
  // card the two *_sent_at flags were computed against, so a card update
  // (a new exp date from Stripe) is detected and the reminder cycle restarts
  // for the new card instead of silently staying suppressed forever.
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_expiry_14d_reminder_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_expiry_7d_reminder_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_expiry_reminder_exp_month INTEGER`);
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_expiry_reminder_exp_year INTEGER`);

  // BIL-08: universal no-card 30-day vault trial, granted automatically to
  // every new signup regardless of whether they ever touch Stripe. This is
  // deliberately separate from BIL-04's card-required Stripe trial
  // (users.trial_used_at / subscriptions.trial_ends_at) - that one requires
  // entering a card and only starts at checkout; this one starts the moment
  // an account is created and needs no card or checkout at all.
  // signup_trial_started_at is set once at registration (see auth.js
  // /register) and never cleared - lib/subscription.js treats a user as
  // premium while now() is within 30 days of it, but only when they don't
  // already have an active/trialing paid subscription (that always takes
  // precedence, checked independently - see getUserPlan). Not set for
  // pre-existing accounts, which are unaffected: they either already have a
  // real subscription row (including the grandfathered-premium one above)
  // or simply remain on the free plan exactly as before this change.
  // trial_25d_reminder_sent_at / trial_28d_reminder_sent_at dedupe the day-25
  // ("ends in 5 days") and day-28 ("ends in 2 days") reminder emails, the
  // same one-shot pattern BIL-07 uses for card-expiry reminders.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_trial_started_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_25d_reminder_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_28d_reminder_sent_at TIMESTAMPTZ`);

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

  // BIL-04: 14-day card-required free trial. trial_used_at lives on users (not
  // subscriptions) because the subscriptions row is upserted on every webhook
  // event and would otherwise lose the "ever had a trial" fact across a
  // cancel-then-resubscribe cycle; this column is set once and never cleared.
  // trial_skipped(_at) records the "pay now, skip the trial" choice for the
  // current subscription, for audit/traceability per the agreed spec.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_skipped BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_skipped_at TIMESTAMPTZ`);
  // Tracks whether the "your trial ends in 2 days" reminder has already gone
  // out for the current trial, so the daily cron doesn't resend it.
  await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ`);

  // One-trial-per-person enforcement, card side: every Stripe card fingerprint
  // that has ever been granted a trial. Checked in the checkout.session.completed
  // webhook so a cancel-and-resignup-under-a-new-email doesn't grant a second
  // trial on the same physical card. Email/account-side dedupe is users.trial_used_at.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS used_trial_fingerprints (
      id          SERIAL PRIMARY KEY,
      fingerprint TEXT UNIQUE NOT NULL,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Security findings log: a persistent record of security review results
  // (audits, IDOR/authorization probes, infra reviews) so they survive past
  // whatever conversation produced them and are readable in dev, staging, and
  // production alike, without depending on chat history. Visible in the
  // admin panel's Security tab. See "Security findings log" in CLAUDE.md.
  // Mirrors the app_versions/policy_versions convention above.
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
      ['Hardcoded JWT fallback secret duplicated across 9 files', 'secrets', 'medium', 'open',
       "process.env.JWT_SECRET || 'dev-secret-change-in-production' is copy-pasted across 9 route/middleware files. Only middleware/auth.js has a startup guard that throws if JWT_SECRET is unset and NODE_ENV is exactly 'production'.",
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

  // Added individually (not part of the bulk backfill above, which only
  // fires once against a fully empty table) so these still land even on a
  // database that already had findings before these were discovered/updated.
  // Text reflects real progress as of 2026-08-13, not the original Aug-5
  // "nothing done yet" snapshot - see git history on this block for that.
  const infisicalFindings = [
    ['Secrets migration to Infisical started', 'secrets', 'medium', 'monitoring',
     'Moving off plaintext .env files / manually-pasted Render dashboard values to Infisical (managed cloud), chosen over Doppler for its free self-hosting fallback. Addresses the duplicated-JWT-fallback and hardcoded-seed-account findings above by making rotation and audit logging possible going forward.',
     "Real progress as of 2026-08-13: Infisical account/project created, dev/staging/production environments populated with real values. JWT_SECRET and RESEND_API_KEY were found duplicated across environments (dev/production shared a JWT_SECRET; dev/staging shared a RESEND_API_KEY) - both rotated to independent per-environment values. Dead legacy entries (DB_PATH, SECRET_WEBHOOK_SECRET) removed. Still open: Infisical's native Render Secret Sync integration is NOT connected - Render's dashboard env vars remain the actual live source of truth, with Infisical holding a separate copy that has to be updated by hand alongside it (this is what let the JWT_SECRET/RESEND_API_KEY duplication happen and go unnoticed). Flip to resolved once that sync is connected and confirmed live.",
     'Claude Code security review, 2026-08-05, updated 2026-08-13'],
    ['dev/staging/production share one R2 bucket and (staging+production) share R2 credentials', 'infrastructure', 'high', 'open',
     'R2_BUCKET_NAME is identical across all three environments, and R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY are identical between staging and production specifically. All three environments can read/write/delete the same Cloudflare R2 bucket holding real users\' uploaded legal/medical/financial documents; staging holds full production-equivalent file-storage credentials.',
     'Discovered auditing Infisical secret values 2026-08-13. One concrete symptom already fixed (see the CI-restoration finding below): the daily backup cron was pruning its 14-backup retention count globally across all environments sharing the bucket, and had already caused real drift (Aug 3-4 saw two differently-timezoned services collide, shrinking real coverage from 14 days to about 11). That symptom is patched (backups now namespaced per environment), but the root cause - one shared bucket, overlapping credentials - is not. Needs separate R2 buckets per environment in Cloudflare, each with its own scoped credentials, plus a decision on what to do with data currently in the shared bucket.',
     'Claude Code security review, 2026-08-13'],
    ['CI security scanning and admin Security Findings feature were stranded on an unmerged branch', 'ci-cd', 'medium', 'resolved',
     'A prior session\'s CodeQL/secret-scan/Dependabot/authz-probe CI setup, and this very security_findings admin feature, were both fully built and verified (Aug 5) but only ever committed to a stray branch (origin/claude/new-session-mf9nrq) with no PR - never merged into staging or main, so none of it was actually protecting the app.',
     'Discovered and fixed 2026-08-13 while restoring the Infisical prep work, which depended on this table existing. Both cherry-picked onto fresh branches off current staging, conflicts resolved, re-verified (CI green including the restored authz-probe itself), and merged.',
     'Claude Code security review, 2026-08-13'],
    ['CLAUDE.md documented CORS_ORIGIN instead of the actual CLIENT_URL env var', 'documentation', 'high', 'resolved',
     'Same class of bug as the resolved VAULT_KEY finding above: CLAUDE.md\'s required-env-vars list said CORS_ORIGIN, but server/index.js only ever reads process.env.CLIENT_URL. Unlike VAULT_KEY (which just documented something that does not exist), a wrong var name here would have been live-dangerous: if CLIENT_URL were unset at runtime, the CORS middleware falls back to reflecting whatever Origin header the request sends with Access-Control-Allow-Credentials: true, allowing any site to make authenticated, cookie-carrying requests to the API.',
     'Documentation corrected 2026-08-24 to CLIENT_URL, with an explanation of the fallback risk added inline. Verified in the browser (values not read, names only, per explicit user instruction) on both the in-good-hands-api-staging service and performance-api (the actual production backend at performance-api-djuk.onrender.com, provided directly by the user after this session initially could not locate it) - both have CLIENT_URL set and no CORS_ORIGIN or VAULT_KEY present. No live exposure occurred; this was a documentation-only gap.',
     'Claude Code security review, 2026-08-24'],
  ];
  for (const [title, category, severity, status, summary, details, source] of infisicalFindings) {
    const existing = await queryOne('SELECT id FROM security_findings WHERE title = $1', [title]);
    if (!existing) {
      await pool.query(
        `INSERT INTO security_findings (title, category, severity, status, summary, details, source, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $4 = 'resolved' THEN NOW() ELSE NULL END)`,
        [title, category, severity, status, summary, details, source]
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

  // Spouse-as-executor (OPS-15): a checkbox on the Profile page next to the
  // existing spouse/partner fields lets an owner designate their spouse as
  // executor directly, instead of re-entering the same person on the Trusted
  // Contacts page. spouse_is_executor just remembers the checkbox state;
  // linked_to_profile_spouse marks which trusted_contacts row (if any) is
  // being kept in sync with it, so re-saving the profile updates that same
  // record instead of creating a duplicate or guessing by name match.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS spouse_is_executor BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE trusted_contacts ADD COLUMN IF NOT EXISTS linked_to_profile_spouse BOOLEAN DEFAULT false`);

  // An executor's access link never expires (found live 2026-08-05: the owner,
  // who'd normally be the one to resend an expired link, is by definition
  // unreachable once the plan is actually triggered - a 72-hour window left the
  // executor permanently locked out with no self-service recovery). Loosening
  // this NOT NULL, rather than dropping/renaming the column, keeps the existing
  // 72-hour behavior for the other two trusted-contact slots unchanged; NULL
  // here specifically means "never expires", checked in routes/access.js.
  await pool.query(`ALTER TABLE trusted_contact_tokens ALTER COLUMN expires_at DROP NOT NULL`);

  // IDEA-15: an optional, plaintext hint the owner can set alongside their vault
  // password, e.g. "childhood pet's name", to jog their own memory later. It is
  // never the password itself and is never encrypted, it's meant to be readable
  // (only by the owner, on the locked-vault screen) precisely when the real
  // password has been forgotten and vault-encrypted data would otherwise be
  // unrecoverable.
  await pool.query(`ALTER TABLE digital_vault ADD COLUMN IF NOT EXISTS password_hint TEXT`);

  // IDEA-18: Pet Care split out of Your Loved Ones (children_dependants) into its own
  // standalone section (14 sections becomes 15). pets mirrors the same
  // care-instruction shape children_dependants already had for the 'pet'
  // type, just with date_of_birth renamed to the looser free-text age.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pets (
      id                   SERIAL PRIMARY KEY,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name                 TEXT NOT NULL,
      age                  TEXT,
      special_needs        TEXT,
      preferred_caretaker  TEXT,
      caretaker_contact    TEXT,
      alternate_caretaker  TEXT,
      alternate_contact    TEXT,
      notes                TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // One-time backfill of existing type='pet' rows out of children_dependants.
  // Guarded on pets being empty rather than a separate flag column, since
  // this only ever needs to run once and pets starts out with nothing in it.
  const petsAlreadyMigrated = await queryOne('SELECT id FROM pets LIMIT 1');
  if (!petsAlreadyMigrated) {
    await pool.query(`
      INSERT INTO pets
        (user_id, name, age, special_needs, preferred_caretaker, caretaker_contact, alternate_caretaker, alternate_contact, notes, created_at)
      SELECT user_id, name, date_of_birth, special_needs, preferred_guardian, guardian_contact, alternate_guardian, alternate_contact, notes, created_at
      FROM children_dependants WHERE type = 'pet'
    `);
    await pool.query(`DELETE FROM children_dependants WHERE type = 'pet'`);
  }

  // OPS-20: the executor-designation email now includes an immediate,
  // read-only preview link (14-day expiry) so an executor has what they need
  // for funeral/practical arrangements without waiting out the owner's full
  // inactivity period. That link must NOT be able to confirm a passing, only
  // the later triggered links (inactivity timeout, Report a Passing) can -
  // allow_demise_confirm defaults true so every existing link keeps its
  // current behavior, and is only ever set false for this one new case.
  await pool.query(`ALTER TABLE trusted_contact_tokens ADD COLUMN IF NOT EXISTS allow_demise_confirm BOOLEAN DEFAULT true`);

  // Ad-hoc section sharing: unlike Trusted Contacts (capped at 3, tied to a
  // trusted_contacts row), any user can share any single section with anyone,
  // any number of times, by name + email. Separate table on purpose - it has
  // no relationship to trusted_contacts and shouldn't consume one of the 3 slots.
  //
  // Non-vault sections are read live from their source tables on every access
  // (same as the existing access.js trusted-contact flow) - no snapshot needed.
  // Vault-protected sections (legal_documents, financial_items, property_items,
  // household_info, digital_credentials) are different: the vault password is
  // never stored server-side (see lib/vault.js), so there's no way to decrypt
  // on demand once the owner isn't present. For those, snapshot_enc holds a
  // one-time decrypted-then-re-encrypted copy taken at share time, using a
  // fresh random key generated just for that row - never the owner's own
  // vault password or its derived key.
  //
  // snapshot_key_hex is kept in the schema for backwards compatibility with a
  // handful of rows created before this was fixed, but is deliberately never
  // written by current code: storing the key in the same row as the
  // ciphertext it unlocks would let a DB-only compromise decrypt every shared
  // vault section ever created. The key now lives only in the share link's
  // URL fragment - see routes/sectionShares.js for the full reasoning.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS section_shares (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section          TEXT NOT NULL,
      recipient_name   TEXT NOT NULL,
      recipient_email  TEXT NOT NULL,
      token            TEXT UNIQUE NOT NULL,
      is_vault_section BOOLEAN NOT NULL DEFAULT false,
      snapshot_enc     TEXT,
      snapshot_key_hex TEXT,
      expires_at       TIMESTAMPTZ NOT NULL,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      accessed_at      TIMESTAMPTZ,
      revoked_at       TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_section_shares_user ON section_shares(user_id, section)`);

  // MKT-02: records which acquisition campaign/variant a signup came from
  // (e.g. "google_ads:adult-children"), captured from the landing page's UTM
  // params at registration time. Nullable and free-text since it's for
  // reporting only, not app logic - regular in-app signups just leave it null.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS acquisition_source TEXT`);

  // IDEA-01: optional voice recording attached to a message to a loved one,
  // alongside (not instead of) the typed/dictated text. Open to all users,
  // same as the rest of Messages to Loved Ones - not premium-gated.
  await pool.query(`ALTER TABLE personal_messages ADD COLUMN IF NOT EXISTS audio_r2_key TEXT`);
  await pool.query(`ALTER TABLE personal_messages ADD COLUMN IF NOT EXISTS audio_mime_type TEXT`);
  await pool.query(`ALTER TABLE personal_messages ADD COLUMN IF NOT EXISTS audio_size_bytes INTEGER`);
  await pool.query(`ALTER TABLE personal_messages ADD COLUMN IF NOT EXISTS audio_duration_seconds INTEGER`);

  // IDEA-34: raised the one-clip-per-message cap above to up to 3 clips per
  // message. A message can now have 0-3 rows here; ON DELETE CASCADE cleans up
  // clip rows when their parent message is deleted (routes/sections.js still
  // also deletes the R2 objects explicitly first, since Postgres can't reach
  // outside its own database to do that). The four audio_* columns on
  // personal_messages above are kept in place (never dropped/renamed, per
  // project convention) but are no longer written to going forward - all
  // reads and writes for voice clips go through this table from here on.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_message_audio_clips (
      id                SERIAL PRIMARY KEY,
      message_id        INTEGER NOT NULL REFERENCES personal_messages(id) ON DELETE CASCADE,
      r2_key            TEXT NOT NULL,
      mime_type         TEXT,
      size_bytes        INTEGER,
      duration_seconds  INTEGER,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_personal_message_audio_clips_message ON personal_message_audio_clips(message_id)`);

  // One-time migration: copy each message's existing single legacy clip (the
  // audio_r2_key etc. columns above) into the new child table as its first
  // clip, then clear the legacy columns on that row. Clearing them (rather
  // than just leaving them set) is what makes this safe to run unguarded on
  // every startup - once a row's legacy columns are NULL the WHERE clause
  // below never matches it again, even if the one clip it seeded gets deleted
  // later by the user (which would otherwise look identical to "never
  // migrated" and get wrongly re-copied from stale data on the next restart).
  // A single statement (a CTE feeding the UPDATE) so the copy and the clear
  // commit together - no window where a crash between two separate
  // statements could duplicate a row on the next restart.
  await pool.query(`
    WITH migrated AS (
      INSERT INTO personal_message_audio_clips (message_id, r2_key, mime_type, size_bytes, duration_seconds, created_at)
      SELECT id, audio_r2_key, audio_mime_type, audio_size_bytes, audio_duration_seconds, COALESCE(updated_at, created_at)
      FROM personal_messages
      WHERE audio_r2_key IS NOT NULL
      RETURNING message_id
    )
    UPDATE personal_messages
    SET audio_r2_key = NULL, audio_mime_type = NULL, audio_size_bytes = NULL, audio_duration_seconds = NULL
    WHERE id IN (SELECT message_id FROM migrated)
  `);

  // IDEA-29: Insurance, a new standalone section. Deliberately a flat list
  // (one policy per row), not IQ121's 7-way category split - policy_type is
  // free text rather than a rigid enum, matching the shape of the other
  // simple flat sections (e.g. property_items). Unlike Property, Financial,
  // Legal Documents, Household Info, and Digital Life, this section is NOT
  // part of the shared vault - it holds no field-level encryption and no
  // vault_password gating, same pattern as pets/children_dependants/
  // people_to_notify.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_items (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      policy_type    TEXT,
      provider       TEXT,
      policy_number  TEXT,
      contact        TEXT,
      beneficiary    TEXT,
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // IDEA-19: "Unfinished Business" - a new standalone section for
  // reconciliation, apologies, and other relationships or matters the owner
  // wants addressed, deliberately distinct from both Messages to Loved Ones
  // (final words per recipient) and My Bucket List (aspirational future
  // goals). Structured as one entry per person/topic, same per-recipient
  // shape as personal_messages, just with a `description` field instead of
  // a single `message` and no audio attachment. Not vault-protected, not
  // requirePremium-gated, same free-tier pattern as pets/insurance_items/
  // children_dependants above.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unfinished_business (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      description    TEXT,
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // IDEA-30: "Your Last Moments", a new standalone section, distinct from
  // (not a replacement for) Messages to Loved Ones - one weightier, single
  // recording/letter per user rather than a list of messages to different
  // recipients. One row per user (like funeral_wishes/medical_wishes), not
  // enforced with a UNIQUE constraint - same soft-singleton pattern those two
  // tables use, managed by the route (check-existing-then-insert-or-update)
  // rather than the schema. audio_* columns mirror personal_messages' IDEA-01
  // shape exactly (same R2 upload pipeline, same fileSignature verification),
  // created directly here rather than via a later ALTER TABLE since this
  // table is new and never existed without them.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS last_moments (
      id                     SERIAL PRIMARY KEY,
      user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message                TEXT,
      notes                  TEXT,
      audio_r2_key           TEXT,
      audio_mime_type        TEXT,
      audio_size_bytes       INTEGER,
      audio_duration_seconds INTEGER,
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // IDEA-32: Medical & Care Wishes split into three independent sections
  // (16 sections becomes 18): Doctors and Medical Records (both open/free,
  // same protection level the old medical_wishes had), and Donation Bank
  // (organ/body/blood donation preferences), which is NEW to the shared vault
  // (Legal Documents, Digital Life, Financial Affairs, Property & Possessions,
  // Practical Household Information) rather than staying unprotected - this
  // is more sensitive personal-medical data than the rest of old Medical, and
  // the user explicitly asked for it to be vault-gated and field-encrypted.
  //
  // doctors and medical_records mirror medical_wishes' original single-record-
  // per-user shape exactly (funeral_wishes/medical_wishes precedent), just
  // with its columns partitioned by topic. donation_bank additionally carries
  // both a plaintext column and an _enc column per field, exactly like
  // legal_documents/financial_items/property_items/household_info do (see
  // vaultFields.js) - not because donation_bank ever had pre-SEC-03 plaintext
  // data of its own, but so the one-time migration below (which cannot
  // encrypt anything - it runs at server startup with no vault password
  // available for any user) can write the migrated values as legacy
  // plaintext, then have them opportunistically upgraded to _enc on the
  // user's first authenticated read/write, via the exact same
  // decryptRow/migrateRow machinery every other vault table already uses for
  // its own pre-encryption rows. TABLE_FIELDS in vaultFields.js includes
  // donation_bank for this reason.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id                   SERIAL PRIMARY KEY,
      user_id              INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gp_name              TEXT,
      gp_phone             TEXT,
      hospital_preference  TEXT,
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id                       SERIAL PRIMARY KEY,
      user_id                  INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      advance_care_directive   INTEGER DEFAULT 0,
      directive_location       TEXT,
      dnr_preference           TEXT,
      current_medications      TEXT,
      medical_conditions       TEXT,
      notes                    TEXT,
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS donation_bank (
      id                          SERIAL PRIMARY KEY,
      user_id                     INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organ_donation              TEXT,
      organ_donation_enc          TEXT,
      organ_donation_details      TEXT,
      organ_donation_details_enc  TEXT,
      updated_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // One-time backfill of every existing medical_wishes row, split across the
  // three new tables by field, then the source rows are deleted entirely
  // (unlike the IDEA-18 pets split, which only removed the 'pet'-typed subset -
  // here the whole of medical_wishes is being retired, not just part of it).
  // Guarded on doctors being empty rather than a separate flag column, same
  // pattern as the IDEA-18 pets migration - this only ever needs to run once.
  // medical_wishes itself is deliberately left in the schema (not dropped),
  // consistent with this project's non-destructive migration convention.
  const medicalAlreadyMigrated = await queryOne('SELECT id FROM doctors LIMIT 1');
  if (!medicalAlreadyMigrated) {
    await pool.query(`
      INSERT INTO doctors (user_id, gp_name, gp_phone, hospital_preference, updated_at)
      SELECT user_id, gp_name, gp_phone, hospital_preference, updated_at
      FROM medical_wishes
    `);
    await pool.query(`
      INSERT INTO medical_records
        (user_id, advance_care_directive, directive_location, dnr_preference, current_medications, medical_conditions, notes, updated_at)
      SELECT user_id, advance_care_directive, directive_location, dnr_preference, current_medications, medical_conditions, notes, updated_at
      FROM medical_wishes
    `);
    // organ_donation/organ_donation_details land in donation_bank's plaintext
    // columns for now (see the long comment above) - encrypted into
    // organ_donation_enc/organ_donation_details_enc the next time each user's
    // row is read or written through the vault-checked routes.
    await pool.query(`
      INSERT INTO donation_bank (user_id, organ_donation, organ_donation_details, updated_at)
      SELECT user_id, organ_donation, organ_donation_details, updated_at
      FROM medical_wishes
    `);
    await pool.query(`DELETE FROM medical_wishes`);
  }

  // IDEA-27: Emergency Contact split out of Key Contacts into its own
  // section. Reuses the existing emergency_contact_name/_phone/_email
  // columns on users (already wired through GET/PUT /users/me, the standard
  // PDF export, and the admin panel) rather than a new table - these two
  // new nullable columns just round the shape out to match a regular
  // contact (name, relationship, phone, notes).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_notes TEXT`);

  // IDEA-22: optional short personal note the owner can write to a trusted
  // contact when adding/editing them, e.g. "This is important to me, please
  // take a look when you can". Free text, nullable, no length cap, same as
  // other optional notes fields elsewhere in the app. Included in the access
  // link email sent from the "Send access link" flow.
  await pool.query(`ALTER TABLE trusted_contacts ADD COLUMN IF NOT EXISTS invite_message TEXT`);

  // IDEA-02: one-shot "you've started but not finished" nudge email for
  // users who started their plan but have not completed every section.
  // nudge_sent_at dedupes it so the daily sweep (unfinishedSectionsNudge.js)
  // never refires for the same account - same one-shot pattern as
  // trial_25d_reminder_sent_at / trial_28d_reminder_sent_at above and
  // BIL-07's card_expiry_*_sent_at columns. Deliberately one-time-only (not
  // recurring) as the safer, less spammy default - see the memory/PR notes
  // for the full "assumptions made" list, since trigger/cadence/audience for
  // this idea were never explicitly confirmed by the user.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS nudge_sent_at TIMESTAMPTZ`);

  // IDEA-09: persist every contact-form submission (server/routes/contact.js)
  // instead of relying solely on the outbound admin-notification email - if
  // the email fails or is missed, the message would otherwise be gone with
  // no record it ever arrived. subject_type is free text, not a CHECK enum,
  // mirroring how the route itself treats it (an unrecognised value just
  // falls back to a "General Enquiry" label rather than being rejected).
  // status is a simple new/read toggle rather than the fuller open/
  // monitoring/resolved/accepted_risk lifecycle security_findings uses -
  // this is a lightweight inbox, not a tracked review process.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      subject_type  TEXT,
      message       TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // REV-08 (2026-08-26 security review): user_id foreign-key columns across
  // the app's per-user tables had no index - Postgres does not auto-index FK
  // columns (only the referenced side, users.id, is indexed via its PRIMARY
  // KEY). Every one of these tables is queried by user_id on nearly every
  // request (section reads, exports, account deletion, the admin panel), so
  // each of those queries was doing a full table scan. Tables whose user_id
  // is already UNIQUE (funeral_wishes, medical_wishes, digital_vault,
  // subscriptions, doctors, medical_records, donation_bank) are skipped here:
  // a UNIQUE constraint already creates its own index on that column.
  // section_shares and personal_message_audio_clips already had the right
  // index (see above), and organization_customers already has a partial
  // unique index on user_id (organization_customers_one_org_per_user) -
  // those are skipped too. Purely additive, same as every other migration in
  // this file: safe to run on every boot, a no-op once the index exists.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user_id ON trusted_contacts(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_legal_documents_user_id ON legal_documents(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_financial_items_user_id ON financial_items(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_people_to_notify_user_id ON people_to_notify(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_property_items_user_id ON property_items(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_personal_messages_user_id ON personal_messages(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_songs_that_define_me_user_id ON songs_that_define_me(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_life_wishes_user_id ON life_wishes(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_household_info_user_id ON household_info(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_children_dependants_user_id ON children_dependants(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_digital_credentials_user_id ON digital_credentials(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_favourite_songs_user_id ON favourite_songs(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bucket_list_items_user_id ON bucket_list_items(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_used_trial_fingerprints_user_id ON used_trial_fingerprints(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pets_user_id ON pets(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_insurance_items_user_id ON insurance_items(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_unfinished_business_user_id ON unfinished_business(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_last_moments_user_id ON last_moments(user_id)`);

  // Composite indexes for the two most expensive query shapes the REV-08
  // review identified: user_audit_logs is queried per-user filtered by
  // action and ordered by created_at (admin.js's per-row audit-log lookup),
  // and uploaded_documents is queried per-user filtered by section_id/
  // item_id for per-section completion counts (sections.js). A composite
  // index with user_id leftmost also serves plain "WHERE user_id = ..."
  // queries on its own, so no separate single-column index is added for
  // either table.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user_action_created ON user_audit_logs(user_id, action, created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_uploaded_documents_user_section_item ON uploaded_documents(user_id, section_id, item_id)`);

  console.log('[db] PostgreSQL schema ready');
}

module.exports = { pool, query, queryOne, queryAll, transaction, init };
