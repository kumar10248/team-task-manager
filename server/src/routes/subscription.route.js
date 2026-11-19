const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/admin.middleware');

// Public Webhook listener (bypasses auth token)
router.post('/webhook', subscriptionController.handleWebhook);

// Protected routes
router.use(protect);

router.get('/', subscriptionController.getSubscription);
router.post('/create-order', subscriptionController.createOrder);
router.post('/verify-payment', subscriptionController.verifyPayment);
router.post('/cancel', subscriptionController.cancelSubscription);

// Diagnostic & Debug endpoints: strictly disabled for regular users in production
if (process.env.NODE_ENV !== 'production') {
  router.post('/reset-trial', subscriptionController.resetTrial);
  router.post('/expire-trial', subscriptionController.expireTrial);
} else {
  // In production, only a Super Admin can trigger test resets
  router.post('/reset-trial', requireSuperAdmin, subscriptionController.resetTrial);
  router.post('/expire-trial', requireSuperAdmin, subscriptionController.expireTrial);
}

module.exports = router;
