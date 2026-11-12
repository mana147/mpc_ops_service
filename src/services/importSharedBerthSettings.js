'use strict';

const { isDeepStrictEqual } = require('node:util');
const { migrateDatabase } = require('../database/migrate');
const BerthSettings = require('../models/BerthSettings');
const dates = require('../../public/js/berth-dates');

function initializeSharedSettings(db, { sourceWeek } = {}) {
  return db.transaction(() => {
    const migrations = migrateDatabase(db);
    if (db.prepare('SELECT 1 FROM berth_shared_settings WHERE id = 1').get()) return { imported: false, migrations };
    // Không trộn các master đã import bằng CLI kế hoạch với snapshot runtime mà chưa đối chiếu.
    for (const table of ['terminals', 'quays', 'vessels']) {
      if (db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n) throw new Error(`Bảng ${table} đã có dữ liệu chuẩn hóa; cần đối chiếu trước khi chuyển cấu hình dùng chung.`);
    }
    const weeks = db.prepare('SELECT week_start, json_data FROM berth_window_week_datasets ORDER BY week_start').all();
    const legacy = db.prepare('SELECT json_data FROM berth_window_datasets WHERE id = 1').get();
    const sources = weeks.map(r => ({ week: r.week_start, data: JSON.parse(r.json_data) }));
    if (legacy) sources.push({ week: null, data: JSON.parse(legacy.json_data) });
    const configured = sources.filter(s => s.data.terminal || s.data.quay || s.data.berths?.length);
    let source = sourceWeek ? sources.find(s => s.week === sourceWeek) : configured[0];
    if (sourceWeek && !source) throw new Error('Không tìm thấy tuần nguồn.');
    if (!sourceWeek && configured.some(s => !isDeepStrictEqual(
      { terminal: s.data.terminal, quay: s.data.quay, berths: s.data.berths },
      { terminal: source.data.terminal, quay: source.data.quay, berths: source.data.berths }))) {
      throw new Error('Có nhiều cấu hình khác nhau; chỉ định --source-week sau khi đối chiếu.');
    }
    source ||= { week: null, data: { terminal: '', quay: null, berths: [] } };
    const vessels = new Map(), imos = new Map();
    for (const s of sources) for (const v of s.data.vessels || []) {
      const vessel = { id: v.id, name: v.name, imo: v.imo || '', loa: v.loa, dwt: v.dwt ?? null, ...(v.beam == null ? {} : { beam: v.beam }), ...(v.active === false ? { active: false } : {}) };
      if (vessels.has(v.id) && !isDeepStrictEqual(vessels.get(v.id), vessel)) throw new Error(`Tàu ${v.id} có thông số khác nhau giữa các nguồn; cần đối chiếu.`);
      if (vessel.imo && imos.has(vessel.imo) && imos.get(vessel.imo) !== v.id) throw new Error(`IMO ${vessel.imo} có nhiều ID; cần đối chiếu.`);
      vessels.set(v.id, vessel);
      if (vessel.imo) imos.set(vessel.imo, v.id);
    }
    if (!weeks.length && legacy) {
      const data = JSON.parse(legacy.json_data);
      if (data.calls?.length || data.tideWindows?.length) {
        db.prepare('INSERT INTO berth_window_week_datasets (week_start, json_data) VALUES (?, ?)').run(dates.monday(dates.today()), legacy.json_data);
      }
    }
    db.prepare('INSERT INTO berth_shared_settings (id, source_week_start) VALUES (1, ?)').run(source.week);
    const settings = new BerthSettings(db);
    const data = { terminal: source.data.terminal, quay: source.data.quay ?? null, berths: source.data.berths, vessels: [...vessels.values()] };
    settings.validate(data);
    settings.write(data, null);
    return { imported: true, migrations, sourceWeek: source.week, vessels: vessels.size };
  }).immediate();
}

module.exports = { initializeSharedSettings };
