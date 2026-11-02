const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

/**
 * protect — verifies JWT and attaches req.user.
 * Supports token in Authorization header (Bearer) or cookie.
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token || token === 'null' || token === 'undefined' || token === 'Bearer') {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[auth.middleware.protect] Auth failed:', err.message);
    if (
      err.name === 'JsonWebTokenError' ||
      err.name === 'CastError' ||
      err.name === 'NotBeforeError' ||
      err.message?.includes('jwt')
    ) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired, please log in again' });
    }
    return res.status(401).json({ success: false, message: err.message || 'Authentication error' });
  }
};