'use strict';

const calls = require('../../public/js/berth-calls');
function assert(condition, message) { if (!condition) throw new Error(message); }
function number(value, name, { optional = false, min = 0, integer = false } = {}) {
  if (optional && value === null) return;
  assert(typeof value === 'number' && Number.isFinite(value) && value >= min && (!integer || Number.isInteger(value)), `${name} không hợp lệ.`);
}
function timestamp(value, name, optional = false) {
  if (optional && value === null) return;
  assert(Number.isSafeInteger(value) && value >= Date.parse('1000-01-01T00:00:00Z') && value <= Date.parse('9999-12-31T23:59:59Z'), `${name} phải là timestamp UTC milliseconds hợp lệ.`);
}
function validateCall(call, base, quayLength, vesselIds) {
  assert(call.schemaVersion === 2, `${base}.schemaVersion không hợp lệ.`);
  assert(!Object.hasOwn(call, 'ata') && !Object.hasOwn(call, 'dur') && !Object.hasOwn(call, 'window'), `${base}: lượt mới không dùng ata/dur/window legacy.`);
  for (const key of ['voyageIn', 'voyageOut', 'etaLocation', 'agent', 'notes']) {
    assert(typeof call[key] === 'string' && call[key].length <= (key === 'notes' ? 4000 : 200), `${base}.${key} không hợp lệ.`);
  }
  assert(['draft', 'confirmed', 'cancelled'].includes(call.planningStatus), `${base}.planningStatus không hợp lệ.`);
  assert(['normal', 'high'].includes(call.priority), `${base}.priority không hợp lệ.`);
  if (call.priority === 'high') assert(call.notes.trim(), `${base}: ưu tiên cao cần lý do trong ghi chú.`);
  timestamp(call.plannedStartAt, `${base}.plannedStartAt`);
  timestamp(call.plannedEndAt, `${base}.plannedEndAt`);
  assert(call.plannedEndAt > call.plannedStartAt, `${base}: giờ rời cầu phải sau giờ cập cầu.`);
  timestamp(call.etaAt, `${base}.etaAt`, true);
  if (call.etaAt !== null) assert(call.etaLocation.trim(), `${base}: ghi rõ địa điểm ETA.`);
  for (const key of ['arrivalDraft', 'departureDraft']) number(call[key], `${base}.${key}`, { optional: true, min: 0.01 });
  number(call.cranes, `${base}.cranes`, { optional: true, integer: true });
  assert(call.berthingSide === null || ['port', 'starboard'].includes(call.berthingSide), `${base}.berthingSide không hợp lệ.`);
  assert(call.bowDirection === null || ['increasing', 'decreasing'].includes(call.bowDirection), `${base}.bowDirection không hợp lệ.`);
  if (call.vesselId != null) assert(vesselIds.has(call.vesselId), `${base}.vesselId không tồn tại trong danh mục.`);
  number(call.from, `${base}.from`); number(call.to, `${base}.to`);
  number(call.loa, `${base}.loa`, { min: 0.01 });
  if (call.dwt != null) number(call.dwt, `${base}.dwt`, { min: 0.01 });
  assert(call.to <= quayLength && call.to > call.from && call.to - call.from + 0.000001 >= call.loa, `${base}: đoạn chiếm cầu phải đủ LOA và nằm trong tuyến.`);
  const cargo = call.cargo;
  assert(cargo && ['container', 'general', 'bulk', 'none'].includes(cargo.type), `${base}.cargo không hợp lệ.`);
  assert(['moves', 'tonnes', 'm3', 'units'].includes(cargo.unit), `${base}.cargo.unit không hợp lệ.`);
  if (cargo.type === 'container') assert(cargo.unit === 'moves', `${base}: container dùng moves, không dùng TEU thay moves.`);
  if (cargo.type !== 'container') assert(cargo.unit !== 'moves', `${base}: hàng ngoài container cần đơn vị riêng.`);
  number(cargo.total, `${base}.cargo.total`, { optional: true, integer: ['moves', 'units'].includes(cargo.unit) });
  for (const name of ['discharge', 'load', 'restow']) number(cargo[name], `${base}.cargo.${name}`, { optional: true, integer: true });
  const split = ['discharge', 'load', 'restow'].map(name => cargo[name]);
  if (cargo.type === 'container' && split.some(value => value !== null)) {
    assert(split.every(value => value !== null), `${base}: nhập đủ dỡ/xếp/đảo chuyển hoặc để trống cả ba.`);
    assert(cargo.total === split.reduce((a, b) => a + b, 0), `${base}: tổng moves phải bằng dỡ + xếp + đảo chuyển.`);
  }
  if (cargo.type !== 'container') assert(split.every(value => value === null), `${base}: cơ cấu moves chỉ dùng cho container.`);
  if (cargo.type === 'none') assert(cargo.total === null && (call.cranes === null || call.cranes === 0), `${base}: lượt không làm hàng không có sản lượng/cẩu làm hàng.`);
  if (call.commitment !== null) {
    const window = call.commitment;
    assert(window && typeof window === 'object', `${base}.commitment không hợp lệ.`);
    timestamp(window.startAt, `${base}.commitment.startAt`); timestamp(window.endAt, `${base}.commitment.endAt`);
    assert(window.endAt > window.startAt, `${base}: cửa sổ kết thúc phải sau bắt đầu.`);
    number(window.earlyToleranceHours, `${base}.commitment.earlyToleranceHours`);
    number(window.lateToleranceHours, `${base}.commitment.lateToleranceHours`);
    assert(call.service?.trim(), `${base}: lượt theo cửa sổ cần tuyến dịch vụ.`);
  }
  const actual = call.actual;
  assert(actual && typeof actual === 'object' && !Array.isArray(actual), `${base}.actual không hợp lệ.`);
  const order = ['arrivalAt', 'berthAt', 'operationsStartAt', 'operationsEndAt', 'departureAt'];
  let last = null;
  for (const key of order) {
    if (actual[key] == null) continue;
    timestamp(actual[key], `${base}.actual.${key}`);
    assert(actual[key] <= Date.now(), `${base}: giờ thực tế không được ở tương lai.`);
    assert(last === null || actual[key] >= last, `${base}: thứ tự giờ thực tế không hợp lệ.`);
    last = actual[key];
  }
  if (actual.operationsStartAt != null || actual.departureAt != null) assert(actual.berthAt != null, `${base}: cần giờ cập cầu thực tế.`);
  if (actual.operationsEndAt != null) assert(actual.operationsStartAt != null, `${base}: cần giờ bắt đầu làm hàng thực tế.`);
  if (last !== null) assert(call.planningStatus === 'confirmed', `${base}: lượt có giờ thực tế phải ở trạng thái đã xác nhận.`);
  if (call.planningStatus === 'confirmed') {
    if (actual.berthAt == null) assert(call.etaAt !== null && call.etaAt <= call.plannedStartAt, `${base}: xác nhận cần ETA không sau giờ cập cầu kế hoạch.`);
    assert(call.arrivalDraft !== null && call.berthingSide !== null, `${base}: xác nhận cần mớn nước đến và mạn cập.`);
    if (cargo.type !== 'none') assert(call.cranes !== null && call.cranes > 0 && cargo.total !== null && cargo.total > 0, `${base}: xác nhận cần sản lượng và số cẩu dự kiến lớn hơn 0.`);
  }
  return call;
}

function scheduling(records, changedKeys, quay, { strict = true } = {}) {
  const warnings = [];
  const active = records.filter(r => !calls.cancelled(r.call)).map(r => ({ ...r, ...calls.timing(r.call, r.week) }));
  const label = r => `${r.call.callReference || r.call.id} (${r.call.vessel}, tuần ${r.week})`;
  const warn = (r, message) => warnings.push({ week: r.week, callId: r.call.id, message });
  const fail = (r, message) => { if (strict) throw new Error(message); warn(r, message); };
  const changed = r => changedKeys.has(`${r.week}:${r.call.id}`);
  for (const r of active.filter(changed)) {
    const c = r.call;
    if (calls.isNew(c)) {
      if (c.departureDraft === null) warn(r, 'Chưa có mớn nước rời.');
      if (c.etaAt === null) warn(r, 'Chưa có ETA.');
      if (c.cranes === null && c.cargo.type !== 'none') warn(r, 'Chưa có số cẩu dự kiến.');
      if (c.cargo.total === null && c.cargo.type !== 'none') warn(r, 'Chưa có sản lượng dự kiến.');
      if (c.etaAt !== null && c.etaAt > c.plannedStartAt) warn(r, 'ETA sau giờ cập cầu kế hoạch.');
      if (c.cranes > 0 && quay.availableCranes == null) {
        if (calls.reserved(c)) fail(r, `${label(r)}: cần cấu hình tổng số cẩu khả dụng trước khi xác nhận.`);
        warn(r, 'Chưa cấu hình tổng số cẩu khả dụng; chưa kiểm tra được năng lực cẩu.');
      }
      if (calls.reserved(c) && quay.availableCranes != null && c.cranes > quay.availableCranes) fail(r, `${label(r)}: số cẩu vượt tổng cẩu khả dụng ${quay.availableCranes}.`);
      const window = calls.commitment(c, r.week), start = calls.timing(c, r.week).start;
      if (window && (start < window.start - window.early || start > window.start + window.late)) warn(r, 'Giờ cập kế hoạch nằm ngoài dung sai cửa sổ cam kết.');
    }
  }
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    if ((!changed(a) && !changed(b)) || a.startAt >= b.endAt || b.startAt >= a.endAt) continue;
    const ca = a.call, cb = b.call;
    const sameVessel = ca.vesselId && cb.vesselId ? ca.vesselId === cb.vesselId
      : ca.imo && cb.imo ? ca.imo === cb.imo : ca.vessel.trim().toUpperCase() === cb.vessel.trim().toUpperCase();
    if (sameVessel) fail(changed(a) ? a : b, `Cùng một tàu bị trùng thời gian: ${label(a)} và ${label(b)}.`);
    const overlap = ca.from < cb.to + quay.safetyGap && cb.from < ca.to + quay.safetyGap;
    if (!overlap) continue;
    if (calls.reserved(ca) && calls.reserved(cb)) fail(changed(a) ? a : b, `Xung đột cầu bến: ${label(a)} và ${label(b)}.`);
    if (changed(a)) warn(a, `Xung đột vị trí/thời gian với ${label(b)}.`);
    if (changed(b)) warn(b, `Xung đột vị trí/thời gian với ${label(a)}.`);
  }
  if (quay.availableCranes != null) for (const r of active.filter(changed)) {
    const simultaneous = active.filter(other => calls.reserved(other.call) && other.startAt < r.endAt && r.startAt < other.endAt);
    if (!calls.reserved(r.call)) simultaneous.push(r);
    const events = simultaneous.flatMap(other => [[Math.max(r.startAt, other.startAt), other.call.cranes || 0], [Math.min(r.endAt, other.endAt), -(other.call.cranes || 0)]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let used = 0, peak = 0;
    for (const [, delta] of events) { used += delta; peak = Math.max(peak, used); }
    if (peak > quay.availableCranes) {
      if (calls.reserved(r.call)) fail(r, `${label(r)}: tổng nhu cầu ${peak} cẩu vượt ${quay.availableCranes} cẩu khả dụng.`);
      warn(r, `Tổng nhu cầu dự kiến ${peak} cẩu vượt ${quay.availableCranes} cẩu khả dụng.`);
    }
  }
  return warnings;
}

module.exports = { validateCall, scheduling };
