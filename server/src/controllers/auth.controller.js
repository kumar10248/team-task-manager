const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const Subscription = require('../models/Subscription');
const { checkUserSubscriptionCoverage } = require('./subscription.controller');
const { sendPasswordResetEmail } = require('../utils/email');
const { cloudinary, getCloudinary, isConfigured: isCloudinaryConfigured } = require('../config/cloudinary');
const { JWT_SECRET } = require('../config/jwt');

// ─── Helpers ────────────────────────────────────────────────────────────────

const signToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true, // Prevents client-side script access (mitigates XSS)
    secure: isProduction, // HTTPS only in production
    sameSite: isProduction ? (process.env.COOKIE_SAMESITE || 'none') : 'lax',
    path: '/',
  };

  res.cookie('token', token, cookieOptions);

  res.status(statusCode).json({
    success: true,
    token,
    user: user.toPublicJSON(),
  });
};

/**
 * Safe Super Admin Bootstrapper
 * Prevents race conditions and unintended privilege escalation.
 * In production, strictly requires user.email to match INITIAL_SUPER_ADMIN_EMAIL.
 * In development, atomically designates the earliest created user if no admin exists.
 */
async function bootstrapSuperAdminIfNeeded(user) {
  if (!user || user.isSuperAdmin) return user;

  const superAdminCount = await User.countDocuments({ isSuperAdmin: true });
  if (superAdminCount > 0) return user;

  const configuredAdminEmail = (process.env.INITIAL_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();

  if (configuredAdminEmail) {
    if (user.email && user.email.toLowerCase() === configuredAdminEmail) {
      await User.findByIdAndUpdate(user._id, { isSuperAdmin: true });
      user.isSuperAdmin = true;
    }
    return user;
  }

  // In local development/test only: promote first created account if no admin is configured
  if (process.env.NODE_ENV !== 'production') {
    const firstUser = await User.findOne().sort({ createdAt: 1 }).select('_id');
    if (firstUser && firstUser._id.toString() === user._id.toString()) {
      await User.findByIdAndUpdate(user._id, { isSuperAdmin: true });
      user.isSuperAdmin = true;
    }
  }

  return user;
}

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/signup
 * Body: { name, email, password }
 */
exports.signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check for existing user
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    const user = await User.create({ name, email, password });
    sendTokenResponse(user, 201, res);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Explicitly select password (it has select:false)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    user.lastLogin = new Date();

    // Secure auto-bootstrap super admin if eligible
    await bootstrapSuperAdminIfNeeded(user);

    await user.save({ validateBeforeSave: false });

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

/**
 * POST /api/auth/logout
 * Clears the secure httpOnly token cookie.
 */
exports.logout = async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? (process.env.COOKIE_SAMESITE || 'none') : 'lax',
    path: '/',
  });
  res.json({ success: true, message: 'Logged out successfully' });
};

const MAX_SHIFT_HOURS = 14;
const MAX_SHIFT_MINUTES = MAX_SHIFT_HOURS * 60; // 840 minutes
const MAX_SHIFT_MS = MAX_SHIFT_MINUTES * 60 * 1000;

/**
 * Checks if a clocked-in user has exceeded MAX_SHIFT_HOURS (14 hours).
 * If exceeded, automatically closes the shift, creates an AttendanceLog with autoClockedOut: true,
 * and sets isClockedIn: false.
 */
const autoClockOutIfExceeded = async (user) => {
  if (!user || !user.isClockedIn || !user.lastClockIn) return user;

  const clockInTime = new Date(user.lastClockIn);
  const elapsedMs = Date.now() - clockInTime.getTime();

  if (elapsedMs > MAX_SHIFT_MS) {
    const clockOutTime = new Date(clockInTime.getTime() + MAX_SHIFT_MS);
    await AttendanceLog.create({
      user: user._id,
      clockIn: clockInTime,
      clockOut: clockOutTime,
      durationMinutes: MAX_SHIFT_MINUTES,
      autoClockedOut: true,
    });

    user.isClockedIn = false;
    user.lastClockOut = clockOutTime;
    await user.save({ validateBeforeSave: false });
  }

  return user;
};

exports.autoClockOutIfExceeded = autoClockOutIfExceeded;

/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
exports.getMe = async (req, res) => {
  try {
    // req.user is already fetched in protect middleware
    if (!req.user) return res.status(404).json({ success: false, message: 'User not found' });

    let user = req.user;
    if (user.isClockedIn) {
      user = await autoClockOutIfExceeded(user);
    }

    // Secure auto-bootstrap if eligible
    if (!user.isSuperAdmin) {
      await bootstrapSuperAdminIfNeeded(user);
    }

    const coverage = await checkUserSubscriptionCoverage(user._id);

    res.json({
      success: true,
      user: typeof user.toPublicJSON === 'function' ? user.toPublicJSON() : user,
      subscription: coverage.subscription,
      isCoveredByAdmin: coverage.isCoveredByAdmin,
      coveringAdminName: coverage.coveringAdminName,
      ownedProjectsCount: coverage.ownedProjectsCount,
    });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * PATCH /api/auth/me
 * Update name or avatar (not password — use /change-password).
 */
exports.updateMe = async (req, res) => {
  try {
    const allowed = ['name', 'avatar', 'projectAddPrivacy'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.projectAddPrivacy && !['anyone', 'nobody', 'request'].includes(updates.projectAddPrivacy)) {
      return res.status(400).json({ success: false, message: 'Invalid privacy setting. Must be "anyone", "nobody", or "request"' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST /api/auth/avatar
 * Uploads user avatar to Cloudinary with automatic face-detection crop & compression
 * Body: { image: string (base64 data URI) }
 */
exports.uploadAvatar = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'Image data is required' });
    }

    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ success: false, message: 'Invalid image format. Expected a valid image data URI.' });
    }

    let avatarUrl = '';
    const cl = getCloudinary();

    if (cl) {
      // Real Cloudinary upload with face-detection thumbnail & auto-compression
      const uploadRes = await cl.uploader.upload(image, {
        folder: 'taskforge_avatars',
        transformation: [
          { width: 300, height: 300, crop: 'thumb', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      });
      avatarUrl = uploadRes.secure_url;
    } else {
      // Safe fallback if Cloudinary API keys are not configured: enforce 350KB max limit
      const approxSizeInBytes = (image.length * 3) / 4;
      if (approxSizeInBytes > 350 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'Avatar image exceeds 350KB limit for direct database storage. Please configure Cloudinary or upload a smaller image.',
        });
      }
      avatarUrl = image;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl },
      { new: true }
    );

    res.json({
      success: true,
      message: cl ? 'Avatar uploaded to Cloudinary successfully' : 'Avatar updated successfully',
      avatar: avatarUrl,
      user: updatedUser.toPublicJSON(),
      isCloudinary: Boolean(cl),
    });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to upload avatar' });
  }
};

/**
 * DELETE /api/auth/avatar
 * Removes user avatar and resets back to initials
 */
exports.deleteAvatar = async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: null },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Avatar removed successfully',
      user: updatedUser.toPublicJSON(),
    });
  } catch (err) {
    console.error('Avatar delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove avatar' });
  }
};

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both fields are required' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+resetPasswordCode +resetPasswordExpires');
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with that email address' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    // Generate a 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const hashedCode = await bcrypt.hash(resetCode, 10);
    user.resetPasswordCode = hashedCode;
    user.resetPasswordExpires = expiresAt;
    user.resetPasswordAttempts = 0; // Reset failed attempts counter on new code generation
    await user.save({ validateBeforeSave: false });

    // Send the password reset email
    try {
      const emailResult = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        code: resetCode,
      });

      if (emailResult && (emailResult.renderBlocked || emailResult.sandboxForwarded)) {
        return res.json({
          success: true,
          message: emailResult.message || 'Verification code sent!',
        });
      }
    } catch (emailErr) {
      console.error('[Email Service] Failed to send password reset email:', emailErr);
      const detail = emailErr?.message || 'SMTP delivery failed';
      return res.status(500).json({
        success: false,
        message: `Unable to deliver verification email: ${detail}`,
        error: detail,
      });
    }

    res.json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email address.',
    });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ success: false, message: 'Server error processing password reset request' });
  }
};

const MAX_RESET_ATTEMPTS = 5;

/**
 * POST /api/auth/reset-password
 * Body: { email, code, newPassword }
 * Protected against brute-force attacks via maximum attempt tracking & revocation.
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, reset code, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password +resetPasswordCode +resetPasswordExpires +resetPasswordAttempts'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with that email address' });
    }

    if (!user.resetPasswordCode || !user.resetPasswordExpires) {
      return res.status(400).json({ success: false, message: 'No password reset was requested for this account' });
    }

    if (new Date() > new Date(user.resetPasswordExpires)) {
      user.resetPasswordCode = undefined;
      user.resetPasswordExpires = undefined;
      user.resetPasswordAttempts = 0;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ success: false, message: 'Password reset code has expired. Please request a new one.' });
    }

    // Check if max failed attempts reached
    if ((user.resetPasswordAttempts || 0) >= MAX_RESET_ATTEMPTS) {
      user.resetPasswordCode = undefined;
      user.resetPasswordExpires = undefined;
      user.resetPasswordAttempts = 0;
      await user.save({ validateBeforeSave: false });
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect verification attempts. For your security, this reset code has been revoked. Please request a new code.',
      });
    }

    const isMatch = await bcrypt.compare(String(code).trim(), user.resetPasswordCode);
    if (!isMatch) {
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      const attemptsLeft = Math.max(0, MAX_RESET_ATTEMPTS - user.resetPasswordAttempts);

      if (attemptsLeft === 0) {
        user.resetPasswordCode = undefined;
        user.resetPasswordExpires = undefined;
        user.resetPasswordAttempts = 0;
        await user.save({ validateBeforeSave: false });
        return res.status(429).json({
          success: false,
          message: 'Too many incorrect attempts. This password reset code has been revoked. Please request a new code.',
        });
      }

      await user.save({ validateBeforeSave: false });
      return res.status(400).json({
        success: false,
        message: `Invalid reset code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before the code is revoked.`,
      });
    }

    // Password reset successful: update password and wipe reset token state
    user.password = newPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordAttempts = 0;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.',
    });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
};

/**
 * POST /api/auth/clock-in
 * Marks the user as clocked in.
 */
exports.clockIn = async (req, res) => {
  try {
    let user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // If user was previously clocked in and exceeded 14h, auto-close old shift first
    if (user.isClockedIn) {
      user = await autoClockOutIfExceeded(user);
    }

    user.isClockedIn = true;
    user.lastClockIn = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST /api/auth/clock-out
 * Marks the user as clocked out.
 */
exports.clockOut = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.lastClockIn) {
      const now = new Date();
      const clockInTime = new Date(user.lastClockIn);
      const rawDurationMinutes = Math.floor((now.getTime() - clockInTime.getTime()) / 60000);
      const isAutoCapped = rawDurationMinutes > MAX_SHIFT_MINUTES;
      const durationMinutes = isAutoCapped ? MAX_SHIFT_MINUTES : Math.max(0, rawDurationMinutes);
      const clockOutTime = isAutoCapped
        ? new Date(clockInTime.getTime() + MAX_SHIFT_MS)
        : now;

      await AttendanceLog.create({
        user: user._id,
        clockIn: clockInTime,
        clockOut: clockOutTime,
        durationMinutes,
        autoClockedOut: isAutoCapped,
      });

      user.lastClockOut = clockOutTime;
    }

    user.isClockedIn = false;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};