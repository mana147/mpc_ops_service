'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');

function createAdminRoutes(controller) {
  const router = express.Router();
  router.use(requireAuth);
  router.get('/berth-window', controller.showBerthWindow);
  return router;
}

module.exports = createAdminRoutes;
