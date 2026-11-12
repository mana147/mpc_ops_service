'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const BerthSettings = require('../src/models/BerthSettings');
const Calls = require('../public/js/berth-calls');
const seed = require('./fixtures/configuredBerthData.json');

async function fixture(t, capacity = 2) {
  const app = createApp({ databasePath: ':memory:', adminPassword: 'PlanningTest@123', sessionSecret: 'planning-test-session-secret', secureCookie: false, demoYear: null });
  t.after(() => { app.locals.sessionStore.close(); app.locals.db.close(); });
  const settings = new BerthSettings(app.locals.db), initial = settings.get();
  const data = { terminal: seed.terminal, quay: { ...seed.quay }, berths: [], vessels: [1, 2, 3].map(i => ({ id: `V${i}`, name: `Tàu ${i}`, imo: `123456${i}`, loa: 100, dwt: 12000 })) };
  if (capacity !== null) data.quay.availableCranes = capacity;
  settings.update(data, initial.version, 1);
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ username: 'admin', password: 'PlanningTest@123' }).expect(302);
  return { app, agent };
}
function call(id = 'C1', options = {}) {
  return { schemaVersion: 2, id, vesselId: 'V1', vessel: 'Tàu 1', loa: 100, dwt: 12000, imo: '1234561',
    voyageIn: '001-IN', voyageOut: '001-OUT', service: 'CIX', line: 'Hãng thử', agent: '',
    etaAt: Calls.timestamp('2026-10-19T06:00'), etaLocation: 'Vùng neo',
    plannedStartAt: Calls.timestamp('2026-10-19T08:00'), plannedEndAt: Calls.timestamp('2026-10-19T20:00'),
    commitment: null, from: 0, to: 100, berthingSide: 'port', bowDirection: 'increasing',
    arrivalDraft: 5, departureDraft: 6, cranes: 1,
    cargo: { type: 'container', unit: 'moves', total: 600, discharge: 200, load: 350, restow: 50 },
    planningStatus: 'draft', priority: 'normal', notes: '', actual: {}, ...options };
}
const weekUrl = week => `/api/berth-window?weekStart=${week}`;
async function save(agent, week, calls, status = 200) {
  const url = weekUrl(week), { body } = await agent.get(url).expect(200);
  return agent.put(url).send({ ...body.data, calls, versions: body.versions }).expect(status);
}
const raw = (app, week) => JSON.parse(app.locals.db.prepare('SELECT json_data FROM berth_window_week_datasets WHERE week_start = ?').get(week).json_data);

test('timestamp giờ Việt Nam kiểm tra ngày thật, qua năm/năm nhuận; legacy không thành actual', () => {
  assert.equal(Calls.timestamp('2026-10-19T08:00'), Date.parse('2026-10-19T01:00:00Z'));
  assert.equal(Calls.local(Date.parse('2026-12-31T18:00:00Z')), '2027-01-01T01:00');
  assert.ok(Number.isNaN(Calls.timestamp('2026-02-29T08:00')));
  assert.ok(Number.isFinite(Calls.timestamp('2028-02-29T08:00')));
  const old = { id: 'OLD', vessel: 'Tàu cũ', loa: 100, draft: 0, cranes: 1, moves: 0, from: 10, to: 120, ata: { day: 1, hour: 7.7 }, dur: 10, window: { day: 1, hour: 8, dur: 12 }, tol: 2, service: 'S', line: '', voyage: 'OLD-IN' };
  const before = structuredClone(old), converted = Calls.editable(old, '2026-10-19');
  assert.deepEqual(old, before); assert.deepEqual(converted.actual, {});
  assert.equal(converted.voyageIn, 'OLD-IN'); assert.equal(converted.arrivalDraft, null);
  assert.equal(converted.plannedStartAt, Calls.midnight('2026-10-20') + 7.7 * Calls.HOUR);
  assert.equal(converted.to - converted.from, 110); assert.equal(converted.commitment.lateToleranceHours, 2);
});

test('lưu nháp thiếu tài nguyên bằng null, mã tự sinh, không lưu ata/dur legacy và đọc lại bền vững', async t => {
  const { app, agent } = await fixture(t, null);
  const draft = call('DRAFT', { etaAt: null, etaLocation: '', arrivalDraft: null, departureDraft: null, cranes: null,
    cargo: { type: 'container', unit: 'moves', total: null, discharge: null, load: null, restow: null } });
  const saved = await save(agent, '2026-10-19', [draft]);
  const persisted = raw(app, '2026-10-19').calls[0];
  assert.match(persisted.callReference, /^BW-20261019-/); assert.equal(persisted.updatedBy, 1);
  assert.equal(persisted.cranes, null); assert.equal(persisted.cargo.total, null);
  for (const name of ['ata', 'dur', 'window']) assert.equal(Object.hasOwn(persisted, name), false);
  assert.ok(saved.body.warnings.some(w => /Chưa có ETA/.test(w.message)));
  const read = (await agent.get(weekUrl('2026-10-19'))).body.data.calls[0];
  assert.deepEqual(read, persisted);
});

test('xác nhận cần thời gian/khai báo và cấu hình năng lực, không đoán tổng cẩu', async t => {
  const { agent } = await fixture(t, null);
  const response = await save(agent, '2026-10-19', [call('NO-CAP', { planningStatus: 'confirmed' })], 422);
  assert.match(response.body.message, /tổng số cẩu/);
  const settings = (await agent.get('/api/berth-window/settings')).body;
  settings.data.quay.availableCranes = 2;
  await agent.put('/api/berth-window/settings').send(settings).expect(200);
  const valid = call('CONFIRMED', { planningStatus: 'confirmed' });
  await save(agent, '2026-10-19', [valid]);
  for (const changes of [{ etaAt: null }, { arrivalDraft: null }, { berthingSide: null }, { cranes: null }, { cranes: 999 }]) {
    await save(agent, '2026-10-19', [{ ...valid, ...changes }], 422);
  }
});

test('backend từ chối giờ sai, schema giả, mớn 0, moves thập phân, cơ cấu hoặc cửa sổ không hợp lệ', async t => {
  const { agent } = await fixture(t);
  const changes = [
    { plannedEndAt: Calls.timestamp('2026-10-19T07:00') }, { plannedStartAt: '2026-10-19T08:00' },
    { arrivalDraft: 0 }, { departureDraft: -1 }, { cranes: 0.5 }, { priority: 'high' }, { ata: { day: 0, hour: 8 } }, { schemaVersion: 3 },
    { cargo: { type: 'container', unit: 'moves', total: 0.5, discharge: null, load: null, restow: null } },
    { cargo: { type: 'container', unit: 'moves', total: 100, discharge: 20, load: null, restow: null } },
    { cargo: { type: 'container', unit: 'moves', total: 100, discharge: 20, load: 20, restow: 20 } },
    { commitment: { startAt: Calls.timestamp('2026-10-19T08:00'), endAt: Calls.timestamp('2026-10-19T07:00'), earlyToleranceHours: 0, lateToleranceHours: 0 } },
    { commitment: { startAt: Calls.timestamp('2026-10-19T08:00'), endAt: Calls.timestamp('2026-10-19T20:00'), earlyToleranceHours: -1, lateToleranceHours: 0 } }
  ];
  for (const change of changes) await save(agent, '2026-10-19', [call('INVALID', change)], 422);
});

test('sản lượng hàng rời có đơn vị riêng; lượt không làm hàng không ép cẩu và sản lượng', async t => {
  const { agent } = await fixture(t);
  const bulk = call('BULK', { cargo: { type: 'bulk', unit: 'tonnes', total: 1000.5, discharge: null, load: null, restow: null } });
  await save(agent, '2026-10-19', [bulk]);
  const noCargo = call('NONE', { planningStatus: 'confirmed', cranes: 0, cargo: { type: 'none', unit: 'units', total: null, discharge: null, load: null, restow: null } });
  await save(agent, '2026-10-19', [noCargo]);
  await save(agent, '2026-10-19', [{ ...noCargo, cargo: { ...noCargo.cargo, total: 50 } }], 422);
});

test('cửa sổ có dung sai riêng, lưu qua khoảng ngày và không biến thành vãng lai', async t => {
  const { agent } = await fixture(t);
  const win = { startAt: Calls.timestamp('2026-10-19T07:00'), endAt: Calls.timestamp('2026-10-19T22:00'), earlyToleranceHours: 0.5, lateToleranceHours: 2 };
  await save(agent, '2026-10-19', [call('WINDOW', { commitment: win })]);
  const url = '/api/berth-window/range?start=2026-10-19&end=2026-10-20';
  const current = (await agent.get(url)).body;
  current.data.calls[0].notes = 'Giữ cửa sổ';
  const result = await agent.put(url).send({ ...current.data, versions: current.versions }).expect(200);
  assert.deepEqual(result.body.data.calls[0].commitment, win);
  assert.equal(result.body.data.calls[0].voyageOut, '001-OUT');
  assert.equal(Calls.commitment(result.body.data.calls[0], '2026-10-19').late, 2);
});

test('cùng tàu không có hai lượt trùng giờ, kể cả khác vị trí và khác tuần', async t => {
  const { app, agent } = await fixture(t);
  const first = call('SUN', { plannedStartAt: Calls.timestamp('2026-10-25T23:00'), plannedEndAt: Calls.timestamp('2026-10-26T02:00') });
  await save(agent, '2026-10-19', [first]);
  const overlap = call('MON', { from: 200, to: 300, plannedStartAt: Calls.timestamp('2026-10-26T01:00'), plannedEndAt: Calls.timestamp('2026-10-26T04:00') });
  const result = await save(agent, '2026-10-26', [overlap], 422);
  assert.match(result.body.message, /Cùng một tàu/); assert.deepEqual(raw(app, '2026-10-26').calls, []);
});

test('nháp có thể cảnh báo xung đột vị trí, xác nhận bị chặn và rollback', async t => {
  const { app, agent } = await fixture(t);
  const a = call('A', { planningStatus: 'confirmed' });
  const b = call('B', { vesselId: 'V2', vessel: 'Tàu 2', imo: '1234562', from: 50, to: 150 });
  const saved = await save(agent, '2026-10-19', [a, b]);
  assert.ok(saved.body.warnings.some(w => /Xung đột/.test(w.message)));
  const before = raw(app, '2026-10-19');
  const confirmed = before.calls.map(c => ({ ...c, planningStatus: 'confirmed' }));
  const result = await save(agent, '2026-10-19', confirmed, 422);
  assert.match(result.body.message, /Xung đột cầu bến/);
  assert.deepEqual(raw(app, '2026-10-19'), before);
});

test('tổng cẩu đồng thời không vượt năng lực; hai lượt tiếp nối không bị cộng trùng', async t => {
  const { agent } = await fixture(t, 1);
  const a = call('A', { planningStatus: 'confirmed' });
  const b = call('B', { vesselId: 'V2', vessel: 'Tàu 2', imo: '1234562', planningStatus: 'confirmed', from: 150, to: 250 });
  const result = await save(agent, '2026-10-19', [a, b], 422);
  assert.match(result.body.message, /tổng nhu cầu 2 cẩu/);
  await save(agent, '2026-10-19', [a, { ...b, plannedStartAt: a.plannedEndAt, plannedEndAt: a.plannedEndAt + 5 * Calls.HOUR }]);
});

test('giảm tổng cẩu trong cấu hình kiểm tra cả lịch ngoài khoảng và giữ master nếu không hợp lệ', async t => {
  const { agent } = await fixture(t, 2);
  const a = call('A', { planningStatus: 'confirmed' });
  const b = call('B', { vesselId: 'V2', vessel: 'Tàu 2', imo: '1234562', planningStatus: 'confirmed', from: 150, to: 250 });
  await save(agent, '2026-10-19', [a, b]);
  const before = (await agent.get('/api/berth-window/settings')).body;
  await agent.put('/api/berth-window/settings').send({ version: before.version, data: { ...before.data, quay: { ...before.data.quay, availableCranes: 1 } } }).expect(422);
  assert.deepEqual((await agent.get('/api/berth-window/settings')).body, before);
});

test('lượt dài hơn 7 ngày xuất hiện từ tuần xa, sửa được qua khoảng và giữ giờ ngoài khoảng', async t => {
  const { agent } = await fixture(t);
  const long = call('LONG', { plannedStartAt: Calls.timestamp('2026-10-19T08:00'), plannedEndAt: Calls.timestamp('2026-11-20T20:00') });
  await save(agent, '2026-10-19', [long]);
  const url = '/api/berth-window/range?start=2026-11-10&end=2026-11-10';
  const current = (await agent.get(url)).body;
  assert.equal(current.data.calls.length, 1); assert.ok(Object.hasOwn(current.versions.weeks, '2026-10-19'));
  current.data.calls[0].notes = 'Đã kiểm tra lịch dài';
  await agent.put(url).send({ ...current.data, versions: current.versions }).expect(200);
  const read = (await agent.get(weekUrl('2026-10-19'))).body.data.calls[0];
  assert.equal(read.plannedStartAt, long.plannedStartAt); assert.equal(read.plannedEndAt, long.plannedEndAt);
  assert.equal(read.notes, 'Đã kiểm tra lịch dài');
});

test('chuyển tuần giữ mã lượt và thông số snapshot dù danh mục đã sửa, cập nhật metadata từ server', async t => {
  const { agent } = await fixture(t);
  await save(agent, '2026-10-19', [call('MOVE')]);
  const initial = (await agent.get(weekUrl('2026-10-19'))).body.data.calls[0];
  const settings = (await agent.get('/api/berth-window/settings')).body;
  settings.data.vessels[0].loa = 120;
  await agent.put('/api/berth-window/settings').send(settings).expect(200);
  const url = '/api/berth-window/range?start=2026-10-19&end=2026-10-26';
  const current = (await agent.get(url)).body;
  const moved = current.data.calls[0]; moved.plannedStartAt = Calls.timestamp('2026-10-26T08:00'); moved.plannedEndAt = Calls.timestamp('2026-10-26T20:00');
  moved.callReference = 'CLIENT-FORGED'; moved.updatedBy = 999;
  await agent.put(url).send({ ...current.data, versions: current.versions }).expect(200);
  const saved = (await agent.get(weekUrl('2026-10-26'))).body.data.calls[0];
  assert.equal(saved.callReference, initial.callReference); assert.equal(saved.loa, 100); assert.equal(saved.to - saved.from, 100);
  assert.equal(saved.updatedBy, 1); assert.equal(saved.createdAt, initial.createdAt);
  assert.deepEqual((await agent.get(weekUrl('2026-10-19'))).body.data.calls, []);
});

test('thời gian thực tế có thứ tự, không ở tương lai, không lấy kế hoạch làm ATA/ATB', async t => {
  const { agent } = await fixture(t);
  const confirmed = call('ACTUAL', { planningStatus: 'confirmed', commitment: { startAt: Calls.timestamp('2026-10-19T08:00'), endAt: Calls.timestamp('2026-10-19T20:00'), earlyToleranceHours: 1, lateToleranceHours: 1 } });
  await save(agent, '2026-10-19', [confirmed]);
  assert.deepEqual((await agent.get(weekUrl('2026-10-19'))).body.data.calls[0].actual, {});
  for (const actual of [{ arrivalAt: Calls.timestamp('2050-01-01T08:00') }, { berthAt: Calls.timestamp('2026-10-19T08:00'), arrivalAt: Calls.timestamp('2026-10-19T09:00') }, { departureAt: Calls.timestamp('2026-10-19T20:00') }, { operationsEndAt: Calls.timestamp('2026-10-19T18:00') }]) {
    await save(agent, '2026-10-19', [{ ...confirmed, actual }], 422);
  }
  const actual = { arrivalAt: Calls.timestamp('2026-10-19T10:00'), berthAt: Calls.timestamp('2026-10-19T11:00'), operationsStartAt: Calls.timestamp('2026-10-19T12:00'), operationsEndAt: Calls.timestamp('2026-10-19T19:00'), departureAt: Calls.timestamp('2026-10-19T20:00') };
  await save(agent, '2026-10-19', [{ ...confirmed, etaAt: null, actual }]);
  const read = (await agent.get(weekUrl('2026-10-19'))).body.data.calls[0];
  assert.deepEqual(read.actual, actual); assert.equal(Calls.phase(read), 'departed'); assert.equal(read.plannedStartAt, confirmed.plannedStartAt);
});

test('hủy lượt giải phóng vị trí và cẩu, giữ bản ghi; không cho hủy mốc thực tế đã ghi', async t => {
  const { agent } = await fixture(t);
  await save(agent, '2026-10-19', [call('CANCEL', { planningStatus: 'cancelled' }), call('NEW', { planningStatus: 'confirmed' })]);
  const result = (await agent.get(weekUrl('2026-10-19'))).body.data;
  assert.equal(result.calls.length, 2); assert.equal(Calls.cancelled(result.calls[0]), true);
  await save(agent, '2026-10-19', [call('CANCEL', { planningStatus: 'cancelled', actual: { berthAt: Calls.timestamp('2026-10-19T08:00') } })], 422);
});

test('gợi ý cửa sổ dùng lại qua các tuần, loại trùng và không lấy lượt đã hủy', async t => {
  const { agent } = await fixture(t);
  const win = { startAt: Calls.timestamp('2026-10-19T07:00'), endAt: Calls.timestamp('2026-10-19T22:00'), earlyToleranceHours: 0.5, lateToleranceHours: 2 };
  await save(agent, '2026-10-19', [call('W1', { commitment: win }), call('CANCEL-WINDOW', { commitment: win, service: 'CANCEL-SERVICE', planningStatus: 'cancelled' })]);
  const nextWindow = { ...win, startAt: win.startAt + 7 * Calls.DAY, endAt: win.endAt + 7 * Calls.DAY };
  await save(agent, '2026-10-26', [call('W2', { plannedStartAt: Calls.timestamp('2026-10-26T08:00'), plannedEndAt: Calls.timestamp('2026-10-26T20:00'), commitment: nextWindow })]);
  const response = await agent.get('/api/berth-window/range?start=2026-11-02&end=2026-11-02').expect(200);
  assert.equal(response.body.windowSuggestions.length, 1);
  const suggested = Calls.suggestWindow(response.body.windowSuggestions[0], Calls.timestamp('2026-11-02T08:00'));
  assert.equal(suggested.startAt, Calls.timestamp('2026-11-02T07:00'));
  assert.equal(suggested.endAt, Calls.timestamp('2026-11-02T22:00')); assert.equal(suggested.earlyToleranceHours, 0.5);
});
