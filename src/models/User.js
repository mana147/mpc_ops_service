'use strict';

class User {
  constructor(db) {
    this.findByUsernameStatement = db.prepare(`
      SELECT id, username, password_hash, role
      FROM users
      WHERE username = ? COLLATE NOCASE
    `);
    this.findByIdStatement = db.prepare(`
      SELECT id, username, role
      FROM users
      WHERE id = ?
    `);
  }

  findByUsername(username) {
    return this.findByUsernameStatement.get(username);
  }

  findById(id) {
    return this.findByIdStatement.get(id);
  }
}

module.exports = User;
