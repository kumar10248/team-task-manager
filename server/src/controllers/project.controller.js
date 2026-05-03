const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const User = require('../models/User');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the membership record for req.user in the given project.
 * Returns null if not a member.
 */
const getMembership = (projectId, userId) =>
  ProjectMember.findOne({ project: projectId, user: userId });

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

    const populated = await Project.findById(project._id).populate('createdBy', 'name email');
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
 * List all projects the authenticated user belongs to.
 */
exports.getProjects = async (req, res) => {
  try {
    const memberships = await ProjectMember.find({ user: req.user._id }).select('project role');
    const projectIds = memberships.map((m) => m.project);

    const projects = await Project.find({ _id: { $in: projectIds } })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Attach role to each project
    const roleMap = {};
    memberships.forEach((m) => {
      roleMap[m.project.toString()] = m.role;
    });

    const result = projects.map((p) => ({
      ...p.toObject(),
      myRole: roleMap[p._id.toString()],
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

    const project = await Project.findById(req.params.id).populate('createdBy', 'name email');
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const members = await ProjectMember.find({ project: req.params.id }).populate(
      'user',
      'name email avatar'
    );

    const taskStats = await Task.aggregate([
      { $match: { project: project._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      project: { ...project.toObject(), myRole: membership.role },
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
      return res.status(409).json({ success: false, message: 'User is already a member' });
    }

    const newMember = await ProjectMember.create({
      project: req.params.id,
      user: targetUser._id,
      role,
      invitedBy: req.user._id,
    });

    const populated = await newMember.populate('user', 'name email avatar');
    res.status(201).json({ success: true, member: populated });
  } catch (err) {
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