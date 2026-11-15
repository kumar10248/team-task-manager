const User = require('../models/User');

/**
 * requireSuperAdmin middleware
 * Verifies that the authenticated user has isSuperAdmin === true.
 * Auto-promotes the first user if no super admin exists yet in the database.
 */
exports.requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    // Auto-bootstrap: if no user is designated super admin yet, grant to current user
    const count = await User.countDocuments({ isSuperAdmin: true });
    if (count === 0) {
      await User.findByIdAndUpdate(req.user._id, { isSuperAdmin: true });
      req.user.isSuperAdmin = true;
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
