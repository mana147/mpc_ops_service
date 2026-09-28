'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');

function createApiRoutes(controller) {
  const router = express.Router();
  router.use(requireAuth);
  router.get('/berth-window', controller.get);
  router.put('/berth-window', controller.update);
  router.post('/berth-window/reset', controller.reset);
  return router;
}

module.exports = createApiRoutes;
