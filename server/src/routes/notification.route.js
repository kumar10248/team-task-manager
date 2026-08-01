const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', notificationController.getNotifications);
router.put('/read', notificationController.markAsRead);

module.exports = router;
