'use strict';

const session = require('express-session');

class SQLiteSessionStore extends session.Store {
  constructor(db, { ttlMs = 8 * 60 * 60 * 1000 } = {}) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
    this.getStatement = db.prepare('SELECT sess, expires_at FROM sessions WHERE sid = ?');
    this.setStatement = db.prepare(`
      INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
    `);
    this.destroyStatement = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.cleanupStatement = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
    this.cleanupTimer = setInterval(() => this.cleanupStatement.run(Date.now()), 15 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  expiry(sessionData) {
    const expires = sessionData.cookie && sessionData.cookie.expires;
    return expires ? new Date(expires).getTime() : Date.now() + this.ttlMs;
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row || row.expires_at <= Date.now()) {
        if (row) this.destroyStatement.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sessionData, callback = () => {}) {
    try {
      this.setStatement.run(sid, JSON.stringify(sessionData), this.expiry(sessionData));
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sessionData, callback = () => {}) {
    this.set(sid, sessionData, callback);
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStatement.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  close() {
    clearInterval(this.cleanupTimer);
  }
}

module.exports = SQLiteSessionStore;
