const User = require('../models/User');

/**
 * requireSuperAdmin middleware
 * Verifies that the authenticated user has isSuperAdmin === true.
 * Enforces strict authorization without dynamic runtime promotion side-effects.
 */
exports.requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied: Super Admin privileges required',
    });
  } catch (err) {
    console.error('requireSuperAdmin middleware error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
