const Notification = require('../models/Notification');

/**
 * GET /api/notifications
 * Get all notifications for the logged-in user
 */
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(50); // limit to recent 50
    
    res.json({ success: true, notifications });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching notifications' });
  }
};

/**
 * PUT /api/notifications/read
 * Mark all or specific notifications as read
 * Body: { notificationIds?: string[] }
 */
exports.markAsRead = async (req, res) => {
  try {
    const { notificationIds } = req.body;
    let query = { recipient: req.user._id, isRead: false };
    
    if (notificationIds && notificationIds.length > 0) {
      query._id = { $in: notificationIds };
    }

    await Notification.updateMany(query, { isRead: true });

    res.json({ success: true });
  } catch (err) {
    console.error('Mark notifications read error:', err);
    res.status(500).json({ success: false, message: 'Server error marking notifications' });
  }
};

/**
 * Helper function to create a notification (used internally by other controllers)
 */
exports.createNotification = async ({ recipient, sender, type, project, task, text }) => {
  try {
    if (recipient.toString() === sender.toString()) return; // don't notify self
    await Notification.create({ recipient, sender, type, project, task, text });
  } catch (err) {
    console.error('Failed to create notification', err);
  }
};
