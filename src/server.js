'use strict';

require('dotenv').config();
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
const app = createApp();
const server = app.listen(port, () => {
  console.log(`MPC Ops Service đang chạy tại http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    app.locals.sessionStore.close();
    app.locals.db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
