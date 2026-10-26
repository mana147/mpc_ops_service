'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/config/database');
const { buildDemoWeekData, demoWeekStarts, seedDemoBerthWeeks } = require('../src/data/demoBerthData');
const { validateBerthData } = require('../src/services/berthDataValidator');

test('dữ liệu demo phủ đủ các tuần chứa tháng 1 đến tháng 12/2026', () => {
  const weeks = demoWeekStarts(2026);
  assert.equal(weeks.length, 53);
  assert.equal(weeks[0], '2025-12-29');
  assert.equal(weeks.at(-1), '2026-12-28');

  weeks.forEach((weekStart, index) => {
    const data = validateBerthData(buildDemoWeekData(weekStart, index));
    assert.equal(data.vessels.length, 8);
    assert.ok(data.calls.length >= 3 && data.calls.length <= 5);
    assert.ok(data.calls.every(call => call.id.includes(weekStart.replaceAll('-', ''))));
  });
});

test('seed demo chỉ bổ sung mảng trống và không ghi đè dữ liệu người dùng', () => {
  const db = createDatabase({
    filename: ':memory:', adminUsername: 'admin', adminPassword: 'Demo@123', demoYear: 2026
  });
  try {
    const total = db.prepare('SELECT COUNT(*) AS total FROM berth_window_week_datasets').get().total;
    assert.equal(total, 53);

    const weekStart = '2026-06-01';
    const row = db.prepare('SELECT json_data FROM berth_window_week_datasets WHERE week_start = ?').get(weekStart);
    const changed = JSON.parse(row.json_data);
    changed.terminal = 'Dữ liệu người dùng';
    db.prepare(`UPDATE berth_window_week_datasets
      SET json_data = ?, updated_by = (SELECT id FROM users LIMIT 1)
      WHERE week_start = ?`).run(JSON.stringify(changed), weekStart);

    const emptyWeekStart = '2026-06-08';
    const emptyRow = db.prepare('SELECT json_data FROM berth_window_week_datasets WHERE week_start = ?').get(emptyWeekStart);
    const empty = JSON.parse(emptyRow.json_data);
    empty.terminal = 'Giữ cấu hình người dùng';
    empty.vessels = [];
    empty.calls = [];
    db.prepare(`UPDATE berth_window_week_datasets
      SET json_data = ?, updated_by = (SELECT id FROM users LIMIT 1)
      WHERE week_start = ?`).run(JSON.stringify(empty), emptyWeekStart);

    const result = seedDemoBerthWeeks(db, { year: 2026 });
    const preserved = JSON.parse(db.prepare(
      'SELECT json_data FROM berth_window_week_datasets WHERE week_start = ?'
    ).get(weekStart).json_data);
    const filled = JSON.parse(db.prepare(
      'SELECT json_data FROM berth_window_week_datasets WHERE week_start = ?'
    ).get(emptyWeekStart).json_data);
    assert.equal(result.updated, 1);
    assert.equal(result.preserved, 52);
    assert.equal(preserved.terminal, 'Dữ liệu người dùng');
    assert.equal(filled.terminal, 'Giữ cấu hình người dùng');
    assert.equal(filled.vessels.length, 8);
    assert.ok(filled.calls.length >= 3);
  } finally {
    db.close();
  }
});
