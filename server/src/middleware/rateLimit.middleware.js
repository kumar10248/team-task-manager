const rateLimit = require('express-rate-limit');

/**
 * Strict authentication limiter (login, signup)
 * 15 minutes window, max 10 requests per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

/**
 * Password reset limiter (forgot-password, reset-password)
 * 15 minutes window, max 5 attempts per IP
 */
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests from this IP. Please try again after 15 minutes.',
  },
});

/**
 * Public intake form limiter (unauthenticated client tickets)
 * 1 minute window, max 5 requests per IP
 */
const publicIntakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many ticket inquiries submitted from your network. Please slow down and try again shortly.',
  },
});

/**
 * Global API rate limiter
 * 1 minute window, max 180 requests per IP
 */
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down.',
  },
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  publicIntakeLimiter,
  globalApiLimiter,
};
