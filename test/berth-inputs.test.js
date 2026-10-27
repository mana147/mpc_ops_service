'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { validateBerthData } = require('../src/services/berthDataValidator');
const domain = require('../public/js/berth-domain');
const seed = require('./fixtures/configuredBerthData.json');
const emptySeed = require('../src/data/seedBerthData');
const legacy = require('./fixtures/legacyBerthData.json');

function dataset() {
  const data = structuredClone(seed);
  data.berths = [{ code: 'V1', from: 0, to: 120 }, { code: 'V2', from: 120, to: 380 }];
  data.vessels = [{ id: 'V001', name: 'Tàu thử nghiệm', imo: '1234567', loa: 225, dwt: 40000 }];
  data.calls = [{ id: 'C1', vesselId: 'V001', vessel: 'Tàu thử nghiệm', voyage: '001',
    service: null, line: '', window: null, ata: { day: 0, hour: 8 }, dur: 12,
    from: 20, to: 245, loa: 225, dwt: 40000, draft: 8, cranes: 2, moves: 100, tol: 0 }];
  return data;
}

test('cấu hình mới 380 m và bố trí tàu qua ranh giới cầu ảo', () => {
  assert.equal(validateBerthData(seed).quay.length, 380);
  assert.equal(validateBerthData(dataset()).calls[0].to, 245);
  assert.deepEqual(domain.warnings(dataset().calls[0], seed.quay), []);
});

test('từ chối vượt tuyến, chồng lấn, mã cầu trùng và liên kết tàu sai', () => {
  const variants = [
    d => { d.calls[0].to = 381; },
    d => { d.quay.length = 200; },
    d => { d.berths[1].from = 119; },
    d => { d.berths[1].code = 'V1'; },
    d => { d.calls[0].vesselId = 'missing'; },
    d => { d.calls[0].to = 200; },
    d => { d.vessels.push({ ...d.vessels[0], id: 'V002' }); },
    d => { d.vessels[0].loa = 0; },
    d => { d.vessels[0].dwt = -1; },
    d => { d.quay.physicalBerthCount = 1.5; }
  ];
  for (const change of variants) { const data = dataset(); change(data); assert.throws(() => validateBerthData(data)); }
});

test('vượt năng lực công bố chỉ cảnh báo, DWT thiếu không được suy diễn', () => {
  const data = dataset();
  data.calls[0].loa = 226;
  data.calls[0].to = 246;
  data.calls[0].dwt = 41000;
  validateBerthData(data);
  assert.equal(domain.warnings(data.calls[0], data.quay).length, 2);
  assert.deepEqual(domain.warnings({ loa: 225 }, data.quay), ['Chưa cung cấp DWT.']);
});

test('snapshot cũ giữ nguyên và suy ra chiều dài từ dữ liệu đang có', () => {
  const original = JSON.stringify(legacy);
  validateBerthData(legacy);
  assert.equal(domain.quay(legacy).length, 900);
  assert.equal(domain.quay(legacy).maxLoa, null);
  assert.equal(JSON.stringify(legacy), original);
});

test('sơ đồ 2D lọc đúng tàu theo thời điểm và tách làn khi thiếu khoảng an toàn', () => {
  const calls = [
    { id: 'A', ata: { day: 0, hour: 8 }, dur: 4, from: 0, to: 100 },
    { id: 'B', ata: { day: 0, hour: 9 }, dur: 2, from: 110, to: 180 },
    { id: 'C', ata: { day: 0, hour: 12 }, dur: 2, from: 200, to: 260 }
  ];
  const active = domain.activeCallsAt(calls, 10);
  assert.deepEqual(active.map(call => call.id), ['A', 'B']);
  assert.deepEqual(domain.berthLanes(active, 25).map(item => item.lane), [0, 1]);
  assert.deepEqual(domain.activeCallsAt(calls, 12).map(call => call.id), ['C']);
});

test('sơ đồ 2D mô phỏng tàu cập và rời bến trong khoảng chuyển tiếp', () => {
  const call = { ata: { day: 0, hour: 8 }, dur: 4 };
  assert.equal(domain.berthMotionAt(call, 6.99), null);
  assert.deepEqual(domain.berthMotionAt(call, 7.5), { phase: 'approaching', progress: 0.5 });
  assert.deepEqual(domain.berthMotionAt(call, 8), { phase: 'berthed', progress: 1 });
  assert.deepEqual(domain.berthMotionAt(call, 12.5), { phase: 'departing', progress: 0.5 });
  assert.equal(domain.berthMotionAt(call, 13), null);
});

test('API lưu và đọc lại cấu hình, danh mục, lượt tàu; lỗi không thay dữ liệu đã lưu', async t => {
  const app = createApp({ databasePath: ':memory:', adminPassword: 'InputTest@123', sessionSecret: 'input-test-session-secret', secureCookie: false, demoYear: null });
  t.after(() => { app.locals.sessionStore.close(); app.locals.db.close(); });
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ username: 'admin', password: 'InputTest@123' }).expect(302);
  const page = await agent.get('/admin/berth-window').expect(200);
  for (const id of ['quayForm', 'vesselForm', 'callForm']) assert.match(page.text, new RegExp(`id="${id}"`));
  const data = dataset();
  const api = '/api/berth-window?weekStart=2026-10-19';
  await agent.put(api).send(data).expect(200);
  const persisted = await agent.get(api).expect(200);
  assert.deepEqual(persisted.body.data, data);
  const invalid = structuredClone(data); invalid.quay.length = 200;
  await agent.put(api).send(invalid).expect(422);
  assert.deepEqual((await agent.get(api)).body.data, data);
  // Vượt ngưỡng vẫn lưu để người lập kế hoạch kiểm tra điều kiện tiếp nhận.
  data.vessels[0].dwt = 41000;
  await agent.put(api).send(data).expect(200);
  const reset = await agent.post('/api/berth-window/reset?weekStart=2026-10-19').send({}).expect(200);
  assert.deepEqual(reset.body.data, emptySeed);
});
