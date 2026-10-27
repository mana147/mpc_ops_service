'use strict';

const dates = require('../../public/js/berth-dates');
const { validateBerthData } = require('./berthDataValidator');

// Chỉ là phép chiếu để xem nhiều tuần; dữ liệu gốc vẫn lưu theo ngày Thứ Hai.
class BerthRange {
  constructor(model) {
    this.model = model;
  }

  project(start, end) {
    const range = dates.range(start, end);
    const weeks = new Map();
    const first = dates.monday(start), last = dates.monday(end);
    for (let week = first; week <= last; week = dates.add(week, 7)) weeks.set(week, this.model.get(week).data);
    // Một lượt kéo dài tối đa 168 giờ có thể bắt đầu trong tuần trước.
    const previous = dates.add(first, -7);
    const previousData = this.model.find(previous);
    if (previousData) weeks.set(previous, previousData.data);
    const data = structuredClone(weeks.get(first));
    data.calls = [];
    data.tideWindows = [];
    data.vessels = [];
    const callSources = new Map(), vesselSources = new Map();
    for (const [week, snapshot] of weeks) {
      const offset = dates.diff(start, week);
      const vesselKeys = new Map();
      const visibleCalls = snapshot.calls.filter(call => {
        const hour = (call.ata.day + offset) * 24 + call.ata.hour;
        return hour < range.days * 24 && hour + call.dur > 0;
      });
      for (const vessel of snapshot.vessels || []) {
        if (week < first && !visibleCalls.some(call => call.vesselId === vessel.id)) continue;
        // Dùng chung mục danh mục giống nhau, tách riêng nếu cùng ID nhưng khác thông số.
        let id = vessel.id;
        const same = data.vessels.find(v => v.id === id);
        if (same && JSON.stringify(same) !== JSON.stringify(vessel)) id = `${week}:${vessel.id}`;
        if (!data.vessels.some(v => v.id === id)) data.vessels.push({ ...vessel, id });
        vesselKeys.set(vessel.id, id);
        if (!vesselSources.has(id)) vesselSources.set(id, []);
        vesselSources.get(id).push({ week, id: vessel.id });
      }
      for (const call of visibleCalls) {
        const id = `${week}:${call.id}`;
        callSources.set(id, { week, id: call.id });
        data.calls.push({ ...structuredClone(call), id,
          ...(call.vesselId ? { vesselId: vesselKeys.get(call.vesselId) } : {}),
          ata: { ...call.ata, day: call.ata.day + offset },
          window: call.window ? { ...call.window, day: call.window.day + offset } : null });
      }
      if (week >= first) for (const tide of snapshot.tideWindows) {
        const day = tide.day + offset;
        if (day >= 0 && day < range.days) data.tideWindows.push({ ...tide, day });
      }
    }
    return { range, data, weeks, callSources, vesselSources };
  }

  get(start, end) {
    const { range, data } = this.project(start, end);
    return { ...range, data };
  }

  update(start, end, candidate, userId) {
    // Validate mọi tuần rồi mới ghi trong cùng transaction, không xóa lịch ngoài khoảng chọn.
    return this.model.transaction(() => {
      const view = this.project(start, end);
      if (!candidate || !Array.isArray(candidate.calls) || !Array.isArray(candidate.vessels) || !Array.isArray(candidate.tideWindows)) {
        throw new Error('Thiếu dữ liệu khoảng ngày.');
      }
      const changed = new Set();
      const first = dates.monday(start), last = dates.monday(end);
      const snapshots = new Map([...view.weeks].map(([week, data]) => [week, structuredClone(data)]));
      const snapshotFor = week => {
        if (!snapshots.has(week)) snapshots.set(week, this.model.get(week).data);
        return snapshots.get(week);
      };
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      for (const name of ['terminal', 'quay', 'berths']) {
        if (!same(candidate[name], view.data[name])) {
          for (const [week, snapshot] of snapshots) if (week >= first && week <= last) {
            snapshot[name] = structuredClone(candidate[name]); changed.add(week);
          }
        }
      }
      // Danh mục đã có chỉ sửa ở những tuần chứa mục đó; mục mới thuộc tuần đầu khoảng chọn.
      const vesselIds = new Set();
      for (const vessel of candidate.vessels) {
        if (!vessel || typeof vessel.id !== 'string' || vesselIds.has(vessel.id)) throw new Error('ID tàu thiếu hoặc trùng.');
        vesselIds.add(vessel.id);
        const original = view.data.vessels.find(v => v.id === vessel.id);
        if (same(vessel, original)) continue;
        for (const source of view.vesselSources.get(vessel.id) || [{ week: first, id: vessel.id }]) {
          const snapshot = snapshotFor(source.week);
          snapshot.vessels ||= [];
          const index = snapshot.vessels.findIndex(v => v.id === source.id);
          const saved = { ...vessel, id: source.id };
          if (index < 0) snapshot.vessels.push(saved); else snapshot.vessels[index] = saved;
          changed.add(source.week);
        }
      }
      const seen = new Set();
      for (const call of candidate.calls) {
        if (!call || typeof call.id !== 'string' || seen.has(call.id)) throw new Error('ID lượt tàu thiếu hoặc trùng.');
        seen.add(call.id);
        const original = view.data.calls.find(c => c.id === call.id);
        if (same(call, original)) continue;
        if (!call.ata || !Number.isInteger(call.ata.day)) throw new Error('Ngày bắt đầu lượt tàu không hợp lệ.');
        // Giữ nguyên lượt bắt đầu ngoài khoảng chọn nếu chỉ sửa thông số, cho phép chuyển vào khoảng chọn.
        if (call.ata.day < 0 || call.ata.day >= view.range.days) {
          if (!original || call.ata.day !== original.ata.day) throw new Error('Ngày bắt đầu phải nằm trong khoảng đang chọn.');
        }
        const source = view.callSources.get(call.id);
        const week = dates.monday(dates.add(start, call.ata.day));
        const snapshot = snapshotFor(week);
        const id = source?.id || call.id;
        if (snapshot.calls.some(c => c.id === id && !(source?.week === week && c.id === source.id))) throw new Error('ID lượt tàu đã tồn tại trong tuần đích.');
        if (source) {
          const old = snapshotFor(source.week);
          old.calls = old.calls.filter(c => c.id !== source.id);
          changed.add(source.week);
        }
        const offset = dates.diff(start, week);
        const saved = { ...structuredClone(call), id, ata: { ...call.ata, day: call.ata.day - offset },
          window: call.window ? { ...call.window, day: call.window.day - offset } : null };
        if (call.vesselId) {
          const vessel = candidate.vessels.find(v => v.id === call.vesselId);
          if (!vessel) throw new Error('Tàu không tồn tại trong danh mục.');
          const localSource = view.vesselSources.get(call.vesselId)?.find(s => s.week === week);
          saved.vesselId = localSource?.id || call.vesselId;
          snapshot.vessels ||= [];
          const local = snapshot.vessels.find(v => v.id === saved.vesselId);
          if (!local) snapshot.vessels.push({ ...vessel, id: saved.vesselId });
          else if (!localSource && !same(local, { ...vessel, id: saved.vesselId })) throw new Error('Danh mục tàu tuần đích có ID trùng nhưng thông số khác.');
        }
        snapshot.calls.push(saved);
        changed.add(week);
      }
      for (const [id, source] of view.callSources) if (!seen.has(id)) {
        const snapshot = snapshotFor(source.week);
        snapshot.calls = snapshot.calls.filter(c => c.id !== source.id);
        changed.add(source.week);
      }
      // UI không sửa triều ở phép chiếu; tránh vô tình ghi mất khung triều ngoài khoảng chọn.
      if (!same(candidate.tideWindows, view.data.tideWindows)) throw new Error('Không thể sửa khung triều qua khoảng ngày.');
      for (const week of changed) validateBerthData(snapshotFor(week));
      for (const week of changed) this.model.update(week, snapshotFor(week), userId);
      return { message: 'Đã lưu dữ liệu cho khoảng ngày đang chọn.', ...this.get(start, end) };
    });
  }
}

module.exports = BerthRange;
