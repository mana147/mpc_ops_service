'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');

function createAdminRoutes(controller) {
  const router = express.Router();
  router.use(requireAuth);
  router.get('/', controller.showDashboard);
  router.get('/berth-window', controller.showBerthWindow);
  router.get('/berth-window/settings', controller.showBerthSettings);
  return router;
}

module.exports = createAdminRoutes;
