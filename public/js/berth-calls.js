(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./berth-dates'));
  else root.BerthCalls = factory(root.BerthDates);
})(typeof globalThis === 'object' ? globalThis : this, function (dates) {
  'use strict';
  const HOUR = 3600000, DAY = 86400000;
  const midnight = date => { dates.parse(date); return Date.parse(`${date}T00:00:00+07:00`); };
  const isNew = call => call.schemaVersion === 2;
  function local(value) {
    return Number.isFinite(value) ? new Date(value + 7 * HOUR).toISOString().slice(0, 16) : '';
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
    const result = Date.parse(`${value}:00+07:00`);
    return Number.isFinite(result) && local(result) === value ? result : NaN;
  }
  function timing(call, origin) {
    const base = midnight(origin);
    const startAt = isNew(call) ? call.plannedStartAt : base + (call.ata.day * 24 + call.ata.hour) * HOUR;
    const endAt = isNew(call) ? call.plannedEndAt : startAt + call.dur * HOUR;
    return { startAt, endAt, start: (startAt - base) / HOUR, end: (endAt - base) / HOUR, dur: (endAt - startAt) / HOUR };
  }
  function commitment(call, origin) {
    if (isNew(call)) return call.commitment ? {
      start: (call.commitment.startAt - midnight(origin)) / HOUR,
      end: (call.commitment.endAt - midnight(origin)) / HOUR,
      early: call.commitment.earlyToleranceHours, late: call.commitment.lateToleranceHours
    } : null;
    if (!call.window) return null;
    const start = call.window.day * 24 + call.window.hour;
    return { start, end: start + call.window.dur, early: call.tol || 0, late: call.tol || 0 };
  }
  const cancelled = call => isNew(call) && call.planningStatus === 'cancelled';
  const reserved = call => !cancelled(call) && (!isNew(call) || call.planningStatus === 'confirmed');
  function quantity(call) { return isNew(call) ? call.cargo?.total ?? null : call.moves; }
  function phase(call) {
    if (!isNew(call)) return 'legacy';
    if (cancelled(call)) return 'cancelled';
    const a = call.actual || {};
    if (a.departureAt != null) return 'departed';
    if (a.operationsEndAt != null) return 'complete';
    if (a.operationsStartAt != null) return 'working';
    if (a.berthAt != null) return 'berthed';
    if (a.arrivalAt != null) return 'arrived';
    return call.planningStatus;
  }
  const labels = { legacy: 'Kế hoạch cũ', draft: 'Nháp', confirmed: 'Đã xác nhận', cancelled: 'Đã hủy', arrived: 'Đã đến cảng', berthed: 'Đã cập cầu', working: 'Đang làm hàng', complete: 'Xong hàng', departed: 'Đã rời cầu' };
  const units = { moves: 'moves', tonnes: 'tấn', m3: 'm³', units: 'đơn vị' };
  function editable(call, origin) {
    if (isNew(call)) return structuredClone(call);
    const plan = timing(call, origin), win = commitment(call, origin), base = midnight(origin);
    return {
      schemaVersion: 2, id: call.id, vesselId: call.vesselId || null, vessel: call.vessel,
      loa: call.loa, dwt: call.dwt ?? null, imo: call.imo || '',
      voyageIn: call.voyage || '', voyageOut: '', service: call.service, line: call.line,
      etaAt: null, etaLocation: '', plannedStartAt: Math.round(plan.startAt), plannedEndAt: Math.round(plan.endAt),
      commitment: win ? { startAt: Math.round(base + win.start * HOUR), endAt: Math.round(base + win.end * HOUR),
        earlyToleranceHours: win.early, lateToleranceHours: win.late } : null,
      from: call.from, to: call.to, berthingSide: null, bowDirection: null,
      arrivalDraft: call.draft > 0 ? call.draft : null, departureDraft: null,
      cranes: call.cranes ?? null,
      cargo: { type: 'container', unit: 'moves', total: call.moves ?? null, discharge: null, load: null, restow: null },
      planningStatus: 'draft', priority: 'normal', notes: '', agent: '', actual: {}
    };
  }
  function suggestWindow(template, plannedStartAt) {
    const week = dates.monday(local(plannedStartAt).slice(0, 10));
    const startAt = midnight(week) + (template.weekday * 24 + template.startHour) * HOUR;
    return { startAt: Math.round(startAt), endAt: Math.round(startAt + template.durationHours * HOUR),
      earlyToleranceHours: template.earlyToleranceHours, lateToleranceHours: template.lateToleranceHours };
  }
  return { HOUR, DAY, midnight, isNew, local, timestamp, timing, commitment, cancelled, reserved, quantity, phase, labels, units, editable, suggestWindow };
});
