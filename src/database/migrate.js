'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const migrationsDir = path.join(__dirname, 'migrations');

// Mỗi migration chạy nguyên khối; checksum phát hiện file đã chạy bị sửa về sau.
function migrateDatabase(db) {
  if (!db.pragma('foreign_keys', { simple: true })) {
    throw new Error('Phải bật PRAGMA foreign_keys trước khi migrate.');
  }
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
    ) STRICT`);
    const applied = [];
    for (const name of fs.readdirSync(migrationsDir).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
      const sha256 = createHash('sha256').update(sql).digest('hex');
      const existing = db.prepare('SELECT sha256 FROM schema_migrations WHERE name = ?').get(name);
      if (existing) {
        if (existing.sha256 !== sha256) throw new Error(`Migration đã thay đổi sau khi chạy: ${name}`);
        continue;
      }
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, sha256) VALUES (?, ?)').run(name, sha256);
      applied.push(name);
    }
    return applied;
  })();
}

module.exports = { migrateDatabase };
