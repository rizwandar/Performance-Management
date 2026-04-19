const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'performance.db');
const db = new Database(dbPath);

// ---------------------------------------------------------------------------
// Core tables (safe to run on existing DB — IF NOT EXISTS)
// ---------------------------------------------------------------------------
db.exec(`
  -- -------------------------------------------------------------------------
  -- Users
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS users (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    name                      TEXT NOT NULL,
    email                     TEXT UNIQUE NOT NULL,
    password_hash             TEXT NOT NULL,
    date_of_birth             TEXT,
    is_admin                  INTEGER DEFAULT 0,
    reset_token               TEXT,
    reset_token_expiry        TEXT,
    last_active_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    inactivity_period_months  INTEGER DEFAULT 12,
    created_at                DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Trusted contacts (up to 3 per user)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS trusted_contacts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sequence     INTEGER NOT NULL CHECK (sequence IN (1,2,3)),
    name         TEXT NOT NULL,
    relationship TEXT,
    email        TEXT,
    phone        TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, sequence)
  );

  -- Which sections each trusted contact can see
  -- section_id matches the id strings in shared/constants.js SECTIONS
  CREATE TABLE IF NOT EXISTS trusted_contact_permissions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL,
    UNIQUE (contact_id, section_id)
  );

  -- -------------------------------------------------------------------------
  -- Section 1 — Personal & Legal Documents
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS legal_documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type TEXT,   -- e.g. 'will', 'power_of_attorney', 'birth_certificate'
    title         TEXT NOT NULL,
    held_by       TEXT,   -- person or organisation holding the document
    location      TEXT,   -- where the physical copy is kept
    notes         TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 2 — Financial Affairs
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS financial_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category          TEXT,   -- 'bank_account', 'investment', 'insurance', 'debt', 'crypto', 'pension', 'other'
    institution       TEXT,
    account_type      TEXT,
    account_reference TEXT,   -- partial number or reference, not full account number
    contact_name      TEXT,
    contact_phone     TEXT,
    notes             TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 4 — Funeral & End-of-Life Wishes (single record per user)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS funeral_wishes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    burial_preference   TEXT,   -- 'burial', 'cremation', 'other'
    ceremony_type       TEXT,   -- 'religious', 'secular', 'none', 'other'
    ceremony_location   TEXT,
    funeral_home        TEXT,
    pre_paid_plan       INTEGER DEFAULT 0,
    pre_paid_details    TEXT,
    music_preferences   TEXT,
    readings            TEXT,
    flowers_preference  TEXT,   -- 'flowers', 'donations', 'both', 'none'
    donation_charity    TEXT,
    special_requests    TEXT,
    notes               TEXT,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 5 — Medical & Care Wishes (single record per user)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS medical_wishes (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                  INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organ_donation           TEXT,   -- 'yes', 'no', 'some', 'unsure'
    organ_donation_details   TEXT,
    advance_care_directive   INTEGER DEFAULT 0,
    directive_location       TEXT,
    dnr_preference           TEXT,   -- 'yes', 'no', 'discuss'
    gp_name                  TEXT,
    gp_phone                 TEXT,
    hospital_preference      TEXT,
    current_medications      TEXT,
    medical_conditions       TEXT,
    notes                    TEXT,
    updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 6 — People to Notify
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS people_to_notify (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    relationship TEXT,
    email        TEXT,
    phone        TEXT,
    notified_by  TEXT,   -- who is responsible for telling this person
    notes        TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 7 — Property & Possessions
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS property_items (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category           TEXT,   -- 'real_estate', 'vehicle', 'sentimental', 'pet', 'other'
    title              TEXT NOT NULL,
    description        TEXT,
    location           TEXT,
    intended_recipient TEXT,
    notes              TEXT,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 8 — Messages to Loved Ones
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS personal_messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_name TEXT NOT NULL,
    relationship   TEXT,
    message        TEXT,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 11 — Songs That Define Me
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS songs_that_define_me (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deezer_id       TEXT,
    title           TEXT NOT NULL,
    artist          TEXT NOT NULL,
    album           TEXT,
    why_meaningful  TEXT,
    added_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 12 — Life's Wishes
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS life_wishes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    category    TEXT,   -- 'travel', 'experience', 'achievement', 'relationship', 'other'
    status      TEXT DEFAULT 'dream',  -- 'dream', 'planning', 'completed'
    notes       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 13 — Practical Household Information
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS household_info (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category          TEXT,   -- 'utility', 'insurance', 'subscription', 'access_code', 'regular_bill', 'other'
    title             TEXT NOT NULL,
    provider          TEXT,   -- company/provider name
    account_reference TEXT,   -- account number, policy number, access code, etc.
    contact           TEXT,   -- phone or email for the provider
    notes             TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Section 14 — Children & Dependants
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS children_dependants (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    type                TEXT,   -- 'child', 'pet', 'elderly_parent', 'other'
    date_of_birth       TEXT,
    special_needs       TEXT,   -- medical, dietary, or care requirements
    preferred_guardian  TEXT,
    guardian_contact    TEXT,
    alternate_guardian  TEXT,
    alternate_contact   TEXT,
    notes               TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Document uploads (Cloudflare R2)
  -- section_id matches SECTIONS ids in shared/constants.js
  -- item_id is the row id in the section's table (nullable for section-level docs)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS uploaded_documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section_id    TEXT NOT NULL,
    item_id       INTEGER,
    original_name TEXT NOT NULL,
    r2_key        TEXT NOT NULL UNIQUE,
    size_bytes    INTEGER,
    mime_type     TEXT,
    uploaded_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- App settings (key/value store)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS app_settings (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    key   TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL
  );

  -- -------------------------------------------------------------------------
  -- Section 3 — Digital Life
  -- Credentials encrypted at rest with AES-256-GCM (see server/lib/vault.js)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS digital_vault (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_enc  TEXT NOT NULL,   -- JSON {ciphertext,iv,tag} of known constant — used to verify vault password
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS digital_credentials (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service      TEXT NOT NULL,    -- plaintext: 'Gmail', 'Netflix', etc.
    service_url  TEXT,             -- plaintext: optional URL
    username_enc TEXT,             -- JSON {ciphertext,iv,tag} — AES-256-GCM
    password_enc TEXT,             -- JSON {ciphertext,iv,tag} — AES-256-GCM
    notes_enc    TEXT,             -- JSON {ciphertext,iv,tag} — AES-256-GCM (security Q&A, PINs, etc.)
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Trusted contact access tokens — time-limited read-only access links
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS trusted_contact_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id  INTEGER NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    expires_at  DATETIME NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- User audit log — login/logout events and security activity
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS user_audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,        -- 'login_success', 'login_failed', 'logout', 'password_reset', 'password_changed'
    ip_address TEXT,
    user_agent TEXT,
    metadata   TEXT,                 -- JSON string for any extra context (e.g. failure reason)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- -------------------------------------------------------------------------
  -- Subscriptions — billing stub (payment processing added later)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS subscriptions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                TEXT NOT NULL DEFAULT 'free',   -- 'free', 'monthly', 'annual'
    status              TEXT NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'past_due', 'trialing'
    trial_ends_at       DATETIME,
    current_period_start DATETIME,
    current_period_end  DATETIME,
    cancelled_at        DATETIME,
    -- Payment provider references (populated when payment is live)
    provider            TEXT,        -- 'stripe' (future)
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id)
  );

  -- -------------------------------------------------------------------------
  -- Payment methods — stub (no card data stored here; provider tokenises it)
  -- -------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS payment_methods (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL DEFAULT 'stripe',
    provider_method_id  TEXT NOT NULL,   -- Stripe PaymentMethod ID (pm_xxx)
    card_brand          TEXT,            -- 'visa', 'mastercard', etc.
    card_last4          TEXT,            -- last 4 digits only — never store full PAN
    card_exp_month      INTEGER,
    card_exp_year       INTEGER,
    is_default          INTEGER DEFAULT 0,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_method_id)
  );
`);

// ---------------------------------------------------------------------------
// Migrations — safe to run on existing DB (ALTER TABLE catches errors silently)
// ---------------------------------------------------------------------------
const migrations = [
  // v1 columns kept for backwards compat (may still exist on live DB)
  'ALTER TABLE users ADD COLUMN about_me TEXT',
  'ALTER TABLE users ADD COLUMN legacy_message TEXT',
  'ALTER TABLE users ADD COLUMN songs_enabled INTEGER DEFAULT 1',
  'ALTER TABLE users ADD COLUMN bucket_list_enabled INTEGER DEFAULT 1',
  'ALTER TABLE users ADD COLUMN emergency_contact_name TEXT',
  'ALTER TABLE users ADD COLUMN emergency_contact_phone TEXT',
  'ALTER TABLE users ADD COLUMN emergency_contact_email TEXT',
  // v2 columns — note: SQLite does not allow CURRENT_TIMESTAMP as ALTER TABLE default
  'ALTER TABLE users ADD COLUMN last_active_at DATETIME',
  'ALTER TABLE users ADD COLUMN inactivity_period_months INTEGER DEFAULT 12',
  'ALTER TABLE users ADD COLUMN last_reminder_sent_at DATETIME',
  // v3 — photo role for uploaded documents (null = document, 'funeral_main' / 'funeral_gallery')
  'ALTER TABLE uploaded_documents ADD COLUMN photo_role TEXT',
  // v4 — "How I'd Like to Be Remembered" fields
  'ALTER TABLE users ADD COLUMN life_story TEXT',
  'ALTER TABLE users ADD COLUMN remembered_for TEXT',
  // v5 — compliance and security
  'ALTER TABLE users ADD COLUMN country_code TEXT',
  'ALTER TABLE users ADD COLUMN privacy_consent INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN privacy_consent_at DATETIME',
  'ALTER TABLE users ADD COLUMN vault_attempts INTEGER DEFAULT 0',
  // v6 — inactivity: track when trusted contacts were last notified on expiry
  'ALTER TABLE users ADD COLUMN inactivity_contacts_notified_at DATETIME',
];

for (const sql of migrations) {
  try { db.exec(sql); } catch (_) {}
}

// v1 tables — keep so existing data is not lost
db.exec(`
  CREATE TABLE IF NOT EXISTS favourite_songs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    deezer_id  TEXT,
    title      TEXT NOT NULL,
    artist     TEXT NOT NULL,
    album      TEXT,
    added_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bucket_list_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    description TEXT,
    planning    TEXT,
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------------------------------------------------------------------------
// Seed default settings
// ---------------------------------------------------------------------------
const defaults = [
  ['password_reset_method', 'email'],
  ['site_theme', 'forest'],
  ['site_font',  'georgia'],
  ['site_logo',  ''],
];
for (const [key, value] of defaults) {
  const exists = db.prepare('SELECT id FROM app_settings WHERE key = ?').get(key);
  if (!exists) db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
}

// ---------------------------------------------------------------------------
// Seed admin user
// ---------------------------------------------------------------------------
const adminUser = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@igh.local');
if (!adminUser) {
  const hash = bcrypt.hashSync('Admin1234', 10);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, is_admin)
    VALUES (?, ?, ?, 1)
  `).run('Administrator', 'admin@igh.local', hash);
}

module.exports = db;
