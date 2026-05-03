const Task = require('../models/Task');
const ProjectMember = require('../models/ProjectMember');

// ─── Helpers ────────────────────────────────────────────────────────────────

const getMembership = (projectId, userId) =>
  ProjectMember.findOne({ project: projectId, user: userId });

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/tasks
 * Create a new task. Admin only.
 * Body: { title, description, assignedTo, priority, dueDate, tags }
 */
exports.createTask = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can create tasks' });
    }

    const { title, description, assignedTo, priority, dueDate, tags } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Task title is required' });
    }

    // Validate assignee is a project member
    if (assignedTo) {
      const assigneeMembership = await getMembership(projectId, assignedTo);
      if (!assigneeMembership) {
        return res
          .status(400)
          .json({ success: false, message: 'Assignee must be a project member' });
      }
    }

    const task = await Task.create({
      title: title.trim(),
      description: description || '',
      project: projectId,
      createdBy: req.user._id,
      assignedTo: assignedTo || null,
      priority,
      dueDate,
      tags
    });

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, task: populated });
  } catch (err) {
    console.error('Create task error:', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: err.message || 'Failed to create task' });
  }
};

/**
 * GET /api/projects/:projectId/tasks
 * List tasks in a project.
 * Members see only their assigned tasks.
 * Admins see all tasks.
 * Query params: status, priority, assignedTo, page, limit
 */
exports.getTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { status, priority, assignedTo, page = 1, limit = 20 } = req.query;
    const filter = { project: projectId };

    // Members can only see their own tasks
    if (membership.role === 'member') {
      filter.assignedTo = req.user._id;
    } else {
      if (assignedTo) filter.assignedTo = assignedTo;
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const skip = (Number(page) - 1) * Number(limit);
    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate('assignedTo', 'name email avatar')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Task.countDocuments(filter),
    ]);

    res.json({
      success: true,
      tasks,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
  }
};

/**
 * GET /api/projects/:projectId/tasks/:taskId
 * Get a single task.
 */
exports.getTask = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId })
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email avatar');

    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    // Members can only view their own tasks
    if (
      membership.role === 'member' &&
      task.assignedTo?._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch task' });
  }
};

/**
 * PATCH /api/projects/:projectId/tasks/:taskId
 * Update a task.
 * - Admin: can update all fields
 * - Member: can only update `status` on tasks assigned to them
 */
exports.updateTask = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    if (membership.role === 'member') {
      // Members can only update their own tasks' status
      if (task.assignedTo?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (Object.keys(req.body).some((k) => k !== 'status')) {
        return res
          .status(403)
          .json({ success: false, message: 'Members can only update task status' });
      }
    }

    const adminFields = ['title', 'description', 'assignedTo', 'priority', 'dueDate', 'tags'];
    const memberFields = ['status'];
    const allowedFields = membership.role === 'admin' ? [...adminFields, ...memberFields] : memberFields;

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Validate new assignee is a project member
    if (updates.assignedTo) {
      const assigneeMembership = await getMembership(projectId, updates.assignedTo);
      if (!assigneeMembership) {
        return res
          .status(400)
          .json({ success: false, message: 'Assignee must be a project member' });
      }
    }

    Object.assign(task, updates);
    await task.save();

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email');

    res.json({ success: true, task: populated });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Failed to update task' });
  }
};

/**
 * DELETE /api/projects/:projectId/tasks/:taskId
 * Delete a task. Admin only.
 */
exports.deleteTask = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const task = await Task.findOneAndDelete({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete task' });
  }
};

// ─── Comments ────────────────────────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/tasks/:taskId/comments
 * Add a comment. Any project member can comment on tasks visible to them.
 * Body: { text }
 */
exports.addComment = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    if (
      membership.role === 'member' &&
      task.assignedTo?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    task.comments.push({ user: req.user._id, text: text.trim() });
    await task.save();

    await task.populate('comments.user', 'name email avatar');
    const newComment = task.comments[task.comments.length - 1];

    res.status(201).json({ success: true, comment: newComment });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
};

/**
 * DELETE /api/projects/:projectId/tasks/:taskId/comments/:commentId
 * Delete a comment. Author or admin can delete.
 */
exports.deleteComment = async (req, res) => {
  try {
    const { projectId, taskId, commentId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const comment = task.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const isAuthor = comment.user.toString() === req.user._id.toString();
    if (!isAuthor && membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    comment.deleteOne();
    await task.save();

    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete comment' });
  }
};