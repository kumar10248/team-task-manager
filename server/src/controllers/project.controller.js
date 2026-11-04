const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const ProjectInvitation = require('../models/ProjectInvitation');
const Task = require('../models/Task');
const User = require('../models/User');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the membership record for req.user in the given project.
 * Returns null if not a member.
 */
const getMembership = (projectId, userId) =>
  ProjectMember.findOne({ project: projectId, user: userId }).lean();

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * POST /api/projects
 * Create a new project. Creator is automatically set as admin.
 */
exports.createProject = async (req, res) => {
  try {
    const { name, description, color, dueDate } = req.body;

    const project = await Project.create({
      name,
      description,
      color,
      dueDate,
      createdBy: req.user._id,
    });

    // Add creator as admin member
    await ProjectMember.create({
      project: project._id,
      user: req.user._id,
      role: 'admin',
      invitedBy: req.user._id,
    });

    const populated = await Project.findById(project._id).populate('createdBy', 'name email').lean();
    res.status(201).json({ success: true, project: populated });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Failed to create project' });
  }
};

/**
 * GET /api/projects
 * List all projects the authenticated user belongs to with aggregated taskStats.
 */
exports.getProjects = async (req, res) => {
  try {
    const memberships = await ProjectMember.find({ user: req.user._id }).select('project role').lean();
    const projectIds = memberships.map((m) => m.project);

    const [projects, taskStatsAggregation] = await Promise.all([
      Project.find({ _id: { $in: projectIds } })
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .lean(),
      Task.aggregate([
        { $match: { project: { $in: projectIds } } },
        {
          $group: {
            _id: { project: '$project', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Build task stats map per project: { [projectId]: { total, done } }
    const statsMap = {};
    taskStatsAggregation.forEach(({ _id, count }) => {
      const pid = _id.project.toString();
      if (!statsMap[pid]) statsMap[pid] = { total: 0, done: 0 };
      statsMap[pid].total += count;
      if (_id.status === 'done') {
        statsMap[pid].done += count;
      }
    });

    // Attach role and stats to each project
    const roleMap = {};
    memberships.forEach((m) => {
      roleMap[m.project.toString()] = m.role;
    });

    const result = projects.map((p) => ({
      ...p,
      myRole: roleMap[p._id.toString()] || 'member',
      taskStats: statsMap[p._id.toString()] || { total: 0, done: 0 },
    }));

    res.json({ success: true, projects: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
};

/**
 * GET /api/projects/:id
 * Get a single project with members and task summary.
 */
exports.getProject = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const projectObjectId = new mongoose.Types.ObjectId(req.params.id);

    const [project, members, taskStats] = await Promise.all([
      Project.findById(req.params.id).populate('createdBy', 'name email').lean(),
      ProjectMember.find({ project: req.params.id })
        .populate('user', 'name email avatar isClockedIn lastClockIn lastClockOut')
        .lean(),
      Task.aggregate([
        { $match: { project: projectObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    res.json({
      success: true,
      project: { ...project, myRole: membership.role },
      members,
      taskStats,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch project' });
  }
};

/**
 * PATCH /api/projects/:id
 * Update project details. Admin only.
 */
exports.updateProject = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const allowed = ['name', 'description', 'color', 'dueDate', 'status'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const project = await Project.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('createdBy', 'name email');

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    res.json({ success: true, project });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Failed to update project' });
  }
};

/**
 * DELETE /api/projects/:id
 * Delete a project and all its tasks. Admin only.
 */
exports.deleteProject = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    await Project.findByIdAndDelete(req.params.id);
    await ProjectMember.deleteMany({ project: req.params.id });
    await ProjectInvitation.deleteMany({ project: req.params.id });
    await Task.deleteMany({ project: req.params.id });

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete project' });
  }
};

// ─── Member Management ───────────────────────────────────────────────────────

/**
 * POST /api/projects/:id/members
 * Add a member by email. Admin only.
 * Respects user's privacy settings:
 * - 'nobody': blocks addition
 * - 'request': sends an invitation request requiring acceptance
 * - 'anyone': adds directly
 * Body: { email, role }
 */
exports.addMember = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { email, role = 'member' } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'No user found with that email' });
    }

    const existing = await getMembership(req.params.id, targetUser._id);
    if (existing) {
      return res.status(409).json({ success: false, message: 'User is already a member of this project' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const privacy = targetUser.projectAddPrivacy || 'anyone';

    // 1. NOBODY: User privacy blocks all additions
    if (privacy === 'nobody') {
      return res.status(403).json({
        success: false,
        message: `${targetUser.name}'s privacy settings do not allow anyone to add them to projects.`,
      });
    }

    // 2. REQUEST: Requires invitation approval
    if (privacy === 'request') {
      const existingInvitation = await ProjectInvitation.findOne({
        project: req.params.id,
        user: targetUser._id,
        status: 'pending',
      });
      if (existingInvitation) {
        return res.status(409).json({
          success: false,
          message: `An invitation request has already been sent to ${targetUser.name}.`,
        });
      }

      const invitation = await ProjectInvitation.create({
        project: req.params.id,
        user: targetUser._id,
        invitedBy: req.user._id,
        role,
        status: 'pending',
      });

      const { createNotification } = require('./notification.controller');
      await createNotification({
        recipient: targetUser._id,
        sender: req.user._id,
        type: 'invitation',
        project: req.params.id,
        invitation: invitation._id,
        text: `invited you to join "${project.name}" as a ${role}. Please accept or decline the invitation.`,
      });

      return res.status(200).json({
        success: true,
        requiresApproval: true,
        message: `Invitation request sent to ${targetUser.name}. They will be added to the project once they accept.`,
        invitation,
      });
    }

    // 3. ANYONE: Directly add member (default)
    const newMember = await ProjectMember.create({
      project: req.params.id,
      user: targetUser._id,
      role,
      invitedBy: req.user._id,
    });

    const { createNotification } = require('./notification.controller');
    await createNotification({
      recipient: targetUser._id,
      sender: req.user._id,
      type: 'system',
      project: req.params.id,
      text: `added you to "${project.name}" as a ${role}`,
    });

    const populated = await newMember.populate('user', 'name email avatar');
    res.status(201).json({ success: true, requiresApproval: false, member: populated });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ success: false, message: 'Failed to add member' });
  }
};

/**
 * PATCH /api/projects/:id/members/:userId
 * Update a member's role. Admin only.
 * Body: { role }
 */
exports.updateMemberRole = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Cannot demote yourself if you're the only admin
    if (req.params.userId === req.user._id.toString() && req.body.role !== 'admin') {
      const adminCount = await ProjectMember.countDocuments({
        project: req.params.id,
        role: 'admin',
      });
      if (adminCount <= 1) {
        return res
          .status(400)
          .json({ success: false, message: 'Cannot remove the last admin from the project' });
      }
    }

    const updated = await ProjectMember.findOneAndUpdate(
      { project: req.params.id, user: req.params.userId },
      { role: req.body.role },
      { new: true, runValidators: true }
    ).populate('user', 'name email avatar');

    if (!updated) return res.status(404).json({ success: false, message: 'Member not found' });

    res.json({ success: true, member: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update role' });
  }
};

/**
 * DELETE /api/projects/:id/members/:userId
 * Remove a member from the project. Admin only.
 */
exports.removeMember = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Prevent removing last admin
    const targetMembership = await getMembership(req.params.id, req.params.userId);
    if (targetMembership?.role === 'admin') {
      const adminCount = await ProjectMember.countDocuments({
        project: req.params.id,
        role: 'admin',
      });
      if (adminCount <= 1) {
        return res
          .status(400)
          .json({ success: false, message: 'Cannot remove the last admin from the project' });
      }
    }

    await ProjectMember.findOneAndDelete({
      project: req.params.id,
      user: req.params.userId,
    });

    // Unassign tasks that were assigned to removed user
    await Task.updateMany(
      { project: req.params.id, assignedTo: req.params.userId },
      { assignedTo: null }
    );

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove member' });
  }
};

// ─── Project Invitations ──────────────────────────────────────────────────────

/**
 * GET /api/projects/invitations
 * Get all pending project invitations for the current user.
 */
exports.getMyInvitations = async (req, res) => {
  try {
    const invitations = await ProjectInvitation.find({
      user: req.user._id,
      status: 'pending',
    })
      .populate('project', 'name color description')
      .populate('invitedBy', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, invitations });
  } catch (err) {
    console.error('Fetch invitations error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch invitations' });
  }
};

/**
 * POST /api/projects/invitations/:id/accept
 * Accept a pending project invitation and become a project member.
 */
exports.acceptInvitation = async (req, res) => {
  try {
    const invitation = await ProjectInvitation.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: 'pending',
    });

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found or already handled' });
    }

    const project = await Project.findById(invitation.project);
    if (!project) {
      invitation.status = 'declined';
      await invitation.save();
      return res.status(404).json({ success: false, message: 'Project no longer exists' });
    }

    // Check if already a member
    let member = await ProjectMember.findOne({
      project: invitation.project,
      user: req.user._id,
    });

    if (!member) {
      member = await ProjectMember.create({
        project: invitation.project,
        user: req.user._id,
        role: invitation.role || 'member',
        invitedBy: invitation.invitedBy,
      });
    }

    invitation.status = 'accepted';
    await invitation.save();

    // Mark invitation notification as read
    const Notification = require('../models/Notification');
    await Notification.updateMany(
      { recipient: req.user._id, invitation: invitation._id },
      { isRead: true }
    );

    // Notify the inviter
    const { createNotification } = require('./notification.controller');
    await createNotification({
      recipient: invitation.invitedBy,
      sender: req.user._id,
      type: 'system',
      project: invitation.project,
      text: `accepted your invitation to join "${project.name}"!`,
    });

    res.json({
      success: true,
      message: `You have successfully joined "${project.name}"!`,
      project: invitation.project,
    });
  } catch (err) {
    console.error('Accept invitation error:', err);
    res.status(500).json({ success: false, message: 'Failed to accept invitation' });
  }
};

/**
 * POST /api/projects/invitations/:id/decline
 * Decline a pending project invitation.
 */
exports.declineInvitation = async (req, res) => {
  try {
    const invitation = await ProjectInvitation.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: 'pending',
    });

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found or already handled' });
    }

    invitation.status = 'declined';
    await invitation.save();

    // Mark invitation notification as read
    const Notification = require('../models/Notification');
    await Notification.updateMany(
      { recipient: req.user._id, invitation: invitation._id },
      { isRead: true }
    );

    res.json({ success: true, message: 'Invitation declined' });
  } catch (err) {
    console.error('Decline invitation error:', err);
    res.status(500).json({ success: false, message: 'Failed to decline invitation' });
  }
};