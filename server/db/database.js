const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'performance.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    date_of_birth TEXT,
    about_me TEXT,
    legacy_message TEXT,
    songs_enabled INTEGER DEFAULT 1,
    bucket_list_enabled INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    reset_token TEXT,
    reset_token_expiry TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS favourite_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    deezer_id TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bucket_list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    planning TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL
  );
`);

// Migrations — safe to run on existing DB
for (const col of ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_email']) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`); } catch (_) {}
}

// Seed default settings
const resetMethodSetting = db.prepare('SELECT * FROM app_settings WHERE key = ?').get('password_reset_method');
if (!resetMethodSetting) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('password_reset_method', 'email');
}

// Seed admin user
const adminUser = db.prepare('SELECT * FROM users WHERE email = ?').get('admin');
if (!adminUser) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, is_admin, songs_enabled, bucket_list_enabled)
    VALUES (?, ?, ?, 1, 1, 1)
  `).run('Administrator', 'admin', hash);
}

module.exports = db;
