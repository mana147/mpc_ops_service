'use strict';

const bcrypt = require('bcryptjs');

function createAuthController({ userModel }) {
  return {
    showLogin(req, res) {
      res.render('auth/login', { title: 'Đăng nhập quản trị', error: null, username: '' });
    },

    login(req, res, next) {
      const body = req.body || {};
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const user = userModel.findByUsername(username);
      const valid = user && bcrypt.compareSync(password, user.password_hash);

      if (!valid) {
        return res.status(401).render('auth/login', {
          title: 'Đăng nhập quản trị',
          error: 'Tên đăng nhập hoặc mật khẩu không đúng.',
          username
        });
      }

      return req.session.regenerate(error => {
        if (error) return next(error);
        req.session.user = { id: user.id, username: user.username, role: user.role };
        return req.session.save(saveError => {
          if (saveError) return next(saveError);
          return res.redirect('/admin/berth-window');
        });
      });
    },

    logout(req, res, next) {
      req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('mpc.sid');
        return res.redirect('/login');
      });
    }
  };
}

module.exports = createAuthController;
