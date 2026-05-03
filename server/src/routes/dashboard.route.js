const express = require('express');
const router = express.Router();
const dashboard = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', dashboard.getDashboard);
router.get('/project/:projectId', dashboard.getProjectDashboard);

module.exports = router;