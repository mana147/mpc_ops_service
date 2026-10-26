'use strict';

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const Database = require('better-sqlite3');
const { createDatabase } = require('../src/config/database');
const { migrateDatabase } = require('../src/database/migrate');
const { importLegacyBerthData, weekBounds } = require('../src/services/importLegacyBerthData');

async function main() {
  const { values } = parseArgs({ options: {
    database: { type: 'string' },
    'week-start': { type: 'string' },
    'schema-only': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }
  } });
  if (values.help) {
    console.log('npm run db:migrate -- [--database PATH] --week-start YYYY-MM-DD\n' +
      'npm run db:migrate -- [--database PATH] --schema-only\n' +
      'Ngày bắt đầu phải là Thứ 2. DB có sẵn được backup trước khi thay đổi.');
    return;
  }
  if (values['schema-only'] && values['week-start']) throw new Error('Chọn --schema-only hoặc --week-start.');
  if (!values['schema-only']) weekBounds(values['week-start']);
  const filename = path.resolve(values.database || process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'mpc_ops.sqlite'));
  if (values.database === ':memory:') throw new Error('CLI cần một đường dẫn file SQLite.');
  let db;
  try {
    if (fs.existsSync(filename)) {
      db = new Database(filename, { fileMustExist: true });
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
      // SQLite backup API lấy cả dữ liệu đã commit trong WAL, không copy riêng file .sqlite.
      const backupDir = path.join(path.dirname(filename), 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `${path.basename(filename, '.sqlite')}-${Date.now()}-before-berth.sqlite`);
      await db.backup(backupPath);
      console.log(`Backup: ${backupPath}`);
    } else {
      db = createDatabase({ filename,
        adminUsername: process.env.ADMIN_USERNAME || 'admin',
        adminPassword: process.env.ADMIN_PASSWORD || 'Mpc@123' });
    }
    // Schema + dữ liệu hoặc cùng thành công hoặc cùng rollback.
    const result = db.transaction(() => {
      const migrations = migrateDatabase(db);
      const imported = values['schema-only'] ? null : importLegacyBerthData(db, { weekStart: values['week-start'] });
      return { database: filename, migrations, import: imported };
    }).immediate();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (db) db.close();
  }
}

main().catch(error => {
  console.error(`Migration thất bại: ${error.message}`);
  process.exitCode = 1;
});
