// Tổng chiều dài cầu bến (m); khi đổi, cập nhật cả berths/calls trong SEED.
const QUAY_LEN = 900;
// Khoảng cách an toàn tối thiểu giữa hai tàu (m).
const SAFETY_GAP = 25;
// Tỷ lệ trục ngang: pixel cho một giờ.
const HOUR_PX = 9;
// Tỷ lệ trục dọc: pixel cho một mét cầu bến.
const M_PX = 0.45;
// Chiều cao vùng nhãn ngày/giờ của SVG (pixel).
const HEAD_H = 46;
// Khoảng đệm dưới cùng của SVG (pixel).
const PAD_B = 16;
// Chiều rộng biểu đồ của 7 ngày x 24 giờ.
const CHART_W = 168 * HOUR_PX;
// Chiều cao vùng cầu bến sau khi đổi mét sang pixel.
const QUAY_H = QUAY_LEN * M_PX;
// Tổng chiều cao SVG: nhãn + cầu bến + đệm.
const SVG_H = HEAD_H + QUAY_H + PAD_B;
// Chỉ số day trong JSON: 0 là Thứ 2, 6 là Chủ nhật.
const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

// Dữ liệu mẫu và cấu trúc JSON đầu vào. berths/calls dùng mét; dur/tol dùng giờ.
// hour dùng giờ thập phân (7.5 = 07:30); window = null là tàu vãng lai.
// ata là thời điểm bắt đầu khối tàu trên biểu đồ; dur là thời gian chiếm cầu.
// Một call còn có id, vessel, service, line, from/to, loa, draft, cranes, moves.
// Khi đổi cấu trúc call, xem thêm enrich(), renderTable() và renderDetail().
const SEED = {
	terminal: 'Cầu bến container số 2',
	berths: [
		{ code: 'B1', from: 0, to: 300 },
		{ code: 'B2', from: 300, to: 600 },
		{ code: 'B3', from: 600, to: 900 }
	],
	tideWindows: [
		{ day: 0, from: 2.5, to: 7.0 }, { day: 0, from: 14.5, to: 19.0 },
		{ day: 1, from: 3.2, to: 7.8 }, { day: 1, from: 15.2, to: 19.8 },
		{ day: 2, from: 4.0, to: 8.5 }, { day: 2, from: 16.0, to: 20.5 },
		{ day: 3, from: 4.8, to: 9.2 }, { day: 3, from: 16.8, to: 21.2 },
		{ day: 4, from: 5.5, to: 10.0 }, { day: 4, from: 17.5, to: 22.0 },
		{ day: 5, from: 6.2, to: 10.8 }, { day: 5, from: 18.2, to: 22.8 },
		{ day: 6, from: 7.0, to: 11.5 }, { day: 6, from: 19.0, to: 23.5 }
	],
	calls: [
		{ id: 'C1', vessel: 'MSC ANNA', service: 'CIX', line: 'Ocean Line', window: { day: 0, hour: 8, dur: 22 }, ata: { day: 0, hour: 7.7 }, dur: 22, from: 0, to: 350, loa: 294, draft: 11.0, cranes: 3, moves: 1450, tol: 3 },
		{ id: 'C2', vessel: 'EVER LEADER', service: 'VTX', line: 'Trans Pacific', window: { day: 0, hour: 16, dur: 22 }, ata: { day: 0, hour: 21.5 }, dur: 22, from: 380, to: 700, loa: 300, draft: 12.2, cranes: 3, moves: 1620, tol: 3 },
		{ id: 'C3', vessel: 'CMA LOTUS', service: 'MCS', line: 'Med Service', window: { day: 1, hour: 10, dur: 21 }, ata: { day: 1, hour: 10.2 }, dur: 21, from: 0, to: 300, loa: 255, draft: 10.4, cranes: 2, moves: 980, tol: 3 },
		{ id: 'C4', vessel: 'ONE HARBOUR', service: 'FEX', line: 'Far East Exp', window: { day: 1, hour: 22, dur: 18 }, ata: { day: 1, hour: 21.0 }, dur: 18, from: 730, to: 900, loa: 172, draft: 8.6, cranes: 2, moves: 640, tol: 3 },
		{ id: 'C5', vessel: 'HYUNDAI TERRA', service: 'NBX', line: 'North Bound', window: { day: 2, hour: 9, dur: 20 }, ata: { day: 2, hour: 13.0 }, dur: 20, from: 380, to: 680, loa: 277, draft: 11.6, cranes: 3, moves: 1310, tol: 3 },
		{ id: 'C6', vessel: 'VAN LOI 09', service: null, line: 'Nội địa', window: null, ata: { day: 2, hour: 12.0 }, dur: 11, from: 0, to: 180, loa: 132, draft: 6.2, cranes: 1, moves: 210, tol: 0 },
		{ id: 'C7', vessel: 'WAN HAI 316', service: 'SCX', line: 'South China', window: { day: 3, hour: 6, dur: 20 }, ata: { day: 3, hour: 6.0 }, dur: 20, from: 0, to: 330, loa: 268, draft: 10.8, cranes: 3, moves: 1120, tol: 3 },
		{ id: 'C8', vessel: 'HAI AN VIEW', service: null, line: 'Feeder', window: null, ata: { day: 3, hour: 5.0 }, dur: 9, from: 300, to: 460, loa: 145, draft: 7.4, cranes: 1, moves: 290, tol: 0 },
		{ id: 'C9', vessel: 'MAERSK KOTA', service: 'CMX', line: 'China Mainline', window: { day: 4, hour: 8, dur: 20 }, ata: { day: 4, hour: 9.3 }, dur: 20, from: 400, to: 720, loa: 299, draft: 12.0, cranes: 3, moves: 1540, tol: 3 },
		{ id: 'C10', vessel: 'SITC HANSHIN', service: 'ANX', line: 'Asia Network', window: { day: 5, hour: 10, dur: 16 }, ata: { day: 5, hour: 10.0 }, dur: 16, from: 0, to: 280, loa: 172, draft: 9.1, cranes: 2, moves: 720, tol: 3 },
		{ id: 'C11', vessel: 'KMTC JAKARTA', service: 'KTX', line: 'Korea Trunk', window: { day: 5, hour: 18, dur: 18 }, ata: { day: 6, hour: 1.0 }, dur: 18, from: 420, to: 760, loa: 262, draft: 11.2, cranes: 3, moves: 1180, tol: 3 },
		{ id: 'C12', vessel: 'SÔNG CẤM 5', service: null, line: 'Sà lan', window: null, ata: { day: 6, hour: 6.0 }, dur: 8, from: 0, to: 120, loa: 92, draft: 4.8, cranes: 1, moves: 120, tol: 0 }
	]
};

// Bản dữ liệu đang hiển thị. SEED chỉ là phương án dự phòng nếu API chưa phản hồi.
let data = JSON.parse(JSON.stringify(SEED));
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

/** Thêm thời gian, trạng thái và danh sách xung đột vào bản sao mỗi lượt tàu. */
function enrich() {
	// Đổi thời gian từng tàu sang giờ tính từ đầu tuần để so sánh.
	const calls = data.calls.map(c => {
		const start = h(c.ata.day, c.ata.hour);
		const o = { ...c, start, end: start + c.dur, conflicts: [] };
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
	for (let m = 0; m <= QUAY_LEN; m += 100) {
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

	// Viền nét đứt là cửa sổ hợp đồng; khối màu là thời gian cập thực tế.
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
		s.push(`<g class="callg" data-id="${c.id}" opacity="${dim ? 0.18 : 1}">`);
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
		return `<tr data-id="${c.id}" class="${selected === c.id ? 'sel' : ''}" tabindex="0">
      <td>${esc(c.vessel)}</td><td>${c.service ? esc(c.service) : '—'}</td>
      <td class="num">${c.from}–${c.to}</td>
      <td class="num">${c.window ? fmtDT(c.wStart) : '—'}</td>
      <td class="num">${fmtDT(c.start)}</td>
      <td class="num">${dl}</td>
      <td><span class="pill ${st[0]}">${st[1]}</span></td></tr>`;
	}).join('');
	$('#callTable tbody').innerHTML = rows || '<tr><td colspan="7" class="empty-row">Không có lượt tàu nào khớp bộ lọc.</td></tr>';
	document.querySelectorAll('#callTable tbody tr[data-id]').forEach(tr => {
		tr.addEventListener('click', () => select(tr.dataset.id));
		tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(tr.dataset.id); } });
	});
}

/** Hiển thị chi tiết tàu đang chọn và tên các tàu xung đột. */
function renderDetail(calls) {
	const c = calls.find(x => x.id === selected);
	if (!c) { $('#detail').innerHTML = '<div class="empty">Chưa chọn lượt tàu nào.</div>'; return; }
	const rows = [
		['Tuyến', c.service ? c.service + ' · ' + c.line : c.line],
		['Cửa sổ cam kết', c.window ? fmtDT(c.wStart) + ' → ' + fmtDT(c.wEnd) : 'Không có'],
		['Cập / rời thực tế', fmtDT(c.start) + ' → ' + fmtDT(c.end)],
		['Thời gian tại bến', c.dur.toFixed(1) + ' giờ'],
		['Vị trí dọc cầu', c.from + ' – ' + c.to + ' m'],
		['LOA / mớn nước', c.loa + ' m / ' + c.draft + ' m'],
		['Cẩu bố trí', c.cranes],
		['Sản lượng dự kiến', c.moves + ' moves'],
		['Năng suất yêu cầu', (c.moves / c.dur).toFixed(1) + ' moves/h'],
		['Năng suất mỗi cẩu', (c.moves / c.dur / c.cranes).toFixed(1) + ' moves/cẩu/h']
	];
	const conf = c.conflicts.length
		? `<div class="conflictbox"><b>Xung đột vị trí cập.</b> Chồng lấn cả thời gian lẫn đoạn cầu bến (đã tính khoảng an toàn ${SAFETY_GAP} m) với: ${c.conflicts.map(id => esc(calls.find(k => k.id === id).vessel)).join(', ')}.</div>`
		: '';
	$('#detail').innerHTML = `<h3>${esc(c.vessel)}</h3><div class="vsl">${c.id} · ${c.window ? 'lượt theo cửa sổ' : 'lượt vãng lai'}</div>
    <dl>${rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>${conf}`;
}

/** Chọn hoặc bỏ chọn một lượt tàu rồi vẽ lại giao diện. */
function select(id) { selected = selected === id ? null : id; draw(); }

/** Tính dữ liệu và cập nhật mọi vùng hiển thị sau mỗi thay đổi. */
function draw() {
	const calls = enrich();
	// Tạo lại danh sách tuyến từ dữ liệu mới nhưng giữ lựa chọn hiện tại nếu còn hợp lệ.
	const svcs = [...new Set(data.calls.map(c => c.service).filter(Boolean))].sort();
	const cur = $('#filterSvc').value;
	$('#filterSvc').innerHTML = '<option value="">Tất cả</option>' + svcs.map(s => `<option${s === cur ? ' selected' : ''}>${s}</option>`).join('');
	const a = dateOf(0), b = dateOf(6);
	$('#range').textContent = dm(a) + ' - ' + dm(b) + '/' + b.getFullYear();
	renderAxis();
	renderChart(calls);
	renderKpis(metrics(calls));
	renderTable(calls);
	renderDetail(calls);
}

// Chuyển tuần chỉ đổi mốc ngày; SEED lưu lịch theo thứ và giờ tương đối.
$('#prevw').onclick = () => { weekOffset--; draw(); };

$('#nextw').onclick = () => { weekOffset++; draw(); };

// Vẽ lại khi thay checkbox hoặc bộ lọc tuyến.
['showWindow', 'showTide', 'filterSvc'].forEach(id => $('#' + id).addEventListener('change', draw));

// Mở bảng JSON và điền dữ liệu đang được hiển thị.
$('#toggleIO').onclick = () => {
	const p = $('#ioPanel'); p.classList.toggle('hidden');
	if (!p.classList.contains('hidden')) $('#jsonBox').value = JSON.stringify(data, null, 2);
};

/** Gọi API và đưa người dùng về trang đăng nhập nếu phiên đã hết hạn. */
async function apiFetch(url, options = {}) {
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
}

/** Lấy dữ liệu berth window đang lưu trong SQLite. */
async function loadData() {
	try {
		const record = await apiFetch('/api/berth-window');
		data = record.data;
		selected = null;
		draw();
	} catch (e) {
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
	if (!window.confirm('Khôi phục dữ liệu mẫu và ghi đè dữ liệu hiện tại?')) return;
	const button = $('#resetJson');
	try {
		button.disabled = true;
		const record = await apiFetch('/api/berth-window/reset', { method: 'POST', body: '{}' });
		data = record.data;
		selected = null;
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

// Khởi tạo từ dữ liệu SQLite khi trang quản trị sẵn sàng.
loadData().then(() => { $('#scroller').scrollLeft = 0; });
