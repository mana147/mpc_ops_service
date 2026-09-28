'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const seedBerthData = require('../data/seedBerthData');

function createDatabase({ filename, adminUsername, adminPassword }) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS berth_window_datasets (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json_data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions(expires_at);
  `);

  const userCount = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (userCount === 0) {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(adminUsername, bcrypt.hashSync(adminPassword, 12));
  }

  const dataCount = db.prepare('SELECT COUNT(*) AS total FROM berth_window_datasets').get().total;
  if (dataCount === 0) {
    db.prepare('INSERT INTO berth_window_datasets (id, json_data) VALUES (1, ?)')
      .run(JSON.stringify(seedBerthData));
  }

  return db;
}

module.exports = { createDatabase };
