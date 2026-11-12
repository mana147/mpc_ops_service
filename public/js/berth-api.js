/* Giao tiếp API dùng chung cho trang lịch và trang cấu hình. */
(function () {
  'use strict';
  window.BerthApi = {
    async request(url, options = {}) {
      const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
      if (response.status === 401) {
        window.location.assign('/login');
        throw new Error('Phiên đăng nhập đã hết hạn.');
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Không thể xử lý yêu cầu.');
      return payload;
    }
  };
})();
