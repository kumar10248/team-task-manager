const express = require('express');
const router = express.Router();
const intake = require('../controllers/intake.controller');

// Public endpoints for client intake
router.get('/:projectId/info', intake.getPublicProjectInfo);
router.post('/:projectId', intake.submitPublicTicket);

module.exports = router;
