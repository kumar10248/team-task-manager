const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { protect } = require('../middleware/auth.middleware');

// Public Webhook listener (bypasses auth token)
router.post('/webhook', subscriptionController.handleWebhook);

// Protected routes
router.use(protect);

router.get('/', subscriptionController.getSubscription);
router.post('/create-order', subscriptionController.createOrder);
router.post('/verify-payment', subscriptionController.verifyPayment);
router.post('/cancel', subscriptionController.cancelSubscription);
router.post('/reset-trial', subscriptionController.resetTrial);
router.post('/expire-trial', subscriptionController.expireTrial);

module.exports = router;
