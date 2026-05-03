const Task = require('../models/Task');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');

/**
 * GET /api/dashboard
 * Returns aggregated stats scoped to the authenticated user.
 *
 * Admin view  → stats across ALL projects they admin.
 * Member view → stats across their assigned tasks.
 *
 * Response shape:
 * {
 *   totalTasks, tasksByStatus, tasksByPriority,
 *   tasksPerUser, overdueTask, recentTasks,
 *   projectSummaries
 * }
 */
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();

    // All memberships for this user
    const memberships = await ProjectMember.find({ user: req.user._id });
    const projectIds = memberships.map((m) => m.project);
    const adminProjectIds = memberships
      .filter((m) => m.role === 'admin')
      .map((m) => m.project);

    // ── 1. Total tasks & tasks by status ───────────────────────────────────
    // For members: only their assigned tasks across all projects
    // For admins: all tasks in projects they admin (plus their assigned tasks elsewhere)
    const taskFilter = {
      $or: [
        { project: { $in: adminProjectIds } },         // all tasks in admin projects
        { assignedTo: req.user._id, project: { $in: projectIds } }, // assigned in member projects
      ],
    };

    const [totalTasks, tasksByStatus, tasksByPriority] = await Promise.all([
      Task.countDocuments(taskFilter),
      Task.aggregate([
        { $match: taskFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Task.aggregate([
        { $match: taskFilter },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // ── 2. Tasks per user (admin projects only) ─────────────────────────────
    const tasksPerUser = adminProjectIds.length
      ? await Task.aggregate([
          { $match: { project: { $in: adminProjectIds }, assignedTo: { $ne: null } } },
          { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          {
            $project: {
              _id: 0,
              userId: '$_id',
              name: '$user.name',
              email: '$user.email',
              count: 1,
            },
          },
          { $sort: { count: -1 } },
        ])
      : [];

    // ── 3. Overdue tasks ────────────────────────────────────────────────────
    const overdueFilter = {
      ...taskFilter,
      dueDate: { $lt: now },
      status: { $ne: 'done' },
    };

    const [overdueCount, overdueTasks] = await Promise.all([
      Task.countDocuments(overdueFilter),
      Task.find(overdueFilter)
        .populate('assignedTo', 'name email')
        .populate('project', 'name')
        .sort({ dueDate: 1 })
        .limit(10),
    ]);

    // ── 4. Recent tasks ─────────────────────────────────────────────────────
    const recentTasks = await Task.find(taskFilter)
      .populate('assignedTo', 'name email avatar')
      .populate('project', 'name color')
      .sort({ updatedAt: -1 })
      .limit(10);

    // ── 5. Project summaries ────────────────────────────────────────────────
    const projects = await Project.find({ _id: { $in: projectIds } }).lean();

    const projectTaskStats = await Task.aggregate([
      { $match: { project: { $in: projectIds } } },
      {
        $group: {
          _id: { project: '$project', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build a map: projectId → { todo, in_progress, done, total }
    const statsMap = {};
    projectTaskStats.forEach(({ _id, count }) => {
      const pid = _id.project.toString();
      if (!statsMap[pid]) statsMap[pid] = { todo: 0, in_progress: 0, done: 0, total: 0 };
      statsMap[pid][_id.status] = count;
      statsMap[pid].total += count;
    });

    const projectSummaries = projects.map((p) => ({
      _id: p._id,
      name: p.name,
      color: p.color,
      status: p.status,
      myRole: memberships.find((m) => m.project.toString() === p._id.toString())?.role,
      taskStats: statsMap[p._id.toString()] || { todo: 0, in_progress: 0, done: 0, total: 0 },
    }));

    // ── 6. Normalise tasksByStatus into a plain object ─────────────────────
    const statusSummary = { todo: 0, in_progress: 0, done: 0 };
    tasksByStatus.forEach(({ _id, count }) => {
      statusSummary[_id] = count;
    });

    res.json({
      success: true,
      dashboard: {
        totalTasks,
        tasksByStatus: statusSummary,
        tasksByPriority,
        tasksPerUser,
        overdueCount,
        overdueTasks,
        recentTasks,
        projectSummaries,
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
};

/**
 * GET /api/dashboard/project/:projectId
 * Detailed stats for a single project. Admin only.
 */
exports.getProjectDashboard = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await ProjectMember.findOne({
      project: projectId,
      user: req.user._id,
    });

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const now = new Date();

    const [
      totalTasks,
      tasksByStatus,
      tasksByPriority,
      tasksPerUser,
      overdueCount,
      completionTimeline,
    ] = await Promise.all([
      Task.countDocuments({ project: projectId }),
      Task.aggregate([
        { $match: { project: require('mongoose').Types.ObjectId(projectId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { project: require('mongoose').Types.ObjectId(projectId) } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        {
          $match: {
            project: require('mongoose').Types.ObjectId(projectId),
            assignedTo: { $ne: null },
          },
        },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            name: '$user.name',
            email: '$user.email',
            count: 1,
          },
        },
      ]),
      Task.countDocuments({
        project: projectId,
        dueDate: { $lt: now },
        status: { $ne: 'done' },
      }),
      // Tasks completed per day over last 30 days
      Task.aggregate([
        {
          $match: {
            project: require('mongoose').Types.ObjectId(projectId),
            status: 'done',
            completedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalTasks,
        tasksByStatus,
        tasksByPriority,
        tasksPerUser,
        overdueCount,
        completionTimeline,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load project dashboard' });
  }
};