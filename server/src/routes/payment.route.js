const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { optionalAuth } = require('../middleware/auth.middleware');

// Razorpay Standard Checkout endpoints
// POST /api/create-order
router.post('/create-order', optionalAuth, paymentController.createOrder);

// POST /api/verify-payment
router.post('/verify-payment', optionalAuth, paymentController.verifyPayment);

module.exports = router;
