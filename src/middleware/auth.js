'use strict';

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn.' });
  }
  return res.redirect('/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) return res.redirect('/admin/berth-window');
  return next();
}

module.exports = { requireAuth, redirectIfAuthenticated };
