'use strict';

const { createHash } = require('node:crypto');
const { validateBerthData } = require('./berthDataValidator');

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_KEY = 'berth_window_datasets:1';

function weekBounds(weekStart) {
  const date = typeof weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
    ? new Date(`${weekStart}T00:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== weekStart || date.getUTCDay() !== 1) {
    throw new Error('weekStart phải là ngày Thứ 2 hợp lệ, định dạng YYYY-MM-DD.');
  }
  return {
    // Legacy chỉ có giờ Việt Nam; không phụ thuộc timezone của máy chạy CLI.
    startAt: Date.parse(`${weekStart}T00:00:00+07:00`),
    nextWeek: new Date(date.getTime() + 7 * DAY_MS).toISOString().slice(0, 10)
  };
}

function importLegacyBerthData(db, { weekStart }) {
  const { startAt, nextWeek } = weekBounds(weekStart);
  return db.transaction(() => {
    const source = db.prepare('SELECT json_data, updated_at, updated_by FROM berth_window_datasets WHERE id = 1').get();
    if (!source) throw new Error('Không tìm thấy JSON snapshot id = 1.');
    const sha256 = createHash('sha256').update(source.json_data).digest('hex');
    const existing = db.prepare('SELECT * FROM berth_legacy_imports WHERE source_key = ?').get(SOURCE_KEY);
    if (existing) {
      if (existing.source_sha256 !== sha256 || existing.week_start !== weekStart) {
        throw new Error('Snapshot này đã được import. Không ghi đè bản đã import hoặc tự lặp lại cho tuần khác.');
      }
      return { imported: false, planId: existing.plan_id, weekStart };
    }

    const data = validateBerthData(JSON.parse(source.json_data));
    for (const call of data.calls) {
      if (!Number.isInteger(call.moves) || call.loa <= 0) {
        throw new Error(`Call ${call.id}: moves phải là số nguyên và LOA phải lớn hơn 0.`);
      }
      if (call.window && !call.service?.trim()) {
        throw new Error(`Call ${call.id}: window cần có mã service.`);
      }
    }
    const minutes = hours => Math.round(hours * 60);
    const timestamp = (day, hour) => startAt + (day * 1440 + minutes(hour)) * 60000;
    const insert = (sql, values) => Number(db.prepare(sql).run(...values).lastInsertRowid);

    const terminalId = insert(`INSERT INTO terminals (code, name) VALUES (?, ?)`, ['LEGACY-T1', data.terminal]);
    const quayLength = Math.max(...data.berths.map(berth => berth.to));
    const quayId = insert(`INSERT INTO quays (terminal_id, code, name, length_m) VALUES (?, ?, ?, ?)`,
      [terminalId, 'Q1', 'Tuyến cầu import từ JSON', quayLength]);
    for (const berth of data.berths) {
      insert(`INSERT INTO berth_sections (quay_id, code, quay_from_m, quay_to_m) VALUES (?, ?, ?, ?)`,
        [quayId, berth.code, berth.from, berth.to]);
    }
    for (const tide of data.tideWindows) {
      insert(`INSERT INTO tide_windows (terminal_id, starts_at, ends_at, source, note) VALUES (?, ?, ?, ?, ?)`,
        [terminalId, timestamp(tide.day, tide.from), timestamp(tide.day, tide.to), 'legacy-demo',
          'Khung hiển thị từ JSON; chưa xác nhận độ sâu hoặc điều kiện hàng hải.']);
    }
    const planId = insert(`INSERT INTO berth_plans
      (terminal_id, week_start, version, safety_gap_m, change_reason, created_by) VALUES (?, ?, 1, 25, ?, ?)`,
      [terminalId, weekStart, 'Import JSON legacy; cần rà soát nghiệp vụ trước khi publish.', source.updated_by]);

    // Chỉ gom các bản ghi giống hệt trong snapshot này; tên tàu không phải định danh toàn cục.
    const vessels = new Map();
    const services = new Map();
    for (const call of data.calls) {
      const vesselKey = JSON.stringify([call.vessel, call.loa]);
      if (!vessels.has(vesselKey)) {
        vessels.set(vesselKey, insert('INSERT INTO vessels (name, loa_m) VALUES (?, ?)', [call.vessel, call.loa]));
      }
      const serviceCode = call.service?.trim() || null;
      if (serviceCode && !services.has(serviceCode)) {
        services.set(serviceCode, insert('INSERT INTO services (terminal_id, code, name) VALUES (?, ?, ?)',
          [terminalId, serviceCode, serviceCode]));
      }
      const serviceId = serviceCode ? services.get(serviceCode) : null;
      const callId = insert(`INSERT INTO vessel_calls
        (terminal_id, call_code, vessel_id, service_id, declared_draft_m, expected_moves, legacy_call_id, legacy_line_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [terminalId, `${call.id}@${weekStart}`, vessels.get(vesselKey), serviceId, call.draft, call.moves, call.id, call.line]);

      let windowId = null;
      let windowStart = null;
      let windowEnd = null;
      if (call.window) {
        const startMinutes = minutes(call.window.hour);
        const weekday = (call.window.day + Math.floor(startMinutes / 1440)) % 7;
        windowId = insert(`INSERT INTO berth_windows
          (terminal_id, service_id, quay_id, weekday, start_minute, duration_minutes, quay_from_m, quay_to_m,
           tolerance_early_min, tolerance_late_min, valid_from, valid_to, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [terminalId, serviceId, quayId, weekday, startMinutes % 1440, minutes(call.window.dur), call.from, call.to,
            minutes(call.tol), minutes(call.tol), weekStart, nextWeek, 'legacy-import']);
        windowStart = timestamp(call.window.day, call.window.hour);
        windowEnd = windowStart + minutes(call.window.dur) * 60000;
      }
      const plannedStart = timestamp(call.ata.day, call.ata.hour);
      insert(`INSERT INTO berth_plan_items
        (terminal_id, plan_id, vessel_call_id, quay_id, berth_window_id, window_start_at, window_end_at,
         planned_start_at, planned_end_at, quay_from_m, quay_to_m, crane_count, planned_moves)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [terminalId, planId, callId, quayId, windowId, windowStart, windowEnd,
          plannedStart, plannedStart + minutes(call.dur) * 60000, call.from, call.to, call.cranes, call.moves]);
    }
    db.prepare(`INSERT INTO berth_legacy_imports
      (source_key, source_sha256, week_start, plan_id, source_updated_at, source_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(SOURCE_KEY, sha256, weekStart, planId, source.updated_at, source.json_data);
    const violations = db.pragma('foreign_key_check');
    if (violations.length) throw new Error('Import tạo dữ liệu vi phạm khóa ngoại.');
    return { imported: true, planId, weekStart, terminalId, vessels: vessels.size, services: services.size,
      calls: data.calls.length, tideWindows: data.tideWindows.length };
  })();
}

module.exports = { importLegacyBerthData, weekBounds };
