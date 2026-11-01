const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const AttendanceLog = require('../models/AttendanceLog');

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
 *   tasksPerUser, overdueCount, overdueTasks, recentTasks,
 *   projectSummaries, teamAttendance
 * }
 */
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();

    // All memberships for this user
    const memberships = await ProjectMember.find({ user: req.user._id }).lean();
    const projectIds = memberships.map((m) => m.project);
    const adminProjectIds = memberships
      .filter((m) => m.role === 'admin')
      .map((m) => m.project);

    // Filter for user-visible tasks
    const taskFilter = {
      $or: [
        { project: { $in: adminProjectIds } },
        { assignedTo: req.user._id, project: { $in: projectIds } },
      ],
    };

    const overdueFilter = {
      ...taskFilter,
      dueDate: { $lt: now },
      status: { $in: ['todo', 'in_progress'] },
    };

    // Parallelize all independent aggregations and queries
    const [
      tasksByStatus,
      tasksByPriority,
      tasksPerUser,
      overdueTasks,
      overdueCount,
      recentTasks,
      projects,
      projectTaskStats,
      teamMemberships,
    ] = await Promise.all([
      // 1. Status breakdown
      Task.aggregate([
        { $match: taskFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // 2. Priority breakdown
      Task.aggregate([
        { $match: taskFilter },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),

      // 3. Tasks per user (admin projects only)
      adminProjectIds.length
        ? Task.aggregate([
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
        : Promise.resolve([]),

      // 4. Overdue tasks list
      Task.find(overdueFilter)
        .populate('assignedTo', 'name email')
        .populate('project', 'name')
        .sort({ dueDate: 1 })
        .limit(10)
        .lean(),

      // 5. Overdue tasks count
      Task.countDocuments(overdueFilter),

      // 6. Recent tasks
      Task.find(taskFilter)
        .populate('assignedTo', 'name email avatar')
        .populate('project', 'name color')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),

      // 7. Projects list
      Project.find({ _id: { $in: projectIds } }).lean(),

      // 8. Project task statistics
      Task.aggregate([
        { $match: { project: { $in: projectIds } } },
        {
          $group: {
            _id: { project: '$project', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),

      // 9. Team Attendance (for admin projects)
      adminProjectIds.length > 0
        ? ProjectMember.find({ project: { $in: adminProjectIds } })
            .populate('user', 'name email avatar isClockedIn lastClockIn lastClockOut')
            .lean()
        : Promise.resolve([]),
    ]);

    // Build project stats map
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

    // Deduplicate team attendance users
    const uniqueUsers = new Map();
    teamMemberships.forEach((m) => {
      if (m.user && !uniqueUsers.has(m.user._id.toString())) {
        uniqueUsers.set(m.user._id.toString(), {
          _id: m.user._id,
          name: m.user.name,
          email: m.user.email,
          avatar: m.user.avatar,
          isClockedIn: m.user.isClockedIn,
          lastClockIn: m.user.lastClockIn,
          lastClockOut: m.user.lastClockOut,
        });
      }
    });
    const teamAttendance = Array.from(uniqueUsers.values());

    // Normalize tasksByStatus and compute totalTasks without an extra countDocuments query
    const statusSummary = { todo: 0, in_progress: 0, done: 0 };
    let totalTasks = 0;
    tasksByStatus.forEach(({ _id, count }) => {
      statusSummary[_id] = count;
      totalTasks += count;
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
        teamAttendance,
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

/**
 * GET /api/dashboard/attendance-logs
 * Detailed attendance logs for the user's team (or just themselves).
 */
exports.getAttendanceLogs = async (req, res) => {
  try {
    const memberships = await ProjectMember.find({ user: req.user._id, role: 'admin' }).lean();
    const adminProjectIds = memberships.map((m) => m.project);
    
    let targetUsers = [req.user._id]; // at least the user themselves
    
    if (adminProjectIds.length > 0) {
      const teamMemberships = await ProjectMember.find({ project: { $in: adminProjectIds } }).lean();
      targetUsers = [...new Set(teamMemberships.map((m) => m.user.toString()))];
    }
    
    const logs = await AttendanceLog.find({ user: { $in: targetUsers } })
      .populate('user', 'name email avatar')
      .sort({ clockIn: -1 })
      .limit(100)
      .lean();
      
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch attendance logs' });
  }
};