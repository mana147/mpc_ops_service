'use strict';

const { isDeepStrictEqual } = require('node:util');
const { validateBerthData } = require('../services/berthDataValidator');
const { scheduling } = require('../services/berthCallValidator');

function conflict(message = 'Dữ liệu đã thay đổi. Vui lòng tải lại trang trước khi lưu.') {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function settingsData(data) {
  return { terminal: data.terminal, quay: data.quay, berths: data.berths, vessels: data.vessels || [] };
}

class BerthSettings {
  constructor(db) {
    this.db = db;
    if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'berth_shared_settings'").get() ||
        !db.prepare('SELECT 1 FROM berth_shared_settings WHERE id = 1').get()) {
      throw new Error('Cần chạy npm run db:shared-config trước khi khởi động ứng dụng.');
    }
  }

  get() {
    return this.db.inTransaction ? this.read() : this.db.transaction(() => this.read())();
  }

  read() {
    const meta = this.db.prepare('SELECT * FROM berth_shared_settings WHERE id = 1').get();
    const terminal = meta.terminal_id ? this.db.prepare('SELECT * FROM terminals WHERE id = ?').get(meta.terminal_id) : null;
    const quay = meta.quay_id ? this.db.prepare('SELECT * FROM quays WHERE id = ?').get(meta.quay_id) : null;
    const data = {
      terminal: terminal?.name || '',
      quay: quay ? {
        length: quay.length_m, safetyGap: terminal.default_safety_gap_m,
        physicalBerthCount: quay.physical_berth_count, depth: quay.depth, depthDatum: quay.depth_datum,
        turningBasin: quay.turning_basin, turningBasinMeasurement: quay.turning_basin_measurement,
        maxLoa: quay.max_loa_m, maxDwt: quay.max_dwt, capacitySource: quay.capacity_source,
        ...(quay.available_cranes == null ? {} : { availableCranes: quay.available_cranes })
      } : null,
      berths: quay ? this.db.prepare('SELECT code, quay_from_m AS "from", quay_to_m AS "to" FROM berth_sections WHERE quay_id = ? ORDER BY quay_from_m, id').all(quay.id) : [],
      vessels: this.db.prepare('SELECT * FROM vessels WHERE external_id IS NOT NULL ORDER BY id').all().map(v => ({
        id: v.external_id, name: v.name, imo: v.imo || '', loa: v.loa_m, dwt: v.dwt,
        ...(v.beam_m == null ? {} : { beam: v.beam_m }),
        ...(v.active ? {} : { active: false })
      }))
    };
    return { version: meta.version, updatedAt: meta.updated_at, updatedBy: meta.updated_by, data };
  }

  compose(schedule, data = this.get().data) {
    return { ...structuredClone(data), calls: structuredClone(schedule.calls || []), tideWindows: structuredClone(schedule.tideWindows || []) };
  }

  assertUnchanged(candidate) {
    if (!isDeepStrictEqual(settingsData(candidate), this.get().data)) {
      throw conflict('Cấu hình hoặc danh mục đã khác. Tải lại trang; sửa dữ liệu dùng chung tại Cấu hình Berth Window.');
    }
  }

  validate(candidate) {
    if (!candidate || !Array.isArray(candidate.vessels)) throw new Error('Thiếu cấu hình hoặc danh mục tàu.');
    validateBerthData(this.compose({ calls: [], tideWindows: [] }, candidate));
    for (const vessel of candidate.vessels) {
      if (vessel.active !== undefined && typeof vessel.active !== 'boolean') throw new Error('Trạng thái sử dụng tàu không hợp lệ.');
    }
    const current = this.get().data;
    if (current.quay && !candidate.quay) throw new Error('Không thể xóa tuyến cầu đã cấu hình.');
    for (const vessel of current.vessels) {
      if (!candidate.vessels.some(v => v.id === vessel.id)) throw new Error(`Giữ tàu ${vessel.name} trong danh mục; dùng Ngừng sử dụng thay cho xóa.`);
    }
    // Kiểm tra cả những tuần không hiện trên biểu đồ; không sửa snapshot của từng lượt.
    for (const row of this.db.prepare('SELECT week_start, json_data FROM berth_window_week_datasets').all()) {
      const schedule = JSON.parse(row.json_data);
      try { validateBerthData(this.compose(schedule, candidate)); }
      catch (error) {
        const index = error.message.match(/calls\[(\d+)\]/)?.[1];
        const call = index === undefined ? '' : `, lượt ${schedule.calls[index]?.id}`;
        throw new Error(`Tuần ${row.week_start}${call}: ${error.message}`);
      }
    }
    return candidate;
  }

  write(data, userId) {
    const db = this.db;
    const meta = db.prepare('SELECT * FROM berth_shared_settings WHERE id = 1').get();
    if (data.quay) {
      let terminalId = meta.terminal_id;
      if (!terminalId) terminalId = Number(db.prepare('INSERT INTO terminals (code, name) VALUES (?, ?)').run('MPC-SHARED', data.terminal).lastInsertRowid);
      db.prepare('UPDATE terminals SET name = ?, default_safety_gap_m = ? WHERE id = ?').run(data.terminal, data.quay.safetyGap, terminalId);
      let quayId = meta.quay_id;
      // Xóa đoạn cũ trước khi giảm chiều dài; các lịch đã được validate ở trên.
      if (quayId) db.prepare('DELETE FROM berth_sections WHERE quay_id = ?').run(quayId);
      if (!quayId) quayId = Number(db.prepare('INSERT INTO quays (terminal_id, code, name, length_m) VALUES (?, ?, ?, ?)').run(terminalId, 'Q1', data.terminal, data.quay.length).lastInsertRowid);
      const q = data.quay;
      db.prepare(`UPDATE quays SET name = ?, length_m = ?, physical_berth_count = ?, depth = ?, depth_datum = ?,
        turning_basin = ?, turning_basin_measurement = ?, max_loa_m = ?, max_dwt = ?, capacity_source = ?, available_cranes = ? WHERE id = ?`)
        .run(data.terminal, q.length, q.physicalBerthCount, q.depth ?? null, q.depthDatum, q.turningBasin ?? null,
          q.turningBasinMeasurement, q.maxLoa ?? null, q.maxDwt ?? null, q.capacitySource, q.availableCranes ?? null, quayId);
      for (const b of [...data.berths].sort((a, b) => a.from - b.from)) {
        db.prepare('INSERT INTO berth_sections (quay_id, code, quay_from_m, quay_to_m) VALUES (?, ?, ?, ?)').run(quayId, b.code, b.from, b.to);
      }
      db.prepare('UPDATE berth_shared_settings SET terminal_id = ?, quay_id = ? WHERE id = 1').run(terminalId, quayId);
    }
    for (const v of data.vessels) {
      db.prepare(`INSERT INTO vessels (external_id, name, imo, loa_m, dwt, active, beam_m) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_id) DO UPDATE SET name = excluded.name, imo = excluded.imo,
        loa_m = excluded.loa_m, dwt = excluded.dwt, active = excluded.active, beam_m = excluded.beam_m`)
        .run(v.id, v.name, v.imo || null, v.loa, v.dwt ?? null, v.active === false ? 0 : 1, v.beam ?? null);
    }
    db.prepare('UPDATE berth_shared_settings SET version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = 1').run(userId ?? null);
  }

  update(data, version, userId) {
    return this.db.transaction(() => {
      if (!Number.isInteger(version) || version !== this.get().version) throw conflict();
      this.validate(data);
      const previous = this.get().data;
      if (previous.quay?.availableCranes !== data.quay?.availableCranes || previous.quay?.safetyGap !== data.quay?.safetyGap) {
        const records = this.db.prepare('SELECT week_start, json_data FROM berth_window_week_datasets').all()
          .flatMap(row => JSON.parse(row.json_data).calls.map(call => ({ week: row.week_start, call })));
        scheduling(records, new Set(records.map(r => `${r.week}:${r.call.id}`)), data.quay || { safetyGap: 0 });
      }
      this.write(data, userId);
      return { message: 'Đã lưu dữ liệu dùng chung cho toàn bộ lịch Berth Window.', ...this.get() };
    }).immediate();
  }
}

module.exports = BerthSettings;
module.exports.settingsData = settingsData;
module.exports.conflict = conflict;
