const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const ProjectInvitation = require('../models/ProjectInvitation');
const Task = require('../models/Task');
const User = require('../models/User');
const { verifyProjectSubscription, getProjectsSubscriptionMap } = require('./subscription.controller');

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
    const Subscription = require('../models/Subscription');
    const userSub = await Subscription.findOne({ user: req.user._id });
    const isSubActive = userSub && (
      userSub.status === 'active' ||
      userSub.isLifetime ||
      (userSub.status === 'trialing' && userSub.currentPeriodEnd && new Date(userSub.currentPeriodEnd) > new Date())
    );

    if (userSub && !isSubActive && !req.user.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Your trial or subscription has expired. Please upgrade your plan to create new projects.',
      });
    }

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

    const populated = await Project.findById(project._id).populate('createdBy', 'name email avatar').lean();
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

    const [projects, taskStatsAggregation, subscriptionMap] = await Promise.all([
      Project.find({ _id: { $in: projectIds } })
        .populate('createdBy', 'name email avatar')
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
      getProjectsSubscriptionMap(projectIds),
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

    // Attach role, stats, and active subscription status to each project
    const roleMap = {};
    memberships.forEach((m) => {
      roleMap[m.project.toString()] = m.role;
    });

    const result = projects.map((p) => {
      const pid = p._id.toString();
      return {
        ...p,
        myRole: roleMap[pid] || 'member',
        taskStats: statsMap[pid] || { total: 0, done: 0 },
        hasActiveSubscription: Boolean(subscriptionMap[pid]),
      };
    });

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

    const [project, members, taskStats, taskTags, subCoverage] = await Promise.all([
      Project.findById(req.params.id).populate('createdBy', 'name email avatar').lean(),
      ProjectMember.find({ project: req.params.id })
        .populate('user', 'name email avatar isClockedIn lastClockIn lastClockOut')
        .lean(),
      Task.aggregate([
        { $match: { project: projectObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.distinct('tags', { project: projectObjectId }),
      verifyProjectSubscription(req.params.id),
    ]);

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    // Deduplicate tags case-insensitively
    const seen = new Set();
    const mergedTags = [];
    const addTagUnique = (raw) => {
      if (!raw || typeof raw !== 'string') return;
      const clean = raw.trim().replace(/^#/, '');
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        mergedTags.push(clean);
      }
    };

    (project.tags || []).forEach(addTagUnique);
    (taskTags || []).forEach(addTagUnique);

    // If new tags were found from tasks that were not in project.tags, sync them
    if (mergedTags.length > (project.tags || []).length) {
      Project.findByIdAndUpdate(req.params.id, { $set: { tags: mergedTags } }).catch(() => {});
    }

    res.json({
      success: true,
      project: {
        ...project,
        tags: mergedTags,
        myRole: membership.role,
        hasActiveSubscription: Boolean(subCoverage.hasActiveSubscription),
        subscriberName: subCoverage.subscriberName,
        plan: subCoverage.plan,
      },
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

    const subCoverage = await verifyProjectSubscription(req.params.id);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to add members.',
        isProjectLocked: true,
      });
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
 * Delete a project and all its tasks. Creator/Owner only.
 */
exports.deleteProject = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const subCoverage = await verifyProjectSubscription(req.params.id);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to add members.',
        isProjectLocked: true,
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    // Only the project creator/owner can delete the project
    if (project.createdBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: 'Only the project creator/owner can delete this project' });
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
 * GET /api/projects/:id/member-candidates
 * Get candidate users for adding to the project, with their projectAddPrivacy settings,
 * whether they are already a member, and whether an invitation is pending.
 * Admin only.
 */
exports.getMemberCandidates = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { search } = req.query;
    const filter = { isActive: true };

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('name email avatar projectAddPrivacy')
      .sort({ name: 1 })
      .lean();

    const currentMembers = await ProjectMember.find({ project: req.params.id }).select('user').lean();
    const memberUserIds = new Set(currentMembers.map((m) => m.user.toString()));

    const pendingInvitations = await ProjectInvitation.find({ project: req.params.id, status: 'pending' })
      .select('user')
      .lean();
    const pendingUserIds = new Set(pendingInvitations.map((inv) => inv.user.toString()));

    const candidates = users
      .filter((u) => u._id.toString() !== req.user._id.toString())
      .map((u) => {
        const uid = u._id.toString();
        const isMember = memberUserIds.has(uid);
        const isPending = pendingUserIds.has(uid);
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
          projectAddPrivacy: u.projectAddPrivacy || 'anyone',
          isAlreadyMember: isMember,
          isPendingInvitation: isPending,
        };
      });

    res.json({ success: true, candidates });
  } catch (err) {
    console.error('Get member candidates error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch candidate members' });
  }
};

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

    const subCoverage = await verifyProjectSubscription(req.params.id);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to add members.',
        isProjectLocked: true,
      });
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

    // Notify other admins of the project
    const otherAdmins = await ProjectMember.find({
      project: req.params.id,
      role: 'admin',
      user: { $nin: [req.user._id, targetUser._id] },
    }).select('user');

    for (const adm of otherAdmins) {
      await createNotification({
        recipient: adm.user,
        sender: req.user._id,
        type: 'system',
        project: req.params.id,
        text: `added ${targetUser.name} to "${project.name}" as a ${role}.`,
      });
    }

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

    const subCoverage = await verifyProjectSubscription(req.params.id);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to add members.',
        isProjectLocked: true,
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const ownerId = project.createdBy.toString();
    const targetUserId = req.params.userId;
    const currentUserId = req.user._id.toString();

    // 1. The project creator/owner can never be demoted
    if (targetUserId === ownerId && req.body.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'The project creator/owner must remain an admin and cannot be demoted',
      });
    }

    // 2. Only the project creator/owner can modify roles of other admins
    const targetMembership = await getMembership(req.params.id, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    if (
      targetMembership.role === 'admin' &&
      currentUserId !== ownerId &&
      targetUserId !== currentUserId
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only the project creator/owner can modify another admin’s role',
      });
    }

    // 3. Cannot demote yourself if you're the only admin
    if (targetUserId === currentUserId && req.body.role !== 'admin') {
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

    const subCoverage = await verifyProjectSubscription(req.params.id);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to add members.',
        isProjectLocked: true,
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const ownerId = project.createdBy.toString();
    const targetUserId = req.params.userId;
    const currentUserId = req.user._id.toString();

    // 1. The project creator/owner can never be removed from their project
    if (targetUserId === ownerId) {
      return res.status(400).json({
        success: false,
        message: 'The project creator/owner cannot be removed from the project',
      });
    }

    // 2. Only the project creator/owner can remove another admin
    const targetMembership = await getMembership(req.params.id, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    if (
      targetMembership.role === 'admin' &&
      currentUserId !== ownerId &&
      targetUserId !== currentUserId
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only the project creator/owner can remove an admin',
      });
    }

    // 3. Prevent removing the last admin
    if (targetMembership.role === 'admin') {
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

    const targetUser = await User.findById(targetUserId).select('name email avatar');
    const targetName = targetUser?.name || 'A team member';

    await ProjectMember.findOneAndDelete({
      project: req.params.id,
      user: req.params.userId,
    });

    // Unassign tasks that were assigned to removed user
    await Task.updateMany(
      { project: req.params.id, assignedTo: req.params.userId },
      { $pull: { assignedTo: req.params.userId } }
    );

    // Send notifications if admin removed someone else
    if (targetUserId !== currentUserId) {
      const { createNotification } = require('./notification.controller');

      // 1. Notify the removed member
      await createNotification({
        recipient: targetUserId,
        sender: req.user._id,
        type: 'system',
        project: project._id,
        text: `removed you from "${project.name}".`,
      });

      // 2. Notify all other admins of the project
      const otherAdmins = await ProjectMember.find({
        project: project._id,
        role: 'admin',
        user: { $nin: [req.user._id, targetUserId] },
      }).select('user');

      const adminUserIds = new Set(otherAdmins.map((m) => m.user.toString()));
      if (
        project.createdBy &&
        project.createdBy.toString() !== currentUserId &&
        project.createdBy.toString() !== targetUserId.toString()
      ) {
        adminUserIds.add(project.createdBy.toString());
      }

      for (const adminId of adminUserIds) {
        await createNotification({
          recipient: adminId,
          sender: req.user._id,
          type: 'system',
          project: project._id,
          text: `removed ${targetName} from "${project.name}".`,
        });
      }
    }

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
    let invitation = await ProjectInvitation.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
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

    const wasPending = invitation.status === 'pending';
    invitation.status = 'accepted';
    await invitation.save();

    // Mark invitation notification as read and clean up text
    const Notification = require('../models/Notification');
    const relatedNotifs = await Notification.find({
      recipient: req.user._id,
      $or: [
        { invitation: invitation._id },
        { project: invitation.project, type: 'invitation' },
      ],
    });

    for (const notif of relatedNotifs) {
      notif.isRead = true;
      if (notif.text && notif.text.includes('Please accept or decline')) {
        notif.text = notif.text.replace(/\s*Please accept or decline the invitation\.?/gi, '').trim();
      }
      await notif.save();
    }

    if (wasPending) {
      // Notify the inviter
      const { createNotification } = require('./notification.controller');
      await createNotification({
        recipient: invitation.invitedBy,
        sender: req.user._id,
        type: 'system',
        project: invitation.project,
        text: `accepted your invitation to join "${project.name}"!`,
      });

      // Notify other admins of the project
      const otherAdmins = await ProjectMember.find({
        project: invitation.project,
        role: 'admin',
        user: { $nin: [req.user._id, invitation.invitedBy] },
      }).select('user');

      for (const adm of otherAdmins) {
        await createNotification({
          recipient: adm.user,
          sender: req.user._id,
          type: 'system',
          project: invitation.project,
          text: `joined "${project.name}" as a ${invitation.role || 'member'}.`,
        });
      }
    }

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

/**
 * GET /api/projects/sent-invitations
 * Get all pending invitations sent by the current user or for projects they admin.
 */
exports.getMySentInvitations = async (req, res) => {
  try {
    const adminMemberships = await ProjectMember.find({
      user: req.user._id,
      role: 'admin',
    }).select('project');
    const adminProjectIds = adminMemberships.map((m) => m.project);

    const invitations = await ProjectInvitation.find({
      $or: [
        { invitedBy: req.user._id },
        { project: { $in: adminProjectIds } },
      ],
      status: 'pending',
    })
      .populate('project', 'name color description')
      .populate('user', 'name email avatar')
      .populate('invitedBy', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, invitations });
  } catch (err) {
    console.error('Fetch sent invitations error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sent invitations' });
  }
};

/**
 * GET /api/projects/:id/invitations
 * Get all pending invitations for a specific project. Admin only.
 */
exports.getProjectInvitations = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const invitations = await ProjectInvitation.find({
      project: req.params.id,
      status: 'pending',
    })
      .populate('user', 'name email avatar')
      .populate('invitedBy', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, invitations });
  } catch (err) {
    console.error('Fetch project invitations error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch project invitations' });
  }
};

/**
 * DELETE /api/projects/invitations/:id
 * Revoke / cancel a sent pending invitation. Admin or inviter only.
 */
exports.cancelInvitation = async (req, res) => {
  try {
    const invitation = await ProjectInvitation.findById(req.params.id);
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    const isInviter = invitation.invitedBy.toString() === req.user._id.toString();
    const membership = await getMembership(invitation.project, req.user._id);
    const isAdmin = membership && membership.role === 'admin';

    if (!isInviter && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You are not authorized to cancel this invitation' });
    }

    await ProjectInvitation.deleteOne({ _id: invitation._id });

    try {
      const Notification = require('../models/Notification');
      await Notification.deleteMany({
        recipient: invitation.user,
        invitation: invitation._id,
      });
    } catch (notifErr) {
      console.error('Failed to clean up notification on invite cancel:', notifErr);
    }

    res.json({ success: true, message: 'Invitation revoked successfully' });
  } catch (err) {
    console.error('Cancel invitation error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel invitation' });
  }
};

/**
 * POST /api/projects/invitations/:id/resend
 * Resend reminder notification for a pending invitation.
 */
exports.resendInvitation = async (req, res) => {
  try {
    const invitation = await ProjectInvitation.findOne({
      _id: req.params.id,
      status: 'pending',
    }).populate('project', 'name');

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Pending invitation not found' });
    }

    const isInviter = invitation.invitedBy.toString() === req.user._id.toString();
    const membership = await getMembership(invitation.project, req.user._id);
    const isAdmin = membership && membership.role === 'admin';

    if (!isInviter && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You are not authorized to resend this invitation' });
    }

    const { createNotification } = require('./notification.controller');
    await createNotification({
      recipient: invitation.user,
      sender: req.user._id,
      type: 'invitation',
      project: invitation.project._id,
      invitation: invitation._id,
      text: `reminded you to join "${invitation.project.name}" as a ${invitation.role}. Please accept or decline the invitation.`,
    });

    res.json({ success: true, message: 'Invitation reminder sent!' });
  } catch (err) {
    console.error('Resend invitation error:', err);
    res.status(500).json({ success: false, message: 'Failed to resend invitation' });
  }
};

/**
 * GET /api/projects/:id/tags
 * Returns all custom unique tags for this project (Case-Insensitive unique)
 */
exports.getProjectTags = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const projectObjectId = new mongoose.Types.ObjectId(req.params.id);
    const [project, taskTags] = await Promise.all([
      Project.findById(req.params.id).select('tags').lean(),
      Task.distinct('tags', { project: projectObjectId }),
    ]);

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const seen = new Set();
    const tags = [];
    const addTagUnique = (raw) => {
      if (!raw || typeof raw !== 'string') return;
      const clean = raw.trim().replace(/^#/, '');
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        tags.push(clean);
      }
    };

    (project.tags || []).forEach(addTagUnique);
    (taskTags || []).forEach(addTagUnique);

    res.json({ success: true, tags });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch project tags' });
  }
};

/**
 * POST /api/projects/:id/tags
 * Add a unique custom tag to the specific project in database (Case-Insensitive)
 * Body: { tag: string }
 */
exports.addProjectTag = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { tag } = req.body;
    if (!tag || typeof tag !== 'string' || !tag.trim()) {
      return res.status(400).json({ success: false, message: 'Tag name is required' });
    }

    const clean = tag.trim().replace(/^#/, '');
    if (clean.length > 50) {
      return res.status(400).json({ success: false, message: 'Tag cannot exceed 50 characters' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const currentTags = project.tags || [];
    const exists = currentTags.some((t) => t.trim().toLowerCase() === clean.toLowerCase());

    if (!exists) {
      project.tags.push(clean);
      await project.save();
    }

    res.json({ success: true, tag: clean, tags: project.tags });
  } catch (err) {
    console.error('Add project tag error:', err);
    res.status(500).json({ success: false, message: 'Failed to add project tag' });
  }
};

/**
 * DELETE /api/projects/:id/tags/:tag
 * Remove a custom tagline from this project's database (both project presets and tasks)
 */
exports.deleteProjectTag = async (req, res) => {
  try {
    const membership = await getMembership(req.params.id, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const tagToDelete = decodeURIComponent(req.params.tag).trim().replace(/^#/, '');
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    // 1. Remove from Project.tags (case-insensitively)
    project.tags = (project.tags || []).filter(
      (t) => t.trim().toLowerCase() !== tagToDelete.toLowerCase()
    );
    await project.save();

    // 2. Also remove from all tasks belonging to this project (case-insensitively)
    const escaped = tagToDelete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchingTasks = await Task.find({
      project: req.params.id,
      tags: { $regex: new RegExp(`^${escaped}$`, 'i') },
    }).select('_id tags');

    for (const t of matchingTasks) {
      t.tags = (t.tags || []).filter((tag) => tag.trim().toLowerCase() !== tagToDelete.toLowerCase());
      await t.save();
    }

    res.json({ success: true, deletedTag: tagToDelete, tags: project.tags });
  } catch (err) {
    console.error('Delete project tag error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete project tag' });
  }
};