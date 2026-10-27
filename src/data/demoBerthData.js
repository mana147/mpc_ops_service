'use strict';

const seedBerthData = require('./seedBerthData');

// Danh mục hoàn toàn giả lập, không đại diện tàu hoặc hãng tàu thực tế.
const DEMO_VESSELS = [
  { id: 'DEMO-V001', name: 'MPC DEMO PIONEER', imo: '', loa: 180, dwt: 28000 },
  { id: 'DEMO-V002', name: 'MPC DEMO HORIZON', imo: '', loa: 205, dwt: 35000 },
  { id: 'DEMO-V003', name: 'MPC DEMO MERIDIAN', imo: '', loa: 165, dwt: 22000 },
  { id: 'DEMO-V004', name: 'MPC DEMO PACIFIC', imo: '', loa: 220, dwt: 39000 },
  { id: 'DEMO-V005', name: 'MPC DEMO VOYAGER', imo: '', loa: 150, dwt: 18000 },
  { id: 'DEMO-V006', name: 'MPC DEMO OCEAN', imo: '', loa: 195, dwt: 32000 },
  { id: 'DEMO-V007', name: 'MPC DEMO UNITY', imo: '', loa: 175, dwt: 25000 },
  { id: 'DEMO-V008', name: 'MPC DEMO GALAXY', imo: '', loa: 210, dwt: 37000 }
];

const CALL_SLOTS = [
  { day: 0, hour: 7.5, dur: 14, from: 0, service: 'CIX', line: 'DEMO LINE A', cranes: 3, moves: 720 },
  { day: 1, hour: 9, dur: 11, side: 'right', service: 'VTX', line: 'DEMO LINE B', cranes: 2, moves: 480 },
  { day: 3, hour: 6, dur: 16, from: 0, service: 'SCX', line: 'DEMO LINE C', cranes: 3, moves: 860 },
  { day: 5, hour: 8, dur: 12, side: 'right', service: 'NBX', line: 'DEMO LINE D', cranes: 2, moves: 540 },
  { day: 6, hour: 14, dur: 7, from: 0, service: null, line: 'DEMO CHARTER', cranes: 1, moves: 210 }
];

function mondayFor(date) {
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

function demoWeekStarts(year) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error('Năm dữ liệu demo không hợp lệ.');
  const first = mondayFor(new Date(Date.UTC(year, 0, 1)));
  const last = mondayFor(new Date(Date.UTC(year, 11, 31)));
  const weeks = [];
  for (const date = new Date(first); date <= last; date.setUTCDate(date.getUTCDate() + 7)) {
    weeks.push(date.toISOString().slice(0, 10));
  }
  return weeks;
}

function buildDemoWeekData(weekStart, weekIndex) {
  const data = structuredClone(seedBerthData);
  // Cấu hình này chỉ được tạo khi chủ động bật demo, không dùng cho khởi tạo trống.
  data.terminal = 'Tuyến cầu DEMO';
  data.quay = {
    length: 380, physicalBerthCount: 2, depth: null, depthDatum: '',
    turningBasin: null, turningBasinMeasurement: 'unconfirmed',
    maxLoa: 225, maxDwt: 40000, safetyGap: 25, capacitySource: ''
  };
  data.berths = [{ code: 'DEMO-V1', from: 0, to: 380 }];
  data.vessels = structuredClone(DEMO_VESSELS);
  const callCount = 3 + (weekIndex % 3);
  const dateId = weekStart.replaceAll('-', '');
  data.calls = CALL_SLOTS.slice(0, callCount).map((slot, slotIndex) => {
    const vessel = DEMO_VESSELS[(weekIndex * 2 + slotIndex) % DEMO_VESSELS.length];
    const from = slot.side === 'right' ? data.quay.length - vessel.loa : slot.from;
    const windowHour = Math.max(0, slot.hour - (slotIndex % 2 ? 1 : 0.5));
    return {
      id: `DEMO-${dateId}-${slotIndex + 1}`,
      vesselId: vessel.id,
      vessel: vessel.name,
      voyage: `D${String(weekIndex + 1).padStart(2, '0')}${slotIndex + 1}`,
      service: slot.service,
      line: slot.line,
      window: slotIndex === 4 ? null : { day: slot.day, hour: windowHour, dur: slot.dur + 2 },
      ata: { day: slot.day, hour: slot.hour },
      dur: slot.dur,
      from,
      to: from + vessel.loa,
      loa: vessel.loa,
      dwt: vessel.dwt,
      imo: vessel.imo,
      draft: Math.round((6.5 + ((weekIndex + slotIndex) % 6) * 0.4) * 10) / 10,
      cranes: slot.cranes,
      moves: slot.moves + (weekIndex % 5) * 20,
      tol: 2
    };
  });
  return data;
}

function seedDemoBerthWeeks(db, { year = 2026 } = {}) {
  const select = db.prepare(`
    SELECT json_data, updated_by
    FROM berth_window_week_datasets
    WHERE week_start = ?
  `);
  const insert = db.prepare(`
    INSERT INTO berth_window_week_datasets (week_start, json_data)
    VALUES (?, ?)
  `);
  const updateMissingDemo = db.prepare(`
    UPDATE berth_window_week_datasets
    SET json_data = ?, updated_at = CURRENT_TIMESTAMP
    WHERE week_start = ?
  `);
  const result = { inserted: 0, updated: 0, preserved: 0 };

  db.transaction(() => {
    demoWeekStarts(year).forEach((weekStart, weekIndex) => {
      const demoData = buildDemoWeekData(weekStart, weekIndex);
      const existing = select.get(weekStart);
      if (!existing) {
        insert.run(weekStart, JSON.stringify(demoData));
        result.inserted++;
        return;
      }
      const current = JSON.parse(existing.json_data);
      let changed = false;
      if (current.quay === null && !current.berths?.length && !current.terminal) {
        current.terminal = demoData.terminal;
        current.quay = demoData.quay;
        current.berths = demoData.berths;
        changed = true;
      }
      if (!Array.isArray(current.vessels) || current.vessels.length === 0) {
        current.vessels = demoData.vessels;
        changed = true;
      }
      if (!Array.isArray(current.calls) || current.calls.length === 0) {
        current.calls = demoData.calls;
        changed = true;
      }
      if (changed) {
        updateMissingDemo.run(JSON.stringify(current), weekStart);
        result.updated++;
      } else {
        result.preserved++;
      }
    });
  })();

  return result;
}

module.exports = { DEMO_VESSELS, buildDemoWeekData, demoWeekStarts, seedDemoBerthWeeks };
