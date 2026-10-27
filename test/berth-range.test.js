'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const dates = require('../public/js/berth-dates');
const seed = require('./fixtures/configuredBerthData.json');

let app, agent;
before(async () => {
  app = createApp({ databasePath: ':memory:', adminPassword: 'RangeTest@123', sessionSecret: 'range-test-session-secret', secureCookie: false, demoYear: null });
  agent = request.agent(app);
  await agent.post('/login').type('form').send({ username: 'admin', password: 'RangeTest@123' }).expect(302);
});
after(() => { app.locals.sessionStore.close(); app.locals.db.close(); });

function call(id, day, hour = 8, dur = 12) {
  return { id, vessel: `Tàu ${id}`, service: null, line: '', window: null, ata: { day, hour },
    dur, from: 0, to: 100, loa: 100, draft: 5, cranes: 1, moves: 100, tol: 0 };
}
function seedWeeks(weeks) {
  app.locals.db.prepare('DELETE FROM berth_window_week_datasets').run();
  const insert = app.locals.db.prepare('INSERT INTO berth_window_week_datasets (week_start, json_data) VALUES (?, ?)');
  for (const [week, changes] of Object.entries(weeks)) insert.run(week, JSON.stringify({ ...structuredClone(seed), ...changes }));
}
const url = (start, end = start) => `/api/berth-window/range?start=${start}&end=${end}`;
const weekData = week => JSON.parse(app.locals.db.prepare('SELECT json_data FROM berth_window_week_datasets WHERE week_start = ?').get(week).json_data);

test('khoảng ngày tính cả hai đầu, kiểm tra ngày thật, năm nhuận và múi giờ Việt Nam', () => {
  assert.equal(dates.range('2026-10-01', '2026-10-01').days, 1);
  assert.equal(dates.range('2026-10-01', '2026-10-30').days, 30);
  assert.throws(() => dates.range('2026-10-01', '2026-10-31'), /1 đến 30/);
  assert.throws(() => dates.range('2026-10-02', '2026-10-01'));
  assert.throws(() => dates.range('2026-02-29', '2026-03-01'));
  assert.equal(dates.add('2028-02-28', 1), '2028-02-29');
  assert.equal(dates.add('2026-12-31', 1), '2027-01-01');
  assert.equal(dates.today(new Date('2026-10-25T18:30:00Z')), '2026-10-26');
});

test('API khoảng ngày yêu cầu đăng nhập và từ chối thiếu/ngược/quá 30 ngày', async () => {
  await request(app).get(url('2026-10-01')).expect(401);
  await request(app).put(url('2026-10-01')).send({}).expect(401);
  for (const path of [url('2026-10-01', '2026-10-31'), url('2026-10-02', '2026-10-01'), url('2026-02-30'), '/api/berth-window/range']) {
    await agent.get(path).expect(400);
    await agent.put(path).send({}).expect(400);
  }
  const result = await agent.get(url('2026-10-01', '2026-10-30')).expect(200);
  assert.equal(result.body.days, 30);
});

test('một ngày chỉ chứa lượt giao với ngày đó, kể cả lượt từ tuần trước và không lặp lịch', async () => {
  seedWeeks({
    '2026-09-28': { calls: [call('CARRY', 6, 23, 3), call('ENDS-AT-START', 6, 20, 4)] },
    '2026-10-05': { calls: [call('TODAY', 0), call('TOMORROW', 1)], tideWindows: [{ day: 0, from: 2, to: 7 }, { day: 1, from: 3, to: 6 }] }
  });
  const response = await agent.get(url('2026-10-05')).expect(200);
  assert.equal(response.body.days, 1);
  assert.deepEqual(response.body.data.calls.map(c => c.vessel).sort(), ['Tàu CARRY', 'Tàu TODAY']);
  assert.equal(response.body.data.calls.find(c => c.vessel === 'Tàu CARRY').ata.day, -1);
  assert.deepEqual(response.body.data.tideWindows, [{ day: 0, from: 2, to: 7 }]);
  const empty = await agent.get(url('2026-10-07')).expect(200);
  assert.deepEqual(empty.body.data.calls, []);
});

test('ghép nhiều tuần qua năm mới và phân biệt lượt có cùng ID', async () => {
  seedWeeks({ '2026-12-28': { calls: [call('SAME', 3)] }, '2027-01-04': { calls: [call('SAME', 0)] } });
  const { body } = await agent.get(url('2026-12-31', '2027-01-04')).expect(200);
  assert.equal(body.days, 5);
  assert.equal(new Set(body.data.calls.map(c => c.id)).size, 2);
  assert.deepEqual(body.data.calls.map(c => c.ata.day), [0, 4]);
});

test('sửa/xóa/thêm trong khoảng ghi đúng tuần và giữ nguyên lịch/triều ngoài khoảng', async () => {
  seedWeeks({
    '2026-09-28': { calls: [call('OUTSIDE', 0), call('CARRY', 6, 23, 3)] },
    '2026-10-05': { calls: [call('EDIT', 0), call('DELETE', 1), call('KEEP', 5)], tideWindows: [{ day: 5, from: 2, to: 7 }] }
  });
  const path = url('2026-10-05', '2026-10-06');
  const data = (await agent.get(path).expect(200)).body.data;
  data.calls.find(c => c.vessel === 'Tàu EDIT').moves = 999;
  data.calls.find(c => c.vessel === 'Tàu CARRY').moves = 222;
  data.calls = data.calls.filter(c => c.vessel !== 'Tàu DELETE');
  data.calls.push(call('NEW', 1));
  await agent.put(path).send(data).expect(200);
  const first = weekData('2026-09-28'), second = weekData('2026-10-05');
  assert.deepEqual(first.calls.find(c => c.id === 'OUTSIDE'), call('OUTSIDE', 0));
  assert.equal(first.calls.find(c => c.id === 'CARRY').moves, 222);
  assert.equal(first.calls.find(c => c.id === 'CARRY').ata.day, 6);
  assert.equal(second.calls.find(c => c.id === 'EDIT').moves, 999);
  assert.equal(second.calls.some(c => c.id === 'DELETE'), false);
  assert.deepEqual(second.calls.find(c => c.id === 'KEEP'), call('KEEP', 5));
  assert.equal(second.calls.find(c => c.id === 'NEW').ata.day, 1);
  assert.deepEqual(second.tideWindows, [{ day: 5, from: 2, to: 7 }]);
});

test('chuyển lượt vãng lai sang tuần khác và sao chép liên kết danh mục cần thiết', async () => {
  seedWeeks({
    '2026-09-28': { vessels: [{ id: 'V', name: 'Tàu V', loa: 100 }], calls: [{ ...call('MOVE', 6), vesselId: 'V' }] },
    '2026-10-05': { vessels: [], calls: [] }
  });
  const path = url('2026-10-04', '2026-10-06');
  const data = (await agent.get(path)).body.data;
  data.calls[0].ata.day = 2;
  await agent.put(path).send(data).expect(200);
  assert.deepEqual(weekData('2026-09-28').calls, []);
  assert.equal(weekData('2026-10-05').calls[0].ata.day, 1);
  assert.equal(weekData('2026-10-05').calls[0].vesselId, 'V');
  assert.equal(weekData('2026-10-05').vessels[0].id, 'V');
});

test('lưu thất bại ở một tuần rollback toàn bộ các tuần khác', async () => {
  seedWeeks({ '2026-09-28': { calls: [call('A', 6)] }, '2026-10-05': { calls: [call('B', 0)] } });
  const beforeA = weekData('2026-09-28'), beforeB = weekData('2026-10-05');
  const path = url('2026-10-04', '2026-10-05');
  const data = (await agent.get(path)).body.data;
  data.calls[0].moves = 999;
  data.calls[1].to = 999;
  await agent.put(path).send(data).expect(422);
  assert.deepEqual(weekData('2026-09-28'), beforeA);
  assert.deepEqual(weekData('2026-10-05'), beforeB);
});

test('đổi cấu hình không ghi đè tuần khác khi chỉ sửa lịch; cấu hình sai bị chặn bởi lịch ngoài khoảng', async () => {
  seedWeeks({
    '2026-09-28': { terminal: 'Terminal A', calls: [call('A', 6)] },
    '2026-10-05': { terminal: 'Terminal B', calls: [call('B', 0), { ...call('OUTSIDE', 6), to: 350 }] }
  });
  const path = url('2026-10-04', '2026-10-05');
  const data = (await agent.get(path)).body.data;
  data.calls[0].moves = 222;
  await agent.put(path).send(data).expect(200);
  assert.equal(weekData('2026-10-05').terminal, 'Terminal B');
  data.quay.length = 300;
  data.berths = [{ code: 'V1', from: 0, to: 300 }];
  await agent.put(path).send(data).expect(422);
  assert.equal(weekData('2026-09-28').quay.length, 380);
});

test('lưu cấu hình chung đúng phạm vi tuần và sửa danh mục không lan sang tuần trước không có lượt kéo dài', async () => {
  const vessel = { id: 'V', name: 'Tàu V', loa: 100 };
  seedWeeks({
    '2026-09-21': { vessels: [vessel] },
    '2026-09-28': { vessels: [vessel] },
    '2026-10-05': { vessels: [vessel] }
  });
  const path = url('2026-10-04', '2026-10-06');
  const data = (await agent.get(path)).body.data;
  assert.equal(data.vessels.length, 1);
  data.terminal = 'Tên tuyến mới';
  data.vessels[0].name = 'Tàu V sửa';
  await agent.put(path).send(data).expect(200);
  for (const week of ['2026-09-28', '2026-10-05']) {
    assert.equal(weekData(week).terminal, 'Tên tuyến mới');
    assert.equal(weekData(week).vessels[0].name, 'Tàu V sửa');
  }
  assert.equal(weekData('2026-09-21').vessels[0].name, 'Tàu V');
  assert.equal(weekData('2026-09-21').terminal, seed.terminal);
});
