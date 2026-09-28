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
    secureCookie: false
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
    .expect('Location', '/admin/berth-window');

  const initial = await agent.get('/api/berth-window').expect(200);
  assert.equal(initial.body.data.calls.length, 12);

  const changed = structuredClone(initial.body.data);
  changed.terminal = 'Terminal kiểm thử';
  const saved = await agent.put('/api/berth-window').send(changed).expect(200);
  assert.equal(saved.body.data.terminal, 'Terminal kiểm thử');

  const persisted = await agent.get('/api/berth-window').expect(200);
  assert.equal(persisted.body.data.terminal, 'Terminal kiểm thử');
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
