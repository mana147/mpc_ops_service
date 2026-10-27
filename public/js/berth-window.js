// Kích thước lấy từ cấu hình mỗi lần vẽ.
let QUAY_LEN = 0;
// Khoảng cách an toàn tối thiểu giữa hai tàu (m).
let SAFETY_GAP = 0;
// Tỷ lệ trục ngang: pixel cho một giờ.
let HOUR_PX = 9;
// Tỷ lệ trục dọc: pixel cho một mét cầu bến.
let M_PX = 0.45;
// Chiều cao vùng nhãn ngày/giờ của SVG (pixel).
const HEAD_H = 46;
// Khoảng đệm dưới cùng của SVG (pixel).
const PAD_B = 16;
// Chiều rộng biểu đồ theo số ngày được chọn.
let CHART_W = 24 * HOUR_PX;
// Chiều cao vùng cầu bến sau khi đổi mét sang pixel.
let QUAY_H = QUAY_LEN * M_PX;
// Tổng chiều cao SVG: nhãn + cầu bến + đệm.
let SVG_H = HEAD_H + QUAY_H + PAD_B;
// Thứ dùng để ghi nhãn; day trên phép chiếu tính từ ngày bắt đầu khoảng chọn.
const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

// Chỉ hiển thị dữ liệu đã tải thành công từ API.
let data = null;
let QUAY_CONFIG;
let dataSaving = false;
let displayRange = BerthDates.range(BerthDates.today(), BerthDates.today());
let dataLoading = false;
// ID lượt tàu đang chọn trên biểu đồ, bảng và khung chi tiết.
let selected = null;
// Thời điểm đang xem trên sơ đồ cầu bến 2D, độc lập với dữ liệu kế hoạch.
const MINUTES_PER_DAY = 24 * 60;
const BERTH_2D_TRANSITION_HOURS = 1;
const BERTH_2D_PLAY_STEP_MINUTES = 3;
const BERTH_2D_PLAY_TICK_MS = 100;
const currentClock = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).reduce((out, p) => ({ ...out, [p.type]: p.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
};
let berth2dWeekMinute = currentClock();
const rangeEndMinute = () => displayRange.days * MINUTES_PER_DAY - 1;
let berth2dTimer = null;

// Lấy phần tử DOM bằng CSS selector.
const $ = s => document.querySelector(s);
// Quy đổi day + hour thành tổng giờ tính từ 00:00 ngày bắt đầu khoảng chọn.
const h = (d, hr) => d * 24 + hr;
// Định dạng giờ trong ngày thành HH:mm.
const fmtH = v => { const minutes = ((Math.round(v * 60) % 1440) + 1440) % 1440; return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'); };
// Định dạng thứ + giờ, kể cả lượt tàu kéo dài sang ngày sau.
const fmtDT = v => BerthDates.label(dateOf(Math.floor(v / 24))) + ' ' + fmtH(v);
// Escape văn bản từ JSON trước khi ghép vào innerHTML hoặc SVG.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const dateOf = dayIdx => BerthDates.add(displayRange.start, dayIdx);
const dm = value => BerthDates.label(value).slice(0, 5);
const rangeApiUrl = range => `/api/berth-window/range?start=${range.start}&end=${range.end}`;
function renderWeekRange() {
	const { start, end, days } = displayRange;
	$('#range').textContent = start === end ? BerthDates.label(start) : `${BerthDates.label(start)} – ${BerthDates.label(end)}`;
	$('#range').title = `${days} ngày · Bấm để chọn khoảng thời gian`;
	$('#prevw').setAttribute('aria-label', `Lùi ${days} ngày`);
	$('#nextw').setAttribute('aria-label', `Tiến ${days} ngày`);
}

/** Điều chỉnh tỷ lệ biểu đồ cho desktop, điện thoại dọc và điện thoại xoay ngang. */
function updateResponsiveScale() {
	const compactLandscape = window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
	const mobile = window.matchMedia('(max-width: 720px)').matches;
	HOUR_PX = Math.max(compactLandscape ? 7 : (mobile ? 8 : 9), $('#scroller').clientWidth / (displayRange.days * 24));
	M_PX = compactLandscape ? 0.28 : (mobile ? 0.36 : 0.45);
	CHART_W = displayRange.days * 24 * HOUR_PX;
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

/** Tính KPI trong khoảng chọn, không phụ thuộc bộ lọc tuyến. */
function metrics(calls) {
	// mh là tổng mét·giờ; vùng chồng lấn vẫn cộng riêng cho từng tàu.
	// conflicts đếm tàu có xung đột, không đếm số cặp xung đột.
	let mh = 0, delaySum = 0, onWindow = 0, scheduled = 0, conflicts = 0;
	calls.forEach(c => {
		mh += Math.max(0, Math.min(c.end, displayRange.days * 24) - Math.max(c.start, 0)) * (c.to - c.from);
		if (c.window) { scheduled++; if (c.status === 'ok') onWindow++; if (c.delta > 0) delaySum += c.delta; }
		if (c.conflicts.length) conflicts++;
	});
	return {
		util: QUAY_LEN > 0 ? mh / (displayRange.days * 24 * QUAY_LEN) * 100 : 0,
		calls: calls.length,
		adherence: scheduled ? onWindow / scheduled * 100 : 0,
		delay: delaySum,
		conflicts
	};
}

/** Vẽ trục mét và các phân đoạn bến trong SVG cố định bên trái. */
function renderAxis() {
	if (!QUAY_LEN) {
		$('#axisSvg').replaceChildren();
		$('#axisSvg').setAttribute('width', '74');
		$('#axisSvg').setAttribute('height', '150');
		return;
	}
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
	if (!QUAY_LEN) {
		$('#chartSvg').outerHTML = '<svg id="chartSvg" role="img" aria-label="Chưa cấu hình cầu bến" width="100%" height="150"><text x="10" y="75" font-size="13" fill="#6E7B85">Chưa cấu hình cầu bến.</text></svg>';
		return;
	}
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

	for (let d = 0; d < displayRange.days; d++) {
		const x0 = x(d * 24);
		const dayLabel = DAYS[BerthDates.weekday(dateOf(d))];
		s.push(`<line x1="${x0}" y1="26" x2="${x0}" y2="${HEAD_H + QUAY_H}" stroke="#CFD3CE"/>`);
		s.push(`<text x="${x0 + 8}" y="18" font-size="12.5" font-weight="600" fill="#16212B">${dayLabel}</text>`);
		s.push(`<text x="${x0 + 8 + dayLabel.length * 7.6}" y="18" font-size="11.5" font-family="IBM Plex Mono, monospace" fill="#6E7B85">${dm(dateOf(d))}</text>`);
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
		const start = Math.max(0, c.wStart), end = Math.min(displayRange.days * 24, c.wEnd);
		if (end <= start) return;
		s.push(`<rect x="${x(start)}" y="${y(c.from)}" width="${x(end) - x(start)}" height="${(c.to - c.from) * M_PX}" fill="none" stroke="#4E7FA3" stroke-width="1" stroke-dasharray="5 4" rx="2"/>`);
	});

	calls.forEach(c => {
		// Giữ tàu ngoài tuyến lọc trên biểu đồ nhưng làm mờ để thấy bối cảnh.
		const dim = svc && c.service !== svc;
		const bad = c.conflicts.length > 0;
		// Màu khối SVG được khai báo tại đây; chú giải tương ứng nằm trong public/css/berth-window.css.
		const fill = bad ? '#F5DED9' : (c.window ? '#DCE6EE' : '#F5E6C8');
		const line = bad ? '#A63A2C' : (c.window ? '#4E7FA3' : '#B5791E');
		const txt = bad ? '#7C2A1E' : (c.window ? '#26506E' : '#8C5D14');
		const bx = x(Math.max(0, c.start)), bw = x(Math.min(displayRange.days * 24, c.end)) - bx;
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

/** Đồng bộ thanh thời gian toàn tuần và nhãn thời điểm đang xem. */
function renderBerth2dControls() {
	berth2dWeekMinute = Math.max(0, Math.min(rangeEndMinute(), berth2dWeekMinute));
	const day = Math.floor(berth2dWeekMinute / MINUTES_PER_DAY);
	const minute = berth2dWeekMinute % MINUTES_PER_DAY;
	const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
	$('#berth2dRange').max = rangeEndMinute();
	$('#berth2dRange').value = berth2dWeekMinute;
	$('#berth2dMoment').textContent = `${DAYS[BerthDates.weekday(dateOf(day))]} ${BerthDates.label(dateOf(day))} · ${clock}`;
	const step = Math.max(1, Math.ceil(displayRange.days / 7));
	$('#berth2dDays').innerHTML = Array.from({ length: displayRange.days }, (_, i) => i)
		.filter(i => i % step === 0 || i === displayRange.days - 1)
		.map(i => `<span style="left:${i / Math.max(1, displayRange.days - 1) * 100}%">${dm(dateOf(i))}</span>`).join('');
}

/** Vẽ ảnh chụp 2D của cầu bến tại một thời điểm trong tuần. */
function renderBerth2d(calls) {
	renderBerth2dControls();
	if (!QUAY_LEN) {
		stopBerth2dPlayback();
		$('#berth2dSvg').replaceChildren();
		$('#berth2dSvg').setAttribute('height', '0');
		$('#berth2dSummary').textContent = 'Chưa cấu hình cầu bến. Vui lòng nhập tuyến cầu trước.';
		return;
	}
	const moment = berth2dWeekMinute / 60;
	const visible = calls.map(call => ({ ...call, motion: BerthDomain.berthMotionAt(call, moment, BERTH_2D_TRANSITION_HOURS) }))
		.filter(call => call.motion);
	const active = visible.filter(call => call.motion.phase === 'berthed');
	const activeIds = new Set(active.map(call => call.id));
	const placed = BerthDomain.berthLanes(visible, SAFETY_GAP);
	const laneCount = Math.max(1, ...placed.map(item => item.lane + 1));
	const width = Math.max(820, $('#berth2dView').clientWidth - 2);
	const shipHeight = 54;
	const laneGap = 12;
	const quayY = Math.max(220, laneCount * (shipHeight + laneGap) + 64);
	const height = quayY + 96;
	const left = 48;
	const right = 32;
	const quayWidth = width - left - right;
	const x = metre => left + metre / QUAY_LEN * quayWidth;
	const svc = $('#filterSvc').value;
	const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`];

	svg.push(`<rect width="${width}" height="${quayY}" fill="#EAF3F6"/>`);
	for (let waveY = 42; waveY < quayY - 30; waveY += 54) {
		let wavePath = `M0 ${waveY}`;
		for (let waveX = 0; waveX < width; waveX += 56) wavePath += ` Q ${waveX + 28} ${waveY - 5} ${waveX + 56} ${waveY}`;
		svg.push(`<path d="${wavePath}" stroke="#D6E7EC" fill="none" opacity=".72"/>`);
	}
	svg.push(`<text x="${left}" y="25" font-size="11" font-weight="600" fill="#6E7B85" letter-spacing="1.4">MẶT NƯỚC · HÌNH CHIẾU BẰNG</text>`);

	placed.forEach(({ call, lane }) => {
		const bx = x(call.from);
		const bw = Math.max(2, x(call.to) - bx);
		const berthY = quayY - 18 - shipHeight - lane * (shipHeight + laneGap);
		const motionDistance = Math.min(100, Math.max(70, quayY * .3));
		const motionOffset = call.motion.phase === 'approaching'
			? -motionDistance * (1 - call.motion.progress)
			: (call.motion.phase === 'departing' ? -motionDistance * call.motion.progress : 0);
		const by = berthY + motionOffset;
		const conflictsNow = call.conflicts.some(id => activeIds.has(id));
		const warning = call.warnings.length > 0;
		const fill = conflictsNow ? '#F5DED9' : (warning ? '#F5E6C8' : '#DCE6EE');
		const stroke = conflictsNow ? '#A63A2C' : (warning ? '#B5791E' : '#4E7FA3');
		const text = conflictsNow ? '#7C2A1E' : (warning ? '#8C5D14' : '#26506E');
		const dim = svc && call.service !== svc;
		const motionOpacity = call.motion.phase === 'approaching'
			? .15 + .85 * call.motion.progress
			: (call.motion.phase === 'departing' ? Math.max(.05, 1 - call.motion.progress) : 1);
		const opacity = motionOpacity * (dim ? .22 : 1);
		const isSelected = selected === call.id;
		const labelLimit = Math.max(4, Math.floor((bw - 12) / 7));
		const vesselLabel = call.vessel.length > labelLimit ? `${call.vessel.slice(0, labelLimit - 1)}…` : call.vessel;
		const phaseLabel = call.motion.phase === 'approaching' ? 'đang cập bến' : (call.motion.phase === 'departing' ? 'đang rời bến' : 'đang tại cầu');
		const movingClass = call.motion.phase === 'berthed' ? '' : ' is-moving';
		svg.push(`<g class="berth-ship${movingClass}" data-id="${esc(call.id)}" role="button" tabindex="0" opacity="${opacity}" aria-label="Chọn tàu ${esc(call.vessel)}, ${phaseLabel}">`);
		if (call.motion.phase === 'berthed') svg.push(`<line x1="${bx + bw / 2}" y1="${by + shipHeight}" x2="${bx + bw / 2}" y2="${quayY}" stroke="${stroke}" stroke-dasharray="3 3" opacity=".55"/>`);
		svg.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${shipHeight}" rx="${Math.min(20, bw / 3)}" fill="${fill}" stroke="${isSelected ? '#16212B' : stroke}" stroke-width="${isSelected ? 3 : 1.5}"/>`);
		if (bw >= 50) svg.push(`<text x="${bx + bw / 2}" y="${by + 23}" text-anchor="middle" font-size="12" font-weight="600" fill="${text}">${esc(vesselLabel)}</text>`);
		if (bw >= 122) svg.push(`<text x="${bx + bw / 2}" y="${by + 40}" text-anchor="middle" font-size="10.5" font-family="IBM Plex Mono, monospace" fill="${text}" opacity=".82">${call.motion.phase === 'berthed' ? `${call.from}–${call.to} m${call.service ? ` · ${esc(call.service)}` : ''}` : phaseLabel}</text>`);
		svg.push(`<title>${esc(call.vessel)} — ${phaseLabel}; dự kiến ${fmtDT(call.start)} → ${fmtDT(call.end)}, vị trí ${call.from}–${call.to} m</title></g>`);
	});

	svg.push(`<rect x="${left}" y="${quayY}" width="${quayWidth}" height="48" fill="#D9D7CE" stroke="#8B8C85"/>`);
	(data.berths || []).forEach((berth, index) => {
		const sectionX = x(berth.from);
		const sectionWidth = x(berth.to) - sectionX;
		svg.push(`<rect x="${sectionX}" y="${quayY}" width="${sectionWidth}" height="48" fill="${index % 2 ? '#C9C8C1' : '#D9D7CE'}" stroke="#8B8C85"/>`);
		if (sectionWidth >= 40) svg.push(`<text x="${sectionX + sectionWidth / 2}" y="${quayY + 29}" text-anchor="middle" font-size="12" font-weight="600" fill="#3E4C58">${esc(berth.code)}</text>`);
	});
	const tickStep = QUAY_LEN <= 500 ? 50 : 100;
	for (let metre = 0; metre <= QUAY_LEN; metre += tickStep) {
		const tickX = x(metre);
		svg.push(`<line x1="${tickX}" y1="${quayY + 48}" x2="${tickX}" y2="${quayY + 55}" stroke="#6E7B85"/>`);
		svg.push(`<text x="${tickX}" y="${quayY + 72}" text-anchor="middle" font-size="10.5" font-family="IBM Plex Mono, monospace" fill="#6E7B85">${metre} m</text>`);
	}
	if (QUAY_LEN % tickStep !== 0) {
		svg.push(`<text x="${x(QUAY_LEN)}" y="${quayY + 72}" text-anchor="end" font-size="10.5" font-family="IBM Plex Mono, monospace" fill="#6E7B85">${QUAY_LEN} m</text>`);
	}
	if (!visible.length) svg.push(`<text x="${width / 2}" y="${quayY / 2}" text-anchor="middle" font-size="14" fill="#6E7B85">Không có tàu dự kiến tại hoặc gần cầu ở thời điểm này.</text>`);
	svg.push('</svg>');

	$('#berth2dSvg').outerHTML = svg.join('').replace('<svg ', '<svg id="berth2dSvg" role="img" aria-label="Sơ đồ nhìn từ trên xuống của cầu bến và tàu dự kiến hiện diện" ');
	const conflicted = active.filter(call => call.conflicts.some(id => activeIds.has(id))).length;
	const approaching = visible.filter(call => call.motion.phase === 'approaching').length;
	const departing = visible.filter(call => call.motion.phase === 'departing').length;
	const selectedVisible = visible.find(call => call.id === selected);
	$('#berth2dSummary').textContent = `${active.length} tàu tại cầu · ${approaching} đang cập · ${departing} đang rời · ${conflicted} tàu có xung đột${selectedVisible ? ` · Đã chọn ${selectedVisible.vessel}` : ''}.`;
	document.querySelectorAll('.berth-ship').forEach(ship => {
		ship.addEventListener('click', () => select(ship.dataset.id));
		ship.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(ship.dataset.id); }
		});
	});
}

/** Hiển thị năm KPI đã tính trong các ô thông tin. */
function renderKpis(m) {
	const tiles = [
		{ v: m.util.toFixed(1) + '%', l: 'Khai thác mét·giờ cầu bến' },
		{ v: m.calls, l: 'Lượt tàu trong khoảng chọn' },
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
	$('#quaySummary').textContent = QUAY_LEN > 0
		? `Tuyến cầu 0–${QUAY_LEN} m · ${QUAY_CONFIG.physicalBerthCount ?? 'Chưa rõ số'} cầu thực tế · ${data.berths.length} đoạn ảo · khoảng an toàn ${SAFETY_GAP} m`
		: 'Chưa cấu hình cầu bến. Vui lòng nhập tuyến cầu để bắt đầu.';
	$('#berth2dPlay').disabled = QUAY_LEN <= 0;
	updateResponsiveScale();
	const calls = enrich();
	// Tạo lại danh sách tuyến từ dữ liệu mới nhưng giữ lựa chọn hiện tại nếu còn hợp lệ.
	const svcs = [...new Set(data.calls.map(c => c.service).filter(Boolean))].sort();
	const cur = $('#filterSvc').value;
	$('#filterSvc').innerHTML = '<option value="">Tất cả</option>' + svcs.map(s => `<option${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
	renderWeekRange();
	renderAxis();
	renderChart(calls);
	renderBerth2d(calls);
	renderKpis(metrics(calls));
	renderTable(calls);
	renderDetail(calls);
}

/** Hai mũi tên dịch theo đúng độ dài khoảng đang xem. */
async function changeWeek(delta) {
	if (dataSaving || dataLoading) return;
	const shift = delta * displayRange.days;
	await loadData(BerthDates.range(BerthDates.add(displayRange.start, shift), BerthDates.add(displayRange.end, shift)));
}

$('#prevw').onclick = () => changeWeek(-1);

$('#nextw').onclick = () => changeWeek(1);

// Vẽ lại khi thay checkbox hoặc bộ lọc tuyến.
['showWindow', 'showTide', 'filterSvc'].forEach(id => $('#' + id).addEventListener('change', draw));

/** Dừng mô phỏng thời gian và khôi phục trạng thái nút phát. */
function stopBerth2dPlayback() {
	if (berth2dTimer) clearInterval(berth2dTimer);
	berth2dTimer = null;
	$('#berth2dPlay').textContent = 'Phát ▶';
	$('#berth2dPlay').setAttribute('aria-pressed', 'false');
}

/** Chuyển giữa biểu đồ tuần và ảnh chụp cầu bến, không tải lại dữ liệu. */
function switchBerthView(view) {
	const showTimeline = view === 'timeline';
	$('#timelineView').hidden = !showTimeline;
	$('#berth2dView').hidden = showTimeline;
	$('#timelineTab').classList.toggle('is-active', showTimeline);
	$('#timelineTab').setAttribute('aria-selected', String(showTimeline));
	$('#berth2dTab').classList.toggle('is-active', !showTimeline);
	$('#berth2dTab').setAttribute('aria-selected', String(!showTimeline));
	if (showTimeline) stopBerth2dPlayback();
	else if (data) renderBerth2d(enrich());
}

$('#timelineTab').onclick = () => switchBerthView('timeline');
$('#berth2dTab').onclick = () => switchBerthView('berth2d');
$('#berth2dRange').oninput = event => {
	berth2dWeekMinute = Number(event.target.value);
	if (data) renderBerth2d(enrich());
};
$('#berth2dPlay').onclick = () => {
	if (berth2dTimer) { stopBerth2dPlayback(); return; }
	$('#berth2dPlay').textContent = 'Tạm dừng ❚❚';
	$('#berth2dPlay').setAttribute('aria-pressed', 'true');
	berth2dTimer = setInterval(() => {
		if (berth2dWeekMinute >= rangeEndMinute()) { stopBerth2dPlayback(); return; }
		berth2dWeekMinute = Math.min(rangeEndMinute(), berth2dWeekMinute + BERTH_2D_PLAY_STEP_MINUTES);
		if (data) renderBerth2d(enrich());
	}, BERTH_2D_PLAY_TICK_MS);
};

let resizeTimer;
window.addEventListener('resize', () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => {
		const hoursFromWeekStart = $('#scroller').scrollLeft / HOUR_PX;
		draw();
		$('#scroller').scrollLeft = hoursFromWeekStart * HOUR_PX;
	}, 120);
});

/** Gọi API và đưa người dùng về trang đăng nhập nếu phiên đã hết hạn. */
async function apiFetch(url, options = {}) {
	const mutation = options.method && options.method !== 'GET';
	if (mutation && (dataSaving || dataLoading)) throw new Error('Đang tải hoặc lưu dữ liệu, vui lòng chờ.');
	if (mutation) {
		dataSaving = true;
		$('#inputControls').inert = true;
		$('#callForm').inert = true;
		$('#callListPanel').inert = true;
		document.querySelector('.admin-weeknav').inert = true;
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
			document.querySelector('.admin-weeknav').inert = false;
		}
	}
}

/** Chỉ đổi khoảng và dữ liệu trên màn hình sau khi tải thành công. */
async function loadData(nextRange = displayRange) {
	if (dataLoading || dataSaving) return false;
	dataLoading = true;
	stopBerth2dPlayback();
	const navigationButtons = [$('#prevw'), $('#nextw'), $('#range'), $('#applyDateRange')];
	navigationButtons.forEach(button => { button.disabled = true; });
	$('#inputControls').inert = true;
	$('#callListPanel').inert = true;
	try {
		const record = await apiFetch(rangeApiUrl(nextRange));
		displayRange = nextRange;
		const today = BerthDates.today();
		berth2dWeekMinute = today >= nextRange.start && today <= nextRange.end
			? BerthDates.diff(nextRange.start, today) * MINUTES_PER_DAY + currentClock() : 0;
		data = record.data;
		selected = null;
		renderInputs();
		inputMessage(`Đang xem ${BerthDates.label(nextRange.start)} → ${BerthDates.label(nextRange.end)} (${nextRange.days} ngày).`);
		draw();
		$('#scroller').scrollLeft = 0;
		return true;
	} catch (e) {
		inputMessage(`Chưa tải được khoảng ngày: ${e.message}`, true);
		$('#dateRangeMessage').textContent = e.message;
		return false;
	} finally {
		dataLoading = false;
		$('#inputControls').inert = !data;
		$('#callListPanel').inert = false;
		navigationButtons.forEach(button => { button.disabled = false; });
	}
}

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
    if (input) input.value = name === 'length' && !q.length ? '' : (value ?? '');
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
  $('#addCall').disabled = q.length <= 0;
  updateCallPreview();
}
async function saveCandidate(candidate) {
  try {
    const record = await apiFetch(rangeApiUrl(displayRange), { method: 'PUT', body: JSON.stringify(candidate) });
    data = record.data;
    selected = null;
    renderInputs();
    draw();
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
  if (!data || dataSaving || dataLoading) return;
  $('#callForm').reset();
  const dateInput = field($('#callForm'), 'date');
  dateInput.min = displayRange.start;
  dateInput.max = displayRange.end;
  dateInput.value = displayRange.start;
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
  const dateInput = field(form, 'date');
  dateInput.value = dateOf(c.ata.day);
  dateInput.min = dateInput.value < displayRange.start ? dateInput.value : displayRange.start;
  dateInput.max = displayRange.end;
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
    ata: { day: BerthDates.diff(displayRange.start, field(form, 'date').value), hour }, dur: numberValue(form, 'dur'),
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
    const storedId = existing ? id.slice(11) : id;
    selected = data.calls.find(c => c.id === `${BerthDates.monday(dateOf(call.ata.day))}:${storedId}`)?.id || null;
    draw();
    inputMessage(existing ? `Đã cập nhật lượt tàu ${call.vessel}.` : `Đã thêm lượt tàu ${call.vessel}.`);
  }
};

// Lịch chọn khoảng ngày. Draft chỉ áp dụng sau khi người dùng bấm Áp dụng và tải thành công.
let calendarStart = displayRange.start;
let calendarEnd = displayRange.end;
let calendarMonth = displayRange.start.slice(0, 7);
let pickingEnd = false;

function renderCalendar() {
  $('#rangeStart').value = calendarStart;
  $('#rangeEnd').value = calendarEnd;
  $('#calendarMonth').value = calendarMonth;
  const gridStart = BerthDates.monday(`${calendarMonth}-01`);
  const today = BerthDates.today();
  $('#calendarDays').innerHTML = Array.from({ length: 42 }, (_, i) => {
    const date = BerthDates.add(gridStart, i);
    const edge = date === calendarStart || date === calendarEnd;
    const inside = date >= calendarStart && date <= calendarEnd;
    return `<button type="button" class="calendar-day${date.slice(0, 7) !== calendarMonth ? ' other-month' : ''}${inside ? ' in-range' : ''}${edge ? ' range-edge' : ''}${date === today ? ' is-today' : ''}" data-date="${date}" aria-label="${BerthDates.label(date)}${date === today ? ', hôm nay' : ''}" aria-pressed="${inside}"${date === today ? ' aria-current="date"' : ''}>${Number(date.slice(8))}</button>`;
  }).join('');
  try {
    const range = BerthDates.range(calendarStart, calendarEnd);
    $('#dateRangeMessage').textContent = `${range.days} ngày${pickingEnd ? ' · Chọn ngày kết thúc (có thể cùng ngày bắt đầu).' : ''}`;
    $('#dateRangeMessage').classList.remove('err');
    $('#applyDateRange').disabled = dataLoading;
  } catch (error) {
    $('#dateRangeMessage').textContent = error.message;
    $('#dateRangeMessage').classList.add('err');
    $('#applyDateRange').disabled = true;
  }
}
$('#range').onclick = () => {
  if (dataSaving || dataLoading) return;
  calendarStart = displayRange.start;
  calendarEnd = displayRange.end;
  calendarMonth = calendarStart.slice(0, 7);
  pickingEnd = false;
  renderCalendar();
  $('#dateRangeDialog').showModal();
};
$('#closeDateRange').onclick = () => { if (!dataLoading) $('#dateRangeDialog').close(); };
$('#dateRangeDialog').addEventListener('cancel', event => { if (dataLoading) event.preventDefault(); });
$('#calendarDays').onclick = event => {
  const button = event.target.closest('[data-date]');
  if (!button || dataLoading) return;
  const date = button.dataset.date;
  if (!pickingEnd) { calendarStart = date; calendarEnd = date; pickingEnd = true; }
  else {
    calendarEnd = date;
    if (calendarEnd < calendarStart) [calendarStart, calendarEnd] = [calendarEnd, calendarStart];
    pickingEnd = false;
  }
  renderCalendar();
  $('#calendarDays').querySelector(`[data-date="${date}"]`)?.focus();
};
for (const [id, delta] of [['calendarPrev', -1], ['calendarNext', 1]]) {
  $('#' + id).onclick = () => {
    const date = BerthDates.parse(`${calendarMonth}-01`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    calendarMonth = BerthDates.key(date).slice(0, 7);
    renderCalendar();
  };
}
$('#calendarMonth').onchange = event => {
  if (!event.target.value) return;
  try { BerthDates.parse(`${event.target.value}-01`); }
  catch { return; }
  calendarMonth = event.target.value;
  renderCalendar();
};
for (const id of ['rangeStart', 'rangeEnd']) $('#' + id).onchange = () => {
  calendarStart = $('#rangeStart').value;
  calendarEnd = $('#rangeEnd').value;
  if (calendarStart) calendarMonth = calendarStart.slice(0, 7);
  pickingEnd = false;
  renderCalendar();
};
$('#rangeToday').onclick = () => {
  calendarStart = calendarEnd = BerthDates.today();
  calendarMonth = calendarStart.slice(0, 7);
  pickingEnd = false;
  renderCalendar();
};
$('#rangeThisWeek').onclick = () => {
  calendarStart = BerthDates.monday(BerthDates.today());
  calendarEnd = BerthDates.add(calendarStart, 6);
  calendarMonth = calendarStart.slice(0, 7);
  pickingEnd = false;
  renderCalendar();
};
$('#dateRangeForm').onsubmit = async event => {
  event.preventDefault();
  let nextRange;
  try { nextRange = BerthDates.range($('#rangeStart').value, $('#rangeEnd').value); }
  catch (error) { $('#dateRangeMessage').textContent = error.message; return; }
  $('#dateRangeForm').inert = true;
  try { if (await loadData(nextRange)) $('#dateRangeDialog').close(); }
  finally { $('#dateRangeForm').inert = false; }
};

// Khởi tạo ở ngày hiện tại theo giờ Việt Nam.
renderWeekRange();
loadData().then(() => { $('#scroller').scrollLeft = 0; });
