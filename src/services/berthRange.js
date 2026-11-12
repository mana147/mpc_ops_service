'use strict';

const dates = require('../../public/js/berth-dates');
const { validateBerthData } = require('./berthDataValidator');
const { isDeepStrictEqual } = require('node:util');
const calls = require('../../public/js/berth-calls');

// Phép chiếu lịch nhiều tuần; cấu hình/danh mục luôn lấy từ nguồn dùng chung.
class BerthRange {
  constructor(model) { this.model = model; }

  project(start, end) {
    const range = dates.range(start, end);
    const weeks = new Map();
    const first = dates.monday(start), last = dates.monday(end);
    for (let week = first; week <= last; week = dates.add(week, 7)) weeks.set(week, this.model.get(week).data);
    const previous = dates.add(first, -7);
    const previousData = this.model.find(previous);
    if (previousData) weeks.set(previous, previousData.data);
    // Timestamp tuyệt đối hỗ trợ lượt dài hơn một tuần, không chỉ nhìn tuần liền trước.
    for (const record of this.model.records()) if (record.week < first && !weeks.has(record.week)) {
      const plan = calls.timing(record.call, record.week);
      if (plan.startAt < calls.midnight(dates.add(end, 1)) && plan.endAt > calls.midnight(start)) weeks.set(record.week, this.model.find(record.week).data);
    }
    const data = this.model.settings.compose({ calls: [], tideWindows: [] });
    const callSources = new Map();
    for (const [week, snapshot] of weeks) {
      const offset = dates.diff(start, week);
      for (const call of snapshot.calls) {
        const plan = calls.timing(call, week);
        if (plan.startAt >= calls.midnight(dates.add(end, 1)) || plan.endAt <= calls.midnight(start)) continue;
        const id = `${week}:${call.id}`;
        callSources.set(id, { week, id: call.id });
        data.calls.push(calls.isNew(call) ? { ...structuredClone(call), id } : { ...structuredClone(call), id,
          ata: { ...call.ata, day: call.ata.day + offset },
          window: call.window ? { ...call.window, day: call.window.day + offset } : null });
      }
      if (week >= first) for (const tide of snapshot.tideWindows) {
        const day = tide.day + offset;
        if (day >= 0 && day < range.days) data.tideWindows.push({ ...tide, day });
      }
    }
    const versions = this.model.versions([...new Set([...weeks.keys(), previous])]);
    return { range, data, weeks, callSources, versions };
  }

  get(start, end) {
    return this.model.transaction(() => {
      const { range, data, versions } = this.project(start, end);
      const keys = new Set(data.calls.map(call => call.id));
      const warnings = this.model.warnings(keys);
      return { ...range, data, versions, warnings, windowSuggestions: this.model.windowSuggestions() };
    });
  }

  update(start, end, candidate, userId) {
    return this.model.transaction(() => {
      const view = this.project(start, end);
      if (!candidate || !Array.isArray(candidate.calls) || !Array.isArray(candidate.vessels) || !Array.isArray(candidate.tideWindows)) {
        throw new Error('Thiếu dữ liệu khoảng ngày.');
      }
      this.model.assertVersions(candidate.versions, Object.keys(view.versions.weeks));
      this.model.settings.assertUnchanged(candidate);
      this.model.validateCallChanges(candidate, view.data);
      const changed = new Set();
      const changedKeys = new Set();
      const origins = new Map();
      const snapshots = new Map([...view.weeks].map(([week, data]) => [week, structuredClone(data)]));
      const snapshotFor = week => {
        if (!snapshots.has(week)) snapshots.set(week, this.model.get(week).data);
        return snapshots.get(week);
      };
      const seen = new Set();
      for (const call of candidate.calls) {
        if (!call || typeof call.id !== 'string' || seen.has(call.id)) throw new Error('ID lượt tàu thiếu hoặc trùng.');
        seen.add(call.id);
        const original = view.data.calls.find(c => c.id === call.id);
        if (isDeepStrictEqual(call, original)) continue;
        const startAt = calls.timing(call, start).startAt;
        const originalStart = original ? calls.timing(original, start).startAt : null;
        if (!Number.isFinite(startAt)) throw new Error('Ngày bắt đầu lượt tàu không hợp lệ.');
        if (startAt < calls.midnight(start) || startAt >= calls.midnight(dates.add(end, 1))) {
          if (!original || startAt !== originalStart) throw new Error('Ngày bắt đầu phải nằm trong khoảng đang chọn.');
        }
        const source = view.callSources.get(call.id);
        const week = dates.monday(calls.local(startAt).slice(0, 10));
        const snapshot = snapshotFor(week);
        const id = source?.id || call.id;
        if (snapshot.calls.some(c => c.id === id && !(source?.week === week && c.id === source.id))) throw new Error('ID lượt tàu đã tồn tại trong tuần đích.');
        if (source) {
          const old = snapshotFor(source.week);
          old.calls = old.calls.filter(c => c.id !== source.id);
          changed.add(source.week);
        }
        const offset = dates.diff(start, week);
        snapshot.calls.push(calls.isNew(call) ? { ...structuredClone(call), id } : { ...structuredClone(call), id, ata: { ...call.ata, day: call.ata.day - offset },
          window: call.window ? { ...call.window, day: call.window.day - offset } : null });
        changedKeys.add(`${week}:${id}`);
        if (source) origins.set(`${week}:${id}`, `${source.week}:${source.id}`);
        changed.add(week);
      }
      for (const [id, source] of view.callSources) if (!seen.has(id)) {
        const snapshot = snapshotFor(source.week);
        snapshot.calls = snapshot.calls.filter(c => c.id !== source.id);
        changed.add(source.week);
      }
      if (!isDeepStrictEqual(candidate.tideWindows, view.data.tideWindows)) throw new Error('Không thể sửa khung triều qua khoảng ngày.');
      for (const week of changed) validateBerthData(snapshotFor(week));
      const changedSnapshots = new Map([...changed].map(week => [week, snapshotFor(week)]));
      const warnings = this.model.validateSchedules(changedSnapshots, changedKeys, userId, origins);
      for (const week of changed) this.model.saveSchedule(week, snapshotFor(week), userId);
      return { message: warnings.length ? 'Đã lưu bản nháp/kế hoạch; xem các cảnh báo kèm theo.' : 'Đã lưu dữ liệu cho khoảng ngày đang chọn.', warnings, ...this.get(start, end) };
    });
  }
}

module.exports = BerthRange;
