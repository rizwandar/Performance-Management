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

  // Backfill: mark users without a verification token as verified
  await pool.query(
    'UPDATE users SET email_verified = 1 WHERE email_verification_token IS NULL AND email_verified = 0'
  );

  // Backfill: grant existing users a premium subscription
  await pool.query(`
    INSERT INTO subscriptions (user_id, plan, status)
    SELECT id, 'premium', 'active' FROM users
    ON CONFLICT (user_id) DO NOTHING
  `);

  console.log('[db] PostgreSQL schema ready');
}

module.exports = { pool, query, queryOne, queryAll, transaction, init };
