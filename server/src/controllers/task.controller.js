const Task = require('../models/Task');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const User = require('../models/User');
const { verifyProjectSubscription, getProjectsSubscriptionMap } = require('./subscription.controller');

// ─── Helpers ────────────────────────────────────────────────────────────────

const getMembership = (projectId, userId) =>
  ProjectMember.findOne({ project: projectId, user: userId }).lean();

/**
 * Sync custom tags to the Project in database (Case-Insensitive uniqueness)
 */
const syncProjectTags = async (projectId, tags) => {
  if (!tags || !Array.isArray(tags) || tags.length === 0) return;
  try {
    const project = await Project.findById(projectId);
    if (!project) return;
    const currentTags = project.tags || [];
    let modified = false;

    tags.forEach((raw) => {
      if (!raw || typeof raw !== 'string') return;
      const clean = raw.trim().replace(/^#/, '');
      if (!clean) return;
      const exists = currentTags.some((t) => t.trim().toLowerCase() === clean.toLowerCase());
      if (!exists) {
        currentTags.push(clean);
        modified = true;
      }
    });

    if (modified) {
      project.tags = currentTags;
      await project.save();
    }
  } catch (err) {
    console.error('Error syncing project tags:', err);
  }
};

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * GET /api/projects/my-tasks
 * Fast single-query endpoint to fetch all tasks assigned to the authenticated user.
 */
exports.getMyTasks = async (req, res) => {
  try {
    const memberships = await ProjectMember.find({ user: req.user._id }).select('project role').lean();
    const projectIds = memberships.map((m) => m.project);

    const roleMap = {};
    memberships.forEach((m) => {
      roleMap[m.project.toString()] = m.role;
    });

    const filter = {
      assignedTo: req.user._id,
      project: { $in: projectIds },
    };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;

    const [tasks, subMap] = await Promise.all([
      Task.find(filter)
        .populate('project', 'name color')
        .populate('createdBy', 'name email avatar')
        .populate('assignedTo', 'name email avatar')
        .populate('comments.user', 'name email avatar')
        .populate('cycle', 'name status startDate endDate')
        .populate('module', 'name status targetDate lead')
        .sort({ dueDate: 1, createdAt: -1 })
        .lean(),
      getProjectsSubscriptionMap(projectIds),
    ]);

    const formattedTasks = tasks.map((t) => {
      const pid = typeof t.project === 'object' && t.project ? t.project._id.toString() : t.project?.toString();
      const isLocked = !subMap[pid];
      return {
        ...t,
        description: isLocked ? '• • • • • (Subscription required to unlock details)' : t.description,
        isProjectLocked: isLocked,
        projectName: typeof t.project === 'object' && t.project ? t.project.name : 'Unknown',
        projectId: pid,
        myRole: roleMap[pid] || 'member',
      };
    });

    res.json({ success: true, tasks: formattedTasks });
  } catch (err) {
    console.error('Failed to fetch user tasks:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
  }
};

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

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to create tasks.',
        isProjectLocked: true,
      });
    }

    const { title, description, assignedTo, status, priority, dueDate, tags, checklist, estimatedHours, cycle, module } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Task title is required' });
    }

    // Normalize assignees (supports array of IDs or single ID)
    let assignees = [];
    if (Array.isArray(assignedTo)) {
      assignees = [...new Set(assignedTo.filter(Boolean).map((id) => id.toString()))];
    } else if (assignedTo) {
      assignees = [assignedTo.toString()];
    }

    // Validate each assignee is a project member
    for (const assigneeId of assignees) {
      const assigneeMembership = await getMembership(projectId, assigneeId);
      if (!assigneeMembership) {
        return res
          .status(400)
          .json({ success: false, message: 'All assignees must be project members' });
      }
    }

    const task = await Task.create({
      title: title.trim(),
      description: description || '',
      project: projectId,
      createdBy: req.user._id,
      assignedTo: assignees,
      status: status || 'todo',
      priority: priority || 'medium',
      dueDate,
      tags: Array.isArray(tags) ? tags : [],
      checklist: Array.isArray(checklist) ? checklist : [],
      estimatedHours: Number(estimatedHours) > 0 ? Number(estimatedHours) : 0,
      cycle: cycle || null,
      module: module || null,
    });

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('cycle', 'name status startDate endDate')
      .populate('module', 'name status targetDate lead');

    // Send notification to each assigned user (except creator)
    for (const assigneeId of assignees) {
      if (assigneeId !== req.user._id.toString()) {
        require('./notification.controller').createNotification({
          recipient: assigneeId, sender: req.user._id, type: 'assignment', project: projectId, task: task._id, text: `assigned you to "${title}"`
        });
      }
    }

    // Sync any custom tags to project in database (Case-Insensitive)
    if (Array.isArray(tags) && tags.length > 0) {
      syncProjectTags(projectId, tags).catch(() => {});
    }

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
 * All project members and admins can view team tasks.
 * Query params: status, priority, assignedTo, page, limit
 */
exports.getTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { status, priority, assignedTo, cycle, module, page = 1, limit = 20 } = req.query;
    const filter = { project: projectId };

    // Support optional filter by assignee
    if (assignedTo) {
      if (assignedTo === 'unassigned') {
        filter.$or = [{ assignedTo: { $size: 0 } }, { assignedTo: null }, { assignedTo: { $exists: false } }];
      } else {
        filter.assignedTo = assignedTo;
      }
    }

    if (cycle) {
      filter.cycle = cycle === 'unassigned' ? null : cycle;
    }

    if (module) {
      filter.module = module === 'unassigned' ? null : module;
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const skip = (Number(page) - 1) * Number(limit);
    const [tasks, total, subCoverage] = await Promise.all([
      Task.find(filter)
        .populate('assignedTo', 'name email avatar')
        .populate('createdBy', 'name email avatar')
        .populate('comments.user', 'name email avatar')
        .populate('timeLogs.user', 'name email avatar')
        .populate('cycle', 'name status startDate endDate')
        .populate('module', 'name status targetDate lead')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Task.countDocuments(filter),
      verifyProjectSubscription(projectId),
    ]);

    if (!subCoverage.hasActiveSubscription) {
      const maskedTasks = tasks.map((t) => ({
        ...t,
        description: '• • • • • (Subscription required to unlock details)',
        checklist: [],
        isMasked: true,
      }));
      return res.json({
        success: true,
        tasks: maskedTasks,
        isProjectLocked: true,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    }

    res.json({
      success: true,
      tasks,
      isProjectLocked: false,
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

    const subCoverage = await verifyProjectSubscription(projectId);
    const task = await Task.findOne({ _id: taskId, project: projectId })
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .populate('timeLogs.user', 'name email avatar')
      .populate('cycle', 'name status startDate endDate')
      .populate('module', 'name status targetDate lead')
      .lean();

    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    if (!subCoverage.hasActiveSubscription) {
      return res.json({
        success: true,
        task: {
          ...task,
          description: '• • • • • (Subscription required to unlock details)',
          checklist: [],
          isMasked: true,
        },
        isProjectLocked: true,
      });
    }

    res.json({ success: true, task, isProjectLocked: false });
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

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to update tasks.',
        isProjectLocked: true,
      });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const currentAssigneeIds = Array.isArray(task.assignedTo)
      ? task.assignedTo.map((u) => (u._id || u).toString())
      : (task.assignedTo ? [task.assignedTo.toString()] : []);

    if (membership.role === 'member') {
      // Members can only update their own tasks' status and checklist
      if (!currentAssigneeIds.includes(req.user._id.toString())) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (Object.keys(req.body).some((k) => k !== 'status' && k !== 'checklist')) {
        return res
          .status(403)
          .json({ success: false, message: 'Members can only update task status and checklist' });
      }
    }

    const adminFields = ['title', 'description', 'assignedTo', 'priority', 'dueDate', 'tags', 'checklist', 'estimatedHours', 'cycle', 'module'];
    const memberFields = ['status', 'checklist'];
    const allowedFields = membership.role === 'admin' ? [...adminFields, 'status'] : memberFields;

    const oldStatus = task.status;
    const oldPriority = task.priority;

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.cycle === '' || updates.cycle === 'null' || updates.cycle === 'unassigned') {
      updates.cycle = null;
    }
    if (updates.module === '' || updates.module === 'null' || updates.module === 'unassigned') {
      updates.module = null;
    }

    // Validate new assignees are project members
    if (updates.assignedTo !== undefined) {
      let newAssignees = [];
      if (Array.isArray(updates.assignedTo)) {
        newAssignees = [...new Set(updates.assignedTo.filter(Boolean).map((id) => id.toString()))];
      } else if (updates.assignedTo) {
        newAssignees = [updates.assignedTo.toString()];
      }

      for (const uid of newAssignees) {
        const assigneeMembership = await getMembership(projectId, uid);
        if (!assigneeMembership) {
          return res
            .status(400)
            .json({ success: false, message: 'All assignees must be project members' });
        }
      }
      updates.assignedTo = newAssignees;
    }

    // ── Audit Trail / System Activity Events ───────────────────────────────────
    const statusLabels = {
      backlog: 'Backlog',
      todo: 'To Do',
      in_progress: 'In Progress',
      in_review: 'In Review',
      done: 'Done',
      canceled: 'Canceled',
    };

    if (updates.status && updates.status !== oldStatus) {
      const from = statusLabels[oldStatus] || oldStatus;
      const to = statusLabels[updates.status] || updates.status;
      task.comments.push({
        user: req.user._id,
        text: `moved this task from ${from} to ${to}`,
        type: 'activity',
      });
    }

    if (updates.assignedTo !== undefined) {
      const oldIds = currentAssigneeIds;
      const newIds = updates.assignedTo;
      const addedIds = newIds.filter((id) => !oldIds.includes(id));
      const removedIds = oldIds.filter((id) => !newIds.includes(id));

      if (addedIds.length > 0 || removedIds.length > 0) {
        if (newIds.length === 0 && oldIds.length > 0) {
          task.comments.push({
            user: req.user._id,
            text: `unassigned this task`,
            type: 'activity',
          });
        } else {
          if (addedIds.length > 0) {
            const addedUsers = await User.find({ _id: { $in: addedIds } }).select('name').lean();
            const names = addedUsers.map((u) => u.name).join(', ') || 'team member(s)';
            task.comments.push({
              user: req.user._id,
              text: `assigned task to ${names}`,
              type: 'activity',
            });
          }
          if (removedIds.length > 0) {
            const removedUsers = await User.find({ _id: { $in: removedIds } }).select('name').lean();
            const names = removedUsers.map((u) => u.name).join(', ') || 'team member(s)';
            task.comments.push({
              user: req.user._id,
              text: `unassigned ${names}`,
              type: 'activity',
            });
          }
        }
      }
    }

    if (updates.priority && updates.priority !== oldPriority) {
      task.comments.push({
        user: req.user._id,
        text: `changed priority from ${oldPriority} to ${updates.priority}`,
        type: 'activity',
      });
    }

    Object.assign(task, updates);
    await task.save();

    // Sync any custom tags to project in database (Case-Insensitive)
    if (updates.tags && Array.isArray(updates.tags) && updates.tags.length > 0) {
      syncProjectTags(projectId, updates.tags).catch(() => {});
    }

    // Assignment notifications to newly assigned users
    if (updates.assignedTo !== undefined) {
      const oldIds = currentAssigneeIds;
      const newIds = updates.assignedTo;
      const addedIds = newIds.filter((id) => !oldIds.includes(id));
      for (const assigneeId of addedIds) {
        if (assigneeId !== req.user._id.toString()) {
          require('./notification.controller').createNotification({
            recipient: assigneeId, sender: req.user._id, type: 'assignment', project: projectId, task: task._id, text: `assigned you to "${task.title}"`
          });
        }
      }
    }

    // Status change notification to creator and all assignees
    if (updates.status && updates.status !== oldStatus) {
      const recipients = new Set();
      if (task.createdBy.toString() !== req.user._id.toString()) {
        recipients.add(task.createdBy.toString());
      }
      const finalAssignees = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
      finalAssignees.forEach((a) => {
        const uid = (a._id || a).toString();
        if (uid !== req.user._id.toString()) recipients.add(uid);
      });
      recipients.forEach((recipient) => {
        require('./notification.controller').createNotification({
          recipient, sender: req.user._id, type: 'status', project: projectId, task: task._id, text: `moved "${task.title}" to ${updates.status}`
        });
      });
    }

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .populate('timeLogs.user', 'name email avatar')
      .populate('cycle', 'name status startDate endDate')
      .populate('module', 'name status targetDate lead');

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

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to update tasks.',
        isProjectLocked: true,
      });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    task.comments.push({ user: req.user._id, text: text.trim() });
    await task.save();

    await task.populate('comments.user', 'name email avatar');
    const newComment = task.comments[task.comments.length - 1];

    // Notify creator and all task assignees (except the comment author)
    const commentRecipients = new Set();
    if (task.createdBy.toString() !== req.user._id.toString()) {
      commentRecipients.add(task.createdBy.toString());
    }
    const currentAssignees = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
    currentAssignees.forEach((a) => {
      const uid = (a._id || a).toString();
      if (uid !== req.user._id.toString()) commentRecipients.add(uid);
    });
    commentRecipients.forEach((recipient) => {
      require('./notification.controller').createNotification({
        recipient, sender: req.user._id, type: 'comment', project: projectId, task: task._id, text: `left a comment on "${task.title}"`
      });
    });

    res.status(201).json({ success: true, comment: newComment });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
};

/**
 * PATCH /api/projects/:projectId/tasks/:taskId/comments/:commentId
 * Update a comment. Author only.
 */
exports.updateComment = async (req, res) => {
  try {
    const { projectId, taskId, commentId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to update tasks.',
        isProjectLocked: true,
      });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const comment = task.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const isAuthor = comment.user.toString() === req.user._id.toString();
    if (!isAuthor) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this comment' });
    }
    
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    comment.text = text.trim();
    comment.editedAt = new Date();
    await task.save();

    await task.populate('comments.user', 'name email avatar');
    const updatedComment = task.comments.id(commentId);

    res.json({ success: true, comment: updatedComment });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update comment' });
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

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to update tasks.',
        isProjectLocked: true,
      });
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

/**
 * POST /api/projects/:projectId/tasks/:taskId/time-logs
 * Log time on a task.
 * Body: { minutes, description }
 */
exports.logTime = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'This project is locked because an active subscription is required to log time.',
        isProjectLocked: true,
      });
    }

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const { minutes, description } = req.body;
    const mins = Number(minutes);
    if (!mins || isNaN(mins) || mins <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive minutes required' });
    }

    task.timeLogs = task.timeLogs || [];
    task.timeLogs.push({
      user: req.user._id,
      minutes: Math.round(mins),
      description: description ? description.trim() : '',
      loggedAt: new Date(),
    });

    task.loggedMinutes = (task.loggedMinutes || 0) + Math.round(mins);

    const hours = Math.floor(mins / 60);
    const remMins = Math.round(mins % 60);
    const formattedDuration = `${hours > 0 ? `${hours}h ` : ''}${remMins > 0 || hours === 0 ? `${remMins}m` : ''}`.trim();

    task.comments.push({
      user: req.user._id,
      text: `logged ${formattedDuration} of work${description ? `: "${description.trim()}"` : ''}`,
      type: 'activity',
    });

    await task.save();

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .populate('timeLogs.user', 'name email avatar')
      .populate('cycle', 'name status startDate endDate')
      .populate('module', 'name status targetDate lead');

    res.status(201).json({ success: true, task: populated });
  } catch (err) {
    console.error('Log time error:', err);
    res.status(500).json({ success: false, message: 'Failed to log time' });
  }
};