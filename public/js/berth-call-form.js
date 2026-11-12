/* Form kế hoạch dùng timestamp UTC, hiển thị và nhập theo giờ Việt Nam. */
(function () {
  'use strict';
  window.BerthCallForm = function ({ getData, getRange, getWindowSuggestions, busy, save, onSaved }) {
    const form = document.querySelector('#callForm'), dialog = document.querySelector('#callDialog');
    const $ = selector => document.querySelector(selector);
    const f = name => form.elements.namedItem(name);
    const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const numeric = name => f(name).value === '' ? null : Number(f(name).value);
    const actualNames = { arrivalAt: 'actualArrival', berthAt: 'actualBerth', operationsStartAt: 'actualOperationsStart', operationsEndAt: 'actualOperationsEnd', departureAt: 'actualDeparture' };
    let original = null, dirty = false;
    function message(text, error = false) {
      $('#callFormMsg').textContent = text; $('#callFormMsg').classList.toggle('err', error);
    }
    function selection() {
      const data = getData(), vessel = data.vessels.find(v => v.id === f('vesselId').value);
      const same = original && f('vesselId').value === (original.vesselId || 'legacy');
      return same ? original : vessel;
    }
    function renderOptions() {
      const data = getData(), selected = f('vesselId').value;
      f('vesselId').innerHTML = '<option value="">Chọn tàu</option>' + data.vessels.map(v => `<option value="${esc(v.id)}"${v.active === false ? ' disabled' : ''}>${esc(v.name)} · ${v.loa} m${v.imo ? ' · IMO ' + esc(v.imo) : ''}${v.active === false ? ' (ngừng sử dụng)' : ''}</option>`).join('')
        + (original && !original.vesselId ? `<option value="legacy">${esc(original.vessel)} (thông số lượt cũ)</option>` : '');
      f('vesselId').value = selected;
      f('section').innerHTML = '<option value="">Chọn đoạn gợi ý</option>' + data.berths.map((b, i) => `<option value="${i}">${esc(b.code)} (${b.from}–${b.to} m)</option>`).join('');
      for (const [id, name] of [['callServices', 'service'], ['callLines', 'line']]) {
        $('#' + id).innerHTML = [...new Set(data.calls.map(call => call[name]).filter(Boolean))].map(value => `<option value="${esc(value)}"></option>`).join('');
      }
      f('windowSuggestion').innerHTML = '<option value="">Nhập cửa sổ trực tiếp</option>' + getWindowSuggestions().map(template => {
        const hour = Math.floor(template.startHour), minute = Math.round((template.startHour - hour) * 60);
        return `<option value="${esc(template.id)}">${esc(template.service)} · ${['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'][template.weekday]} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · ${template.durationHours} giờ · dung sai -${template.earlyToleranceHours}/+${template.lateToleranceHours}h</option>`;
      }).join('');
      $('#callCraneCapacity').textContent = data.quay?.availableCranes == null
        ? 'Chưa cấu hình tổng cẩu khả dụng: có thể lưu nháp, cần bổ sung cấu hình trước khi xác nhận lượt làm hàng.'
        : `Tổng cẩu cầu khả dụng: ${data.quay.availableCranes}. Hệ thống kiểm tra nhu cầu đồng thời của các lịch đã xác nhận.`;
    }
    function optionFields() {
      const windowed = f('visitType').value === 'window';
      $('#callWindowFields').hidden = !windowed;
      $('#callWindowHint').hidden = !windowed;
      for (const name of ['windowStart', 'windowEnd', 'earlyTolerance', 'lateTolerance']) f(name).disabled = !windowed;
      f('windowStart').required = f('windowEnd').required = windowed;
      f('service').required = windowed;
      const type = f('cargoType').value, container = type === 'container', none = type === 'none';
      $('#callContainerFields').hidden = !container;
      for (const name of ['discharge', 'load', 'restow']) f(name).disabled = !container;
      if (none) f('cargoUnit').value = 'units';
      else if (container) f('cargoUnit').value = 'moves';
      else if (f('cargoUnit').value === 'moves') f('cargoUnit').value = 'tonnes';
      f('cargoUnit').disabled = container || none;
      f('cargoTotal').disabled = none; f('cranes').disabled = none;
      if (none) f('cranes').value = '0';
      f('cargoTotal').step = ['moves', 'units'].includes(f('cargoUnit').value) ? '1' : 'any';
      const confirmed = f('planningStatus').value === 'confirmed';
      for (const name of ['arrivalDraft', 'berthingSide']) f(name).required = confirmed;
      f('eta').required = confirmed && !f('actualBerth').value;
      f('etaLocation').required = Boolean(f('eta').value);
      f('cranes').required = f('cargoTotal').required = confirmed && !none;
      f('cranes').min = confirmed && !none ? '1' : '0';
      f('notes').required = f('priority').value === 'high';
      const split = ['discharge', 'load', 'restow'].map(numeric);
      if (container && split.every(v => v !== null)) {
        f('cargoTotal').value = split.reduce((a, b) => a + b, 0); f('cargoTotal').readOnly = true;
      } else f('cargoTotal').readOnly = false;
    }
    function preview() {
      if (!getData()) return;
      const vessel = selection(), q = BerthDomain.quay(getData());
      $('#callVesselInfo').textContent = vessel
        ? `${original && f('vesselId').value === (original.vesselId || 'legacy') ? 'Thông số của lượt đã lưu · ' : ''}IMO: ${vessel.imo || 'Chưa có'} · LOA: ${vessel.loa} m · Rộng: ${vessel.beam ?? 'Chưa có'}${vessel.beam ? ' m' : ''} · DWT: ${vessel.dwt ?? 'Chưa có'}`
        : 'Chọn tàu để xem IMO, LOA, chiều rộng và DWT.';
      const length = numeric('occupiedLength'), from = numeric('from');
      $('#callEnd').textContent = from !== null && length !== null ? `${Math.round((from + length) * 1e6) / 1e6} m` : '—';
      const warnings = vessel ? BerthDomain.warnings(vessel, q) : [];
      if (vessel && length !== null && length < vessel.loa) warnings.push('Chiều dài chiếm cầu nhỏ hơn LOA.');
      if (length !== null && from !== null && from + length > q.length) warnings.push('Vị trí kết thúc vượt tuyến cầu.');
      const start = BerthCalls.timestamp(f('plannedStart').value), end = BerthCalls.timestamp(f('plannedEnd').value);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        if (end <= start) warnings.push('Giờ rời cầu phải sau giờ cập.');
        else f('duration').value = Math.round((end - start) / BerthCalls.HOUR * 1e6) / 1e6;
      }
      const eta = BerthCalls.timestamp(f('eta').value);
      if (Number.isFinite(eta) && eta > start) warnings.push('ETA sau giờ cập cầu kế hoạch.');
      if (q.availableCranes != null && numeric('cranes') > q.availableCranes) warnings.push('Số cẩu lớn hơn tổng cẩu khả dụng.');
      $('#callPreview').textContent = warnings.join(' '); $('#callPreview').classList.toggle('err', warnings.length > 0);
    }
    function timeValue(name, previous) {
      const value = f(name).value;
      if (!value) return null;
      if (Number.isFinite(previous) && value === BerthCalls.local(previous)) return previous;
      const time = BerthCalls.timestamp(value);
      if (!Number.isFinite(time)) throw new Error('Ngày giờ không hợp lệ.');
      return time;
    }
    function open(id) {
      if (busy()) return;
      const data = getData(), range = getRange(), stored = id ? data.calls.find(call => call.id === id) : null;
      if (id && !stored) return;
      original = stored ? BerthCalls.editable(stored, range.start) : null;
      form.reset(); renderOptions();
      if (original) {
        for (const name of ['id', 'voyageIn', 'voyageOut', 'service', 'line', 'agent', 'from', 'arrivalDraft', 'departureDraft', 'cranes', 'planningStatus', 'priority', 'notes', 'berthingSide', 'bowDirection']) f(name).value = original[name] ?? '';
        f('vesselId').value = original.vesselId || 'legacy';
        f('occupiedLength').value = original.to - original.from;
        f('eta').value = BerthCalls.local(original.etaAt); f('etaLocation').value = original.etaLocation;
        f('plannedStart').value = BerthCalls.local(original.plannedStartAt); f('plannedEnd').value = BerthCalls.local(original.plannedEndAt);
        f('visitType').value = original.commitment ? 'window' : 'adhoc';
        if (original.commitment) {
          f('windowStart').value = BerthCalls.local(original.commitment.startAt); f('windowEnd').value = BerthCalls.local(original.commitment.endAt);
          f('earlyTolerance').value = original.commitment.earlyToleranceHours; f('lateTolerance').value = original.commitment.lateToleranceHours;
        }
        f('cargoType').value = original.cargo.type; f('cargoUnit').value = original.cargo.unit;
        f('cargoTotal').value = original.cargo.total ?? '';
        for (const name of ['discharge', 'load', 'restow']) f(name).value = original.cargo[name] ?? '';
        for (const [key, name] of Object.entries(actualNames)) f(name).value = BerthCalls.local(original.actual?.[key]);
      } else {
        f('plannedStart').value = '';
      }
      $('#callRangeHint').textContent = `Ngày cập khi thêm/chuyển lượt cần nằm trong khoảng ${BerthDates.label(range.start)} → ${BerthDates.label(range.end)} đang xem. Giờ rời có thể nằm ngoài khoảng.`;
      $('#callActualDetails').hidden = !stored; $('#callActualDetails').open = false;
      $('#callReference').textContent = original?.callReference || (stored ? 'Tạo mã khi lưu mẫu mới' : 'Tự tạo khi lưu');
      $('#callDialogTitle').textContent = stored ? `Sửa lượt tàu · ${stored.vessel}` : 'Thêm lượt tàu';
      optionFields(); preview(); message(''); dirty = false;
      dialog.showModal();
      dialog.scrollTop = 0;
      f('vesselId').focus({ preventScroll: true });
      if (!data.vessels.some(v => v.active !== false) && !stored) message('Chưa có tàu đang sử dụng. Thêm tàu tại Cấu hình Berth Window trước.', true);
    }
    function close() {
      if (busy()) return false;
      if (dirty && !confirm('Bỏ các thay đổi lượt tàu chưa lưu?')) return false;
      dialog.close(); dirty = false; return true;
    }
    f('vesselId').addEventListener('change', () => {
      const vessel = selection(); if (vessel) f('occupiedLength').value = original && (original.vesselId || 'legacy') === f('vesselId').value ? original.to - original.from : vessel.loa;
      dirty = true; preview();
    });
    f('section').addEventListener('change', () => { if (f('section').value !== '') f('from').value = getData().berths[Number(f('section').value)].from; dirty = true; preview(); });
    f('windowSuggestion').addEventListener('change', () => {
      const template = getWindowSuggestions().find(item => item.id === f('windowSuggestion').value);
      if (!template) return;
      const start = BerthCalls.timestamp(f('plannedStart').value);
      if (!Number.isFinite(start)) { message('Nhập giờ cập kế hoạch trước khi áp dụng gợi ý cửa sổ.', true); f('windowSuggestion').value = ''; return; }
      const window = BerthCalls.suggestWindow(template, start);
      f('windowStart').value = BerthCalls.local(window.startAt); f('windowEnd').value = BerthCalls.local(window.endAt);
      f('earlyTolerance').value = window.earlyToleranceHours; f('lateTolerance').value = window.lateToleranceHours;
      f('service').value = template.service; if (!f('line').value) f('line').value = template.line;
      dirty = true; preview();
    });
    f('cargoType').addEventListener('change', () => {
      for (const name of ['cargoTotal', 'discharge', 'load', 'restow']) f(name).value = '';
      if (f('cargoType').value !== 'none' && f('cranes').value === '0') f('cranes').value = '';
      message('Đã đổi loại hàng. Nhập lại sản lượng theo đúng đơn vị.');
    });
    f('cargoUnit').addEventListener('change', () => { f('cargoTotal').value = ''; message('Đã đổi đơn vị. Nhập lại sản lượng; hệ thống không tự quy đổi.'); });
    form.addEventListener('input', event => {
      dirty = true;
      if (event.target === f('duration')) {
        const start = BerthCalls.timestamp(f('plannedStart').value), duration = numeric('duration');
        if (Number.isFinite(start) && duration > 0) f('plannedEnd').value = BerthCalls.local(start + duration * BerthCalls.HOUR);
      }
      optionFields(); preview();
    });
    form.addEventListener('change', () => { dirty = true; optionFields(); preview(); });
    $('#closeCall').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    window.addEventListener('beforeunload', event => { if (dialog.open && (dirty || busy())) { event.preventDefault(); event.returnValue = ''; } });
    form.onsubmit = async event => {
      event.preventDefault(); if (busy()) return;
      try {
        const vessel = selection(); if (!vessel) throw new Error('Hãy chọn tàu trong danh mục.');
        const uuid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
        const candidate = structuredClone(getData()), call = original ? structuredClone(original) : {};
        call.schemaVersion = 2; call.id = original?.id || uuid();
        call.vesselId = f('vesselId').value === 'legacy' ? null : f('vesselId').value;
        call.vessel = vessel.name || vessel.vessel;
        call.loa = vessel.loa; call.imo = vessel.imo || ''; call.dwt = vessel.dwt ?? null;
        if (vessel.beam != null) call.beam = vessel.beam;
        for (const name of ['voyageIn', 'voyageOut', 'service', 'line', 'agent', 'notes', 'etaLocation']) call[name] = f(name).value.trim();
        if (!call.service) call.service = null;
        call.plannedStartAt = timeValue('plannedStart', original?.plannedStartAt);
        call.plannedEndAt = timeValue('plannedEnd', original?.plannedEndAt);
        call.etaAt = timeValue('eta', original?.etaAt);
        call.commitment = f('visitType').value === 'window' ? {
          startAt: timeValue('windowStart', original?.commitment?.startAt), endAt: timeValue('windowEnd', original?.commitment?.endAt),
          earlyToleranceHours: numeric('earlyTolerance'), lateToleranceHours: numeric('lateTolerance')
        } : null;
        call.from = numeric('from'); call.to = Math.round((call.from + numeric('occupiedLength')) * 1e6) / 1e6;
        for (const name of ['berthingSide', 'bowDirection']) call[name] = f(name).value || null;
        for (const name of ['arrivalDraft', 'departureDraft', 'cranes']) call[name] = numeric(name);
        call.cargo = { type: f('cargoType').value, unit: f('cargoUnit').value, total: numeric('cargoTotal'), discharge: null, load: null, restow: null };
        if (call.cargo.type === 'container') for (const name of ['discharge', 'load', 'restow']) call.cargo[name] = numeric(name);
        if (call.cargo.type === 'none') { call.cargo.total = null; call.cranes = 0; }
        call.planningStatus = f('planningStatus').value; call.priority = f('priority').value;
        call.actual = {};
        for (const [key, name] of Object.entries(actualNames)) { const time = timeValue(name, original?.actual?.[key]); if (time !== null) call.actual[key] = time; }
        const index = candidate.calls.findIndex(old => old.id === call.id);
        if (index < 0) candidate.calls.push(call); else candidate.calls[index] = call;
        if (await save(candidate)) {
          dirty = false; dialog.close();
          onSaved(call.id, call.plannedStartAt, Boolean(original));
        }
      } catch (error) { message(error.message, true); }
    };
    return { open: () => open(null), edit: open, renderOptions };
  };
})();
