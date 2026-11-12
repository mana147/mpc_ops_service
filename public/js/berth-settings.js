'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const field = (form, name) => form.elements.namedItem(name);
const numberValue = (form, name) => Number(field(form, name).value);
const optionalNumber = (form, name) => field(form, name).value === '' ? null : numberValue(form, name);
const newId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
let record, saving = false, dirty = false;
const params = new URLSearchParams(location.search);
try {
  const range = BerthDates.range(params.get('start'), params.get('end'));
  $('#backToBerth').href = `/admin/berth-window?start=${range.start}&end=${range.end}`;
  for (const link of document.querySelectorAll('.admin-nav-link')) {
    const pathname = new URL(link.href).pathname;
    if (['/admin/berth-window', '/admin/berth-window/settings'].includes(pathname)) link.href = `${pathname}?start=${range.start}&end=${range.end}`;
  }
} catch (_) { /* Mở trực tiếp cấu hình: quay về ngày hiện tại. */ }

function message(text, error = false) {
  $('#inputMsg').textContent = text;
  $('#inputMsg').classList.toggle('err', error);
}
function setBusy(busy) {
  saving = busy;
  $('#inputControls').inert = busy;
  $('#reloadSettings').disabled = busy;
}
function sectionRow(section = { code: '', from: 0, to: 0 }) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="section-code" aria-label="Tên cầu ảo" required value="${esc(section.code)}"></td>
    <td><input class="section-from" aria-label="Vị trí bắt đầu" type="number" min="0" step="any" required value="${section.from}"></td>
    <td><input class="section-to" aria-label="Vị trí kết thúc" type="number" min="0" step="any" required value="${section.to}"></td>
    <td class="section-length"></td><td><button type="button" class="btn">Xóa</button></td>`;
  const update = () => { tr.querySelector('.section-length').textContent = Number(tr.querySelector('.section-to').value) - Number(tr.querySelector('.section-from').value); };
  tr.addEventListener('input', update);
  tr.querySelector('button').onclick = () => { tr.remove(); dirty = true; };
  update();
  $('#sectionRows').append(tr);
}
function render() {
  const data = record.data, q = BerthDomain.quay(data), form = $('#quayForm');
  form.reset();
  field(form, 'terminal').value = data.terminal;
  for (const [name, value] of Object.entries(q)) {
    const input = field(form, name);
    if (input) input.value = value ?? '';
  }
  if (!q.length) field(form, 'length').value = '';
  $('#sectionRows').replaceChildren();
  data.berths.forEach(sectionRow);
  $('#vesselRows').innerHTML = data.vessels.map(v => `<tr><td>${esc(v.name)}</td><td>${esc(v.imo || '—')}</td><td>${v.loa}</td><td>${v.dwt ?? 'Chưa cung cấp'}</td>
    <td>${v.active === false ? 'Ngừng sử dụng' : 'Đang sử dụng'}</td><td>${BerthDomain.warnings(v, q).map(esc).join('<br>') || '—'}</td>
    <td><button class="btn" type="button" data-edit-vessel="${esc(v.id)}">Sửa</button> <button class="btn" type="button" data-toggle-vessel="${esc(v.id)}">${v.active === false ? 'Dùng lại' : 'Ngừng sử dụng'}</button></td></tr>`).join('') || '<tr><td colspan="7">Chưa có tàu trong danh mục.</td></tr>';
  document.querySelectorAll('[data-edit-vessel]').forEach(button => { button.onclick = () => {
    if (dirty && !confirm('Bỏ các thay đổi chưa lưu để sửa tàu này?')) return;
    render();
    const vessel = data.vessels.find(v => v.id === button.dataset.editVessel);
    for (const name of ['id', 'name', 'imo', 'loa', 'dwt', 'beam']) field($('#vesselForm'), name).value = vessel[name] ?? '';
    dirty = false;
    field($('#vesselForm'), 'name').focus();
  }; });
  document.querySelectorAll('[data-toggle-vessel]').forEach(button => { button.onclick = async () => {
    if (dirty) { message('Lưu hoặc tải lại để bỏ thay đổi đang nhập trước khi đổi trạng thái tàu.', true); return; }
    const candidate = structuredClone(data), vessel = candidate.vessels.find(v => v.id === button.dataset.toggleVessel);
    if (!confirm(`${vessel.active === false ? 'Dùng lại' : 'Ngừng sử dụng'} tàu ${vessel.name}? Lượt tàu đã lập được giữ nguyên.`)) return;
    if (vessel.active === false) delete vessel.active; else vessel.active = false;
    await save(candidate);
  }; });
}
async function load() {
  if (saving) return;
  if (dirty && !confirm('Bỏ các thay đổi chưa lưu và tải lại dữ liệu?')) return;
  setBusy(true);
  try {
    record = await BerthApi.request('/api/berth-window/settings');
    render(); $('#vesselForm').reset(); dirty = false;
    message(`Dữ liệu dùng chung · ${record.data.vessels.length} tàu.`);
  } catch (error) { message(error.message, true); }
  finally { setBusy(false); if (!record) $('#inputControls').inert = true; }
}
async function save(candidate) {
  if (saving || !record) return false;
  setBusy(true);
  try {
    record = await BerthApi.request('/api/berth-window/settings', { method: 'PUT', body: JSON.stringify({ version: record.version, data: candidate }) });
    render(); $('#vesselForm').reset(); dirty = false; message(record.message);
    return true;
  } catch (error) { message(error.message, true); return false; }
  finally { setBusy(false); }
}
$('#inputControls').addEventListener('input', () => { dirty = true; });
$('#inputControls').addEventListener('change', () => { dirty = true; });
window.addEventListener('beforeunload', event => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } });
$('#reloadSettings').onclick = load;
$('#addSection').onclick = () => { sectionRow({ code: '', from: record.data.berths.at(-1)?.to || 0, to: BerthDomain.quay(record.data).length }); dirty = true; };
$('#quayForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget, candidate = structuredClone(record.data);
  if (field($('#vesselForm'), 'name').value) { message('Lưu hoặc bỏ thông tin tàu đang nhập trước khi lưu cấu hình cầu.', true); return; }
  candidate.terminal = field(form, 'terminal').value.trim();
  candidate.quay = { ...BerthDomain.quay(record.data) };
  for (const name of ['length', 'physicalBerthCount', 'safetyGap']) candidate.quay[name] = numberValue(form, name);
  for (const name of ['depth', 'turningBasin', 'maxLoa', 'maxDwt', 'availableCranes']) candidate.quay[name] = optionalNumber(form, name);
  if (candidate.quay.availableCranes === null) delete candidate.quay.availableCranes;
  for (const name of ['depthDatum', 'turningBasinMeasurement', 'capacitySource']) candidate.quay[name] = field(form, name).value.trim();
  candidate.berths = [...document.querySelectorAll('#sectionRows tr')].map(tr => ({ code: tr.querySelector('.section-code').value.trim(), from: Number(tr.querySelector('.section-from').value), to: Number(tr.querySelector('.section-to').value) }));
  await save(candidate);
};
$('#clearVessel').onclick = () => {
  if (!dirty || confirm('Bỏ các thay đổi chưa lưu?')) { render(); $('#vesselForm').reset(); dirty = false; }
};
$('#vesselForm').onsubmit = async event => {
  event.preventDefault();
  const candidate = structuredClone(record.data), form = event.currentTarget;
  const id = field(form, 'id').value || newId();
  const index = candidate.vessels.findIndex(v => v.id === id);
  const vessel = { ...(candidate.vessels[index] || {}), id, name: field(form, 'name').value.trim(), imo: field(form, 'imo').value.trim(), loa: numberValue(form, 'loa'), dwt: optionalNumber(form, 'dwt') };
  const beam = optionalNumber(form, 'beam');
  if (beam === null) delete vessel.beam; else vessel.beam = beam;
  if (index < 0) candidate.vessels.push(vessel); else candidate.vessels[index] = vessel;
  await save(candidate);
};
function showTab(name) {
  const target = name === 'quay' ? 'quaySettingsTab' : 'vesselSettingsTab';
  const current = document.querySelector('[role="tab"][aria-selected="true"]');
  if (current.id !== target && dirty) {
    if (!confirm('Bỏ các thay đổi chưa lưu để chuyển tab?')) return;
    render(); $('#vesselForm').reset(); dirty = false;
  }
  if (current.id !== target) $('#vesselForm').reset();
  for (const key of ['quay', 'vessel']) {
    const active = key === name, tab = $('#' + key + 'SettingsTab');
    tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    $('#' + key + 'SettingsPanel').hidden = !active;
  }
}
for (const name of ['quay', 'vessel']) {
  const tab = $('#' + name + 'SettingsTab');
  tab.onclick = () => showTab(name);
  tab.onkeydown = event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const next = event.key === 'Home' ? 'quay' : event.key === 'End' ? 'vessel' : name === 'quay' ? 'vessel' : 'quay';
      showTab(next); document.querySelector('[role="tab"][aria-selected="true"]').focus();
    }
  };
}
load();
