'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { createDatabase } = require('./config/database');
const SQLiteSessionStore = require('./services/SQLiteSessionStore');
const User = require('./models/User');
const BerthWindow = require('./models/BerthWindow');
const createAuthController = require('./controllers/authController');
const createAdminController = require('./controllers/adminController');
const createBerthWindowApiController = require('./controllers/berthWindowApiController');
const createAuthRoutes = require('./routes/authRoutes');
const createAdminRoutes = require('./routes/adminRoutes');
const createApiRoutes = require('./routes/apiRoutes');

function createApp(options = {}) {
  const rootDir = path.resolve(__dirname, '..');
  const config = {
    databasePath: options.databasePath || process.env.DATABASE_PATH || path.join(rootDir, 'data', 'mpc_ops.sqlite'),
    adminUsername: options.adminUsername || process.env.ADMIN_USERNAME || 'admin',
    adminPassword: options.adminPassword || process.env.ADMIN_PASSWORD || 'Admin@123',
    sessionSecret: options.sessionSecret || process.env.SESSION_SECRET || 'development-only-change-this-secret',
    secureCookie: options.secureCookie ?? process.env.NODE_ENV === 'production'
  };
  if (process.env.NODE_ENV === 'production' && !options.sessionSecret && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET là bắt buộc khi chạy production.');
  }

  const db = createDatabase({
    filename: config.databasePath,
    adminUsername: config.adminUsername,
    adminPassword: config.adminPassword
  });
  const sessionStore = new SQLiteSessionStore(db);
  const userModel = new User(db);
  const berthWindowModel = new BerthWindow(db);
  const authController = createAuthController({ userModel });
  const adminController = createAdminController({ berthWindowModel });
  const apiController = createBerthWindowApiController({ berthWindowModel });

  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    name: 'mpc.sid',
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.secureCookie,
      maxAge: 8 * 60 * 60 * 1000
    }
  }));
  app.use(express.static(path.join(rootDir, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));

  app.get('/', (req, res) => res.redirect(req.session.user ? '/admin' : '/login'));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use(createAuthRoutes(authController));
  app.use('/admin', createAdminRoutes(adminController));
  app.use('/api', createApiRoutes(apiController));

  app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ message: 'Không tìm thấy API.' });
    return res.status(404).render('error', { title: 'Không tìm thấy', status: 404, message: 'Trang bạn yêu cầu không tồn tại.' });
  });

  app.use((error, req, res, _next) => {
    console.error(error);
    if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ message: 'Có lỗi nội bộ xảy ra.' });
    return res.status(500).render('error', { title: 'Lỗi hệ thống', status: 500, message: 'Có lỗi nội bộ xảy ra.' });
  });

  app.locals.db = db;
  app.locals.sessionStore = sessionStore;
  return app;
}

module.exports = { createApp };
