(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BerthDates = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DAY_MS = 86400000;
  const MAX_DAYS = 30;
  function parse(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ngày phải có định dạng YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1000) throw new Error('Ngày không hợp lệ.');
    return date;
  }
  const key = date => date.toISOString().slice(0, 10);
  const add = (value, days) => { const date = parse(value); date.setUTCDate(date.getUTCDate() + days); return key(date); };
  const diff = (start, end) => Math.round((parse(end) - parse(start)) / DAY_MS);
  const weekday = value => (parse(value).getUTCDay() + 6) % 7;
  const monday = value => add(value, -weekday(value));
  function range(start, end) {
    const days = diff(start, end) + 1;
    if (days < 1 || days > MAX_DAYS) throw new Error(`Chọn từ 1 đến ${MAX_DAYS} ngày, tính cả ngày bắt đầu và kết thúc.`);
    return { start, end, days };
  }
  function today(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).reduce((out, p) => ({ ...out, [p.type]: p.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const label = value => { const [y, m, d] = value.split('-'); return `${d}/${m}/${y}`; };
  return { MAX_DAYS, parse, key, add, diff, weekday, monday, range, today, label };
});
