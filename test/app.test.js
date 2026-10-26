'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

let app;
let agent;

before(() => {
  app = createApp({
    databasePath: ':memory:',
    adminUsername: 'admin',
    adminPassword: 'Test@123',
    sessionSecret: 'test-session-secret-that-is-long-enough',
    secureCookie: false,
    demoYear: null
  });
  agent = request.agent(app);
});

after(() => {
  app.locals.sessionStore.close();
  app.locals.db.close();
});

test('health check hoạt động không cần đăng nhập', async () => {
  const response = await request(app).get('/health').expect(200);
  assert.equal(response.body.status, 'ok');
});

test('asset berth window được phục vụ từ public', async () => {
  await request(app).get('/css/berth-window.css').expect(200).expect('Content-Type', /css/);
  await request(app).get('/js/berth-window.js').expect(200).expect('Content-Type', /javascript/);
});

test('API từ chối người dùng chưa đăng nhập', async () => {
  const response = await request(app).get('/api/berth-window').expect(401);
  assert.match(response.body.message, /đăng nhập/i);
});

test('đăng nhập sai trả lại lỗi chung', async () => {
  const response = await agent
    .post('/login')
    .type('form')
    .send({ username: 'admin', password: 'sai-mat-khau' })
    .expect(401);
  assert.match(response.text, /Tên đăng nhập hoặc mật khẩu không đúng/);
});

test('admin đăng nhập, đọc và lưu berth window trong SQLite', async () => {
  await agent
    .post('/login')
    .type('form')
    .send({ username: 'admin', password: 'Test@123' })
    .expect(302)
    .expect('Location', '/admin');

  const dashboard = await agent.get('/admin').expect(200);
  assert.match(dashboard.text, /Chọn công cụ vận hành/);
  assert.match(dashboard.text, /href="\/admin\/berth-window"/);

  const berthWindowPage = await agent.get('/admin/berth-window').expect(200);
  assert.match(berthWindowPage.text, /Dashboard/);
  assert.match(berthWindowPage.text, /Biểu đồ không gian - thời gian/);
  assert.match(berthWindowPage.text, /id="quaySummary"/);
  assert.doesNotMatch(berthWindowPage.text, /id="fullscreenToggle"/);
  assert.doesNotMatch(berthWindowPage.text, /Dữ liệu JSON/i);

  const initial = await agent.get('/api/berth-window').expect(200);
  assert.equal(initial.body.data.calls.length, 0);
  assert.equal(initial.body.data.quay.length, 380);
  assert.match(initial.body.weekStart, /^\d{4}-\d{2}-\d{2}$/);

  const changed = structuredClone(initial.body.data);
  changed.terminal = 'Terminal kiểm thử';
  const saved = await agent.put('/api/berth-window').send(changed).expect(200);
  assert.equal(saved.body.data.terminal, 'Terminal kiểm thử');

  const persisted = await agent.get('/api/berth-window').expect(200);
  assert.equal(persisted.body.data.terminal, 'Terminal kiểm thử');
});

test('API tách dữ liệu theo tuần và không lặp lịch tàu sang tuần mới', async () => {
  const firstWeek = '2026-10-19';
  const nextWeek = '2026-10-26';
  const first = await agent.get(`/api/berth-window?weekStart=${firstWeek}`).expect(200);
  const firstData = structuredClone(first.body.data);
  firstData.calls = [{
    id: 'WEEK-C1', vessel: 'Tàu tuần 1', service: null, line: '', window: null,
    ata: { day: 0, hour: 8 }, dur: 4, from: 0, to: 100,
    loa: 100, dwt: null, draft: 5, cranes: 1, moves: 20, tol: 0
  }];
  await agent.put(`/api/berth-window?weekStart=${firstWeek}`).send(firstData).expect(200);

  const next = await agent.get(`/api/berth-window?weekStart=${nextWeek}`).expect(200);
  assert.equal(next.body.weekStart, nextWeek);
  assert.deepEqual(next.body.data.calls, []);
  assert.deepEqual(next.body.data.tideWindows, []);
  assert.equal(next.body.data.terminal, firstData.terminal);

  const firstAgain = await agent.get(`/api/berth-window?weekStart=${firstWeek}`).expect(200);
  assert.equal(firstAgain.body.data.calls[0].id, 'WEEK-C1');
});

test('API từ chối weekStart không phải ngày Thứ 2 hợp lệ', async () => {
  const response = await agent.get('/api/berth-window?weekStart=2026-10-20').expect(400);
  assert.match(response.body.message, /Thứ 2/);
});

test('API kiểm tra cấu trúc dữ liệu trước khi lưu', async () => {
  const response = await agent
    .put('/api/berth-window')
    .send({ terminal: 'Thiếu dữ liệu' })
    .expect(422);
  assert.match(response.body.message, /berths/);
});

test('đăng xuất hủy phiên quản trị', async () => {
  await agent.post('/logout').expect(302).expect('Location', '/login');
  await agent.get('/api/berth-window').expect(401);
});
