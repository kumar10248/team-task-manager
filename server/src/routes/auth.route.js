// ─── routes/auth.js ──────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const auth = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimit.middleware');

router.post('/signup', authLimiter, auth.signup);
router.post('/login', authLimiter, auth.login);
router.post('/forgot-password', passwordResetLimiter, auth.forgotPassword);
router.post('/reset-password', passwordResetLimiter, auth.resetPassword);
router.post('/logout', auth.logout);
router.get('/me', protect, auth.getMe);
router.patch('/me', protect, auth.updateMe);
router.post('/avatar', protect, auth.uploadAvatar);
router.delete('/avatar', protect, auth.deleteAvatar);
router.post('/change-password', protect, auth.changePassword);
router.post('/clock-in', protect, auth.clockIn);
router.post('/clock-out', protect, auth.clockOut);

module.exports = router;