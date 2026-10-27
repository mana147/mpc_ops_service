'use strict';

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateWeekStart(value) {
  if (typeof value !== 'string' || !WEEK_START_PATTERN.test(value)) {
    throw new Error('weekStart phải là ngày Thứ 2, định dạng YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 1) {
    throw new Error('weekStart phải là ngày Thứ 2 hợp lệ.');
  }
  return value;
}

function currentWeekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

class BerthWindow {
  constructor(db) {
    this.transaction = work => db.transaction(work)();
    this.getWeekStatement = db.prepare(`
      SELECT week_start, json_data, updated_at, updated_by
      FROM berth_window_week_datasets
      WHERE week_start = ?
    `);
    this.getLegacyStatement = db.prepare(`
      SELECT json_data, updated_at, updated_by
      FROM berth_window_datasets
      WHERE id = 1
    `);
    this.getLatestWeekStatement = db.prepare(`
      SELECT json_data, updated_at, updated_by
      FROM berth_window_week_datasets
      ORDER BY updated_at DESC, week_start DESC
      LIMIT 1
    `);
    this.weekCountStatement = db.prepare('SELECT COUNT(*) AS total FROM berth_window_week_datasets');
    this.insertWeekStatement = db.prepare(`
      INSERT INTO berth_window_week_datasets (week_start, json_data, updated_by)
      VALUES (?, ?, ?)
    `);
    this.updateWeekStatement = db.prepare(`
      UPDATE berth_window_week_datasets
      SET json_data = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
      WHERE week_start = ?
    `);
    this.createWeek = db.transaction((weekStart) => {
      const existing = this.getWeekStatement.get(weekStart);
      if (existing) return existing;

      const firstWeek = this.weekCountStatement.get().total === 0;
      const source = firstWeek ? this.getLegacyStatement.get() : this.getLatestWeekStatement.get();
      const data = JSON.parse(source.json_data);
      if (!firstWeek) {
        data.calls = [];
        data.tideWindows = [];
      }
      this.insertWeekStatement.run(weekStart, JSON.stringify(data), source.updated_by);
      return this.getWeekStatement.get(weekStart);
    });
  }

  get(weekStart = currentWeekStart()) {
    validateWeekStart(weekStart);
    const row = this.getWeekStatement.get(weekStart) || this.createWeek(weekStart);
    return {
      weekStart: row.week_start,
      data: JSON.parse(row.json_data),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by
    };
  }

  find(weekStart) {
    validateWeekStart(weekStart);
    const row = this.getWeekStatement.get(weekStart);
    return row ? { weekStart, data: JSON.parse(row.json_data) } : null;
  }

  update(weekStart, data, userId) {
    validateWeekStart(weekStart);
    this.get(weekStart);
    this.updateWeekStatement.run(JSON.stringify(data), userId, weekStart);
    return this.get(weekStart);
  }
}

module.exports = BerthWindow;
module.exports.currentWeekStart = currentWeekStart;
module.exports.validateWeekStart = validateWeekStart;
