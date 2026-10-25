'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { migrateDatabase } = require('../src/database/migrate');
const { importLegacyBerthData, weekBounds } = require('../src/services/importLegacyBerthData');
const seed = require('../src/data/seedBerthData');

function fixture(t, { migrate = true, data = seed } = {}) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
    INSERT INTO users VALUES (1, 'planner');
    CREATE TABLE berth_window_datasets (id INTEGER PRIMARY KEY, json_data TEXT, updated_at TEXT, updated_by INTEGER);
    CREATE TABLE sessions (sid TEXT PRIMARY KEY, sess TEXT);
    INSERT INTO sessions VALUES ('existing-session', '{"user":{"id":1}}');`);
  db.prepare('INSERT INTO berth_window_datasets VALUES (1, ?, ?, 1)').run(JSON.stringify(data), '2026-09-28 08:27:33');
  if (migrate) migrateDatabase(db);
  return db;
}

function imported(t) {
  const db = fixture(t);
  const result = importLegacyBerthData(db, { weekStart: '2026-10-19' });
  return { db, ...result };
}

test('migration chạy lại không đổi schema, user, session hoặc JSON hiện tại', t => {
  const db = fixture(t, { migrate: false });
  const source = db.prepare('SELECT * FROM berth_window_datasets').all();
  assert.deepEqual(migrateDatabase(db), ['001_berth_window.sql']);
  assert.deepEqual(migrateDatabase(db), []);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 1);
  assert.deepEqual(db.prepare('SELECT * FROM berth_window_datasets').all(), source);
  assert.equal(db.prepare('SELECT username FROM users').get().username, 'planner');
  assert.equal(db.prepare('SELECT sid FROM sessions').get().sid, 'existing-session');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
});

test('import chuẩn hóa đầy đủ và phân biệt thời gian xếp cầu với thực tế', t => {
  const { db, planId } = imported(t);
  for (const [table, count] of Object.entries({ terminals: 1, quays: 1, berth_sections: 3, shipping_lines: 0,
    services: 9, vessels: 12, berth_windows: 9, tide_windows: 14, vessel_calls: 12, berth_plans: 1, berth_plan_items: 12 })) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, count, table);
  }
  const row = db.prepare(`SELECT c.*, i.planned_start_at, i.planned_end_at, i.quay_from_m, i.quay_to_m,
    i.window_start_at, i.window_end_at FROM vessel_calls c JOIN berth_plan_items i ON i.vessel_call_id = c.id
    WHERE c.legacy_call_id = 'C1'`).get();
  assert.equal(row.call_code, 'C1@2026-10-19');
  assert.equal(new Date(row.planned_start_at).toISOString(), '2026-10-19T00:42:00.000Z');
  assert.equal(new Date(row.planned_end_at).toISOString(), '2026-10-19T22:42:00.000Z');
  assert.equal(new Date(row.window_start_at).toISOString(), '2026-10-19T01:00:00.000Z');
  assert.equal(new Date(row.window_end_at).toISOString(), '2026-10-19T23:00:00.000Z');
  assert.equal(row.ata_at, null);
  assert.equal(row.atb_at, null);
  assert.equal(row.atd_at, null);
  assert.equal(row.legacy_line_label, 'Ocean Line');
  assert.equal(row.quay_from_m, 0);
  assert.equal(row.quay_to_m, 350); // Đi qua B1/B2 là hợp lệ.
  assert.equal(db.prepare('SELECT status FROM berth_plans WHERE id = ?').get(planId).status, 'draft');
  const windows = db.prepare('SELECT DISTINCT valid_from, valid_to FROM berth_windows').all();
  assert.deepEqual(windows, [{ valid_from: '2026-10-19', valid_to: '2026-10-26' }]);
  assert.equal(db.prepare(`SELECT count(*) AS n FROM berth_plan_items WHERE berth_window_id IS NULL`).get().n, 3);
  const archived = db.prepare('SELECT source_json FROM berth_legacy_imports').get();
  assert.deepEqual(JSON.parse(archived.source_json), seed);
});

test('import idempotent; nguồn thay đổi hoặc tuần khác không ghi đè lịch đã import', t => {
  const { db, planId } = imported(t);
  assert.deepEqual(importLegacyBerthData(db, { weekStart: '2026-10-19' }),
    { imported: false, planId, weekStart: '2026-10-19' });
  assert.throws(() => importLegacyBerthData(db, { weekStart: '2026-10-26' }), /đã được import/);
  db.prepare('UPDATE berth_window_datasets SET json_data = ?').run(JSON.stringify({ ...seed, terminal: 'Changed' }));
  assert.throws(() => importLegacyBerthData(db, { weekStart: '2026-10-19' }), /đã được import/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM berth_plan_items').get().n, 12);
  assert.equal(db.prepare('SELECT name FROM terminals').get().name, seed.terminal);
});

test('lỗi allocation cuối import rollback cả schema và dữ liệu trong transaction ngoài', t => {
  const data = structuredClone(seed);
  data.berths[2].to = 850; // C4 vượt giới hạn; lỗi sau khi đã insert nhiều bảng.
  const db = fixture(t, { migrate: false, data });
  assert.throws(() => db.transaction(() => {
    migrateDatabase(db);
    importLegacyBerthData(db, { weekStart: '2026-10-19' });
  })(), /exceeds quay length/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'terminals'").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'schema_migrations'").get().n, 0);
  assert.deepEqual(JSON.parse(db.prepare('SELECT json_data FROM berth_window_datasets').get().json_data), data);
});

test('ngày import phải là Thứ 2 hợp lệ và không phụ thuộc timezone của máy', () => {
  for (const day of [undefined, '2026-10-25', '2026-02-30', '2026-2-02', 'bad']) {
    assert.throws(() => weekBounds(day), /Thứ 2 hợp lệ/);
  }
  assert.equal(weekBounds('2026-10-19').startAt, Date.parse('2026-10-18T17:00:00Z'));
});

test('SQLite chặn phạm vi sai, kiểu dữ liệu sai và liên kết chéo terminal/service', t => {
  const { db } = imported(t);
  assert.throws(() => db.exec('UPDATE berth_plan_items SET quay_to_m = 901 WHERE id = 1'), /exceeds quay length/);
  assert.throws(() => db.exec('UPDATE berth_plan_items SET planned_end_at = planned_start_at WHERE id = 1'), /CHECK constraint/);
  assert.throws(() => db.exec('UPDATE berth_plan_items SET crane_count = 1.5 WHERE id = 1'), /cannot store REAL/);
  assert.throws(() => db.exec('UPDATE berth_plan_items SET berth_window_id = 2 WHERE id = 1'), /call service/);
  assert.throws(() => db.exec('UPDATE vessel_calls SET service_id = NULL WHERE id = 1'), /used by window/);
  assert.throws(() => db.exec('UPDATE quays SET length_m = 800 WHERE id = 1'), /existing allocations/);
  assert.throws(() => db.exec('UPDATE berth_sections SET quay_from_m = 200 WHERE id = 2'), /Sections overlap/);
  db.exec("INSERT INTO terminals (id, code, name) VALUES (2, 'T2', 'Terminal 2'); INSERT INTO quays (id, terminal_id, code, name, length_m) VALUES (2, 2, 'Q2', 'Quay 2', 1000)");
  assert.throws(() => db.exec('UPDATE berth_plan_items SET quay_id = 2 WHERE id = 1'), /FOREIGN KEY/);
  assert.throws(() => db.exec('DELETE FROM vessels WHERE id = 1'), /FOREIGN KEY/);
  assert.throws(() => db.exec('UPDATE berth_windows SET start_minute = 600 WHERE id = 1'), /new window revision/);
});

test('kế hoạch published/superseded và archive không thể bị sửa, xóa hoặc gắn thêm item', t => {
  const { db, planId } = imported(t);
  assert.throws(() => db.exec('UPDATE berth_plans SET change_reason = NULL WHERE id = 1'), /lock_version/);
  const publish = db.prepare(`UPDATE berth_plans SET status = 'published', published_by = 1,
    published_at = ?, snapshot_json = ?, lock_version = lock_version + 1 WHERE id = ?`);
  assert.throws(() => publish.run(Date.now(), '{"terminalName":"Original"}', planId), /Snapshot every item/);
  db.prepare('UPDATE berth_plan_items SET snapshot_json = ? WHERE plan_id = ?')
    .run('{"vesselName":"Original name","windowTerms":{}}', planId);
  publish.run(Date.now(), '{"terminalName":"Original"}', planId);
  assert.throws(() => db.exec('UPDATE berth_plan_items SET crane_count = 4 WHERE id = 1'), /immutable/);
  assert.throws(() => db.exec('DELETE FROM berth_plan_items WHERE id = 1'), /immutable/);
  assert.throws(() => db.exec('UPDATE berth_plans SET safety_gap_m = 10, lock_version = lock_version + 1 WHERE id = 1'), /immutable/);
  assert.throws(() => db.exec('DELETE FROM berth_plans WHERE id = 1'), /immutable/);
  assert.throws(() => db.exec(`INSERT INTO berth_plan_items
    (terminal_id, plan_id, vessel_call_id, quay_id, planned_start_at, planned_end_at, quay_from_m, quay_to_m, crane_count)
    VALUES (1, 1, 1, 1, 1, 2, 0, 100, 1)`), /immutable/);
  // Danh mục có thể đổi; snapshot của bản đã phát hành vẫn giữ nguyên.
  db.exec("UPDATE vessels SET name = 'New name' WHERE id = 1");
  assert.equal(JSON.parse(db.prepare('SELECT snapshot_json FROM berth_plan_items WHERE id = 1').get().snapshot_json).vesselName, 'Original name');
  db.exec("UPDATE berth_plans SET status = 'superseded', lock_version = lock_version + 1 WHERE id = 1");
  assert.throws(() => db.exec('UPDATE berth_plan_items SET crane_count = 4 WHERE id = 1'), /immutable/);
  assert.throws(() => db.exec("UPDATE berth_plans SET status = 'draft', lock_version = lock_version + 1 WHERE id = 1"), /immutable/);
  assert.throws(() => db.exec('UPDATE berth_legacy_imports SET source_updated_at = NULL'), /immutable/);
  assert.throws(() => db.exec('DELETE FROM berth_legacy_imports'), /immutable/);
});

test('plan version và call allocation không bị trùng; optimistic locking từ chối version cũ', t => {
  const { db, planId } = imported(t);
  assert.throws(() => db.exec("INSERT INTO berth_plans (terminal_id, week_start, version) VALUES (1, '2026-10-19', 1)"), /UNIQUE/);
  assert.throws(() => db.exec("INSERT INTO berth_plans (terminal_id, week_start, version, parent_plan_id) VALUES (1, '2026-10-26', 2, 1)"), /Invalid parent/);
  db.exec("INSERT INTO berth_plans (terminal_id, week_start, version, parent_plan_id) VALUES (1, '2026-10-19', 2, 1)");
  const update = db.prepare('UPDATE berth_plans SET change_reason = ?, lock_version = lock_version + 1 WHERE id = ? AND lock_version = ?');
  assert.equal(update.run('Planner A', planId, 0).changes, 1);
  assert.equal(update.run('Planner B', planId, 0).changes, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('CLI tạo file SQLite, backup khi chạy lại và không tạo file cho ngày sai', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpc-berth-db-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'berth demo.sqlite');
  const cli = path.resolve(__dirname, '../scripts/migrate-berth-db.js');
  const run = args => spawnSync(process.execPath, [cli, '--database', filename, ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, NODE_ENV: 'test', ADMIN_USERNAME: 'db-test', ADMIN_PASSWORD: 'DbTest@123' }
  });
  const invalid = run(['--week-start', '2026-10-25']);
  assert.equal(invalid.status, 1);
  assert.equal(fs.existsSync(filename), false);
  const created = run(['--week-start', '2026-10-19']);
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /"imported": true/);
  const repeated = run(['--week-start', '2026-10-19']);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /"imported": false/);
  const backupFiles = fs.readdirSync(path.join(directory, 'backups'));
  assert.equal(backupFiles.length, 1);
  for (const file of [filename, path.join(directory, 'backups', backupFiles[0])]) {
    const db = new Database(file, { readonly: true });
    try {
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM berth_plan_items').get().n, 12);
    } finally {
      db.close();
    }
  }
});
