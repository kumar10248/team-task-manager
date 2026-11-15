const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/admin.middleware');

// All admin routes require authentication + Super Admin role
router.use(protect);
router.use(requireSuperAdmin);

router.get('/metrics', adminController.getMetrics);
router.get('/users', adminController.getUsers);
router.patch('/users/:id/subscription', adminController.updateUserSubscription);
router.patch('/users/:id/role', adminController.toggleSuperAdmin);
router.get('/projects', adminController.getProjects);

module.exports = router;
