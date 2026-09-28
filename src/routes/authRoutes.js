'use strict';

const express = require('express');
const { redirectIfAuthenticated, requireAuth } = require('../middleware/auth');

function createAuthRoutes(controller) {
  const router = express.Router();
  router.get('/login', redirectIfAuthenticated, controller.showLogin);
  router.post('/login', redirectIfAuthenticated, controller.login);
  router.post('/logout', requireAuth, controller.logout);
  return router;
}

module.exports = createAuthRoutes;
