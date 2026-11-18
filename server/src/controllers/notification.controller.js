const Notification = require('../models/Notification');
const ProjectMember = require('../models/ProjectMember');
const ProjectInvitation = require('../models/ProjectInvitation');
const Project = require('../models/Project');
const User = require('../models/User');

/**
 * GET /api/notifications
 * Get all notifications for the logged-in user
 */
exports.getNotifications = async (req, res) => {
  try {
    const [notifications, memberships, createdProjects, userInvitations] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .populate('sender', 'name avatar')
        .populate('project', 'name color')
        .populate('invitation', 'status role project')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      ProjectMember.find({ user: req.user._id }).populate('project', 'name').lean(),
      Project.find({ createdBy: req.user._id }).select('name').lean(),
      ProjectInvitation.find({ user: req.user._id }).select('_id project status').lean(),
    ]);

    // Build joined project IDs and normalized project names
    const joinedProjectIds = new Set();
    const joinedProjectNames = new Set();

    for (const m of memberships) {
      if (m.project) {
        if (typeof m.project === 'object') {
          if (m.project._id) joinedProjectIds.add(m.project._id.toString());
          if (m.project.name) joinedProjectNames.add(m.project.name.trim().toLowerCase());
        } else {
          joinedProjectIds.add(m.project.toString());
        }
      }
    }

    for (const p of createdProjects) {
      if (p._id) joinedProjectIds.add(p._id.toString());
      if (p.name) joinedProjectNames.add(p.name.trim().toLowerCase());
    }

    // Map invitations by ID and by project ID
    const invMap = new Map();
    const projectInvMap = new Map();
    for (const inv of userInvitations) {
      invMap.set(inv._id.toString(), inv.status);
      if (inv.project) {
        projectInvMap.set(inv.project.toString(), inv.status);
      }
      if (inv.status === 'accepted' && inv.project) {
        joinedProjectIds.add(inv.project.toString());
      }
    }

    const enriched = notifications.map((n) => {
      // Find the project id from n.project or n.invitation
      const pid = n.project?._id
        ? n.project._id.toString()
        : (n.project
            ? n.project.toString()
            : (n.invitation?.project?._id
                ? n.invitation.project._id.toString()
                : (n.invitation?.project ? n.invitation.project.toString() : null)));

      const invId = n.invitation?._id
        ? n.invitation._id.toString()
        : (n.invitation ? n.invitation.toString() : null);

      // Check project name from quoted text, e.g. "ReviewCde application"
      const nameMatch = n.text?.match(/"([^"]+)"/);
      const quotedProjectName = nameMatch ? nameMatch[1].trim().toLowerCase() : null;

      const isMember = Boolean(
        (pid && joinedProjectIds.has(pid)) ||
        (quotedProjectName && joinedProjectNames.has(quotedProjectName))
      );

      const invStatus = (invId && invMap.get(invId)) ||
        (pid && projectInvMap.get(pid)) ||
        (typeof n.invitation === 'object' && n.invitation ? n.invitation.status : null);

      const isJoined = Boolean(isMember || invStatus === 'accepted');

      let invitationStatus = 'pending';
      if (isJoined) {
        invitationStatus = 'accepted';
      } else if (invStatus === 'declined') {
        invitationStatus = 'declined';
      } else if (invStatus === 'pending') {
        invitationStatus = 'pending';
      } else if (!n.invitation && !pid) {
        invitationStatus = 'expired';
      }

      // Clean up text if member has joined
      let displayText = n.text;
      if (isJoined && displayText && displayText.includes('Please accept or decline')) {
        displayText = displayText.replace(/\s*Please accept or decline the invitation\.?/gi, '').trim();
      }

      return {
        ...n,
        text: displayText,
        isJoined,
        invitationStatus,
      };
    });

    res.json({ success: true, notifications: enriched });
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
exports.createNotification = async ({ recipient, sender, type, project, task, invitation, text }) => {
  try {
    if (sender && recipient && recipient.toString() === sender.toString()) return; // don't notify self
    await Notification.create({ recipient, sender, type, project, task, invitation, text });
  } catch (err) {
    console.error('Failed to create notification', err);
  }
};
