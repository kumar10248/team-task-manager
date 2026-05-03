// ─── routes/auth.js ──────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const auth = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/signup', auth.signup);
router.post('/login', auth.login);
router.get('/me', protect, auth.getMe);
router.patch('/me', protect, auth.updateMe);
router.post('/change-password', protect, auth.changePassword);

module.exports = router;