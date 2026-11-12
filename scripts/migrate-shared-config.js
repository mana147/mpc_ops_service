'use strict';

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const Database = require('better-sqlite3');
const { initializeSharedSettings } = require('../src/services/importSharedBerthSettings');

async function main() {
  const { values } = parseArgs({ options: { database: { type: 'string' }, 'source-week': { type: 'string' } } });
  const filename = path.resolve(values.database || process.env.DATABASE_PATH || 'data/mpc_ops.sqlite');
  const db = new Database(filename, { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const directory = path.join(path.dirname(filename), 'backups');
    fs.mkdirSync(directory, { recursive: true });
    const backup = path.join(directory, `${path.basename(filename, '.sqlite')}-${Date.now()}-before-shared-config.sqlite`);
    await db.backup(backup);
    console.log(`Backup: ${backup}`);
    console.log(JSON.stringify(initializeSharedSettings(db, { sourceWeek: values['source-week'] }), null, 2));
  } finally { db.close(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
