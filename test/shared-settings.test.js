'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/config/database');
const { initializeSharedSettings } = require('../src/services/importSharedBerthSettings');
const BerthSettings = require('../src/models/BerthSettings');
const configured = require('./fixtures/configuredBerthData.json');

async function fixture(t) {
  const app = createApp({ databasePath: ':memory:', adminPassword: 'SharedTest@123', sessionSecret: 'shared-test-session-secret', secureCookie: false, demoYear: null });
  t.after(() => { app.locals.sessionStore.close(); app.locals.db.close(); });
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ username: 'admin', password: 'SharedTest@123' }).expect(302);
  const settings = structuredClone(configured);
  delete settings.calls; delete settings.tideWindows;
  settings.vessels = [{ id: 'stable-uuid', name: 'Tàu chung', imo: '1234567', loa: 100, dwt: 12000 }];
  const current = (await agent.get('/api/berth-window/settings')).body;
  await agent.put('/api/berth-window/settings').send({ version: current.version, data: settings }).expect(200);
  return { app, agent, settings };
}
const call = { id: 'C1', vesselId: 'stable-uuid', vessel: 'Tên lúc lập', service: null, line: '', window: null,
  ata: { day: 0, hour: 8 }, dur: 12, from: 0, to: 100, loa: 100, draft: 5, cranes: 1, moves: 100, tol: 0 };

async function saveWeek(agent, week, calls) {
  const url = `/api/berth-window?weekStart=${week}`;
  const current = (await agent.get(url).expect(200)).body;
  return agent.put(url).send({ ...current.data, calls, versions: current.versions }).expect(200);
}

test('trang cấu hình/API yêu cầu đăng nhập; form tách khỏi biểu đồ và không có bộ chọn tuần', async t => {
  const { app, agent } = await fixture(t);
  await request(app).get('/admin/berth-window/settings').expect(302).expect('Location', '/login');
  await request(app).get('/api/berth-window/settings').expect(401);
  await request(app).put('/api/berth-window/settings').send({}).expect(401);
  const page = await agent.get('/admin/berth-window/settings').expect(200);
  assert.match(page.text, /id="quayForm"/); assert.match(page.text, /id="vesselForm"/);
  assert.doesNotMatch(page.text, /id="range"/); assert.doesNotMatch(page.text, /src="\/js\/berth-window.js"/);
  const timeline = await agent.get('/admin/berth-window').expect(200);
  assert.doesNotMatch(timeline.text, /id="quayForm"|id="vesselForm"/);
  assert.match(timeline.text, /id="callForm"/);
});

test('mọi tuần đã có và tuần mới dùng một cấu hình; lưu danh mục giữ snapshot từng lượt', async t => {
  const { app, agent } = await fixture(t);
  await saveWeek(agent, '2026-09-07', [call]);
  await agent.get('/api/berth-window?weekStart=2026-10-26').expect(200);
  const current = (await agent.get('/api/berth-window/settings')).body;
  current.data.terminal = 'Tên chung mới'; current.data.vessels[0].name = 'Tên danh mục mới'; current.data.vessels[0].loa = 110;
  await agent.put('/api/berth-window/settings').send(current).expect(200);
  for (const week of ['2026-09-07', '2026-10-26', '2027-02-01']) {
    const data = (await agent.get(`/api/berth-window?weekStart=${week}`)).body.data;
    assert.equal(data.terminal, 'Tên chung mới'); assert.equal(data.vessels[0].loa, 110);
  }
  const old = (await agent.get('/api/berth-window?weekStart=2026-09-07')).body.data.calls[0];
  assert.deepEqual(old, call);
  const raw = JSON.parse(app.locals.db.prepare('SELECT json_data FROM berth_window_week_datasets WHERE week_start = ?').get('2026-09-07').json_data);
  assert.deepEqual(Object.keys(raw).sort(), ['calls', 'tideWindows']);
});

test('giảm chiều dài bị chặn bởi lịch tuần ngoài khoảng, rollback cả cấu hình và danh mục', async t => {
  const { agent } = await fixture(t);
  await saveWeek(agent, '2025-12-01', [{ ...call, to: 350 }]);
  const current = (await agent.get('/api/berth-window/settings')).body;
  const invalid = structuredClone(current);
  invalid.data.quay.length = 300; invalid.data.berths = [];
  invalid.data.vessels[0].name = 'Không được lưu';
  const result = await agent.put('/api/berth-window/settings').send(invalid).expect(422);
  assert.match(result.body.message, /2025-12-01/);
  assert.deepEqual((await agent.get('/api/berth-window/settings')).body, current);
});

test('phiên bản cũ bị từ chối cho cấu hình, lịch tuần, khoảng ngày và reset', async t => {
  const { agent } = await fixture(t);
  const weekUrl = '/api/berth-window?weekStart=2026-10-26';
  const staleWeek = (await agent.get(weekUrl)).body;
  const rangeUrl = '/api/berth-window/range?start=2026-10-26&end=2026-11-01';
  const staleRange = (await agent.get(rangeUrl)).body;
  const settings = (await agent.get('/api/berth-window/settings')).body;
  await agent.put('/api/berth-window/settings').send(settings).expect(200);
  await agent.put('/api/berth-window/settings').send(settings).expect(409);
  await agent.put(weekUrl).send({ ...staleWeek.data, versions: staleWeek.versions }).expect(409);
  await agent.put(rangeUrl).send({ ...staleRange.data, versions: staleRange.versions }).expect(409);
  await agent.post('/api/berth-window/reset?weekStart=2026-10-26').send({ versions: staleWeek.versions }).expect(409);
  const fresh = (await agent.get(weekUrl)).body;
  await agent.put(weekUrl).send({ ...fresh.data, calls: [call], versions: fresh.versions }).expect(200);
  await agent.put(weekUrl).send({ ...fresh.data, versions: fresh.versions }).expect(409);
  const freshRange = (await agent.get(rangeUrl)).body;
  await saveWeek(agent, '2026-10-26', [{ ...call, moves: 222 }]);
  await agent.put(rangeUrl).send({ ...freshRange.data, versions: freshRange.versions }).expect(409);
});

test('API lịch không thay cấu hình chung; reset giữ cấu hình/danh mục và lịch tuần khác', async t => {
  const { agent } = await fixture(t);
  await saveWeek(agent, '2026-10-19', [call]);
  await saveWeek(agent, '2026-10-26', [call]);
  const before = (await agent.get('/api/berth-window/settings')).body;
  const url = '/api/berth-window?weekStart=2026-10-26';
  const current = (await agent.get(url)).body;
  const bad = structuredClone(current.data); bad.terminal = 'Ghi đè từ lịch';
  await agent.put(url).send({ ...bad, versions: current.versions }).expect(409);
  await agent.post('/api/berth-window/reset?weekStart=2026-10-26').send({ versions: current.versions }).expect(200);
  assert.deepEqual((await agent.get('/api/berth-window/settings')).body, before);
  assert.deepEqual((await agent.get(url)).body.data.calls, []);
  assert.equal((await agent.get('/api/berth-window?weekStart=2026-10-19')).body.data.calls.length, 1);
});

test('ngừng sử dụng giữ lịch cũ, chặn lượt mới và cho phép dùng lại; IMO duy nhất toàn hệ thống', async t => {
  const { agent } = await fixture(t);
  await saveWeek(agent, '2026-10-26', [call]);
  const settings = (await agent.get('/api/berth-window/settings')).body;
  settings.data.vessels[0].active = false;
  await agent.put('/api/berth-window/settings').send(settings).expect(200);
  await saveWeek(agent, '2026-10-26', [{ ...call, moves: 200 }]);
  const url = '/api/berth-window?weekStart=2026-11-02', current = (await agent.get(url)).body;
  await agent.put(url).send({ ...current.data, calls: [call], versions: current.versions }).expect(422);
  const active = (await agent.get('/api/berth-window/settings')).body;
  delete active.data.vessels[0].active;
  await agent.put('/api/berth-window/settings').send(active).expect(200);
  await saveWeek(agent, '2026-11-02', [call]);
  const duplicate = (await agent.get('/api/berth-window/settings')).body;
  duplicate.data.vessels.push({ ...duplicate.data.vessels[0], id: 'different-uuid' });
  await agent.put('/api/berth-window/settings').send(duplicate).expect(422);
});

test('chuyển database chọn cấu hình không trống, giữ UUID và toàn bộ JSON cũ; chạy lại an toàn', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpc-shared-migration-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'migration.sqlite');
  const db = createDatabase({ filename, adminUsername: 'admin', adminPassword: 'Migration@123' });
  t.after(() => { if (db.open) db.close(); });
  const source = structuredClone(configured); source.vessels = [{ id: 'kept-uuid', name: 'Giữ tàu', loa: 100, imo: '', dwt: 10000 }];
  const insert = db.prepare('INSERT INTO berth_window_week_datasets (week_start, json_data) VALUES (?, ?)');
  insert.run('2026-10-19', JSON.stringify(source));
  insert.run('2026-10-26', JSON.stringify(require('../src/data/seedBerthData')));
  const original = db.prepare('SELECT week_start,json_data FROM berth_window_week_datasets ORDER BY week_start').all();
  assert.equal(initializeSharedSettings(db).sourceWeek, '2026-10-19');
  assert.deepEqual(db.prepare('SELECT week_start,json_data FROM berth_window_week_datasets ORDER BY week_start').all(), original);
  assert.equal(new BerthSettings(db).get().data.vessels[0].id, 'kept-uuid');
  assert.equal(initializeSharedSettings(db).imported, false);
  db.close();
  const reopened = require('better-sqlite3')(filename);
  assert.equal(new BerthSettings(reopened).get().data.terminal, source.terminal);
  assert.equal(reopened.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(reopened.pragma('foreign_key_check'), []); reopened.close();
});

test('UUID mâu thuẫn, IMO trùng hoặc master chuẩn hóa đã có dữ liệu đều không được nhập âm thầm', t => {
  for (const mode of ['uuid', 'imo', 'normalized']) {
    const db = createDatabase({ filename: ':memory:', adminUsername: 'admin', adminPassword: 'Migration@123' });
    t.after(() => db.close());
    const v = { id: 'V1', name: 'Tàu', loa: 100, imo: '1234567', dwt: null };
    for (const [week, vessel] of [['2026-10-19', v], ['2026-10-26', { ...v, ...(mode === 'uuid' ? { loa: 110 } : { id: 'V2' }) }]]) {
      db.prepare('INSERT INTO berth_window_week_datasets (week_start,json_data) VALUES (?,?)').run(week, JSON.stringify({ ...configured, vessels: [vessel] }));
    }
    if (mode === 'normalized') {
      require('../src/database/migrate').migrateDatabase(db);
      db.prepare('INSERT INTO terminals (code,name) VALUES (?,?)').run('EXISTING', 'Giữ master');
    }
    assert.throws(() => initializeSharedSettings(db), /đối chiếu/);
    if (mode === 'normalized') assert.equal(db.prepare('SELECT name FROM terminals').get().name, 'Giữ master');
    else assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'berth_shared_settings'").get().n, 0);
  }
});

test('database dùng chung không nhận reseed demo; khởi động lại giữ nguyên master', async t => {
  const { app } = await fixture(t);
  const before = new BerthSettings(app.locals.db).get();
  assert.throws(() => require('../src/data/demoBerthData').seedDemoBerthWeeks(app.locals.db), /Để trống BERTH_DEMO_YEAR/);
  assert.deepEqual(new BerthSettings(app.locals.db).get(), before);
});

test('nguồn cấu hình mâu thuẫn rollback toàn bộ migration thay vì chọn âm thầm', t => {
  const db = createDatabase({ filename: ':memory:', adminUsername: 'admin', adminPassword: 'Migration@123' });
  t.after(() => { if (db.open) db.close(); });
  for (const [week, terminal] of [['2026-10-19', 'A'], ['2026-10-26', 'B']]) db.prepare('INSERT INTO berth_window_week_datasets (week_start,json_data) VALUES (?,?)').run(week, JSON.stringify({ ...configured, terminal }));
  assert.throws(() => initializeSharedSettings(db), /nhiều cấu hình/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'berth_shared_settings'").get().n, 0);
  assert.equal(initializeSharedSettings(db, { sourceWeek: '2026-10-26' }).imported, true);
  assert.equal(new BerthSettings(db).get().data.terminal, 'B');
});
