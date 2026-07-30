const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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
      reset_token                     TEXT,
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
