// Kích thước lấy từ cấu hình mỗi lần vẽ.
let QUAY_LEN = 380;
// Khoảng cách an toàn tối thiểu giữa hai tàu (m).
let SAFETY_GAP = 25;
// Tỷ lệ trục ngang: pixel cho một giờ.
let HOUR_PX = 9;
// Tỷ lệ trục dọc: pixel cho một mét cầu bến.
let M_PX = 0.45;
// Chiều cao vùng nhãn ngày/giờ của SVG (pixel).
const HEAD_H = 46;
// Khoảng đệm dưới cùng của SVG (pixel).
const PAD_B = 16;
// Chiều rộng biểu đồ của 7 ngày x 24 giờ.
let CHART_W = 168 * HOUR_PX;
// Chiều cao vùng cầu bến sau khi đổi mét sang pixel.
let QUAY_H = QUAY_LEN * M_PX;
// Tổng chiều cao SVG: nhãn + cầu bến + đệm.
let SVG_H = HEAD_H + QUAY_H + PAD_B;
// Chỉ số day trong JSON: 0 là Thứ 2, 6 là Chủ nhật.
const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

// Chỉ hiển thị dữ liệu đã tải thành công từ API.
let data = null;
let QUAY_CONFIG;
let dataSaving = false;
// Số tuần lệch với hiện tại; chỉ đổi nhãn ngày, lịch mẫu lặp theo thứ/giờ.
let weekOffset = 0;
// ID lượt tàu đang chọn trên biểu đồ, bảng và khung chi tiết.
let selected = null;

// Lấy phần tử DOM bằng CSS selector.
const $ = s => document.querySelector(s);
// Quy đổi day + hour thành tổng giờ tính từ 00:00 Thứ 2.
const h = (d, hr) => d * 24 + hr;
// Định dạng giờ trong ngày thành HH:mm.
const fmtH = v => { const hh = Math.floor(v) % 24, mm = Math.round((v % 1) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
// Định dạng thứ + giờ, kể cả lượt tàu kéo dài sang ngày sau.
const fmtDT = v => DAYS[Math.floor(v / 24) % 7].replace('Thứ ', 'T').replace('Chủ nhật', 'CN') + ' ' + fmtH(v);
// Escape văn bản từ JSON trước khi ghép vào innerHTML hoặc SVG.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Lấy ngày Thứ 2 của tuần đang xem theo múi giờ trình duyệt. */
function baseMonday() {
	const d = new Date();
	const diff = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - diff + weekOffset * 7);
	d.setHours(0, 0, 0, 0);
	return d;
}
/** Lấy Date của ngày thứ dayIdx trong tuần đang xem. */
function dateOf(dayIdx) { const d = baseMonday(); d.setDate(d.getDate() + dayIdx); return d; }
// Định dạng ngày/tháng trên thanh chuyển tuần và trục thời gian.
const dm = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');

/** Điều chỉnh tỷ lệ biểu đồ cho desktop, điện thoại dọc và điện thoại xoay ngang. */
function updateResponsiveScale() {
	const compactLandscape = window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
	const mobile = window.matchMedia('(max-width: 720px)').matches;
	HOUR_PX = compactLandscape ? 7 : (mobile ? 8 : 9);
	M_PX = compactLandscape ? 0.28 : (mobile ? 0.36 : 0.45);
	CHART_W = 168 * HOUR_PX;
	QUAY_H = QUAY_LEN * M_PX;
	SVG_H = HEAD_H + QUAY_H + PAD_B;
}

/** Thêm thời gian, trạng thái và danh sách xung đột vào bản sao mỗi lượt tàu. */
function enrich() {
	// Đổi thời gian từng tàu sang giờ tính từ đầu tuần để so sánh.
	const calls = data.calls.map(c => {
		const start = h(c.ata.day, c.ata.hour);
		const o = { ...c, start, end: start + c.dur, conflicts: [], warnings: BerthDomain.warnings(c, QUAY_CONFIG) };
		if (c.window) {
			o.wStart = h(c.window.day, c.window.hour);
			o.wEnd = o.wStart + c.window.dur;
			o.delta = start - o.wStart;
			o.status = Math.abs(o.delta) <= (c.tol || 0) ? 'ok' : (o.delta > 0 ? 'late' : 'early');
		} else {
			o.status = 'adhoc'; o.delta = null;
		}
		return o;
	});
	// Xung đột khi trùng thời gian và khoảng cách giữa hai tàu nhỏ hơn SAFETY_GAP.
	// Mỗi đoạn bến được nới SAFETY_GAP/2 về hai phía để so sánh đối xứng.
	for (let i = 0; i < calls.length; i++) {
		for (let j = i + 1; j < calls.length; j++) {
		const a = calls[i], b = calls[j];
				const timeOverlap = a.start < b.end && b.start < a.end;
			const spaceOverlap = (a.from - SAFETY_GAP / 2) < (b.to + SAFETY_GAP / 2) && (b.from - SAFETY_GAP / 2) < (a.to + SAFETY_GAP / 2);
			if (timeOverlap && spaceOverlap) { a.conflicts.push(b.id); b.conflicts.push(a.id); }
		}
	}
	return calls;
}

/** Tính KPI toàn tuần, không phụ thuộc bộ lọc tuyến đang chọn. */
function metrics(calls) {
	// mh là tổng mét·giờ; vùng chồng lấn vẫn cộng riêng cho từng tàu.
	// conflicts đếm tàu có xung đột, không đếm số cặp xung đột.
	let mh = 0, delaySum = 0, onWindow = 0, scheduled = 0, conflicts = 0;
	calls.forEach(c => {
		mh += c.dur * (c.to - c.from);
		if (c.window) { scheduled++; if (c.status === 'ok') onWindow++; if (c.delta > 0) delaySum += c.delta; }
		if (c.conflicts.length) conflicts++;
	});
	return {
		util: mh / (168 * QUAY_LEN) * 100,
		calls: calls.length,
		adherence: scheduled ? onWindow / scheduled * 100 : 0,
		delay: delaySum,
		conflicts
	};
}

/** Vẽ trục mét và các phân đoạn bến trong SVG cố định bên trái. */
function renderAxis() {
	const s = ['<svg xmlns="http://www.w3.org/2000/svg" width="74" height="' + SVG_H + '">'];
	s.push('<text x="66" y="18" text-anchor="end" font-size="11.5" fill="#6E7B85">Mét</text>');
	for (const m of [...Array.from({ length: Math.ceil(QUAY_LEN / 100) }, (_, i) => i * 100), QUAY_LEN]) {
		const y = HEAD_H + m * M_PX;
		s.push(`<line x1="60" y1="${y}" x2="66" y2="${y}" stroke="#CFD3CE"/>`);
		s.push(`<text x="55" y="${y + 4}" text-anchor="end" font-size="11.5" font-family="IBM Plex Mono, monospace" fill="#6E7B85">${m}</text>`);
	}
	(data.berths || []).forEach(b => {
		const y1 = HEAD_H + b.from * M_PX, y2 = HEAD_H + b.to * M_PX;
		s.push(`<line x1="70" y1="${y1 + 3}" x2="70" y2="${y2 - 3}" stroke="#16212B" stroke-width="2"/>`);
		s.push(`<text x="14" y="${(y1 + y2) / 2 + 4}" font-size="12" font-weight="500" fill="#16212B">${esc(b.code)}</text>`);
	});
	s.push('</svg>');
	$('#axisSvg').outerHTML = s.join('').replace('<svg ', '<svg id="axisSvg" ');
}

/** Vẽ lưới thời gian, khung triều, cửa sổ cam kết và lượt tàu vào SVG chính. */
function renderChart(calls) {
	// Checkbox chỉ điều khiển hiển thị; khung triều chưa được dùng để báo xung đột.
	const showW = $('#showWindow').checked;
	const showT = $('#showTide').checked;
	const svc = $('#filterSvc').value;
	// Đổi giờ/mét sang tọa độ SVG theo tỷ lệ ở đầu file.
	const x = t => t * HOUR_PX;
	const y = m => HEAD_H + m * M_PX;
	const s = [`<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${SVG_H}">`];

	if (showT) (data.tideWindows || []).forEach(t => {
		const x1 = x(h(t.day, t.from)), x2 = x(h(t.day, t.to));
		s.push(`<rect x="${x1}" y="${HEAD_H}" width="${x2 - x1}" height="${QUAY_H}" fill="#EAF1F4"/>`);
	});

	for (let d = 0; d < 7; d++) {
		const x0 = x(d * 24);
		s.push(`<line x1="${x0}" y1="26" x2="${x0}" y2="${HEAD_H + QUAY_H}" stroke="#CFD3CE"/>`);
		s.push(`<text x="${x0 + 8}" y="18" font-size="12.5" font-weight="600" fill="#16212B">${DAYS[d]}</text>`);
		s.push(`<text x="${x0 + 8 + DAYS[d].length * 7.6}" y="18" font-size="11.5" font-family="IBM Plex Mono, monospace" fill="#6E7B85">${dm(dateOf(d))}</text>`);
		for (let hr = 0; hr < 24; hr += 6) {
			const xh = x(d * 24 + hr);
			if (hr) s.push(`<line x1="${xh}" y1="30" x2="${xh}" y2="${HEAD_H + QUAY_H}" stroke="#E3E5E1"/>`);
			s.push(`<text x="${xh + 3}" y="40" font-size="10.5" font-family="IBM Plex Mono, monospace" fill="#94A0A9">${String(hr).padStart(2, '0')}</text>`);
		}
	}
	s.push(`<line x1="0" y1="${HEAD_H}" x2="${CHART_W}" y2="${HEAD_H}" stroke="#16212B"/>`);
	for (let m = 100; m < QUAY_LEN; m += 100) s.push(`<line x1="0" y1="${y(m)}" x2="${CHART_W}" y2="${y(m)}" stroke="#F0F1EE"/>`);
	(data.berths || []).forEach(b => { if (b.to < QUAY_LEN) s.push(`<line x1="0" y1="${y(b.to)}" x2="${CHART_W}" y2="${y(b.to)}" stroke="#D8DBD6" stroke-dasharray="6 5"/>`); });

	// Viền nét đứt là cửa sổ hợp đồng; khối màu là thời gian chiếm cầu dự kiến.
	if (showW) calls.forEach(c => {
		if (!c.window) return;
		if (svc && c.service !== svc) return;
		s.push(`<rect x="${x(c.wStart)}" y="${y(c.from)}" width="${x(c.wEnd) - x(c.wStart)}" height="${(c.to - c.from) * M_PX}" fill="none" stroke="#4E7FA3" stroke-width="1" stroke-dasharray="5 4" rx="2"/>`);
	});

	calls.forEach(c => {
		// Giữ tàu ngoài tuyến lọc trên biểu đồ nhưng làm mờ để thấy bối cảnh.
		const dim = svc && c.service !== svc;
		const bad = c.conflicts.length > 0;
		// Màu khối SVG được khai báo tại đây; chú giải tương ứng nằm trong public/css/berth-window.css.
		const fill = bad ? '#F5DED9' : (c.window ? '#DCE6EE' : '#F5E6C8');
		const line = bad ? '#A63A2C' : (c.window ? '#4E7FA3' : '#B5791E');
		const txt = bad ? '#7C2A1E' : (c.window ? '#26506E' : '#8C5D14');
		const bx = x(c.start), bw = Math.max(6, x(c.end) - x(c.start));
		const by = y(c.from), bh = (c.to - c.from) * M_PX;
		const isSel = selected === c.id;
		s.push(`<g class="callg" data-id="${esc(c.id)}" opacity="${dim ? 0.18 : 1}">`);
		s.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="2" fill="${fill}" stroke="${isSel ? '#16212B' : line}" stroke-width="${isSel ? 2 : 1}"/>`);
		if (bw > 58 && bh > 24) {
			s.push(`<text x="${bx + 8}" y="${by + 18}" font-size="12.5" font-weight="600" fill="${txt}">${esc(c.vessel)}</text>`);
			if (bh > 40) s.push(`<text x="${bx + 8}" y="${by + 34}" font-size="11.5" font-family="IBM Plex Mono, monospace" fill="${txt}" opacity=".8">${c.service ? esc(c.service) + ' · ' : ''}${c.from}–${c.to} m</text>`);
			if (bh > 58) s.push(`<text x="${bx + 8}" y="${by + 50}" font-size="11.5" font-family="IBM Plex Mono, monospace" fill="${txt}" opacity=".7">${fmtH(c.start)}→${fmtH(c.end)} · ${c.cranes} cẩu</text>`);
		}
		s.push(`<title>${esc(c.vessel)} — ${fmtDT(c.start)} → ${fmtDT(c.end)}, ${c.from}–${c.to} m</title></g>`);
	});

	s.push('</svg>');
	const el = $('#chartSvg');
	el.outerHTML = s.join('').replace('<svg ', '<svg id="chartSvg" role="img" aria-label="Biểu đồ cửa sổ cầu bến theo thời gian" ');
	// outerHTML thay các node SVG nên phải gắn lại sự kiện click sau mỗi lần vẽ.
	document.querySelectorAll('.callg').forEach(g => g.addEventListener('click', () => select(g.dataset.id)));
}

/** Hiển thị năm KPI đã tính trong các ô thông tin. */
function renderKpis(m) {
	const tiles = [
		{ v: m.util.toFixed(1) + '%', l: 'Khai thác mét·giờ cầu bến' },
		{ v: m.calls, l: 'Lượt tàu trong tuần' },
		{ v: m.adherence.toFixed(0) + '%', l: 'Cập đúng cửa sổ' },
		{ v: m.delay.toFixed(1) + ' h', l: 'Tổng giờ cập trễ' },
		{ v: m.conflicts, l: 'Lượt tàu có xung đột', warn: m.conflicts > 0 }
	];
	$('#kpis').innerHTML = tiles.map(t => `<div class="kpi${t.warn ? ' warn' : ''}"><div class="v">${t.v}</div><div class="l">${t.l}</div></div>`).join('');
}

// Ánh xạ trạng thái sang class CSS và nhãn tiếng Việt trong bảng.
const STATUS = { ok: ['p-ok', 'Đúng cửa sổ'], late: ['p-late', 'Cập trễ'], early: ['p-late', 'Cập sớm'], adhoc: ['p-adhoc', 'Vãng lai'] };

/** Vẽ danh sách theo tuyến đang lọc và cho phép chọn bằng chuột/bàn phím. */
function renderTable(calls) {
	const svc = $('#filterSvc').value;
	const rows = calls.filter(c => !svc || c.service === svc).sort((a, b) => a.start - b.start).map(c => {
		const st = c.conflicts.length ? ['p-bad', 'Xung đột'] : STATUS[c.status];
		const dl = c.delta === null ? '—' : (c.delta > 0 ? '+' : '') + c.delta.toFixed(1) + ' h';
		return `<tr data-id="${esc(c.id)}" class="${selected === c.id ? 'sel' : ''}" tabindex="0">
      <td>${esc(c.vessel)}</td><td>${c.service ? esc(c.service) : '—'}</td>
      <td class="num">${c.from}–${c.to}</td>
      <td class="num">${c.window ? fmtDT(c.wStart) : '—'}</td>
      <td class="num">${fmtDT(c.start)}</td>
      <td class="num">${dl}</td>
      <td><span class="pill ${st[0]}">${st[1]}</span>${c.warnings.length ? `<br><span class="pill p-late">Kiểm tra tiếp nhận</span>` : ""}</td>
      <td class="call-actions"><button class="btn" type="button" data-view-call="${esc(c.id)}" aria-label="Xem ${esc(c.vessel)}">Xem</button> <button class="btn" type="button" data-edit-call="${esc(c.id)}" aria-label="Sửa ${esc(c.vessel)}">Sửa</button> <button class="btn btn-danger" type="button" data-delete-call="${esc(c.id)}" aria-label="Xóa ${esc(c.vessel)}">Xóa</button></td></tr>`;
	}).join('');
	$('#callTable tbody').innerHTML = rows || '<tr><td colspan="8" class="empty-row">Không có lượt tàu nào khớp bộ lọc.</td></tr>';
	document.querySelectorAll('#callTable tbody tr[data-id]').forEach(tr => {
		tr.addEventListener('click', event => { if (!event.target.closest('button')) select(tr.dataset.id); });
		tr.addEventListener('keydown', e => { if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(tr.dataset.id); } });
	});
  bindCallActions();
}

/** Hiển thị chi tiết tàu đang chọn và tên các tàu xung đột. */
function renderDetail(calls) {
	const c = calls.find(x => x.id === selected);
	if (!c) { $('#detail').innerHTML = '<div class="empty">Chưa chọn lượt tàu nào.</div>'; return; }
	const rows = [
		['Tuyến', c.service ? c.service + ' · ' + c.line : c.line],
		['Cửa sổ cam kết', c.window ? fmtDT(c.wStart) + ' → ' + fmtDT(c.wEnd) : 'Không có'],
		['Giờ dự kiến', fmtDT(c.start) + ' → ' + fmtDT(c.end)],
		['Thời gian tại bến', c.dur.toFixed(1) + ' giờ'],
		['Vị trí dọc cầu', c.from + ' – ' + c.to + ' m'],
		['Số chuyến', c.voyage || 'Chưa cung cấp'],
		['DWT', c.dwt ?? 'Chưa cung cấp'],
		['LOA / mớn nước', c.loa + ' m / ' + c.draft + ' m'],
		['Cẩu bố trí', c.cranes],
		['Sản lượng dự kiến', c.moves + ' moves'],
		['Năng suất yêu cầu', (c.moves / c.dur).toFixed(1) + ' moves/h'],
		['Năng suất mỗi cẩu', (c.moves / c.dur / c.cranes).toFixed(1) + ' moves/cẩu/h']
	];
	const conf = c.conflicts.length
		? `<div class="conflictbox"><b>Xung đột vị trí cập.</b> Chồng lấn cả thời gian lẫn đoạn cầu bến (đã tính khoảng an toàn ${SAFETY_GAP} m) với: ${c.conflicts.map(id => esc(calls.find(k => k.id === id).vessel)).join(', ')}.</div>`
		: '';
	$('#detail').innerHTML = `<h3>${esc(c.vessel)}</h3><div class="vsl">${esc(c.id)} · ${c.window ? 'lượt theo cửa sổ' : 'lượt vãng lai'}</div>
    <dl>${rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>${conf}${c.warnings.length ? `<div class="conflictbox">${c.warnings.map(esc).join("<br>")}<br>Cần kiểm tra điều kiện tiếp nhận.</div>` : ""}`;
}

/** Chọn hoặc bỏ chọn một lượt tàu rồi vẽ lại giao diện. */
function select(id) { selected = selected === id ? null : id; draw(); }

/** Tính dữ liệu và cập nhật mọi vùng hiển thị sau mỗi thay đổi. */
function draw() {
	if (!data) return;
	QUAY_CONFIG = BerthDomain.quay(data);
	QUAY_LEN = QUAY_CONFIG.length;
	SAFETY_GAP = QUAY_CONFIG.safetyGap;
	$('#quaySummary').textContent = `Tuyến cầu 0–${QUAY_LEN} m · ${QUAY_CONFIG.physicalBerthCount ?? 'Chưa rõ số'} cầu thực tế · ${data.berths.length} đoạn ảo · khoảng an toàn ${SAFETY_GAP} m`;
	updateResponsiveScale();
	const calls = enrich();
	// Tạo lại danh sách tuyến từ dữ liệu mới nhưng giữ lựa chọn hiện tại nếu còn hợp lệ.
	const svcs = [...new Set(data.calls.map(c => c.service).filter(Boolean))].sort();
	const cur = $('#filterSvc').value;
	$('#filterSvc').innerHTML = '<option value="">Tất cả</option>' + svcs.map(s => `<option${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
	const a = dateOf(0), b = dateOf(6);
	$('#range').textContent = dm(a) + ' - ' + dm(b) + '/' + b.getFullYear();
	renderAxis();
	renderChart(calls);
	renderKpis(metrics(calls));
	renderTable(calls);
	renderDetail(calls);
}

// Chuyển tuần chỉ đổi mốc ngày; snapshot lưu lịch theo thứ và giờ tương đối.
$('#prevw').onclick = () => { weekOffset--; draw(); };

$('#nextw').onclick = () => { weekOffset++; draw(); };

// Vẽ lại khi thay checkbox hoặc bộ lọc tuyến.
['showWindow', 'showTide', 'filterSvc'].forEach(id => $('#' + id).addEventListener('change', draw));

/** Bật chế độ chỉ hiển thị tool; Fullscreen API là tăng cường tùy trình duyệt. */
const fullscreenToggle = $('#fullscreenToggle');
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
const requestNativeFullscreen = document.documentElement.requestFullscreen
	? () => document.documentElement.requestFullscreen()
	: (document.documentElement.webkitRequestFullscreen ? () => document.documentElement.webkitRequestFullscreen() : null);
const exitNativeFullscreen = document.exitFullscreen
	? () => document.exitFullscreen()
	: (document.webkitExitFullscreen ? () => document.webkitExitFullscreen() : null);

function setFocusMode(enabled) {
	document.body.classList.toggle('berth-focus-mode', enabled);
	fullscreenToggle.setAttribute('aria-pressed', String(enabled));
	fullscreenToggle.setAttribute('aria-label', enabled ? 'Thoát chế độ toàn màn hình' : 'Mở Berth Window toàn màn hình');
	fullscreenToggle.title = enabled ? 'Thoát toàn màn hình' : 'Mở toàn màn hình';
	draw();
}

fullscreenToggle.addEventListener('click', async () => {
	const enabled = document.body.classList.contains('berth-focus-mode');
	if (enabled) {
		setFocusMode(false);
		if (fullscreenElement() && exitNativeFullscreen) {
			try { await exitNativeFullscreen(); } catch (_) { /* CSS focus mode đã được tắt. */ }
		}
		return;
	}

	setFocusMode(true);
	if (requestNativeFullscreen) {
		try { await requestNativeFullscreen(); } catch (_) { /* Safari/iOS vẫn dùng CSS focus mode. */ }
	}
});

function syncFullscreenExit() {
	if (!fullscreenElement() && document.body.classList.contains('berth-focus-mode')) setFocusMode(false);
}

document.addEventListener('fullscreenchange', syncFullscreenExit);
document.addEventListener('webkitfullscreenchange', syncFullscreenExit);
document.addEventListener('keydown', event => {
	if (event.key === 'Escape' && !fullscreenElement() && document.body.classList.contains('berth-focus-mode')) {
		setFocusMode(false);
	}
});

let resizeTimer;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => {
		const hoursFromWeekStart = $('#scroller').scrollLeft / HOUR_PX;
		draw();
		$('#scroller').scrollLeft = hoursFromWeekStart * HOUR_PX;
	}, 120);
});

// Mở bảng JSON và điền dữ liệu đang được hiển thị.
$('#toggleIO').onclick = () => {
	if (!data) return;
	const p = $('#ioPanel'); p.classList.toggle('hidden');
	if (!p.classList.contains('hidden')) $('#jsonBox').value = JSON.stringify(data, null, 2);
};

/** Gọi API và đưa người dùng về trang đăng nhập nếu phiên đã hết hạn. */
async function apiFetch(url, options = {}) {
	const mutation = options.method && options.method !== 'GET';
	if (mutation && dataSaving) throw new Error('Đang lưu dữ liệu, vui lòng chờ.');
	if (mutation) {
		dataSaving = true;
		$('#inputControls').inert = true;
		$('#callForm').inert = true;
		$('#callListPanel').inert = true;
	}
	try {
		const response = await fetch(url, {
			...options,
			headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
		});
		if (response.status === 401) {
			window.location.assign('/login');
			throw new Error('Phiên đăng nhập đã hết hạn.');
		}
		const payload = await response.json();
		if (!response.ok) throw new Error(payload.message || 'Không thể xử lý yêu cầu.');
		return payload;
	} finally {
		if (mutation) {
			dataSaving = false;
			$('#inputControls').inert = !data;
			$('#callForm').inert = false;
			$('#callListPanel').inert = false;
		}
	}
}

/** Lấy dữ liệu berth window đang lưu trong SQLite. */
async function loadData() {
	try {
		const record = await apiFetch('/api/berth-window');
		data = record.data;
		selected = null;
		renderInputs();
		inputMessage('Đã tải dữ liệu.');
		draw();
	} catch (e) {
		$('#ioPanel').classList.remove('hidden');
		$('#inputMsg').textContent = 'Chưa tải được dữ liệu. Hãy tải lại trang.';
		$('#ioMsg').textContent = 'Không tải được dữ liệu: ' + e.message;
		$('#ioMsg').className = 'msg err';
		draw();
	}
}

// Kiểm tra JSON ở trình duyệt rồi lưu dữ liệu qua API vào SQLite.
$('#applyJson').onclick = async () => {
	const button = $('#applyJson');
	try {
		const parsed = JSON.parse($('#jsonBox').value);
		button.disabled = true;
		const record = await apiFetch('/api/berth-window', { method: 'PUT', body: JSON.stringify(parsed) });
		data = record.data;
		selected = null;
		renderInputs();
		$('#jsonBox').value = JSON.stringify(data, null, 2);
		draw();
		$('#ioMsg').textContent = record.message;
		$('#ioMsg').className = 'msg';
	} catch (e) {
		$('#ioMsg').textContent = 'Không lưu được JSON: ' + e.message;
		$('#ioMsg').className = 'msg err';
	} finally {
		button.disabled = false;
	}
};

// Khôi phục dữ liệu mẫu ở server và xóa lựa chọn hiện tại.
$('#resetJson').onclick = async () => {
	if (!window.confirm('Khởi tạo lại cấu hình tuyến cầu 380 m và xóa toàn bộ danh mục, lịch tàu hiện tại?')) return;
	const button = $('#resetJson');
	try {
		button.disabled = true;
		const record = await apiFetch('/api/berth-window/reset', { method: 'POST', body: '{}' });
		data = record.data;
		selected = null;
		renderInputs();
		$('#jsonBox').value = JSON.stringify(data, null, 2);
		draw();
		$('#ioMsg').textContent = record.message;
		$('#ioMsg').className = 'msg';
	} catch (e) {
		$('#ioMsg').textContent = 'Không thể khôi phục: ' + e.message;
		$('#ioMsg').className = 'msg err';
	} finally {
		button.disabled = false;
	}
};

// Sao chép nguyên nội dung ô JSON.
$('#copyJson').onclick = async () => {
	try {
		await navigator.clipboard.writeText($('#jsonBox').value);
		$('#ioMsg').textContent = 'Đã sao chép.';
		$('#ioMsg').className = 'msg';
	} catch (e) {
		$('#ioMsg').textContent = 'Trình duyệt không cho phép sao chép tự động.';
		$('#ioMsg').className = 'msg err';
	}
};

// Form thao tác trên cùng snapshot đang được biểu đồ sử dụng.
const field = (form, name) => form.elements.namedItem(name);
const numberValue = (form, name) => Number(field(form, name).value);
const optionalNumber = (form, name) => field(form, name).value === '' ? null : numberValue(form, name);
// randomUUID cần secure context; getRandomValues vẫn hỗ trợ trang HTTP trong LAN.
const newId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
function inputMessage(message, error = false) {
  for (const selector of ['#inputMsg', '#callListMsg', '#callFormMsg']) {
    $(selector).textContent = message;
    $(selector).classList.toggle('err', error);
  }
}
function sectionRow(section = { code: '', from: 0, to: 0 }) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="section-code" aria-label="Tên cầu ảo" required value="${esc(section.code)}"></td>
    <td><input class="section-number section-from" aria-label="Vị trí bắt đầu" type="number" min="0" step="any" required value="${section.from}"></td>
    <td><input class="section-number section-to" aria-label="Vị trí kết thúc" type="number" min="0" step="any" required value="${section.to}"></td>
    <td class="section-length"></td><td><button type="button" class="btn">Xóa</button></td>`;
  const update = () => { tr.querySelector('.section-length').textContent = Number(tr.querySelector('.section-to').value) - Number(tr.querySelector('.section-from').value); };
  tr.addEventListener('input', update);
  tr.querySelector('button').onclick = () => tr.remove();
  update();
  $('#sectionRows').append(tr);
}
function renderInputs() {
  const q = BerthDomain.quay(data), form = $('#quayForm');
  field(form, 'terminal').value = data.terminal;
  for (const [name, value] of Object.entries(q)) {
    const input = field(form, name);
    if (input) input.value = value ?? '';
  }
  $('#sectionRows').replaceChildren();
  data.berths.forEach(sectionRow);
  const vessels = data.vessels || [];
  $('#vesselRows').innerHTML = vessels.map(v => `<tr><td>${esc(v.name)}</td><td>${esc(v.imo || '—')}</td><td>${v.loa}</td><td>${v.dwt ?? 'Chưa cung cấp'}</td><td>${BerthDomain.warnings(v, q).map(esc).join('<br>') || '—'}</td><td><button class="btn" type="button" data-vessel="${esc(v.id)}">Sửa</button></td></tr>`).join('') || '<tr><td colspan="6">Chưa có tàu trong danh mục.</td></tr>';
  document.querySelectorAll('[data-vessel]').forEach(button => { button.onclick = () => {
    const vessel = vessels.find(v => v.id === button.dataset.vessel);
    for (const name of ['id', 'name', 'imo', 'loa', 'dwt']) field($('#vesselForm'), name).value = vessel[name] ?? '';
  }; });
  const callForm = $('#callForm');
  field(callForm, 'vesselId').innerHTML = '<option value="">Chọn tàu</option>' + vessels.map(v => `<option value="${esc(v.id)}">${esc(v.name)} · ${v.loa} m</option>`).join('')
    + data.calls.filter(c => !c.vesselId).map(c => `<option value="snapshot:${esc(c.id)}">${esc(c.vessel)} · ${c.loa} m (lượt ${esc(c.id)})</option>`).join('');
  field(callForm, 'section').innerHTML = '<option value="">Chọn đoạn gợi ý</option>' + data.berths.map((b, i) => `<option value="${i}">${esc(b.code)} (${b.from}–${b.to} m)</option>`).join('');
  $('#inputControls').inert = false;
  $('#addCall').disabled = false;
  updateCallPreview();
}
async function saveCandidate(candidate) {
  try {
    const record = await apiFetch('/api/berth-window', { method: 'PUT', body: JSON.stringify(candidate) });
    data = record.data;
    selected = null;
    renderInputs();
    draw();
    $('#jsonBox').value = JSON.stringify(data, null, 2);
    inputMessage(record.message);
    return true;
  } catch (error) { inputMessage(error.message, true); return false; }
}
$('#addSection').onclick = () => sectionRow({ code: '', from: data.berths.at(-1)?.to || 0, to: BerthDomain.quay(data).length });
$('#quayForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget, candidate = structuredClone(data);
  candidate.terminal = field(form, 'terminal').value.trim();
  candidate.quay = { ...BerthDomain.quay(data) };
  for (const name of ['length', 'physicalBerthCount', 'safetyGap']) candidate.quay[name] = numberValue(form, name);
  for (const name of ['depth', 'turningBasin', 'maxLoa', 'maxDwt']) candidate.quay[name] = optionalNumber(form, name);
  for (const name of ['depthDatum', 'turningBasinMeasurement', 'capacitySource']) candidate.quay[name] = field(form, name).value.trim();
  candidate.berths = [...document.querySelectorAll('#sectionRows tr')].map(tr => ({
    code: tr.querySelector('.section-code').value.trim(),
    from: Number(tr.querySelector('.section-from').value), to: Number(tr.querySelector('.section-to').value)
  }));
  await saveCandidate(candidate);
};
$('#clearVessel').onclick = () => $('#vesselForm').reset();
$('#vesselForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget, candidate = structuredClone(data);
  candidate.vessels ||= [];
  const vessel = { id: field(form, 'id').value || newId(), name: field(form, 'name').value.trim(),
    imo: field(form, 'imo').value.trim(), loa: numberValue(form, 'loa'), dwt: optionalNumber(form, 'dwt') };
  const index = candidate.vessels.findIndex(v => v.id === vessel.id);
  if (index < 0) candidate.vessels.push(vessel); else candidate.vessels[index] = vessel;
  if (await saveCandidate(candidate)) {
    form.reset();
    const warnings = BerthDomain.warnings(vessel, BerthDomain.quay(data));
    inputMessage(warnings.length ? `Đã lưu tàu. ${warnings.join(' ')}` : 'Đã lưu tàu.');
  }
};
function bindCallActions() {
  document.querySelectorAll('[data-view-call]').forEach(button => { button.onclick = () => {
    selected = button.dataset.viewCall;
    draw();
    $('#detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }; });
  document.querySelectorAll('[data-edit-call]').forEach(button => { button.onclick = () => editCall(button.dataset.editCall); });
  document.querySelectorAll('[data-delete-call]').forEach(button => { button.onclick = () => deleteCall(button.dataset.deleteCall); });
}
async function deleteCall(id) {
  if (!data || dataSaving) return;
  const call = data.calls.find(c => c.id === id);
  if (!call || !window.confirm(`Xóa lượt tàu ${call.vessel} (${call.id}) khỏi kế hoạch?`)) return;
  const candidate = structuredClone(data);
  candidate.calls = candidate.calls.filter(c => c.id !== id);
  if (await saveCandidate(candidate)) inputMessage(`Đã xóa lượt tàu ${call.vessel}.`);
}
function callSelection() {
  const form = $('#callForm');
  const existing = data.calls.find(c => c.id === field(form, 'id').value);
  const choice = field(form, 'vesselId').value;
  const vessel = (data.vessels || []).find(v => v.id === choice);
  const source = data.calls.find(c => !c.vesselId && choice === `snapshot:${c.id}`);
  const sameVessel = existing && (choice === existing.vesselId || choice === `snapshot:${existing.id}`);
  return { existing, vessel, dimensions: sameVessel ? existing : (vessel || source), sameVessel };
}
function occupiedLength(selection) {
  // Lượt đã lưu có thể dành thêm khoảng cầu ngoài LOA; giữ nguyên khi sửa lịch.
  return selection.sameVessel ? selection.existing.to - selection.existing.from : selection.dimensions.loa;
}
function updateCallPreview() {
  if (!data) return;
  const form = $('#callForm'), selection = callSelection(), dimensions = selection.dimensions;
  if (!dimensions) { $('#callEnd').textContent = '—'; $('#callPreview').textContent = ''; return; }
  const end = numberValue(form, 'from') + occupiedLength(selection);
  $('#callEnd').textContent = `${Math.round(end * 1000) / 1000} m`;
  const warnings = BerthDomain.warnings(dimensions, BerthDomain.quay(data));
  if (selection.sameVessel && !selection.existing.vesselId) warnings.unshift('Đang giữ thông số tàu của lượt đã lưu. Có thể chọn tàu từ danh mục để thay thế.');
  if (end > BerthDomain.quay(data).length) warnings.push('Vị trí kết thúc vượt chiều dài tuyến cầu.');
  $('#callPreview').textContent = warnings.join(' ');
  $('#callPreview').className = warnings.length ? 'err' : '';
}
function showCallDialog(title) {
  $('#callDialogTitle').textContent = title;
  $('#callFormMsg').textContent = '';
  $('#callFormMsg').classList.remove('err');
  updateCallPreview();
  if (!$('#callDialog').open) $('#callDialog').showModal();
}
$('#addCall').onclick = () => {
  if (!data || dataSaving) return;
  $('#callForm').reset();
  showCallDialog('Thêm lượt tàu');
  if (field($('#callForm'), 'vesselId').options.length === 1) {
    $('#callFormMsg').textContent = 'Chưa có tàu trong danh mục. Hãy đóng form và thêm tàu tại mục Danh mục tàu trước.';
  }
};
$('#closeCall').onclick = () => { if (!dataSaving) $('#callDialog').close(); };
$('#callDialog').addEventListener('cancel', event => { if (dataSaving) event.preventDefault(); });
$('#callForm').addEventListener('input', updateCallPreview);
field($('#callForm'), 'section').onchange = event => {
  if (event.target.value !== '') field($('#callForm'), 'from').value = data.berths[Number(event.target.value)].from;
  updateCallPreview();
};
function callTimeValue(hour) {
  const minutes = Math.min(1439, Math.round(hour * 60));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function editCall(id) {
  if (!data || dataSaving) return;
  const c = data.calls.find(c => c.id === id), form = $('#callForm');
  if (!c) return;
  form.reset();
  const choices = field(form, 'vesselId');
  for (const name of ['id', 'voyage', 'service', 'line', 'dur', 'from', 'draft', 'cranes', 'moves']) field(form, name).value = c[name] ?? '';
  choices.value = c.vesselId || `snapshot:${c.id}`;
  field(form, 'day').value = c.ata.day;
  field(form, 'hour').value = callTimeValue(c.ata.hour);
  showCallDialog(`Sửa lượt tàu · ${c.vessel}`);
}
$('#callForm').onsubmit = async event => {
  event.preventDefault();
  if (dataSaving) return;
  const form = event.currentTarget, candidate = structuredClone(data);
  const selection = callSelection(), { existing, vessel, dimensions, sameVessel } = selection;
  if (!dimensions) { inputMessage('Hãy chọn tàu trong danh mục.', true); return; }
  const id = existing?.id || newId();
  const [hours, minutes] = field(form, 'hour').value.split(':').map(Number);
  const hour = existing && field(form, 'hour').value === callTimeValue(existing.ata.hour) ? existing.ata.hour : hours + minutes / 60;
  const from = numberValue(form, 'from');
  const call = { ...(existing || {}), id,
    vessel: sameVessel ? existing.vessel : (vessel?.name || dimensions.vessel),
    loa: dimensions.loa, dwt: dimensions.dwt ?? null, imo: dimensions.imo || '',
    voyage: field(form, 'voyage').value.trim(), service: field(form, 'service').value.trim() || null,
    line: field(form, 'line').value.trim(), window: existing?.window || null, tol: existing?.tol || 0,
    ata: { day: numberValue(form, 'day'), hour }, dur: numberValue(form, 'dur'),
    from, to: Math.round((from + occupiedLength(selection)) * 1000000) / 1000000,
    draft: numberValue(form, 'draft'), cranes: numberValue(form, 'cranes'), moves: numberValue(form, 'moves') };
  if (!sameVessel) {
    if (vessel) call.vesselId = vessel.id;
    else delete call.vesselId;
  }
  const index = candidate.calls.findIndex(c => c.id === id);
  if (index < 0) candidate.calls.push(call); else candidate.calls[index] = call;
  if (await saveCandidate(candidate)) {
    form.reset();
    $('#callDialog').close();
    // Lượt vừa lưu cần nhìn thấy kể cả khi bộ lọc trước đó đang chọn tuyến khác.
    $('#filterSvc').value = '';
    selected = id;
    draw();
    inputMessage(existing ? `Đã cập nhật lượt tàu ${call.vessel}.` : `Đã thêm lượt tàu ${call.vessel}.`);
  }
};

// Khởi tạo từ dữ liệu SQLite khi trang quản trị sẵn sàng.
loadData().then(() => { $('#scroller').scrollLeft = 0; });
