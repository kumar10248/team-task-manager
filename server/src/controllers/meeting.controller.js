const Meeting = require('../models/Meeting');
const ProjectMember = require('../models/ProjectMember');
const { createNotification } = require('./notification.controller');

/**
 * GET /api/meetings
 * List meetings relevant to the authenticated user.
 * Query params: projectId, status, scope ('upcoming' | 'past' | 'all')
 */
exports.getMeetings = async (req, res) => {
  try {
    const memberships = await ProjectMember.find({ user: req.user._id }).lean();
    const projectIds = memberships.map((m) => m.project);

    let baseFilter = {};

    if (req.query.projectId) {
      baseFilter.project = req.query.projectId;
    } else {
      // Find all meetings relevant to the user:
      // 1. Created by user
      // 2. User is listed in participants
      // 3. Meeting is linked to user's projects
      // 4. Meeting is a workspace sync (project is null)
      baseFilter = {
        $or: [
          { createdBy: req.user._id },
          { participants: req.user._id },
          { project: { $in: projectIds } },
          { project: null },
        ],
      };
    }

    const now = new Date();

    if (req.query.scope === 'upcoming') {
      baseFilter.endTime = { $gte: now };
      baseFilter.status = { $ne: 'cancelled' };
    } else if (req.query.scope === 'past') {
      baseFilter.endTime = { $lt: now };
    }

    if (req.query.status) {
      baseFilter.status = req.query.status;
    }

    const meetings = await Meeting.find(baseFilter)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color')
      .sort({ startTime: req.query.scope === 'past' ? -1 : 1 })
      .lean();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    // Dynamically mark ongoing if within time window and normalize meetLink to internal TaskForge /room/ URL
    const updated = meetings.map((m) => {
      const start = new Date(m.startTime);
      const end = new Date(m.endTime);
      let dynamicStatus = m.status;
      if (m.status === 'scheduled') {
        if (now >= start && now <= end) {
          dynamicStatus = 'ongoing';
        } else if (now > end) {
          dynamicStatus = 'completed';
        }
      }

      let meetLink = m.meetLink || '';
      if (meetLink.includes('mirotalk.com')) {
        try {
          const u = new URL(meetLink);
          let roomId = '';
          if (u.pathname.startsWith('/join/')) {
            roomId = u.pathname.replace('/join/', '');
          } else {
            roomId = u.searchParams.get('room') || '';
          }
          if (roomId) {
            meetLink = `${clientUrl}/room/${encodeURIComponent(roomId)}`;
          }
        } catch {}
      }

      return {
        ...m,
        meetLink,
        status: dynamicStatus,
      };
    });

    res.json({ success: true, meetings: updated });
  } catch (err) {
    console.error('Failed to fetch meetings:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch meetings' });
  }
};

/**
 * POST /api/meetings
 * Create a new meeting.
 */
exports.createMeeting = async (req, res) => {
  try {
    const { title, description, project, participants, startTime, endTime, meetLink, agenda } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Meeting title is required' });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'Start and end time are required' });
    }

    if (project) {
      const { verifyProjectSubscription } = require('./subscription.controller');
      const subCoverage = await verifyProjectSubscription(project);
      if (!subCoverage.hasActiveSubscription) {
        return res.status(403).json({
          success: false,
          message: 'This project is locked because an active subscription is required to schedule meetings.',
          isProjectLocked: true,
        });
      }
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    let finalLink = (meetLink || '').trim();
    if (!finalLink) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .slice(0, 16);
      finalLink = `${clientUrl}/room/taskforge-${slug}-${Date.now().toString(36)}`;
    } else if (finalLink.includes('mirotalk.com')) {
      try {
        const u = new URL(finalLink);
        let roomId = '';
        if (u.pathname.startsWith('/join/')) {
          roomId = u.pathname.replace('/join/', '');
        } else {
          roomId = u.searchParams.get('room') || '';
        }
        if (roomId) {
          finalLink = `${clientUrl}/room/${encodeURIComponent(roomId)}`;
        }
      } catch {}
    }

    // Determine final participants list:
    let finalParticipants = Array.isArray(participants) ? [...participants] : [];

    // Always include the host
    if (!finalParticipants.some((p) => p && p.toString() === req.user._id.toString())) {
      finalParticipants.push(req.user._id);
    }

    // If meeting is attached to a project, auto-include all project members
    if (project) {
      const pMembers = await ProjectMember.find({ project }).lean();
      pMembers.forEach((pm) => {
        if (pm.user && !finalParticipants.some((p) => p && p.toString() === pm.user.toString())) {
          finalParticipants.push(pm.user);
        }
      });
    } else {
      // Workspace meeting: include all workspace teammates
      const userMemberships = await ProjectMember.find({ user: req.user._id }).lean();
      const userProjectIds = userMemberships.map((m) => m.project);
      const teamMemberships = await ProjectMember.find({ project: { $in: userProjectIds } }).lean();
      const allTeammates = [...new Set(teamMemberships.map((m) => m.user.toString()))];

      if (allTeammates.length > 0) {
        allTeammates.forEach((uid) => {
          if (!finalParticipants.some((p) => p && p.toString() === uid)) {
            finalParticipants.push(uid);
          }
        });
      } else {
        const User = require('../models/User');
        const allUsers = await User.find({ isActive: true }).select('_id').lean();
        allUsers.forEach((u) => {
          if (!finalParticipants.some((p) => p && p.toString() === u._id.toString())) {
            finalParticipants.push(u._id);
          }
        });
      }
    }

    const meeting = await Meeting.create({
      title: title.trim(),
      description: description || '',
      project: project || null,
      createdBy: req.user._id,
      participants: finalParticipants,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      meetLink: finalLink,
      agenda: Array.isArray(agenda) ? agenda : [],
    });

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color');

    // Notify participants
    finalParticipants.forEach((uid) => {
      if (uid && uid.toString() !== req.user._id.toString()) {
        createNotification({
          recipient: uid,
          sender: req.user._id,
          type: 'system',
          project: project || undefined,
          text: `scheduled meeting "${title}" for ${new Date(startTime).toLocaleString()}`,
        });
      }
    });

    res.status(201).json({ success: true, meeting: populated });
  } catch (err) {
    console.error('Failed to create meeting:', err);
    res.status(500).json({ success: false, message: 'Failed to create meeting' });
  }
};

/**
 * GET /api/meetings/teammates
 * Get all teammates in workspace to invite to meetings.
 */
exports.getTeammates = async (req, res) => {
  try {
    const User = require('../models/User');
    const memberships = await ProjectMember.find({ user: req.user._id }).lean();
    const projectIds = memberships.map((m) => m.project);
    const teamMemberships = await ProjectMember.find({ project: { $in: projectIds } })
      .populate('user', 'name email avatar isClockedIn')
      .lean();

    const userMap = new Map();
    teamMemberships.forEach((m) => {
      if (m.user && m.user._id) {
        userMap.set(m.user._id.toString(), m.user);
      }
    });

    // Also include user themselves
    userMap.set(req.user._id.toString(), {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
    });

    // If still just 1 user, include all active users in system
    if (userMap.size <= 1) {
      const allUsers = await User.find({ isActive: true })
        .select('name email avatar isClockedIn')
        .lean();
      allUsers.forEach((u) => userMap.set(u._id.toString(), u));
    }

    res.json({ success: true, teammates: Array.from(userMap.values()) });
  } catch (err) {
    console.error('Failed to get teammates:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch teammates' });
  }
};

/**
 * Helper to determine user access permissions for a meeting.
 * Evaluates host status, project admin role, participation, and workspace membership.
 */
async function getMeetingAccess(meeting, userId, isSuperAdmin) {
  if (isSuperAdmin) {
    return { canView: true, canManage: true, isHost: true };
  }

  const userIdStr = userId.toString();
  const createdById = meeting.createdBy?._id
    ? meeting.createdBy._id.toString()
    : meeting.createdBy?.toString();
  const isHost = Boolean(createdById && createdById === userIdStr);

  // Check if user is in participants list
  const isParticipant = Array.isArray(meeting.participants) &&
    meeting.participants.some((p) => {
      const pid = p?._id ? p._id.toString() : p?.toString();
      return pid === userIdStr;
    });

  let isProjectMember = false;
  let isProjectAdmin = false;

  const projectId = meeting.project?._id
    ? meeting.project._id
    : meeting.project;

  if (projectId) {
    const membership = await ProjectMember.findOne({
      project: projectId,
      user: userId,
    }).lean();

    if (membership) {
      isProjectMember = true;
      if (membership.role === 'admin') {
        isProjectAdmin = true;
      }
    }
  } else {
    // Workspace-level meeting (not tied to a specific project)
    const hasAnyMembership = await ProjectMember.exists({ user: userId });
    isProjectMember = Boolean(hasAnyMembership || isHost || isParticipant);
  }

  const canManage = isHost || isProjectAdmin;
  const canView = isHost || isParticipant || isProjectMember;

  return { canView, canManage, isHost, isParticipant, isProjectAdmin };
}

/**
 * GET /api/meetings/:id
 * Get single meeting details with strict BOLA authorization check.
 */
exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color');

    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const access = await getMeetingAccess(meeting, req.user._id, req.user.isSuperAdmin);
    if (!access.canView) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this meeting',
      });
    }

    res.json({ success: true, meeting });
  } catch (err) {
    console.error('Failed to fetch meeting:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch meeting' });
  }
};

/**
 * PATCH /api/meetings/:id
 * Update meeting details or agenda items with role-based BOLA protection.
 */
exports.updateMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const access = await getMeetingAccess(meeting, req.user._id, req.user.isSuperAdmin);
    if (!access.canView) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to update this meeting',
      });
    }

    const restrictedFields = ['title', 'description', 'startTime', 'endTime', 'meetLink', 'participants'];
    const hasRestrictedUpdates = restrictedFields.some((field) => req.body[field] !== undefined);

    // Only host, project admin, or super admin can update core meeting configuration
    if (hasRestrictedUpdates && !access.canManage) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the meeting host or a project admin can modify meeting details or participants',
      });
    }

    // Apply allowed updates
    const allowed = ['title', 'description', 'startTime', 'endTime', 'meetLink', 'status', 'agenda', 'participants'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'meetLink') {
          let link = String(req.body.meetLink).trim();
          if (link && !link.startsWith('http://') && !link.startsWith('https://') && !link.startsWith('/')) {
            link = `https://${link}`;
          }
          if (/^(javascript|data|vbscript):/i.test(link)) {
            return res.status(400).json({ success: false, message: 'Invalid meeting link URL protocol' });
          }
          meeting.meetLink = link;
        } else {
          meeting[field] = req.body[field];
        }
      }
    }

    await meeting.save();

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color');

    res.json({ success: true, meeting: populated });
  } catch (err) {
    console.error('Failed to update meeting:', err);
    res.status(500).json({ success: false, message: 'Failed to update meeting' });
  }
};

/**
 * DELETE /api/meetings/:id
 * Delete / cancel a meeting with strict BOLA authorization check.
 */
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const access = await getMeetingAccess(meeting, req.user._id, req.user.isSuperAdmin);
    if (!access.canManage) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the meeting host or a project admin can delete this meeting',
      });
    }

    await Meeting.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Meeting deleted successfully' });
  } catch (err) {
    console.error('Failed to delete meeting:', err);
    res.status(500).json({ success: false, message: 'Failed to delete meeting' });
  }
};
