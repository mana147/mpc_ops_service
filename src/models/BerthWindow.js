'use strict';

const BerthSettings = require('./BerthSettings');
const { conflict } = BerthSettings;
const { validateBerthData } = require('../services/berthDataValidator');
const { scheduling } = require('../services/berthCallValidator');
const calls = require('../../public/js/berth-calls');
const dates = require('../../public/js/berth-dates');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');

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
    this.db = db;
    this.settings = new BerthSettings(db);
    this.transaction = work => db.transaction(work)();
    this.getWeekStatement = db.prepare(`
      SELECT week_start, json_data, updated_at, updated_by, revision
      FROM berth_window_week_datasets
      WHERE week_start = ?
    `);
    this.insertWeekStatement = db.prepare(`
      INSERT INTO berth_window_week_datasets (week_start, json_data, updated_by)
      VALUES (?, ?, ?)
    `);
    this.updateWeekStatement = db.prepare(`
      UPDATE berth_window_week_datasets
      SET json_data = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?, revision = revision + 1
      WHERE week_start = ?
    `);
    this.createWeek = db.transaction((weekStart) => {
      const existing = this.getWeekStatement.get(weekStart);
      if (existing) return existing;

      this.insertWeekStatement.run(weekStart, JSON.stringify({ calls: [], tideWindows: [] }), null);
      return this.getWeekStatement.get(weekStart);
    });
  }

  get(weekStart = currentWeekStart()) {
    return this.db.inTransaction ? this.read(weekStart) : this.transaction(() => this.read(weekStart));
  }

  read(weekStart) {
    validateWeekStart(weekStart);
    const row = this.getWeekStatement.get(weekStart) || this.createWeek(weekStart);
    return {
      weekStart: row.week_start,
      data: this.settings.compose(JSON.parse(row.json_data)),
      versions: this.versions([weekStart]),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by
    };
  }

  find(weekStart) {
    validateWeekStart(weekStart);
    const row = this.getWeekStatement.get(weekStart);
    return row ? { weekStart, data: this.settings.compose(JSON.parse(row.json_data)) } : null;
  }

  versions(weeks) {
    return { settings: this.settings.get().version, weeks: Object.fromEntries(weeks.map(week => [week, this.getWeekStatement.get(week)?.revision ?? null])) };
  }

  assertVersions(expected, weeks) {
    const current = this.versions(weeks);
    if (!expected || expected.settings !== current.settings ||
        weeks.some(week => expected.weeks?.[week] !== current.weeks[week])) throw conflict();
  }

  validateCallChanges(data, previous) {
    const vessels = this.settings.get().data.vessels;
    for (const call of data.calls) {
      if (!call.vesselId) continue;
      const vessel = vessels.find(v => v.id === call.vesselId);
      const original = previous.calls.find(c => c.id === call.id);
      if (vessel?.active === false && (!original || original.vesselId !== call.vesselId)) {
        throw new Error(`Tàu ${vessel.name} đã ngừng sử dụng; không thể tạo liên kết lượt mới.`);
      }
    }
  }

  records() {
    return this.db.prepare('SELECT week_start, json_data FROM berth_window_week_datasets ORDER BY week_start').all()
      .flatMap(row => JSON.parse(row.json_data).calls.map(call => ({ week: row.week_start, call })));
  }

  warnings(keys) {
    return scheduling(this.records(), keys, this.settings.get().data.quay || { safetyGap: 0 }, { strict: false });
  }

  windowSuggestions() {
    const templates = new Map();
    for (const { week, call } of this.records()) {
      if (calls.cancelled(call)) continue;
      const window = calls.commitment(call, week);
      if (!window || !call.service) continue;
      const startAt = calls.midnight(week) + window.start * calls.HOUR;
      const local = calls.local(startAt), date = local.slice(0, 10);
      const template = { service: call.service, line: call.line, weekday: dates.weekday(date),
        startHour: (startAt - calls.midnight(date)) / calls.HOUR, durationHours: window.end - window.start,
        earlyToleranceHours: window.early, lateToleranceHours: window.late };
      const id = createHash('sha256').update(JSON.stringify(template)).digest('hex').slice(0, 16);
      templates.set(id, { id, ...template });
    }
    return [...templates.values()];
  }

  validateSchedules(snapshots, changedKeys, userId, origins = new Map()) {
    const original = this.records(), byKey = new Map(original.map(r => [`${r.week}:${r.call.id}`, r.call]));
    const master = this.settings.get().data;
    for (const [week, data] of snapshots) {
      for (const call of data.calls) {
        if (!changedKeys.has(`${week}:${call.id}`) || !calls.isNew(call)) continue;
        const key = `${week}:${call.id}`;
        const previous = byKey.get(origins.get(key) || key);
        const vessel = master.vessels.find(v => v.id === call.vesselId);
        if (!vessel && (!previous || previous.vesselId)) throw new Error('Lượt mới cần chọn tàu trong danh mục.');
        const dimensions = previous && previous.vesselId === call.vesselId ? previous : vessel;
        if (dimensions) for (const name of ['loa', 'dwt', 'imo', 'beam']) {
          if (dimensions[name] !== undefined) call[name] = dimensions[name];
          else delete call[name];
        }
        if (dimensions) call.vessel = dimensions.name || dimensions.vessel;
        const localDate = calls.local(call.plannedStartAt).slice(0, 10);
        if (dates.monday(localDate) !== week) throw new Error('Tuần lưu phải chứa ngày cập cầu kế hoạch.');
        call.callReference = previous?.callReference || `BW-${localDate.replaceAll('-', '')}-${createHash('sha256').update(call.id).digest('hex').slice(0, 10).toUpperCase()}`;
        call.createdAt = previous ? previous.createdAt ?? null : Date.now();
        call.createdBy = previous ? previous.createdBy ?? null : userId;
        call.updatedAt = Date.now(); call.updatedBy = userId;
      }
      validateBerthData(this.settings.compose(data));
    }
    const records = [...original.filter(r => !snapshots.has(r.week)), ...[...snapshots].flatMap(([week, data]) => data.calls.map(call => ({ week, call })))];
    const references = new Set();
    for (const { call } of records) if (call.callReference) {
      if (references.has(call.callReference)) throw new Error('Mã lượt tàu bị trùng.');
      references.add(call.callReference);
    }
    return scheduling(records, changedKeys, master.quay || { safetyGap: 0 });
  }

  saveSchedule(weekStart, data, userId) {
    validateWeekStart(weekStart);
    this.get(weekStart);
    validateBerthData(this.settings.compose(data));
    this.updateWeekStatement.run(JSON.stringify({ calls: data.calls, tideWindows: data.tideWindows }), userId, weekStart);
    return this.get(weekStart);
  }

  update(weekStart, data, userId, versions) {
    return this.transaction(() => {
      validateWeekStart(weekStart);
      validateBerthData(data);
      this.assertVersions(versions, [weekStart]);
      this.settings.assertUnchanged(data);
      const previous = this.get(weekStart).data;
      this.validateCallChanges(data, previous);
      const changedKeys = new Set(data.calls.filter(call => !isDeepStrictEqual(call, previous.calls.find(old => old.id === call.id))).map(call => `${weekStart}:${call.id}`));
      const warnings = this.validateSchedules(new Map([[weekStart, data]]), changedKeys, userId);
      return { ...this.saveSchedule(weekStart, data, userId), warnings };
    });
  }
}

module.exports = BerthWindow;
module.exports.currentWeekStart = currentWeekStart;
module.exports.validateWeekStart = validateWeekStart;
