'use strict';

const domain = require('../../public/js/berth-domain');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNumber(value, field, { min = -Infinity, max = Infinity, integer = false } = {}) {
  assert(typeof value === 'number' && Number.isFinite(value), `${field} phải là số.`);
  assert(value >= min && value <= max, `${field} phải nằm trong khoảng ${min}–${max}.`);
  if (integer) assert(Number.isInteger(value), `${field} phải là số nguyên.`);
}

function validateTime(value, field) {
  assert(value && typeof value === 'object', `${field} không hợp lệ.`);
  assertNumber(value.day, `${field}.day`, { min: 0, max: 6, integer: true });
  assertNumber(value.hour, `${field}.hour`, { min: 0, max: 23.999 });
}

function validateBerthData(payload) {
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), 'Dữ liệu phải là một object JSON.');
  assert(Array.isArray(payload.berths), 'Thiếu mảng "berths".');
  assert(Array.isArray(payload.tideWindows), 'Thiếu mảng "tideWindows".');
  assert(Array.isArray(payload.calls), 'Thiếu mảng "calls".');
  const unconfigured = payload.terminal === '' && payload.quay === null && payload.berths.length === 0;
  if (unconfigured) {
    assert(payload.calls.length === 0 && payload.tideWindows.length === 0,
      'Cần cấu hình cầu bến trước khi nhập lượt tàu hoặc khung triều.');
  } else {
    assert(typeof payload.terminal === 'string' && payload.terminal.trim(), 'Thiếu tên terminal.');
    assert(payload.quay != null || payload.berths.length > 0, 'Thiếu cấu hình tuyến cầu.');
  }

  if (!unconfigured && payload.quay !== undefined) {
    const q = payload.quay;
    assert(q && typeof q === 'object' && !Array.isArray(q), 'quay không hợp lệ.');
    assertNumber(q.length, 'quay.length', { min: 1 });
    assertNumber(q.physicalBerthCount, 'quay.physicalBerthCount', { min: 1, integer: true });
    assertNumber(q.safetyGap, 'quay.safetyGap', { min: 0 });
    if (q.depth != null) assertNumber(q.depth, 'quay.depth', { max: 0 });
    for (const field of ['turningBasin', 'maxLoa', 'maxDwt']) {
      if (q[field] != null) assertNumber(q[field], `quay.${field}`, { min: 0.01 });
    }
    for (const field of ['depthDatum', 'capacitySource']) assert(typeof q[field] === 'string', `quay.${field} không hợp lệ.`);
    assert(['unconfirmed', 'diameter'].includes(q.turningBasinMeasurement), 'Cách đo vũng quay không hợp lệ.');
  }
  const quayLength = domain.quay(payload).length;
  const codes = new Set();

  payload.berths.forEach((berth, index) => {
    const base = `berths[${index}]`;
    assert(typeof berth.code === 'string' && berth.code.trim(), `${base}.code không hợp lệ.`);
    assert(!codes.has(berth.code.trim()), `Mã cầu ảo bị trùng: ${berth.code}.`);
    codes.add(berth.code.trim());
    assertNumber(berth.from, `${base}.from`, { min: 0, max: quayLength });
    assertNumber(berth.to, `${base}.to`, { min: 0, max: quayLength });
    assert(berth.to > berth.from, `${base}.to phải lớn hơn from.`);
  });
  const sections = [...payload.berths].sort((a, b) => a.from - b.from);
  sections.forEach((b, i) => {
    if (i) assert(b.from >= sections[i - 1].to, 'Các cầu ảo không được chồng lấn.');
  });

  const vesselIds = new Map();
  const imos = new Set();
  if (payload.vessels !== undefined) {
    assert(Array.isArray(payload.vessels), 'vessels phải là mảng.');
    payload.vessels.forEach((v, i) => {
      assert(typeof v.id === 'string' && v.id.trim() && !vesselIds.has(v.id), `vessels[${i}].id thiếu hoặc trùng.`);
      assert(typeof v.name === 'string' && v.name.trim(), `vessels[${i}].name không hợp lệ.`);
      assertNumber(v.loa, `vessels[${i}].loa`, { min: 0.01 });
      if (v.dwt != null) assertNumber(v.dwt, `vessels[${i}].dwt`, { min: 0.01 });
      if (v.imo) {
        assert(typeof v.imo === 'string' && /^\d{7}$/.test(v.imo) && !imos.has(v.imo), 'IMO phải gồm 7 chữ số và không trùng.');
        imos.add(v.imo);
      }
      vesselIds.set(v.id, v);
    });
  }

  payload.tideWindows.forEach((window, index) => {
    const base = `tideWindows[${index}]`;
    assertNumber(window.day, `${base}.day`, { min: 0, max: 6, integer: true });
    assertNumber(window.from, `${base}.from`, { min: 0, max: 24 });
    assertNumber(window.to, `${base}.to`, { min: 0, max: 24 });
    assert(window.to > window.from, `${base}.to phải lớn hơn from.`);
  });

  const ids = new Set();
  payload.calls.forEach((call, index) => {
    const base = `calls[${index}]`;
    assert(typeof call.id === 'string' && call.id.trim(), `${base}.id không hợp lệ.`);
    assert(!ids.has(call.id), `ID lượt tàu bị trùng: ${call.id}.`);
    ids.add(call.id);
    assert(typeof call.vessel === 'string' && call.vessel.trim(), `${base}.vessel không hợp lệ.`);
    assert(call.service === null || typeof call.service === 'string', `${base}.service không hợp lệ.`);
    assert(typeof call.line === 'string', `${base}.line không hợp lệ.`);
    validateTime(call.ata, `${base}.ata`);
    if (call.window !== null) {
      validateTime(call.window, `${base}.window`);
      assertNumber(call.window.dur, `${base}.window.dur`, { min: 0.1, max: 168 });
    }
    assertNumber(call.dur, `${base}.dur`, { min: 0.1, max: 168 });
    assertNumber(call.from, `${base}.from`, { min: 0, max: quayLength });
    assertNumber(call.to, `${base}.to`, { min: 0, max: quayLength });
    assert(call.to > call.from, `${base}.to phải lớn hơn from.`);
    if (call.dwt != null) assertNumber(call.dwt, `${base}.dwt`, { min: 0.01 });
    if (call.vesselId != null) {
      assert(vesselIds.has(call.vesselId), `${base}.vesselId không tồn tại trong danh mục.`);
      assert(call.loa > 0 && call.to - call.from + 0.000001 >= call.loa, `${base}: đoạn chiếm cầu phải đủ LOA.`);
    }
    ['loa', 'draft', 'moves'].forEach(field => assertNumber(call[field], `${base}.${field}`, { min: 0 }));
    assertNumber(call.cranes, `${base}.cranes`, { min: 1, integer: true });
    assertNumber(call.tol, `${base}.tol`, { min: 0, max: 24 });
  });

  return payload;
}

module.exports = { validateBerthData };
