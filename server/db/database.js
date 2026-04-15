const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'performance.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    job_title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS review_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    start_month INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_cycle_id INTEGER NOT NULL,
    goal_number INTEGER NOT NULL CHECK(goal_number BETWEEN 1 AND 3),
    title TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (review_cycle_id) REFERENCES review_cycles(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_cycle_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('midyear', 'final')),
    comments TEXT,
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (review_cycle_id) REFERENCES review_cycles(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_cycle_number ON goals(review_cycle_id, goal_number);

  CREATE TABLE IF NOT EXISTS favourite_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    deezer_id TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );
`);

// Migration: add date_of_birth to existing employees table
try {
  db.exec(`ALTER TABLE employees ADD COLUMN date_of_birth TEXT`);
} catch (_) {
  // Column already exists — safe to ignore
}

module.exports = db;
