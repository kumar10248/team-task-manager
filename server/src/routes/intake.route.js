const express = require('express');
const router = express.Router();
const intake = require('../controllers/intake.controller');
const { publicIntakeLimiter } = require('../middleware/rateLimit.middleware');

// Public endpoints for client intake
router.get('/:projectId/info', intake.getPublicProjectInfo);
router.post('/:projectId', publicIntakeLimiter, intake.submitPublicTicket);

module.exports = router;
