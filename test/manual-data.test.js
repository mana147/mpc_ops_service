'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../src/config/database');
const { createApp } = require('../src/app');
const { initializeSharedSettings } = require('../src/services/importSharedBerthSettings');
const BerthSettings = require('../src/models/BerthSettings');
const BerthWindow = require('../src/models/BerthWindow');
const request = require('supertest');
const { validateBerthData } = require('../src/services/berthDataValidator');
const domain = require('../public/js/berth-domain');
const emptySeed = require('../src/data/seedBerthData');

test('snapshot chưa cấu hình hợp lệ và không cho lập lịch trước khi có tuyến cầu', () => {
  const empty = structuredClone(emptySeed);
  assert.deepEqual(validateBerthData(empty), emptySeed);
  assert.equal(domain.quay(empty).length, 0);
  assert.equal(domain.quay(empty).safetyGap, null);
  for (const key of ['calls', 'tideWindows']) {
    const invalid = { ...structuredClone(emptySeed), [key]: [{}] };
    assert.throws(() => validateBerthData(invalid), /Cần cấu hình cầu bến/);
  }
});

test('API nhập tay từ trạng thái chưa cấu hình, reset chỉ xóa lịch', async t => {
  const app = createApp({ databasePath: ':memory:', adminPassword: 'ManualTest@123',
    sessionSecret: 'manual-api-test-session-secret', secureCookie: false, demoYear: null });
  t.after(() => { app.locals.sessionStore.close(); app.locals.db.close(); });
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ username: 'admin', password: 'ManualTest@123' }).expect(302);
  const url = '/api/berth-window/range?start=2026-10-27&end=2026-10-27';
  assert.deepEqual((await agent.get(url).expect(200)).body.data, emptySeed);
  const manual = structuredClone(emptySeed);
  manual.vessels.push({ id: 'MANUAL-1', name: 'Tàu nhập tay', imo: '', loa: 100, dwt: null });
  let shared = (await agent.get('/api/berth-window/settings')).body;
  await agent.put('/api/berth-window/settings').send({ version: shared.version, data: { terminal: manual.terminal, quay: manual.quay, berths: manual.berths, vessels: manual.vessels } }).expect(200);
  assert.deepEqual((await agent.get(url).expect(200)).body.data, manual);
  Object.assign(manual, structuredClone(require('./fixtures/configuredBerthData.json')), { vessels: manual.vessels });
  // Tuyến thực tế có thể dùng ngay mà không cần dựng thêm cầu ảo.
  manual.berths = [];
  shared = (await agent.get('/api/berth-window/settings')).body;
  await agent.put('/api/berth-window/settings').send({ version: shared.version, data: { terminal: manual.terminal, quay: manual.quay, berths: manual.berths, vessels: manual.vessels } }).expect(200);
  manual.calls.push({ id: 'MANUAL-C1', vesselId: 'MANUAL-1', vessel: 'Tàu nhập tay',
    service: null, line: '', window: null, ata: { day: 0, hour: 8 }, dur: 4,
    from: 0, to: 100, loa: 100, draft: 5, cranes: 1, moves: 20, tol: 0 });
  const current = (await agent.get(url)).body;
  await agent.put(url).send({ ...manual, versions: current.versions }).expect(200);
  assert.equal((await agent.get(url).expect(200)).body.data.calls.length, 1);
  const weekly = (await agent.get('/api/berth-window?weekStart=2026-10-26')).body;
  const reset = await agent.post('/api/berth-window/reset?weekStart=2026-10-26').send({ versions: weekly.versions }).expect(200);
  const afterReset = { ...manual, calls: [] };
  assert.deepEqual(reset.body.data, afterReset);
  assert.deepEqual((await agent.get(url).expect(200)).body.data, afterReset);
});

test('database mặc định trống, khởi động lại giữ dữ liệu nhập tay và tuần đã xóa', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpc-manual-data-'));
  const config = {
    filename: path.join(directory, 'manual.sqlite'),
    adminUsername: 'admin', adminPassword: 'ManualTest@123'
  };
  let db;
  try {
    db = createDatabase(config);
    initializeSharedSettings(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM berth_window_week_datasets').get().n, 0);
    const model = new BerthWindow(db);
    const empty = model.get('2026-10-26').data;
    assert.equal(empty.terminal, '');
    assert.equal(empty.quay, null);
    assert.deepEqual(empty.berths, []);
    for (const key of ['vessels', 'calls', 'tideWindows']) assert.deepEqual(empty[key], []);
    const manual = structuredClone(empty);
    manual.vessels.push({ id: 'MANUAL-1', name: 'Tàu nhập tay', imo: '', loa: 150, dwt: 18000 });
    const settings = new BerthSettings(db);
    settings.update({ terminal: manual.terminal, quay: manual.quay, berths: manual.berths, vessels: manual.vessels }, settings.get().version, 1);
    const current = model.get('2026-10-19');
    model.update('2026-10-19', manual, 1, current.versions);
    db.close();
    db = createDatabase(config);
    const reopened = new BerthWindow(db);
    assert.deepEqual(reopened.get('2026-10-19').data, manual);
    assert.deepEqual(reopened.get('2026-10-26').data, manual);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM berth_window_week_datasets').get().n, 2);
  } finally {
    if (db?.open) db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('app không tự seed demo khi BERTH_DEMO_YEAR thiếu hoặc trống', () => {
  const previous = process.env.BERTH_DEMO_YEAR;
  try {
    for (const value of [undefined, '', '   ']) {
      if (value === undefined) delete process.env.BERTH_DEMO_YEAR;
      else process.env.BERTH_DEMO_YEAR = value;
      const app = createApp({
        databasePath: ':memory:', adminPassword: 'ManualTest@123',
        sessionSecret: 'manual-test-session-secret', secureCookie: false
      });
      try {
        assert.equal(app.locals.db.prepare('SELECT COUNT(*) AS n FROM berth_window_week_datasets').get().n, 0);
        const data = new BerthWindow(app.locals.db).get('2026-10-26').data;
        assert.equal(data.terminal, '');
        assert.equal(data.quay, null);
        assert.deepEqual(data.berths, []);
        for (const key of ['vessels', 'calls', 'tideWindows']) assert.deepEqual(data[key], []);
      } finally {
        app.locals.sessionStore.close();
        app.locals.db.close();
      }
    }
  } finally {
    if (previous === undefined) delete process.env.BERTH_DEMO_YEAR;
    else process.env.BERTH_DEMO_YEAR = previous;
  }
});
