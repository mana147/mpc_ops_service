'use strict';

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
  assert(typeof payload.terminal === 'string' && payload.terminal.trim(), 'Thiếu tên terminal.');
  assert(Array.isArray(payload.berths) && payload.berths.length > 0, 'Thiếu mảng "berths" hoặc mảng đang rỗng.');
  assert(Array.isArray(payload.tideWindows), 'Thiếu mảng "tideWindows".');
  assert(Array.isArray(payload.calls), 'Thiếu mảng "calls".');

  payload.berths.forEach((berth, index) => {
    const base = `berths[${index}]`;
    assert(typeof berth.code === 'string' && berth.code.trim(), `${base}.code không hợp lệ.`);
    assertNumber(berth.from, `${base}.from`, { min: 0, max: 900 });
    assertNumber(berth.to, `${base}.to`, { min: 0, max: 900 });
    assert(berth.to > berth.from, `${base}.to phải lớn hơn from.`);
  });

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
    assertNumber(call.from, `${base}.from`, { min: 0, max: 900 });
    assertNumber(call.to, `${base}.to`, { min: 0, max: 900 });
    assert(call.to > call.from, `${base}.to phải lớn hơn from.`);
    ['loa', 'draft', 'moves'].forEach(field => assertNumber(call[field], `${base}.${field}`, { min: 0 }));
    assertNumber(call.cranes, `${base}.cranes`, { min: 1, integer: true });
    assertNumber(call.tol, `${base}.tol`, { min: 0, max: 24 });
  });

  return payload;
}

module.exports = { validateBerthData };
